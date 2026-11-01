/* ---------- keep your files: ask the browser not to clear Margin's storage ---------- */
/* Safari can clear a website's saved data when the iPad runs low on space; a persisted site is kept */
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then((ok) => ok || navigator.storage.persist()).catch(() => {});
}

/* ---------- reopen each file at the page you were reading ---------- */
var pageMemo = { t: 0, id: null, n: 0, zp: null };
function lastPage(id, max) {
  let n = 1;
  try { n = +(JSON.parse(localStorage.getItem("margin-pages") || "{}")[id]) || 1; } catch (e) {}
  return Math.min(Math.max(1, n), max || 1);
}
function rememberPage(n) {
  /* the zoom window follows when you move to another page; it keeps the same spot on the page */
  if (!zoom.on) pageMemo.zp = null;
  else if (pageMemo.zp !== n) {
    const np = state.pages[n - 1];
    if (pageMemo.zp != null && np && zoom.p && np !== zoom.p) zoomMoveTo(np, zoom.x, zoom.y);
    pageMemo.zp = n;
  }
  if (!state.id || (pageMemo.id === state.id && pageMemo.n === n)) return;
  pageMemo.id = state.id; pageMemo.n = n;
  clearTimeout(pageMemo.t);
  pageMemo.t = setTimeout(() => {
    try {
      const all = JSON.parse(localStorage.getItem("margin-pages") || "{}");
      all[pageMemo.id] = pageMemo.n;
      localStorage.setItem("margin-pages", JSON.stringify(all));
    } catch (e) {}
  }, 400);
}

/* ---------- Recently Deleted: deleted files wait 30 days before they are gone ---------- */
/* the file keeps its bytes and notes; its library entry moves into the file record, and a small list
   of deleted files lives in localStorage so Home can show them without loading every PDF */
var TRASH_DAYS = 30;
function trashList() { try { return JSON.parse(localStorage.getItem("margin-trash") || "[]") || []; } catch (e) { return []; } }
function saveTrash(list) { try { localStorage.setItem("margin-trash", JSON.stringify(list)); } catch (e) {} }
async function trashDoc(m) {
  const meta = (await DB.get("meta", m.id)) || m;
  const f = await DB.get("files", m.id);
  if (f) { f.trashed = meta; f.trashedAt = Date.now(); await DB.put("files", f, true); }
  await DB.del("meta", m.id);
  if (f) saveTrash(trashList().filter((t) => t.id !== m.id).concat({ id: m.id, name: meta.name, pages: meta.pages, size: meta.size, at: f.trashedAt }));
  else await DB.del("ann", m.id);
}
async function restoreDoc(t) {
  const f = await DB.get("files", t.id);
  saveTrash(trashList().filter((x) => x.id !== t.id));
  if (!f || !f.trashed) { toast("This file can't be brought back."); renderLibrary(); return; }
  const meta = f.trashed;
  delete f.trashed; delete f.trashedAt;
  await DB.put("files", f, true);
  if (meta.folder && !storedFolders().includes(meta.folder)) { const l = storedFolders(); l.push(meta.folder); saveFolders(l); }
  await DB.put("meta", meta);
  toast("“" + meta.name + "” is back" + (meta.folder ? " in " + showPath(meta.folder) : "") + ".");
  if (!trashList().length) lib.trash = false;
  renderLibrary();
}
async function purgeDoc(id) {
  await DB.del("files", id); await DB.del("ann", id);
  saveTrash(trashList().filter((x) => x.id !== id));
}
function trashChip() {
  const n = trashList().length;
  if (!n) return null;
  const c = chip("Recently Deleted", n, !!lib.trash, () => { lib.trash = !lib.trash; lib.actionsFor = null; renderLibrary(); }, "chip-trash");
  const ic = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ic.setAttribute("viewBox", "0 0 24 24");
  ic.innerHTML = '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>';
  c.prepend(ic);
  return c;
}
function renderTrash(list) {
  const items = trashList().sort((a, b) => b.at - a.at);
  $("myFilesLabel").textContent = "Recently Deleted";
  const head = document.createElement("li"); head.className = "trash-head";
  const p = document.createElement("p"); p.className = "fine";
  p.textContent = items.length ? "Files stay here for " + TRASH_DAYS + " days with their notes, then they are deleted for good." : "Nothing here. Files you delete wait here for " + TRASH_DAYS + " days.";
  head.appendChild(p);
  if (items.length) {
    const all = document.createElement("button"); all.type = "button"; all.className = "del"; all.textContent = "Delete all now";
    all.onclick = async () => {
      if (!all.classList.contains("armed")) { all.classList.add("armed"); all.textContent = "Tap again: this can't be undone"; setTimeout(() => { all.classList.remove("armed"); all.textContent = "Delete all now"; }, 3500); return; }
      for (const t of trashList()) await purgeDoc(t.id);
      lib.trash = false; toast("Recently Deleted is empty."); renderLibrary();
    };
    head.appendChild(all);
  }
  list.appendChild(head);
  for (const t of items) {
    const li = document.createElement("li"); li.className = "doc-row trash-row";
    const info = document.createElement("span"); info.className = "doc-info";
    const b = document.createElement("b"); b.textContent = t.name;
    const sm = document.createElement("small");
    const left = Math.max(1, Math.ceil((t.at + TRASH_DAYS * 864e5 - Date.now()) / 864e5));
    sm.textContent = (t.pages || "?") + (t.pages === 1 ? " page" : " pages") + " · deleted " + fmtDate(t.at, true) + " · " + left + (left === 1 ? " day" : " days") + " left";
    info.append(b, sm);
    const back = document.createElement("button"); back.type = "button"; back.className = "btn"; back.textContent = "Restore";
    back.onclick = () => restoreDoc(t);
    const del = document.createElement("button"); del.type = "button"; del.className = "del"; del.textContent = "Delete now";
    del.onclick = async () => {
      if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "Tap again"; setTimeout(() => { del.classList.remove("armed"); del.textContent = "Delete now"; }, 3000); return; }
      await purgeDoc(t.id);
      if (!trashList().length) lib.trash = false;
      toast("Deleted “" + t.name + "” for good."); renderLibrary();
    };
    const acts = document.createElement("span"); acts.className = "trash-acts"; acts.append(back, del);
    li.append(info, acts);
    list.appendChild(li);
  }
}
/* files deleted more than 30 days ago are removed for good when Margin starts */
(async () => {
  const old = trashList().filter((t) => Date.now() - t.at > TRASH_DAYS * 864e5);
  for (const t of old) await purgeDoc(t.id);
})();

/* ---------- links inside the PDF: tap to follow (finger, or the Select tool) ---------- */
function loadLinks(p) {
  p.linksP = p.page.getAnnotations({ intent: "display" }).then((anns) => {
    p.links = [];
    for (const a of anns || []) {
      if (a.subtype !== "Link" || !a.rect || !(a.url || a.unsafeUrl || a.dest)) continue;
      const r = p.vp.convertToViewportRectangle(a.rect);
      const x = Math.min(r[0], r[2]), y = Math.min(r[1], r[3]), w = Math.abs(r[2] - r[0]), h = Math.abs(r[3] - r[1]);
      if (w < 1 || h < 1) continue;
      const link = { x, y, w, h, url: a.url || a.unsafeUrl || null, dest: a.dest || null };
      p.links.push(link);
      const box = document.createElement("div");
      box.className = "lnk"; box.title = link.url || "Go to page";
      box.style.cssText = "left:" + (x / p.w * 100) + "%;top:" + (y / p.h * 100) + "%;width:" + (w / p.w * 100) + "%;height:" + (h / p.h * 100) + "%;";
      p.wrap.appendChild(box);
    }
  }).catch(() => { p.links = []; });
}
function linkAt(p, pt) {
  if (!p.links) return null;
  const pad = 3;
  return p.links.find((l) => pt[0] >= l.x - pad && pt[0] <= l.x + l.w + pad && pt[1] >= l.y - pad && pt[1] <= l.y + l.h + pad) || null;
}
async function followLink(l) {
  if (l.url) {
    if (!/^(https?:|mailto:|tel:)/i.test(l.url)) { toast("This link can't be opened from Margin."); return; }
    const w = window.open(l.url, "_blank", "noopener");
    if (!w) toast("Allow pop-ups to open links, or copy it: " + l.url, 5000);
    return;
  }
  try {
    let dest = l.dest;
    if (typeof dest === "string") dest = await state.pdf.getDestination(dest);
    if (!Array.isArray(dest)) return;
    const ref = dest[0];
    const idx = typeof ref === "number" ? ref : await state.pdf.getPageIndex(ref);
    const p = state.pages[idx];
    if (!p) return;
    let yPt = null;
    if (dest[1] && dest[1].name === "XYZ" && dest[3] != null) yPt = Math.max(0, p.vp.convertToViewportPoint(0, dest[3])[1]);
    else if (dest[1] && dest[1].name === "FitH" && dest[2] != null) yPt = Math.max(0, p.vp.convertToViewportPoint(0, dest[2])[1]);
    goToPage(p.n, yPt, true);
    toast("Page " + p.n, 1200);
  } catch (e) { toast("This link points somewhere Margin can't find."); }
}

/* ---------- select and copy text: with the Select tool, press and hold on words ---------- */
function textLayerFor(p) {
  if (!p.tl) {
    if (!pdfjsLib.renderTextLayer) return;
    const div = document.createElement("div");
    div.className = "textLayer";
    div.style.setProperty("--scale-factor", "1");
    div.style.width = p.w + "px"; div.style.height = p.h + "px";
    p.wrap.appendChild(div);
    p.tl = div; p.tlS = 0;
    p.page.getTextContent().then((tc) => pdfjsLib.renderTextLayer({ textContentSource: tc, container: div, viewport: p.vp, textDivs: [] }).promise).catch(() => {});
  }
  if (p.tlS !== p.s) { p.tl.style.transform = "scale(" + p.s + ")"; p.tlS = p.s; }
}
function pageExtras(p) {
  if (!p.page) return;
  if (!p.linksP) loadLinks(p);
  if (state.tool === "hand") textLayerFor(p);
}
/* switching to the Select tool adds the text to the pages already on screen */
new MutationObserver(() => { if (state.tool === "hand") for (const p of state.pages) if (p.near) pageExtras(p); })
  .observe(viewer, { attributes: true, attributeFilter: ["class"] });

/* ---------- two pages side by side (View menu) ---------- */
(() => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "tpl"; b.dataset.v = "spread"; b.setAttribute("aria-pressed", "false");
  b.innerHTML = '<i class="vmini d"><b></b><b></b></i>Two pages';
  $("viewOpts").appendChild(b);
})();

/* ---------- saved pens: keep favourite pen and highlighter setups one tap away ---------- */
/* up to 3 saved pens; to change one, press and hold it to remove it, then save the new one */
var MAX_PENS = 3;
function penPresets() { try { return (JSON.parse(localStorage.getItem("margin-pens") || "[]") || []).slice(0, MAX_PENS); } catch (e) { return []; } }
function savePenPresets(list) { try { localStorage.setItem("margin-pens", JSON.stringify(list)); } catch (e) {} }
function currentPen() {
  if (state.tool === "pen") return { tool: "pen", color: state.penColor, size: state.penSize };
  if (state.tool === "hl" && state.hlStyle === "marker") return { tool: "hl", color: state.hlColor, size: state.hlSize };
  return null;
}
function samePen(a, b) { return !!a && !!b && a.tool === b.tool && String(a.color).toLowerCase() === String(b.color).toLowerCase() && a.size === b.size; }
function renderPenPresets() {
  let box = document.getElementById("penPresets");
  if (!box) {
    const opts = document.querySelector(".row2 .options");
    if (!opts) return;
    box = document.createElement("div"); box.id = "penPresets"; box.className = "pen-presets";
    box.setAttribute("role", "group"); box.setAttribute("aria-label", "Saved pens");
    opts.after(box);
  }
  box.innerHTML = "";
  const list = penPresets(), cur = currentPen();
  list.forEach((pr, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "preset " + pr.tool;
    const label = (pr.tool === "pen" ? "Saved pen " : "Saved highlighter ") + (i + 1);
    b.setAttribute("aria-label", label + ". Press and hold to remove."); b.title = label + " (press and hold to remove)";
    b.setAttribute("aria-pressed", String(samePen(pr, cur)));
    const dot = document.createElement("i");
    const d = pr.tool === "pen" ? [6, 9, 13][pr.size] || 9 : [10, 13, 16][pr.size] || 13;
    dot.style.cssText = "width:" + (pr.tool === "pen" ? d : 18) + "px;height:" + (pr.tool === "pen" ? d : d * 0.6) + "px;background:" + pr.color + ";";
    b.appendChild(dot);
    let hold = 0, held = false;
    b.addEventListener("pointerdown", () => { held = false; hold = setTimeout(() => { held = true; savePenPresets(penPresets().filter((x) => !samePen(x, pr))); toast("Saved pen removed."); renderPenPresets(); }, 600); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((t) => b.addEventListener(t, () => clearTimeout(hold)));
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    b.onclick = () => {
      if (held) return;
      if (textEdit) closeTextEdit();
      if (lassoSel) clearLassoSel();
      state.tool = pr.tool;
      if (pr.tool === "pen") { state.penColor = pr.color; state.penSize = pr.size; }
      else { state.hlStyle = "marker"; state.hlColor = pr.color; state.hlSize = pr.size; }
      savePrefs(); renderToolbar();
    };
    box.appendChild(b);
  });
  if (cur && !list.some((x) => samePen(x, cur))) {
    const add = document.createElement("button");
    add.type = "button"; add.className = "preset add";
    add.setAttribute("aria-label", "Save this pen"); add.title = "Save this pen and colour";
    add.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6.5 3.5h11v17L12 16.5l-5.5 4z"/><path d="M12 7.5v6M9 10.5h6"/></svg>';
    const full = list.length >= MAX_PENS;
    add.classList.toggle("full", full);
    if (full) add.title = "You have 3 saved pens. Press and hold one to remove it first.";
    add.onclick = () => {
      if (penPresets().length >= MAX_PENS) { toast("You can keep 3 saved pens. Press and hold one to remove it, then save this one.", 4500); return; }
      savePenPresets(penPresets().concat(cur)); toast("Saved. Tap it any time to pick this pen again."); renderPenPresets();
    };
    box.appendChild(add);
  }
  box.hidden = !list.length && !cur;
}

/* ---------- ruler: a straight edge to draw along ---------- */
/* drag it with one finger, turn it with two fingers or the round handle; a stroke that starts
   next to one of its long edges follows that edge exactly */
var ruler = { on: false, cx: 0, cy: 0, a: 0, L: 0, T: 72, lock: null, ptrs: new Map(), el: null };
function rulerVec() {
  const r = ruler.a * Math.PI / 180;
  return { d: [Math.cos(r), Math.sin(r)], n: [-Math.sin(r), Math.cos(r)] };
}
function placeRuler() {
  const el = ruler.el;
  el.style.width = ruler.L + "px"; el.style.height = ruler.T + "px";
  el.style.left = (ruler.cx - ruler.L / 2) + "px"; el.style.top = (ruler.cy - ruler.T / 2) + "px";
  el.style.transform = "rotate(" + ruler.a + "deg)";
  let shown = ((Math.round(ruler.a) % 180) + 180) % 180;
  el.querySelector(".ruler-deg").textContent = shown + "°";
}
function buildRuler() {
  const el = document.createElement("div");
  el.className = "ruler"; el.hidden = true;
  el.innerHTML = '<span class="ruler-deg"></span><span class="ruler-knob" title="Drag to turn"></span>';
  document.body.appendChild(el);
  ruler.el = el;
  const knob = el.querySelector(".ruler-knob");
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    ruler.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, knob: e.target === knob });
  });
  el.addEventListener("pointermove", (e) => {
    const prev = ruler.ptrs.get(e.pointerId);
    if (!prev) return;
    e.preventDefault();
    const pts = Array.from(ruler.ptrs.entries());
    if (prev.knob && pts.length === 1) {
      ruler.a = Math.atan2(e.clientY - ruler.cy, e.clientX - ruler.cx) * 180 / Math.PI;
    } else if (pts.length === 1) {
      ruler.cx += e.clientX - prev.x; ruler.cy += e.clientY - prev.y;
    } else if (pts.length >= 2) {
      const other = pts.find(([id]) => id !== e.pointerId)[1];
      const a0 = Math.atan2(prev.y - other.y, prev.x - other.x), a1 = Math.atan2(e.clientY - other.y, e.clientX - other.x);
      ruler.a += (a1 - a0) * 180 / Math.PI;
      ruler.cx += (e.clientX - prev.x) / 2; ruler.cy += (e.clientY - prev.y) / 2;
    }
    const near = Math.round(ruler.a / 45) * 45;
    if (Math.abs(ruler.a - near) < 2) ruler.a = near;
    ruler.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, knob: prev.knob });
    placeRuler();
  });
  const up = (e) => { ruler.ptrs.delete(e.pointerId); ruler.a = ((ruler.a % 360) + 360) % 360; };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}