/* ---------- edit PDF text, and toolbars that stay with their box ---------- */
/* keep a box's toolbar beside its box and fully on screen (also above the iPad keyboard) */
function placeBoxBar(box, bar) {
  if (!box.isConnected) return;
  const vr = viewer.getBoundingClientRect(), vv = window.visualViewport;
  const top0 = Math.max(vr.top, vv ? vv.offsetTop : 0) + 6;
  const bottom0 = Math.min(vr.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight) - 6;
  const left0 = Math.max(vr.left, 0) + 6, right0 = Math.min(vr.right, window.innerWidth) - 6;
  bar.style.maxWidth = Math.max(160, right0 - left0) + "px";
  bar.style.bottom = "auto"; bar.style.right = "auto";
  const er = box.getBoundingClientRect(), bw = bar.offsetWidth, bh = bar.offsetHeight;
  let top = er.top - 10 - bh;
  if (top < top0) top = er.bottom + 10;
  if (top + bh > bottom0) top = Math.max(top0, Math.min(er.top - 10 - bh, bottom0 - bh));
  const left = Math.max(left0, Math.min(right0 - bw, er.left - 6));
  bar.style.left = Math.round(left - er.left) + "px";
  bar.style.top = Math.round(top - er.top) + "px";
}
{
  const css = document.createElement("style");
  css.textContent = ".page .tbar { flex-wrap: wrap; row-gap: 4px; width: max-content; }\n" +
    ".page .tbar .tdots { display: inline-flex; flex-wrap: nowrap; align-items: center; gap: 4px; }\n" +
    ".viewer.tool-pdfedit .page { cursor: text; }\n" +
    ".page .peedit { outline: 2px solid var(--accent); outline-offset: 2px; }\n" +
    ".page .peedit .pe-text { position: absolute; left: 0; top: 0; min-width: 100%; height: 100%; margin: 0; padding: 0 1px; border: 0; outline: none; white-space: pre; transform-origin: 0 0; color-scheme: light; -webkit-user-select: text; user-select: text; cursor: text; }\n" +
    ".page .tbar .pe-on { background: var(--chip-on); color: var(--accent); }\n" +
    ".page canvas.edits[hidden] { display: none; }\n";
  document.head.appendChild(css);
  const pte = positionTextEdit;
  positionTextEdit = function () { pte.apply(this, arguments); if (textEdit) placeBoxBar(tEdit, tBar); };
  tArea.addEventListener("input", () => { if (textEdit) placeBoxBar(tEdit, tBar); });
}
function placeOpenBars() {
  if (textEdit) placeBoxBar(tEdit, tBar);
  if (pe.cur) { pePosition(); placeBoxBar(pe.box, pe.bar); }
}
viewer.addEventListener("scroll", placeOpenBars, { passive: true });
window.addEventListener("resize", placeOpenBars);
if (window.visualViewport) { visualViewport.addEventListener("resize", placeOpenBars); visualViewport.addEventListener("scroll", placeOpenBars); }

/* -- reading the lines of text on a page -- */
const pe = { lines: {}, loading: {}, cur: null, box: null, bar: null, txt: null, focus: false };
const PE_FAMILY = {
  sans: '"Helvetica Neue", Helvetica, Arial, "PingFang TC", "Noto Sans TC", sans-serif',
  serif: '"Times New Roman", Times, Georgia, "Songti TC", "Noto Serif TC", serif',
  mono: 'Menlo, "Courier New", Courier, monospace'
};
function peFont(it, px) { return (it.italic ? "italic " : "") + (it.bold ? "bold " : "") + px + "px " + (PE_FAMILY[it.font] || PE_FAMILY.sans); }
async function peLines(p) {
  if (pe.lines[p.n]) return pe.lines[p.n];
  if (pe.loading[p.n]) return pe.loading[p.n];
  pe.loading[p.n] = (async () => {
    let tc;
    try { tc = await p.page.getTextContent(); } catch (e) { tc = { items: [], styles: {} }; }
    const runs = [];
    for (const it of tc.items) {
      if (typeof it.str !== "string" || !it.str.length) continue;
      const tx = pdfjsLib.Util.transform(p.vp.transform, it.transform);
      if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) continue; /* only straight, unrotated text */
      const fh = Math.abs(tx[3]) || Math.hypot(tx[2], tx[3]);
      if (fh < 2) continue;
      const st = (tc.styles || {})[it.fontName] || {};
      runs.push({ x: tx[4], base: tx[5], w: it.width * p.vp.scale, fh, str: it.str, fontName: it.fontName, fam: st.fontFamily || "sans-serif", asc: st.ascent || 0.9, desc: Math.abs(st.descent || -0.22) });
    }
    runs.sort((a, b) => (Math.abs(a.base - b.base) > Math.min(a.fh, b.fh) * 0.3 ? a.base - b.base : a.x - b.x));
    const lines = [];
    for (const r of runs) {
      const L = lines[lines.length - 1];
      if (L && Math.abs(L.base - r.base) < Math.min(L.fh, r.fh) * 0.3 && r.x - (L.x + L.w) < L.fh * 1.2 && r.x > L.x + L.w - L.fh * 0.5 && Math.abs(L.fh - r.fh) < L.fh * 0.35) {
        const gap = r.x - (L.x + L.w);
        if (gap > L.fh * 0.15 && !/\s$/.test(L.str) && !/^\s/.test(r.str)) L.str += " ";
        L.str += r.str; L.w = Math.max(L.w, r.x + r.w - L.x);
      } else if (r.str.trim()) lines.push(Object.assign({}, r));
    }
    for (const L of lines) {
      L.str = L.str.replace(/\s+$/, "");
      L.y = L.base - L.fh * L.asc - 1; L.h = L.fh * (L.asc + L.desc) + 2;
    }
    pe.lines[p.n] = lines.filter((L) => L.str.trim());
    delete pe.loading[p.n];
    return pe.lines[p.n];
  })();
  return pe.loading[p.n];
}
/* the PDF's own font: family, bold, italic */
function peFontOf(p, L) {
  let name = "";
  try { const f = p.page.commonObjs.get(L.fontName); name = (f && (f.name || f.loadedName)) || ""; if (f && f.bold) name += " bold"; if (f && f.italic) name += " italic"; } catch (e) {}
  const fam = /mono|courier|consol/i.test(name) || L.fam === "monospace" ? "mono" : /serif/i.test(L.fam) && L.fam !== "sans-serif" || /times|georgia|garamond|minion|song|mincho|serif/i.test(name) && !/sans/i.test(name) ? "serif" : "sans";
  return { font: fam, bold: /bold|black|heavy|semibold|demi|w[6-9]\b/i.test(name), italic: /italic|oblique/i.test(name) };
}
/* look at the real page under the line: paper colour and ink colour */
async function peColours(p, r) {
  const S = 3, pad = 1.5;
  const W = Math.max(4, Math.ceil((r.w + pad * 2) * S)), H = Math.max(4, Math.ceil((r.h + pad * 2) * S));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  const vp = p.page.getViewport({ scale: S, offsetX: -(r.x - pad) * S, offsetY: -(r.y - pad) * S });
  try { await p.page.render({ canvasContext: ctx, viewport: vp }).promise; } catch (e) { return null; }
  const d = ctx.getImageData(0, 0, W, H).data, count = new Map();
  const at = (x, y) => (y * W + x) * 4;
  for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) { const i = at(x, y), k = (d[i] >> 3) + "," + (d[i + 1] >> 3) + "," + (d[i + 2] >> 3); count.set(k, (count.get(k) || 0) + 1); }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = at(x, y), k = (d[i] >> 3) + "," + (d[i + 1] >> 3) + "," + (d[i + 2] >> 3); count.set(k, (count.get(k) || 0) + 1); }
  let best = null, bn = 0;
  for (const [k, n] of count) if (n > bn) { bn = n; best = k; }
  const bg = best.split(",").map((v) => (+v << 3) + 4);
  let far = 0;
  const dist = (i) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
  for (let i = 0; i < d.length; i += 4) far = Math.max(far, dist(i));
  let ink = [17, 24, 39];
  if (far > 60) {
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (dist(i) >= far * 0.75) { rs += d[i]; gs += d[i + 1]; bs += d[i + 2]; n++; }
    if (n) ink = [rs / n, gs / n, bs / n];
  }
  const hex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  return { bg: hex(bg), ink: hex(ink) };
}

/* -- how an edited line is drawn: paper over the old text, new text on top -- */
let peCtx = null;
function peMeasure(it, text) { peCtx = peCtx || document.createElement("canvas").getContext("2d"); peCtx.font = peFont(it, 100); return peCtx.measureText(text).width / 100 * it.size * (it.hs || 1); }
function peCoverW(it) { return Math.max(it.w, it.text ? peMeasure(it, it.text) + (it.bx - it.x) + 2 : 0); }
function peDrawText(ctx, it, ox, oy) {
  if (!it.text) return;
  ctx.save();
  ctx.fillStyle = it.color; ctx.textBaseline = "alphabetic";
  ctx.font = peFont(it, it.size);
  ctx.translate(it.bx - ox, it.base - oy);
  if (it.hs && it.hs !== 1) ctx.scale(it.hs, 1);
  ctx.fillText(it.text, 0, 0);
  ctx.restore();
}
function peDraw(ctx, it) {
  if (pe.cur && pe.cur.item === it) return;
  ctx.save();
  ctx.fillStyle = it.bg; ctx.fillRect(it.x, it.y, peCoverW(it), it.h);
  ctx.restore();
  peDrawText(ctx, it, 0, 0);
}
{
  const dl = drawLayer;
  drawLayer = function (ctx, items) {
    const c = ctx.canvas;
    if (!(c && (c === zInk || (c.classList && c.classList.contains("ink"))))) for (const it of items) if (it.type === "edit") peDraw(ctx, it);
    return dl.apply(this, arguments);
  };
  /* while the tool is on, outline every line that can be edited */
  const di = drawInk;
  drawInk = function (p) {
    const r = di.apply(this, arguments);
    peLayer(p);
    if (state.tool === "pdfedit" && p.inkK) {
      const L = pe.lines[p.n];
      if (!L) { peLines(p).then(() => { if (state.tool === "pdfedit") drawInk(p); }); return r; }
      const ctx = p.ink.getContext("2d"), k = p.inkK, o = p.inkO;
      ctx.save();
      ctx.setTransform(k, 0, 0, k, o ? -o.x * k : 0, o ? -o.y * k : 0);
      ctx.strokeStyle = "rgba(37, 99, 235, .5)"; ctx.lineWidth = 1 / p.s; ctx.setLineDash([3 / p.s, 2 / p.s]);
      const eds = (state.ann[p.n] || []).filter((it) => it.type === "edit");
      for (const l of L) if (!eds.some((e) => Math.abs(e.base - l.base) < 1 && Math.abs(e.bx - l.x) < 1)) ctx.strokeRect(l.x, l.y, l.w, l.h);
      ctx.strokeStyle = "rgba(22, 163, 74, .7)";
      for (const e of eds) ctx.strokeRect(e.x, e.y, peCoverW(e), e.h);
      ctx.restore();
    }
    return r;
  };
  /* the eraser and other stroke tools skip edited lines */
  const sh = strokeHit;
  strokeHit = function (it) { return it.pts ? sh.apply(this, arguments) : false; };
}

/* edited lines get their own layer under the ink (the ink layer darkens, it can't cover) */
function peLayer(p) {
  const eds = (state.ann[p.n] || []).filter((it) => it.type === "edit");
  if (!eds.length && !p.edCv) return;
  if (!p.edCv) { p.edCv = document.createElement("canvas"); p.edCv.className = "edits"; }
  const c = p.edCv;
  if (!eds.length || !p.inkK) { c.hidden = true; return; }
  if (c.nextSibling !== p.ink) p.wrap.insertBefore(c, p.ink);
  if (c.width !== p.ink.width || c.height !== p.ink.height) { c.width = p.ink.width; c.height = p.ink.height; }
  c.style.left = p.ink.style.left; c.style.top = p.ink.style.top; c.style.width = p.ink.style.width; c.style.height = p.ink.style.height;
  c.hidden = false;
  const ctx = c.getContext("2d"), k = p.inkK, o = p.inkO;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, o ? -o.x * k : 0, o ? -o.y * k : 0);
  for (const it of eds) peDraw(ctx, it);
}
/* the zoom window shows edited lines too */
function peZoom() {
  if (!zoom.on || !zoom.p) return;
  const eds = (state.ann[zoom.p.n] || []).filter((it) => it.type === "edit");
  if (!eds.length) return;
  const ctx = zPdf.getContext("2d"), k = zoom.K * zoom.dpr;
  ctx.save(); ctx.setTransform(k, 0, 0, k, -zoom.x * k, -zoom.y * k);
  for (const it of eds) peDraw(ctx, it);
  ctx.restore();
}
{
  const zp = drawZoomPreview;
  drawZoomPreview = function () { const r = zp.apply(this, arguments); peZoom(); return r; };
  const zr = renderZoomPdf;
  renderZoomPdf = async function () { const r = await zr.apply(this, arguments); peZoom(); return r; };
  const sp = snapshotPage;
  snapshotPage = function (p) {
    const box = sp.apply(this, arguments);
    if (box && p.edCv && !p.edCv.hidden && p.edCv.width) {
      const cc = document.createElement("canvas"); cc.width = p.edCv.width; cc.height = p.edCv.height;
      cc.getContext("2d").drawImage(p.edCv, 0, 0);
      cc.style.cssText = "position:absolute;display:block;left:" + (p.edCv.style.left || "0") + ";top:" + (p.edCv.style.top || "0") + ";width:" + (p.edCv.style.width || "100%") + ";height:" + (p.edCv.style.height || "100%") + ";";
      const ink = box.lastChild && box.children.length > 1 ? box.lastChild : null;
      if (ink && p.inkK) box.insertBefore(cc, ink); else box.appendChild(cc);
    }
    return box;
  };
}

/* -- the editor that opens over a line -- */
pe.box = document.createElement("div");
pe.box.className = "tedit peedit";
pe.box.innerHTML = '<div class="tbar" role="toolbar" aria-label="Edit text">' +
  '<button type="button" data-a="smaller" aria-label="Smaller text">A−</button>' +
  '<button type="button" data-a="bigger" aria-label="Bigger text">A+</button>' +
  '<button type="button" data-a="bold" aria-label="Bold"><b>B</b></button>' +
  '<button type="button" data-a="italic" aria-label="Italic"><i style="font-family:Georgia,serif">I</i></button>' +
  '<span class="tdots"></span>' +
  '<button type="button" class="tdel" data-a="remove">Remove</button>' +
  '<button type="button" data-a="cancel">Cancel</button>' +
  '<button type="button" class="tdone" data-a="done">Done</button>' +
  '</div><div class="pe-text" contenteditable="plaintext-only" spellcheck="true" aria-label="Text"></div>';
pe.bar = pe.box.querySelector(".tbar"); pe.txt = pe.box.querySelector(".pe-text");
if (pe.txt.contentEditable !== "plaintext-only") pe.txt.contentEditable = "true";
pe.box.addEventListener("pointerdown", (e) => e.stopPropagation());
pe.bar.addEventListener("pointerdown", (e) => e.preventDefault());
pe.txt.addEventListener("keydown", (e) => {
  e.stopPropagation(); /* typing here never triggers Margin's keyboard shortcuts */
  if (e.key === "Enter") { e.preventDefault(); peClose(true); }
  else if (e.key === "Escape") { e.preventDefault(); peClose(false); }
});
pe.txt.addEventListener("input", () => { if (pe.cur) { pe.cur.item.text = pe.txt.textContent.replace(/\n/g, " "); pePosition(); placeBoxBar(pe.box, pe.bar); } });
pe.txt.addEventListener("paste", (e) => {
  e.preventDefault();
  const t = ((e.clipboardData && e.clipboardData.getData("text/plain")) || "").replace(/\s*\n\s*/g, " ");
  document.execCommand("insertText", false, t);
});
function peSnap(it) { return { text: it.text, size: it.size, bold: !!it.bold, italic: !!it.italic, color: it.color }; }
function peDots() {
  const box = pe.bar.querySelector(".tdots"), it = pe.cur.item;
  box.innerHTML = "";
  const colours = [pe.cur.ink].concat(PEN_COLORS.filter((c) => c.toLowerCase() !== String(pe.cur.ink).toLowerCase()));
  buildSwatches(box, "textColor", colours, it.color, (c) => { it.color = c; pePosition(); peDots(); }, "tdot");
  box.querySelectorAll(".tdot").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === it.color)));
}