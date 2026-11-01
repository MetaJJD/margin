/* ---------- zoom ---------- */
function setZoom(z, cx, cy) {
  z = Math.max(0.5, Math.min(4, z));
  const old = state.zoom; if (Math.abs(z - old) < 0.001) return;
  const r = viewer.getBoundingClientRect();
  const ax = cx == null ? r.width / 2 : cx - r.left, ay = cy == null ? r.height / 2 : cy - r.top;
  const px = viewer.scrollLeft + ax, py = viewer.scrollTop + ay;
  state.zoom = z;
  layout();
  const ratio = z / old;
  viewer.scrollLeft = px * ratio - ax;
  viewer.scrollTop = py * ratio - ay;
  renderToolbar();
  updateVisible();
}
const ZSTEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
$("zoomIn").onclick = () => setZoom(ZSTEPS.find((z) => z > state.zoom + 0.01) || 4);
$("zoomOut").onclick = () => setZoom(ZSTEPS.slice().reverse().find((z) => z < state.zoom - 0.01) || 0.5);

/* pinch to zoom with two fingers */
let pinch = null;
function tdist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
viewer.addEventListener("touchstart", (e) => {
  const fingers = Array.from(e.touches).filter((t) => t.touchType !== "stylus");
  if (fingers.length === 2) {
    const [a, b] = fingers;
    pinch = { d0: tdist(a, b), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, r: 1 };
    cancelActive();
    e.preventDefault();
  } else if (shouldBlock(e)) e.preventDefault();
}, { passive: false });
viewer.addEventListener("touchmove", (e) => {
  if (pinch && e.touches.length >= 2) {
    e.preventDefault();
    const r = tdist(e.touches[0], e.touches[1]) / pinch.d0;
    pinch.r = Math.max(0.5 / state.zoom, Math.min(4 / state.zoom, r));
    const vr = viewer.getBoundingClientRect();
    const ox = viewer.scrollLeft + pinch.cx - vr.left, oy = viewer.scrollTop + pinch.cy - vr.top;
    pagesEl.style.transformOrigin = ox + "px " + oy + "px";
    pagesEl.style.transform = "scale(" + pinch.r + ")";
  } else if (shouldBlock(e)) e.preventDefault();
}, { passive: false });
viewer.addEventListener("touchend", (e) => {
  if (pinch && e.touches.length < 2) {
    const p = pinch; pinch = null;
    pagesEl.style.transform = "";
    if (Math.abs(p.r - 1) > 0.02) setZoom(state.zoom * p.r, p.cx, p.cy);
  }
});
function shouldBlock(e) {
  if (state.tool === "hand") return false;
  if (!e.target.closest || !e.target.closest(".page")) return false;
  const t = e.touches[0] || e.changedTouches[0];
  if (!t) return false;
  return t.touchType === "stylus" || !state.pencilOnly;
}

/* ---------- drawing ---------- */
function prepInk(p) {
  const d = dprFor(p), k = p.s * d;
  const W = Math.round(p.w * k), H = Math.round(p.h * k);
  if (p.ink.width !== W || p.ink.height !== H) { p.ink.width = W; p.ink.height = H; }
  p.inkK = k;
  return k;
}
function drawInk(p, live) {
  const k = prepInk(p);
  const ctx = p.ink.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, p.ink.width, p.ink.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  drawLayer(ctx, state.ann[p.n] || [], live);
  drawPageNum(ctx, p);
  drawLassoPath(ctx, p, p.s);
  if (zoom.on && zoom.p === p) drawZoomInk(live);
}
const HL_ALPHA = 0.45;
let hlBuf = null;
function drawHighlights(ctx, hls) {
  if (!hls.length) return;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!W || !H) return;
  if (!hlBuf) hlBuf = document.createElement("canvas");
  if (hlBuf.width !== W || hlBuf.height !== H) { hlBuf.width = W; hlBuf.height = H; }
  const b = hlBuf.getContext("2d");
  const m = ctx.getTransform();
  const groups = new Map();
  for (const it of hls) { if (!groups.has(it.color)) groups.set(it.color, []); groups.get(it.color).push(it); }
  for (const group of groups.values()) {
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, W, H);
    b.setTransform(m);
    for (const it of group) drawItem(b, it);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = HL_ALPHA;
    ctx.drawImage(hlBuf, 0, 0);
    ctx.restore();
  }
}
function drawLayer(ctx, items, live) {
  for (const it of items) if (it.type === "img") drawItem(ctx, it);
  const hls = items.filter((it) => it.type === "hl");
  if (live && live.type === "hl") hls.push(live);
  drawHighlights(ctx, hls);
  for (const it of items) if (it.type === "pen") drawItem(ctx, it);
  if (live && live.type === "pen") drawItem(ctx, live);
  for (const it of items) if (it.type === "text" || it.type === "note") drawItem(ctx, it);
}
function penWidth(it, a, b) { return it.w * (0.45 + 0.85 * ((a[2] + b[2]) / 2)); }
/* points along smooth curves through the stroke (quadratic curves between midpoints) */
function curvePts(P, steps) {
  if (P.length < 3) return P.slice();
  const out = [P[0]];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  out.push(mid(P[0], P[1]));
  for (let i = 1; i < P.length - 1; i++) {
    const a = mid(P[i - 1], P[i]), c = P[i], b = mid(P[i], P[i + 1]);
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * a[2] + t * b[2]]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
function strokeSmooth(ctx, it, P) {
  const D = curvePts(P, 4);
  let bucket = null;
  ctx.beginPath(); ctx.moveTo(D[0][0], D[0][1]);
  for (let i = 1; i < D.length; i++) {
    const w = penWidth(it, D[i - 1], D[i]);
    const bk = Math.round(w / Math.max(0.08, it.w * 0.06));
    if (bucket !== null && bk !== bucket) {
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(D[i - 1][0], D[i - 1][1]);
    }
    if (bucket === null || bk !== bucket) { bucket = bk; ctx.lineWidth = w; }
    ctx.lineTo(D[i][0], D[i][1]);
  }
  ctx.stroke();
}
function smoothStroke(P) {
  if (P.length < 5) return P;
  const out = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    out.push([round2((a[0] + 2 * b[0] + c[0]) / 4), round2((a[1] + 2 * b[1] + c[1]) / 4), Math.round((a[2] + 2 * b[2] + c[2]) / 4 * 100) / 100]);
  }
  out.push(P[P.length - 1]);
  return out;
}
function drawItem(ctx, it) {
  ctx.save();
  if (it.type === "pen") {
    ctx.strokeStyle = it.color; ctx.fillStyle = it.color; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const P = it.pts;
    if (P.length === 1) { ctx.beginPath(); ctx.arc(P[0][0], P[0][1], it.w * 0.6, 0, Math.PI * 2); ctx.fill(); }
    else strokeSmooth(ctx, it, P);
  } else if (it.type === "hl") {
    ctx.strokeStyle = it.color; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = it.w;
    const P = it.pts;
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
    if (P.length === 1) ctx.lineTo(P[0][0] + 0.1, P[0][1]);
    for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
    ctx.stroke();
  } else if (it.type === "img") {
    const im = getImg(it.src);
    if (im.complete && im.naturalWidth) ctx.drawImage(im, it.x, it.y, it.w, it.h);
    else { ctx.fillStyle = "#eef1f5"; ctx.fillRect(it.x, it.y, it.w, it.h); }
  } else if (it.type === "text") {
    if (!(textEdit && textEdit.item === it)) drawTextItem(ctx, it, it.x, it.y);
  } else if (it.type === "note") {
    drawNote(ctx, it, it.x, it.y);
  }
  ctx.restore();
}
function noteLayout(ctx, text) {
  ctx.font = "500 " + NOTE.font + "px " + NOTE_FONT;
  const lines = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const ch of para) {
      const test = line + ch;
      if (line && ctx.measureText(test).width > NOTE.maxW) {
        const sp = line.lastIndexOf(" ");
        if (ch !== " " && sp > 0) { lines.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { lines.push(line); line = ch === " " ? "" : ch; }
      } else line = test;
    }
    lines.push(line);
  }
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  return { lines, w: Math.max(40, w + NOTE.pad * 2), h: lines.length * NOTE.lh + NOTE.pad * 2 - 3 };
}
function drawNote(ctx, it, x, y) {
  const L = noteLayout(ctx, it.text);
  it._b = { x, y, w: L.w, h: L.h };
  ctx.save();
  ctx.fillStyle = it.color;
  ctx.strokeStyle = "rgba(60,50,20,.28)"; ctx.lineWidth = 0.6;
  roundRect(ctx, x, y, L.w, L.h, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#26231b"; ctx.textBaseline = "alphabetic";
  L.lines.forEach((l, i) => ctx.fillText(l, x + NOTE.pad, y + NOTE.pad + NOTE.font - 1 + i * NOTE.lh));
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

/* ---------- hit testing ---------- */
function noteAt(p, pt) {
  const items = state.ann[p.n] || [];
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type !== "note") continue;
    if (!it._b) { const c = document.createElement("canvas").getContext("2d"); const L = noteLayout(c, it.text); it._b = { x: it.x, y: it.y, w: L.w, h: L.h }; }
    const b = it._b;
    if (pt[0] >= b.x - 4 && pt[0] <= b.x + b.w + 4 && pt[1] >= b.y - 4 && pt[1] <= b.y + b.h + 4) return it;
  }
  return null;
}
function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((px - a[0]) * dx + (py - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
function strokeHit(it, pt, tol) {
  const P = it.pts, r = it.w / 2 + tol;
  if (P.length === 1) return Math.hypot(pt[0] - P[0][0], pt[1] - P[0][1]) < r;
  for (let i = 1; i < P.length; i++) if (segDist(pt[0], pt[1], P[i - 1], P[i]) < r) return true;
  return false;
}

/* ---------- pointer input (pages and zoom window) ---------- */
let active = null, tap = null, lastTap = null, fsTapTimer = null;
function toggleFsBars(force) {
  if (!document.body.classList.contains("fullscreen")) return;
  const on = force != null ? force : !document.body.classList.contains("fs-bars");
  document.body.classList.toggle("fs-bars", on);
  $("fsPill").hidden = on;
  if (!on) { hidePop(); requestAnimationFrame(() => layoutPill(false)); }
}
function toPt(p, rect, ev) {
  return [(ev.clientX - rect.left) / p.s, (ev.clientY - rect.top) / p.s];
}
function pageFrom(e) {
  const wrap = e.target.closest && e.target.closest(".page");
  return wrap ? state.pages[+wrap.dataset.i] : null;
}
function isPassive(e) { return state.tool === "hand" || (e.pointerType === "touch" && state.pencilOnly); }
function startInput(e, p, map, surface) {
  if (document.body.classList.contains("fs-bars")) toggleFsBars(false);
  const pt = map(e);
  e.preventDefault();
  if (imgSel.parentNode) deselectImage();
  if (state.tool === "lasso") {
    if (textEdit) closeTextEdit();
    clearLassoSel();
    try { surface.setPointerCapture(e.pointerId); } catch (err) {}
    active = { p, map, id: e.pointerId, tool: "lasso", pts: [pt], scale: surface === zBody ? zoom.K : p.s };
    return;
  }
  if (state.tool === "note") {
    const hitNote = noteAt(p, pt);
    if (!hitNote) { openNoteEditor(p, null, pt); return; }
    try { surface.setPointerCapture(e.pointerId); } catch (err) {}
    active = { p, map, id: e.pointerId, tool: "notemove", item: hitNote, start: pt, x0: hitNote.x, y0: hitNote.y, moved: false, scale: surface === zBody ? zoom.K : p.s };
    return;
  }
  if (state.tool === "text") { startTextAt(p, pt); return; }
  if (textEdit) closeTextEdit();
  try { surface.setPointerCapture(e.pointerId); } catch (err) {}
  if (state.tool === "eraser") {
    const partial = state.eraserMode === "partial";
    active = { p, map, id: e.pointerId, tool: "eraser", removed: [], partial, scale: surface === zBody ? zoom.K : p.s, before: (state.ann[p.n] || []).slice(), changed: false };
    if (partial) showEraserCursor(e.clientX, e.clientY);
    eraseAt(pt);
    if (e.pointerType === "pen") armLongPress(e);
    return;
  }
  const isPen = state.tool === "pen";
  const markStyle = state.tool === "hl" && state.hlStyle !== "marker" ? state.hlStyle : null;
  const item = markStyle
    ? { type: "pen", color: state.markColor, w: 1.2, pts: [[round2(pt[0]), round2(pt[1]), 0.65]] }
    : {
      type: state.tool,
      color: isPen ? state.penColor : state.hlColor,
      w: isPen ? PEN_SIZES[state.penSize] : HL_SIZES[state.hlSize],
      pts: [[round2(pt[0]), round2(pt[1]), pressureOf(e)]]
    };
  if (markStyle) pageText(p);
  active = { p, map, id: e.pointerId, tool: state.tool, item, markStyle, scale: surface === zBody ? zoom.K : p.s, hx: e.clientX, hy: e.clientY };
  armHold();
  if (e.pointerType === "pen") armLongPress(e);
  document.body.classList.add("drawing");
  drawInk(p, item);
}

/* hold still at the end of a stroke to turn it into a straight line */
let holdTimer = null;
function armHold() { clearTimeout(holdTimer); holdTimer = setTimeout(tryStraighten, 550); }
function tryStraighten() {
  const a = active;
  if (!a || !a.item || a.straight || a.shape || a.markStyle) return;
  const P = a.item.pts;
  if (P.length < 3) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, pr = 0;
  for (const q of P) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); pr += q[2]; }
  pr = Math.round(pr / P.length * 100) / 100;
  const bb = { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  const diag = Math.hypot(bb.w, bb.h);
  if (diag * a.scale < 28) return;
  const A = P[0], B = P[P.length - 1];
  const gap = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (gap < diag * 0.3 && P.length >= 8 && Math.min(bb.w, bb.h) * a.scale >= 16) {
    const shape = fitEllipse(P, bb) || fitRect(P, bb, a.scale);
    if (shape) {
      a.shape = true;
      a.item.pts = shape.map((q) => [round2(q[0]), round2(q[1]), pr]);
      drawInk(a.p, a.item);
      return;
    }
  }
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (len * a.scale < 28) return;
  let dev = 0;
  for (const q of P) dev = Math.max(dev, segDist(q[0], q[1], A, B));
  if (dev > len * 0.09 + 5 / a.scale) return;
  a.straight = true;
  a.item.pts = [[A[0], A[1], pr], snapAngle(A, [B[0], B[1], pr])];
  drawInk(a.p, a.item);
}