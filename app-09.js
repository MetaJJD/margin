/* ---------- export & share ---------- */
const downloadsP = (window.claude && typeof window.claude.use === "function")
  ? window.claude.use("downloads").catch(() => null) : Promise.resolve(null);

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
async function buildPdf() {
  const { PDFDocument, LineCapStyle, BlendMode } = PDFLib;
  const out = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
  const opages = out.getPages();
  const embedded = new Map();
  const pnFont = pnActive() ? await out.embedFont(PDFLib.StandardFonts.Helvetica) : null;
  for (const p of state.pages) {
    const label = pnActive() ? pnLabel(p.n) : null;
    if (label) {
      const pn = state.pageNumbers, op0 = opages[p.n - 1];
      const tw = pnFont.widthOfTextAtSize(label, pn.size);
      const M = 28;
      const x = pn.h === "left" ? M : pn.h === "center" ? (p.w - tw) / 2 : p.w - M - tw;
      const y = pn.v === "top" ? M + pn.size * 0.75 : p.h - M + pn.size * 0.1;
      const r = p.vp.convertToPdfPoint(x, y);
      op0.drawText(label, { x: r[0], y: r[1], size: pn.size, font: pnFont, color: PDFLib.rgb(0.33, 0.35, 0.4) });
    }
    const items = state.ann[p.n];
    if (!items || !items.length) continue;
    const op = opages[p.n - 1];
    const P = (x, y) => { const r = p.vp.convertToPdfPoint(x, y); return { x: r[0], y: r[1] }; };
    for (const it of items.filter((i) => i.type === "img")) {
      let emb = embedded.get(it.src);
      if (!emb) { emb = it.src.indexOf("data:image/png") === 0 ? await out.embedPng(it.src) : await out.embedJpg(it.src); embedded.set(it.src, emb); }
      const bl = P(it.x, it.y + it.h);
      op.drawImage(emb, { x: bl.x, y: bl.y, width: it.w, height: it.h, opacity: it.op == null ? 1 : it.op });
    }
    const hlGroups = new Map();
    for (const it of items.filter((i) => i.type === "hl")) {
      let d = "";
      it.pts.forEach((q, i) => { const r = P(q[0], q[1]); d += (i ? "L" : "M") + r.x.toFixed(2) + " " + (-r.y).toFixed(2) + " "; });
      if (it.pts.length === 1) { const r = P(it.pts[0][0] + 0.2, it.pts[0][1]); d += "L" + r.x.toFixed(2) + " " + (-r.y).toFixed(2); }
      const key = it.color + "|" + it.w;
      hlGroups.set(key, (hlGroups.get(key) || "") + d);
    }
    for (const [key, d] of hlGroups) {
      const [color, w] = key.split("|");
      op.drawSvgPath(d, { x: 0, y: 0, borderColor: hexRgb(color), borderWidth: +w, borderOpacity: HL_ALPHA, borderLineCap: LineCapStyle.Round, blendMode: BlendMode.Multiply });
    }
    for (const it of items.filter((i) => i.type === "pen")) {
      const color = hexRgb(it.color), Q = it.pts;
      if (Q.length === 1) { const r = P(Q[0][0], Q[0][1]); op.drawCircle({ x: r.x, y: r.y, size: it.w * 0.6, color }); continue; }
      if (it.sharp || it.fill || it.style) { pdfStyled(op, it, P); continue; }
      const D = curvePts(Q, 3);
      for (let i = 1; i < D.length; i++) {
        op.drawLine({ start: P(D[i - 1][0], D[i - 1][1]), end: P(D[i][0], D[i][1]), thickness: penWidth(it, D[i - 1], D[i]), color, lineCap: LineCapStyle.Round });
      }
    }
    for (const it of items.filter((i) => i.type === "text" && i.text)) {
      if (it.font && it.font !== "sans" && document.fonts) { try { await document.fonts.load("16px " + fontStack(it), it.text.slice(0, 200)); } catch (e) {} }
      const S = 3, c = document.createElement("canvas"), ctx = c.getContext("2d");
      const L = textLayout(ctx, it);
      c.width = Math.ceil((it.w + 4) * S); c.height = Math.ceil((L.h + 2) * S);
      ctx.setTransform(S, 0, 0, S, 0, 0);
      drawTextItem(ctx, Object.assign({}, it), 0, 0);
      const png = await out.embedPng(c.toDataURL("image/png"));
      const bl = P(it.x, it.y + L.h + 2);
      op.drawImage(png, { x: bl.x, y: bl.y, width: it.w + 4, height: L.h + 2 });
    }
    for (const it of items.filter((i) => i.type === "note")) {
      const S = 3, c = document.createElement("canvas"), ctx = c.getContext("2d");
      const L = noteLayout(ctx, it.text);
      c.width = Math.ceil(L.w * S); c.height = Math.ceil(L.h * S);
      ctx.setTransform(S, 0, 0, S, 0, 0);
      drawNote(ctx, Object.assign({}, it), 0, 0);
      const png = await out.embedPng(c.toDataURL("image/png"));
      const bl = P(it.x, it.y + L.h);
      op.drawImage(png, { x: bl.x, y: bl.y, width: L.w, height: L.h });
    }
  }
  return out.save();
}
let exporting = false;
function safeName() { return state.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Document"; }
async function shareAnnotated() {
  if (!state.bytes || exporting) return;
  if (!window.PDFLib) { toast("The export engine didn't load. Reload the page and try again."); return; }
  exporting = true; $("shareBtn").disabled = true;
  toast("Preparing your PDF…", 20000);
  try {
    const bytes = await buildPdf();
    const extra = countAnn(state.ann) || pnActive();
    await deliver(bytes, safeName() + (extra ? " (with notes).pdf" : ".pdf"));
  } catch (e) {
    toast("Couldn't build the PDF. If it's locked or damaged, try another copy of it.", 5000);
  } finally { exporting = false; $("shareBtn").disabled = false; }
}
async function shareOriginal() {
  if (!state.bytes || exporting) return;
  exporting = true; $("shareBtn").disabled = true;
  try { await deliver(state.bytes.slice(), safeName() + ".pdf"); }
  finally { exporting = false; $("shareBtn").disabled = false; }
}
$("shareBtn").onclick = () => {
  if (!state.bytes) { toast("Open a PDF first."); return; }
  const n = countAnn(state.ann);
  $("shareNotesHint").textContent = n
    ? n + (n === 1 ? " mark" : " marks") + (pnActive() ? " and page numbers" : "") + " built into the pages"
    : (pnActive() ? "Page numbers built into the pages" : "No notes on this file yet");
  showPop($("sharePop"), $("shareBtn"));
};
$("shareNotes").onclick = () => { hidePop(); shareAnnotated(); };
$("shareOrig").onclick = () => { hidePop(); shareOriginal(); };
async function deliver(bytes, filename, mime, savedMsg) {
  mime = mime || "application/pdf";
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  const dl = await downloadsP;
  if (dl) {
    try {
      await dl.save({ filename, data: blob });
      toast(savedMsg || "Saved. Send it to friends from Files, or by AirDrop, LINE or email.", 5000);
      return;
    } catch (err) {
      const code = err && err.code;
      if (code === "declined") { toast("Not saved."); return; }
      if (code === "rate_limited") { toast("A save is already waiting. Finish it, then try again."); return; }
    }
  }
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      toast("Shared " + filename);
      return;
    }
  } catch (err) { if (err && err.name === "AbortError") { toast("Not shared."); return; } }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast("Downloaded " + filename);
}

/* ---------- new PDF & add page ---------- */
const MM = 72 / 25.4;
const SIZES = { A4: [210, 297], A5: [148, 210], B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
const pf = { mode: "new", orient: "portrait", tpl: "lined", pos: "after" };
try { const s = JSON.parse(localStorage.getItem("margin-page") || "{}"); if (s.tpl) pf.tpl = s.tpl; if (s.size) pf.size = s.size; if (s.orient) pf.orient = s.orient; } catch (e) {}

function drawTemplate(page, tpl) {
  const { rgb } = PDFLib;
  const { width, height } = page.getSize();
  if (tpl === "grid") {
    const g = 5 * MM, c = rgb(0.78, 0.84, 0.91);
    for (let x = g; x < width; x += g) page.drawLine({ start: { x, y: 0 }, end: { x, y: height }, thickness: 0.35, color: c });
    for (let y = height - g; y > 0; y -= g) page.drawLine({ start: { x: 0, y }, end: { x: width, y }, thickness: 0.35, color: c });
    return;
  }
  if (tpl === "dots") {
    const g = 5 * MM, c = rgb(0.62, 0.67, 0.74);
    for (let x = g; x < width - 1; x += g) for (let y = height - g; y > 1; y -= g) page.drawCircle({ x, y, size: 0.55, color: c });
    return;
  }
  if (tpl === "cornell") {
    const rule = rgb(0.66, 0.77, 0.87), frame = rgb(0.45, 0.55, 0.68);
    const head = height - 22 * MM, foot = Math.min(50 * MM, height * 0.22), cue = Math.min(60 * MM, width * 0.3);
    for (let y = head - 8 * MM; y > foot + 2; y -= 8 * MM) page.drawLine({ start: { x: cue, y }, end: { x: width, y }, thickness: 0.5, color: rule });
    page.drawLine({ start: { x: 0, y: head }, end: { x: width, y: head }, thickness: 1, color: frame });
    page.drawLine({ start: { x: 0, y: foot }, end: { x: width, y: foot }, thickness: 1, color: frame });
    page.drawLine({ start: { x: cue, y: head }, end: { x: cue, y: foot }, thickness: 1, color: frame });
    return;
  }
  if (tpl !== "lined") return;
  const gap = 8 * MM, top = 25 * MM, bottom = 12 * MM;
  const rule = rgb(0.66, 0.77, 0.87);
  for (let y = height - top; y >= bottom; y -= gap) {
    page.drawLine({ start: { x: 0, y }, end: { x: width, y }, thickness: 0.6, color: rule });
  }
  const mx = Math.min(25 * MM, width * 0.15);
  page.drawLine({ start: { x: mx, y: 0 }, end: { x: mx, y: height }, thickness: 0.8, color: rgb(0.92, 0.55, 0.55) });
}
function currentPageMM() {
  const p = state.pages[(state.curPage || 1) - 1];
  return p ? [p.w / MM, p.h / MM] : SIZES.A4;
}
function chosenSizeMM() {
  const v = $("pfSize").value;
  let w, h;
  if (v === "match") return currentPageMM();
  if (v === "custom") {
    w = Math.max(50, Math.min(1000, parseFloat($("pfW").value) || 210));
    h = Math.max(50, Math.min(1000, parseFloat($("pfH").value) || 297));
  } else [w, h] = SIZES[v];
  const lo = Math.min(w, h), hi = Math.max(w, h);
  return pf.orient === "landscape" ? [hi, lo] : [lo, hi];
}
function renderPageForm() {
  const v = $("pfSize").value;
  $("customField").hidden = v !== "custom";
  $("pfOrient").querySelectorAll("button").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.v === pf.orient)); b.disabled = v === "match"; });
  $("pfTpl").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === pf.tpl)));
  $("pfPos").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === pf.pos)));
  const [w, h] = chosenSizeMM();
  $("sizeHint").textContent = Math.round(w) + " × " + Math.round(h) + " mm";
}
const matchOpt = $("pfSize").querySelector('option[value="match"]');
function openPageSheet(mode, afterPage, pos) {
  if (mode === "add" && !state.bytes) { toast("Open a PDF first."); return; }
  pf.mode = mode;
  const isNew = mode === "new";
  $("pageTitle").textContent = isNew ? "New PDF" : "Add a page";
  $("pageOk").textContent = isNew ? "Create PDF" : "Add page";
  $("nameField").hidden = !isNew;
  $("countField").hidden = !isNew;
  $("posField").hidden = isNew;
  $("fromPdfField").hidden = isNew;
  const sel = $("pfSize");
  if (isNew && matchOpt.parentNode) matchOpt.remove();
  if (!isNew && !matchOpt.parentNode) sel.insertBefore(matchOpt, sel.firstChild);
  $("pfSize").value = isNew ? (pf.size && pf.size !== "match" ? pf.size : "A4") : "match";
  if (isNew) {
    const d = new Date();
    $("pfName").value = "Notes " + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    $("pfCount").value = "1";
  } else {
    pf.afterPage = afterPage || null;
    pf.pos = pos || "after";
    $("pfPosAfter").textContent = "After page " + (pf.afterPage || state.curPage || 1);
  }
  renderPageForm();
  closeLibrary();
  $("pageSheet").hidden = false;
}
function closePageSheet() { $("pageSheet").hidden = true; }
$("newBtn").onclick = () => { lib.assignNext = lib.folder !== "all" ? lib.folder : null; openPageSheet("new"); };
$("addPageBtn").onclick = () => openPageSheet("add");
$("addPageTool").onclick = () => openPageSheet("add");
$("pfFromPdf").onclick = () => $("insertPdfInput").click();
$("insertPdfInput").addEventListener("change", async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  const buf = new Uint8Array(await file.arrayBuffer());
  const head = String.fromCharCode.apply(null, buf.subarray(0, 1024));
  if (head.indexOf("%PDF") < 0) { toast("That file isn't a PDF."); return; }
  closePageSheet();
  await insertPdfPages(buf, insertIndex(pf.pos), file.name.replace(/\.pdf$/i, ""));
});
$("pageClose").onclick = closePageSheet;
$("pageCancel").onclick = closePageSheet;
$("pageSheet").addEventListener("pointerdown", (e) => { if (e.target === $("pageSheet")) closePageSheet(); });
$("pfSize").addEventListener("change", renderPageForm);
$("pfW").addEventListener("input", renderPageForm);
$("pfH").addEventListener("input", renderPageForm);
$("pfOrient").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !b.disabled) { pf.orient = b.dataset.v; renderPageForm(); } });
$("pfTpl").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { pf.tpl = b.dataset.v; renderPageForm(); } });
$("pfPos").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { pf.pos = b.dataset.v; renderPageForm(); } });
$("pageForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!window.PDFLib) { toast("The PDF engine didn't load. Reload the page and try again."); return; }
  const [wmm, hmm] = chosenSizeMM();
  const size = [Math.round(wmm * MM * 100) / 100, Math.round(hmm * MM * 100) / 100];
  if ($("pfSize").value !== "match") pf.size = $("pfSize").value;
  try { localStorage.setItem("margin-page", JSON.stringify({ tpl: pf.tpl, size: pf.size, orient: pf.orient })); } catch (err) {}
  $("pageOk").disabled = true;
  try {
    if (pf.mode === "new") await createPdf(($("pfName").value || "").trim() || "Untitled", size, pf.tpl, parseInt($("pfCount").value, 10) || 1);
    else await insertPage(size, pf.tpl, pf.pos);
    closePageSheet();
  } catch (err) {
    toast(pf.mode === "new" ? "Couldn't create the PDF. Try again." : "Couldn't add a page to this PDF. It may be locked.", 5000);
  } finally { $("pageOk").disabled = false; }
});
async function createPdf(name, size, tpl, count) {
  count = Math.max(1, Math.min(200, count));
  const doc = await PDFLib.PDFDocument.create();
  doc.setTitle(name);
  for (let i = 0; i < count; i++) drawTemplate(doc.addPage(size), tpl);
  const bytes = await doc.save();
  const id = "new-" + Date.now();
  await DB.put("files", { id, bytes });
  if (await openDoc(id, name, bytes)) toast("Created " + name + ". Pick Pen and start writing.");
}
function insertIndex(pos) {
  const idx = pos === "end" ? state.pages.length : (pf.afterPage || state.curPage || 1);
  pf.afterPage = null;
  return Math.max(0, Math.min(state.pages.length, idx));
}
/* save new bytes after inserting k pages at position idx (0-based), shifting notes, favorites and undo */
async function finishInsert(bytes, idx, k, message) {
  const shift = (n) => (n > idx ? n + k : n);
  const ann = {};
  for (const key in state.ann) ann[shift(+key)] = state.ann[key];
  const undo = state.undo, redo = state.redo, zoomLvl = state.zoom, id = state.id, name = state.name;
  undo.concat(redo).forEach((op) => { op.n = shift(op.n); });
  clearTimeout(saveTimer);
  const bookmarks = (state.bookmarks || []).map((b) => Object.assign({}, b, { n: shift(b.n) }));
  await DB.put("files", { id, bytes });
  await DB.put("ann", { id, ann: stripAnn(ann), bookmarks, pageNumbers: state.pageNumbers || null });
  delete tabs.mem[id];
  if (!(await openDoc(id, name, bytes, null, ann))) return;
  state.undo = undo; state.redo = redo;
  if (zoomLvl !== 1) { state.zoom = zoomLvl; layout(); }
  renderToolbar();
  goToPage(idx + 1, null, true);
  toast(message, 3500);
}
async function insertPage(size, tpl, pos) {
  const idx = insertIndex(pos);
  const doc = await PDFLib.PDFDocument.load(state.bytes, { ignoreEncryption: true });
  drawTemplate(doc.insertPage(idx, size), tpl);
  const bytes = await doc.save();
  await finishInsert(bytes, idx, 1, "Added page " + (idx + 1) + ".");
}
async function insertPdfPages(otherBytes, idx, label) {
  if (!state.bytes || pageBusy) return;
  pageBusy = true;
  toast("Adding pages…", 20000);
  try {
    if (textEdit) closeTextEdit();
    clearLassoSel();
    const doc = await PDFLib.PDFDocument.load(state.bytes, { ignoreEncryption: true });
    let other;
    try { other = await PDFLib.PDFDocument.load(otherBytes, { ignoreEncryption: true }); }
    catch (e) { toast("That PDF couldn't be read. It may be locked or damaged.", 4500); return; }
    const copied = await doc.copyPages(other, other.getPageIndices());
    copied.forEach((pg, i) => doc.insertPage(idx + i, pg));
    const bytes = await doc.save();
    const k = copied.length;
    await finishInsert(bytes, idx, k, "Added " + k + (k === 1 ? " page" : " pages") + " from " + label + ", starting at page " + (idx + 1) + ".");
  } catch (e) {
    toast("Couldn't add those pages. This PDF may be locked.", 4500);
  } finally { pageBusy = false; }
}
