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
