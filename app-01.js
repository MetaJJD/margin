(function () {
"use strict";

/* ---------- constants ---------- */
const PEN_COLORS = ["#1b1f2a", "#2457d6", "#d23b3b", "#1f8a5b"];
const HL_COLORS = ["#ffd84d", "#8be38b", "#ff9ec7", "#8fd0ff"];
const MARK_COLORS = ["#d23b3b", "#2457d6", "#1f8a5b", "#1b1f2a"];
const NOTE_COLORS = ["#ffe57f", "#c9ecff", "#ffc9dc", "#cdf3c4"];
const PEN_SIZES = [1.1, 2, 3.8];
const HL_SIZES = [9, 14, 22];
const NOTE = { font: 11, lh: 14.5, pad: 7, maxW: 168 };
const TEXT_SIZES = [10, 13, 18, 26];
const ERASER_PX = [7, 14, 26];
const TEXT_FONTS = {
  sans: { label: "Sans", stack: '-apple-system, system-ui, "Helvetica Neue", "PingFang TC", "Noto Sans TC", sans-serif' },
  serif: { label: "Serif", stack: '"Noto Serif TC", Georgia, "Songti TC", serif' },
  hand: { label: "Handwriting", stack: '"Caveat", "Klee One", cursive' },
  mono: { label: "Mono", stack: '"Courier New", ui-monospace, Menlo, monospace' }
};
const ERASE_ICONS = {
  stroke: '<path d="M3 14c3-6 5 3 8-1.5S16 9 21 12"/><path d="M8.5 7.5l7 9M15.5 7.5l-7 9"/>',
  partial: '<path d="M3 14c1.8-3.4 3.2-2.6 4.2-1.6M16.6 11.4c1.6-.9 2.8-.3 4.4.6"/><circle cx="12" cy="12.5" r="3.6" stroke-dasharray="2 2"/>'
};
function iconSvg(path) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + "</svg>"; }

const NOTE_FONT = '-apple-system, system-ui, "Helvetica Neue", "PingFang TC", "Noto Sans TC", sans-serif';
const PIXEL_CAP = 12e6;

const $ = (id) => document.getElementById(id);
const viewer = $("viewer"), pagesEl = $("pages"), statusEl = $("status");

/* ---------- state ---------- */
const state = {
  id: null, name: "", bytes: null, pdf: null, pages: [], ann: {},
  tool: "pen", penColor: PEN_COLORS[0], hlColor: HL_COLORS[0], noteColor: NOTE_COLORS[0],
  penSize: 1, hlSize: 1, textColor: "#1b1f2a", textSize: 1, eraserMode: "stroke", eraserSize: 1, hlStyle: "marker", markColor: "#d23b3b", textFont: "sans", readMode: "normal", zoom: 1, pencilOnly: true, viewMode: "vertical", curPage: 1, undo: [], redo: []
};

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("margin-prefs") || "{}");
    for (const k of ["tool", "penColor", "hlColor", "noteColor", "penSize", "hlSize", "pencilOnly", "viewMode", "textColor", "textSize", "thumbsOpen", "eraserMode", "eraserSize", "hlStyle", "markColor", "textFont", "readMode"]) if (k in p) state[k] = p[k];
  } catch (e) {}
}
function savePrefs() {
  try {
    const { tool, penColor, hlColor, noteColor, penSize, hlSize, pencilOnly, viewMode, textColor, textSize, thumbsOpen, eraserMode, eraserSize, hlStyle, markColor, textFont, readMode } = state;
    localStorage.setItem("margin-prefs", JSON.stringify({ tool, penColor, hlColor, noteColor, penSize, hlSize, pencilOnly, viewMode, textColor, textSize, thumbsOpen, eraserMode, eraserSize, hlStyle, markColor, textFont, readMode }));
  } catch (e) {}
}

/* ---------- storage (IndexedDB) ---------- */
const DB = {
  p: null,
  open() {
    if (this.p) return this.p;
    this.p = new Promise((res, rej) => {
      try {
        const r = indexedDB.open("margin-reader", 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          d.createObjectStore("meta", { keyPath: "id" });
          d.createObjectStore("files", { keyPath: "id" });
          d.createObjectStore("ann", { keyPath: "id" });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return this.p;
  },
  async run(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  get(s, k) { return this.run(s, "readonly", (o) => o.get(k)).catch(() => null); },
  all(s) { return this.run(s, "readonly", (o) => o.getAll()).catch(() => []); },
  put(s, v) { return this.run(s, "readwrite", (o) => o.put(v)).catch(() => false); },
  del(s, k) { return this.run(s, "readwrite", (o) => o.delete(k)).catch(() => false); }
};

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  const id = state.id, ann = state.ann, bookmarks = state.bookmarks || [], pageNumbers = state.pageNumbers || null;
  saveTimer = setTimeout(async () => {
    if (!id) return;
    await DB.put("ann", { id, ann: stripAnn(ann), bookmarks, pageNumbers });
    const m = await DB.get("meta", id);
    if (m) { m.notes = countAnn(ann); await DB.put("meta", m); }
  }, 500);
}
function stripAnn(ann) {
  const out = {};
  for (const k in ann) out[k] = ann[k].map((it) => { const c = Object.assign({}, it); delete c._b; return c; });
  return out;
}
function countAnn(ann) { let n = 0; for (const k in ann) n += ann[k].length; return n; }

/* ---------- block page-wide pinch zoom (Safari gesture events) ---------- */
["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1 && !(e.target.closest && e.target.closest("#viewer, #zBody"))) e.preventDefault();
}, { passive: false });

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg, ms) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || 3200);
}

/* ---------- custom colours ---------- */
const PLUS_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>';
function loadCustoms() { try { return JSON.parse(localStorage.getItem("margin-custom-colors") || "{}") || {}; } catch (e) { return {}; } }
let customColors = loadCustoms();
function customsFor(key) { return Array.isArray(customColors[key]) ? customColors[key] : []; }
function addCustom(key, c) {
  c = String(c).toLowerCase();
  const list = customsFor(key).filter((x) => x !== c);
  list.unshift(c);
  customColors[key] = list.slice(0, 6);
  try { localStorage.setItem("margin-custom-colors", JSON.stringify(customColors)); } catch (e) {}
}
function paletteFor(key, presets) {
  const pre = presets.map((x) => x.toLowerCase());
  return presets.concat(customsFor(key).filter((c) => !pre.includes(c)));
}
function toHex6(c) {
  c = String(c || "#000000").trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(c)) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  return /^#[0-9a-f]{6}$/.test(c) ? c : "#000000";
}
function pickColor(initial, done) {
  const inp = $("colorInput");
  inp.value = toHex6(initial);
  inp.onchange = () => { done(inp.value.toLowerCase()); inp.onchange = null; };
  try { inp.click(); } catch (e) {}
}
/* builds preset + custom swatches and a "+" button into box */
function buildSwatches(box, key, presets, cur, onSelect, cls) {
  const all = paletteFor(key, presets);
  const curL = String(cur || "").toLowerCase();
  all.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = cls || "sw"; b.style.background = c; b.dataset.c = c;
    b.setAttribute("aria-label", (i < presets.length ? "Colour " : "Custom colour ") + (i + 1));
    b.setAttribute("aria-pressed", String(c.toLowerCase() === curL));
    b.onclick = (e) => { e.stopPropagation(); onSelect(c); };
    box.appendChild(b);
  });
  const plus = document.createElement("button");
  plus.type = "button"; plus.className = (cls || "sw") + " plus";
  plus.setAttribute("aria-label", "Pick a custom colour"); plus.title = "More colours";
  plus.innerHTML = PLUS_SVG;
  plus.onclick = (e) => { e.stopPropagation(); pickColor(cur, (c) => { addCustom(key, c); onSelect(c); }); };
  box.appendChild(plus);
}

/* ---------- toolbar ---------- */
function renderToolbar() {
  document.querySelectorAll(".tool[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === state.tool)));
  /* a line in the tool's current colour shows under the selected pen, highlighter, text or note tool */
  const toolColor = { pen: state.penColor, hl: state.hlStyle === "marker" ? state.hlColor : state.markColor, text: state.textColor, note: state.noteColor };
  document.querySelectorAll(".tool[data-tool], #fsPill [data-fstool]").forEach((b) => { const c = toolColor[b.dataset.tool || b.dataset.fstool]; if (c) b.style.setProperty("--tc", c); });
  viewer.className = "viewer tool-" + state.tool;
  const sw = $("swatches"), sz = $("sizes");
  sw.innerHTML = ""; sz.innerHTML = "";
  let colors = null, cur = null, key = null, sizes = null, sizeKey = null;
  if (state.tool === "pen") { colors = PEN_COLORS; cur = state.penColor; key = "penColor"; sizes = PEN_SIZES; sizeKey = "penSize"; }
  if (state.tool === "hl") {
    if (state.hlStyle === "marker") { colors = HL_COLORS; cur = state.hlColor; key = "hlColor"; sizes = HL_SIZES; sizeKey = "hlSize"; }
    else { colors = MARK_COLORS; cur = state.markColor; key = "markColor"; }
  }
  if (state.tool === "note") { colors = NOTE_COLORS; cur = state.noteColor; key = "noteColor"; }
  if (state.tool === "text") { colors = PEN_COLORS; cur = state.textColor; key = "textColor"; }
  sw.hidden = !colors; sz.hidden = !sizes && state.tool !== "text" && state.tool !== "eraser" && state.tool !== "hl";
  if (state.tool === "hl") {
    const seg = document.createElement("div");
    seg.className = "seg emode hlstyle"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Highlight style");
    [["marker", "Marker", '<path d="M3 15h18v4H3z" fill="currentColor" opacity=".35" stroke="none"/><path d="M7 15V6h10v9"/>'],
     ["ul", "Underline", '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>'],
     ["st", "Strike", '<path d="M16 7a4 3 0 0 0-8 .5c0 4 8 2.5 8 6.5a4 3 0 0 1-8 .5M4 12h16"/>']].forEach(([v, label, icon]) => {
      const b = document.createElement("button");
      b.type = "button"; b.title = label; b.setAttribute("aria-label", label);
      b.innerHTML = iconSvg(icon);
      b.setAttribute("aria-pressed", String(state.hlStyle === v));
      b.onclick = () => { state.hlStyle = v; savePrefs(); renderToolbar(); };
      seg.appendChild(b);
    });
    sz.appendChild(seg);
  }
  if (state.tool === "eraser") {
    const seg = document.createElement("div");
    seg.className = "seg emode"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Eraser mode");
    [["stroke", "Erase whole strokes"], ["partial", "Erase part of a stroke"]].forEach(([v, label]) => {
      const b = document.createElement("button");
      b.type = "button"; b.innerHTML = iconSvg(ERASE_ICONS[v]); b.title = label; b.setAttribute("aria-label", label);
      b.setAttribute("aria-pressed", String(state.eraserMode === v));
      b.onclick = () => { state.eraserMode = v; savePrefs(); renderToolbar(); };
      seg.appendChild(b);
    });
    sz.appendChild(seg);
    if (state.eraserMode === "partial") ["Small", "Medium", "Large"].forEach((label, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "size"; b.title = label + " eraser"; b.setAttribute("aria-label", label + " eraser");
      b.setAttribute("aria-pressed", String(state.eraserSize === i));
      const dot = document.createElement("i");
      dot.style.width = dot.style.height = [8, 13, 20][i] + "px";
      dot.style.background = "transparent"; dot.style.boxShadow = "inset 0 0 0 1.6px currentColor"; dot.style.color = "var(--fg)";
      b.appendChild(dot);
      b.onclick = () => { state.eraserSize = i; savePrefs(); renderToolbar(); };
      sz.appendChild(b);
    });
  }
  if (state.tool === "lasso") {
    sz.hidden = false;
    const h = document.createElement("span");
    h.className = "tool-hint";
    h.textContent = lassoSel ? "Drag the selection to move it" : "Draw a loop around what you want to move";
    sz.appendChild(h);
  }
  if (state.tool === "text") {
    const sel = document.createElement("select");
    sel.className = "select fontsel"; sel.setAttribute("aria-label", "Font");
    for (const k in TEXT_FONTS) { const o = document.createElement("option"); o.value = k; o.textContent = TEXT_FONTS[k].label; sel.appendChild(o); }
    sel.value = state.textFont;
    sel.style.fontFamily = TEXT_FONTS[state.textFont].stack;
    sel.onchange = () => { state.textFont = sel.value; savePrefs(); renderToolbar(); };
    sz.appendChild(sel);
  }
  if (state.tool === "text") ["Small", "Normal", "Large", "Title"].forEach((label, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "size txt"; b.title = label + " text"; b.setAttribute("aria-label", label + " text");
    b.setAttribute("aria-pressed", String(state.textSize === i));
    b.textContent = "A"; b.style.fontSize = [11, 14, 18, 23][i] + "px";
    b.onclick = () => { state.textSize = i; savePrefs(); renderToolbar(); };
    sz.appendChild(b);
  });
  if (colors) buildSwatches(sw, key, colors, cur, (c) => { state[key] = c; savePrefs(); renderToolbar(); });
  if (sizes) ["Thin", "Medium", "Thick"].forEach((label, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "size"; b.title = label; b.setAttribute("aria-label", label);
    b.setAttribute("aria-pressed", String(state[sizeKey] === i));
    const dot = document.createElement("i");
    const d = state.tool === "pen" ? [4, 7, 11][i] : [8, 12, 17][i];
    dot.style.width = dot.style.height = d + "px";
    if (state.tool === "hl") { dot.style.background = state.hlColor; dot.style.borderRadius = "3px"; }
    b.appendChild(dot);
    b.onclick = () => { state[sizeKey] = i; savePrefs(); renderToolbar(); };
    sz.appendChild(b);
  });
  $("pencilBtn").setAttribute("aria-pressed", String(state.pencilOnly));
  document.body.classList.toggle("read-sepia", state.readMode === "sepia");
  document.body.classList.toggle("read-night", state.readMode === "night");
  $("readMode").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === (state.readMode || "normal"))));
  $("pencilHint").textContent = state.pencilOnly ? "Apple Pencil writes. Your finger scrolls, swipes and selects." : "Pencil, finger and mouse all write. Pick Select to scroll with your finger.";
  $("zoomBoxBtn").setAttribute("aria-pressed", String(zoom.on));
  $("fsZoom").setAttribute("aria-pressed", String(zoom.on));
  $("zoomVal").textContent = Math.round(state.zoom * 100) + "%";
  $("undoBtn").disabled = $("zUndo").disabled = $("fsUndo").disabled = !state.undo.length;
  $("redoBtn").disabled = $("zRedo").disabled = $("fsRedo").disabled = !state.redo.length;
  renderPenPresets();
}
document.querySelectorAll(".tool[data-tool]").forEach((b) => b.addEventListener("click", () => { if (textEdit) closeTextEdit(); if (lassoSel && b.dataset.tool !== "lasso") clearLassoSel(); state.tool = b.dataset.tool; savePrefs(); renderToolbar(); }));
$("pencilBtn").onclick = () => {
  state.pencilOnly = !state.pencilOnly; savePrefs(); renderToolbar();
  toast(state.pencilOnly ? "Apple Pencil draws. Your finger scrolls." : "Finger and mouse draw too. Pick Select to move around.");
};

/* ---------- page overview: press and hold a page, then drag it to a new place ---------- */
/* in Select mode, dragging a selected page moves all the selected pages together */
const gdrag = { timer: 0, cand: null, on: false, justDropped: false };
const gvGridEl = $("gvGrid");
gvGridEl.addEventListener("contextmenu", (e) => { if (gdrag.cand || gdrag.on) e.preventDefault(); });
gvGridEl.addEventListener("pointerdown", (e) => {
  const b = e.target.closest(".gv-cell");
  if (!b || (e.pointerType === "mouse" && e.button !== 0) || pageBusy || gdrag.on) return;
  clearTimeout(gdrag.timer);
  gdrag.cand = { b, id: e.pointerId, x: e.clientX, y: e.clientY };
  gdrag.timer = setTimeout(startGridDrag, 420);
});
gvGridEl.addEventListener("pointermove", (e) => {
  const c = gdrag.cand;
  if (c && !gdrag.on && e.pointerId === c.id && Math.hypot(e.clientX - c.x, e.clientY - c.y) > 8) { clearTimeout(gdrag.timer); gdrag.cand = null; }
  if (gdrag.on && e.pointerId === gdrag.id) { e.preventDefault(); moveGridDrag(e.clientX, e.clientY); }
});
gvGridEl.addEventListener("pointerup", (e) => endGridDrag(e, false));
gvGridEl.addEventListener("pointercancel", (e) => endGridDrag(e, true));
gvGridEl.addEventListener("touchmove", (e) => { if (gdrag.on) e.preventDefault(); }, { passive: false });
gvGridEl.addEventListener("click", (e) => { if (gdrag.justDropped) { e.stopPropagation(); e.preventDefault(); } }, true);
function startGridDrag() {
  const c = gdrag.cand;
  if (!c || !c.b.isConnected) return;
  const b = c.b, n = +b.dataset.n, pg = b.querySelector(".gv-page"), r = pg.getBoundingClientRect();
  const moving = gv.selecting && gv.sel.has(n) ? Array.from(gv.sel).sort((a, z) => a - z) : [n];
  Object.assign(gdrag, { on: true, id: c.id, b, n, moving, ox: c.x - r.left, oy: c.y - r.top, at: undefined });
  try { b.setPointerCapture(c.id); } catch (err) {}
  for (const k of moving) { const el = gv.els[k - 1]; if (el) el.style.opacity = "0.35"; }
  const g = document.createElement("div");
  g.style.cssText = "position:fixed;z-index:70;pointer-events:none;background:#fff;border-radius:3px;overflow:hidden;transform:scale(1.06) rotate(-2deg);" +
    "box-shadow:0 0 0 3px var(--accent),0 14px 34px rgba(10,20,40,.35);width:" + r.width + "px;height:" + r.height + "px;filter:" + getComputedStyle(pg).filter + ";";
  const cv = pg.querySelector("canvas");
  if (cv && cv.width) {
    const cc = document.createElement("canvas"); cc.width = cv.width; cc.height = cv.height;
    cc.getContext("2d").drawImage(cv, 0, 0);
    cc.style.cssText = "display:block;width:100%;height:100%;";
    g.appendChild(cc);
  }
  const num = document.createElement("span");
  num.textContent = moving.length > 1 ? moving.length + " pages" : String(n);
  num.style.cssText = "position:absolute;left:6px;bottom:6px;min-width:22px;height:22px;padding:0 7px;box-sizing:border-box;border-radius:11px;background:var(--accent);color:#fff;font:600 12px/22px var(--f-ui);text-align:center;";
  g.appendChild(num);
  document.body.appendChild(g);
  const line = document.createElement("div");
  line.style.cssText = "position:fixed;z-index:69;pointer-events:none;width:4px;border-radius:2px;background:var(--accent);box-shadow:0 0 0 2px var(--desk);display:none;";
  document.body.appendChild(line);
  gdrag.ghost = g; gdrag.line = line;
  moveGridDrag(c.x, c.y);
  const loop = () => {
    if (!gdrag.on) return;
    const lr = gvGridEl.getBoundingClientRect(), y = gdrag.ly;
    const sp = y < lr.top + 60 ? -Math.ceil((lr.top + 60 - y) / 4) : y > lr.bottom - 60 ? Math.ceil((y - lr.bottom + 60) / 4) : 0;
    if (sp) { gvGridEl.scrollTop += sp; moveGridDrag(gdrag.lx, gdrag.ly); }
    gdrag.raf = requestAnimationFrame(loop);
  };
  gdrag.raf = requestAnimationFrame(loop);
}
/* the drop point is a gap between two pages: before the page under the finger, or after it */
function moveGridDrag(x, y) {
  gdrag.lx = x; gdrag.ly = y;
  gdrag.ghost.style.left = (x - gdrag.ox) + "px";
  gdrag.ghost.style.top = (y - gdrag.oy) + "px";
  let best = null, bd = Infinity;
  for (const el of gv.els) {
    const r = el.querySelector(".gv-page").getBoundingClientRect();
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0, dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = dx * dx + dy * dy * 4;
    if (d < bd) { bd = d; best = { el, r }; }
  }
  if (!best) { gdrag.at = undefined; gdrag.line.style.display = "none"; return; }
  const after = x > best.r.left + best.r.width / 2, k = +best.el.dataset.n;
  gdrag.at = after ? k + 1 : k;
  const lx = after ? best.r.right + 7 : best.r.left - 11;
  gdrag.line.style.left = lx + "px";
  gdrag.line.style.top = best.r.top + "px";
  gdrag.line.style.height = best.r.height + "px";
  const lr = gvGridEl.getBoundingClientRect();
  gdrag.line.style.display = best.r.bottom > lr.top && best.r.top < lr.bottom ? "block" : "none";
}
function endGridDrag(e, cancelled) {
  if (gdrag.cand && !gdrag.on && e.pointerId === gdrag.cand.id) { clearTimeout(gdrag.timer); gdrag.cand = null; return; }
  if (!gdrag.on || e.pointerId !== gdrag.id) return;
  gdrag.on = false; gdrag.cand = null;
  cancelAnimationFrame(gdrag.raf);
  for (const el of gv.els) el.style.opacity = "";
  const cv = gdrag.ghost.querySelector("canvas"); if (cv) cv.width = 0;
  gdrag.ghost.remove(); gdrag.line.remove();
  gdrag.justDropped = true; setTimeout(() => { gdrag.justDropped = false; }, 450);
  if (cancelled || gdrag.at === undefined) return;
  /* new order: everything else in place, the moved pages dropped into the gap */
  const mv = gdrag.moving, set = new Set(mv), N = state.pages.length, order = [];
  let idx = 0;
  for (let i = 1; i <= N; i++) { if (i === gdrag.at) idx = order.length; if (!set.has(i)) order.push(i); }
  if (gdrag.at > N) idx = order.length;
  order.splice(idx, 0, ...mv);
  if (order.every((v, i) => v === i + 1)) return;
  gv.sel.clear();
  const msg = mv.length > 1 ? "Moved " + mv.length + " pages to page " + (idx + 1) + "." : "Moved page " + mv[0] + " to page " + (idx + 1) + ".";
  applyPageOrder(order, idx + 1, msg);
}
