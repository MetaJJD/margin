/* ---------- zoom window ---------- */
const zoom = { on: false, p: null, x: 0, y: 0, w: 200, h: 60, K: 1, dpr: 1, lineX: 0, winW: 0, winH: 0, left: null, top: null };
const zWin = $("zWin"), zBody = $("zBody"), zPdf = $("zPdf"), zInk = $("zInk");
const zBox = document.createElement("div");
zBox.className = "zbox";
zBox.innerHTML = '<div class="zgrip" aria-hidden="true"></div>';
const zGrip = zBox.firstChild;

function zoomOpen() {
  if (!state.pages.length) { toast("Open a PDF first."); return; }
  const p = state.pages[(state.curPage || 1) - 1];
  zoom.on = true;
  zWin.hidden = false;
  sizeZoomWindow(true);
  zoom.dock = "bottom";
  sizeZoomWindow(false);
  const w = p.w * 0.42;
  const startY = (viewer.scrollTop + 60 - p.wrap.offsetTop) / p.s;
  zoomMoveTo(p, p.w * 0.08, Math.max(p.h * 0.06, startY), w);
  zoom.lineX = zoom.x;
  applyDockMargins();
  relayoutKeep();
  renderToolbar();
  toast("Write in the zoom window. Drag the blue box or tap the page to move it. Drag the window's top bar to float it.", 4500);
}
function zoomClose() {
  const wasDocked = !!zoom.dock;
  zoom.on = false; zoom.dock = null;
  zWin.hidden = true;
  zBox.remove();
  applyDockMargins();
  if (wasDocked) relayoutKeep();
  renderToolbar();
}
const Z_HEAD = 47, DOCK_SNAP = 28;
function safeBottom() { return parseFloat(getComputedStyle(document.documentElement).paddingBottom) || 0; }
function stageTop() { return $("stage").getBoundingClientRect().top; }
function detectDock(top) {
  const total = zoom.winH + Z_HEAD;
  if (top <= stageTop() + DOCK_SNAP) return "top";
  if (top + total >= window.innerHeight - safeBottom() - DOCK_SNAP) return "bottom";
  return null;
}
function sizeZoomWindow(reset) {
  const vw = window.innerWidth, vh = window.innerHeight;
  if (reset || !zoom.winW) {
    zoom.winW = Math.min(vw - 32, 920);
    zoom.winH = Math.round(Math.min(300, Math.max(160, vh * 0.3)));
    zoom.dock = null; zoom.left = null;
  }
  zoom.winW = Math.max(220, Math.min(vw - 16, zoom.winW));
  zoom.winH = Math.max(110, Math.min(vh * 0.6, zoom.winH));
  zoom.bodyW = zoom.dock ? vw : zoom.winW;
  zBody.style.width = zoom.bodyW + "px";
  zBody.style.height = zoom.winH + "px";
  zoom.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.round(zoom.bodyW * zoom.dpr), ch = Math.round(zoom.winH * zoom.dpr);
  for (const c of [zPdf, zInk]) if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  if (zoom.left == null) {
    zoom.left = Math.round((vw - zoom.winW) / 2);
    zoom.top = Math.round(vh - zoom.winH - Z_HEAD - 40 - safeBottom());
  }
  zWin.classList.toggle("docked", !!zoom.dock);
  if (zoom.dock === "top") { zWin.style.left = "0px"; zWin.style.top = stageTop() + "px"; }
  else if (zoom.dock === "bottom") { zWin.style.left = "0px"; zWin.style.top = (vh - safeBottom() - zoom.winH - Z_HEAD) + "px"; }
  else {
    zoom.left = Math.max(4, Math.min(vw - zoom.winW - 4, zoom.left));
    zoom.top = Math.max(4, Math.min(vh - zoom.winH - Z_HEAD - 4, zoom.top));
    zWin.style.left = zoom.left + "px";
    zWin.style.top = zoom.top + "px";
  }
}
function applyDockMargins() {
  const total = (zoom.on && zoom.dock) ? (zoom.winH + Z_HEAD) + "px" : "";
  viewer.style.marginTop = zoom.on && zoom.dock === "top" ? total : "";
  viewer.style.marginBottom = zoom.on && zoom.dock === "bottom" ? total : "";
}
function zoomMoveTo(p, x, y, w) {
  if (zoom.p !== p || !zBox.parentNode) { zoom.p = p; p.wrap.appendChild(zBox); }
  if (w != null) zoom.w = Math.max(24, Math.min(p.w, w));
  zoom.K = zoom.bodyW / zoom.w;
  zoom.h = zoom.winH / zoom.K;
  if (zoom.h > p.h) { zoom.h = p.h; zoom.K = zoom.winH / zoom.h; zoom.w = zoom.bodyW / zoom.K; }
  zoom.x = Math.max(0, Math.min(p.w - zoom.w, x));
  zoom.y = Math.max(0, Math.min(p.h - zoom.h, y));
  zBox.style.left = (zoom.x / p.w * 100) + "%";
  zBox.style.top = (zoom.y / p.h * 100) + "%";
  zBox.style.width = (zoom.w / p.w * 100) + "%";
  zBox.style.height = (zoom.h / p.h * 100) + "%";
  $("zLabel").textContent = "Page " + p.n + " · " + Math.round(zoom.K / Math.max(0.01, p.s) * 100) + "%";
  refreshZoom();
}
function zoomPlaceAt(p, pt) {
  zoomMoveTo(p, pt[0] - zoom.w * 0.1, pt[1] - zoom.h / 2);
  zoom.lineX = zoom.x;
}
function ensureBoxVisible() {
  const p = zoom.p; if (!p) return;
  const top = p.wrap.offsetTop + zoom.y * p.s, bottom = top + zoom.h * p.s;
  const visTop = viewer.scrollTop + 10;
  const visBottom = viewer.scrollTop + Math.max(120, Math.min(viewer.clientHeight, zoom.top - viewer.getBoundingClientRect().top) - 10);
  if (top < visTop || bottom > visBottom) viewer.scrollTop = Math.max(0, top - 40);
  const left = p.wrap.offsetLeft + zoom.x * p.s, right = left + zoom.w * p.s;
  if (left < viewer.scrollLeft || right > viewer.scrollLeft + viewer.clientWidth) viewer.scrollLeft = Math.max(0, left - 20);
}
function zoomStep(dir) {
  const p = zoom.p; if (!p) return;
  if (dir > 0) {
    if (zoom.x + zoom.w >= p.w - 1) return zoomNewLine();
    zoomMoveTo(p, zoom.x + zoom.w * 0.75, zoom.y);
  } else {
    if (zoom.x <= 0.5) return;
    zoomMoveTo(p, zoom.x - zoom.w * 0.75, zoom.y);
  }
  ensureBoxVisible();
}
function zoomNewLine() {
  let p = zoom.p; if (!p) return;
  let y = zoom.y + zoom.h;
  if (y + zoom.h > p.h + 0.5) {
    const next = state.pages[p.n];
    if (!next) { toast("This is the last page. Use Add page for more room."); return; }
    p = next; y = p.h * 0.06;
    if (state.viewMode === "single") showSingle(p.n);
  }
  zoomMoveTo(p, zoom.lineX, y);
  ensureBoxVisible();
}
$("zLeft").onclick = () => zoomStep(-1);
$("zRight").onclick = () => zoomStep(1);
$("zNewLine").onclick = zoomNewLine;
$("zClose").onclick = zoomClose;
$("zoomBoxBtn").onclick = () => (zoom.on ? zoomClose() : zoomOpen());
$("fsZoom").onclick = () => { zoom.on ? zoomClose() : zoomOpen(); renderToolbar(); };

let zTimer = null, zSeq = 0, zTask = null;
function refreshZoom() {
  if (!zoom.on) return;
  drawZoomPreview();
  drawZoomInk();
  clearTimeout(zTimer);
  zTimer = setTimeout(renderZoomPdf, 120);
}
function drawZoomPreview() {
  const p = zoom.p, ctx = zPdf.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, zPdf.width, zPdf.height);
  const c = p.pdfCanvas;
  if (!c || !c.width) return;
  const r = c.width / p.w;
  ctx.drawImage(c, zoom.x * r, zoom.y * r, zoom.w * r, zoom.h * r, 0, 0, zPdf.width, zPdf.height);
}
async function renderZoomPdf() {
  if (!zoom.on) return;
  const seq = ++zSeq, p = zoom.p, k = zoom.K * zoom.dpr;
  if (zTask) { try { zTask.cancel(); } catch (e) {} }
  const vp = p.page.getViewport({ scale: k, offsetX: -zoom.x * k, offsetY: -zoom.y * k });
  const c = document.createElement("canvas");
  c.width = zPdf.width; c.height = zPdf.height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
  zTask = p.page.render({ canvasContext: ctx, viewport: vp });
  try { await zTask.promise; } catch (e) { c.width = 0; return; }
  if (seq !== zSeq || !zoom.on) { c.width = 0; return; }
  const out = zPdf.getContext("2d");
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.drawImage(c, 0, 0);
  c.width = 0;
}
function drawZoomInk(live) {
  if (!zoom.on || !zoom.p) return;
  const ctx = zInk.getContext("2d"), k = zoom.K * zoom.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, zInk.width, zInk.height);
  ctx.setTransform(k, 0, 0, k, -zoom.x * k, -zoom.y * k);
  drawLayer(ctx, state.ann[zoom.p.n] || [], live);
  drawPageNum(ctx, zoom.p);
  drawLassoPath(ctx, zoom.p, zoom.K);
}

/* writing and panning inside the zoom window */
let zPan = null;
zBody.addEventListener("pointerdown", (e) => {
  if (!zoom.on || (e.pointerType === "mouse" && e.button !== 0)) return;
  const r = zBody.getBoundingClientRect();
  const p = zoom.p;
  const map = (ev) => [zoom.x + (ev.clientX - r.left) / zoom.K, zoom.y + (ev.clientY - r.top) / zoom.K];
  if (isPassive(e)) {
    e.preventDefault();
    try { zBody.setPointerCapture(e.pointerId); } catch (err) {}
    zPan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: zoom.x, y0: zoom.y };
    return;
  }
  startInput(e, p, map, zBody);
});
zBody.addEventListener("pointermove", (e) => {
  if (zPan && e.pointerId === zPan.id) {
    zoomMoveTo(zoom.p, zPan.x0 - (e.clientX - zPan.sx) / zoom.K, zPan.y0 - (e.clientY - zPan.sy) / zoom.K);
    return;
  }
  moveInput(e);
});
function zBodyEnd(e, cancelled) {
  if (zPan && e.pointerId === zPan.id) { zPan = null; zoom.lineX = zoom.x; return; }
  endPointer(e, cancelled);
}
zBody.addEventListener("pointerup", (e) => zBodyEnd(e, false));
zBody.addEventListener("pointercancel", (e) => zBodyEnd(e, true));

/* dragging the blue box on the page, and resizing it from its corner */
let zDrag = null;
zBox.addEventListener("pointerdown", (e) => {
  e.stopPropagation(); e.preventDefault();
  try { zBox.setPointerCapture(e.pointerId); } catch (err) {}
  zDrag = { id: e.pointerId, mode: e.target === zGrip ? "size" : "move", sx: e.clientX, sy: e.clientY, x0: zoom.x, y0: zoom.y, w0: zoom.w };
});
zBox.addEventListener("pointermove", (e) => {
  if (!zDrag || e.pointerId !== zDrag.id) return;
  e.stopPropagation(); e.preventDefault();
  const p = zoom.p, dx = (e.clientX - zDrag.sx) / p.s, dy = (e.clientY - zDrag.sy) / p.s;
  if (zDrag.mode === "move") zoomMoveTo(p, zDrag.x0 + dx, zDrag.y0 + dy);
  else zoomMoveTo(p, zDrag.x0, zDrag.y0, zDrag.w0 + dx);
});
function zBoxEnd(e) {
  if (!zDrag || e.pointerId !== zDrag.id) return;
  e.stopPropagation();
  zDrag = null; zoom.lineX = zoom.x;
}
zBox.addEventListener("pointerup", zBoxEnd);
zBox.addEventListener("pointercancel", zBoxEnd);

/* moving the window by its title bar, and resizing it from its corner */
let wDrag = null;
$("zHead").addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) return;
  e.preventDefault();
  try { $("zHead").setPointerCapture(e.pointerId); } catch (err) {}
  const r = zWin.getBoundingClientRect();
  wDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, l0: zoom.dock ? e.clientX - zoom.winW / 2 : r.left, t0: r.top, dock0: zoom.dock, el: $("zHead") };
});
$("zResize").addEventListener("pointerdown", (e) => {
  e.preventDefault(); e.stopPropagation();
  try { $("zResize").setPointerCapture(e.pointerId); } catch (err) {}
  wDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, w0: zoom.winW, h0: zoom.winH, size: true, dock0: zoom.dock, el: $("zResize") };
});
function wMove(e) {
  if (!wDrag || e.pointerId !== wDrag.id) return;
  e.preventDefault();
  const dx = e.clientX - wDrag.sx, dy = e.clientY - wDrag.sy;
  if (wDrag.size) {
    if (!zoom.dock) zoom.winW = wDrag.w0 + dx;
    zoom.winH = wDrag.h0 + (zoom.dock === "bottom" ? -dy : dy);
    sizeZoomWindow(false);
    zoomMoveTo(zoom.p, zoom.x, zoom.y);
  } else {
    zoom.left = wDrag.l0 + dx; zoom.top = wDrag.t0 + dy;
    const before = zoom.dock;
    zoom.dock = detectDock(zoom.top);
    sizeZoomWindow(false);
    if (before !== zoom.dock) zoomMoveTo(zoom.p, zoom.x, zoom.y);
  }
}
function wEnd(e) {
  if (!wDrag || e.pointerId !== wDrag.id) return;
  const w = wDrag; wDrag = null;
  if (w.dock0 !== zoom.dock || (zoom.dock && w.size)) {
    applyDockMargins();
    relayoutKeep();
    if (zoom.dock && w.dock0 !== zoom.dock) toast(zoom.dock === "top" ? "Zoom window docked at the top." : "Zoom window docked at the bottom.");
  }
}
for (const el of [$("zHead"), $("zResize")]) {
  el.addEventListener("pointermove", wMove);
  el.addEventListener("pointerup", wEnd);
  el.addEventListener("pointercancel", wEnd);
}
window.addEventListener("resize", () => { if (zoom.on) { sizeZoomWindow(false); zoomMoveTo(zoom.p, zoom.x, zoom.y); } });

/* ---------- text boxes ---------- */
function wrapText(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const ch of para) {
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxW) {
        const sp = line.lastIndexOf(" ");
        if (ch !== " " && sp > 0) { lines.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { lines.push(line); line = ch === " " ? "" : ch; }
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}
function fontStack(it) { return (TEXT_FONTS[it.font] || TEXT_FONTS.sans).stack; }
const fontLoads = {};
function ensureFont(it) {
  if (!it.font || it.font === "sans" || it.font === "mono" || !document.fonts) return;
  const fam = fontStack(it);
  const sample = (it.text || "A").slice(0, 40) || "A";
  const key = it.font + "|" + sample;
  if (fontLoads[key]) return;
  try { if (document.fonts.check("16px " + fam, sample)) { fontLoads[key] = true; return; } } catch (e) {}
  fontLoads[key] = document.fonts.load("16px " + fam, sample).then(() => {
    for (const p of state.pages) if (p.inkK && (state.ann[p.n] || []).some((x) => x.type === "text" && x.font === it.font)) { drawInk(p); thumbDirty(p.n); }
  }).catch(() => {});
}
function textLayout(ctx, it) {
  ensureFont(it);
  ctx.font = it.size + "px " + fontStack(it);
  const lines = wrapText(ctx, it.text, it.w);
  const lh = it.size * 1.3;
  return { lines, lh, h: Math.max(1, lines.length) * lh };
}
function drawTextItem(ctx, it, x, y) {
  ctx.save();
  const L = textLayout(ctx, it);
  it._b = { x: it.x, y: it.y, w: it.w, h: L.h };
  ctx.fillStyle = it.color; ctx.textBaseline = "middle";
  L.lines.forEach((l, i) => ctx.fillText(l, x, y + L.lh / 2 + i * L.lh));
  ctx.restore();
}
let _tctx = null;
function textAt(p, pt) {
  const items = state.ann[p.n] || [];
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type !== "text") continue;
    if (!it._b) { _tctx = _tctx || document.createElement("canvas").getContext("2d"); const L = textLayout(_tctx, it); it._b = { x: it.x, y: it.y, w: it.w, h: L.h }; }
    const b = it._b;
    if (pt[0] >= b.x - 6 && pt[0] <= b.x + b.w + 6 && pt[1] >= b.y - 6 && pt[1] <= b.y + b.h + 6) return it;
  }
  return null;
}

const tEdit = document.createElement("div");
tEdit.className = "tedit";
tEdit.innerHTML = '<div class="tbar" role="toolbar" aria-label="Text box">' +
  '<button type="button" class="tmove" title="Drag to move" aria-label="Move text box"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg></button>' +
  '<button type="button" class="tsmaller" aria-label="Smaller text">A−</button>' +
  '<button type="button" class="tbigger" aria-label="Bigger text">A+</button>' +
  '<select class="tfont" aria-label="Font"></select>' +
  '<span class="tdots"></span>' +
  '<button type="button" class="tdel">Delete</button>' +
  '<button type="button" class="tdone">Done</button>' +
  '</div><textarea aria-label="Text" spellcheck="true"></textarea><div class="twgrip" title="Drag to change width" aria-hidden="true"></div>';
const tArea = tEdit.querySelector("textarea"), tBar = tEdit.querySelector(".tbar"), tGrip = tEdit.querySelector(".twgrip"), tFont = tEdit.querySelector(".tfont");
for (const k in TEXT_FONTS) { const o = document.createElement("option"); o.value = k; o.textContent = TEXT_FONTS[k].label; tFont.appendChild(o); }
tFont.addEventListener("pointerdown", (e) => e.stopPropagation());
tFont.addEventListener("change", () => {
  if (!textEdit) return;
  textEdit.item.font = tFont.value;
  state.textFont = tFont.value; savePrefs();
  ensureFont(textEdit.item);
  if (document.fonts) document.fonts.load("16px " + fontStack(textEdit.item), textEdit.item.text || "A").then(positionTextEdit).catch(() => {});
  positionTextEdit();
  try { tArea.focus({ preventScroll: true }); } catch (e) {}
});
let textEdit = null, pendingTextFocus = false;
function renderTDots() {
  const box = tEdit.querySelector(".tdots");
  box.innerHTML = "";
  const cur = textEdit ? textEdit.item.color : state.textColor;
  buildSwatches(box, "textColor", PEN_COLORS, cur, (c) => {
    if (!textEdit) return;
    textEdit.item.color = c; state.textColor = c; savePrefs();
    positionTextEdit(); renderTDots();
    try { tArea.focus({ preventScroll: true }); } catch (e) {}
  }, "tdot");
}
function snapText(it) { return { text: it.text, x: it.x, y: it.y, w: it.w, size: it.size, color: it.color, font: it.font || "sans" }; }
function startTextAt(p, pt) {
  const hit = textAt(p, pt);
  if (hit) { openTextEdit(p, hit, false); pendingTextFocus = true; return; }
  const size = TEXT_SIZES[state.textSize] || 13;
  const x = Math.max(4, Math.min(p.w - 60, pt[0]));
  const it = { type: "text", font: state.textFont || "sans", text: "", x: round2(x), y: round2(Math.max(2, pt[1] - size * 0.65)), w: round2(Math.max(60, Math.min(p.w * 0.45, p.w - x - 8))), size, color: state.textColor };
  openTextEdit(p, it, true);
  pendingTextFocus = true;
}
function openTextEdit(p, item, isNew) {
  if (textEdit && textEdit.item === item) return;
  if (textEdit) closeTextEdit();
  if (imgSel.parentNode) deselectImage();
  textEdit = { p, item, isNew, before: snapText(item) };
  tArea.value = item.text;
  renderTDots();
  p.wrap.appendChild(tEdit);
  positionTextEdit();
  drawInk(p);
  try { tArea.focus({ preventScroll: true }); } catch (e) {}
}
function positionTextEdit() {
  if (!textEdit) return;
  const { p, item } = textEdit;
  const s = p.s, fpx = item.size * s;
  const F = Math.max(16, fpx), k = fpx / F;
  tArea.style.fontSize = F + "px";
  tArea.style.lineHeight = (F * 1.3) + "px";
  tArea.style.color = item.color;
  tArea.style.fontFamily = fontStack(item);
  if (tFont.value !== (item.font || "sans")) tFont.value = item.font || "sans";
  tArea.style.width = (item.w * s / k) + "px";
  tArea.style.transform = "scale(" + k + ")";
  tArea.style.height = "auto";
  const hpx = Math.max(F * 1.3, tArea.scrollHeight);
  tArea.style.height = hpx + "px";
  tEdit.style.left = (item.x * s) + "px";
  tEdit.style.top = (item.y * s) + "px";
  tEdit.style.width = (item.w * s) + "px";
  tEdit.style.height = (hpx * k) + "px";
  tEdit.classList.toggle("below", item.y * s < 56);
  tEdit.querySelectorAll(".tdot").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === item.color)));
}
function closeTextEdit() {
  if (!textEdit) return;
  const { p, item, isNew, before } = textEdit;
  textEdit = null;
  tEdit.remove();
  item.text = tArea.value.replace(/\s+$/, "");
  const list = (state.ann[p.n] = state.ann[p.n] || []);
  if (isNew) {
    if (item.text) { list.push(item); commit({ t: "add", n: p.n, item }); }
  } else if (!item.text) {
    const i = list.indexOf(item);
    Object.assign(item, before);
    if (i >= 0) { list.splice(i, 1); commit({ t: "del", n: p.n, items: [{ item, index: i }] }); }
  } else {
    const after = snapText(item);
    if (JSON.stringify(after) !== JSON.stringify(before)) commit({ t: "edit", n: p.n, item, before, after });
  }
  drawInk(p);
}
tArea.addEventListener("input", positionTextEdit);
tArea.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); closeTextEdit(); } });
tEdit.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
tBar.addEventListener("pointerdown", (e) => { if (!e.target.closest(".tmove, select")) e.preventDefault(); });
tBar.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || !textEdit) return;
  const it = textEdit.item;
  if (b.classList.contains("tdone")) { closeTextEdit(); return; }
  if (b.classList.contains("tdel")) { tArea.value = ""; closeTextEdit(); toast("Text box deleted. Undo brings it back."); return; }
  if (b.classList.contains("tsmaller")) it.size = Math.max(6, Math.round(it.size / 1.2));
  if (b.classList.contains("tbigger")) it.size = Math.min(72, Math.round(it.size * 1.2));
  if (b.closest(".tdots")) return;
  positionTextEdit();
});
let tDrag = null;
function tDragStart(e, mode) {
  if (!textEdit) return;
  e.preventDefault(); e.stopPropagation();
  const el = e.currentTarget;
  try { el.setPointerCapture(e.pointerId); } catch (err) {}
  const it = textEdit.item;
  tDrag = { id: e.pointerId, mode, sx: e.clientX, sy: e.clientY, x0: it.x, y0: it.y, w0: it.w };
}
function tDragMove(e) {
  if (!tDrag || e.pointerId !== tDrag.id || !textEdit) return;
  e.preventDefault(); e.stopPropagation();
  const { p, item } = textEdit, dx = (e.clientX - tDrag.sx) / p.s, dy = (e.clientY - tDrag.sy) / p.s;
  if (tDrag.mode === "move") {
    item.x = round2(Math.max(0, Math.min(p.w - 20, tDrag.x0 + dx)));
    item.y = round2(Math.max(0, Math.min(p.h - 10, tDrag.y0 + dy)));
  } else item.w = round2(Math.max(30, Math.min(p.w - item.x, tDrag.w0 + dx)));
  positionTextEdit();
}
function tDragEnd(e) { if (tDrag && e.pointerId === tDrag.id) { tDrag = null; e.stopPropagation(); } }
const tMove = tEdit.querySelector(".tmove");
tMove.addEventListener("pointerdown", (e) => tDragStart(e, "move"));
tGrip.addEventListener("pointerdown", (e) => tDragStart(e, "width"));
for (const el of [tMove, tGrip]) {
  el.addEventListener("pointermove", tDragMove);
  el.addEventListener("pointerup", tDragEnd);
  el.addEventListener("pointercancel", tDragEnd);
}
