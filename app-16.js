/* ---------- drawing extras: shapes, pen styles, filled loops, photo opacity ---------- */
const FILL_ALPHA = 0.25;
var penStyle = "pen", fillLoops = false, shapeKind = "line", shapeFill = false;
try {
  const x = JSON.parse(localStorage.getItem("margin-draw") || "{}");
  if (["pen", "pencil", "fountain", "dash"].includes(x.penStyle)) penStyle = x.penStyle;
  if (["line", "arrow", "rect", "ellipse"].includes(x.shapeKind)) shapeKind = x.shapeKind;
  fillLoops = !!x.fillLoops; shapeFill = !!x.shapeFill;
} catch (e) {}
function saveDraw() { try { localStorage.setItem("margin-draw", JSON.stringify({ penStyle, fillLoops, shapeKind, shapeFill })); } catch (e) {} }
const extrasCss = document.createElement("style");
extrasCss.textContent = ".viewer.tool-shape .page { cursor: crosshair; }\n" +
  ".penstyle.fontsel { min-width: 0; width: 118px; }\n" +
  ".page .selbar .imgop { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border-radius: 8px; background: var(--bar); color: var(--fg); font-weight: 600; font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,.2); white-space: nowrap; cursor: default; }\n" +
  ".page .selbar .imgop[hidden] { display: none; }\n" +
  ".imgop input { width: 92px; accent-color: var(--accent); touch-action: none; }\n";
document.head.appendChild(extrasCss);

/* -- how styled strokes are drawn -- */
function tracePath(ctx, D, close) {
  ctx.beginPath(); ctx.moveTo(D[0][0], D[0][1]);
  for (let i = 1; i < D.length; i++) ctx.lineTo(D[i][0], D[i][1]);
  if (close) ctx.closePath();
}
function styledPts(it) { return it.sharp || it.pts.length < 3 ? it.pts : curvePts(it.pts, 6); }
/* fountain pen: a nib held at 45°, so the line is thick or thin depending on direction */
function nibWidth(it, a, b) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return it.w * (0.3 + 1.3 * Math.abs(Math.sin(ang - Math.PI / 4))) * (0.75 + 0.4 * ((a[2] + b[2]) / 2));
}
function fountainWidths(it, D) {
  const W = [];
  for (let i = 1; i < D.length; i++) W.push(nibWidth(it, D[i - 1], D[i]));
  return W.map((w, i) => (i ? W[i - 1] : w) * 0.25 + w * 0.5 + (i < W.length - 1 ? W[i + 1] : w) * 0.25);
}
function pencilWidth(it, a, b) { return it.w * (it.shade ? 3.2 : 0.8) * (0.55 + 0.6 * ((a[2] + b[2]) / 2)); }
function pencilAlpha(it) { let s = 0; for (const q of it.pts) s += q[2]; return it.shade ? 0.3 : 0.45 + 0.5 * (s / it.pts.length); }
function strokeVar(ctx, D, W, unit) {
  let bucket = null;
  ctx.beginPath(); ctx.moveTo(D[0][0], D[0][1]);
  for (let i = 1; i < D.length; i++) {
    const w = W[i - 1], bk = Math.round(w / unit);
    if (bucket !== null && bk !== bucket) { ctx.stroke(); ctx.beginPath(); ctx.moveTo(D[i - 1][0], D[i - 1][1]); }
    if (bk !== bucket) { bucket = bk; ctx.lineWidth = w; }
    ctx.lineTo(D[i][0], D[i][1]);
  }
  ctx.stroke();
}
/* pencil: drawn solid off screen, paper grain rubbed out, then laid down lighter */
let grainCv = null, pencilBuf = null;
function drawPencil(ctx, it, D) {
  const m = ctx.getTransform(), CW = ctx.canvas.width, CH = ctx.canvas.height, sc = Math.hypot(m.a, m.b);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of D) {
    const x = m.a * q[0] + m.c * q[1] + m.e, y = m.b * q[0] + m.d * q[1] + m.f;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = it.w * (it.shade ? 4 : 1.5) * sc + 2;
  x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad));
  x1 = Math.min(CW, Math.ceil(x1 + pad)); y1 = Math.min(CH, Math.ceil(y1 + pad));
  const bw = x1 - x0, bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return;
  if (!grainCv) {
    grainCv = document.createElement("canvas"); grainCv.width = grainCv.height = 96;
    const g = grainCv.getContext("2d"), im = g.createImageData(96, 96);
    for (let i = 3; i < im.data.length; i += 4) im.data[i] = Math.random() < 0.35 ? 40 + Math.random() * 120 : 0;
    g.putImageData(im, 0, 0);
  }
  if (!pencilBuf) pencilBuf = document.createElement("canvas");
  if (pencilBuf.width < bw || pencilBuf.height < bh) { pencilBuf.width = Math.max(pencilBuf.width, bw); pencilBuf.height = Math.max(pencilBuf.height, bh); }
  const b = pencilBuf.getContext("2d");
  b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, bw, bh);
  b.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
  b.strokeStyle = it.color; b.lineCap = "round"; b.lineJoin = "round";
  const W = [];
  for (let i = 1; i < D.length; i++) W.push(pencilWidth(it, D[i - 1], D[i]));
  strokeVar(b, D, W, Math.max(0.08, it.w * 0.06));
  b.globalCompositeOperation = "destination-out";
  b.setTransform(1, 0, 0, 1, -(x0 % 96), -(y0 % 96));
  b.fillStyle = b.createPattern(grainCv, "repeat");
  b.fillRect(0, 0, bw + 96, bh + 96);
  b.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= pencilAlpha(it);
  ctx.drawImage(pencilBuf, 0, 0, bw, bh, x0, y0, bw, bh);
  ctx.restore();
}
{
  const di = drawItem;
  drawItem = function (ctx, it) {
    if (it.type === "img" && it.op != null && it.op < 1) { ctx.save(); ctx.globalAlpha = Math.max(0.05, it.op); di(ctx, it); ctx.restore(); return; }
    if (it.type !== "pen" || it.pts.length < 2 || !(it.sharp || it.fill || it.style)) { di(ctx, it); return; }
    const D = styledPts(it);
    ctx.save();
    ctx.strokeStyle = it.color; ctx.fillStyle = it.color; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (it.fill && D.length > 2) { ctx.globalAlpha = FILL_ALPHA; tracePath(ctx, D, true); ctx.fill(); ctx.globalAlpha = 1; }
    if (it.style === "pencil") drawPencil(ctx, it, D);
    else if (it.style === "fountain") strokeVar(ctx, D, fountainWidths(it, D), Math.max(0.08, it.w * 0.06));
    else if (it.style === "dash") { ctx.lineWidth = it.w * 0.95; ctx.setLineDash([it.w * 2.8, it.w * 2.4]); tracePath(ctx, D, false); ctx.stroke(); }
    else if (it.sharp) { ctx.lineWidth = penWidth(it, it.pts[0], it.pts[0]); tracePath(ctx, D, false); ctx.stroke(); }
    else strokeSmooth(ctx, it, it.pts);
    ctx.restore();
  };
  /* styled strokes are redrawn whole while you write (plain ones are added piece by piece) */
  const sg = segment;
  let segRaf = 0;
  segment = function (ctx, k, ox, oy, it) {
    if (!it.style) return sg.apply(this, arguments);
    if (!segRaf) segRaf = requestAnimationFrame(() => { segRaf = 0; if (active && active.item === it) drawInk(active.p, it); });
  };
}
/* the same strokes in a flattened PDF */
function pdfStyled(op, it, P) {
  const LC = PDFLib.LineCapStyle.Round, color = hexRgb(it.color), D = styledPts(it);
  const svg = (close) => {
    let d = "";
    D.forEach((q, i) => { const r = P(q[0], q[1]); d += (i ? "L" : "M") + r.x.toFixed(2) + " " + (-r.y).toFixed(2) + " "; });
    return d + (close ? "Z" : "");
  };
  if (it.fill && D.length > 2) op.drawSvgPath(svg(true), { x: 0, y: 0, color, opacity: FILL_ALPHA });
  if (it.style === "fountain" || (!it.style && !it.sharp)) {
    const W = it.style ? fountainWidths(it, D) : D.slice(1).map((q, i) => penWidth(it, D[i], q));
    for (let i = 1; i < D.length; i++) op.drawLine({ start: P(D[i - 1][0], D[i - 1][1]), end: P(D[i][0], D[i][1]), thickness: W[i - 1], color, lineCap: LC });
    return;
  }
  const o = { x: 0, y: 0, borderColor: color, borderLineCap: LC };
  if (it.style === "pencil") {
    let s = 0;
    for (let i = 1; i < D.length; i++) s += pencilWidth(it, D[i - 1], D[i]);
    o.borderWidth = s / (D.length - 1); o.borderOpacity = pencilAlpha(it);
  } else o.borderWidth = it.style === "dash" ? it.w * 0.95 : penWidth(it, it.pts[0], it.pts[0]);
  if (it.style === "dash") o.borderDashArray = [it.w * 2.8, it.w * 2.4];
  op.drawSvgPath(svg(false), o);
}

/* -- shapes tool: drag out a line, arrow, box or circle -- */
function shapePts(kind, A, B, w) {
  if (kind === "line" || kind === "arrow") {
    const E = snapAngle(A, [B[0], B[1], 0.6]);
    if (kind === "line") return [A, E];
    const ang = Math.atan2(E[1] - A[1], E[0] - A[0]), len = Math.hypot(E[0] - A[0], E[1] - A[1]);
    const h = Math.min(len * 0.45, Math.max(7, w * 5)), s = 0.45;
    return [A, E, [E[0] - h * Math.cos(ang - s), E[1] - h * Math.sin(ang - s)], E, [E[0] - h * Math.cos(ang + s), E[1] - h * Math.sin(ang + s)]];
  }
  const x0 = Math.min(A[0], B[0]), y0 = Math.min(A[1], B[1]), x1 = Math.max(A[0], B[0]), y1 = Math.max(A[1], B[1]);
  if (kind === "rect") return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, out = [];
  for (let i = 0; i <= 72; i++) { const t = i / 72 * Math.PI * 2; out.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]); }
  return out;
}
function startShape(e, p, map, surface) {
  if (document.body.classList.contains("fs-bars")) toggleFsBars(false);
  const pt = map(e);
  e.preventDefault();
  if (imgSel.parentNode) deselectImage();
  if (textEdit) closeTextEdit();
  if (lassoSel) clearLassoSel();
  try { surface.setPointerCapture(e.pointerId); } catch (err) {}
  const item = { type: "pen", color: state.penColor, w: PEN_SIZES[state.penSize], pts: [[round2(pt[0]), round2(pt[1]), 0.6]], sharp: true };
  if (shapeFill && (shapeKind === "rect" || shapeKind === "ellipse")) item.fill = true;
  active = { p, map, id: e.pointerId, tool: "shape", item, shape: true, kind: shapeKind, start: pt, scale: surface === zBody ? zoom.K : p.s, sx: e.clientX, sy: e.clientY, moved: false };
  document.body.classList.add("drawing");
}
function shapeMove(e) {
  const a = active;
  if (!a || a.tool !== "shape" || e.pointerId !== a.id) return;
  e.preventDefault();
  if (!a.moved && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 4) return;
  a.moved = true;
  a.item.pts = shapePts(a.kind, a.start, a.map(e), a.item.w).map((q) => [round2(q[0]), round2(q[1]), 0.6]);
  if (!a.raf) a.raf = requestAnimationFrame(() => { if (active === a) { a.raf = 0; drawInk(a.p, a.item); } });
}
pagesEl.addEventListener("pointermove", shapeMove);
zBody.addEventListener("pointermove", shapeMove);
/* a pen stroke that ends near where it started is a closed loop */
function closedLoop(a) {
  if (a.straight) return false;
  if (a.shape) return true;
  const P = a.item.pts;
  if (P.length < 8) return false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of P) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const diag = Math.hypot(maxX - minX, maxY - minY), A = P[0], B = P[P.length - 1];
  return diag * a.scale >= 30 && Math.hypot(B[0] - A[0], B[1] - A[1]) < Math.max(14 / a.scale, diag * 0.2);
}
{
  const si = startInput;
  startInput = function (e, p, map, surface) {
    if (state.tool === "shape") { startShape(e, p, map, surface); return; }
    si.apply(this, arguments);
    const a = active;
    if (state.tool !== "pen" || !a || !a.item || a.item.type !== "pen" || a.markStyle) return;
    if (penStyle !== "pen") a.item.style = penStyle;
    if (penStyle === "pencil" && e.pointerType === "pen" && e.altitudeAngle != null && e.altitudeAngle < 0.7) a.item.shade = true;
    if (fillLoops) a.fillLoop = true;
  };
  const ep = endPointer;
  endPointer = function (e, cancelled) {
    const a = active;
    if (a && e.pointerId === a.id && a.item && a.item.type === "pen" && !a.markStyle) {
      if (a.tool === "shape" && (!a.moved || cancelled)) {
        active = null;
        if (a.raf) cancelAnimationFrame(a.raf);
        document.body.classList.remove("drawing");
        drawInk(a.p);
        return;
      }
      if (a.shape || a.straight) a.item.sharp = true;
      if (a.fillLoop && closedLoop(a)) a.item.fill = true;
    }
    return ep.apply(this, arguments);
  };
}

/* -- toolbar: Shapes tool, pen styles and Fill -- */
const SHAPE_ICON = '<svg viewBox="0 0 24 24"><rect x="3.5" y="12.5" width="8" height="8" rx="1"/><circle cx="16.5" cy="7.5" r="4"/><path d="M4 8.5L9 3.5"/></svg>';
const FILL_ICON = '<svg viewBox="0 0 24 24"><path d="M12 4c4.6 0 8 2.6 8 6.5S16.6 18 12 18c-3 0-5.3-.9-6.6-2.4" /><path d="M5.4 15.6C4.5 14.4 4 12.6 4.4 10.8 5.2 6.5 8.4 4 12 4" fill="currentColor" fill-opacity=".35"/><path d="M4.5 11h15M5.5 14.5h13M7 7.5h10" opacity=".45"/></svg>';
const shapeBtn = document.createElement("button");
shapeBtn.type = "button"; shapeBtn.className = "tool"; shapeBtn.dataset.tool = "shape";
shapeBtn.setAttribute("aria-pressed", "false"); shapeBtn.title = "Shapes: lines, arrows, boxes and circles";
shapeBtn.innerHTML = SHAPE_ICON + "<span>Shapes</span>";
document.querySelector('.tool[data-tool="hl"]').after(shapeBtn);
shapeBtn.addEventListener("click", () => { if (textEdit) closeTextEdit(); if (lassoSel) clearLassoSel(); state.tool = "shape"; savePrefs(); renderToolbar(); });
const fsShape = document.createElement("button");
fsShape.type = "button"; fsShape.className = "icon-btn"; fsShape.dataset.fstool = "shape";
fsShape.setAttribute("aria-label", "Shapes"); fsShape.title = "Shapes";
fsShape.innerHTML = SHAPE_ICON; fsShape.querySelector("svg").style.fill = "none";
(document.querySelector('#fsPill [data-fstool="hl"]') || $("fsFit")).after(fsShape);
fsShape.onclick = () => shapeBtn.click();
function segBtns(label, opts, cur, pick) {
  const seg = document.createElement("div");
  seg.className = "seg emode"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", label);
  for (const [v, name, icon] of opts) {
    const b = document.createElement("button");
    b.type = "button"; b.title = name; b.setAttribute("aria-label", name);
    b.innerHTML = iconSvg(icon);
    b.setAttribute("aria-pressed", String(cur === v));
    b.onclick = () => pick(v);
    seg.appendChild(b);
  }
  return seg;
}
function fillBtn(on, title, flip) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "size"; b.title = title; b.setAttribute("aria-label", title);
  b.setAttribute("aria-pressed", String(on));
  b.innerHTML = FILL_ICON;
  b.querySelector("svg").style.cssText = "width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round";
  b.onclick = flip;
  return b;
}
{
  const rt = renderToolbar;
  renderToolbar = function () {
    rt.apply(this, arguments);
    const on = state.tool === "shape";
    shapeBtn.style.setProperty("--tc", state.penColor);
    fsShape.style.setProperty("--tc", state.penColor);
    fsShape.setAttribute("aria-pressed", String(on));
    fsShape.style.background = on ? "var(--chip-on)" : ""; fsShape.style.color = on ? "var(--accent)" : "";
    const sw = $("swatches"), sz = $("sizes");
    if (on) {
      sw.hidden = false; sz.hidden = false;
      buildSwatches(sw, "penColor", PEN_COLORS, state.penColor, (c) => { state.penColor = c; savePrefs(); renderToolbar(); });
      sz.appendChild(segBtns("Shape", [
        ["line", "Line", '<path d="M5 19L19 5"/>'],
        ["arrow", "Arrow", '<path d="M5 19L19 5M11 5h8v8"/>'],
        ["rect", "Box", '<rect x="4.5" y="6.5" width="15" height="11" rx="1"/>'],
        ["ellipse", "Circle", '<ellipse cx="12" cy="12" rx="8" ry="6.5"/>']
      ], shapeKind, (v) => { shapeKind = v; saveDraw(); renderToolbar(); }));
      ["Thin", "Medium", "Thick"].forEach((label, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "size"; b.title = label; b.setAttribute("aria-label", label);
        b.setAttribute("aria-pressed", String(state.penSize === i));
        const dot = document.createElement("i");
        dot.style.width = dot.style.height = [4, 7, 11][i] + "px";
        b.appendChild(dot);
        b.onclick = () => { state.penSize = i; savePrefs(); renderToolbar(); };
        sz.appendChild(b);
      });
      if (shapeKind === "rect" || shapeKind === "ellipse") sz.appendChild(fillBtn(shapeFill, "Fill the box or circle", () => { shapeFill = !shapeFill; saveDraw(); renderToolbar(); }));
    } else if (state.tool === "pen") {
      const sel = document.createElement("select");
      sel.className = "select fontsel penstyle"; sel.setAttribute("aria-label", "Pen style"); sel.title = "Pen style";
      for (const [v, t] of [["pen", "Pen"], ["pencil", "Pencil"], ["fountain", "Fountain pen"], ["dash", "Dashed"]]) {
        const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o);
      }
      sel.value = penStyle;
      sel.onchange = () => {
        penStyle = sel.value; saveDraw();
        if (penStyle === "pencil") toast("Press harder for darker lines. Tilt the Pencil to shade.", 3500);
        else if (penStyle === "fountain") toast("Lines are thick or thin depending on the direction you write.", 3500);
      };
      const ctl = sz.querySelector(".smooth-ctl");
      sz.insertBefore(sel, ctl);
      sz.insertBefore(fillBtn(fillLoops, "Fill closed loops: draw a loop to shade inside it", () => {
        fillLoops = !fillLoops; saveDraw(); renderToolbar();
        toast(fillLoops ? "Fill is on: a loop you close is shaded inside." : "Fill is off.", 2500);
      }), ctl);
    }
  };
}

/* erasing part of a styled stroke leaves pieces in the same style */
{
  const eP = erasePartial;
  erasePartial = function (pt) {
    const p = active.p, old = (state.ann[p.n] || []).slice();
    eP.apply(this, arguments);
    const now = state.ann[p.n] || [], was = new Set(old), keep = new Set(now);
    const gone = old.filter((it) => !keep.has(it) && (it.style || it.sharp || it.shade));
    if (!gone.length) return;
    for (const it of now) {
      if (was.has(it) || !it.pts) continue;
      const src = gone.find((g) => g.color === it.color && g.w === it.w && strokeHit(g, it.pts[0], 1));
      if (src) { if (src.style) it.style = src.style; if (src.shade) it.shade = true; if (src.sharp) it.sharp = true; }
    }
  };
}

/* -- photo opacity: a slider above a selected photo -- */