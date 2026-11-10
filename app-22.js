/* ---------- Windows and other computers: mouse, keyboard, pen, install ---------- */
const DESKTOP = (() => {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod|Android/i.test(ua)) return false;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return false; /* an iPad asking for the desktop site */
  return true;
})();
const IS_WINDOWS = /Windows/i.test(navigator.userAgent || "");
const IN_FRAME = (() => { try { return window.top !== window; } catch (e) { return true; } })();
if (DESKTOP) {
  document.body.classList.add("desktop");
  const css = document.createElement("style");
  css.textContent =
    /* a pen near the screen draws instead of scrolling (Windows pens) */
    "body.pen-near .viewer:not(.tool-hand) .page { touch-action: none; }\n" +
    /* drag with the middle button or Space to move around */
    "body.panning, body.panning * { cursor: grabbing !important; }\n" +
    "body.space-pan .viewer .page { cursor: grab; }\n" +
    ".viewer.tool-hand .page { cursor: grab; }\n" +
    ".kbd-list { margin: 4px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px; color: var(--muted); }\n" +
    ".kbd-list kbd { font: 600 12px ui-monospace, Consolas, monospace; color: var(--fg); background: var(--chip, rgba(127,127,127,.12)); border-radius: 5px; padding: 1px 6px; white-space: nowrap; }\n" +
    ".kbd-how { font-size: 13px; color: var(--muted); }\n" +
    ".kbd-how summary { cursor: pointer; color: var(--accent); font-weight: 600; }\n";
  document.head.appendChild(css);

  /* computer wording instead of iPad wording */
  const lab = $("pencilBtn").previousElementSibling;
  if (lab && lab.classList.contains("pop-label")) lab.textContent = "Pen, touch and mouse";
  $("pencilBtn").querySelector("b").textContent = "Pen only on touch screens";
  const rt = renderToolbar;
  renderToolbar = function () {
    rt.apply(this, arguments);
    $("pencilHint").textContent = state.pencilOnly
      ? "The mouse and a pen write. On a touch screen, your finger scrolls."
      : "The mouse, a pen and your finger all write. Pick Select to scroll with your finger.";
  };
  $("pencilBtn").addEventListener("click", () => {
    toast(state.pencilOnly ? "A pen and the mouse write. Your finger scrolls." : "Your finger writes too. Pick Select to move around.");
  });
  const aw = $("awakeBtn");
  if (aw) aw.querySelector("small").textContent = "The screen stays on while Margin is open, so it won’t dim or lock while you read or write.";
  const ph = $("sharePrintHint");
  if (ph) {
    const sp = setPrintReady;
    setPrintReady = function (ready) { sp.apply(this, arguments); ph.textContent = ready ? "Any printer connected to this computer" : "Getting the pages ready..."; };
    ph.textContent = "Any printer connected to this computer";
  }
  const zh = $("zoomVal").closest(".pop") && $("zoomVal").closest(".pop").querySelector(".pop-hint");
  if (zh && /Pinch/.test(zh.textContent)) zh.textContent = "Ctrl + scroll wheel, Ctrl + plus or minus, or pinch on a touchpad zoom too.";
  /* the PDF's own fonts as Windows names them */
  PE_FAMILY.sans = PE_FAMILY.sans.replace("sans-serif", '"Segoe UI", "Microsoft JhengHei", sans-serif');
  PE_FAMILY.serif = PE_FAMILY.serif.replace(/serif$/, '"PMingLiU", "MingLiU", serif');
  PE_FAMILY.mono = PE_FAMILY.mono.replace("monospace", "Consolas, monospace");

  /* Share on a computer: save the file (a Save As window where the browser has one) */
  try { Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false }); } catch (e) {}
  const dv = deliver;
  deliver = async function (bytes, filename, mime, savedMsg) {
    if (!IN_FRAME && window.showSaveFilePicker) {
      mime = mime || "application/pdf";
      const ext = (filename.match(/\.[a-z0-9]+$/i) || [".pdf"])[0];
      try {
        const h = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: ext === ".pdf" ? "PDF" : "File", accept: { [mime]: [ext] } }] });
        const w = await h.createWritable();
        await w.write(bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime }));
        await w.close();
        toast("Saved " + h.name, 3500);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") { toast("Not saved."); return; }
      }
    }
    return dv.apply(this, arguments);
  };
  /* Print on a computer: straight to the print window */
  const printPdf = $("sharePrint").onclick;
  $("sharePrint").onclick = async () => {
    const p = printPrep;
    if (!p || !p.ready || p.failed) return printPdf();
    hidePop();
    const url = URL.createObjectURL(new Blob([p.bytes], { type: "application/pdf" }));
    const fr = document.createElement("iframe");
    fr.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;";
    fr.src = url;
    let done = false;
    const fallback = () => { if (done) return; done = true; fr.remove(); URL.revokeObjectURL(url); printPdf(); };
    fr.onload = () => {
      setTimeout(() => {
        try { fr.contentWindow.focus(); fr.contentWindow.print(); done = true; setTimeout(() => { fr.remove(); URL.revokeObjectURL(url); }, 60000); }
        catch (e) { fallback(); }
      }, 400);
    };
    document.body.appendChild(fr);
    setTimeout(() => { if (!done && !fr.contentWindow) fallback(); }, 8000);
  };
}

/* a Windows pen: hovering over the page gets it ready to draw; its eraser end erases */
{
  const near = (on) => { if (DESKTOP) document.body.classList.toggle("pen-near", on); };
  window.addEventListener("pointermove", (e) => { if (e.pointerType === "pen") near(true); }, { passive: true, capture: true });
  window.addEventListener("pointerout", (e) => { if (e.pointerType === "pen" && !e.relatedTarget) near(false); }, { passive: true });
  let erasing = null;
  window.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") { near(false); return; }
    if (e.pointerType !== "pen") return;
    near(true);
    /* the eraser end of a Surface pen (or the eraser button) */
    if ((e.buttons & 32) && state.tool !== "eraser" && !erasing && e.target.closest && e.target.closest(".page, #zBody")) {
      erasing = { tool: state.tool, id: e.pointerId };
      if (textEdit) closeTextEdit();
      state.tool = "eraser"; renderToolbar();
    }
  }, true);
  const back = (e) => {
    if (!erasing || e.pointerId !== erasing.id) return;
    const t = erasing.tool; erasing = null;
    setTimeout(() => { state.tool = t; renderToolbar(); }, 0);
  };
  window.addEventListener("pointerup", back, true);
  window.addEventListener("pointercancel", back, true);
}

/* move around with the mouse: drag with the middle button, or hold Space and drag */
{
  let space = false, pan = null, lastDown = 0;
  window.addEventListener("pointerdown", () => { lastDown = Date.now(); }, true);
  window.addEventListener("focusin", (e) => { if (e.target) e.target.marginByPointer = Date.now() - lastDown < 400; }, true);
  const typing = (t) => t && t.closest && (t.closest("textarea, input, select") || t.isContentEditable);
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || typing(e.target)) return;
    /* a button reached with Tab still presses with Space; one just clicked with the mouse doesn't */
    const btn = e.target.closest && e.target.closest("button, summary, a, [role=button]");
    if (btn) { if (!btn.marginByPointer) return; btn.blur(); }
    if (viewer.offsetParent === null) return;
    e.preventDefault();
    if (!space) { space = true; document.body.classList.add("space-pan"); }
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") { space = false; document.body.classList.remove("space-pan"); } });
  window.addEventListener("blur", () => { space = false; document.body.classList.remove("space-pan"); });
  window.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    const inView = e.target.closest && e.target.closest("#viewer, .viewer") && !e.target.closest(".tbar, .tedit textarea, .pe-text, button, input");
    if (!inView || !(e.button === 1 || (space && e.button === 0))) return;
    e.preventDefault(); e.stopImmediatePropagation();
    pan = { id: e.pointerId, x: e.clientX, y: e.clientY, l: viewer.scrollLeft, t: viewer.scrollTop };
    document.body.classList.add("panning");
  }, true);
  window.addEventListener("pointermove", (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    e.stopImmediatePropagation();
    viewer.scrollLeft = pan.l - (e.clientX - pan.x);
    viewer.scrollTop = pan.t - (e.clientY - pan.y);
  }, true);
  const end = (e) => { if (pan && e.pointerId === pan.id) { pan = null; document.body.classList.remove("panning"); e.stopImmediatePropagation(); } };
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  /* no auto-scroll circle on middle click */
  viewer.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
}

/* keyboard shortcuts for a computer */
{
  const typing = (t) => t && t.closest && (t.closest("textarea, input, select") || t.isContentEditable);
  const fileInput = () => document.getElementById("fileInput");
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey || typing(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === "=" || k === "+" || e.code === "NumpadAdd") { e.preventDefault(); $("zoomIn").click(); }
    else if (k === "-" || k === "_" || e.code === "NumpadSubtract") { e.preventDefault(); $("zoomOut").click(); }
    else if (k === "0" || e.code === "Numpad0") { e.preventDefault(); lastFit = "w"; autoFit(); }
    else if (k === "o") { e.preventDefault(); const fi = fileInput(); if (fi) fi.click(); }
    else if (k === "s" && state.bytes) { e.preventDefault(); shareAnnotated(); }
    else if (k === "p" && state.bytes) { e.preventDefault(); preparePrint(); toast("Getting the pages ready to print…", 2000); const go = () => { if (printPrep && printPrep.ready) $("sharePrint").click(); else setTimeout(go, 200); }; setTimeout(go, 50); }
  }, true);
  if (DESKTOP) {
    const keys = [["P", "Pen"], ["M", "Highlighter"], ["E", "Eraser"], ["T", "Text"], ["N", "Note"], ["L", "Lasso"], ["H", "Select / move"],
      ["Ctrl + Z / Y", "Undo / Redo"], ["Ctrl + + / −", "Zoom in / out"], ["Ctrl + 0", "Fit the page"], ["Ctrl + scroll", "Zoom"],
      ["Space + drag", "Move around"], ["Middle-drag", "Move around"], ["Ctrl + O", "Open a file"], ["Ctrl + S", "Save a copy with notes"],
      ["Ctrl + P", "Print"], ["Ctrl + F", "Search"], ["← →", "Turn pages (one-page view)"]];
    const d = document.createElement("details"); d.className = "kbd-how";
    d.innerHTML = "<summary>Keyboard and mouse shortcuts</summary><ul class=\"kbd-list\"></ul>";
    const ul = d.querySelector("ul");
    for (const [a, b] of keys) { const k = document.createElement("li"); k.innerHTML = "<kbd></kbd>"; k.firstChild.textContent = a; const s = document.createElement("li"); s.textContent = b; ul.append(k, s); }
    $("pencilBtn").after(d);
  }
}

/* install Margin as an app on the computer, and open PDFs from Windows with it */
{
  let ask = null;
  const standalone = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches || navigator.standalone;
  const row = document.createElement("button");
  row.type = "button"; row.className = "setting-row"; row.id = "installBtn"; row.hidden = true;
  row.innerHTML = '<span><b>Install Margin on this computer</b><small>Margin gets its own window and a Start menu icon, works offline, and can open PDFs from File Explorer.</small></span>';
  const lab = document.createElement("div"); lab.className = "pop-label"; lab.textContent = "App"; lab.hidden = true;
  $("viewPop").prepend(lab, row);
  const show = (on) => { row.hidden = lab.hidden = !on; };
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); ask = e; if (!standalone()) show(true); });
  window.addEventListener("appinstalled", () => { ask = null; show(false); toast("Margin is installed. Find it in the Start menu.", 5000); });
  row.onclick = async () => {
    if (!ask) return;
    hidePop();
    ask.prompt();
    try { const r = await ask.userChoice; if (r && r.outcome === "accepted") show(false); } catch (e) {}
    ask = null;
  };
  /* "Open with Margin" from File Explorer, or a file dropped on the app icon */
  if ("launchQueue" in window && window.launchQueue && typeof launchQueue.setConsumer === "function") {
    launchQueue.setConsumer(async (params) => {
      const files = (params && params.files) || [];
      for (const h of files) { try { await addFile(await h.getFile()); } catch (e) {} }
    });
  }
}

/* ---------- Underline and Cross out: their own buttons beside Highlight ---------- */
{
  const MARKS = [
    ["ul", "Underline", "Underline: drag across words to underline them (U)", '<svg viewBox="0 0 24 24"><path d="M7 4v7a5 5 0 0 0 10 0V4"/><path d="M4.5 20.5h15" stroke-width="2.4"/></svg>'],
    ["st", "Cross out", "Cross out: drag across words to strike them through (X)", '<svg viewBox="0 0 24 24"><path d="M16 7.5a4 3 0 0 0-8 .5c0 1.6 1.3 2.4 3 3M8.2 15.5a4 3 0 0 0 7.8-.5c0-1-.4-1.7-1.1-2.2"/><path d="M3.5 12h17" stroke-width="2.4"/></svg>']
  ];
  const hlBtn = document.querySelector('.row2 .tool[data-tool="hl"]');
  const fsHl = document.querySelector('#fsPill [data-fstool="hl"]');
  const btns = {}, pills = {};
  const pressed = (v) => state.tool === "hl" && state.hlStyle === v;
  /* pick Underline or Cross out; tap it again to show or hide its colours */
  let lastHide = { a: null, t: 0 };
  const hp = hideToolPop;
  hideToolPop = function () { if (!toolPop.hidden && window.event && window.event.type === "pointerdown") lastHide = { a: tpAnchor, t: Date.now() }; return hp.apply(this, arguments); };
  const pick = (v, anchor) => {
    const again = pressed(v);
    const wasOpen = (!toolPop.hidden && tpAnchor === anchor) || (lastHide.a === anchor && Date.now() - lastHide.t < 700);
    if (textEdit) closeTextEdit();
    if (typeof pe !== "undefined" && pe.cur) peClose(true);
    if (lassoSel) clearLassoSel();
    state.tool = "hl"; state.hlStyle = v; savePrefs(); renderToolbar();
    lastHide = { a: null, t: 0 };
    if (again && wasOpen) hideToolPop(); else showToolPop(anchor);
  };
  let after = hlBtn, fsAfter = fsHl;
  for (const [v, label, title, icon] of MARKS) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tool"; b.dataset.mark = v;
    b.setAttribute("aria-pressed", "false"); b.title = title;
    b.innerHTML = icon + "<span>" + label + "</span>";
    after.after(b); after = b; btns[v] = b;
    b.addEventListener("click", () => pick(v, b));
    if (fsHl) {
      const f = document.createElement("button");
      f.type = "button"; f.className = "icon-btn"; f.dataset.fsmark = v;
      f.setAttribute("aria-label", label); f.title = label;
      f.innerHTML = icon; f.querySelector("svg").style.fill = "none";
      fsAfter.after(f); fsAfter = f; pills[v] = f;
      f.addEventListener("click", () => pick(v, f));
    }
  }
  /* Highlight is the marker again; leaving Underline for Highlight moves the panel too */
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest('.row2 .tool[data-tool="hl"], #fsPill [data-fstool="hl"]');
    if (!b) return;
    if (state.hlStyle !== "marker") {
      state.hlStyle = "marker";
      if (!toolPop.hidden) hideToolPop();
    }
  }, true);
  /* keys: M highlight, U underline, X cross out */
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && t.closest && (t.closest("textarea, input, select") || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (k === "m") state.hlStyle = "marker";
    else if (k === "u" || k === "x") { e.preventDefault(); state.tool = "hl"; state.hlStyle = k === "u" ? "ul" : "st"; savePrefs(); renderToolbar(); }
  }, true);
  const rt = renderToolbar;
  renderToolbar = function () {
    rt.apply(this, arguments);
    const mark = state.tool === "hl" && state.hlStyle !== "marker";
    if (hlBtn) hlBtn.setAttribute("aria-pressed", String(state.tool === "hl" && !mark));
    if (hlBtn) hlBtn.style.setProperty("--tc", state.hlColor);
    if (fsHl) { const on = state.tool === "hl" && !mark; fsHl.setAttribute("aria-pressed", String(on)); fsHl.style.background = on ? "var(--chip-on)" : ""; fsHl.style.color = on ? "var(--accent)" : ""; fsHl.style.setProperty("--tc", state.hlColor); }
    for (const [v] of MARKS) {
      const on = pressed(v);
      btns[v].setAttribute("aria-pressed", String(on));
      btns[v].style.setProperty("--tc", state.markColor);
      if (pills[v]) { pills[v].setAttribute("aria-pressed", String(on)); pills[v].style.background = on ? "var(--chip-on)" : ""; pills[v].style.color = on ? "var(--accent)" : ""; }
    }
    /* the style switch inside Highlight's panel isn't needed now */
    const seg = $("sizes").querySelector(".hlstyle");
    if (seg) { seg.remove(); if (!$("sizes").childElementCount && !mark) $("sizes").hidden = true; }
    if (mark) {
      const sz = $("sizes"); sz.hidden = false;
      const h = document.createElement("span"); h.className = "tool-hint";
      h.textContent = state.hlStyle === "ul" ? "Drag across the words to underline." : "Drag across the words to cross them out.";
      sz.appendChild(h);
    }
    /* the panel stays with whichever of the three buttons is picked */
    if (!toolPop.hidden && state.tool === "hl") {
      const want = mark ? ((tpAnchor && tpAnchor.closest && tpAnchor.closest("#fsPill")) ? pills[state.hlStyle] : btns[state.hlStyle]) : null;
      if (want && tpAnchor !== want) tpAnchor = want;
      if (!mark && tpAnchor && tpAnchor.dataset && (tpAnchor.dataset.mark || tpAnchor.dataset.fsmark)) hideToolPop();
      else if (toolHasOptions()) placeToolPop(); else hideToolPop();
    }
  };
  renderToolbar();
  /* two more buttons: tighten the toolbar a little so it still fits an iPad held upright */
  const css = document.createElement("style");
  css.textContent = "@media (max-width: 900px) { .row2 { padding-left: 10px; padding-right: 10px; gap: 6px; } .row2 .tool { width: 35px; min-width: 35px; } }\n" +
    "@media (max-width: 800px) { .row2 .tool { width: 33px; min-width: 33px; } }\n";
  document.head.appendChild(css);
}

/* while dragging Underline or Cross out, show the finished straight lines on the text, not the wobbly stroke */
{
  /* the same rule as markLines, using the page text read when the stroke began */
  const linesNow = (p, P, style) => {
    const t = state.text[p.n];
    if (!t || !t.items) return null;
    const segs = [];
    t.items.forEach((it) => {
      if (typeof it.str !== "string" || !it.str.trim() || !it.width || !it.transform) return;
      const tx = pdfjsLib.Util.transform(p.vp.transform, it.transform);
      if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) return;
      const fh = Math.abs(tx[3]) || Math.hypot(tx[2], tx[3]) || 10;
      const x0 = tx[4], base = tx[5], w = it.width * p.vp.scale;
      const top = base - fh * 1.0, bot = base + fh * 0.45;
      let ax = Infinity, bx = -Infinity;
      for (const q of P) if (q[1] >= top && q[1] <= bot && q[0] >= x0 - 2 && q[0] <= x0 + w + 2) { ax = Math.min(ax, q[0]); bx = Math.max(bx, q[0]); }
      if (ax > bx) return;
      const L = it.str.length, cw = w / L;
      let i0 = Math.max(0, Math.min(L, Math.floor((ax - x0) / cw + 0.35)));
      let i1 = Math.max(0, Math.min(L, Math.ceil((bx - x0) / cw - 0.35)));
      while (i0 < i1 && it.str[i0] === " ") i0++;
      while (i1 > i0 && it.str[i1 - 1] === " ") i1--;
      if (i1 <= i0) return;
      segs.push({ x1: x0 + i0 * cw, x2: x0 + i1 * cw, base, fh });
    });
    segs.sort((a, b) => a.base - b.base || a.x1 - b.x1);
    const lines = [];
    for (const sg of segs) {
      const ln = lines.find((l) => Math.abs(l.base - sg.base) < sg.fh * 0.3);
      if (ln && sg.x1 - ln.x2 < sg.fh * 0.9) { ln.x2 = Math.max(ln.x2, sg.x2); ln.x1 = Math.min(ln.x1, sg.x1); ln.fh = Math.max(ln.fh, sg.fh); }
      else lines.push({ x1: sg.x1, x2: sg.x2, base: sg.base, fh: sg.fh });
    }
    return lines.map((l) => ({ x1: l.x1, x2: l.x2, y: style === "ul" ? l.base + l.fh * 0.13 : l.base - l.fh * 0.3, w: Math.max(0.7, Math.min(2.4, l.fh * 0.075)) }));
  };
  let cache = { item: null, n: -1, out: [] };
  const preview = (a) => {
    const it = a.item, P = it.pts;
    if (cache.item === it && cache.n === P.length) return cache.out;
    let lines = linesNow(a.p, P, a.markStyle) || [];
    const out = lines.map((ln) => ({ type: "pen", color: it.color, w: ln.w, pts: [[ln.x1, ln.y, 0.65], [ln.x2, ln.y, 0.65]] }));
    if (!out.length && P.length > 1) {
      /* no text under the pen (yet): a straight level line where it will land */
      let y = 0; for (const q of P) y += q[1]; y /= P.length;
      let x1 = Infinity, x2 = -Infinity; for (const q of P) { x1 = Math.min(x1, q[0]); x2 = Math.max(x2, q[0]); }
      if (x2 - x1 > 1) out.push({ type: "pen", color: it.color, w: 1.4, pts: [[x1, y, 0.65], [x2, y, 0.65]] });
    }
    cache = { item: it, n: P.length, out };
    return out;
  };
  const isMarkLive = (it) => it && active && active.markStyle && it === active.item;
  const dlm = drawLayer;
  drawLayer = function (ctx, items, live) {
    if (!isMarkLive(live)) return dlm.apply(this, arguments);
    const r = dlm.call(this, ctx, items);
    for (const ln of preview(active)) drawItem(ctx, ln);
    return r;
  };
  const sgm = segment;
  segment = function (ctx, k, ox, oy, it) {
    if (!isMarkLive(it)) return sgm.apply(this, arguments);
    if (!active.raf) active.raf = requestAnimationFrame(() => { if (active) { active.raf = 0; drawInk(active.p, active.item); } });
  };
}
