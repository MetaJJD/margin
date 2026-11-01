/* ---------- lasso: select written content and move it ---------- */
let lassoSel = null;
const lassoEl = document.createElement("div");
lassoEl.className = "lassosel";
lassoEl.innerHTML = '<div class="selbar"><button class="ldup" type="button">Duplicate</button><button class="imgdel ldel" type="button">Delete</button></div>';
const lDup = lassoEl.querySelector(".ldup"), lDel = lassoEl.querySelector(".ldel");
function drawLassoPath(ctx, p, scale) {
  const a = active;
  if (!a || a.tool !== "lasso" || a.p !== p || a.pts.length < 2) return;
  ctx.save();
  ctx.lineWidth = 1.6 / scale;
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.strokeStyle = "#2b55c9";
  ctx.fillStyle = "rgba(43,85,201,.06)";
  ctx.beginPath();
  ctx.moveTo(a.pts[0][0], a.pts[0][1]);
  for (let i = 1; i < a.pts.length; i++) ctx.lineTo(a.pts[i][0], a.pts[i][1]);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function itemBox(it) {
  if (it.type === "pen" || it.type === "hl") {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const q of it.pts) { x1 = Math.min(x1, q[0]); y1 = Math.min(y1, q[1]); x2 = Math.max(x2, q[0]); y2 = Math.max(y2, q[1]); }
    const r = it.w / 2;
    return { x1: x1 - r, y1: y1 - r, x2: x2 + r, y2: y2 + r };
  }
  if (it.type === "img") return { x1: it.x, y1: it.y, x2: it.x + it.w, y2: it.y + it.h };
  if (it.type === "note") { const b = boxOf(it); return { x1: it.x, y1: it.y, x2: it.x + b.w, y2: it.y + b.h }; }
  if (it.type === "text") {
    _tctx = _tctx || document.createElement("canvas").getContext("2d");
    const L = textLayout(_tctx, it);
    return { x1: it.x, y1: it.y, x2: it.x + it.w, y2: it.y + L.h };
  }
  return null;
}
function lassoPicks(it, poly) {
  if (it.type === "pen" || it.type === "hl") {
    let n = 0;
    for (const q of it.pts) if (inPoly(q[0], q[1], poly)) n++;
    return n / it.pts.length >= 0.5;
  }
  const b = itemBox(it);
  return !!b && inPoly((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, poly);
}
function finishLasso(a) {
  const p = a.p, poly = a.pts;
  drawInk(p);
  if (poly.length < 4) { renderToolbar(); return; }
  const items = (state.ann[p.n] || []).filter((it) => lassoPicks(it, poly));
  if (!items.length) { toast("Nothing inside the loop. Circle the writing you want to move.", 2600); renderToolbar(); return; }
  showLassoSel(p, items);
}
function showLassoSel(p, items) {
  lassoSel = { p, items };
  p.wrap.appendChild(lassoEl);
  updateLassoSel();
  renderToolbar();
}
function clearLassoSel() {
  if (!lassoSel) return;
  lassoSel = null;
  lassoEl.remove();
  if (state.tool === "lasso") renderToolbar();
}
function updateLassoSel() {
  if (!lassoSel) return;
  const { p } = lassoSel, list = state.ann[p.n] || [];
  lassoSel.items = lassoSel.items.filter((it) => list.includes(it));
  if (!lassoSel.items.length) { clearLassoSel(); return; }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const it of lassoSel.items) { const b = itemBox(it); if (!b) continue; x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1); x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2); }
  const pad = 6 / p.s;
  x1 -= pad; y1 -= pad; x2 += pad; y2 += pad;
  lassoEl.style.left = (x1 / p.w * 100) + "%";
  lassoEl.style.top = (y1 / p.h * 100) + "%";
  lassoEl.style.width = ((x2 - x1) / p.w * 100) + "%";
  lassoEl.style.height = ((y2 - y1) / p.h * 100) + "%";
  lassoEl.classList.toggle("bar-below", y1 * p.s < 50);
}
function translateItem(it, dx, dy) {
  if (it.type === "pen" || it.type === "hl") { for (const q of it.pts) { q[0] = round2(q[0] + dx); q[1] = round2(q[1] + dy); } }
  else { it.x = round2(it.x + dx); it.y = round2(it.y + dy); if (it._b) { it._b.x = it.x; it._b.y = it.y; } }
}
/* ---------- snap to align: pause while dragging near another object ---------- */
const snap = { ctx: null, timer: 0, x: 0, y: 0, guides: [], hideT: 0 };
function selectionBox(items) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const it of items) { const b = itemBox(it); if (!b) continue; x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1); x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2); }
  return isFinite(x1) ? { x1, y1, x2, y2 } : null;
}
function snapStart(ctx, e) { snap.ctx = ctx; snap.x = e.clientX; snap.y = e.clientY; clearGuides(); armSnap(); }
function armSnap() { clearTimeout(snap.timer); snap.timer = setTimeout(snapNow, 380); }
function snapMove(e) {
  if (!snap.ctx) return;
  if (Math.hypot(e.clientX - snap.x, e.clientY - snap.y) > 4) {
    snap.x = e.clientX; snap.y = e.clientY;
    if (snap.guides.length) clearGuides();
    armSnap();
  }
}
function snapEnd() {
  clearTimeout(snap.timer); snap.ctx = null;
  clearTimeout(snap.hideT); snap.hideT = setTimeout(clearGuides, 700);
}
/* nearest edge-to-edge or centre-to-centre alignment with a nearby object */
function findSnap(box, others, tol, near) {
  const xs = [box.x1, (box.x1 + box.x2) / 2, box.x2], ys = [box.y1, (box.y1 + box.y2) / 2, box.y2];
  let bx = null, by = null;
  for (const o of others) {
    const gapX = Math.max(0, o.x1 - box.x2, box.x1 - o.x2), gapY = Math.max(0, o.y1 - box.y2, box.y1 - o.y2);
    if (Math.hypot(gapX, gapY) > near) continue;
    const oxs = [o.x1, (o.x1 + o.x2) / 2, o.x2], oys = [o.y1, (o.y1 + o.y2) / 2, o.y2];
    for (let i = 0; i < 3; i++) {
      const dx = oxs[i] - xs[i], dy = oys[i] - ys[i];
      if (Math.abs(dx) <= tol && (!bx || Math.abs(dx) < Math.abs(bx.d))) bx = { d: dx, at: oxs[i], o };
      if (Math.abs(dy) <= tol && (!by || Math.abs(dy) < Math.abs(by.d))) by = { d: dy, at: oys[i], o };
    }
  }
  return { bx, by };
}
function snapNow() {
  const c = snap.ctx;
  if (!c) return;
  const box = c.box();
  if (!box) return;
  const p = c.p;
  const others = (state.ann[p.n] || []).filter((it) => !c.exclude.includes(it)).map(itemBox).filter(Boolean);
  const { bx, by } = findSnap(box, others, 16 / p.s, 150 / p.s);
  if (!bx && !by) return;
  const dx = bx ? bx.d : 0, dy = by ? by.d : 0;
  if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) c.move(dx, dy);
  const nb = { x1: box.x1 + dx, y1: box.y1 + dy, x2: box.x2 + dx, y2: box.y2 + dy };
  clearGuides();
  if (bx) addGuide(p, "v", bx.at, Math.min(nb.y1, bx.o.y1) - 6, Math.max(nb.y2, bx.o.y2) + 6);
  if (by) addGuide(p, "h", by.at, Math.min(nb.x1, by.o.x1) - 6, Math.max(nb.x2, by.o.x2) + 6);
}
function addGuide(p, dir, at, a, b) {
  const g = document.createElement("div");
  g.className = "snapguide " + dir;
  if (dir === "v") { g.style.left = (at / p.w * 100) + "%"; g.style.top = (a / p.h * 100) + "%"; g.style.height = ((b - a) / p.h * 100) + "%"; }
  else { g.style.top = (at / p.h * 100) + "%"; g.style.left = (a / p.w * 100) + "%"; g.style.width = ((b - a) / p.w * 100) + "%"; }
  p.wrap.appendChild(g);
  snap.guides.push(g);
}
function clearGuides() { snap.guides.forEach((g) => g.remove()); snap.guides = []; }

let lDrag = null;
lassoEl.addEventListener("pointerdown", (e) => {
  if (!lassoSel || e.target.closest("button")) return;
  e.preventDefault(); e.stopPropagation();
  try { lassoEl.setPointerCapture(e.pointerId); } catch (err) {}
  lDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ax: 0, ay: 0, snapX: 0, snapY: 0 };
  snapStart({
    p: lassoSel.p, exclude: lassoSel.items,
    box: () => selectionBox(lassoSel.items),
    move: (dx, dy) => {
      if (!lDrag || !lassoSel) return;
      lassoSel.items.forEach((it) => translateItem(it, dx, dy));
      lDrag.snapX += dx; lDrag.snapY += dy;
      updateLassoSel(); drawInk(lassoSel.p);
    }
  }, e);
});
lassoEl.addEventListener("pointermove", (e) => {
  if (!lDrag || e.pointerId !== lDrag.id || !lassoSel) return;
  e.preventDefault(); e.stopPropagation();
  const p = lassoSel.p;
  snapMove(e);
  const tx = (e.clientX - lDrag.sx) / p.s, ty = (e.clientY - lDrag.sy) / p.s;
  const dx = tx - lDrag.ax, dy = ty - lDrag.ay;
  lDrag.ax = tx; lDrag.ay = ty;
  lassoSel.items.forEach((it) => translateItem(it, dx, dy));
  updateLassoSel();
  if (!lDrag.raf) lDrag.raf = requestAnimationFrame(() => { if (lDrag) lDrag.raf = 0; drawInk(p); });
});
function lDragEnd(e) {
  if (!lDrag || e.pointerId !== lDrag.id) return;
  e.stopPropagation();
  const d = lDrag; lDrag = null;
  snapEnd();
  if (!lassoSel) return;
  const p = lassoSel.p;
  const mx = d.ax + d.snapX, my = d.ay + d.snapY;
  if (Math.abs(mx) > 0.01 || Math.abs(my) > 0.01) commit({ t: "move", n: p.n, items: lassoSel.items.slice(), dx: mx, dy: my });
  drawInk(p);
}
lassoEl.addEventListener("pointerup", lDragEnd);
lassoEl.addEventListener("pointercancel", lDragEnd);
for (const b of [lDup, lDel]) b.addEventListener("pointerdown", (e) => e.stopPropagation());
lDel.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!lassoSel) return;
  const { p, items } = lassoSel, list = state.ann[p.n] || [], before = list.slice();
  state.ann[p.n] = list.filter((it) => !items.includes(it));
  commit({ t: "set", n: p.n, before, after: state.ann[p.n].slice() });
  clearLassoSel(); drawInk(p);
  toast("Deleted. Undo brings it back.");
});
lDup.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!lassoSel) return;
  const { p, items } = lassoSel, list = (state.ann[p.n] = state.ann[p.n] || []), before = list.slice();
  const copies = items.map((it) => { const c = JSON.parse(JSON.stringify(Object.assign({}, it, { _b: undefined }))); translateItem(c, 14, 14); return c; });
  list.push(...copies);
  commit({ t: "set", n: p.n, before, after: list.slice() });
  drawInk(p);
  showLassoSel(p, copies);
});
document.addEventListener("keydown", (e) => {
  if (!lassoSel || (e.target.closest && e.target.closest("textarea, input"))) return;
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); lDel.click(); }
  else if (e.key === "Escape") clearLassoSel();
});

/* ---------- undo / redo ---------- */
function commit(op) { thumbDirty(op.n); state.undo.push(op); state.redo.length = 0; renderToolbar(); scheduleSave(); }
function apply(op, reverse) {
  thumbDirty(op.n);
  const list = (state.ann[op.n] = state.ann[op.n] || []);
  if (op.t === "add") {
    if (reverse) { const i = list.indexOf(op.item); if (i >= 0) list.splice(i, 1); } else list.push(op.item);
  } else if (op.t === "del") {
    if (reverse) op.items.slice().sort((a, b) => a.index - b.index).forEach((r) => list.splice(Math.min(r.index, list.length), 0, r.item));
    else op.items.forEach((r) => { const i = list.indexOf(r.item); if (i >= 0) list.splice(i, 1); });
  } else if (op.t === "move") {
    const k = reverse ? -1 : 1;
    op.items.forEach((it) => translateItem(it, k * op.dx, k * op.dy));
  } else if (op.t === "set") {
    state.ann[op.n] = (reverse ? op.before : op.after).slice();
  } else if (op.t === "edit") {
    Object.assign(op.item, reverse ? op.before : op.after);
  }
  const p = state.pages[op.n - 1];
  updateImgSel();
  updateLassoSel();
  if (p) { drawInk(p); if (state.viewMode === "single") { if (p.n !== state.curPage) showSingle(p.n); } else p.wrap.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  scheduleSave();
}
function undo() { if (textEdit) closeTextEdit(); const op = state.undo.pop(); if (!op) return; apply(op, true); state.redo.push(op); renderToolbar(); }
function redo() { if (textEdit) closeTextEdit(); const op = state.redo.pop(); if (!op) return; apply(op, false); state.undo.push(op); renderToolbar(); }
$("undoBtn").onclick = undo;
$("redoBtn").onclick = redo;
$("zUndo").onclick = undo;
$("zRedo").onclick = redo;

/* two-finger tap = undo, three-finger tap = redo */
let multi = null;
function mtStart(e) {
  const fingers = Array.from(e.touches).filter((t) => t.touchType !== "stylus");
  if (fingers.length < 2) { if (e.touches.length === 1) multi = null; return; }
  if (!multi) multi = { n: 0, t: Date.now(), starts: {}, moved: false };
  multi.n = Math.max(multi.n, fingers.length);
  for (const t of fingers) if (!(t.identifier in multi.starts)) multi.starts[t.identifier] = [t.clientX, t.clientY];
}
function mtMove(e) {
  if (!multi) return;
  for (const t of e.touches) {
    const s0 = multi.starts[t.identifier];
    if (s0 && Math.hypot(t.clientX - s0[0], t.clientY - s0[1]) > 14) multi.moved = true;
  }
}
function mtEnd(e) {
  if (!multi || e.touches.length) return;
  const m = multi; multi = null;
  if (m.moved || Date.now() - m.t > 380) return;
  if (m.n === 2) { if (state.undo.length) { undo(); toast("Undone"); } }
  else if (m.n >= 3) { if (state.redo.length) { redo(); toast("Redone"); } }
}
for (const el of [viewer, zBody]) {
  el.addEventListener("touchstart", mtStart, { passive: true });
  el.addEventListener("touchmove", mtMove, { passive: true });
  el.addEventListener("touchend", mtEnd, { passive: true });
  el.addEventListener("touchcancel", () => { multi = null; }, { passive: true });
}
document.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("textarea, input")) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); openPanel("search"); return; }
  if (!mod && (e.key === "ArrowRight" || e.key === "PageDown") && state.viewMode !== "vertical") { e.preventDefault(); pageStep(1); return; }
  if (!mod && (e.key === "ArrowLeft" || e.key === "PageUp") && state.viewMode !== "vertical") { e.preventDefault(); pageStep(-1); return; }
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
  else if (!mod && !e.altKey) {
    const map = { h: "hand", p: "pen", m: "hl", e: "eraser", n: "note", t: "text", l: "lasso" };
    if (map[e.key]) { state.tool = map[e.key]; savePrefs(); renderToolbar(); }
  }
});

/* ---------- note editor ---------- */
let editing = null;
function openNoteEditor(p, item, pt) {
  editing = { p, item, pt, color: item ? item.color : state.noteColor };
  $("noteTitle").textContent = item ? "Edit note" : "New note";
  $("noteText").value = item ? item.text : "";
  $("noteDelete").hidden = !item;
  renderNoteColors();
  $("noteSheet").hidden = false;
  setTimeout(() => $("noteText").focus(), 30);
}
function renderNoteColors() {
  const box = $("noteColors"); box.innerHTML = "";
  buildSwatches(box, "noteColor", NOTE_COLORS, editing.color, (c) => { editing.color = c; renderNoteColors(); });
}
function closeNote() { $("noteSheet").hidden = true; editing = null; }
$("noteCancel").onclick = closeNote;
$("noteSheet").addEventListener("pointerdown", (e) => { if (e.target === $("noteSheet")) closeNote(); });
$("noteSave").onclick = () => {
  if (!editing) return;
  const text = $("noteText").value.replace(/\s+$/, "");
  const { p, item, pt, color } = editing;
  if (item) {
    if (!text) { removeNote(p, item); closeNote(); return; }
    const before = { text: item.text, color: item.color };
    item.text = text; item.color = color;
    commit({ t: "edit", n: p.n, item, before, after: { text, color } });
  } else if (text) {
    state.noteColor = color; savePrefs();
    const it = { type: "note", x: round2(Math.min(pt[0], p.w - 60)), y: round2(Math.min(pt[1], p.h - 30)), text, color };
    (state.ann[p.n] = state.ann[p.n] || []).push(it);
    commit({ t: "add", n: p.n, item: it });
  }
  drawInk(p); closeNote();
};
$("noteDelete").onclick = () => { if (editing && editing.item) removeNote(editing.p, editing.item); closeNote(); };
function removeNote(p, item) {
  const list = state.ann[p.n] || [], i = list.indexOf(item);
  if (i >= 0) { list.splice(i, 1); commit({ t: "del", n: p.n, items: [{ item, index: i }] }); drawInk(p); }
}

/* ---------- library ---------- */
const lib = { folder: "all", sort: "recent", q: "", actionsFor: null, newFolder: false, renaming: false, assignNext: null };
try { const v = JSON.parse(localStorage.getItem("margin-lib") || "{}"); if (v.folder) lib.folder = v.folder; if (v.sort) lib.sort = v.sort; } catch (e) {}
function saveLib() { try { localStorage.setItem("margin-lib", JSON.stringify({ folder: lib.folder, sort: lib.sort })); } catch (e) {} }
function storedFolders() { try { return JSON.parse(localStorage.getItem("margin-folders") || "[]") || []; } catch (e) { return []; } }
function saveFolders(list) { try { localStorage.setItem("margin-folders", JSON.stringify(list)); } catch (e) {} }
async function makeCoverThumb(pdf) {
  try {
    const page = await pdf.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 120 / vp1.width });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const url = c.toDataURL("image/jpeg", 0.72);
    c.width = 0;
    return url;
  } catch (e) { return null; }
}
function renameDoc(m, name) {
  name = name.trim();
  if (!name || name === m.name) return;
  m.name = name;
  DB.put("meta", m);
  const t = tabs.list.find((x) => x.id === m.id);
  if (t) { t.name = name; saveTabs(); renderTabs(); }
  if (state.id === m.id) { state.name = name; $("docTitle").textContent = name; document.title = name + " · Margin"; }
}
async function deleteDoc(m) {
  await trashDoc(m);
  if (m.id !== state.id) dropTab(m.id);
  toast("Moved “" + m.name + "” to Recently Deleted. You can bring it back for 30 days.", 4500);
  if (m.id === state.id) { tabs.skipStash = m.id; dropTab(m.id); const next = tabs.list[0]; if (next) await switchTab(next.id); else await openMostRecent(); }
}
const FSEP = "/";
const parentOf = (fd) => (fd.indexOf(FSEP) >= 0 ? fd.slice(0, fd.lastIndexOf(FSEP)) : null);
const leafOf = (fd) => fd.slice(fd.lastIndexOf(FSEP) + 1);
const inTree = (fd, root) => !!fd && (fd === root || fd.indexOf(root + FSEP) === 0);
const showPath = (fd) => String(fd).split(FSEP).join(" › ");
const cleanFolderName = (n) => String(n || "").replace(/\//g, "-").trim();
function chip(label, count, pressed, onClick, extraClass) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip" + (extraClass ? " " + extraClass : "");
  b.setAttribute("aria-pressed", String(!!pressed));
  b.append(label);
  if (count != null) { const c = document.createElement("span"); c.className = "chip-n"; c.textContent = count; b.appendChild(c); }
  b.onclick = onClick;
  return b;
}