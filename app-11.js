/* ---------- bookmarks ---------- */
async function toggleBookmark(nArg) {
  const n = typeof nArg === "number" ? nArg : (state.curPage || 1);
  if (!state.pages.length) return;
  const i = state.bookmarks.findIndex((b) => b.n === n);
  if (i >= 0) {
    state.bookmarks.splice(i, 1);
    toast("Removed page " + n + " from favorites.");
  } else {
    const t = await pageText(state.pages[n - 1]);
    const first = t.str.replace(/\s+/g, " ").trim().slice(0, 48);
    state.bookmarks.push({ n, label: first || "Page " + n, at: Date.now() });
    toast("Page " + n + " added to favorites.");
  }
  scheduleSave();
  renderBookmarks();
  updateVisible();
}
$("bmBtn").onclick = () => toggleBookmark();
function renderBookmarks() {
  const marks = (state.bookmarks || []).slice().sort((a, b) => a.n - b.n);
  for (const p of state.pages) p.ribbon.hidden = !marks.some((b) => b.n === p.n);
  thumbs.els.forEach((el, i) => { el.tb.setAttribute("aria-pressed", String(marks.some((b) => b.n === i + 1))); });
  applyThumbFilter();
  const list = $("bmList");
  if (!list) return;
  list.innerHTML = "";
  if (!marks.length) {
    list.innerHTML = '<li><p class="panel-empty">No favorite pages yet. Tap the page number at the top, then Add to favorites. Or tap the ribbon on a page in the Pages sidebar.</p></li>';
    return;
  }
  for (const bm of marks) {
    const li = document.createElement("li"); li.className = "bm";
    const go = document.createElement("button");
    go.type = "button"; go.className = "bm-go"; go.setAttribute("aria-label", "Go to page " + bm.n);
    go.innerHTML = '<span class="bm-page">Page</span><b></b>';
    go.querySelector("b").textContent = bm.n;
    go.onclick = () => { goToPage(bm.n, null, true); if (window.innerWidth < 1000) closePanel(); };
    const inp = document.createElement("input");
    inp.className = "input"; inp.type = "text"; inp.value = bm.label; inp.maxLength = 80;
    inp.setAttribute("aria-label", "Bookmark name for page " + bm.n);
    inp.addEventListener("change", () => { bm.label = inp.value.trim() || "Page " + bm.n; inp.value = bm.label; scheduleSave(); });
    const del = document.createElement("button");
    del.type = "button"; del.className = "del"; del.textContent = "Remove";
    del.onclick = () => {
      const i = state.bookmarks.indexOf(bm);
      if (i >= 0) state.bookmarks.splice(i, 1);
      scheduleSave(); renderBookmarks(); updateVisible();
    };
    li.append(go, inp, del);
    list.appendChild(li);
  }
}

/* ---------- pages sidebar (thumbnails) ---------- */
const thumbsEl = $("thumbs"), thumbList = $("thumbList");
const thumbs = { built: null, els: [], obs: null, queue: Promise.resolve(), cur: 0, timers: {} };
function setThumbsDom() {
  const open = !!state.thumbsOpen && state.pages.length > 0;
  thumbsEl.hidden = !open;
  $("stage").classList.toggle("with-thumbs", open);
  $("thumbsBtn").setAttribute("aria-pressed", String(!!state.thumbsOpen));
  $("thumbsBtn").setAttribute("aria-label", state.thumbsOpen ? "Hide page thumbnails" : "Show page thumbnails");
  if (open && thumbs.built !== state.id + "|" + state.pages.length) buildThumbs();
  if (open) { thumbs.cur = 0; markThumb(state.curPage || 1); }
}
function toggleThumbs(force) {
  state.thumbsOpen = force != null ? force : !state.thumbsOpen;
  savePrefs();
  setThumbsDom();
  relayoutKeep();
}
$("thumbsBtn").onclick = () => toggleThumbs();
$("thumbsClose").onclick = () => toggleThumbs(false);
function buildThumbs() {
  if (thumbs.obs) thumbs.obs.disconnect();
  thumbList.innerHTML = "";
  thumbs.els = [];
  thumbs.obs = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) queueThumb(+en.target.dataset.n);
  }, { root: thumbList, rootMargin: "400px 0px" });
  const marks = state.bookmarks || [];
  for (const p of state.pages) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "thumb"; b.dataset.n = String(p.n);
    b.setAttribute("aria-label", "Go to page " + p.n);
    const tc = document.createElement("span"); tc.className = "tc";
    tc.style.height = Math.round(104 * p.h / p.w) + "px";
    const tn = document.createElement("span"); tn.className = "tn"; tn.textContent = p.n;
    const tb = document.createElement("span");
    tb.className = "tb"; tb.setAttribute("role", "button"); tb.tabIndex = 0;
    tb.setAttribute("aria-label", "Favorite page " + p.n);
    tb.setAttribute("aria-pressed", String(marks.some((m) => m.n === p.n)));
    const flip = (e) => { e.stopPropagation(); e.preventDefault(); toggleBookmark(p.n); };
    tb.addEventListener("click", flip);
    tb.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") flip(e); });
    const more = document.createElement("span");
    more.className = "tmore"; more.setAttribute("role", "button"); more.tabIndex = 0;
    more.setAttribute("aria-label", "Actions for page " + p.n);
    more.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    const openOps = (e) => { e.stopPropagation(); e.preventDefault(); showPageOps(p.n, more); };
    more.addEventListener("click", openOps);
    more.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openOps(e); });
    b.append(tc, tn, tb, more);
    b.tc = tc; b.tb = tb; b.done = false;
    b.onclick = () => {
      goToPage(p.n, null, true);
      if (window.innerWidth < 900) toggleThumbs(false);
    };
    thumbList.appendChild(b);
    thumbs.els.push(b);
    thumbs.obs.observe(b);
  }
  const add = document.createElement("button");
  add.type = "button"; add.className = "thumb-add";
  add.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>Add page</span>';
  add.onclick = () => openPageSheet("add", null, "end");
  thumbList.appendChild(add);
  thumbs.built = state.id + "|" + state.pages.length;
  applyThumbFilter();
}
function queueThumb(n, force) {
  const el = thumbs.els[n - 1];
  if (!el || (el.done && !force)) return;
  el.done = true;
  const doc = state.id;
  thumbs.queue = thumbs.queue.then(() => (doc === state.id ? renderThumb(n) : null)).catch(() => {});
}
async function renderThumb(n) {
  const p = state.pages[n - 1], el = thumbs.els[n - 1];
  if (!p || !el) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const k = (104 * dpr) / p.w;
  const vp = p.page.getViewport({ scale: k });
  const c = document.createElement("canvas");
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
  await p.page.render({ canvasContext: ctx, viewport: vp }).promise;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  drawLayer(ctx, state.ann[n] || []);
  drawPageNum(ctx, p);
  const old = el.tc.querySelector("canvas");
  if (old) { old.width = 0; old.remove(); }
  el.tc.appendChild(c);
}
function thumbDirty(n) {
  const el = thumbs.els[n - 1];
  if (!el) return;
  el.done = false;
  clearTimeout(thumbs.timers[n]);
  thumbs.timers[n] = setTimeout(() => { if (!thumbsEl.hidden) queueThumb(n, true); }, 700);
}
function markThumb(n) {
  if (thumbsEl.hidden || thumbs.cur === n) return;
  const prev = thumbs.els[thumbs.cur - 1];
  if (prev) prev.classList.remove("cur");
  const el = thumbs.els[n - 1];
  thumbs.cur = n;
  if (!el) return;
  el.classList.add("cur");
  const lr = thumbList.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (r.top < lr.top || r.bottom > lr.bottom) thumbList.scrollTop += r.top - lr.top - lr.height / 2 + r.height / 2;
}

/* favorites filter in the pages sidebar */
let sideView = "all";
try { sideView = localStorage.getItem("margin-side-view") || (localStorage.getItem("margin-thumb-fav") === "1" ? "fav" : "all"); } catch (e) {}
if (!["all", "fav", "toc"].includes(sideView)) sideView = "all";
function applyThumbFilter() {
  const marks = state.bookmarks || [];
  const fav = sideView === "fav", toc = sideView === "toc";
  let shown = 0;
  thumbs.els.forEach((el, i) => {
    el.hidden = fav && !marks.some((b) => b.n === i + 1);
    if (!el.hidden) shown++;
  });
  $("thumbFilter").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === sideView)));
  $("thumbEmpty").hidden = !(fav && shown === 0);
  thumbList.hidden = toc || (fav && shown === 0);
  $("tocBox").hidden = !toc;
  const wasWide = thumbsEl.classList.contains("wide");
  thumbsEl.classList.toggle("wide", toc);
  $("stage").classList.toggle("thumbs-wide", toc && !thumbsEl.hidden);
  if (toc) renderToc();
  if (wasWide !== toc && !thumbsEl.hidden) relayoutKeep();
  if (thumbs.obs && !toc) thumbs.els.forEach((el) => { if (!el.hidden) { thumbs.obs.unobserve(el); thumbs.obs.observe(el); } });
}
let thumbFav = false;
$("thumbFilter").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  sideView = b.dataset.v;
  try { localStorage.setItem("margin-side-view", sideView); } catch (err) {}
  applyThumbFilter();
  thumbList.scrollTop = 0;
  thumbs.cur = 0; markThumb(state.curPage || 1);
});

/* ---------- contents: the PDF's own chapter list ---------- */
const toc = { docId: null, items: null };
async function resolveDest(dest) {
  try {
    const d = typeof dest === "string" ? await state.pdf.getDestination(dest) : dest;
    if (!Array.isArray(d) || !d[0]) return null;
    const idx = typeof d[0] === "number" ? d[0] : await state.pdf.getPageIndex(d[0]);
    return idx + 1;
  } catch (e) { return null; }
}
async function loadToc() {
  if (toc.docId === state.id && toc.items) return toc.items;
  const docId = state.id;
  let outline = null;
  try { outline = await state.pdf.getOutline(); } catch (e) {}
  const flat = [];
  async function walk(list, depth) {
    for (const it of list || []) {
      if (flat.length > 800) return;
      flat.push({ title: (it.title || "Untitled").trim(), depth, page: it.dest ? await resolveDest(it.dest) : null });
      if (it.items && it.items.length) await walk(it.items, depth + 1);
    }
  }
  await walk(outline, 0);
  if (docId !== state.id) return [];
  toc.docId = docId; toc.items = flat;
  return flat;
}
async function renderToc() {
  const list = $("tocList");
  if (!state.pdf) { list.innerHTML = ""; return; }
  if (toc.docId !== state.id) list.innerHTML = '<li class="toc-empty">Loading chapters…</li>';
  const items = await loadToc();
  if (sideView !== "toc") return;
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = '<li class="toc-empty">This PDF has no built-in chapter list. Use <b>Favorites</b> to mark the pages you want to find again.</li>';
    return;
  }
  for (const it of items) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button"; b.className = "toc-item d" + Math.min(it.depth, 4);
    const t = document.createElement("span"); t.className = "toc-title"; t.textContent = it.title;
    const pg = document.createElement("span"); pg.className = "toc-page"; pg.textContent = it.page || "";
    b.append(t, pg);
    if (it.page) b.onclick = () => { goToPage(it.page, null, true); if (window.innerWidth < 900) toggleThumbs(false); };
    else b.disabled = true;
    li.appendChild(b);
    list.appendChild(li);
  }
}

/* ---------- review: everything you've marked in this file ---------- */
async function highlightText(p, it) {
  const t = await pageText(p);
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const q of it.pts) { x1 = Math.min(x1, q[0]); y1 = Math.min(y1, q[1]); x2 = Math.max(x2, q[0]); y2 = Math.max(y2, q[1]); }
  y1 -= it.w / 2; y2 += it.w / 2;
  const parts = [];
  t.items.forEach((ti) => {
    if (typeof ti.str !== "string" || !ti.str.trim() || !ti.width) return;
    const tx = pdfjsLib.Util.transform(p.vp.transform, ti.transform);
    if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) return;
    const fh = Math.abs(tx[3]) || 10, x0 = tx[4], base = tx[5], w = ti.width * p.vp.scale;
    const top = base - fh * 0.85, bot = base + fh * 0.2;
    const overlap = Math.min(bot, y2) - Math.max(top, y1);
    if (overlap < fh * 0.4) return;
    if (x2 < x0 || x1 > x0 + w) return;
    const L = ti.str.length, cw = w / L;
    let i0 = Math.max(0, Math.floor((x1 - x0) / cw + 0.3)), i1 = Math.min(L, Math.ceil((x2 - x0) / cw - 0.3));
    if (i1 <= i0) return;
    while (i0 > 0 && /\S/.test(ti.str[i0 - 1]) && /\S/.test(ti.str[i0])) i0--;
    while (i1 < L && /\S/.test(ti.str[i1]) && /\S/.test(ti.str[i1 - 1])) i1++;
    parts.push({ base, x: x0 + i0 * cw, s: ti.str.slice(i0, i1) });
  });
  parts.sort((a, b) => (Math.abs(a.base - b.base) < 3 ? a.x - b.x : a.base - b.base));
  return parts.map((q) => q.s).join(" ").replace(/\s+/g, " ").trim();
}
async function collectReview() {
  const out = [];
  for (const p of state.pages) {
    const items = state.ann[p.n] || [];
    const marks = (state.bookmarks || []).filter((b) => b.n === p.n);
    if (!items.length && !marks.length) continue;
    const entries = [];
    for (const b of marks) entries.push({ kind: "Favorite", text: b.label || "Page " + p.n, color: "#2b55c9", y: 0 });
    const ink = items.filter((i) => i.type === "pen").length;
    for (const it of items) {
      if (it.type === "hl") {
        const txt = await highlightText(p, it);
        let y = Infinity; for (const q of it.pts) y = Math.min(y, q[1]);
        entries.push({ kind: "Highlight", text: txt || "(highlight over a picture or handwriting)", quote: !!txt, color: it.color, y });
      } else if (it.type === "note") entries.push({ kind: "Sticky note", text: it.text, color: it.color, y: it.y });
      else if (it.type === "text" && it.text) entries.push({ kind: "Text", text: it.text, color: it.color, y: it.y });
      else if (it.type === "img") entries.push({ kind: "Photo", text: "Photo on this page", color: "#9aa3b0", y: it.y });
    }
    if (ink) entries.push({ kind: "Handwriting", text: ink + (ink === 1 ? " pen stroke" : " pen strokes") + " (underlines, drawings and writing)", color: "#1b1f2a", y: Infinity });
    entries.sort((a, b) => a.y - b.y);
    out.push({ n: p.n, entries });
  }
  return out;
}
let reviewData = [];
async function renderReview() {
  const list = $("reviewList"), meta = $("reviewMeta");
  if (!state.pages.length) { list.innerHTML = ""; meta.textContent = ""; return; }
  meta.textContent = "Gathering your marks…";
  reviewData = await collectReview();
  list.innerHTML = "";
  const count = reviewData.reduce((s, g) => s + g.entries.length, 0);
  meta.textContent = count ? count + (count === 1 ? " item" : " items") + " on " + reviewData.length + (reviewData.length === 1 ? " page" : " pages") : "";
  $("reviewCopy").hidden = !count;
  if (!count) { list.innerHTML = '<li><p class="panel-empty">Nothing marked in this file yet. Highlights, notes, text boxes and favorites will be listed here.</p></li>'; return; }
  for (const g of reviewData) {
    const h = document.createElement("li"); h.className = "rv-page"; h.textContent = "Page " + g.n; list.appendChild(h);
    for (const en of g.entries) {
      const li = document.createElement("li");
      const b = document.createElement("button"); b.type = "button"; b.className = "rv-item";
      const sw = document.createElement("span"); sw.className = "rv-swatch"; sw.style.background = en.color;
      const body = document.createElement("span"); body.className = "rv-body";
      const k = document.createElement("span"); k.className = "rv-kind"; k.textContent = en.kind;
      const tx = document.createElement("span"); tx.className = "rv-text" + (en.quote ? " quote" : ""); tx.textContent = en.text;
      body.append(k, tx); b.append(sw, body);
      b.onclick = () => { goToPage(g.n, isFinite(en.y) && en.y > 0 ? en.y : null, true); if (window.innerWidth < 1000) closePanel(); };
      li.appendChild(b); list.appendChild(li);
    }
  }
}
$("reviewCopy").onclick = async () => {
  const lines = [state.name, ""];
  for (const g of reviewData) {
    lines.push("Page " + g.n);
    for (const en of g.entries) if (en.kind !== "Handwriting" && en.kind !== "Photo") lines.push("- " + en.kind + ": " + (en.quote ? "\u201c" + en.text + "\u201d" : en.text));
    lines.push("");
  }
  const text = lines.join("\n").trim();
  try { await navigator.clipboard.writeText(text); toast("Copied. Paste it into Notes or a message."); }
  catch (e) { toast("Copying isn't allowed here. Try again from the Home Screen app.", 4000); }
};
