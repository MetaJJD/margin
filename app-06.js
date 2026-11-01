/* ---------- photos ---------- */
const imgCache = new Map();
function getImg(src) {
  let im = imgCache.get(src);
  if (!im) {
    im = new Image();
    im.onload = () => { for (const p of state.pages) if (p.near && (state.ann[p.n] || []).some((i) => i.src === src)) drawInk(p); };
    im.src = src;
    imgCache.set(src, im);
  }
  return im;
}
function imageAt(p, pt) {
  const items = state.ann[p.n] || [];
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type === "img" && pt[0] >= it.x && pt[0] <= it.x + it.w && pt[1] >= it.y && pt[1] <= it.y + it.h) return it;
  }
  return null;
}
const imgSel = document.createElement("div");
imgSel.className = "imgsel";
imgSel.innerHTML = '<div class="selbar"><button class="seledit" type="button">Edit note</button><button class="imgdel" type="button">Delete photo</button></div><div class="zgrip" aria-hidden="true"></div>';
const imgDel = imgSel.querySelector(".imgdel"), selEdit = imgSel.querySelector(".seledit"), imgGrip = imgSel.querySelector(".zgrip");
let sel = null, imgDrag = null;
function boxOf(item) {
  if (item.type === "note") {
    if (!item._b) { const c = document.createElement("canvas").getContext("2d"); const L = noteLayout(c, item.text); item._b = { x: item.x, y: item.y, w: L.w, h: L.h }; }
    return { w: item._b.w, h: item._b.h };
  }
  return { w: item.w, h: item.h };
}
function selectImage(p, item) {
  sel = { p, item };
  const isNote = item.type === "note";
  imgDel.textContent = isNote ? "Delete note" : "Delete photo";
  selEdit.hidden = !isNote;
  imgGrip.hidden = isNote;
  imgSel.classList.toggle("is-note", isNote);
  p.wrap.appendChild(imgSel);
  updateImgSel();
}
selEdit.addEventListener("pointerdown", (e) => e.stopPropagation());
selEdit.addEventListener("click", (e) => { e.stopPropagation(); if (!sel) return; const { p, item } = sel; deselectImage(); openNoteEditor(p, item, [item.x, item.y]); });
function deselectImage() { sel = null; imgSel.remove(); }
function updateImgSel() {
  if (!sel) return;
  const { p, item } = sel;
  if (!(state.ann[p.n] || []).includes(item)) { deselectImage(); return; }
  imgSel.style.left = (item.x / p.w * 100) + "%";
  imgSel.style.top = (item.y / p.h * 100) + "%";
  const bx = boxOf(item);
  imgSel.style.width = (bx.w / p.w * 100) + "%";
  imgSel.style.height = (bx.h / p.h * 100) + "%";
  imgSel.classList.toggle("bar-below", item.y * p.s < 50);
}
imgDel.addEventListener("pointerdown", (e) => e.stopPropagation());
imgDel.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!sel) return;
  const { p, item } = sel, list = state.ann[p.n] || [], i = list.indexOf(item);
  deselectImage();
  if (i >= 0) { list.splice(i, 1); commit({ t: "del", n: p.n, items: [{ item, index: i }] }); drawInk(p); toast((item.type === "note" ? "Note" : "Photo") + " deleted. Undo brings it back."); }
});
imgSel.addEventListener("pointerdown", (e) => {
  if (!sel || e.target.closest("button")) return;
  e.stopPropagation(); e.preventDefault();
  try { imgSel.setPointerCapture(e.pointerId); } catch (err) {}
  const it = sel.item, bx = boxOf(it);
  imgDrag = { id: e.pointerId, size: e.target === imgGrip && it.type === "img", sx: e.clientX, sy: e.clientY, bw: bx.w, bh: bx.h, before: it.type === "img" ? { x: it.x, y: it.y, w: it.w, h: it.h } : { x: it.x, y: it.y } };
});
imgSel.addEventListener("pointermove", (e) => {
  if (!imgDrag || e.pointerId !== imgDrag.id) return;
  e.stopPropagation(); e.preventDefault();
  const { p, item } = sel, b = imgDrag.before;
  const dx = (e.clientX - imgDrag.sx) / p.s, dy = (e.clientY - imgDrag.sy) / p.s;
  if (imgDrag.size) {
    const ar = b.h / b.w;
    const w = Math.max(24, Math.min(p.w - b.x, b.w + dx));
    item.w = round2(Math.min(w, (p.h - b.y) / ar)); item.h = round2(item.w * ar);
  } else {
    const bw = imgDrag.bw, bh = imgDrag.bh;
    if (item.type === "note") {
      item.x = round2(Math.max(0, Math.min(p.w - Math.min(bw, p.w), b.x + dx)));
      item.y = round2(Math.max(0, Math.min(p.h - Math.min(bh, p.h), b.y + dy)));
    } else {
      item.x = round2(Math.max(-bw * 0.8, Math.min(p.w - bw * 0.2, b.x + dx)));
      item.y = round2(Math.max(-bh * 0.8, Math.min(p.h - bh * 0.2, b.y + dy)));
    }
  }
  updateImgSel();
  if (!imgDrag.raf) imgDrag.raf = requestAnimationFrame(() => { if (imgDrag) imgDrag.raf = 0; drawInk(p); });
});
function imgDragEnd(e) {
  if (!imgDrag || e.pointerId !== imgDrag.id) return;
  e.stopPropagation();
  const d = imgDrag; imgDrag = null;
  if (!sel) return;
  const { p, item } = sel, b = d.before;
  const after = item.type === "img" ? { x: item.x, y: item.y, w: item.w, h: item.h } : { x: item.x, y: item.y };
  if (after.x !== b.x || after.y !== b.y || after.w !== b.w) commit({ t: "edit", n: p.n, item, before: b, after });
  drawInk(p);
}
imgSel.addEventListener("pointerup", imgDragEnd);
imgSel.addEventListener("pointercancel", imgDragEnd);

$("photoBtn").onclick = () => {
  if (!state.pages.length) { toast("Open a PDF first."); return; }
  $("photoInput").click();
};
$("photoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  try { await addPhoto(file); }
  catch (err) { toast("This photo couldn't be added. Try a JPEG or PNG image.", 5000); }
});
function loadImageFile(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("decode")); };
    im.src = url;
  });
}
async function addPhoto(file) {
  const im = await loadImageFile(file);
  const MAX = 1800;
  const r = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(im.naturalWidth * r)); c.height = Math.max(1, Math.round(im.naturalHeight * r));
  const ctx = c.getContext("2d");
  const png = file.type === "image/png" || file.type === "image/gif";
  if (!png) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(im, 0, 0, c.width, c.height);
  const src = png ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.86);
  c.width = 0;
  const p = state.pages[(state.curPage || 1) - 1];
  const ar = im.naturalHeight / im.naturalWidth;
  let w = p.w * 0.6, h = w * ar;
  if (h > p.h * 0.6) { h = p.h * 0.6; w = h / ar; }
  const vr = viewer.getBoundingClientRect(), pr = p.wrap.getBoundingClientRect();
  let cx = ((vr.left + vr.right) / 2 - pr.left) / p.s, cy = ((vr.top + vr.bottom) / 2 - pr.top) / p.s;
  cx = Math.max(w / 2, Math.min(p.w - w / 2, cx)); cy = Math.max(h / 2, Math.min(p.h - h / 2, cy));
  const item = { type: "img", src, x: round2(cx - w / 2), y: round2(cy - h / 2), w: round2(w), h: round2(h) };
  (state.ann[p.n] = state.ann[p.n] || []).push(item);
  commit({ t: "add", n: p.n, item });
  getImg(src);
  drawInk(p);
  selectImage(p, item);
  toast("Drag the photo to move it. Drag the round corner to resize it. Tap outside when done.", 5000);
}

/* ---------- underline and strikethrough, snapped to the text ---------- */
async function finishMark(a) {
  const p = a.p, P = a.item.pts;
  const lines = await markLines(p, P, a.markStyle);
  const list = (state.ann[p.n] = state.ann[p.n] || []);
  const before = list.slice();
  if (lines.length) {
    for (const ln of lines) list.push({ type: "pen", color: a.item.color, w: ln.w, pts: [[round2(ln.x1), round2(ln.y), 0.65], [round2(ln.x2), round2(ln.y), 0.65]] });
  } else if (P.length > 1) {
    let y = 0; for (const q of P) y += q[1]; y /= P.length;
    const xs = P.map((q) => q[0]), x1 = Math.min(...xs), x2 = Math.max(...xs);
    if (x2 - x1 > 3) list.push({ type: "pen", color: a.item.color, w: 1.4, pts: [[round2(x1), round2(y), 0.65], [round2(x2), round2(y), 0.65]] });
  }
  if (list.length !== before.length) commit({ t: "set", n: p.n, before, after: list.slice() });
  else if (!lines.length) toast("No text found under that stroke. Drag across the words you want to mark.", 3000);
  drawInk(p);
}
async function markLines(p, P, style) {
  const t = await pageText(p);
  const segs = [];
  t.items.forEach((it) => {
    if (typeof it.str !== "string" || !it.str.trim() || !it.width) return;
    const tx = pdfjsLib.Util.transform(p.vp.transform, it.transform);
    if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) return;
    const fh = Math.abs(tx[3]) || Math.hypot(tx[2], tx[3]) || 10;
    const x0 = tx[4], base = tx[5], w = it.width * p.vp.scale;
    const top = base - fh * 1.0, bot = base + fh * 0.45;
    let ax = Infinity, bx = -Infinity;
    for (const q of P) {
      if (q[1] >= top && q[1] <= bot && q[0] >= x0 - 2 && q[0] <= x0 + w + 2) { ax = Math.min(ax, q[0]); bx = Math.max(bx, q[0]); }
    }
    if (ax > bx) return;
    const L = it.str.length, cw = w / L;
    let i0 = Math.max(0, Math.min(L, Math.floor((ax - x0) / cw + 0.35)));
    let i1 = Math.max(0, Math.min(L, Math.ceil((bx - x0) / cw - 0.35)));
    while (i0 < i1 && it.str[i0] === " ") i0++;
    while (i1 > i0 && it.str[i1 - 1] === " ") i1--;
    if (i1 <= i0) return;
    segs.push({ x1: x0 + i0 * cw, x2: x0 + i1 * cw, base, fh });
  });
  segs.sort((a, b) => a.base - b.base || a.x1 - b.x1);
  const lines = [];
  for (const sg of segs) {
    const ln = lines.find((l) => Math.abs(l.base - sg.base) < sg.fh * 0.3);
    if (ln && sg.x1 - ln.x2 < sg.fh * 0.9) { ln.x2 = Math.max(ln.x2, sg.x2); ln.x1 = Math.min(ln.x1, sg.x1); ln.fh = Math.max(ln.fh, sg.fh); }
    else lines.push({ x1: sg.x1, x2: sg.x2, base: sg.base, fh: sg.fh });
  }
  return lines.map((l) => ({
    x1: l.x1, x2: l.x2,
    y: style === "ul" ? l.base + l.fh * 0.13 : l.base - l.fh * 0.3,
    w: Math.max(0.7, Math.min(2.4, l.fh * 0.075))
  }));
}

/* ---------- partial eraser ---------- */
const eCursor = document.createElement("div");
eCursor.className = "ecursor"; eCursor.hidden = true;
document.body.appendChild(eCursor);
function showEraserCursor(x, y) {
  const d = ERASER_PX[state.eraserSize] * 2;
  eCursor.style.width = eCursor.style.height = d + "px";
  eCursor.style.left = x + "px"; eCursor.style.top = y + "px";
  eCursor.hidden = false;
}
function hideEraserCursor() { eCursor.hidden = true; }
function densify(P, step) {
  const out = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(d / step);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.push([round2(a[0] + (b[0] - a[0]) * t), round2(a[1] + (b[1] - a[1]) * t), Math.round((a[2] + (b[2] - a[2]) * t) * 100) / 100]);
    }
    out.push(b);
  }
  return out;
}
function erasePartial(pt) {
  const p = active.p, list = state.ann[p.n] || [];
  const r = ERASER_PX[state.eraserSize] / active.scale;
  let changed = false;
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    if (it.type !== "pen" && it.type !== "hl") continue;
    const rr = r + it.w * 0.35;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const q of it.pts) { if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0]; if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; }
    if (pt[0] < minX - rr || pt[0] > maxX + rr || pt[1] < minY - rr || pt[1] > maxY + rr) continue;
    const P = densify(it.pts, Math.max(0.4, r * 0.4));
    const pieces = []; let cur = []; let hit = false;
    for (const q of P) {
      if (Math.hypot(q[0] - pt[0], q[1] - pt[1]) < rr) { hit = true; if (cur.length) pieces.push(cur); cur = []; }
      else cur.push(q);
    }
    if (cur.length) pieces.push(cur);
    if (!hit) continue;
    const repl = pieces.filter((a) => a.length >= 2).map((a) => ({ type: it.type, color: it.color, w: it.w, pts: a }));
    list.splice(i, 1, ...repl);
    changed = true;
  }
  if (changed) { state.ann[p.n] = list; active.changed = true; drawInk(p); }
}

/* ---------- press and hold the Pencil: quick tool palette ---------- */
let lp = null;
function armLongPress(e) {
  cancelLongPress();
  lp = { id: e.pointerId, x: e.clientX, y: e.clientY };
  lp.timer = setTimeout(fireLongPress, 520);
}
function cancelLongPress() { if (lp) { clearTimeout(lp.timer); lp = null; } }
function fireLongPress() {
  if (!lp) return;
  const { x, y } = lp; lp = null;
  if (active) {
    const a = active; active = null;
    clearTimeout(holdTimer);
    document.body.classList.remove("drawing");
    hideEraserCursor();
    if (a.tool === "eraser") {
      if (a.partial && a.changed) commit({ t: "set", n: a.p.n, before: a.before, after: (state.ann[a.p.n] || []).slice() });
      else if (!a.partial && a.removed.length) commit({ t: "del", n: a.p.n, items: a.removed });
    }
    drawInk(a.p);
  }
  tap = null;
  showQuickPal(x, y);
}
const quickPal = $("quickPal");
const QP_TOOLS = [["pen", "Pen"], ["hl", "Highlight"], ["eraser", "Eraser"], ["lasso", "Lasso"], ["text", "Text"], ["note", "Note"], ["hand", "Select"]];
function renderQuickPal() {
  quickPal.innerHTML = "";
  const tools = document.createElement("div");
  tools.className = "qtools"; tools.setAttribute("role", "group"); tools.setAttribute("aria-label", "Tools");
  for (const [t, label] of QP_TOOLS) {
    const b = document.createElement("button");
    b.type = "button"; b.title = label; b.setAttribute("aria-label", label);
    b.setAttribute("aria-pressed", String(state.tool === t));
    const icon = document.querySelector('.tool[data-tool="' + t + '"] svg');
    if (icon) b.appendChild(icon.cloneNode(true));
    b.onclick = () => { if (textEdit) closeTextEdit(); state.tool = t; savePrefs(); renderToolbar(); renderQuickPal(); };
    tools.appendChild(b);
  }
  quickPal.appendChild(tools);
  const opts = document.createElement("div");
  opts.className = "qopts";
  let colors = null, cur = null, key = null, sizes = null, sizeKey = null;
  if (state.tool === "pen") { colors = PEN_COLORS; cur = state.penColor; key = "penColor"; sizes = [4, 7, 11]; sizeKey = "penSize"; }
  else if (state.tool === "hl") {
    if (state.hlStyle === "marker") { colors = HL_COLORS; cur = state.hlColor; key = "hlColor"; sizes = [8, 12, 17]; sizeKey = "hlSize"; }
    else { colors = MARK_COLORS; cur = state.markColor; key = "markColor"; }
  } else if (state.tool === "text") { colors = PEN_COLORS; cur = state.textColor; key = "textColor"; }
  else if (state.tool === "note") { colors = NOTE_COLORS; cur = state.noteColor; key = "noteColor"; }
  if (colors) buildSwatches(opts, key, colors, cur, (c) => { state[key] = c; savePrefs(); renderToolbar(); hideQuickPal(); });
  if (sizes) sizes.forEach((d, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "size"; b.setAttribute("aria-label", ["Thin", "Medium", "Thick"][i]);
    b.setAttribute("aria-pressed", String(state[sizeKey] === i));
    const dot = document.createElement("i");
    dot.style.width = dot.style.height = d + "px";
    if (state.tool === "hl") { dot.style.background = state.hlColor; dot.style.borderRadius = "3px"; }
    b.appendChild(dot);
    b.onclick = () => { state[sizeKey] = i; savePrefs(); renderToolbar(); renderQuickPal(); };
    opts.appendChild(b);
  });
  if (state.tool === "eraser") [["stroke", "Erase whole strokes"], ["partial", "Erase part of a stroke"]].forEach(([v, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn qicon"; b.innerHTML = iconSvg(ERASE_ICONS[v]); b.title = label; b.setAttribute("aria-label", label);
    if (state.eraserMode === v) { b.classList.add("primary"); }
    b.onclick = () => { state.eraserMode = v; savePrefs(); renderToolbar(); hideQuickPal(); };
    opts.appendChild(b);
  });
  if (state.tool === "hand") { const h = document.createElement("span"); h.className = "qhint"; h.textContent = "Tap notes, text and photos to select them."; opts.appendChild(h); }
  quickPal.appendChild(opts);
}
function showQuickPal(x, y) {
  renderQuickPal();
  quickPal.hidden = false;
  const w = quickPal.offsetWidth, h = quickPal.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  let left = x - w / 2, top = y - h - 28;
  if (top < 8) top = y + 28;
  left = Math.max(8, Math.min(vw - w - 8, left));
  top = Math.max(8, Math.min(vh - h - 8, top));
  quickPal.style.left = left + "px"; quickPal.style.top = top + "px";
}
function hideQuickPal() { quickPal.hidden = true; }
document.addEventListener("pointerdown", (e) => { if (!quickPal.hidden && !quickPal.contains(e.target)) hideQuickPal(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideQuickPal(); });
