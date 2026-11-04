const opCtl = document.createElement("label");
opCtl.className = "imgop"; opCtl.title = "Photo opacity";
opCtl.innerHTML = '<span>Opacity</span><input type="range" min="10" max="100" step="5" aria-label="Photo opacity">';
const opIn = opCtl.querySelector("input");
imgSel.querySelector(".selbar").prepend(opCtl);
for (const ev of ["pointerdown", "touchstart", "mousedown"]) opCtl.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
let opBefore = null;
opIn.addEventListener("input", () => {
  if (!sel || sel.item.type !== "img") return;
  if (opBefore == null) opBefore = sel.item.op == null ? 1 : sel.item.op;
  sel.item.op = +opIn.value / 100;
  drawInk(sel.p);
});
opIn.addEventListener("change", () => {
  if (!sel || opBefore == null) return;
  const after = sel.item.op == null ? 1 : sel.item.op;
  if (after !== opBefore) commit({ t: "edit", n: sel.p.n, item: sel.item, before: { op: opBefore }, after: { op: after } });
  opBefore = null;
});
{
  const sI = selectImage;
  selectImage = function (p, item) {
    sI.apply(this, arguments);
    opCtl.hidden = item.type !== "img";
    opIn.value = String(Math.round((item.op == null ? 1 : item.op) * 100));
  };
  /* undo and redo move the slider too */
  const uS = updateImgSel;
  updateImgSel = function () { uS.apply(this, arguments); if (sel && sel.item.type === "img" && opBefore == null) opIn.value = String(Math.round((sel.item.op == null ? 1 : sel.item.op) * 100)); };
}

/* ---------- Settings (was View) and tool options in a floating panel ---------- */
{
  const vb = $("viewBtn");
  vb.title = "Settings"; vb.setAttribute("aria-label", "Settings");
  vb.querySelector(".lbl").textContent = "Settings";
  vb.querySelector("svg").outerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  $("viewPop").setAttribute("aria-label", "Settings");
}
const toolPop = document.createElement("div");
toolPop.className = "toolpop"; toolPop.hidden = true;
toolPop.setAttribute("role", "dialog"); toolPop.setAttribute("aria-label", "Tool options");
{
  const opts = document.querySelector(".row2 .options");
  /* saved pens and the save button live in the pen and highlighter panel */
  const keep = document.createElement("div"); keep.id = "penPresets"; keep.className = "pen-presets";
  keep.setAttribute("role", "group"); keep.setAttribute("aria-label", "Saved pens");
  opts.appendChild(keep);
  toolPop.appendChild(opts);
  document.body.appendChild(toolPop);
  const css = document.createElement("style");
  css.textContent = ".toolpop { position: fixed; z-index: 44; background: var(--bar); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 14px 36px rgba(10,20,40,.24); padding: 8px 10px; box-sizing: border-box; max-width: calc(100vw - 16px); }\n" +
    ".toolpop::before { content: \"\"; position: absolute; top: -6px; left: var(--ax, 24px); width: 10px; height: 10px; background: var(--bar); border-left: 1px solid var(--line); border-top: 1px solid var(--line); transform: translateX(-50%) rotate(45deg); }\n" +
    ".toolpop.above::before { top: auto; bottom: -6px; transform: translateX(-50%) rotate(225deg); }\n" +
    ".toolpop.beside::before { display: none; }\n" +
    ".toolpop .options { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }\n" +
    ".toolpop .swatches, .toolpop .sizes { flex-wrap: wrap; align-items: center; gap: 6px; }\n" +
    ".toolpop .tool-hint { white-space: normal; max-width: 260px; }\n" +
    ".toolpop .pen-presets[hidden] { display: none; }\n" +
    "body.read-night .toolpop { filter: none; }\n";
  document.head.appendChild(css);
}
let tpAnchor = null, tpTool = null, pillAnchor = null;
function toolHasOptions() {
  const sw = $("swatches"), sz = $("sizes"), pp = $("penPresets");
  return (!sw.hidden && sw.childElementCount > 0) || (!sz.hidden && sz.childElementCount > 0) || (!pp.hidden && pp.childElementCount > 0);
}
function hideToolPop() { toolPop.hidden = true; tpTool = null; }
function placeToolPop() {
  if (toolPop.hidden || !tpAnchor) return;
  const r = tpAnchor.getBoundingClientRect();
  if (!r.width && !r.height) { hideToolPop(); return; }
  const vw = window.innerWidth, vh = window.innerHeight, w = toolPop.offsetWidth, h = toolPop.offsetHeight, cx = r.left + r.width / 2;
  let left = Math.max(8, Math.min(vw - w - 8, cx - w / 2)), top = r.bottom + 10;
  toolPop.classList.remove("above", "beside");
  if (top + h > vh - 8) {
    if (r.top - h - 10 >= 8) { top = r.top - h - 10; toolPop.classList.add("above"); }
    else { top = Math.max(8, Math.min(vh - h - 8, r.top + r.height / 2 - h / 2)); left = r.right + 10 + w < vw ? r.right + 10 : Math.max(8, r.left - w - 10); toolPop.classList.add("beside"); }
  }
  toolPop.style.left = Math.round(left) + "px"; toolPop.style.top = Math.round(top) + "px";
  toolPop.style.setProperty("--ax", Math.round(Math.max(14, Math.min(w - 14, cx - left))) + "px");
}
function showToolPop(anchor) {
  tpAnchor = anchor; tpTool = state.tool;
  if (!toolHasOptions()) { hideToolPop(); return; }
  hidePop();
  toolPop.hidden = false;
  placeToolPop();
}
/* tap a tool: its options float below it; tap the same tool again to hide them */
$("fsPill").addEventListener("click", (e) => { const b = e.target.closest("[data-fstool]"); pillAnchor = b || null; }, true);
document.querySelector(".row2").addEventListener("click", (e) => {
  const b = e.target.closest(".tool[data-tool]");
  if (!b) return;
  const t = b.dataset.tool, wasOpen = !toolPop.hidden && tpTool === t;
  const anchor = pillAnchor && pillAnchor.dataset.fstool === t ? pillAnchor : b;
  pillAnchor = null;
  setTimeout(() => { if (wasOpen) hideToolPop(); else if (state.tool === t) showToolPop(anchor); }, 0);
}, true);
document.addEventListener("pointerdown", (e) => {
  if (toolPop.hidden || toolPop.contains(e.target)) return;
  if (e.target.closest && e.target.closest(".tool[data-tool], #fsPill [data-fstool]")) return;
  hideToolPop();
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideToolPop(); });
window.addEventListener("resize", () => placeToolPop());
{
  const rt = renderToolbar;
  renderToolbar = function () {
    rt.apply(this, arguments);
    $("penPresets").hidden = state.tool !== "pen" && state.tool !== "hl";
    if (toolPop.hidden) return;
    if (state.tool !== tpTool) {
      /* a saved pen picked in the panel can switch pen and highlighter: the panel follows */
      const inPill = tpAnchor && tpAnchor.closest && tpAnchor.closest("#fsPill");
      const a = inPill ? document.querySelector('#fsPill [data-fstool="' + state.tool + '"]') : document.querySelector('.row2 .tool[data-tool="' + state.tool + '"]');
      if (!a) { hideToolPop(); return; }
      tpAnchor = a; tpTool = state.tool;
    }
    if (!toolHasOptions()) hideToolPop(); else placeToolPop();
  };
}
