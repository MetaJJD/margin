/* ---------- PowerPoint (.pptx) to PDF ---------- */
const H2C_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const PPTX_UMD = "https://cdn.jsdelivr.net/npm/pptx-preview@1.0.7/dist/pptx-preview.umd.js";
const PPTX_ESM = "https://cdn.jsdelivr.net/npm/pptx-preview@1.0.7/+esm";
/* the main converter: lays slides out like PowerPoint (text, bullets, tables, charts, shapes) */
const PPTX_R = "https://cdn.jsdelivr.net/npm/@aiden0z/pptx-renderer@1.4.0/dist/aiden0z-pptx-renderer.browser.es.js";
let rendererP = null;
function ensureRenderer() {
  if (!rendererP) rendererP = (async () => {
    if (!window.html2canvas) await loadScript(H2C_URL);
    const m = await import(PPTX_R);
    if (!m || !m.PptxViewer) throw new Error("renderer missing");
    return m;
  })().catch((e) => { rendererP = null; throw e; });
  return rendererP;
}
/* lay out every slide in hostEl with the main converter; returns the slide elements */
async function layoutSlides(hostEl, buf, W) {
  const R = await ensureRenderer();
  hostEl.style.width = W + "px";
  const viewer = await R.PptxViewer.open(buf.slice(0), hostEl, { zipLimits: R.RECOMMENDED_ZIP_LIMITS, width: W, pdfjs: false, listOptions: { windowed: false } });
  await waitImages(hostEl);
  try { await document.fonts.ready; } catch (e) {}
  await nextFrame(); await nextFrame();
  const slides = Array.from(hostEl.children).filter((el) => el.offsetWidth > 100 && el.offsetHeight > 50);
  if (!slides.length) throw new Error("no slides");
  return { slides, done: () => { try { viewer.destroy && viewer.destroy(); } catch (e) {} } };
}
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
    const W = 1280;
    let H = 720, slides = null, done = () => {}, sharp = 2;
    try {
      showStatus("Reading " + name + "…");
      const r = await layoutSlides(hostEl, buf, W);
      slides = r.slides; done = r.done;
      H = Math.round(slides[0].offsetHeight * W / slides[0].offsetWidth);
    } catch (e) {
      /* fall back to the simpler converter */
      hostEl.innerHTML = ""; slides = null; sharp = 1.5;
    }
    if (!slides) {
      const lib = await ensureConverter();
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
      slides = Array.from(hostEl.querySelectorAll(".pptx-preview-slide-wrapper"));
      if (!slides.length) throw new Error("no slides");
    }
    const out = await PDFLib.PDFDocument.create();
    out.setTitle(name);
    const PW = 720, PH = Math.round(720 * H / W * 100) / 100;
    for (let i = 0; i < slides.length; i++) {
      showStatus("Converting slide " + (i + 1) + " of " + slides.length + "…");
      await nextFrame();
      const c = await window.html2canvas(slides[i], { backgroundColor: "#ffffff", scale: sharp, logging: false, useCORS: true });
      const jpg = await out.embedJpg(c.toDataURL("image/jpeg", 0.9));
      c.width = 0; c.height = 0;
      const pg = out.addPage([PW, PH]);
      pg.drawImage(jpg, { x: 0, y: 0, width: PW, height: PH });
    }
    done();
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
