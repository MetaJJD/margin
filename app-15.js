function setRuler(on) {
  if (!ruler.el) buildRuler();
  ruler.on = on;
  ruler.el.hidden = !on;
  rulerBtn.setAttribute("aria-pressed", String(on));
  fsRuler.setAttribute("aria-pressed", String(on));
  fsRuler.style.background = on ? "var(--chip-on)" : ""; fsRuler.style.color = on ? "var(--accent)" : "";
  if (on) {
    const r = viewer.getBoundingClientRect();
    ruler.L = Math.min(820, Math.max(320, r.width * 0.8));
    if (!ruler.cx || ruler.cx > window.innerWidth || ruler.cy > window.innerHeight) { ruler.cx = r.left + r.width / 2; ruler.cy = r.top + r.height * 0.55; }
    placeRuler();
    if (!localStorage.getItem("margin-ruler-tip")) { toast("Drag the ruler with one finger, turn it with two. Draw along its edge for a straight line.", 5000); try { localStorage.setItem("margin-ruler-tip", "1"); } catch (e) {} }
  }
}
/* ---------- smoothing: how much Margin steadies the pen and marker (0 = exactly as drawn) ---------- */
var smoothing = 50;
const smoothCss = document.createElement("style");
smoothCss.textContent = ".smooth-ctl { display: inline-flex; align-items: center; gap: 6px; margin-left: 6px; padding: 0 4px; color: var(--muted); font-size: 12.5px; white-space: nowrap; }\n" +
  ".smooth-ctl input { width: 96px; accent-color: var(--accent); touch-action: none; }\n" +
  ".smooth-ctl output { min-width: 26px; text-align: right; font-variant-numeric: tabular-nums; color: var(--fg); }\n" +
  ".smooth-ctl.in-settings { margin: 0; padding: 0; display: flex; }\n" +
  ".smooth-ctl.in-settings input { flex: 1; width: auto; }\n";
document.head.appendChild(smoothCss);
try { const v = localStorage.getItem("margin-smooth"); if (v != null && +v >= 0 && +v <= 100) smoothing = +v; } catch (e) {}
/* [how much of each new movement to follow when moving slowly, how fast that rises with speed] */
function smoothParams() {
  const s = smoothing;
  const base = s <= 50 ? 1 - 0.72 * s / 50 : 0.28 - 0.2 * (s - 50) / 50;
  return [base, 8 + 0.28 * s];
}
function smoothCtl() {
  const l = document.createElement("label");
  l.className = "smooth-ctl"; l.title = "Smooth lines: higher steadies shaky lines more";
  const t = document.createElement("span"); t.textContent = "Smooth";
  const r = document.createElement("input");
  r.type = "range"; r.min = "0"; r.max = "100"; r.step = "5"; r.value = String(smoothing);
  r.setAttribute("aria-label", "Line smoothing");
  const o = document.createElement("output"); o.textContent = String(smoothing);
  r.addEventListener("input", () => {
    smoothing = +r.value; o.textContent = r.value;
    try { localStorage.setItem("margin-smooth", r.value); } catch (e) {}
  });
  r.addEventListener("pointerdown", (e) => e.stopPropagation());
  l.append(t, r, o);
  return l;
}
function smoothWanted() { return state.tool === "pen" || (state.tool === "hl" && state.hlStyle === "marker"); }
/* the slider sits in Settings, under Apple Pencil */
{
  const lab = document.createElement("div"); lab.className = "pop-label"; lab.textContent = "Pen smoothing";
  const ctl = smoothCtl(); ctl.classList.add("in-settings");
  const hint = document.createElement("p"); hint.className = "pop-hint";
  hint.textContent = "Steadies shaky lines for the pen and marker. Higher is smoother; 0 draws exactly as your hand moves.";
  $("viewPop").append(lab, ctl, hint);
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
/* the same ruler button in the full screen bar, to the right of the lasso */
const fsRuler = document.createElement("button");
fsRuler.type = "button"; fsRuler.className = "icon-btn"; fsRuler.id = "fsRuler";
fsRuler.setAttribute("aria-pressed", "false"); fsRuler.setAttribute("aria-label", "Ruler"); fsRuler.title = "Ruler";
fsRuler.innerHTML = rulerBtn.innerHTML;
fsRuler.querySelector("svg").style.fill = "none";
(document.querySelector('#fsPill [data-fstool="lasso"]') || $("fsFit")).after(fsRuler);
fsRuler.onclick = () => setRuler(!ruler.on);
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
        op.drawImage(emb, { x: bl[0], y: bl[1], width: it.w, height: it.h, opacity: it.op == null ? 1 : it.op });
      } else if (it.type === "pen" || it.type === "hl") {
        const hl = it.type === "hl";
        const D = hl ? it.pts : it.style || it.sharp ? styledPts(it) : it.pts.length < 3 ? it.pts : curvePts(it.pts, 3);
        const pts = D.map((q) => P(q[0], q[1]));
        if (pts.length === 1) pts.push([pts[0][0] + 0.3, pts[0][1]]);
        let w = it.w;
        const wf = it.style === "pencil" ? pencilWidth : it.style === "fountain" ? nibWidth : it.style === "dash" ? () => it.w * 0.95 : penWidth;
        if (!hl) { let s = 0; for (let i = 1; i < D.length; i++) s += wf(it, D[i - 1], D[i]); w = D.length > 1 ? s / (D.length - 1) : it.w * 0.9; }
        const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
        const rect = [Math.min(...xs) - w, Math.min(...ys) - w, Math.max(...xs) + w, Math.max(...ys) + w];
        const c = rgb(it.color), alpha = hl ? HL_ALPHA : it.style === "pencil" ? pencilAlpha(it) : 1;
        let path = "";
        pts.forEach((q, i) => { path += f2(q[0]) + " " + f2(q[1]) + (i ? " l " : " m "); });
        const dash = it.style === "dash" ? "[" + f2(it.w * 2.8) + " " + f2(it.w * 2.4) + "] 0 d " : "";
        const fillPart = it.fill && pts.length > 2 ? "q /GS1 gs " + c.map(f2).join(" ") + " rg " + path + "h f Q " : "";
        const content = fillPart + "q /GS0 gs 1 J 1 j " + dash + f2(w) + " w " + c.map(f2).join(" ") + " RG " + path + "S Q";
        const ap = form(rect, content, { ExtGState: { GS0: { Type: "ExtGState", CA: alpha, ca: alpha, BM: hl ? "Multiply" : "Normal" }, GS1: { Type: "ExtGState", CA: FILL_ALPHA, ca: FILL_ALPHA } } });
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
