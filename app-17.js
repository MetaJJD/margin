const opCtl = document.createElement("label");
opCtl.className = "imgop"; opCtl.title = "Photo opacity";
opCtl.innerHTML = '<span>Opacity</span><input type="range" min="10" max="100" step="5" aria-label="Photo opacity">';
const opIn = opCtl.querySelector("input");
imgSel.querySelector(".selbar").prepend(opCtl);
for (const ev of ["pointerdown", "touchstart", "mousedown"]) opCtl.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
let opBefore = null;
opIn.addEventListener("input", () => {
  if (!sel || sel.item.type !== "img") return;
  if (opBefore == null) opBefore = sel.item.op == null ? 1 : sel.item.op;
  sel.item.op = +opIn.value / 100;
  drawInk(sel.p);
});
opIn.addEventListener("change", () => {
  if (!sel || opBefore == null) return;
  const after = sel.item.op == null ? 1 : sel.item.op;
  if (after !== opBefore) commit({ t: "edit", n: sel.p.n, item: sel.item, before: { op: opBefore }, after: { op: after } });
  opBefore = null;
});
{
  const sI = selectImage;
  selectImage = function (p, item) {
    sI.apply(this, arguments);
    opCtl.hidden = item.type !== "img";
    opIn.value = String(Math.round((item.op == null ? 1 : item.op) * 100));
  };
  /* undo and redo move the slider too */
  const uS = updateImgSel;
  updateImgSel = function () { uS.apply(this, arguments); if (sel && sel.item.type === "img" && opBefore == null) opIn.value = String(Math.round((sel.item.op == null ? 1 : sel.item.op) * 100)); };
}

/* ---------- Settings (was View) and tool options in a floating panel ---------- */
{
  const vb = $("viewBtn");
  vb.title = "Settings"; vb.setAttribute("aria-label", "Settings");
  vb.querySelector(".lbl").textContent = "Settings";
  vb.querySelector("svg").outerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  $("viewPop").setAttribute("aria-label", "Settings");
}
const toolPop = document.createElement("div");
toolPop.className = "toolpop"; toolPop.hidden = true;
toolPop.setAttribute("role", "dialog"); toolPop.setAttribute("aria-label", "Tool options");
{
  const opts = document.querySelector(".row2 .options");
  /* saved pens stay in the toolbar for one-tap switching */
  const keep = document.createElement("div"); keep.id = "penPresets"; keep.className = "pen-presets";
  keep.setAttribute("role", "group"); keep.setAttribute("aria-label", "Saved pens");
  opts.after(keep);
  toolPop.appendChild(opts);
  document.body.appendChild(toolPop);
  const css = document.createElement("style");
  css.textContent = ".toolpop { position: fixed; z-index: 44; background: var(--bar); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 14px 36px rgba(10,20,40,.24); padding: 8px 10px; box-sizing: border-box; max-width: calc(100vw - 16px); }\n" +
    ".toolpop::before { content: \"\"; position: absolute; top: -6px; left: var(--ax, 24px); width: 10px; height: 10px; background: var(--bar); border-left: 1px solid var(--line); border-top: 1px solid var(--line); transform: translateX(-50%) rotate(45deg); }\n" +
    ".toolpop.above::before { top: auto; bottom: -6px; transform: translateX(-50%) rotate(225deg); }\n" +
    ".toolpop.beside::before { display: none; }\n" +
    ".toolpop .options { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }\n" +
    ".toolpop .swatches, .toolpop .sizes { flex-wrap: wrap; align-items: center; gap: 6px; }\n" +
    ".toolpop .tool-hint { white-space: normal; max-width: 260px; }\n" +
    "body.read-night .toolpop { filter: none; }\n";
  document.head.appendChild(css);
}
let tpAnchor = null, tpTool = null, pillAnchor = null;
function toolHasOptions() {
  const sw = $("swatches"), sz = $("sizes");
  return (!sw.hidden && sw.childElementCount > 0) || (!sz.hidden && sz.childElementCount > 0);
}
function hideToolPop() { toolPop.hidden = true; tpTool = null; }
function placeToolPop() {
  if (toolPop.hidden || !tpAnchor) return;
  const r = tpAnchor.getBoundingClientRect();
  if (!r.width && !r.height) { hideToolPop(); return; }
  const vw = window.innerWidth, vh = window.innerHeight, w = toolPop.offsetWidth, h = toolPop.offsetHeight, cx = r.left + r.width / 2;
  let left = Math.max(8, Math.min(vw - w - 8, cx - w / 2)), top = r.bottom + 10;
  toolPop.classList.remove("above", "beside");
  if (top + h > vh - 8) {
    if (r.top - h - 10 >= 8) { top = r.top - h - 10; toolPop.classList.add("above"); }
    else { top = Math.max(8, Math.min(vh - h - 8, r.top + r.height / 2 - h / 2)); left = r.right + 10 + w < vw ? r.right + 10 : Math.max(8, r.left - w - 10); toolPop.classList.add("beside"); }
  }
  toolPop.style.left = Math.round(left) + "px"; toolPop.style.top = Math.round(top) + "px";
  toolPop.style.setProperty("--ax", Math.round(Math.max(14, Math.min(w - 14, cx - left))) + "px");
}
function showToolPop(anchor) {
  tpAnchor = anchor; tpTool = state.tool;
  if (!toolHasOptions()) { hideToolPop(); return; }
  hidePop();
  toolPop.hidden = false;
  placeToolPop();
}
/* tap a tool: its options float below it; tap the same tool again to hide them */
$("fsPill").addEventListener("click", (e) => { const b = e.target.closest("[data-fstool]"); pillAnchor = b || null; }, true);
document.querySelector(".row2").addEventListener("click", (e) => {
  const b = e.target.closest(".tool[data-tool]");
  if (!b) return;
  const t = b.dataset.tool, wasOpen = !toolPop.hidden && tpTool === t;
  const anchor = pillAnchor && pillAnchor.dataset.fstool === t ? pillAnchor : b;
  pillAnchor = null;
  setTimeout(() => { if (wasOpen) hideToolPop(); else if (state.tool === t) showToolPop(anchor); }, 0);
}, true);
document.addEventListener("pointerdown", (e) => {
  if (toolPop.hidden || toolPop.contains(e.target)) return;
  if (e.target.closest && e.target.closest(".tool[data-tool], #fsPill [data-fstool]")) return;
  hideToolPop();
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideToolPop(); });
window.addEventListener("resize", () => placeToolPop());
{
  const rt = renderToolbar;
  renderToolbar = function () {
    rt.apply(this, arguments);
    if (toolPop.hidden) return;
    if (state.tool !== tpTool || !toolHasOptions()) hideToolPop(); else placeToolPop();
  };
}

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

/* ---------- boot ---------- */
async function openMostRecent() {
  const metas = (await DB.all("meta")).sort((a, b) => (b.opened || 0) - (a.opened || 0));
  for (const m of metas) {
    const f = await DB.get("files", m.id);
    if (f && await openDoc(m.id, m.name, f.bytes)) return true;
  }
  return openSample();
}
async function openSample() {
  if (!window.PDFLib) { showStatus("The PDF engine didn't load. Check your connection and reload the page."); return false; }
  const s = await makeSample();
  const id = "sample-welcome", name = "Welcome to Margin";
  await DB.put("files", { id, bytes: s.bytes });
  await DB.del("ann", id);
  return openDoc(id, name, s.bytes, s.ann);
}
async function boot() {
  loadPrefs();
  renderToolbar();
  if (!window.pdfjsLib) { showStatus("The PDF engine didn't load. Check your connection and reload the page."); return; }
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; } catch (e) {}
  let last = null;
  try { last = localStorage.getItem("margin-last"); } catch (e) {}
  if (last) {
    const m = await DB.get("meta", last), f = await DB.get("files", last);
    if (m && f && await openDoc(m.id, m.name, f.bytes)) return;
  }
  await openMostRecent();
}
boot();
})();
