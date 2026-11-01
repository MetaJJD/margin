/* ---------- page colour: normal, sepia, night ---------- */
$("readMode").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.readMode = b.dataset.v; savePrefs(); renderToolbar();
});

/* ---------- automatic page numbers ---------- */
const PN_DEFAULT = { on: true, v: "top", h: "right", fmt: "page", start: 1, skip: false, size: 10 };
function pnActive() { return !!(state.pageNumbers && state.pageNumbers.on); }
function pnLabel(n) {
  const pn = state.pageNumbers;
  if (!pn || !pn.on) return null;
  if (pn.skip && n === 1) return null;
  const num = n - (pn.skip ? 1 : 0) + (pn.start - 1);
  const total = state.pages.length - (pn.skip ? 1 : 0) + (pn.start - 1);
  if (pn.fmt === "page") return "Page " + num;
  if (pn.fmt === "of") return num + " / " + total;
  if (pn.fmt === "pageof") return "Page " + num + " of " + total;
  if (pn.fmt === "dash") return "- " + num + " -";
  return String(num);
}
function drawPageNum(ctx, p) {
  const label = pnLabel(p.n);
  if (!label) return;
  const pn = state.pageNumbers, M = 28;
  ctx.save();
  ctx.font = pn.size + "px Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#545966";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = pn.h === "left" ? "left" : pn.h === "center" ? "center" : "right";
  const x = pn.h === "left" ? M : pn.h === "center" ? p.w / 2 : p.w - M;
  const y = pn.v === "top" ? M + pn.size * 0.75 : p.h - M + pn.size * 0.1;
  ctx.fillText(label, x, y);
  ctx.restore();
}
function pnRefresh() {
  for (const p of state.pages) { if (p.inkK) drawInk(p); thumbDirty(p.n); }
  scheduleSave();
  renderPnForm();
}
function renderPnForm() {
  const pn = state.pageNumbers || Object.assign({}, PN_DEFAULT, { on: false });
  const set = (id, v) => $(id).querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(v))));
  set("pnOn", pn.on ? "on" : "off"); set("pnV", pn.v); set("pnH", pn.h); set("pnSize", pn.size);
  $("pnFmt").value = pn.fmt; $("pnStart").value = pn.start; $("pnSkip").checked = !!pn.skip;
  const a = pnLabel(Math.min(2, state.pages.length || 1));
  $("pnPreview").textContent = pn.on
    ? "Looks like “" + (pnLabel(state.curPage || 1) || a || "") + "” on this page. Numbers appear on screen and in the PDF you share."
    : "Turn on Show to number every page automatically, including pages you add later.";
}
function pnUpdate(patch) {
  state.pageNumbers = Object.assign({}, state.pageNumbers || PN_DEFAULT, patch);
  pnRefresh();
}
$("insPageNum").onclick = () => {
  if (!state.pages.length) { toast("Open a PDF first."); return; }
  if (!state.pageNumbers) pnUpdate({ on: true });
  renderPnForm();
  $("pnSheet").hidden = false;
};
$("pnClose").onclick = () => { $("pnSheet").hidden = true; };
$("pnSheet").addEventListener("pointerdown", (e) => { if (e.target === $("pnSheet")) $("pnSheet").hidden = true; });
$("pnForm").addEventListener("submit", (e) => { e.preventDefault(); $("pnSheet").hidden = true; });
$("pnOn").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) pnUpdate({ on: b.dataset.v === "on" }); });
$("pnV").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) pnUpdate({ v: b.dataset.v, on: true }); });
$("pnH").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) pnUpdate({ h: b.dataset.v, on: true }); });
$("pnSize").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) pnUpdate({ size: +b.dataset.v }); });
$("pnFmt").addEventListener("change", () => pnUpdate({ fmt: $("pnFmt").value }));
$("pnStart").addEventListener("change", () => pnUpdate({ start: Math.max(0, Math.min(9999, parseInt($("pnStart").value, 10) || 1)) }));
$("pnSkip").addEventListener("change", () => pnUpdate({ skip: $("pnSkip").checked }));

/* ---------- full screen control bar: drag to any edge ---------- */
const fsPill = $("fsPill");
let fsPos = { edge: "top", c: 0.92 };
try { const v = JSON.parse(localStorage.getItem("margin-fspill") || "null"); if (v && v.edge) fsPos = v; } catch (e) {}
function insets() {
  const cs = getComputedStyle(document.documentElement);
  return { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
}
function layoutPill(animate) {
  if (fsPill.hidden) return;
  const vertical = fsPos.edge === "left" || fsPos.edge === "right";
  fsPill.classList.toggle("vertical", vertical);
  fsPill.classList.toggle("snapping", !!animate);
  const vw = window.innerWidth, vh = window.innerHeight, ins = insets();
  const w = fsPill.offsetWidth, h = fsPill.offsetHeight, M = 10;
  let left, top;
  if (vertical) {
    left = fsPos.edge === "left" ? M : vw - w - M;
    top = Math.max(M + ins.t, Math.min(vh - h - M - ins.b, fsPos.c * vh - h / 2));
  } else {
    top = fsPos.edge === "top" ? M + ins.t : vh - h - M - ins.b;
    left = Math.max(M, Math.min(vw - w - M, fsPos.c * vw - w / 2));
  }
  fsPill.style.left = Math.round(left) + "px";
  fsPill.style.top = Math.round(top) + "px";
  if (animate) setTimeout(() => fsPill.classList.remove("snapping"), 260);
}
let pillDrag = null;
fsPill.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) return;
  e.preventDefault(); e.stopPropagation();
  try { fsPill.setPointerCapture(e.pointerId); } catch (err) {}
  const r = fsPill.getBoundingClientRect();
  pillDrag = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top };
  fsPill.classList.add("dragging");
});
fsPill.addEventListener("pointermove", (e) => {
  if (!pillDrag || e.pointerId !== pillDrag.id) return;
  e.preventDefault();
  fsPill.style.left = (e.clientX - pillDrag.ox) + "px";
  fsPill.style.top = (e.clientY - pillDrag.oy) + "px";
});
function pillDrop(e) {
  if (!pillDrag || e.pointerId !== pillDrag.id) return;
  pillDrag = null;
  fsPill.classList.remove("dragging");
  const r = fsPill.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const d = { top: cy, bottom: vh - cy, left: cx, right: vw - cx };
  const edge = Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
  fsPos = { edge, c: edge === "left" || edge === "right" ? cy / vh : cx / vw };
  try { localStorage.setItem("margin-fspill", JSON.stringify(fsPos)); } catch (err) {}
  layoutPill(true);
}
fsPill.addEventListener("pointerup", pillDrop);
fsPill.addEventListener("pointercancel", pillDrop);
window.addEventListener("resize", () => layoutPill(false));
/* writing tools in the full screen bar: move (select), pen, highlight, eraser, lasso */
(function addPillTools() {
  const anchor = $("fsFit"), btns = [];
  const sep = document.createElement("span");
  sep.setAttribute("aria-hidden", "true");
  sep.style.cssText = "width:1px;height:24px;background:var(--line);margin:0 3px;flex:none;";
  fsPill.insertBefore(sep, anchor);
  for (const [tool, label] of [["hand", "Move and select"], ["pen", "Pen"], ["hl", "Highlighter"], ["eraser", "Eraser"], ["lasso", "Lasso"]]) {
    const src = document.querySelector('.tool[data-tool="' + tool + '"]');
    if (!src) continue;
    const b = document.createElement("button");
    b.type = "button"; b.className = "icon-btn"; b.dataset.fstool = tool;
    b.setAttribute("aria-label", label); b.title = label;
    const svg = src.querySelector("svg").cloneNode(true);
    svg.style.fill = "none";
    b.appendChild(svg);
    b.onclick = () => src.click();
    fsPill.insertBefore(b, anchor);
    btns.push([b, src]);
  }
  const sep2 = sep.cloneNode(); fsPill.insertBefore(sep2, anchor);
  const sync = () => btns.forEach(([b, src]) => {
    const on = src.getAttribute("aria-pressed") === "true";
    b.setAttribute("aria-pressed", String(on));
    b.style.background = on ? "var(--chip-on)" : "";
    b.style.color = on ? "var(--accent)" : "";
  });
  const mo = new MutationObserver(sync);
  btns.forEach(([, src]) => mo.observe(src, { attributes: true, attributeFilter: ["aria-pressed"] }));
  sync();
})();

/* ---------- full screen ---------- */
function nativeFsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
let fsRestore = null;
function capturePos() {
  const p = state.pages[(state.curPage || 1) - 1];
  if (!p) return null;
  return { zoom: state.zoom, n: p.n, offY: (viewer.scrollTop - p.wrap.offsetTop) / p.s, offX: (viewer.scrollLeft - p.wrap.offsetLeft) / p.s };
}
function restorePos(r) {
  const p = state.pages[r.n - 1];
  if (!p) return;
  if (state.viewMode === "single" && p.n !== state.curPage) showSingle(p.n);
  viewer.scrollTop = p.wrap.offsetTop + r.offY * p.s;
  viewer.scrollLeft = p.wrap.offsetLeft + r.offX * p.s;
  updateVisible();
}
function setFullscreen(on, byTap) {
  if (on === document.body.classList.contains("fullscreen")) return;
  if (on) fsRestore = capturePos();
  document.body.classList.toggle("fullscreen", on);
  document.body.classList.remove("fs-bars");
  clearTimeout(fsTapTimer);
  $("fsPill").hidden = !on;
  if (on) requestAnimationFrame(() => layoutPill(false));
  $("fsBtn").setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
  hidePop();
  const root = document.documentElement;
  try {
    if (on && !nativeFsElement()) {
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) { const r = req.call(root); if (r && r.catch) r.catch(() => {}); }
    } else if (!on && nativeFsElement()) {
      const ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { const r = ex.call(document); if (r && r.catch) r.catch(() => {}); }
    }
  } catch (e) {}
  setTimeout(() => {
    if (on) {
      if (byTap && state.zoom !== 1) state.zoom = 1;
      relayoutKeep();
    } else if (fsRestore) {
      const r = fsRestore; fsRestore = null;
      state.zoom = r.zoom;
      layout();
      restorePos(r);
      if (zoom.on) { sizeZoomWindow(false); zoomMoveTo(zoom.p, zoom.x, zoom.y); }
    } else relayoutKeep();
    renderToolbar();
  }, 60);
}
/* the full screen button sits at the right end of the tools bar, next to the zoom window button;
   in full screen the exit button shows its icon only */
$("zoomBoxBtn").after($("fsBtn"));
$("fsBtn").className = "tool";
$("fsExit").className = "icon-btn";
$("fsExit").lastChild.remove();
$("fsExit").setAttribute("aria-label", "Exit full screen"); $("fsExit").title = "Exit full screen";
$("fsBtn").onclick = () => setFullscreen(!document.body.classList.contains("fullscreen"));
$("fsExit").onclick = () => setFullscreen(false);
$("fsUndo").onclick = undo;
$("fsRedo").onclick = redo;
["fullscreenchange", "webkitfullscreenchange"].forEach((ev) => document.addEventListener(ev, () => {
  if (!nativeFsElement() && document.body.classList.contains("fullscreen")) setFullscreen(false);
  else setTimeout(relayoutKeep, 60);
}));
document.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("textarea, input")) return;
  if (e.key === "Escape" && document.body.classList.contains("fullscreen") && !nativeFsElement()) setFullscreen(false);
});

/* ---------- tabs (several files open) ---------- */
const tabs = { list: [], mem: {}, memOrder: [], skipStash: null };
try { tabs.list = (JSON.parse(localStorage.getItem("margin-tabs") || "[]") || []).filter((t) => t && t.id); } catch (e) {}
function saveTabs() { try { localStorage.setItem("margin-tabs", JSON.stringify(tabs.list.map((t) => ({ id: t.id, name: t.name })))); } catch (e) {} }
function stashTab() {
  if (!state.id || state.id === tabs.skipStash || !tabs.list.some((t) => t.id === state.id)) return;
  tabs.mem[state.id] = { ann: state.ann, undo: state.undo, redo: state.redo, bytes: state.bytes, pos: capturePos() };
  tabs.memOrder = tabs.memOrder.filter((x) => x !== state.id).concat(state.id);
  while (tabs.memOrder.length > 4) { const old = tabs.memOrder.shift(); delete tabs.mem[old]; }
}
function tabsAfterOpen(id, name, switching) {
  let t = tabs.list.find((x) => x.id === id);
  if (!t) {
    const prevIdx = switching ? tabs.list.findIndex((x) => x.id === tabs.prevId) : -1;
    t = { id, name };
    tabs.list.splice(prevIdx >= 0 ? prevIdx + 1 : tabs.list.length, 0, t);
  } else t.name = name;
  tabs.prevId = id;
  tabs.skipStash = null;
  saveTabs();
  renderTabs();
}
/* the file-name tabs under the toolbar can be hidden (button at the right of the strip, or View menu) */
let tabsHidden = false;
try { tabsHidden = localStorage.getItem("margin-tabs-hidden") === "1"; } catch (e) {}
const tabHide = document.createElement("button");
tabHide.type = "button"; tabHide.className = "tab-add"; tabHide.style.marginLeft = "auto";
tabHide.setAttribute("aria-label", "Hide file tabs"); tabHide.title = "Hide file tabs";
tabHide.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>';
$("tabStrip").appendChild(tabHide);
const tabsRow = document.createElement("button");
tabsRow.type = "button"; tabsRow.className = "icon-btn"; tabsRow.id = "tabsRowBtn";
tabsRow.setAttribute("aria-label", "Show file tabs"); tabsRow.title = "Show or hide file tabs";
tabsRow.innerHTML = '<svg viewBox="0 0 24 24" style="fill:none"><path d="M3 9.5h18v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 9.5V5.5a1 1 0 0 1 1-1h5.5l1.5 5"/><path d="M12.5 9.5l-1-3.5h5l1 3.5"/></svg>';
$("fitBtn").after(tabsRow);
function setTabsHidden(h) {
  tabsHidden = h;
  try { localStorage.setItem("margin-tabs-hidden", h ? "1" : "0"); } catch (e) {}
  renderTabs();
  relayoutKeep();
  if (h) toast("File tabs hidden. Tap the tabs button in the top bar to show them.", 3500);
}
tabHide.onclick = () => setTabsHidden(true);
tabsRow.onclick = () => setTabsHidden(!tabsHidden);
function renderTabs() {
  const strip = $("tabStrip"), box = $("tabs");
  tabsRow.setAttribute("aria-pressed", String(!tabsHidden));
  const show = tabs.list.length > 0 && !tabsHidden;
  strip.hidden = !show;
  document.body.classList.toggle("has-tabs", show);
  box.innerHTML = "";
  for (const t of tabs.list) {
    const el = document.createElement("div");
    el.className = "tab"; el.setAttribute("role", "tab"); el.tabIndex = 0;
    el.setAttribute("aria-selected", String(t.id === state.id));
    el.title = t.name;
    const nm = document.createElement("span"); nm.className = "tname"; nm.textContent = t.name;
    const x = document.createElement("span"); x.className = "tclose"; x.setAttribute("role", "button");
    x.setAttribute("aria-label", "Close " + t.name); x.tabIndex = 0;
    x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
    x.addEventListener("click", (e) => { e.stopPropagation(); closeTab(t.id); });
    x.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); closeTab(t.id); } });
    el.append(nm, x);
    el.addEventListener("click", () => switchTab(t.id));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchTab(t.id); } });
    el.addEventListener("auxclick", (e) => { if (e.button === 1) closeTab(t.id); });
    box.appendChild(el);
    if (t.id === state.id) requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", inline: "nearest" }));
  }
}
let switchingTab = false;
async function switchTab(id) {
  if (id === state.id || switchingTab) return;
  const t = tabs.list.find((x) => x.id === id);
  if (!t) return;
  switchingTab = true;
  try {
    const mem = tabs.mem[id];
    let bytes = mem && mem.bytes;
    if (!bytes) { const f = await DB.get("files", id); bytes = f && f.bytes; }
    if (!bytes) { toast("This file is no longer saved. Open it again from Files."); dropTab(id); return; }
    await openDoc(id, t.name, bytes);
  } finally { switchingTab = false; }
}
function dropTab(id) {
  tabs.list = tabs.list.filter((t) => t.id !== id);
  delete tabs.mem[id];
  tabs.memOrder = tabs.memOrder.filter((x) => x !== id);
  saveTabs(); renderTabs();
}
async function closeTab(id) {
  const i = tabs.list.findIndex((t) => t.id === id);
  if (i < 0) return;
  const wasActive = id === state.id;
  if (wasActive && textEdit) closeTextEdit();
  tabs.list.splice(i, 1);
  delete tabs.mem[id];
  tabs.memOrder = tabs.memOrder.filter((x) => x !== id);
  saveTabs();
  if (wasActive) {
    const next = tabs.list[i] || tabs.list[i - 1];
    tabs.skipStash = id;
    if (next) await switchTab(next.id);
    else closeCurrentDoc();
  }
  renderTabs();
}
function closeCurrentDoc() {
  if (zoom.on) zoomClose();
  if (imgSel.parentNode) deselectImage();
  if (state.pdf) { try { state.pdf.destroy(); } catch (e) {} }
  Object.assign(state, { id: null, name: "", bytes: null, pdf: null, pages: [], ann: {}, undo: [], redo: [], bookmarks: [], curPage: 1 });
  pagesEl.innerHTML = "";
  $("docTitle").textContent = "";
  document.title = "Margin";
  setThumbsDom();
  updateVisible();
  renderToolbar();
  showStatus("No file is open. Open one from the Library, or tap + to start a new tab.");
  try { localStorage.removeItem("margin-last"); } catch (e) {}
  openLibrary();
}
$("tabAdd").onclick = () => openFilesMenu($("tabAdd"));

/* ---------- recent files ---------- */
async function openSaved(m) {
  if (m.id === state.id) return true;
  const f = await DB.get("files", m.id);
  if (!f) { toast("This file is no longer saved. Open it again from Files."); return false; }
  return openDoc(m.id, m.name, f.bytes);
}
async function renderRecent() {
  const list = $("recentList");
  const metas = sortMetas(await DB.all("meta"), lib.sort);
  $("fmSort").value = sortKey(lib.sort);
  fillSizes(metas, renderRecent);
  list.innerHTML = "";
  if (!metas.length) { list.innerHTML = '<p class="panel-empty">No files yet.</p>'; return; }
  for (const m of metas) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "menu-item" + (m.id === state.id ? " current" : ""); b.setAttribute("role", "menuitem");
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg><span><b></b><small></small><small></small></span>';
    b.querySelector("b").textContent = m.name;
    const sms = b.querySelectorAll("small");
    sms[0].textContent = (m.pages || "?") + (m.pages === 1 ? " page" : " pages") + " · " + fmtSize(m.size) + " · Created " + fmtDate(m.added, true);
    sms[1].textContent = "Modified " + fmtDate(modOf(m));
    b.onclick = () => { hidePop(); openSaved(m); };
    list.appendChild(b);
  }
}
async function openFilesMenu(anchor) {
  if (openPop === $("filesPop")) { hidePop(); return; }
  await renderRecent();
  showPop($("filesPop"), anchor || $("filesBtn"));
}
$("filesBtn").onclick = () => openFilesMenu($("filesBtn"));
$("recentAll").onclick = () => { hidePop(); openLibrary(); };
