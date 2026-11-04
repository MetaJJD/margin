/* ---------- Google Drive sync ---------- */
/* Each file is kept in a "Margin" folder in your Drive as two files: the PDF and its notes (.json).
   Sync runs while Margin is open: at start, a little after you change something, and when you tap the cloud. */
const GD_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GD_API = "https://www.googleapis.com/drive/v3/files", GD_UP = "https://www.googleapis.com/upload/drive/v3/files";
const gd = { cfg: {}, dirty: {}, token: null, exp: 0, busy: false, again: false, timer: 0, gis: null, client: null, status: "", err: "" };
try { gd.cfg = JSON.parse(localStorage.getItem("margin-gdrive") || "{}") || {}; } catch (e) { gd.cfg = {}; }
try { gd.dirty = JSON.parse(localStorage.getItem("margin-gdrive-dirty") || "{}") || {}; } catch (e) { gd.dirty = {}; }
try { const t = JSON.parse(localStorage.getItem("margin-gdrive-token") || "null"); if (t && t.exp > Date.now() + 60000) { gd.token = t.v; gd.exp = t.exp; } } catch (e) {}
gd.cfg.docs = gd.cfg.docs || {};
function gdSave() { try { localStorage.setItem("margin-gdrive", JSON.stringify(gd.cfg)); localStorage.setItem("margin-gdrive-dirty", JSON.stringify(gd.dirty)); } catch (e) {} }
function gdOn() { return !!(gd.cfg.clientId && gd.cfg.connected); }
function gdTokenOk() { return !!gd.token && gd.exp > Date.now() + 60000; }

/* -- sign in with Google (the Google script must be loaded before the tap that asks) -- */
function gdLoadGis() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if (gd.gis) return gd.gis;
  gd.gis = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => res(); s.onerror = () => { gd.gis = null; rej(new Error("gis")); };
    document.head.appendChild(s);
  });
  return gd.gis;
}
function gdAskToken(firstTime) {
  return new Promise((res, rej) => {
    if (!(window.google && google.accounts && google.accounts.oauth2)) { rej(new Error("gis")); return; }
    if (!gd.client || gd.client._id !== gd.cfg.clientId) {
      gd.client = google.accounts.oauth2.initTokenClient({ client_id: gd.cfg.clientId, scope: GD_SCOPE, callback: () => {} });
      gd.client._id = gd.cfg.clientId;
    }
    gd.client.callback = (r) => {
      if (!r || r.error || !r.access_token) { rej(new Error((r && r.error) || "denied")); return; }
      gd.token = r.access_token; gd.exp = Date.now() + (+r.expires_in || 3600) * 1000;
      try { localStorage.setItem("margin-gdrive-token", JSON.stringify({ v: gd.token, exp: gd.exp })); } catch (e) {}
      res();
    };
    gd.client.error_callback = (er) => rej(new Error((er && er.type) || "popup"));
    gd.client.requestAccessToken({ prompt: firstTime ? "consent" : "" });
  });
}

/* -- Drive requests -- */
async function gdFetch(url, opt) {
  opt = opt || {};
  opt.headers = Object.assign({ Authorization: "Bearer " + gd.token }, opt.headers || {});
  const r = await fetch(url, opt);
  if (r.status === 401) { gd.token = null; gd.exp = 0; throw Object.assign(new Error("auth"), { auth: true }); }
  if (!r.ok) throw new Error("drive " + r.status);
  return r;
}
async function gdJson(url, opt) { return (await gdFetch(url, opt)).json(); }
async function gdFolder() {
  if (gd.cfg.folderId) {
    try { const f = await gdJson(GD_API + "/" + gd.cfg.folderId + "?fields=id,trashed"); if (!f.trashed) return f.id; } catch (e) { if (e.auth) throw e; }
  }
  const q = encodeURIComponent("name = 'Margin' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const l = await gdJson(GD_API + "?q=" + q + "&fields=files(id)&spaces=drive");
  let id = l.files && l.files[0] && l.files[0].id;
  if (!id) id = (await gdJson(GD_API + "?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Margin", mimeType: "application/vnd.google-apps.folder" }) })).id;
  gd.cfg.folderId = id; gdSave();
  return id;
}
async function gdList(folder) {
  const out = [];
  let page = "";
  do {
    const q = encodeURIComponent("'" + folder + "' in parents and trashed = false");
    const l = await gdJson(GD_API + "?q=" + q + "&pageSize=1000&fields=nextPageToken,files(id,name,md5Checksum,appProperties)" + (page ? "&pageToken=" + page : ""));
    out.push(...(l.files || []));
    page = l.nextPageToken || "";
  } while (page);
  return out;
}
/* create (no fileId) or replace a file; small files in one request, big ones as a resumable upload */
async function gdUpload(fileId, meta, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const base = (fileId ? GD_UP + "/" + fileId : GD_UP), method = fileId ? "PATCH" : "POST";
  if (blob.size <= 4.5 * 1048576) {
    const b = "margin" + Math.random().toString(36).slice(2);
    const body = new Blob(["--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n--" + b + "\r\nContent-Type: " + mime + "\r\n\r\n", blob, "\r\n--" + b + "--"]);
    return gdJson(base + "?uploadType=multipart&fields=id,md5Checksum", { method, headers: { "Content-Type": "multipart/related; boundary=" + b }, body });
  }
  const r = await gdFetch(base + "?uploadType=resumable&fields=id,md5Checksum", { method, headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime }, body: JSON.stringify(meta) });
  const loc = r.headers.get("Location");
  if (!loc) throw new Error("big");
  return (await fetch(loc, { method: "PUT", body: blob })).json();
}
async function gdTrash(fileId) {
  try { await gdFetch(GD_API + "/" + fileId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }); }
  catch (e) { if (e.auth) throw e; }
}

/* -- what a file's notes look like, and a fingerprint to spot changes -- */
function gdHash(s) {
  let a = 0x811c9dc5, b = 0;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = (b * 31 + c) | 0; }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36) + s.length.toString(36);
}
function gdNotes(m, rec) {
  return { app: "Margin", v: 1, id: m.id, name: m.name, folder: m.folder || "", fav: !!m.fav, added: m.added || 0, opened: m.opened || 0, pages: m.pages || 0,
    ann: (rec && rec.ann) || {}, bookmarks: (rec && rec.bookmarks) || [], pageNumbers: (rec && rec.pageNumbers) || null };
}
function gdPrint(n) { return gdHash(JSON.stringify([n.name, n.folder, n.fav, n.ann, n.bookmarks, n.pageNumbers])); }
function gdSafe(name) { return String(name || "Document").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Document"; }

/* -- local side -- */
async function gdLocalPrint(m) { return gdPrint(gdNotes(m, await DB.get("ann", m.id))); }
async function gdUploadDoc(m, d, wantPdf) {
  const st = gd.cfg.docs[m.id] = gd.cfg.docs[m.id] || {};
  if (wantPdf || !st.pdf) {
    const f = await DB.get("files", m.id);
    if (!f || !f.bytes) return;
    const r = await gdUpload(st.pdf, st.pdf ? { name: gdSafe(m.name) + ".pdf" } : { name: gdSafe(m.name) + ".pdf", parents: [d], appProperties: { marginId: m.id, kind: "pdf" } }, f.bytes, "application/pdf");
    st.pdf = r.id; st.pv = String(r.md5Checksum || "");
  }
  const n = gdNotes(m, await DB.get("ann", m.id));
  const r = await gdUpload(st.notes, st.notes ? { name: gdSafe(m.name) + ".margin-notes.json" } : { name: gdSafe(m.name) + ".margin-notes.json", parents: [d], appProperties: { marginId: m.id, kind: "notes" } }, JSON.stringify(n), "application/json");
  st.notes = r.id; st.nv = String(r.md5Checksum || ""); st.print = gdPrint(n);
  delete gd.dirty[m.id];
  gdSave();
}
/* bring a file from Drive into Margin (as id; a new copy when asCopy) */
async function gdDownloadDoc(rem, id, asCopy) {
  let n = null;
  if (rem.notes) { try { n = await (await gdFetch(GD_API + "/" + rem.notes.id + "?alt=media")).json(); } catch (e) { if (e.auth) throw e; } }
  const old = await DB.get("meta", id);
  const needPdf = asCopy || !old || !gd.cfg.docs[id] || gd.cfg.docs[id].pv !== String(rem.pdf.md5Checksum);
  let bytes = null;
  if (needPdf) bytes = new Uint8Array(await (await gdFetch(GD_API + "/" + rem.pdf.id + "?alt=media")).arrayBuffer());
  const name = (n && n.name) || rem.pdf.name.replace(/\.pdf$/i, "");
  const m = Object.assign(asCopy ? {} : (old || {}), { id, name: asCopy ? name + " (other device)" : name, pages: (n && n.pages) || (old && old.pages) || 0 });
  if (!old || asCopy) { m.added = (n && n.added) || Date.now(); m.opened = (n && n.opened) || Date.now(); }
  if (n) { if (n.folder) m.folder = n.folder; else delete m.folder; m.fav = !!n.fav; if (!m.fav) delete m.fav; m.notes = countAnn(n.ann || {}); }
  m.modified = Date.now();
  if (bytes) { await DB.put("files", { id, bytes }, true); m.size = bytes.length; delete m.thumb; }
  await DB.put("ann", { id, ann: (n && n.ann) || {}, bookmarks: (n && n.bookmarks) || [], pageNumbers: (n && n.pageNumbers) || null }, true);
  if (m.folder && !storedFolders().includes(m.folder)) { const l = storedFolders(); l.push(m.folder); saveFolders(l); }
  await DB.put("meta", m);
  delete tabs.mem[id];
  if (!asCopy) {
    const st = gd.cfg.docs[id] = gd.cfg.docs[id] || {};
    st.pdf = rem.pdf.id; st.pv = String(rem.pdf.md5Checksum); st.notes = rem.notes ? rem.notes.id : st.notes; st.nv = rem.notes ? String(rem.notes.md5Checksum) : "";
    st.print = gdPrint(gdNotes(m, await DB.get("ann", id)));
    delete gd.dirty[id];
    gdSave();
    if (state.id === id) { const f = await DB.get("files", id), pg = state.curPage; tabs.skipStash = id; state.id = null; if (await openDoc(id, m.name, f.bytes)) goToPage(Math.min(pg, state.pages.length), null, true); }
  }
  return m;
}

/* -- one round of syncing -- */
async function gdSync(fromTap) {
  if (!gdOn()) return;
  if (gd.busy) { gd.again = true; return; }
  if (!gdTokenOk()) {
    if (!fromTap) { gdStatus("tap"); return; }
    try { await gdLoadGis(); await gdAskToken(false); }
    catch (e) { gdStatus("tap", e.message === "gis" ? "Google sign-in didn't load. Check your connection." : "Google didn't allow access. Tap the cloud to try again."); return; }
  }
  if (!navigator.onLine) { gdStatus("offline"); return; }
  gd.busy = true; gdStatus("busy");
  try {
    if (saveTimer) await new Promise((r) => setTimeout(r, 700));
    const d = await gdFolder();
    const R = {};
    for (const f of await gdList(d)) {
      const p = f.appProperties || {};
      if (!p.marginId || !p.kind) continue;
      const g = R[p.marginId] = R[p.marginId] || {};
      if (!g[p.kind]) g[p.kind] = f;
    }
    const metas = await DB.all("meta"), local = new Set(metas.map((m) => m.id));
    const trashed = new Set(trashList().map((t) => t.id));
    let up = 0, down = 0, copies = 0;
    for (const m of metas) {
      const st = gd.cfg.docs[m.id], rem = R[m.id];
      const print = await gdLocalPrint(m);
      const localChanged = !st || st.print !== print || !!gd.dirty[m.id];
      if (!rem || !rem.pdf) {
        /* removed on another device: remove it here too (kept if it's the file on screen) */
        if (st && st.notes && !localChanged && m.id !== state.id) { await trashDoc(m); dropTab(m.id); delete gd.cfg.docs[m.id]; gdSave(); down++; continue; }
        if (st) { delete st.pdf; delete st.notes; }
        await gdUploadDoc(m, d, true); up++; continue;
      }
      if (!st) {
        /* the same file already in Drive (from a backup or another device) */
        let same = false;
        if (rem.notes) { try { same = gdPrint(await (await gdFetch(GD_API + "/" + rem.notes.id + "?alt=media")).json()) === print; } catch (e) { if (e.auth) throw e; } }
        if (same || m.id === "sample-welcome") { gd.cfg.docs[m.id] = { pdf: rem.pdf.id, pv: String(rem.pdf.md5Checksum), notes: rem.notes && rem.notes.id, nv: rem.notes ? String(rem.notes.md5Checksum) : "", print }; if (!same) { await gdDownloadDoc(rem, m.id); down++; } gdSave(); continue; }
        await gdDownloadDoc(rem, m.id + "|drive|" + Date.now().toString(36), true); copies++;
        gd.cfg.docs[m.id] = { pdf: rem.pdf.id, pv: String(rem.pdf.md5Checksum), notes: rem.notes && rem.notes.id, nv: rem.notes ? String(rem.notes.md5Checksum) : "" };
        await gdUploadDoc(m, d, true); up++; continue;
      }
      const remoteChanged = String(rem.pdf.md5Checksum) !== st.pv || (rem.notes ? String(rem.notes.md5Checksum) !== st.nv : false);
      if (remoteChanged && localChanged) {
        await gdDownloadDoc(rem, m.id + "|drive|" + Date.now().toString(36), true); copies++;
        st.pv = String(rem.pdf.md5Checksum); if (rem.notes) { st.notes = rem.notes.id; st.nv = String(rem.notes.md5Checksum); }
        await gdUploadDoc(m, d, true); up++;
      } else if (remoteChanged) { await gdDownloadDoc(rem, m.id); down++; }
      else if (localChanged) { await gdUploadDoc(m, d, !!(gd.dirty[m.id] && gd.dirty[m.id].pdf)); up++; }
    }
    for (const id in R) {
      if (local.has(id)) continue;
      const rem = R[id];
      if (trashed.has(id) || gd.cfg.docs[id]) {
        /* deleted here: move it to the Drive trash too */
        if (rem.pdf) await gdTrash(rem.pdf.id);
        if (rem.notes) await gdTrash(rem.notes.id);
        delete gd.cfg.docs[id]; gdSave(); continue;
      }
      if (!rem.pdf) continue;
      await gdDownloadDoc(rem, id); down++;
    }
    gd.cfg.last = Date.now(); gdSave();
    gdStatus("ok");
    if (down || copies) { renderLibrary(); if (openPop === $("filesPop")) renderRecent(); }
    if (copies) toast(copies === 1 ? "A file changed on two devices. Both versions are kept: look for “(other device)”." : copies + " files changed on two devices. Both versions are kept: look for “(other device)”.", 7000);
    else if (fromTap) toast(down ? "Synced. " + down + (down === 1 ? " file" : " files") + " updated from Google Drive." : "Synced with Google Drive.", 2500);
  } catch (e) {
    if (e.auth) gdStatus("tap");
    else gdStatus("error", e.message === "big" ? "A large file couldn't be uploaded. Try again on a faster connection." : navigator.onLine ? "Sync didn't finish. Margin will try again." : "");
  } finally {
    gd.busy = false;
    if (gd.again) { gd.again = false; setTimeout(() => gdSync(false), 1500); }
  }
}
function gdSoon(ms) { if (!gdOn()) return; clearTimeout(gd.timer); gd.timer = setTimeout(() => gdSync(false), ms || 15000); }

/* changes made in Margin mark the file for the next sync */
{
  const put = DB.put;
  DB.put = (s, v, quiet) => {
    const r = put(s, v, quiet);
    if (!quiet && v && v.id && (s === "files" || s === "ann") && gdOn()) {
      if (s === "files" && !v.trashed) { gd.dirty[v.id] = Object.assign(gd.dirty[v.id] || {}, { pdf: true }); gdSave(); }
      gdSoon();
    }
    return r;
  };
  const td = trashDoc;
  trashDoc = async function (m) { const r = await td.apply(this, arguments); gdSoon(4000); return r; };
}

/* -- the cloud button beside Share, and the Google Drive section in Settings -- */