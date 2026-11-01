function setRuler(on) {
  if (!ruler.el) buildRuler();
  ruler.on = on;
  ruler.el.hidden = !on;
  rulerBtn.setAttribute("aria-pressed", String(on));
  if (on) {
    const r = viewer.getBoundingClientRect();
    ruler.L = Math.min(820, Math.max(320, r.width * 0.8));
    if (!ruler.cx || ruler.cx > window.innerWidth || ruler.cy > window.innerHeight) { ruler.cx = r.left + r.width / 2; ruler.cy = r.top + r.height * 0.55; }
    placeRuler();
    if (!localStorage.getItem("margin-ruler-tip")) { toast("Drag the ruler with one finger, turn it with two. Draw along its edge for a straight line.", 5000); try { localStorage.setItem("margin-ruler-tip", "1"); } catch (e) {} }
  }
}
/* a pen or highlighter stroke that starts within reach of a long edge sticks to that edge */
function rulerBegin(e) {
  ruler.lock = null;
  if (!ruler.on || (state.tool !== "pen" && state.tool !== "hl")) return;
  const { d, n } = rulerVec();
  const dx = e.clientX - ruler.cx, dy = e.clientY - ruler.cy;
  const along = dx * d[0] + dy * d[1], across = dx * n[0] + dy * n[1];
  if (Math.abs(along) > ruler.L / 2 + 30) return;
  const edge = across < 0 ? -1 : 1;
  const gap = Math.abs(across) - ruler.T / 2;
  if (gap < 30) ruler.lock = edge;
}
function rulerSnap(ev) {
  if (!ruler.lock || !ruler.on) return ev;
  const { d, n } = rulerVec();
  const off = ruler.lock * (ruler.T / 2 + 2);
  const ex = ruler.cx + n[0] * off, ey = ruler.cy + n[1] * off;
  const t = (ev.clientX - ex) * d[0] + (ev.clientY - ey) * d[1];
  return { clientX: ex + d[0] * t, clientY: ey + d[1] * t, pressure: ev.pressure, pointerType: ev.pointerType };
}
const rulerBtn = document.createElement("button");
rulerBtn.type = "button"; rulerBtn.className = "tool"; rulerBtn.id = "rulerBtn";
rulerBtn.setAttribute("aria-pressed", "false"); rulerBtn.setAttribute("aria-label", "Ruler"); rulerBtn.title = "Ruler: draw straight lines along its edge";
rulerBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="2.5" y="8" width="19" height="8" rx="1.2"/><path d="M6 8v3M9.5 8v4.5M13 8v3M16.5 8v4.5"/></svg>';
$("fitBtn").before(rulerBtn);
rulerBtn.onclick = () => setRuler(!ruler.on);
window.addEventListener("resize", () => { if (ruler.on) placeRuler(); });

/* ---------- share with editable notes: real PDF annotations other apps can move or delete ---------- */
async function buildPdfEditable() {
  const { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray } = PDFLib;
  const out = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
  const ctx = out.context, opages = out.getPages();
  const embedded = new Map();
  const pnFont = pnActive() ? await out.embedFont(PDFLib.StandardFonts.Helvetica) : null;
  const f2 = (v) => (Math.round(v * 100) / 100).toString();
  const rgb = (hex) => { const c = hexRgb(hex); return [c.red, c.green, c.blue]; };
  const addAnnot = (page, dict) => {
    const ref = ctx.register(ctx.obj(dict));
    let annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) { annots = ctx.obj([]); page.node.set(PDFName.of("Annots"), annots); }
    annots.push(ref);
  };
  const form = (bbox, content, resources) => ctx.register(ctx.stream(content, { Type: "XObject", Subtype: "Form", BBox: bbox, Resources: resources || {} }));
  const stamp = { T: PDFHexString.fromText("Margin"), M: PDFString.fromDate(new Date()), F: 4 };
  for (const p of state.pages) {
    const op = opages[p.n - 1];
    const P = (x, y) => p.vp.convertToPdfPoint(x, y);
    const label = pnActive() ? pnLabel(p.n) : null;
    if (label) {
      const pn = state.pageNumbers, tw = pnFont.widthOfTextAtSize(label, pn.size), M = 28;
      const x = pn.h === "left" ? M : pn.h === "center" ? (p.w - tw) / 2 : p.w - M - tw;
      const y = pn.v === "top" ? M + pn.size * 0.75 : p.h - M + pn.size * 0.1;
      const r = P(x, y);
      op.drawText(label, { x: r[0], y: r[1], size: pn.size, font: pnFont, color: PDFLib.rgb(0.33, 0.35, 0.4) });
    }
    const items = state.ann[p.n];
    if (!items || !items.length) continue;
    for (const it of items) {
      if (it.type === "img") {
        /* photos stay part of the page */
        let emb = embedded.get(it.src);
        if (!emb) { emb = it.src.indexOf("data:image/png") === 0 ? await out.embedPng(it.src) : await out.embedJpg(it.src); embedded.set(it.src, emb); }
        const bl = P(it.x, it.y + it.h);
        op.drawImage(emb, { x: bl[0], y: bl[1], width: it.w, height: it.h });
      } else if (it.type === "pen" || it.type === "hl") {
        const hl = it.type === "hl";
        const D = hl || it.pts.length < 3 ? it.pts : curvePts(it.pts, 3);
        const pts = D.map((q) => P(q[0], q[1]));
        if (pts.length === 1) pts.push([pts[0][0] + 0.3, pts[0][1]]);
        let w = it.w;
        if (!hl) { let s = 0; for (let i = 1; i < D.length; i++) s += penWidth(it, D[i - 1], D[i]); w = D.length > 1 ? s / (D.length - 1) : it.w * 0.9; }
        const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
        const rect = [Math.min(...xs) - w, Math.min(...ys) - w, Math.max(...xs) + w, Math.max(...ys) + w];
        const c = rgb(it.color), alpha = hl ? HL_ALPHA : 1;
        let path = "";
        pts.forEach((q, i) => { path += f2(q[0]) + " " + f2(q[1]) + (i ? " l " : " m "); });
        const content = "q /GS0 gs 1 J 1 j " + f2(w) + " w " + c.map(f2).join(" ") + " RG " + path + "S Q";
        const ap = form(rect, content, { ExtGState: { GS0: { Type: "ExtGState", CA: alpha, ca: alpha, BM: hl ? "Multiply" : "Normal" } } });
        addAnnot(op, Object.assign({
          Type: "Annot", Subtype: "Ink", Rect: rect, InkList: [pts.flatMap((q) => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100])],
          C: c, CA: alpha, BS: { Type: "Border", W: Math.round(w * 100) / 100, S: "S" }, AP: { N: ap }
        }, stamp));
      } else if (it.type === "note" && it.text) {
        const a = P(it.x, it.y), b = P(it.x + 20, it.y + 20);
        addAnnot(op, Object.assign({
          Type: "Annot", Subtype: "Text", Rect: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
          Contents: PDFHexString.fromText(it.text), C: rgb(it.color), Name: "Comment", Open: false
        }, stamp));
      } else if (it.type === "text" && it.text) {
        if (it.font && it.font !== "sans" && document.fonts) { try { await document.fonts.load("16px " + fontStack(it), it.text.slice(0, 200)); } catch (e) {} }
        const S = 3, cv = document.createElement("canvas"), cx = cv.getContext("2d");
        const L = textLayout(cx, it), tw = it.w + 4, th = L.h + 2;
        cv.width = Math.ceil(tw * S); cv.height = Math.ceil(th * S);
        cx.setTransform(S, 0, 0, S, 0, 0);
        drawTextItem(cx, Object.assign({}, it), 0, 0);
        const png = await out.embedPng(cv.toDataURL("image/png"));
        const a = P(it.x, it.y), b = P(it.x + tw, it.y + th);
        const rect = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
        const ap = form(rect, "q " + f2(rect[2] - rect[0]) + " 0 0 " + f2(rect[3] - rect[1]) + " " + f2(rect[0]) + " " + f2(rect[1]) + " cm /Im0 Do Q", { XObject: { Im0: png.ref } });
        const c = rgb(it.color || "#1b1f2a"), size = Math.round(it.size || 13);
        addAnnot(op, Object.assign({
          Type: "Annot", Subtype: "FreeText", Rect: rect, Contents: PDFHexString.fromText(it.text),
          DA: PDFString.of("/Helv " + size + " Tf " + c.map(f2).join(" ") + " rg"), BS: { Type: "Border", W: 0 }, AP: { N: ap }
        }, stamp));
      }
    }
  }
  return out.save();
}
(() => {
  const b = document.createElement("button");
  b.className = "menu-item"; b.id = "shareEditable"; b.type = "button"; b.setAttribute("role", "menuitem");
  b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 20l4.2-1L19 8.2 15.8 5 5 15.8z"/><path d="M13.8 7l3.2 3.2M15 20h5"/></svg><span><b>With editable notes</b><small>Marks stay movable in other PDF apps</small></span>';
  $("shareNotes").after(b);
  b.onclick = async () => {
    hidePop();
    if (!state.bytes || exporting) return;
    if (!window.PDFLib) { toast("The export engine didn't load. Reload the page and try again."); return; }
    exporting = true; $("shareBtn").disabled = true;
    toast("Preparing your PDF…", 20000);
    try {
      const bytes = await buildPdfEditable();
      await deliver(bytes, safeName() + " (editable notes).pdf");
    } catch (e) {
      toast("Couldn't build the PDF. If it's locked or damaged, try another copy of it.", 5000);
    } finally { exporting = false; $("shareBtn").disabled = false; }
  };
})();

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
