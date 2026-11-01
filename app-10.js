/* ---------- page management: duplicate, move, delete ---------- */
let pageBusy = false;
/* when a page with a chapter (or a link target) is deleted, point it at the next page that stays */
function retargetDests(doc, swap) {
  if (!swap.size) return;
  const { PDFArray, PDFDict, PDFRef, PDFName } = PDFLib;
  const seen = new Set();
  const visit = (obj) => {
    if (!obj || seen.has(obj)) return;
    seen.add(obj);
    if (obj instanceof PDFArray) {
      const first = obj.get(0), second = obj.size() > 1 ? obj.get(1) : null;
      if (first instanceof PDFRef && second instanceof PDFName && swap.has(first.toString())) obj.set(0, swap.get(first.toString()));
      for (let i = 0; i < obj.size(); i++) visit(obj.get(i));
    } else if (obj instanceof PDFDict) {
      if (obj.get(PDFName.of("Type")) === PDFName.of("Page")) return;
      for (const [, v] of obj.entries()) visit(v);
    } else if (obj instanceof PDFRef) {
      visit(doc.context.lookup(obj));
    }
  };
  visit(doc.catalog);
}
async function applyPageOrder(order, focus, message) {
  if (pageBusy || !state.bytes) return;
  if (!window.PDFLib) { toast("The PDF engine didn't load. Reload and try again."); return; }
  pageBusy = true;
  try {
    if (textEdit) closeTextEdit();
    clearLassoSel();
    if (imgSel.parentNode) deselectImage();
    /* rearrange inside the original PDF, so its chapter list and links keep working */
    const doc = await PDFLib.PDFDocument.load(state.bytes, { ignoreEncryption: true });
    const orig = doc.getPages();
    const hasDup = order.length !== new Set(order).size;
    const dupSrc = hasDup ? await PDFLib.PDFDocument.load(state.bytes, { ignoreEncryption: true }) : null;
    const kept = new Set(order), swap = new Map();
    for (let n = 1; n <= orig.length; n++) {
      if (kept.has(n)) continue;
      let t = n + 1;
      while (t <= orig.length && !kept.has(t)) t++;
      if (t > orig.length) { t = n - 1; while (t >= 1 && !kept.has(t)) t--; }
      if (t >= 1) swap.set(orig[n - 1].ref.toString(), orig[t - 1].ref);
    }
    retargetDests(doc, swap);
    for (let i = orig.length - 1; i >= 0; i--) doc.removePage(i);
    const used = new Set();
    for (const n of order) {
      if (!used.has(n)) { used.add(n); doc.addPage(orig[n - 1]); }
      else { const [cp] = await doc.copyPages(dupSrc, [n - 1]); doc.addPage(cp); }
    }
    const bytes = await doc.save();
    const ann = {}, first = {};
    order.forEach((oldN, i) => {
      const items = state.ann[oldN] || [];
      if (!(oldN in first)) { first[oldN] = i + 1; ann[i + 1] = items; }
      else ann[i + 1] = items.map((it) => JSON.parse(JSON.stringify(Object.assign({}, it, { _b: undefined }))));
    });
    const keep = (op) => op.n in first;
    const remap = (op) => { op.n = first[op.n]; return op; };
    const undo = state.undo.filter(keep).map(remap), redo = state.redo.filter(keep).map(remap);
    const bookmarks = (state.bookmarks || []).filter((b) => b.n in first).map((b) => Object.assign({}, b, { n: first[b.n] }));
    const zoomLvl = state.zoom, id = state.id, name = state.name;
    clearTimeout(saveTimer);
    await DB.put("files", { id, bytes });
    await DB.put("ann", { id, ann: stripAnn(ann), bookmarks, pageNumbers: state.pageNumbers || null });
    const m = await DB.get("meta", id);
    if (m) { delete m.thumb; await DB.put("meta", m); }
    delete tabs.mem[id];
    thumbs.built = null;
    if (!(await openDoc(id, name, bytes, null, ann))) return;
    state.undo = undo; state.redo = redo;
    if (zoomLvl !== 1) { state.zoom = zoomLvl; layout(); }
    renderToolbar();
    goToPage(focus, null, true);
    toast(message);
  } catch (e) {
    toast("Couldn't change the pages of this PDF. It may be locked.", 4500);
  } finally { pageBusy = false; }
}
function pageRange() { return state.pages.map((p) => p.n); }
function duplicatePage(n) {
  const o = pageRange(); o.splice(n, 0, n);
  applyPageOrder(o, n + 1, "Page " + n + " duplicated. The copy is page " + (n + 1) + ".");
}
function movePage(n, d) {
  const o = pageRange(), j = n - 1 + d;
  if (j < 0 || j >= o.length) return;
  [o[n - 1], o[j]] = [o[j], o[n - 1]];
  applyPageOrder(o, j + 1, "Moved to page " + (j + 1) + ".");
}
function deletePage(n) {
  if (state.pages.length <= 1) { toast("A PDF needs at least one page."); return; }
  const o = pageRange().filter((x) => x !== n);
  applyPageOrder(o, Math.min(n, o.length), "Page " + n + " deleted.");
}
function armDelete(btn, label, run) {
  if (!btn.classList.contains("armed")) {
    btn.classList.add("armed");
    btn.querySelector("b").textContent = "Tap again to delete";
    setTimeout(() => { btn.classList.remove("armed"); btn.querySelector("b").textContent = label; }, 3000);
    return false;
  }
  btn.classList.remove("armed"); btn.querySelector("b").textContent = label;
  run();
  return true;
}
let opsPage = 1;
function showPageOps(n, anchor) {
  opsPage = n;
  $("poTitle").textContent = "Page " + n + " of " + state.pages.length;
  $("poUp").disabled = n <= 1;
  $("poDown").disabled = n >= state.pages.length;
  $("poDel").disabled = state.pages.length <= 1;
  if (openPop === $("pageOpsPop")) hidePop();
  showPop($("pageOpsPop"), anchor);
}
$("poDup").onclick = () => { hidePop(); duplicatePage(opsPage); };
$("poAdd").onclick = () => { hidePop(); openPageSheet("add", opsPage, "after"); };
$("poUp").onclick = () => { hidePop(); movePage(opsPage, -1); };
$("poDown").onclick = () => { hidePop(); movePage(opsPage, 1); };
$("poDel").addEventListener("click", (e) => { e.stopPropagation(); if (armDelete($("poDel"), "Delete page", () => deletePage(opsPage))) hidePop(); });
$("pmDup").addEventListener("click", () => duplicatePage(state.curPage || 1));
$("pmDel").addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.pages.length <= 1) { hidePop(); toast("A PDF needs at least one page."); return; }
  if (armDelete($("pmDel"), "Delete this page", () => deletePage(state.curPage || 1))) hidePop();
});

/* ---------- go to page ---------- */
function goToPage(n, yPt, animate) {
  const p = state.pages[Math.max(1, Math.min(state.pages.length, n)) - 1];
  if (!p) return;
  if (state.viewMode === "single") {
    if (p.n !== state.curPage) showSingle(p.n, animate);
    if (yPt != null) viewer.scrollTop = Math.max(0, p.wrap.offsetTop + yPt * p.s - viewer.clientHeight / 3);
    updateVisible();
    return;
  }
  let top = viewer.scrollTop, left = viewer.scrollLeft;
  if (state.viewMode === "horizontal") {
    left = Math.max(0, p.wrap.offsetLeft - 12);
    if (yPt != null) top = Math.max(0, p.wrap.offsetTop + yPt * p.s - viewer.clientHeight / 3);
  } else {
    top = Math.max(0, yPt != null ? p.wrap.offsetTop + yPt * p.s - viewer.clientHeight / 3 : p.wrap.offsetTop - 12);
    if (yPt == null) left = Math.max(0, p.wrap.offsetLeft + (p.w * p.s - viewer.clientWidth) / 2);
  }
  const dist = Math.max(Math.abs(top - viewer.scrollTop) / Math.max(1, viewer.clientHeight), Math.abs(left - viewer.scrollLeft) / Math.max(1, viewer.clientWidth));
  if (animate && !reduceMotion.matches && dist > 0.05 && dist <= 2.5) {
    viewer.scrollTo({ top, left, behavior: "smooth" });
  } else {
    viewer.scrollTop = top; viewer.scrollLeft = left;
    if (animate && dist > 2.5) playAnim(pagesEl, "enter-fade");
  }
  updateVisible();
}
$("pageNo").onclick = () => {
  if (!state.pages.length) return;
  if (openPop === $("pagePop")) { hidePop(); return; }
  $("pgInput").value = "";
  $("pgInput").placeholder = String(state.curPage || 1);
  $("pgInput").max = String(state.pages.length);
  $("pgOf").textContent = "of " + state.pages.length;
  showPop($("pagePop"), $("pageNo"));
};
$("pgForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = parseInt($("pgInput").value, 10);
  if (!n || n < 1 || n > state.pages.length) { toast("Enter a page number from 1 to " + state.pages.length + "."); return; }
  hidePop();
  goToPage(n, null, true);
});
$("gotoCancel").onclick = () => { $("gotoSheet").hidden = true; };
$("gotoSheet").addEventListener("pointerdown", (e) => { if (e.target === $("gotoSheet")) $("gotoSheet").hidden = true; });
$("gotoForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = parseInt($("gotoInput").value, 10);
  if (!n || n < 1 || n > state.pages.length) { toast("Enter a page number from 1 to " + state.pages.length + "."); return; }
  $("gotoSheet").hidden = true;
  goToPage(n, null, true);
});

/* ---------- side panel ---------- */
let panelTab = "search";
function openPanel(tab) {
  panelTab = tab;
  const wasOpen = !$("panel").hidden;
  $("panel").hidden = false;
  document.body.classList.add("panel-open");
  $("panelTabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === tab)));
  $("searchTab").hidden = tab !== "search";
  $("bmTab").hidden = tab !== "bookmarks";
  $("reviewTab").hidden = tab !== "review";
  if (!wasOpen) relayoutKeep();
  if (tab === "search") setTimeout(() => { $("searchInput").focus(); $("searchInput").select(); }, 30);
  else if (tab === "review") renderReview();
  else renderBookmarks();
}
function closePanel() {
  $("panel").hidden = true;
  document.body.classList.remove("panel-open");
  relayoutKeep();
}
function relayoutKeep() {
  const n = state.curPage || 1;
  const p = state.pages[n - 1];
  const offY = p ? (viewer.scrollTop - p.wrap.offsetTop) / (p.s || 1) : 0;
  const offX = p ? (viewer.scrollLeft - p.wrap.offsetLeft) / (p.s || 1) : 0;
  layout();
  if (p) {
    viewer.scrollTop = p.wrap.offsetTop + offY * p.s;
    if (state.viewMode === "horizontal") viewer.scrollLeft = p.wrap.offsetLeft + offX * p.s;
    updateVisible();
  }
  if (zoom.on) { sizeZoomWindow(false); zoomMoveTo(zoom.p, zoom.x, zoom.y); }
}
function setViewMode(mode) {
  if (state.viewMode === mode) return;
  const cur = state.curPage || 1;
  state.viewMode = mode; savePrefs();
  state.zoom = 1;
  state.curPage = cur;
  applyViewMode();
  renderToolbar();
}
$("searchBtn").onclick = () => ($("panel").hidden || panelTab !== "search") ? openPanel("search") : closePanel();
$("panelClose").onclick = closePanel;
$("panelTabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) openPanel(b.dataset.v); });

/* ---------- search ---------- */
const search = { q: "", results: [], cur: -1, seq: 0 };
async function pageText(p) {
  if (state.text[p.n]) return state.text[p.n];
  let tc;
  try { tc = await p.page.getTextContent(); } catch (e) { tc = { items: [] }; }
  let str = ""; const item = [], off = [];
  tc.items.forEach((it, ii) => {
    if (typeof it.str !== "string") return;
    for (let k = 0; k < it.str.length; k++) { str += it.str[k]; item.push(ii); off.push(k); }
    if (it.hasEOL) { str += " "; item.push(-1); off.push(0); }
  });
  const t = { str, lower: str.toLowerCase(), item, off, items: tc.items };
  state.text[p.n] = t;
  return t;
}
function rectsFor(p, t, start, len) {
  const rects = [];
  let i = start;
  while (i < start + len) {
    const ii = t.item[i];
    if (ii < 0) { i++; continue; }
    const k0 = t.off[i];
    let cnt = 0;
    while (i < start + len && t.item[i] === ii) { cnt++; i++; }
    const it = t.items[ii];
    const tx = pdfjsLib.Util.transform(p.vp.transform, it.transform);
    const fh = Math.hypot(tx[2], tx[3]) || 10;
    const L = it.str.length || 1;
    const w = it.width * p.vp.scale;
    rects.push({ x: tx[4] + w * (k0 / L), y: tx[5] - fh * 0.9, w: Math.max(2, w * (cnt / L)), h: fh * 1.15 });
  }
  return rects;
}
function resetSearch() {
  search.seq++; search.results = []; search.cur = -1;
  for (const p of state.pages) p.hits.innerHTML = "";
  if (search.q) runSearch(search.q);
  else renderResults();
}
let searchT = null;
$("searchInput").addEventListener("input", () => {
  clearTimeout(searchT);
  searchT = setTimeout(() => runSearch($("searchInput").value), 280);
});
$("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("searchInput").value;
  if (q.trim().toLowerCase() !== search.q) runSearch(q); else stepResult(1);
});
$("nextHit").onclick = () => stepResult(1);
$("prevHit").onclick = () => stepResult(-1);
async function runSearch(raw) {
  const q = String(raw || "").replace(/\s+/g, " ").trim().toLowerCase();
  const seq = ++search.seq;
  search.q = q; search.results = []; search.cur = -1;
  for (const p of state.pages) p.hits.innerHTML = "";
  if (!q) { renderResults(); return; }
  const meta = $("searchMeta");
  let textChars = 0;
  for (const p of state.pages) {
    if (seq !== search.seq) return;
    if (!state.text[p.n] && state.pages.length > 5) meta.textContent = "Searching page " + p.n + " of " + state.pages.length + "…";
    const t = await pageText(p);
    if (seq !== search.seq) return;
    textChars += t.str.trim().length;
    const hay = t.lower.replace(/\s/g, " ");
    let from = 0, idx;
    while ((idx = hay.indexOf(q, from)) >= 0 && search.results.length < 1000) {
      search.results.push({ n: p.n, start: idx, len: q.length, rects: rectsFor(p, t, idx, q.length) });
      from = idx + Math.max(1, q.length);
    }
    if (p.n % 15 === 0) renderResults(true);
  }
  search.textChars = textChars;
  drawHits();
  renderResults();
  if (search.results.length) { search.cur = 0; focusResult(); }
}
function drawHits() {
  for (const p of state.pages) p.hits.innerHTML = "";
  search.results.forEach((r, i) => {
    const p = state.pages[r.n - 1];
    r.els = r.rects.map((rc) => {
      const d = document.createElement("div");
      d.className = "hit" + (i === search.cur ? " cur" : "");
      d.style.left = (rc.x / p.w * 100) + "%"; d.style.top = (rc.y / p.h * 100) + "%";
      d.style.width = (rc.w / p.w * 100) + "%"; d.style.height = (rc.h / p.h * 100) + "%";
      p.hits.appendChild(d);
      return d;
    });
  });
}
function renderResults(partial) {
  const list = $("resultList"), meta = $("searchMeta");
  const R = search.results;
  list.innerHTML = "";
  if (!search.q) { meta.textContent = state.pages.length ? "Type a word or phrase to find it in this PDF." : ""; return; }
  if (!partial) {
    if (!R.length) {
      meta.textContent = search.textChars ? "No matches." : "No searchable text. This PDF is made of images (a scan or converted slides).";
    } else meta.textContent = (search.cur >= 0 ? (search.cur + 1) + " of " : "") + R.length + (R.length >= 1000 ? "+" : "") + (R.length === 1 ? " match" : " matches");
  }
  const frag = document.createDocumentFragment();
  R.slice(0, 300).forEach((r, i) => {
    const t = state.text[r.n];
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button"; b.className = "res" + (i === search.cur ? " cur" : "");
    const sm = document.createElement("small"); sm.textContent = "Page " + r.n;
    const sp = document.createElement("span");
    const a = Math.max(0, r.start - 40), z = Math.min(t.str.length, r.start + r.len + 60);
    sp.append((a > 0 ? "…" : "") + t.str.slice(a, r.start));
    const mk = document.createElement("mark"); mk.textContent = t.str.slice(r.start, r.start + r.len);
    sp.append(mk, t.str.slice(r.start + r.len, z) + (z < t.str.length ? "…" : ""));
    b.append(sm, sp);
    b.onclick = () => { search.cur = i; focusResult(); if (window.innerWidth < 1000) closePanel(); };
    li.appendChild(b); frag.appendChild(li);
  });
  list.appendChild(frag);
}
function stepResult(d) {
  const R = search.results;
  if (!R.length) return;
  search.cur = (search.cur + d + R.length) % R.length;
  focusResult();
}
function focusResult() {
  const R = search.results;
  R.forEach((r, i) => (r.els || []).forEach((el) => el.classList.toggle("cur", i === search.cur)));
  const r = R[search.cur];
  if (!r) return;
  goToPage(r.n, r.rects.length ? r.rects[0].y : 0, true);
  $("resultList").querySelectorAll(".res").forEach((b, i) => b.classList.toggle("cur", i === search.cur));
  const curBtn = $("resultList").querySelectorAll(".res")[search.cur];
  if (curBtn) curBtn.scrollIntoView({ block: "nearest" });
  $("searchMeta").textContent = (search.cur + 1) + " of " + R.length + (R.length >= 1000 ? "+" : "") + (R.length === 1 ? " match" : " matches");
}
