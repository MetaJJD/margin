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

/* ---------- contents: fold and unfold chapters ---------- */
{
  const css = document.createElement("style");
  css.textContent =
    ".toc-list, .toc-list button { touch-action: manipulation; }\n" +
    ".toc-row { display: flex; align-items: flex-start; }\n" +
    ".toc-row .toc-item { flex: 1; min-width: 0; }\n" +
    ".toc-fold { flex: none; width: 34px; height: 36px; margin-right: -8px; margin-top: -1px; border: 0; background: transparent; color: var(--muted); border-radius: 8px; cursor: pointer; display: grid; place-items: center; padding: 0; }\n" +
    ".toc-fold svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }\n" +
    ".toc-fold[aria-expanded=true] svg { transform: rotate(90deg); }\n" +
    ".toc-nofold { flex: none; width: 34px; margin-right: -8px; }\n" +
    ".toc-row.d1 > :first-child { margin-left: 12px; } .toc-row.d2 > :first-child { margin-left: 24px; } .toc-row.d3 > :first-child, .toc-row.d4 > :first-child { margin-left: 36px; }\n" +
    ".toc-row .toc-item.d1, .toc-row .toc-item.d2, .toc-row .toc-item.d3, .toc-row .toc-item.d4 { padding-left: 8px; }\n" +
    ".toc-row.here .toc-item { background: var(--chip-on); color: var(--accent); }\n" +
    ".toc-bar { display: flex; justify-content: flex-end; gap: 4px; padding: 2px 2px 6px; }\n" +
    ".toc-bar button { border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 12.5px; font-weight: 600; padding: 4px 8px; border-radius: 8px; cursor: pointer; }\n" +
    "@media (hover: hover) { .toc-fold:hover, .toc-bar button:hover { background: var(--chip); } }\n";
  document.head.appendChild(css);
  const CHEV = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  const list = $("tocList");
  const open = {}; /* per file: which chapters are unfolded */
  let seq = 0, down = null, quick = 0;
  const kids = (i) => { const its = toc.items; return i + 1 < its.length && its[i + 1].depth > its[i].depth; };

  /* read the chapter list, looking up all page numbers at once */
  loadToc = async function () {
    if (toc.docId === state.id && toc.items) return toc.items;
    const docId = state.id, pdf = state.pdf;
    let outline = null;
    try { outline = await pdf.getOutline(); } catch (e) {}
    const flat = [];
    (function walk(l, depth) {
      for (const it of l || []) {
        flat.push({ title: (it.title || "Untitled").trim(), depth, dest: it.dest, page: null });
        if (it.items && it.items.length) walk(it.items, depth + 1);
      }
    })(outline, 0);
    const refs = new Map();
    const pageOf = (ref) => {
      if (typeof ref === "number") return Promise.resolve(ref + 1);
      const k = ref && ref.num + "R" + ref.gen;
      if (!refs.has(k)) refs.set(k, pdf.getPageIndex(ref).then((i) => i + 1, () => null));
      return refs.get(k);
    };
    /* named links: fetch them all in one go when there are many */
    let named = null;
    if (flat.filter((f) => typeof f.dest === "string").length > 50) { try { named = await pdf.getDestinations(); } catch (e) {} }
    const one = async (f) => {
      try {
        const d = typeof f.dest === "string" ? (named && named[f.dest]) || await pdf.getDestination(f.dest) : f.dest;
        if (Array.isArray(d) && d[0] != null) f.page = await pageOf(d[0]);
      } catch (e) {}
      delete f.dest;
    };
    /* in batches, so a list with thousands of chapters doesn't flood the PDF reader */
    for (let i = 0; i < flat.length; i += 400) {
      await Promise.all(flat.slice(i, i + 400).map(one));
      if (docId !== state.id) return [];
    }
    if (docId !== state.id) return [];
    toc.docId = docId; toc.items = flat;
    return flat;
  };

  function hereIndex() {
    const pg = state.curPage || 1;
    let best = -1;
    toc.items.forEach((it, i) => { if (it.page && it.page <= pg && (best < 0 || it.page >= toc.items[best].page)) best = i; });
    return best;
  }
  /* show the chapter you're in, with its parents unfolded */
  function openTo(h) {
    let d = toc.items[h].depth;
    for (let i = h - 1; i >= 0 && d > 0; i--) if (toc.items[i].depth < d) { open[state.id].add(i); d = toc.items[i].depth; }
  }
  /* only the rows that can be seen are put on screen, so folding stays quick with long lists */
  function draw(scrollHere) {
    const its = toc.items, set = open[state.id], here = hereIndex();
    const frag = document.createDocumentFragment();
    if (its.some((it, i) => kids(i))) {
      const bar = document.createElement("li"); bar.className = "toc-bar";
      bar.innerHTML = '<button type="button" data-all="1">Expand all</button><button type="button" data-all="0">Collapse all</button>';
      frag.appendChild(bar);
    }
    let hideBelow = Infinity, hereLi = null;
    for (let i = 0; i < its.length; i++) {
      const it = its[i], d = it.depth;
      if (d <= hideBelow) hideBelow = Infinity;
      if (d > hideBelow) continue;
      const k = kids(i), on = k && set.has(i);
      if (k && !on) hideBelow = d;
      const li = document.createElement("li");
      li.className = "toc-row d" + Math.min(d, 4) + (i === here ? " here" : "");
      li.dataset.i = i;
      const lead = document.createElement(k ? "button" : "span");
      if (k) { lead.type = "button"; lead.className = "toc-fold"; lead.innerHTML = CHEV; lead.setAttribute("aria-expanded", String(on)); lead.setAttribute("aria-label", (on ? "Hide" : "Show") + " the sections of " + it.title); }
      else lead.className = "toc-nofold";
      const b = document.createElement("button");
      b.type = "button"; b.className = "toc-item d" + Math.min(d, 4);
      const t = document.createElement("span"); t.className = "toc-title"; t.textContent = it.title;
      const pg = document.createElement("span"); pg.className = "toc-page"; pg.textContent = it.page || "";
      b.append(t, pg);
      if (!it.page && !k) b.disabled = true;
      li.append(lead, b);
      frag.appendChild(li);
      if (i === here) hereLi = li;
    }
    list.replaceChildren(frag);
    if (scrollHere && hereLi) hereLi.scrollIntoView({ block: "nearest" });
  }

  renderToc = async function () {
    const my = ++seq;
    if (!state.pdf) { list.innerHTML = ""; return; }
    if (toc.docId !== state.id || !toc.items) list.innerHTML = '<li class="toc-empty">Loading chapters…</li>';
    const items = await loadToc();
    if (my !== seq || sideView !== "toc") return;
    if (!items.length) {
      list.innerHTML = '<li class="toc-empty">This PDF has no built-in chapter list. Use <b>Favorites</b> to mark the pages you want to find again.</li>';
      return;
    }
    if (!open[state.id]) {
      /* open level by level while the list stays short (one big entry at the top opens by itself) */
      const set = open[state.id] = new Set();
      for (let lvl = 0; lvl < 8; lvl++) {
        const add = [];
        items.forEach((it, i) => { if (it.depth === lvl && kids(i)) add.push(i); });
        if (!add.length) break;
        const adding = new Set(add);
        let shown = 0, hide = Infinity;
        items.forEach((it, i) => { if (it.depth <= hide) hide = Infinity; if (it.depth > hide) return; shown++; if (kids(i) && !set.has(i) && !adding.has(i)) hide = it.depth; });
        if (shown > 15 && !(lvl === 0 && add.length === 1)) break;
        add.forEach((i) => set.add(i));
      }
      const h = hereIndex(); if (h >= 0) openTo(h);
    }
    draw(true);
  };

  const flip = (i) => { const s = open[state.id]; if (s.has(i)) s.delete(i); else s.add(i); draw(false); };
  /* one set of handlers for the whole list: arrows react as soon as the finger lifts */
  list.addEventListener("pointerdown", (e) => {
    const f = e.target.closest(".toc-fold");
    down = f ? { id: e.pointerId, x: e.clientX, y: e.clientY, i: +f.parentNode.dataset.i } : null;
  });
  list.addEventListener("pointerup", (e) => {
    if (!down || down.id !== e.pointerId) return;
    const d = down; down = null;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
    quick = Date.now(); flip(d.i);
  });
  list.addEventListener("click", (e) => {
    const all = e.target.closest("[data-all]");
    if (all) {
      const s = open[state.id];
      if (all.dataset.all === "1") toc.items.forEach((it, i) => { if (kids(i)) s.add(i); }); else s.clear();
      draw(false); return;
    }
    const row = e.target.closest(".toc-row"); if (!row) return;
    const i = +row.dataset.i, it = toc.items[i];
    if (e.target.closest(".toc-fold")) { if (!(e.detail && Date.now() - quick < 700)) flip(i); return; }
    if (!e.target.closest(".toc-item")) return;
    /* tapping a chapter's name goes to it, and opens its sections */
    const k = kids(i);
    if (k && !open[state.id].has(i)) { open[state.id].add(i); draw(false); }
    if (it.page) goToPage(it.page, null, true);
    if (!k && it.page && window.innerWidth < 900) toggleThumbs(false);
  });
  /* keep the "you are here" mark following the page you're on */
  let last = 0;
  setInterval(() => {
    if (sideView !== "toc" || thumbsEl.hidden || toc.docId !== state.id || !toc.items || state.curPage === last) return;
    last = state.curPage;
    const h = hereIndex();
    for (const li of list.children) if (li.dataset.i) li.classList.toggle("here", +li.dataset.i === h);
  }, 600);
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
