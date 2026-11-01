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
const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>';
function openMeta(m) {
  if (m.id === state.id) { closeLibrary(); return; }
  DB.get("files", m.id).then((f) => {
    if (!f) { toast("This file is no longer saved. Import it again from Files."); return; }
    closeLibrary(); openDoc(m.id, m.name, f.bytes);
  });
}
function fillCards(box, metas, empty) {
  box.innerHTML = "";
  if (!metas.length) { const p = document.createElement("p"); p.className = "home-empty"; p.textContent = empty; box.appendChild(p); return; }
  for (const m of metas) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "card" + (m.id === state.id ? " current" : "");
    const cv = document.createElement("span"); cv.className = "card-cover";
    if (m.thumb) { const im = document.createElement("img"); im.src = m.thumb; im.alt = ""; cv.appendChild(im); }
    else cv.textContent = (m.name || "?").trim().charAt(0).toUpperCase();
    if (m.fav) { const st = document.createElement("span"); st.className = "card-fav"; st.innerHTML = STAR_SVG; cv.appendChild(st); }
    const t = document.createElement("b"); t.textContent = m.name;
    const sm = document.createElement("small"); sm.textContent = (m.pages || "?") + (m.pages === 1 ? " page" : " pages") + ", " + when(m.opened);
    b.append(cv, t, sm);
    b.onclick = () => openMeta(m);
    box.appendChild(b);
  }
}
async function renderLibrary() {
  const list = $("docList"), chipsEl = $("folderChips"), tools = $("folderTools");
  const all = await DB.all("meta");
  const searching = !!lib.q.trim();
  $("homeRecentSec").hidden = searching;
  $("homeFavSec").hidden = searching;
  $("myFilesLabel").textContent = searching ? "Search results" : "My files";
  if (!searching) {
    fillCards($("homeRecent"), all.slice().sort((a, b) => (b.opened || 0) - (a.opened || 0)).slice(0, 10), "No files yet.");
    fillCards($("homeFav"), all.filter((m) => m.fav).sort((a, b) => (a.name || "").localeCompare(b.name || "")), "Tap the star next to a file below to keep it here.");
  }
  /* folders can hold subfolders: a subfolder is stored as "Parent/Child" */
  const fset = new Set();
  for (const fd of storedFolders().concat(all.map((m) => m.folder).filter(Boolean))) {
    const parts = String(fd).split(FSEP);
    for (let k = 1; k <= parts.length; k++) fset.add(parts.slice(0, k).join(FSEP));
  }
  const folders = Array.from(fset).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (lib.folder !== "all" && !fset.has(lib.folder)) lib.folder = "all";
  const cur = lib.folder;
  const countTree = (path) => all.filter((m) => inTree(m.folder, path)).length;
  const go = (path) => () => { lib.folder = path; lib.actionsFor = null; lib.renaming = false; lib.newFolder = false; saveLib(); renderLibrary(); };
  const folderIcon = () => {
    const ic = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ic.setAttribute("viewBox", "0 0 24 24"); ic.innerHTML = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
    return ic;
  };
  /* folder chips: where you are (All files › Biology › Chapter 1), then the folders inside it */
  chipsEl.innerHTML = "";
  const allChip = chip("All files", all.length, cur === "all", go("all"));
  allChip.dataset.drop = "";
  chipsEl.appendChild(allChip);
  if (cur !== "all") {
    const parts = cur.split(FSEP);
    parts.forEach((part, k) => {
      const path = parts.slice(0, k + 1).join(FSEP);
      const sep = document.createElement("span");
      sep.textContent = "›"; sep.setAttribute("aria-hidden", "true");
      sep.style.cssText = "align-self:center;color:var(--muted);font-size:18px;";
      chipsEl.appendChild(sep);
      const c = chip(part, countTree(path), path === cur, go(path));
      c.prepend(folderIcon());
      c.dataset.drop = path;
      chipsEl.appendChild(c);
    });
    const br = document.createElement("span"); br.style.cssText = "flex-basis:100%;height:0;";
    chipsEl.appendChild(br);
  }
  const kids = folders.filter((fd) => (cur === "all" ? fd.indexOf(FSEP) < 0 : parentOf(fd) === cur));
  for (const fd of kids) {
    const c = chip(leafOf(fd), countTree(fd), false, go(fd));
    c.prepend(folderIcon());
    c.dataset.drop = fd;
    chipsEl.appendChild(c);
  }
  const addLabel = cur === "all" ? "+ New folder" : "+ New subfolder";
  if (lib.newFolder) {
    chipsEl.appendChild(inlineName(cur === "all" ? "Folder name" : "Subfolder name", "", "Create", (name) => {
      name = cleanFolderName(name);
      if (!name) return;
      const path = cur === "all" ? name : cur + FSEP + name;
      const list = storedFolders(); if (!list.includes(path)) { list.push(path); saveFolders(list); }
      lib.newFolder = false; lib.folder = path; saveLib(); renderLibrary();
    }, () => { lib.newFolder = false; renderLibrary(); }));
  } else chipsEl.appendChild(chip(addLabel, null, false, () => { lib.newFolder = true; renderLibrary(); }, "chip-add"));
  /* folder tools */
  tools.innerHTML = "";
  tools.hidden = cur === "all";
  if (cur !== "all") {
    const parent = parentOf(cur);
    if (lib.renaming) {
      tools.appendChild(inlineName("Folder name", leafOf(cur), "Rename", async (name) => {
        name = cleanFolderName(name);
        const np = name ? (parent ? parent + FSEP + name : name) : cur;
        if (np === cur) { lib.renaming = false; renderLibrary(); return; }
        if (fset.has(np)) { toast("There's already a folder with that name here."); return; }
        const swap = (fd) => (inTree(fd, cur) ? np + fd.slice(cur.length) : fd);
        for (const m of all) if (inTree(m.folder, cur)) { m.folder = swap(m.folder); await DB.put("meta", m); }
        saveFolders(storedFolders().map(swap).filter((x, k, arr) => arr.indexOf(x) === k));
        lib.folder = np; lib.renaming = false; saveLib(); renderLibrary();
      }, () => { lib.renaming = false; renderLibrary(); }));
    } else {
      const rn = document.createElement("button"); rn.type = "button"; rn.className = "link-btn"; rn.textContent = "Rename folder";
      rn.onclick = () => { lib.renaming = true; renderLibrary(); };
      const dl = document.createElement("button"); dl.type = "button"; dl.className = "link-btn danger"; dl.textContent = "Delete folder";
      const dest = parent ? leafOf(parent) : "All files";
      dl.onclick = async () => {
        if (!dl.classList.contains("armed")) { dl.classList.add("armed"); dl.textContent = "Tap again: its files move to " + dest; setTimeout(() => { dl.classList.remove("armed"); dl.textContent = "Delete folder"; }, 3500); return; }
        for (const m of all) if (inTree(m.folder, cur)) { if (parent) m.folder = parent; else delete m.folder; await DB.put("meta", m); }
        saveFolders(storedFolders().filter((x) => !inTree(x, cur)));
        lib.folder = parent || "all"; saveLib(); toast("Folder deleted. Its files are now in " + dest + "."); renderLibrary();
      };
      const hint = document.createElement("span"); hint.className = "fine"; hint.textContent = "Files you open or create now go into this folder.";
      tools.append(rn, dl, hint);
    }
  }
  /* list */
  $("libSort").value = lib.sort = sortKey(lib.sort);
  const q = lib.q.trim().toLowerCase();
  let metas = all.filter((m) => q || cur === "all" || m.folder === cur);
  if (q) metas = metas.filter((m) => (m.name || "").toLowerCase().includes(q));
  sortMetas(metas, lib.sort);
  fillSizes(metas, renderLibrary);
  list.innerHTML = "";
  if (!metas.length) {
    const msg = !all.length ? "No files yet. Tap Import from Files or New PDF to start."
      : q ? "No files match “" + lib.q.trim() + "”."
      : kids.length ? "No files directly in this folder. Open a subfolder above, or import a file while this folder is selected."
      : "This folder is empty. Import a file while this folder is selected, or move files here with ⋯ on any file.";
    const li = document.createElement("li"); const p = document.createElement("p"); p.className = "empty"; p.textContent = msg; li.appendChild(p); list.appendChild(li);
    return;
  }
  list.appendChild(docHead());
  for (const m of metas) {
    const li = document.createElement("li");
    li.className = "doc-row"; li.dataset.id = m.id;
    const open = document.createElement("button");
    open.type = "button"; open.className = "doc-open" + (m.id === state.id ? " current" : "");
    const th = document.createElement("span"); th.className = "doc-thumb";
    if (m.thumb) { const im = document.createElement("img"); im.src = m.thumb; im.alt = ""; th.appendChild(im); }
    else th.textContent = (m.name || "?").trim().charAt(0).toUpperCase();
    const info = document.createElement("span"); info.className = "doc-info";
    const bname = document.createElement("b"); bname.textContent = m.name;
    const sm = document.createElement("small");
    const notes = m.notes || 0;
    sm.textContent = docDetails(m);
    sm.title = notes + (notes === 1 ? " mark" : " marks") + " · opened " + when(m.opened);
    info.append(bname, sm);
    if (m.folder && (cur === "all" || q)) { const tag = document.createElement("span"); tag.className = "doc-folder"; tag.textContent = showPath(m.folder); info.appendChild(tag); }
    open.append(th, info, docCols(m));
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
    const star = document.createElement("button");
    star.type = "button"; star.className = "doc-star"; star.setAttribute("aria-pressed", String(!!m.fav));
    star.setAttribute("aria-label", m.fav ? "Remove " + m.name + " from favorites" : "Add " + m.name + " to favorites");
    star.innerHTML = STAR_SVG;
    star.onclick = async () => { if (m.fav) delete m.fav; else m.fav = true; await DB.put("meta", m); renderLibrary(); };
    li.append(open, star, more);
    if (lib.actionsFor === m.id) {
      const act = document.createElement("div"); act.className = "doc-actions";
      act.appendChild(inlineName("File name", m.name, "Rename", (name) => { renameDoc(m, name); lib.actionsFor = null; renderLibrary(); }, () => { lib.actionsFor = null; renderLibrary(); }));
      const row = document.createElement("div"); row.className = "doc-actions-row";
      const lab = document.createElement("span"); lab.className = "fine";
      lab.textContent = "In: " + (m.folder ? showPath(m.folder) : "All files (no folder)");
      const mv = document.createElement("button"); mv.type = "button"; mv.className = "btn"; mv.textContent = lib.moving === m.id ? "Cancel move" : "Move…";
      mv.onclick = () => { lib.moving = lib.moving === m.id ? null : m.id; renderLibrary(); };
      let pick = null;
      if (lib.moving === m.id) {
        pick = document.createElement("div"); pick.className = "move-pick";
        const head = document.createElement("div"); head.className = "fine"; head.textContent = "Choose where to move it:";
        pick.appendChild(head);
        for (const dest of [""].concat(folders)) {
          const b = document.createElement("button"); b.type = "button"; b.className = "move-dest";
          b.style.paddingLeft = (10 + (dest ? dest.split(FSEP).length - 1 : 0) * 18) + "px";
          b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span></span>';
          b.querySelector("span").textContent = dest ? leafOf(dest) : "All files (no folder)";
          const here = (m.folder || "") === dest;
          if (here) { b.disabled = true; b.querySelector("span").textContent += "  (here now)"; }
          b.onclick = () => moveDocTo(m, dest);
          pick.appendChild(b);
        }
      }
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
      row.style.justifyContent = "flex-start"; del.style.marginLeft = "auto";
      row.append(lab, mv, del);
      act.appendChild(row);
      if (pick) act.appendChild(pick);
      li.appendChild(act);
    }
    list.appendChild(li);
  }
}
$("libSearch").addEventListener("input", () => { lib.q = $("libSearch").value; renderLibrary(); });
$("libSort").addEventListener("change", () => setSort($("libSort").value));
function when(t) {
  if (!t) return "never";
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return "today " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function openLibrary() { lib.q = ""; $("libSearch").value = ""; lib.actionsFor = null; lib.moving = null; lib.newFolder = false; lib.renaming = false; $("libSheet").hidden = false; renderLibrary(); }
function closeLibrary() { $("libSheet").hidden = true; }
/* favorite the open file from the Files menu */
const favItem = document.createElement("button");
favItem.type = "button"; favItem.className = "menu-item"; favItem.id = "fmFav"; favItem.setAttribute("role", "menuitem");
favItem.innerHTML = STAR_SVG + '<span><b id="fmFavLabel">Add to favorites</b><small>Keep this file under Favorites on Home</small></span>';
$("fmNew").after(favItem);
async function refreshFavItem() {
  const m = state.id ? await DB.get("meta", state.id) : null;
  const on = !!(m && m.fav), svg = favItem.querySelector("svg");
  $("fmFavLabel").textContent = on ? "Remove from favorites" : "Add to favorites";
  favItem.setAttribute("aria-pressed", String(on));
  svg.style.fill = on ? "#f2a20c" : ""; svg.style.stroke = on ? "#f2a20c" : "";
}
favItem.onclick = async () => {
  const m = state.id ? await DB.get("meta", state.id) : null;
  if (!m) { toast("Open a file first."); return; }
  if (m.fav) delete m.fav; else m.fav = true;
  await DB.put("meta", m);
  toast(m.fav ? "Added to favorites. Find it on Home." : "Removed from favorites.");
  refreshFavItem();
};
$("filesBtn").addEventListener("click", () => { refreshFavItem(); });
/* day / night switch for the bars and menus (View menu) */
const nightRow = document.createElement("button");
nightRow.type = "button"; nightRow.className = "setting-row"; nightRow.id = "nightBtn";
nightRow.innerHTML = '<span><b>Night mode</b><small>Dark toolbars, menus and Home. Pages keep their own Page colour.</small></span><span class="toggle"><span class="knob"></span></span>';
const nightLabel = document.createElement("div");
nightLabel.className = "pop-label"; nightLabel.textContent = "Day / night";
$("pencilBtn").previousElementSibling.before(nightLabel, nightRow);
function isNight() {
  let t = null;
  try { t = localStorage.getItem("margin-theme"); } catch (e) {}
  if (t === "dark") return true;
  if (t === "light") return false;
  return !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
}
function applyTheme() {
  const night = isNight();
  document.documentElement.dataset.theme = night ? "dark" : "light";
  nightRow.setAttribute("aria-pressed", String(night));
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", night ? "#1d222a" : "#f8fafc"));
}
nightRow.onclick = () => {
  const night = !isNight();
  try { localStorage.setItem("margin-theme", night ? "dark" : "light"); } catch (e) {}
  applyTheme();
};
applyTheme();
$("libClose").onclick = closeLibrary;
$("libSheet").addEventListener("pointerdown", (e) => { if (e.target === $("libSheet")) closeLibrary(); });
const drop = $("drop");
["dragenter", "dragover"].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
window.addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) addFile(f); });
