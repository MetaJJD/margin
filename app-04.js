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
  const map = (ev) => toPt(p, rect, rulerSnap(ev));
  if (isPassive(e)) {
    tap = { p, pt: map(e), x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    if (e.pointerType === "pen") armLongPress(e);
    return;
  }
  rulerBegin(e);
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
  const minStep = 0.9 / Math.max(p.s, showZ ? zoom.K : 0);
  /* steady the hand: slow, shaky movement is smoothed a lot, quick movement follows the tip closely */
  const sm = active.sm || (active.sm = [P[0][0], P[0][1]]);
  const [sb, sk] = smoothParams();
  for (const ev of list) {
    const tip = active.map(ev);
    active.raw = tip;
    const d = Math.hypot(tip[0] - sm[0], tip[1] - sm[1]) * active.scale;
    const al = Math.min(1, sb + d / sk);
    sm[0] += (tip[0] - sm[0]) * al; sm[1] += (tip[1] - sm[1]) * al;
    const pt = sm;
    const last = P[P.length - 1];
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < minStep) continue;
    const raw = pressureOf(ev);
    const pr = Math.round((last[2] * 0.6 + raw * 0.4) * 100) / 100;
    const next = [round2(pt[0]), round2(pt[1]), pr];
    P.push(next);
    if (it.type === "pen") {
      if (p.inkK) segment(p.ink.getContext("2d"), p.inkK, p.inkO ? p.inkO.x : 0, p.inkO ? p.inkO.y : 0, it, P);
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
      const lnk = hit || txt || pic || textEdit ? null : linkAt(t.p, t.pt);
      const blank = !hit && !txt && !pic && !lnk, now = Date.now();
      if (lnk) { lastTap = null; followLink(lnk); }
      else if (blank && lastTap && now - lastTap.t < 340 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
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
  if (!a.straight && !a.shape && a.raw) {
    /* finish the line exactly where the pencil lifted */
    const P = a.item.pts, L = P[P.length - 1];
    if (Math.hypot(a.raw[0] - L[0], a.raw[1] - L[1]) * a.scale > 0.6) P.push([round2(a.raw[0]), round2(a.raw[1]), L[2]]);
  }
  if (a.item.type === "pen" && !a.straight && !a.shape && smoothing > 0) {
    a.item.pts = smoothStroke(a.item.pts);
    if (smoothing >= 80) a.item.pts = smoothStroke(a.item.pts);
  }
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

/* Home: moving files between folders (Move picker and press-and-hold drag) */
/* move a file into a folder ("" = no folder) */
async function moveDocTo(m, dest) {
  const cur = await DB.get("meta", m.id);
  if (!cur) return;
  if ((cur.folder || "") === dest) { lib.moving = null; renderLibrary(); return; }
  if (dest) cur.folder = dest; else delete cur.folder;
  await DB.put("meta", cur);
  lib.moving = null; lib.actionsFor = null;
  toast("Moved “" + cur.name + "” to " + (dest ? showPath(dest) : "All files") + ".");
  renderLibrary();
}
/* press and hold a file on Home, then drop it on a folder to move it there */
const fdrag = { timer: 0, cand: null, on: false, justDropped: false };
const docListEl = $("docList");
docListEl.style.webkitTouchCallout = "none";
docListEl.addEventListener("contextmenu", (e) => { if (fdrag.cand || fdrag.on) e.preventDefault(); });
docListEl.addEventListener("pointerdown", (e) => {
  const open = e.target.closest(".doc-open");
  if (!open || (e.pointerType === "mouse" && e.button !== 0) || fdrag.on) return;
  const li = open.closest(".doc-row");
  clearTimeout(fdrag.timer);
  fdrag.cand = { li, id: e.pointerId, x: e.clientX, y: e.clientY };
  fdrag.timer = setTimeout(startFileDrag, 450);
});
docListEl.addEventListener("pointermove", (e) => {
  const c = fdrag.cand;
  if (c && !fdrag.on && e.pointerId === c.id && Math.hypot(e.clientX - c.x, e.clientY - c.y) > 8) { clearTimeout(fdrag.timer); fdrag.cand = null; }
  if (fdrag.on && e.pointerId === fdrag.id) { e.preventDefault(); moveFileDrag(e.clientX, e.clientY); }
});
docListEl.addEventListener("pointerup", (e) => endFileDrag(e, false));
docListEl.addEventListener("pointercancel", (e) => endFileDrag(e, true));
docListEl.addEventListener("touchmove", (e) => { if (fdrag.on) e.preventDefault(); }, { passive: false });
docListEl.addEventListener("click", (e) => { if (fdrag.justDropped) { e.stopPropagation(); e.preventDefault(); } }, true);
async function startFileDrag() {
  const c = fdrag.cand;
  if (!c || !c.li.isConnected) return;
  const m = await DB.get("meta", c.li.dataset.id);
  if (!m || fdrag.cand !== c) return;
  Object.assign(fdrag, { on: true, id: c.id, li: c.li, m, target: undefined });
  try { c.li.setPointerCapture(c.id); } catch (err) {}
  c.li.style.opacity = "0.4";
  const g = document.createElement("div");
  g.style.cssText = "position:fixed;z-index:80;pointer-events:none;display:flex;align-items:center;gap:10px;max-width:260px;padding:8px 12px 8px 8px;border-radius:12px;background:var(--bar);color:var(--fg);box-shadow:0 0 0 2px var(--accent),0 14px 34px rgba(10,20,40,.3);font-weight:600;transform:rotate(-2deg);";
  const th = c.li.querySelector(".doc-thumb");
  if (th) { const t = th.cloneNode(true); t.style.flex = "none"; g.appendChild(t); }
  const nm = document.createElement("span"); nm.textContent = m.name;
  nm.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  g.appendChild(nm);
  document.body.appendChild(g);
  fdrag.ghost = g;
  toast("Drop it on a folder above to move it.", 2500);
  moveFileDrag(c.x, c.y);
  const scroller = $("libSheet").querySelector(".body");
  const loop = () => {
    if (!fdrag.on) return;
    const r = scroller.getBoundingClientRect(), y = fdrag.ly;
    const sp = y < r.top + 60 ? -Math.ceil((r.top + 60 - y) / 4) : y > r.bottom - 60 ? Math.ceil((y - r.bottom + 60) / 4) : 0;
    if (sp) { scroller.scrollTop += sp; moveFileDrag(fdrag.lx, fdrag.ly); }
    fdrag.raf = requestAnimationFrame(loop);
  };
  fdrag.raf = requestAnimationFrame(loop);
}
function moveFileDrag(x, y) {
  fdrag.lx = x; fdrag.ly = y;
  fdrag.ghost.style.left = (x + 18) + "px";
  fdrag.ghost.style.top = (y + 18) + "px";
  const el = document.elementFromPoint(x, y);
  const t = el && el.closest ? el.closest("#folderChips [data-drop]") : null;
  if (fdrag.hot && fdrag.hot !== t) { fdrag.hot.style.boxShadow = ""; fdrag.hot.style.transform = ""; }
  fdrag.hot = t;
  if (t) { t.style.boxShadow = "0 0 0 3px var(--accent)"; t.style.transform = "scale(1.06)"; }
  fdrag.target = t ? t.dataset.drop : undefined;
}
function endFileDrag(e, cancelled) {
  if (fdrag.cand && !fdrag.on && e.pointerId === fdrag.cand.id) { clearTimeout(fdrag.timer); fdrag.cand = null; return; }
  if (!fdrag.on || e.pointerId !== fdrag.id) return;
  fdrag.on = false; fdrag.cand = null;
  cancelAnimationFrame(fdrag.raf);
  fdrag.li.style.opacity = "";
  fdrag.ghost.remove();
  if (fdrag.hot) { fdrag.hot.style.boxShadow = ""; fdrag.hot.style.transform = ""; fdrag.hot = null; }
  fdrag.justDropped = true; setTimeout(() => { fdrag.justDropped = false; }, 450);
  if (!cancelled && fdrag.target !== undefined) moveDocTo(fdrag.m, fdrag.target);
}
/* Home and Files menu: file details (pages, size, created, modified) and sorting */
const SORTS = [["name", "Name A–Z"], ["name-za", "Name Z–A"], ["created", "Date created: newest"], ["created-old", "Date created: oldest"],
  ["modified", "Last modified: newest"], ["modified-old", "Last modified: oldest"], ["recent", "Recently opened"]];
function sortKey(v) { return v === "added" ? "created" : SORTS.some((x) => x[0] === v) ? v : "recent"; }
function modOf(m) { return m.modified || m.added || 0; }
function cmpName(a, b) { return (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" }); }
function sortMetas(list, how) {
  const by = {
    name: cmpName, "name-za": (a, b) => cmpName(b, a),
    created: (a, b) => (b.added || 0) - (a.added || 0), "created-old": (a, b) => (a.added || 0) - (b.added || 0),
    modified: (a, b) => modOf(b) - modOf(a), "modified-old": (a, b) => modOf(a) - modOf(b),
    recent: (a, b) => (b.opened || 0) - (a.opened || 0)
  };
  return list.sort(by[sortKey(how)]);
}
function fmtSize(n) {
  if (!n) return "—";
  if (n < 1024) return n + " B";
  if (n < 1048576) return Math.round(n / 1024) + " KB";
  return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
}
function fmtDate(t, dayOnly) {
  if (!t) return "—";
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return dayOnly ? "Today" : "Today " + hm;
  const o = { month: "short", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) o.year = "numeric";
  return d.toLocaleDateString([], o) + (dayOnly ? "" : ", " + hm);
}
function docDetails(m) {
  return (m.pages || "?") + (m.pages === 1 ? " page" : " pages") + " · " + fmtSize(m.size) + " · Created " + fmtDate(m.added) + " · Modified " + fmtDate(modOf(m));
}
function docCols(m) {
  const c = document.createElement("span"); c.className = "doc-cols";
  for (const [k, v] of [["pg", String(m.pages || "?")], ["sz", fmtSize(m.size)], ["dt", fmtDate(m.added)], ["dt", fmtDate(modOf(m))]]) {
    const x = document.createElement("span"); x.className = "c-" + k; x.textContent = v; c.appendChild(x);
  }
  return c;
}
function setSort(v) { lib.sort = sortKey(v); saveLib(); renderLibrary(); if (openPop === $("filesPop")) renderRecent(); }
/* column titles above the file list on wide screens; tap Name, Created or Modified to sort by it */
function docHead() {
  const li = document.createElement("li"); li.className = "doc-head";
  const row = document.createElement("div"); row.className = "dh-row";
  const sp = document.createElement("span"); sp.className = "dh-thumb"; row.appendChild(sp);
  const cur = sortKey(lib.sort);
  const cell = (label, cls, a, b) => {
    const el = document.createElement(a ? "button" : "span"); el.className = "dh " + cls; el.textContent = label;
    if (a) {
      el.type = "button";
      if (cur === a || cur === b) { el.classList.add("on"); el.textContent += cur === a ? (a === "name" ? " ↑" : " ↓") : (a === "name" ? " ↓" : " ↑"); }
      el.onclick = () => setSort(cur === a ? b : a);
    }
    row.appendChild(el);
  };
  cell("Name", "dh-name", "name", "name-za");
  cell("Pages", "c-pg"); cell("Size", "c-sz");
  cell("Created", "c-dt", "created", "created-old"); cell("Modified", "c-dt", "modified", "modified-old");
  li.append(row, document.createElement("span"), document.createElement("span"));
  return li;
}
/* the Files menu gets a sort menu next to its file list */
(() => {
  const lab = document.querySelector("#filesPop .fm-label");
  const row = document.createElement("div"); row.className = "fm-sortrow";
  const sel = document.createElement("select"); sel.className = "select fm-sort"; sel.id = "fmSort"; sel.setAttribute("aria-label", "Sort files");
  lab.replaceWith(row); lab.textContent = "Files"; row.append(lab, sel);
  $("libSort").innerHTML = "";
  for (const s of [$("libSort"), sel]) for (const [v, t] of SORTS) { const o = document.createElement("option"); o.value = v; o.textContent = t; s.appendChild(o); }
  sel.addEventListener("change", () => setSort(sel.value));
})();
/* record the date modified (and the file size) whenever a file or its notes are saved.
   Pass quiet = true to save without counting it as a change (backup, restore). */
const dbPut = DB.put.bind(DB);
DB.put = (s, v, quiet) => {
  const r = dbPut(s, v);
  if (!quiet && (s === "files" || s === "ann") && v && v.id) r.then((ok) => { if (ok !== false) stampMeta(v.id, s === "files" ? byteSize(v.bytes) : 0, true); });
  return r;
};
function byteSize(b) { return b ? (b.byteLength || b.length || 0) : 0; }
/* read-modify-write of one meta record in a single step, so it can't race other saves */
function stampMeta(id, size, touch) {
  return DB.run("meta", "readwrite", (o) => {
    const g = o.get(id);
    g.onsuccess = () => { const m = g.result; if (!m) return; if (touch) m.modified = Date.now(); if (size) m.size = size; o.put(m); };
  }).catch(() => false);
}
/* files saved before sizes were recorded: look the size up once */
function fillSizes(metas, redraw) {
  const missing = metas.filter((m) => !m.size);
  if (!missing.length) return;
  Promise.all(missing.map(async (m) => { const f = await DB.get("files", m.id); const n = f && byteSize(f.bytes); if (n) { m.size = n; await stampMeta(m.id, n, false); } return n; }))
    .then((r) => { if (r.some(Boolean)) redraw(); });
}
