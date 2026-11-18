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
  const tapX = pt[0];
  peAnalyse(p, L).then((an) => {
    if (!an || pe.cur !== cur) return;
    item.bg = an.bg; item.ink = an.ink; cur.ink = an.ink;
    if (item.color === "#111827") item.color = an.ink;
    cur.before.color = item.color;
    /* a table line runs through this line of text: keep only the cell that was tapped */
    let segL = L.x - 2, segR = L.x + L.w + 2;
    for (const vx of an.vRules) if (vx > L.x + 0.5 && vx < L.x + L.w - 0.5) { if (vx <= tapX) segL = Math.max(segL, vx); else segR = Math.min(segR, vx); }
    if (segL > L.x - 2 || segR < L.x + L.w + 2) {
      const runs = L.runs.filter((r) => r.x + r.w / 2 > segL && r.x + r.w / 2 < segR);
      if (runs.length) {
        let str = "", end = null;
        for (const r of runs) { if (end !== null && r.x - end > L.fh * 0.15 && !/\s$/.test(str) && !/^\s/.test(r.str)) str += " "; str += r.str; end = r.x + r.w; }
        str = str.replace(/^\s+|\s+$/g, "");
        const untouched = pe.txt.textContent === item.orig;
        item.bx = round2(runs[0].x); item.x = round2(runs[0].x - 1); item.w = round2(end - runs[0].x + 2);
        item.orig = str;
        if (untouched) {
          item.text = str; pe.txt.textContent = str;
          try { const rg = document.createRange(); rg.selectNodeContents(pe.txt); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg); } catch (e) {}
        }
        const nat = peMeasure(Object.assign({}, item, { hs: 1 }), str);
        if (nat > 0) item.hs = Math.round(Math.max(0.7, Math.min(1.35, (end - runs[0].x) / nat)) * 1000) / 1000;
      }
    }
    /* cover just the old letters, never the table lines around them */
    const g = an.box(Math.max(segL + 0.4, item.bx - 1), Math.min(segR - 0.4, item.bx + item.w));
    if (g) {
      if (g.bg) item.bg = g.bg;
      if (g.ink && item.color === cur.ink) { item.color = g.ink; cur.before.color = g.ink; }
      if (g.ink) { item.ink = g.ink; cur.ink = g.ink; }
      const m = 1.1;
      let y1 = g.y1 - m, y2 = g.y2 + m, x1 = g.x1 - m, x2 = g.x2 + m;
      for (const hy of an.hRules) { if (hy < g.y1) y1 = Math.max(y1, hy + 0.5); if (hy > g.y2) y2 = Math.min(y2, hy - 0.2); }
      x1 = Math.max(x1, segL + 0.5); x2 = Math.min(x2, segR - 0.3);
      item.cv = { x: round2(x1), y: round2(y1), w: round2(x2 - x1), h: round2(y2 - y1) };
    }
    pePosition(); peDots(); placeBoxBar(pe.box, pe.bar);
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
    const pdfRect = (x, y, w, h) => {
      const a = p.vp.convertToPdfPoint(x, y + h), b = p.vp.convertToPdfPoint(x + w, y);
      return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) };
    };
    for (const it of eds) {
      const cv = peCover(it);
      op.drawRectangle(Object.assign(pdfRect(cv.x, cv.y, cv.w, cv.h), { color: hexRgb(it.bg) }));
      if (!it.text) continue;
      const cw = peCoverW(it), T = pdfRect(it.x, it.y, cw, it.h);
      const rx = T.x, ry = T.y, rw = T.width, rh = T.height;
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
