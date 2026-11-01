function fitRect(P, bb, scale) {
  const m = Math.min(bb.w, bb.h);
  let sum = 0, worst = 0;
  for (const q of P) {
    const d = Math.min(Math.abs(q[0] - bb.minX), Math.abs(q[0] - bb.maxX), Math.abs(q[1] - bb.minY), Math.abs(q[1] - bb.maxY));
    sum += d; worst = Math.max(worst, d);
  }
  if (sum / P.length > m * 0.08 + 2 / scale || worst > m * 0.25 + 4 / scale) return null;
  const corners = [[bb.minX, bb.minY], [bb.maxX, bb.minY], [bb.maxX, bb.maxY], [bb.minX, bb.maxY]];
  for (const c of corners) {
    let best = Infinity;
    for (const q of P) best = Math.min(best, Math.hypot(q[0] - c[0], q[1] - c[1]));
    if (best > m * 0.14 + 4 / scale) return null;
  }
  return corners.concat([corners[0]]);
}
function fitEllipse(P, bb) {
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  let rx = bb.w / 2, ry = bb.h / 2;
  if (rx <= 0 || ry <= 0) return null;
  let sum = 0, worst = 0, turn = 0, prev = null;
  for (const q of P) {
    const r = Math.hypot((q[0] - cx) / rx, (q[1] - cy) / ry);
    sum += Math.abs(r - 1); worst = Math.max(worst, Math.abs(r - 1));
    const ang = Math.atan2(q[1] - cy, q[0] - cx);
    if (prev != null) { let d = ang - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; turn += d; }
    prev = ang;
  }
  if (sum / P.length > 0.13 || worst > 0.35 || Math.abs(turn) < Math.PI * 1.65) return null;
  if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.15) rx = ry = (rx + ry) / 2;
  const start = Math.atan2(P[0][1] - cy, P[0][0] - cx), dir = turn < 0 ? -1 : 1, out = [];
  for (let i = 0; i <= 72; i++) { const t = start + dir * (i / 72) * Math.PI * 2; out.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]); }
  return out;
}
function snapAngle(A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const ang = Math.atan2(dy, dx), len = Math.hypot(dx, dy);
  const step = Math.PI / 4, near = Math.round(ang / step) * step;
  if (Math.abs(ang - near) < 0.06) return [round2(A[0] + Math.cos(near) * len), round2(A[1] + Math.sin(near) * len), B[2]];
  return [round2(B[0]), round2(B[1]), B[2]];
}
pagesEl.addEventListener("pointerdown", (e) => {
  const p = pageFrom(e); if (!p || pinch) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const rect = p.wrap.getBoundingClientRect();
  const map = (ev) => toPt(p, rect, ev);
  if (isPassive(e)) {
    tap = { p, pt: map(e), x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    if (e.pointerType === "pen") armLongPress(e);
    return;
  }
  startInput(e, p, map, p.wrap);
});
function segment(ctx, k, ox, oy, it, P) {
  const n = P.length;
  if (n < 2) return;
  ctx.setTransform(k, 0, 0, k, -ox * k, -oy * k);
  ctx.strokeStyle = it.color; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  if (n === 2) {
    ctx.lineWidth = penWidth(it, P[0], P[1]);
    ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo((P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2);
  } else {
    const a = P[n - 3], c = P[n - 2], b = P[n - 1];
    ctx.lineWidth = penWidth(it, a, b);
    ctx.moveTo((a[0] + c[0]) / 2, (a[1] + c[1]) / 2);
    ctx.quadraticCurveTo(c[0], c[1], (c[0] + b[0]) / 2, (c[1] + b[1]) / 2);
  }
  ctx.stroke();
}
function moveInput(e) {
  if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 6) cancelLongPress();
  if (!active || e.pointerId !== active.id) return false;
  e.preventDefault();
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  const list = evs.length ? evs : [e];
  if (active.tool === "lasso") {
    for (const ev of list) active.pts.push(active.map(ev));
    if (!active.raf) active.raf = requestAnimationFrame(() => { if (active && active.tool === "lasso") { active.raf = 0; drawInk(active.p); } });
    return true;
  }
  if (active.tool === "notemove") {
    const pt = active.map(list[list.length - 1]), it = active.item, p = active.p;
    const dx = pt[0] - active.start[0], dy = pt[1] - active.start[1];
    if (!active.moved && Math.hypot(dx, dy) * active.scale < 6) return true;
    active.moved = true;
    const b = it._b || { w: 60, h: 30 };
    it.x = round2(Math.max(0, Math.min(p.w - Math.min(b.w, p.w), active.x0 + dx)));
    it.y = round2(Math.max(0, Math.min(p.h - Math.min(b.h, p.h), active.y0 + dy)));
    if (!active.raf) active.raf = requestAnimationFrame(() => { if (active) { active.raf = 0; drawInk(active.p); } });
    return true;
  }
  if (active.tool === "eraser") {
    for (const ev of list) eraseAt(active.map(ev));
    if (active.partial) showEraserCursor(e.clientX, e.clientY);
    return true;
  }
  const it = active.item, P = it.pts, p = active.p;
  if (active.shape) return true;
  if (active.straight) {
    const pt = active.map(list[list.length - 1]);
    it.pts[1] = snapAngle(it.pts[0], [pt[0], pt[1], it.pts[1][2]]);
    if (!active.raf) active.raf = requestAnimationFrame(() => { if (active) { active.raf = 0; drawInk(active.p, active.item); } });
    return true;
  }
  if (Math.hypot(e.clientX - active.hx, e.clientY - active.hy) > 3) { active.hx = e.clientX; active.hy = e.clientY; armHold(); }
  const showZ = zoom.on && zoom.p === p;
  const minStep = 0.5 / Math.max(p.s, showZ ? zoom.K : 0);
  for (const ev of list) {
    const pt = active.map(ev);
    const last = P[P.length - 1];
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < minStep) continue;
    const raw = pressureOf(ev);
    const pr = Math.round((last[2] * 0.6 + raw * 0.4) * 100) / 100;
    const next = [round2(pt[0]), round2(pt[1]), pr];
    P.push(next);
    if (it.type === "pen") {
      if (p.inkK) segment(p.ink.getContext("2d"), p.inkK, 0, 0, it, P);
      if (showZ) segment(zInk.getContext("2d"), zoom.K * zoom.dpr, zoom.x, zoom.y, it, P);
    }
  }
  if (it.type === "hl" && !active.raf) active.raf = requestAnimationFrame(() => { if (active) { active.raf = 0; drawInk(active.p, active.item); } });
  return true;
}
pagesEl.addEventListener("pointermove", moveInput);
function endPointer(e, cancelled) {
  if (lp && e.pointerId === lp.id) cancelLongPress();
  if (tap && e.pointerId === tap.id) {
    const t = tap; tap = null;
    if (!cancelled && !(multi && multi.n >= 2) && Date.now() - t.t < 400 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10) {
      const hit = noteAt(t.p, t.pt);
      const txt = hit ? null : textAt(t.p, t.pt);
      const pic = hit || txt ? null : imageAt(t.p, t.pt);
      const blank = !hit && !txt && !pic, now = Date.now();
      if (blank && lastTap && now - lastTap.t < 340 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
        lastTap = null;
        clearTimeout(fsTapTimer);
        setFullscreen(!document.body.classList.contains("fullscreen"), true);
      } else if (blank && document.body.classList.contains("fullscreen") && !textEdit && !imgSel.parentNode && !zoom.on) {
        lastTap = { t: now, x: e.clientX, y: e.clientY };
        clearTimeout(fsTapTimer);
        fsTapTimer = setTimeout(() => toggleFsBars(), 320);
      } else {
        lastTap = blank ? { t: now, x: e.clientX, y: e.clientY } : null;
        if (hit) { if (sel && sel.item === hit) openNoteEditor(t.p, hit, t.pt); else selectImage(t.p, hit); }
        else if (txt) openTextEdit(t.p, txt, false);
        else if (textEdit) closeTextEdit();
        else if (pic) selectImage(t.p, pic);
        else if (imgSel.parentNode) deselectImage();
        else if (lassoSel) clearLassoSel();
        else if (zoom.on) zoomPlaceAt(t.p, t.pt);
      }
    }
  }
  if (pendingTextFocus) { pendingTextFocus = false; try { tArea.focus(); } catch (err) {} }
  if (!active || e.pointerId !== active.id) return;
  const a = active; active = null;
  clearTimeout(holdTimer);
  document.body.classList.remove("drawing");
  if (a.raf) cancelAnimationFrame(a.raf);
  if (a.tool === "lasso") { finishLasso(a); return; }
  if (a.tool === "notemove") {
    if (a.moved) { commit({ t: "edit", n: a.p.n, item: a.item, before: { x: a.x0, y: a.y0 }, after: { x: a.item.x, y: a.item.y } }); drawInk(a.p); }
    else openNoteEditor(a.p, a.item, a.start);
    return;
  }
  if (a.tool === "eraser") {
    hideEraserCursor();
    if (a.partial) { if (a.changed) commit({ t: "set", n: a.p.n, before: a.before, after: (state.ann[a.p.n] || []).slice() }); }
    else if (a.removed.length) commit({ t: "del", n: a.p.n, items: a.removed });
    return;
  }
  if (a.markStyle) { finishMark(a); return; }
  if (a.item.type === "pen" && !a.straight && !a.shape) a.item.pts = smoothStroke(a.item.pts);
  (state.ann[a.p.n] = state.ann[a.p.n] || []).push(a.item);
  commit({ t: "add", n: a.p.n, item: a.item });
  drawInk(a.p);
}
pagesEl.addEventListener("pointerup", (e) => endPointer(e, false));
pagesEl.addEventListener("pointercancel", (e) => endPointer(e, true));
function cancelActive() {
  tap = null;
  clearTimeout(holdTimer);
  if (active && active.tool === "lasso") { const p = active.p; active = null; drawInk(p); }
  else if (active && active.tool === "notemove") { const a = active; active = null; a.item.x = a.x0; a.item.y = a.y0; drawInk(a.p); }
  else if (active && active.tool !== "eraser") { const p = active.p; active = null; drawInk(p); }
  else if (active) {
    const a = active; active = null; hideEraserCursor();
    if (a.partial) { if (a.changed) commit({ t: "set", n: a.p.n, before: a.before, after: (state.ann[a.p.n] || []).slice() }); }
    else if (a.removed.length) commit({ t: "del", n: a.p.n, items: a.removed });
  }
  document.body.classList.remove("drawing");
}
function pressureOf(ev) { return ev.pointerType === "pen" ? Math.round(((ev.pressure || 0.5)) * 100) / 100 : 0.5; }
function round2(v) { return Math.round(v * 100) / 100; }
function eraseAt(pt) {
  if (active.partial) { erasePartial(pt); return; }
  const p = active.p, items = state.ann[p.n] || [];
  const tol = 6 / (zoom.on && zoom.p === p ? Math.max(p.s, zoom.K) : p.s);
  let changed = false;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type === "img") continue;
    const hit = it.type === "note" ? (noteAt(p, pt) === it) : it.type === "text" ? (textAt(p, pt) === it) : strokeHit(it, pt, tol);
    if (hit) { active.removed.push({ item: it, index: i }); items.splice(i, 1); changed = true; }
  }
  if (changed) drawInk(p);
}
