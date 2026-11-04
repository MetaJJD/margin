const gdBtn = document.createElement("button");
gdBtn.type = "button"; gdBtn.className = "icon-btn gd-btn"; gdBtn.id = "gdBtn"; gdBtn.hidden = true;
gdBtn.setAttribute("aria-label", "Google Drive sync");
gdBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.5-1.6A4.8 4.8 0 0 0 7 18.5z"/><path class="gd-ok" d="M9.5 13.5l2 2 3.5-4"/><path class="gd-up" d="M12 16v-5M9.8 13l2.2-2.2 2.2 2.2"/><path class="gd-bang" d="M12 10.5v3M12 16h.01"/></svg>';
$("shareBtn").before(gdBtn);
gdBtn.onclick = () => gdSync(true);
const gdBox = document.createElement("div");
gdBox.className = "gd-box";
gdBox.innerHTML =
  '<p class="gd-line" id="gdLine"></p>' +
  '<div class="gd-setup" id="gdSetup">' +
    '<input class="input" id="gdClient" placeholder="Paste your Client ID" autocomplete="off" autocapitalize="off" spellcheck="false">' +
    '<button class="btn primary" id="gdConnect" type="button">Connect Google Drive</button>' +
    '<details class="gd-how"><summary>How to get a Client ID (once, about 10 minutes)</summary><ol>' +
      '<li>On a computer, open <b>console.cloud.google.com</b> and create a project (any name, like “Margin”).</li>' +
      '<li>In <b>APIs &amp; Services → Library</b>, find <b>Google Drive API</b> and turn it on.</li>' +
      '<li>Open <b>Google Auth Platform</b>. Under <b>Branding</b>, enter the app name “Margin” and your email. Under <b>Audience</b>, choose <b>External</b> and add your Gmail address as a <b>test user</b>.</li>' +
      '<li>Under <b>Clients</b>, create a client of type <b>Web application</b>. Add <b id="gdOrigin"></b> under <b>Authorized JavaScript origins</b>, then create it.</li>' +
      '<li>Copy the <b>Client ID</b> (it ends in .apps.googleusercontent.com), paste it above and tap Connect.</li>' +
      '<li>Google may warn that the app isn’t verified. It’s your own app: tap <b>Continue</b>. Margin can only see the files it puts in its own “Margin” folder.</li>' +
    '</ol></details>' +
  '</div>' +
  '<div class="gd-on" id="gdOnBox"><button class="btn primary" id="gdNow" type="button">Sync now</button><button class="btn" id="gdOff" type="button">Disconnect</button></div>';
{
  const lab = document.createElement("div"); lab.className = "pop-label"; lab.textContent = "Google Drive";
  $("viewPop").append(lab, gdBox);
  gdBox.querySelector("#gdOrigin").textContent = location.origin.indexOf("http") === 0 ? location.origin : "https://metajjd.github.io";
  const css = document.createElement("style");
  css.textContent = ".gd-box { display: flex; flex-direction: column; gap: 8px; }\n" +
    ".gd-line { margin: 0; font-size: 13px; line-height: 1.4; color: var(--muted); }\n" +
    ".gd-line b { color: var(--fg); }\n" +
    ".gd-setup { display: flex; flex-direction: column; gap: 8px; }\n" +
    ".gd-setup .input { height: 38px; font-size: 14px; }\n" +
    ".gd-on { display: flex; gap: 8px; }\n" +
    ".gd-on .btn { flex: 1; }\n" +
    ".gd-setup[hidden], .gd-on[hidden] { display: none; }\n" +
    ".gd-how { font-size: 13px; line-height: 1.45; color: var(--muted); }\n" +
    ".gd-how summary { cursor: pointer; color: var(--accent); font-weight: 600; }\n" +
    ".gd-how ol { margin: 8px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }\n" +
    ".gd-btn[hidden] { display: none; }\n" +
    ".gd-btn svg path { fill: none; }\n" +
    ".gd-btn .gd-ok, .gd-btn .gd-up, .gd-btn .gd-bang { display: none; }\n" +
    ".gd-btn[data-s=ok] .gd-ok, .gd-btn[data-s=busy] .gd-up, .gd-btn[data-s=tap] .gd-bang, .gd-btn[data-s=error] .gd-bang, .gd-btn[data-s=offline] .gd-bang { display: inline; }\n" +
    ".gd-btn[data-s=busy] { color: var(--accent); }\n" +
    ".gd-btn[data-s=busy] .gd-up { animation: gdPulse 1s ease-in-out infinite; }\n" +
    ".gd-btn[data-s=tap], .gd-btn[data-s=error] { color: #c2410c; }\n" +
    "@keyframes gdPulse { 50% { opacity: .25; } }\n" +
    ".pop { max-height: calc(100vh - 76px); max-height: calc(100dvh - 76px); overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }\n";
  document.head.appendChild(css);
}
function gdStatus(s, msg) {
  if (s) gd.status = s;
  gd.err = msg || (s ? "" : gd.err);
  const on = gdOn();
  gdBtn.hidden = !on;
  gdBtn.dataset.s = gd.status || "ok";
  const last = gd.cfg.last ? fmtDate(gd.cfg.last) : "not yet";
  const tips = { ok: "Synced with Google Drive", busy: "Syncing…", tap: "Tap to sync with Google Drive", error: "Sync problem: tap to try again", offline: "Offline: Margin will sync when you're back online" };
  gdBtn.title = tips[gd.status] || tips.ok;
  $("gdSetup").hidden = on; $("gdOnBox").hidden = !on;
  if (!on && gd.cfg.clientId && !$("gdClient").value) $("gdClient").value = gd.cfg.clientId;
  const line = $("gdLine");
  if (!on) line.textContent = "Keep every file and its notes in a “Margin” folder in your Google Drive, and use them on your other devices.";
  else if (gd.status === "busy") line.textContent = "Syncing…";
  else if (gd.status === "tap") line.innerHTML = "<b>Tap Sync now</b> to continue. Google asks again about once an hour. " + (gd.err || "");
  else line.textContent = (gd.err ? gd.err + " " : "") + "Last synced: " + last + ". Margin syncs while it's open.";
}
$("gdConnect").onclick = async () => {
  const id = $("gdClient").value.trim();
  if (!/\.apps\.googleusercontent\.com$/.test(id)) { toast("That doesn't look like a Client ID. It ends in .apps.googleusercontent.com.", 4500); return; }
  gd.cfg.clientId = id; gdSave();
  try { await gdLoadGis(); }
  catch (e) { toast("Google sign-in couldn't load here. Open Margin from its own web address (" + ($("gdOrigin").textContent) + ") and try again.", 7000); return; }
  try { await gdAskToken(true); }
  catch (e) { toast("Google didn't connect (" + e.message + "). Check the Client ID and that " + $("gdOrigin").textContent + " is an authorized origin.", 7000); return; }
  gd.cfg.connected = true; gdSave(); gdStatus("ok");
  toast("Connected. Syncing your files to the Margin folder in Google Drive…", 3500);
  gdSync(true);
};
$("gdNow").onclick = () => gdSync(true);
$("gdOff").onclick = () => {
  gd.cfg.connected = false; gd.cfg.docs = {}; delete gd.cfg.folderId; gd.dirty = {}; gd.token = null; gd.exp = 0;
  try { localStorage.removeItem("margin-gdrive-token"); } catch (e) {}
  gdSave(); gdStatus("ok");
  toast("Disconnected. Your files stay in Margin and in Google Drive.", 4000);
};
$("viewBtn").addEventListener("click", () => { gdStatus(); if (gd.cfg.clientId) gdLoadGis().catch(() => {}); });
gdStatus(gdTokenOk() ? "ok" : "tap");
if (gdOn()) {
  gdLoadGis().catch(() => {});
  setTimeout(() => gdSync(false), 2500);
  setInterval(() => { if (document.visibilityState === "visible") gdSync(false); }, 5 * 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") gdSoon(1500); });
  window.addEventListener("online", () => gdSoon(1500));
}

/* ---------- open several files at once ---------- */
{
  /* a fresh file picker that takes one file or several */
  const old = $("fileInput"), fi = old.cloneNode(false);
  fi.multiple = true;
  old.replaceWith(fi);
  fi.addEventListener("change", async () => {
    const files = Array.from(fi.files || []);
    fi.value = "";
    for (const f of files) await addFile(f);
    if (files.length > 1) toast("Opened " + files.length + " files. Find them all in Home and Files.", 3500);
  });
  window.addEventListener("drop", async (e) => {
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (files.length < 2) return;
    e.preventDefault(); e.stopImmediatePropagation();
    for (const f of files) await addFile(f);
  }, true);
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
