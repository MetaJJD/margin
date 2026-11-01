/* ---------- backup & restore ---------- */
function bytesToB64(u8) {
  let out = "";
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) out += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(out);
}
function b64ToBytes(b) {
  const bin = atob(b), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
async function backupAll() {
  if (textEdit) closeTextEdit();
  clearTimeout(saveTimer);
  if (state.id) await DB.put("ann", { id: state.id, ann: stripAnn(state.ann), bookmarks: state.bookmarks || [], pageNumbers: state.pageNumbers || null });
  const metas = await DB.all("meta");
  if (!metas.length) { toast("There's nothing to back up yet."); return; }
  toast("Preparing your backup…", 30000);
  const docs = [];
  for (const m of metas) {
    const f = await DB.get("files", m.id);
    if (!f || !f.bytes) continue;
    const a = await DB.get("ann", m.id);
    docs.push({ meta: m, pdf: bytesToB64(f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes)), ann: a || null });
  }
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem("margin-prefs") || "{}"); } catch (e) {}
  const data = { app: "Margin", version: 1, created: new Date().toISOString(), docs, customColors, prefs };
  const d = new Date();
  const name = "Margin backup " + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + ".json";
  await deliver(new Blob([JSON.stringify(data)], { type: "application/json" }), name, "application/json",
    "Backup saved with " + docs.length + (docs.length === 1 ? " file" : " files") + ". Keep it in iCloud Drive to be safe.");
}
async function restoreBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
  if (!data || data.app !== "Margin" || !Array.isArray(data.docs)) { toast("That file isn't a Margin backup.", 4000); return; }
  toast("Restoring…", 30000);
  let n = 0;
  for (const d of data.docs) {
    if (!d || !d.meta || !d.meta.id || !d.pdf) continue;
    const id = d.meta.id;
    try {
      await DB.put("files", { id, bytes: b64ToBytes(d.pdf) });
      await DB.put("meta", d.meta);
      if (d.ann) await DB.put("ann", Object.assign({}, d.ann, { id }));
      delete tabs.mem[id];
      n++;
    } catch (e) {}
  }
  if (data.customColors && typeof data.customColors === "object") {
    for (const k in data.customColors) (data.customColors[k] || []).slice().reverse().forEach((c) => addCustom(k, c));
  }
  toast("Restored " + n + (n === 1 ? " file" : " files") + " with their notes.", 5000);
  if (state.id && data.docs.some((d) => d && d.meta && d.meta.id === state.id)) {
    const f = await DB.get("files", state.id);
    if (f) { tabs.skipStash = state.id; const cur = state.id; state.id = null; await openDoc(cur, state.name, f.bytes); }
  } else if (!state.id) await openMostRecent();
  openLibrary();
}
$("fmBackup").onclick = () => { hidePop(); backupAll(); };
$("fmRestore").onclick = () => { hidePop(); $("backupInput").click(); };
$("backupInput").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) restoreBackup(f); });

/* ---------- popover menus (View, Insert) ---------- */
let openPop = null;
function showPop(pop, btn) {
  if (openPop === pop) { hidePop(); return; }
  hidePop();
  pop.hidden = false; openPop = pop; openPop._btn = btn;
  btn.setAttribute("aria-expanded", "true");
  const r = btn.getBoundingClientRect(), w = pop.offsetWidth, vw = window.innerWidth;
  pop.style.top = Math.round(r.bottom + 8) + "px";
  const left = r.left + r.width / 2 < vw / 2 ? r.left : r.right - w;
  pop.style.left = Math.round(Math.max(8, Math.min(vw - w - 8, left))) + "px";
}
function hidePop() {
  if (!openPop) return;
  openPop.hidden = true;
  openPop._btn.setAttribute("aria-expanded", "false");
  openPop = null;
}
document.addEventListener("pointerdown", (e) => {
  if (openPop && !openPop.contains(e.target) && !openPop._btn.contains(e.target)) hidePop();
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hidePop(); });
$("viewBtn").onclick = () => {
  $("viewOpts").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === state.viewMode)));
  showPop($("viewPop"), $("viewBtn"));
};
$("viewOpts").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  setViewMode(b.dataset.v);
  $("viewOpts").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === state.viewMode)));
});
$("zoomFit").onclick = () => setZoom(1);
$("pagePop").addEventListener("click", (e) => { if (e.target.closest(".menu-item")) hidePop(); });
$("filesPop").addEventListener("click", (e) => { if (e.target.closest(".menu-item")) hidePop(); });
$("fmOpen").onclick = () => openLibrary();
$("fmNew").onclick = () => openPageSheet("new");

/* ---------- sample document ---------- */
async function makeSample() {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle("Welcome to Margin");
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.13, 0.18), grey = rgb(0.38, 0.42, 0.48), blue = rgb(0.17, 0.33, 0.79);
  const ann = { 1: [], 2: [] };
  const H = 792;

  const p1 = doc.addPage([612, 792]);
  p1.drawText("SAMPLE DOCUMENT", { x: 64, y: 724, size: 9, font: bold, color: blue });
  p1.drawText("Welcome to Margin", { x: 64, y: 690, size: 30, font: bold, color: ink });
  p1.drawText("A PDF reader for iPad where you can write, highlight and share.", { x: 64, y: 662, size: 13, font: reg, color: grey });
  const lines = [
    ["How to use it", bold, 15],
    ["1. Tap Files to open a PDF or PowerPoint, or to start a new PDF.", reg, 12],
    ["2. Pick Pen and write with Apple Pencil. Your finger keeps scrolling.", reg, 12],
    ["3. Pick Highlight and drag across a line of text, like this one.", reg, 12],
    ["4. Pick Note and tap anywhere to leave a typed note.", reg, 12],
    ["5. Tap Share to save a copy with every mark built into the pages.", reg, 12],
    ["    Send that file by AirDrop, LINE, Messages or email.", reg, 12],
    ["    Your friends can open it in any PDF app. They don't need Margin.", reg, 12],
    ["", reg, 12],
    ["Tips", bold, 15],
    ["- Tap the page number for Go to page, Favorites and Add a page.", reg, 12],
    ["- Pinch with two fingers, or use + and -, to zoom.", reg, 12],
    ["- The Eraser removes a whole stroke or note in one touch.", reg, 12],
    ["- Undo and Redo work across every page.", reg, 12],
    ["- Your PDFs and notes stay in this browser on this device.", reg, 12],
    ["- To use Margin like an app, tap Share in Safari, then Add to Home Screen.", reg, 12]
  ];
  let y = 610;
  const pos = [];
  for (const [t, f, s] of lines) {
    if (s > 12) y -= 8;
    if (t) p1.drawText(t, { x: 64, y, size: s, font: f, color: s > 12 ? ink : rgb(0.18, 0.2, 0.26) });
    pos.push({ t, y, w: t ? f.widthOfTextAtSize(t, s) : 0 });
    y -= s > 12 ? 24 : 21;
  }
  // highlight on step 3
  const l3 = pos[3], hy = H - l3.y - 3.6;
  ann[1].push({ type: "hl", color: HL_COLORS[0], w: 14, pts: [[63, hy, .5], [64 + l3.w * 0.5, hy - 0.4, .5], [65 + l3.w, hy, .5]] });
  // pen underline squiggle under the title
  const sq = [];
  for (let i = 0; i <= 60; i++) { const x = 64 + i * 4.6; sq.push([round2(x), round2(H - 682 + 9 + Math.sin(i / 3.2) * 1.6), round2(0.35 + 0.5 * Math.sin(Math.PI * i / 60))]); }
  ann[1].push({ type: "pen", color: PEN_COLORS[1], w: 2, pts: sq });
  // pen check marks next to step 1 and 2
  [pos[1], pos[2]].forEach((l) => {
    const cy = H - l.y - 4;
    ann[1].push({ type: "pen", color: PEN_COLORS[3], w: 2, pts: [[40, cy, .4], [44, cy + 4, .7], [52, cy - 6, .6]] });
  });
  ann[1].push({ type: "note", x: 400, y: 116, color: NOTE_COLORS[0], text: "This is an example note. Pick Note, then tap it to edit or delete it." });

  const p2 = doc.addPage([612, 792]);
  p2.drawText("PRACTICE PAGE", { x: 64, y: 724, size: 9, font: bold, color: blue });
  p2.drawText("Reading with a pen in hand", { x: 64, y: 690, size: 24, font: bold, color: ink });
  const para = [
    "Most of what we read slips away within a day. Marking a page slows you down",
    "just enough to decide what matters. A line under a sentence is a small promise",
    "to come back to it, and a word in the margin is a conversation with the author.",
    "",
    "Try it here. Underline the sentence you agree with most. Circle a word you would",
    "look up. Highlight the one idea you would explain to a friend over dinner. Then",
    "leave a note with a question you still have.",
    "",
    "When you're done, tap Share PDF. The copy you send keeps every mark exactly where",
    "you put it, on every page, in any PDF app your friends happen to use. They can",
    "add their own notes and send it back. That's how a reading group works when",
    "everyone lives in a different city.",
    "",
    "A few habits make annotation more useful. Use one colour for things you agree",
    "with and another for things you doubt. Keep notes short enough to read at a",
    "glance. Write the page number of related ideas next to each other, so the",
    "document starts to link to itself."
  ];
  y = 650;
  for (const t of para) { if (t) p2.drawText(t, { x: 64, y, size: 12, font: reg, color: rgb(0.18, 0.2, 0.26), lineHeight: 18 }); y -= 20; }
  p2.drawText("Margin keeps this page clear for you to practise on.", { x: 64, y: 120, size: 10, font: reg, color: grey });
  ann[2].push({ type: "note", x: 420, y: 92, color: NOTE_COLORS[1], text: "Your turn: try every tool on this page." });

  return { bytes: await doc.save(), ann };
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
