function pePosition() {
  const c = pe.cur; if (!c) return;
  const { p, item } = c, s = p.s;
  pe.box.style.left = (item.x * s) + "px";
  pe.box.style.top = (item.y * s) + "px";
  pe.box.style.width = (peCoverW(item) * s) + "px";
  pe.box.style.height = (item.h * s) + "px";
  const t = pe.txt;
  t.style.background = item.bg; t.style.color = item.color;
  t.style.font = peFont(item, item.size * s);
  t.style.lineHeight = (item.h * s) + "px";
  t.style.paddingLeft = ((item.bx - item.x) * s) + "px";
  t.style.transform = item.hs && item.hs !== 1 ? "scaleX(" + item.hs + ")" : "";
  t.style.minWidth = (100 / (item.hs || 1)) + "%";
  pe.bar.querySelector('[data-a="bold"]').classList.toggle("pe-on", !!item.bold);
  pe.bar.querySelector('[data-a="italic"]').classList.toggle("pe-on", !!item.italic);
}
function peShow(p, item, isNew, ink) {
  pe.cur = { p, item, isNew, ink: ink || item.color, before: peSnap(item) };
  pe.txt.textContent = item.text;
  p.wrap.appendChild(pe.box);
  peDots(); pePosition();
  placeBoxBar(pe.box, pe.bar);
  drawInk(p);
  pe.focus = true;
}
function peClose(keep) {
  const c = pe.cur; if (!c) return;
  pe.cur = null; pe.focus = false;
  pe.box.remove();
  const { p, item, isNew, before } = c;
  item.text = pe.txt.textContent.replace(/\s*\n\s*/g, " ").replace(/\s+$/, "");
  const list = (state.ann[p.n] = state.ann[p.n] || []);
  if (!keep) Object.assign(item, before);
  else if (isNew) {
    if (item.text !== item.orig || item.color !== c.ink || item.bold !== c.b0 || item.italic !== c.i0 || item.size !== c.s0) { list.push(item); commit({ t: "add", n: p.n, item }); }
  } else {
    const after = peSnap(item);
    if (JSON.stringify(after) !== JSON.stringify(before)) commit({ t: "edit", n: p.n, item, before, after });
  }
  drawInk(p);
}
pe.bar.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-a]"); if (!b || !pe.cur) return;
  const it = pe.cur.item, a = b.dataset.a;
  if (a === "done") { peClose(true); return; }
  if (a === "cancel") { peClose(false); return; }
  if (a === "remove") { pe.txt.textContent = ""; it.text = ""; peClose(true); toast("Text removed. Undo brings it back.", 2500); return; }
  if (a === "smaller") it.size = Math.max(4, Math.round(it.size / 1.1 * 10) / 10);
  if (a === "bigger") it.size = Math.min(96, Math.round(it.size * 1.1 * 10) / 10);
  if (a === "bold") it.bold = !it.bold;
  if (a === "italic") it.italic = !it.italic;
  pePosition(); placeBoxBar(pe.box, pe.bar);
});
document.addEventListener("pointerup", () => {
  if (!pe.focus || !pe.cur) return;
  pe.focus = false;
  try {
    pe.txt.focus({ preventScroll: true });
    const r = document.createRange(); r.selectNodeContents(pe.txt);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  } catch (e) {}
}, true);
/* tap a line with the tool to edit it */
function peStart(e, p, map) {
  e.preventDefault();
  if (textEdit) closeTextEdit();
  if (pe.cur) peClose(true);
  const pt = map(e);
  const eds = (state.ann[p.n] || []).filter((it) => it.type === "edit");
  for (let i = eds.length - 1; i >= 0; i--) {
    const it = eds[i];
    if (pt[0] >= it.x - 2 && pt[0] <= it.x + peCoverW(it) + 2 && pt[1] >= it.y - 2 && pt[1] <= it.y + it.h + 2) { peShow(p, it, false, it.ink || it.color); return; }
  }
  const lines = pe.lines[p.n];
  if (!lines) { peLines(p).then(() => drawInk(p)); toast("Reading the text on this page… tap the line again.", 2500); return; }
  let L = null, bd = Infinity;
  for (const l of lines) {
    if (pt[0] < l.x - 4 || pt[0] > l.x + l.w + 4 || pt[1] < l.y - 3 || pt[1] > l.y + l.h + 3) continue;
    const d = Math.abs(pt[1] - (l.y + l.h / 2));
    if (d < bd) { bd = d; L = l; }
  }
  if (!L) { toast(lines.length ? "Tap right on a line of text (the dotted boxes)." : "This page has no typed text to edit. It may be a scanned image.", 3000); return; }
  const f = peFontOf(p, L);
  const item = { type: "edit", x: round2(L.x - 1), y: round2(L.y), w: round2(L.w + 2), h: round2(L.h), bx: round2(L.x), base: round2(L.base),
    size: round2(L.fh), font: f.font, bold: f.bold, italic: f.italic, bg: "#ffffff", color: "#111827", ink: "#111827", text: L.str, orig: L.str, hs: 1 };
  const nat = peMeasure(item, L.str);
  if (nat > 0) item.hs = Math.round(Math.max(0.7, Math.min(1.35, L.w / nat)) * 1000) / 1000;
  peShow(p, item, true, item.color);
  Object.assign(pe.cur, { b0: item.bold, i0: item.italic, s0: item.size });
  const cur = pe.cur;
  peColours(p, L).then((col) => {
    if (!col || pe.cur !== cur) return;
    item.bg = col.bg; item.ink = col.ink; cur.ink = col.ink;
    if (item.color === "#111827") item.color = col.ink;
    cur.before.color = item.color;
    pePosition(); peDots();
  });
}
{
  const si = startInput;
  startInput = function (e, p, map) {
    if (state.tool === "pdfedit") { peStart(e, p, map); return; }
    if (pe.cur) peClose(true);
    return si.apply(this, arguments);
  };
  new ResizeObserver(() => { if (pe.cur) { pePosition(); placeBoxBar(pe.box, pe.bar); } }).observe(pagesEl);
}

/* -- shared PDFs: edited lines are written into the pages first -- */
async function peBake(fn) {
  const has = state.pages.some((p) => (state.ann[p.n] || []).some((it) => it.type === "edit"));
  if (!has) return fn();
  const doc = await PDFLib.PDFDocument.load(state.bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  for (const p of state.pages) {
    const eds = (state.ann[p.n] || []).filter((it) => it.type === "edit");
    if (!eds.length) continue;
    const op = pages[p.n - 1];
    for (const it of eds) {
      const cw = peCoverW(it);
      const a = p.vp.convertToPdfPoint(it.x, it.y + it.h), b = p.vp.convertToPdfPoint(it.x + cw, it.y);
      const rx = Math.min(a[0], b[0]), ry = Math.min(a[1], b[1]), rw = Math.abs(b[0] - a[0]), rh = Math.abs(b[1] - a[1]);
      op.drawRectangle({ x: rx, y: ry, width: rw, height: rh, color: hexRgb(it.bg) });
      if (!it.text) continue;
      const S = 4, c = document.createElement("canvas");
      c.width = Math.ceil(cw * S); c.height = Math.ceil(it.h * S);
      const ctx = c.getContext("2d"); ctx.scale(S, S);
      peDrawText(ctx, it, it.x, it.y);
      const png = await doc.embedPng(c.toDataURL("image/png"));
      op.drawImage(png, { x: rx, y: ry, width: rw, height: rh });
    }
  }
  const saved = state.bytes;
  state.bytes = await doc.save();
  try { return await fn(); } finally { state.bytes = saved; }
}
{
  const bp = buildPdf;
  buildPdf = function () { const self = this, args = arguments; return peBake(() => bp.apply(self, args)); };
  const be = buildPdfEditable;
  buildPdfEditable = function () { const self = this, args = arguments; return peBake(() => be.apply(self, args)); };
}

/* -- the Edit PDF tool button (tools bar and full screen bar) -- */
{
  const ICON = '<svg viewBox="0 0 24 24"><path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4"/><path d="M9 11.5h6M12 11.5v6"/></svg>';
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "tool"; btn.dataset.tool = "pdfedit";
  btn.setAttribute("aria-pressed", "false"); btn.title = "Edit PDF text: tap a line of the PDF's own text to change it";
  btn.innerHTML = ICON + "<span>Edit PDF</span>";
  document.querySelector('.tool[data-tool="text"]').after(btn);
  btn.addEventListener("click", () => {
    if (textEdit) closeTextEdit(); if (lassoSel) clearLassoSel();
    state.tool = "pdfedit"; savePrefs(); renderToolbar();
    for (const p of state.pages) if (p.near) drawInk(p);
  });
  const fsb = document.createElement("button");
  fsb.type = "button"; fsb.className = "icon-btn"; fsb.dataset.fstool = "pdfedit";
  fsb.setAttribute("aria-label", "Edit PDF text"); fsb.title = "Edit PDF text";
  fsb.innerHTML = ICON; fsb.querySelector("svg").style.fill = "none";
  (document.querySelector('#fsPill [data-fstool="text"]') || $("fsFit")).after(fsb);
  fsb.onclick = () => btn.click();
  let was = null;
  const rt = renderToolbar;
  renderToolbar = function () {
    rt.apply(this, arguments);
    const on = state.tool === "pdfedit";
    fsb.setAttribute("aria-pressed", String(on));
    fsb.style.background = on ? "var(--chip-on)" : ""; fsb.style.color = on ? "var(--accent)" : "";
    if (on) {
      const sz = $("sizes"); sz.hidden = false;
      const h = document.createElement("span"); h.className = "tool-hint";
      h.textContent = "Tap a line of the PDF’s own text to change it. Dotted boxes show what can be edited; green ones you’ve changed.";
      sz.appendChild(h);
    }
    if (was !== null && was !== on) { if (!on && pe.cur) peClose(true); for (const p of state.pages) if (p.near) drawInk(p); }
    was = on;
  };
}

/* ---------- keep the screen awake while Margin is open ---------- */
const wake = { on: false, lock: null, video: null };
try { wake.on = localStorage.getItem("margin-awake") === "1"; } catch (e) {}
async function wakeHold() {
  if (!wake.on || document.visibilityState !== "visible") return;
  if (navigator.wakeLock && (!wake.lock || wake.lock.released)) {
    try { wake.lock = await navigator.wakeLock.request("screen"); } catch (e) { wake.lock = null; }
  }
  /* backup for iPads where the request above isn't honoured: a tiny silent video playing out of sight */
  if (!wake.video) {
    const v = wake.video = document.createElement("video");
    v.muted = true; v.loop = true; v.playsInline = true;
    v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
    v.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;";
    v.src = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANBbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAD6AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAmt0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAD6AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAA+gAAAAAAABAAAAAAHjbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAABAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABjm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAU5zdGJsAAAAtnN0c2QAAAAAAAAAAQAAAKZhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALGF2Y0MBQsAK/+EAFWdCwAraewEQAAADABAAAAMAQPEiagEABGjOD8gAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAFiAAABYgAAAAYc3R0cwAAAAAAAAABAAAACAAAIAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAACAAAAAEAAAA0c3RzegAAAAAAAAAAAAAACAAAAoUAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAAFHN0Y28AAAAAAAAAAQAAA3EAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYwLjE2LjEwMAAAAAhmcmVlAAACzG1kYXQAAAJvBgX//2vcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MSBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgxOjB4MTExIG1lPWhleCBzdWJtZT0yIHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTAgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0wIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PTAgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTIgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD0xMCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAOZYiEBX///w9FAAFC34AAAAAFQZogFfUAAAAFQZpAFfUAAAAFQZpgFfUAAAAFQZqAFPUAAAAFQZqgFPUAAAAFQZrAFPUAAAAFQZrgEvU=";
    document.body.appendChild(v);
  }
  if (wake.video.paused) { try { await wake.video.play(); } catch (e) {} }
}
function wakeLetGo() {
  if (wake.lock) { try { wake.lock.release(); } catch (e) {} wake.lock = null; }
  if (wake.video) wake.video.pause();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wakeHold(); });
document.addEventListener("pointerdown", () => { if (wake.on && ((!wake.lock || wake.lock.released) || (wake.video && wake.video.paused))) wakeHold(); }, true);
{
  const row = document.createElement("button");
  row.type = "button"; row.className = "setting-row"; row.id = "awakeBtn";
  row.innerHTML = '<span><b>Keep screen awake</b><small>The iPad screen stays on while Margin is open, so it won’t dim or lock while you read or write.</small></span><span class="toggle"><span class="knob"></span></span>';
  const lab = document.createElement("div"); lab.className = "pop-label"; lab.textContent = "Screen";
  $("pencilBtn").after(lab, row);
  const sync = () => row.setAttribute("aria-pressed", String(wake.on));
  sync();
  row.onclick = () => {
    wake.on = !wake.on;
    try { localStorage.setItem("margin-awake", wake.on ? "1" : "0"); } catch (e) {}
    sync();
    if (wake.on) { wakeHold(); toast("The screen stays on while Margin is open.", 2500); } else { wakeLetGo(); toast("The screen can turn off as usual.", 2500); }
  };
  if (wake.on) wakeHold();
}

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
