function inlineName(placeholder, value, okLabel, onOk, onCancel) {
  const wrap = document.createElement("form");
  wrap.className = "inline-name";
  const inp = document.createElement("input");
  inp.className = "input"; inp.type = "text"; inp.maxLength = 60; inp.placeholder = placeholder; inp.value = value || "";
  inp.setAttribute("aria-label", placeholder);
  const ok = document.createElement("button"); ok.type = "submit"; ok.className = "btn primary"; ok.textContent = okLabel;
  const no = document.createElement("button"); no.type = "button"; no.className = "btn"; no.textContent = "Cancel";
  no.onclick = onCancel;
  wrap.addEventListener("submit", (e) => { e.preventDefault(); onOk(inp.value.trim()); });
  wrap.append(inp, ok, no);
  setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) {} }, 30);
  return wrap;
}
async function renderLibrary() {
  const list = $("docList"), chipsEl = $("folderChips"), tools = $("folderTools");
  const all = await DB.all("meta");
  const folders = Array.from(new Set(storedFolders().concat(all.map((m) => m.folder).filter(Boolean)))).sort((a, b) => a.localeCompare(b));
  if (lib.folder !== "all" && !folders.includes(lib.folder)) lib.folder = "all";
  /* folder chips */
  chipsEl.innerHTML = "";
  chipsEl.appendChild(chip("All files", all.length, lib.folder === "all", () => { lib.folder = "all"; lib.actionsFor = null; saveLib(); renderLibrary(); }));
  for (const fd of folders) {
    const n = all.filter((m) => m.folder === fd).length;
    const ic = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ic.setAttribute("viewBox", "0 0 24 24"); ic.innerHTML = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
    const c = chip(fd, n, lib.folder === fd, () => { lib.folder = fd; lib.actionsFor = null; lib.renaming = false; saveLib(); renderLibrary(); });
    c.prepend(ic);
    chipsEl.appendChild(c);
  }
  if (lib.newFolder) {
    chipsEl.appendChild(inlineName("Folder name", "", "Create", (name) => {
      if (!name) return;
      const cur = storedFolders(); if (!cur.includes(name)) { cur.push(name); saveFolders(cur); }
      lib.newFolder = false; lib.folder = name; saveLib(); renderLibrary();
    }, () => { lib.newFolder = false; renderLibrary(); }));
  } else chipsEl.appendChild(chip("+ New folder", null, false, () => { lib.newFolder = true; renderLibrary(); }, "chip-add"));
  /* folder tools */
  tools.innerHTML = "";
  tools.hidden = lib.folder === "all";
  if (lib.folder !== "all") {
    if (lib.renaming) {
      tools.appendChild(inlineName("Folder name", lib.folder, "Rename", async (name) => {
        if (!name || name === lib.folder) { lib.renaming = false; renderLibrary(); return; }
        const old = lib.folder;
        for (const m of all) if (m.folder === old) { m.folder = name; await DB.put("meta", m); }
        saveFolders(storedFolders().map((x) => (x === old ? name : x)).filter((x, i, arr) => arr.indexOf(x) === i));
        lib.folder = name; lib.renaming = false; saveLib(); renderLibrary();
      }, () => { lib.renaming = false; renderLibrary(); }));
    } else {
      const rn = document.createElement("button"); rn.type = "button"; rn.className = "link-btn"; rn.textContent = "Rename folder";
      rn.onclick = () => { lib.renaming = true; renderLibrary(); };
      const dl = document.createElement("button"); dl.type = "button"; dl.className = "link-btn danger"; dl.textContent = "Delete folder";
      dl.onclick = async () => {
        if (!dl.classList.contains("armed")) { dl.classList.add("armed"); dl.textContent = "Tap again: files move to All files"; setTimeout(() => { dl.classList.remove("armed"); dl.textContent = "Delete folder"; }, 3500); return; }
        const old = lib.folder;
        for (const m of all) if (m.folder === old) { delete m.folder; await DB.put("meta", m); }
        saveFolders(storedFolders().filter((x) => x !== old));
        lib.folder = "all"; saveLib(); toast("Folder deleted. Its files are still in All files."); renderLibrary();
      };
      const hint = document.createElement("span"); hint.className = "fine"; hint.textContent = "Files you open or create now go into this folder.";
      tools.append(rn, dl, hint);
    }
  }
  /* list */
  $("libSort").value = lib.sort;
  let metas = all.filter((m) => lib.folder === "all" || m.folder === lib.folder);
  const q = lib.q.trim().toLowerCase();
  if (q) metas = metas.filter((m) => (m.name || "").toLowerCase().includes(q));
  if (lib.sort === "name") metas.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }));
  else if (lib.sort === "added") metas.sort((a, b) => (b.added || 0) - (a.added || 0));
  else metas.sort((a, b) => (b.opened || 0) - (a.opened || 0));
  list.innerHTML = "";
  if (!metas.length) {
    const msg = !all.length ? "No files yet. Tap Open a file or New PDF to start."
      : q ? "No files match \u201c" + lib.q.trim() + "\u201d."
      : "This folder is empty. Open a file while the folder is selected, or move files here with \u22ef on any file.";
    const li = document.createElement("li"); const p = document.createElement("p"); p.className = "empty"; p.textContent = msg; li.appendChild(p); list.appendChild(li);
    return;
  }
  for (const m of metas) {
    const li = document.createElement("li");
    li.className = "doc-row";
    const open = document.createElement("button");
    open.type = "button"; open.className = "doc-open" + (m.id === state.id ? " current" : "");
    const th = document.createElement("span"); th.className = "doc-thumb";
    if (m.thumb) { const im = document.createElement("img"); im.src = m.thumb; im.alt = ""; th.appendChild(im); }
    else th.textContent = (m.name || "?").trim().charAt(0).toUpperCase();
    const info = document.createElement("span"); info.className = "doc-info";
    const bname = document.createElement("b"); bname.textContent = m.name;
    const sm = document.createElement("small");
    const notes = m.notes || 0;
    sm.textContent = (m.pages || "?") + (m.pages === 1 ? " page" : " pages") + " · " + notes + (notes === 1 ? " mark" : " marks") + " · opened " + when(m.opened);
    info.append(bname, sm);
    if (m.folder && lib.folder === "all") { const tag = document.createElement("span"); tag.className = "doc-folder"; tag.textContent = m.folder; info.appendChild(tag); }
    open.append(th, info);
    open.onclick = async () => {
      if (m.id === state.id) { closeLibrary(); return; }
      const f = await DB.get("files", m.id);
      if (!f) { toast("This file is no longer saved. Open it again from Files."); return; }
      closeLibrary(); openDoc(m.id, m.name, f.bytes);
    };
    const more = document.createElement("button");
    more.type = "button"; more.className = "doc-more"; more.setAttribute("aria-label", "More for " + m.name);
    more.setAttribute("aria-expanded", String(lib.actionsFor === m.id));
    more.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
    more.onclick = () => { lib.actionsFor = lib.actionsFor === m.id ? null : m.id; renderLibrary(); };
    li.append(open, more);
    if (lib.actionsFor === m.id) {
      const act = document.createElement("div"); act.className = "doc-actions";
      act.appendChild(inlineName("File name", m.name, "Rename", (name) => { renameDoc(m, name); lib.actionsFor = null; renderLibrary(); }, () => { lib.actionsFor = null; renderLibrary(); }));
      const row = document.createElement("div"); row.className = "doc-actions-row";
      const lab = document.createElement("label"); lab.className = "fine"; lab.textContent = "Folder";
      const sel = document.createElement("select"); sel.className = "select"; sel.setAttribute("aria-label", "Folder for " + m.name);
      const none = document.createElement("option"); none.value = ""; none.textContent = "No folder"; sel.appendChild(none);
      for (const fd of folders) { const o = document.createElement("option"); o.value = fd; o.textContent = fd; sel.appendChild(o); }
      sel.value = m.folder || "";
      sel.onchange = async () => { if (sel.value) m.folder = sel.value; else delete m.folder; await DB.put("meta", m); toast(sel.value ? "Moved to " + sel.value : "Removed from folder"); renderLibrary(); };
      lab.appendChild(sel);
      const del = document.createElement("button");
      del.type = "button"; del.className = "del"; del.textContent = "Delete file";
      del.onclick = async () => {
        if (!del.classList.contains("armed")) {
          del.classList.add("armed"); del.textContent = "Tap again to delete";
          setTimeout(() => { del.classList.remove("armed"); del.textContent = "Delete file"; }, 3000);
          return;
        }
        lib.actionsFor = null;
        await deleteDoc(m);
        renderLibrary();
      };
      row.append(lab, del);
      act.appendChild(row);
      li.appendChild(act);
    }
    list.appendChild(li);
  }
}
$("libSearch").addEventListener("input", () => { lib.q = $("libSearch").value; renderLibrary(); });
$("libSort").addEventListener("change", () => { lib.sort = $("libSort").value; saveLib(); renderLibrary(); });
function when(t) {
  if (!t) return "never";
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return "today " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function openLibrary() { lib.q = ""; $("libSearch").value = ""; lib.actionsFor = null; lib.newFolder = false; lib.renaming = false; $("libSheet").hidden = false; renderLibrary(); }
function closeLibrary() { $("libSheet").hidden = true; }
$("libClose").onclick = closeLibrary;
$("libSheet").addEventListener("pointerdown", (e) => { if (e.target === $("libSheet")) closeLibrary(); });
const drop = $("drop");
["dragenter", "dragover"].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
window.addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) addFile(f); });
