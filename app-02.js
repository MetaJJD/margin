/* ---------- open documents ---------- */
async function openDoc(id, name, bytes, presetAnn, keepAnn) {
  if (!window.pdfjsLib) { showStatus("The PDF engine didn't load. Check your connection and reload the page."); return; }
  showStatus("Opening " + name + "…");
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: bytes.slice(), isEvalSupported: false, useSystemFonts: true,
      cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/", cMapPacked: true
    }).promise;
  } catch (e) {
    showStatus(e && e.name === "PasswordException" ? "This PDF is password protected. Remove the password in another app, then open it again." : "This file couldn't be opened as a PDF.");
    return false;
  }
  if (zoom.on) zoomClose();
  if (imgSel.parentNode) deselectImage();
  if (textEdit) closeTextEdit();
  clearLassoSel();
  const switching = state.id && state.id !== id;
  if (switching) stashTab();
  const mem = switching && !keepAnn && !presetAnn ? tabs.mem[id] : null;
  if (state.pdf) { try { state.pdf.destroy(); } catch (e) {} }
  const saved = await DB.get("ann", id);
  if (typeof toc !== "undefined") toc.docId = null;
  Object.assign(state, { id, name, bytes, pdf, ann: keepAnn || (mem && mem.ann) || (saved && saved.ann) || presetAnn || {}, undo: [], redo: [], zoom: 1, pages: [], curPage: 1 });
  if (!saved && presetAnn) scheduleSave();
  $("docTitle").textContent = name;
  document.title = name + " · Margin";
  pagesEl.innerHTML = "";
  viewer.scrollTop = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const wrap = document.createElement("div");
    wrap.className = "page"; wrap.dataset.i = String(n - 1);
    wrap.innerHTML = '<div class="loading">Page ' + n + '</div><div class="num">' + n + "</div>";
    const hits = document.createElement("div"); hits.className = "hits";
    const ink = document.createElement("canvas"); ink.className = "ink";
    const ribbon = document.createElement("div"); ribbon.className = "ribbon"; ribbon.hidden = true;
    wrap.append(hits, ink, ribbon);
    pagesEl.appendChild(wrap);
    state.pages.push({ n, page, vp, w: vp.width, h: vp.height, wrap, pdfCanvas: null, ink, hits, ribbon, s: 1, rendered: 0, rendering: false, inkK: 0 });
  }
  state.bookmarks = (saved && saved.bookmarks) || [];
  state.pageNumbers = (saved && saved.pageNumbers) || null;
  state.text = [];
  resetSearch();
  renderBookmarks();
  statusEl.hidden = true;
  setThumbsDom();
  applyViewMode();
  if (mem) {
    state.undo = mem.undo || []; state.redo = mem.redo || [];
    if (mem.pos) { state.zoom = mem.pos.zoom; layout(); restorePos(mem.pos); }
  }
  tabsAfterOpen(id, name, switching);
  renderToolbar();
  const existing = await DB.get("meta", id);
  const m = existing || { id, name, added: Date.now() };
  if (!existing && lib.assignNext) m.folder = lib.assignNext;
  lib.assignNext = null;
  m.pages = pdf.numPages; m.opened = Date.now(); m.notes = countAnn(state.ann);
  await DB.put("meta", m);
  if (!m.thumb || m.thumbPages !== pdf.numPages) makeCoverThumb(pdf).then(async (t) => {
    if (!t) return;
    const cur = (await DB.get("meta", id)) || m;
    cur.thumb = t; cur.thumbPages = pdf.numPages;
    DB.put("meta", cur);
  });
  try { localStorage.setItem("margin-last", id); } catch (e) {}
  return true;
}
function showStatus(msg) { statusEl.textContent = msg; statusEl.hidden = false; }

/* a file with a name that is already in the library gets " (01)", " (02)" ... added */
async function uniqueName(base) {
  const names = new Set((await DB.all("meta")).map((m) => String(m.name || "").toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let i = 1; i < 1000; i++) { const nm = base + " (" + String(i).padStart(2, "0") + ")"; if (!names.has(nm.toLowerCase())) return nm; }
  return base + " (" + Date.now() + ")";
}
async function addFile(file) {
  if (!file) return;
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const head = String.fromCharCode.apply(null, bytes.subarray(0, 1024));
  const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1];
  const lower = ext ? ext.toLowerCase() : "";
  if (head.indexOf("%PDF") < 0) {
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
    if (lower === "pptx" || (isZip && lower !== "ppt")) return convertPptx(file, buf);
    if (lower === "ppt" || isOle) {
      closeLibrary();
      toast("Old .ppt files can't be converted here. Open it in Keynote or PowerPoint, then export it as PDF or save it as .pptx and open that.", 9000);
      return;
    }
    toast("Margin opens PDF and PowerPoint (.pptx) files.");
    return;
  }
  const name = await uniqueName(file.name.replace(/\.pdf$/i, ""));
  const id = name + "|" + file.size + "|" + Date.now().toString(36);
  closeLibrary();
  const ok = await openDoc(id, name, bytes);
  if (ok) {
    await DB.put("files", { id, bytes });
    const m = await DB.get("meta", id);
    if (m) { m.size = file.size; DB.put("meta", m); }
  }
}
$("fileInput").addEventListener("change", (e) => { addFile(e.target.files[0]); e.target.value = ""; });

/* ---------- PowerPoint (.pptx) to PDF ---------- */
const H2C_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const PPTX_UMD = "https://cdn.jsdelivr.net/npm/pptx-preview@1.0.7/dist/pptx-preview.umd.js";
const PPTX_ESM = "https://cdn.jsdelivr.net/npm/pptx-preview@1.0.7/+esm";
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error("load " + src));
    document.head.appendChild(s);
  });
}
let converterP = null;
function ensureConverter() {
  if (!converterP) converterP = (async () => {
    if (!window.html2canvas) await loadScript(H2C_URL);
    if (!(window.pptxPreview && window.pptxPreview.init)) { try { await loadScript(PPTX_UMD); } catch (e) {} }
    if (window.pptxPreview && window.pptxPreview.init) return window.pptxPreview;
    const m = await import(PPTX_ESM);
    if (!m || !m.init) throw new Error("converter missing");
    return m;
  })().catch((e) => { converterP = null; throw e; });
  return converterP;
}
function waitImages(root) {
  const imgs = Array.from(root.querySelectorAll("img")).filter((i) => !i.complete);
  return Promise.race([
    Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))),
    new Promise((r) => setTimeout(r, 8000))
  ]);
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
let converting = false;
async function convertPptx(file, buf) {
  if (converting) { toast("Another presentation is still converting."); return; }
  converting = true;
  closeLibrary();
  const name = await uniqueName(file.name.replace(/\.pptx?$/i, ""));
  showStatus("Getting the slide converter ready…");
  const hostEl = document.createElement("div");
  hostEl.setAttribute("aria-hidden", "true");
  hostEl.style.cssText = "position:fixed;left:-40000px;top:0;width:1280px;pointer-events:none;background:#fff;color:#000;";
  document.body.appendChild(hostEl);
  try {
    const lib = await ensureConverter();
    showStatus("Reading " + name + "…");
    const W = 1280;
    let H = 720;
    let pv = lib.init(hostEl, { width: W, height: H, mode: "list" });
    await pv.preview(buf.slice(0));
    const sw = pv.pptx && pv.pptx.width, sh = pv.pptx && pv.pptx.height;
    if (sw && sh && Math.abs(sh / sw - H / W) > 0.01) {
      try { pv.destroy && pv.destroy(); } catch (e) {}
      hostEl.innerHTML = "";
      H = Math.round(W * sh / sw);
      pv = lib.init(hostEl, { width: W, height: H, mode: "list" });
      await pv.preview(buf.slice(0));
    }
    await waitImages(hostEl);
    try { await document.fonts.ready; } catch (e) {}
    await nextFrame();
    let slides = Array.from(hostEl.querySelectorAll(".pptx-preview-slide-wrapper"));
    if (!slides.length) throw new Error("no slides");
    const out = await PDFLib.PDFDocument.create();
    out.setTitle(name);
    const PW = 720, PH = Math.round(720 * H / W * 100) / 100;
    for (let i = 0; i < slides.length; i++) {
      showStatus("Converting slide " + (i + 1) + " of " + slides.length + "…");
      await nextFrame();
      const c = await window.html2canvas(slides[i], { backgroundColor: "#ffffff", scale: 1.5, logging: false, useCORS: true });
      const jpg = await out.embedJpg(c.toDataURL("image/jpeg", 0.88));
      c.width = 0; c.height = 0;
      const pg = out.addPage([PW, PH]);
      pg.drawImage(jpg, { x: 0, y: 0, width: PW, height: PH });
    }
    const bytes = await out.save();
    const id = name + "|" + file.size + "|pptx|" + Date.now().toString(36);
    const ok = await openDoc(id, name, bytes);
    if (ok) {
      await DB.put("files", { id, bytes });
      const m = await DB.get("meta", id);
      if (m) { m.size = bytes.length; m.from = "pptx"; DB.put("meta", m); }
      toast("Converted " + slides.length + (slides.length === 1 ? " slide" : " slides") + " to PDF. Tap Share PDF to save or send it.", 6000);
    }
  } catch (e) {
    if (state.pdf) statusEl.hidden = true;
    else showStatus("This presentation couldn't be converted.");
    toast(String(e && e.message).indexOf("load") === 0
      ? "The slide converter didn't load. Check your connection and try again."
      : "This presentation couldn't be converted. Try exporting it as PDF from Keynote or PowerPoint.", 7000);
  } finally {
    hostEl.remove();
    converting = false;
  }
}
$("openBtn").onclick = () => { lib.assignNext = lib.folder !== "all" ? lib.folder : null; $("fileInput").click(); };

/* ---------- layout & rendering ---------- */
function padsOf() {
  const cs = getComputedStyle(pagesEl);
  return { x: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), y: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) };
}
function baseWidth() {
  return Math.max(200, Math.min(viewer.clientWidth - padsOf().x, 1000));
}
function baseHeight() {
  return Math.max(200, viewer.clientHeight - padsOf().y);
}
function layout() {
  const mode = state.viewMode, bw = baseWidth(), bh = baseHeight();
  for (const p of state.pages) {
    let fit;
    if (mode === "horizontal") fit = bh / p.h;
    else if (mode === "single") fit = Math.min(bw / p.w, bh / p.h);
    else fit = (bw * (p.w / Math.max(p.w, maxPageW()))) / p.w;
    p.s = fit * state.zoom;
    p.wrap.style.width = Math.round(p.w * p.s) + "px";
    p.wrap.style.height = Math.round(p.h * p.s) + "px";
    p.inkK = 0;
  }
  updateVisible();
  if (textEdit) positionTextEdit();
}
function applyViewMode() {
  const mode = state.viewMode;
  pagesEl.className = "pages mode-" + mode;
  $("prevPage").hidden = $("nextPage").hidden = mode !== "single";
  const cur = state.curPage || 1;
  for (const p of state.pages) p.wrap.hidden = mode === "single" && p.n !== cur;
  layout();
  goToPage(cur);
}
let _maxW = 0;
function maxPageW() { if (!_maxW || _maxW.doc !== state.id || _maxW.count !== state.pages.length) { _maxW = { doc: state.id, count: state.pages.length, v: Math.max.apply(null, state.pages.map((p) => p.w)) }; } return _maxW.v; }

function dprFor(p) {
  const cssW = p.w * p.s, cssH = p.h * p.s;
  const d = Math.min(window.devicePixelRatio || 1, 2.5);
  return Math.min(d, Math.sqrt(PIXEL_CAP / (cssW * cssH)));
}
async function renderPage(p) {
  if (p.rendering || p.rendered === p.s) return;
  p.rendering = true;
  const s = p.s, k = s * dprFor(p);
  const vp = p.page.getViewport({ scale: k });
  const c = document.createElement("canvas");
  c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  try {
    await p.page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    if (p.pdfCanvas) { p.pdfCanvas.width = 0; p.pdfCanvas.remove(); }
    const ld = p.wrap.querySelector(".loading"); if (ld) ld.remove();
    p.wrap.insertBefore(c, p.wrap.firstChild);
    p.pdfCanvas = c; p.rendered = s;
  } catch (e) { c.width = 0; }
  p.rendering = false;
  if (p.s !== s && p.near) renderPage(p);
  else if (p.near) scheduleDetail();
  if (zoom.on && zoom.p === p) refreshZoom();
}
function dropDetail(p) { if (p.detail) { p.detail.width = 0; p.detail.remove(); p.detail = null; } }
let detailTimer = 0;
function scheduleDetail() { clearTimeout(detailTimer); detailTimer = setTimeout(renderDetails, 180); }
async function renderDetails() { for (const p of state.pages) if (p.near) await renderDetail(p); }
async function renderDetail(p) {
  if (p.detailBusy) return;
  if (!p.pdfCanvas || dprFor(p) >= fullDpr() - 0.01) { dropDetail(p); return; }
  const v = visRegion(p, 0);
  if (!v) return;
  const c0 = p.detail;
  if (c0 && c0.s === p.s && v.x >= c0.R.x - 0.5 && v.y >= c0.R.y - 0.5 && v.x + v.w <= c0.R.x + c0.R.w + 0.5 && v.y + v.h <= c0.R.y + c0.R.h + 0.5) return;
  const R = visRegion(p, 0.2), s0 = p.s, doc = state.id;
  const d = Math.min(fullDpr(), Math.sqrt(PIXEL_CAP / (R.w * R.h * s0 * s0))), k = s0 * d;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(R.w * k)); c.height = Math.max(1, Math.round(R.h * k));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
  p.detailBusy = true;
  try { await p.page.render({ canvasContext: ctx, viewport: p.page.getViewport({ scale: k, offsetX: -R.x * k, offsetY: -R.y * k }) }).promise; }
  catch (e) { c.width = 0; p.detailBusy = false; return; }
  p.detailBusy = false;
  if (doc !== state.id || p.s !== s0 || !p.near || !p.pdfCanvas) { c.width = 0; return; }
  c.className = "detail"; c.s = s0; c.R = R;
  placeCanvas(c, p, R);
  dropDetail(p);
  p.pdfCanvas.after(c);
  p.detail = c;
}
function freePage(p) {
  dropDetail(p);
  if (p.pdfCanvas) { p.pdfCanvas.width = 0; p.pdfCanvas.remove(); p.pdfCanvas = null; }
  p.rendered = 0;
  if (p.inkK) { p.ink.width = 0; p.ink.height = 0; p.inkK = 0; }
}
function updateVisible() {
  const mode = state.viewMode;
  const horiz = mode === "horizontal";
  const pos = horiz ? viewer.scrollLeft : viewer.scrollTop;
  const span = horiz ? viewer.clientWidth : viewer.clientHeight;
  let best = null, bestD = Infinity;
  for (const p of state.pages) {
    if (mode === "single") {
      p.near = p.n === (state.curPage || 1);
      if (!p.near && Math.abs(p.n - (state.curPage || 1)) > 1 && (p.rendered || p.inkK)) freePage(p);
      if (p.near) { renderPage(p); if (!p.inkK || (!inkCovers(p) && !(active && active.p === p))) drawInk(p); best = p; }
      continue;
    }
    const a = horiz ? p.wrap.offsetLeft : p.wrap.offsetTop;
    const len = (horiz ? p.w : p.h) * p.s;
    p.near = a + len > pos - span && a < pos + 2 * span;
    const far = a + len < pos - 3 * span || a > pos + 4 * span;
    if (p.near) { renderPage(p); if (!p.inkK || (!inkCovers(p) && !(active && active.p === p))) drawInk(p); }
    else if (far && (p.rendered || p.inkK)) freePage(p);
    const d = Math.abs(a + len / 2 - (pos + span / 2));
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) state.curPage = best.n;
  scheduleDetail();
  if (best) markThumb(best.n);
  $("pageNo").innerHTML = best ? '<span class="pn-num">' + best.n + " / " + state.pages.length + '</span><svg class="chev" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg>' : "";
  $("fsPage").textContent = best ? best.n + " / " + state.pages.length : "";
  const marked = !!(best && (state.bookmarks || []).some((b) => b.n === best.n));
  $("bmBtn").setAttribute("aria-pressed", String(marked));
  $("bmBtn").setAttribute("aria-label", marked ? "Remove this page from favorites" : "Add this page to favorites");
  $("bmLabel").textContent = marked ? "Remove from favorites" : "Add to favorites";
  if (mode === "single") {
    $("prevPage").disabled = (state.curPage || 1) <= 1;
    $("nextPage").disabled = (state.curPage || 1) >= state.pages.length;
  }
}
let scrollRaf = 0;
viewer.addEventListener("scroll", () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; updateVisible(); }); });
let resizeT = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(relayoutKeep, 120);
});

/* single-page mode: buttons, swipes and arrow keys */
const reduceMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
function playAnim(el, cls) {
  if (reduceMotion.matches || !el) return;
  el.classList.remove("enter-next", "enter-prev", "enter-up", "enter-down", "enter-fade");
  void el.offsetWidth;
  el.classList.add(cls);
  const done = () => { el.classList.remove(cls); el.removeEventListener("animationend", done); };
  el.addEventListener("animationend", done);
  setTimeout(done, 600);
}
/* one-page view: pages slide side by side when you change page */
let turning = null;
function snapshotPage(p) {
  if (!p || p.wrap.hidden || !p.pdfCanvas) return null;
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = "position:absolute;pointer-events:none;background:#fff;border-radius:2px;box-shadow:var(--shadow-page);backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden;will-change:transform;" +
    "left:" + p.wrap.offsetLeft + "px;top:" + p.wrap.offsetTop + "px;width:" + p.wrap.offsetWidth + "px;height:" + p.wrap.offsetHeight + "px;filter:" + getComputedStyle(p.wrap).filter + ";";
  for (const c of [p.pdfCanvas, p.detail, p.inkK ? p.ink : null]) {
    if (!c || !c.width) continue;
    const cc = document.createElement("canvas");
    cc.width = c.width; cc.height = c.height;
    cc.getContext("2d").drawImage(c, 0, 0);
    cc.style.cssText = "position:absolute;display:block;left:" + (c.style.left || "0") + ";top:" + (c.style.top || "0") + ";width:" + (c.style.width || "100%") + ";height:" + (c.style.height || "100%") + ";" + (c === p.ink ? "mix-blend-mode:multiply;" : "");
    box.appendChild(cc);
  }
  return box;
}
function turnPage(snap, np, fwd) {
  if (turning) turning();
  if (!snap) return;
  /* side by side: the old page slides out while the new one slides in next to it */
  const ms = 380, ease = "cubic-bezier(.25, .8, .25, 1)";
  const dist = Math.max(np.wrap.offsetWidth, parseFloat(snap.style.width) || 0) + 28;
  const out = fwd ? -dist : dist;
  snap.style.zIndex = "2";
  snap.style.backfaceVisibility = snap.style.webkitBackfaceVisibility = "";
  viewer.appendChild(snap);
  const anims = [
    snap.animate([{ transform: "translateX(0)" }, { transform: "translateX(" + out + "px)" }], { duration: ms, easing: ease, fill: "forwards" }),
    np.wrap.animate([{ transform: "translateX(" + (-out) + "px)" }, { transform: "translateX(0)" }], { duration: ms, easing: ease })
  ];
  const vx = viewer.style.overflowX;
  viewer.style.overflowX = "hidden";
  let done = false;
  const finish = () => {
    if (done) return;
    done = true; turning = null; clearTimeout(t);
    anims.forEach((a) => { try { a.cancel(); } catch (e) {} });
    snap.querySelectorAll("canvas").forEach((c) => { c.width = 0; });
    snap.remove();
    viewer.style.overflowX = vx;
  };
  const t = setTimeout(finish, ms + 300);
  anims[1].finished.then(finish, finish);
  turning = finish;
}
function showSingle(n, animate, axis) {
  n = Math.max(1, Math.min(state.pages.length, n));
  const from = state.curPage || 1;
  const snap = animate && n !== from && !reduceMotion.matches && typeof Element.prototype.animate === "function" ? snapshotPage(state.pages[from - 1]) : null;
  state.curPage = n;
  for (const p of state.pages) p.wrap.hidden = p.n !== n;
  viewer.scrollTop = 0; viewer.scrollLeft = 0;
  updateVisible();
  if (!animate || n === from) return;
  if (snap) turnPage(snap, state.pages[n - 1], n > from);
  else playAnim(state.pages[n - 1].wrap, axis === "y" ? (n > from ? "enter-up" : "enter-down") : (n > from ? "enter-next" : "enter-prev"));
}
function pageStep(d, axis) {
  const n = (state.curPage || 1) + d;
  if (n < 1 || n > state.pages.length) { toast(d > 0 ? "This is the last page." : "This is the first page.", 1400); return; }
  if (state.viewMode === "single") showSingle(n, true, axis);
  else goToPage(n, null, true);
}
$("prevPage").onclick = () => pageStep(-1);
$("nextPage").onclick = () => pageStep(1);
let swipe = null;
viewer.addEventListener("touchstart", (e) => {
  if (state.viewMode !== "single" || e.touches.length !== 1) { swipe = null; return; }
  const t = e.touches[0];
  const fingerPasses = t.touchType !== "stylus" && (state.pencilOnly || state.tool === "hand");
  swipe = fingerPasses ? {
    x: t.clientX, y: t.clientY, t: Date.now(),
    atTop: viewer.scrollTop <= 1,
    atBottom: viewer.scrollTop + viewer.clientHeight >= viewer.scrollHeight - 1
  } : null;
}, { passive: true });
viewer.addEventListener("touchend", (e) => {
  if (!swipe || state.viewMode !== "single") return;
  const t = e.changedTouches[0], s = swipe; swipe = null;
  const dx = t.clientX - s.x, dy = t.clientY - s.y;
  const fits = viewer.scrollWidth <= viewer.clientWidth + 2;
  const quick = Date.now() - s.t < 700;
  if (multi || pinch) return;
  if (fits && quick && Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) pageStep(dx < 0 ? 1 : -1, "x");
  else if (quick && Math.abs(dy) > 70 && Math.abs(dy) > 2 * Math.abs(dx)) {
    if (dy < 0 && s.atBottom) pageStep(1, "y");
    else if (dy > 0 && s.atTop) pageStep(-1, "y");
  }
});
/* mouse wheel / trackpad in one-page view */
let wheelAcc = 0, wheelLock = 0;
viewer.addEventListener("wheel", (e) => {
  if (state.viewMode !== "single" || e.ctrlKey) return;
  const atTop = viewer.scrollTop <= 1, atBottom = viewer.scrollTop + viewer.clientHeight >= viewer.scrollHeight - 1;
  if (!((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop))) { wheelAcc = 0; return; }
  e.preventDefault();
  if (Date.now() < wheelLock) return;
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) > 120) { pageStep(wheelAcc > 0 ? 1 : -1, "y"); wheelAcc = 0; wheelLock = Date.now() + 450; }
}, { passive: false });
