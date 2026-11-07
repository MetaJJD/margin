const gdBtn = document.createElement("button");
gdBtn.type = "button"; gdBtn.className = "icon-btn gd-btn"; gdBtn.id = "gdBtn"; gdBtn.hidden = true;
gdBtn.setAttribute("aria-label", "Google Drive sync");
gdBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.5-1.6A4.8 4.8 0 0 0 7 18.5z"/><path class="gd-ok" d="M9.5 13.5l2 2 3.5-4"/><path class="gd-up" d="M12 16v-5M9.8 13l2.2-2.2 2.2 2.2"/><path class="gd-bang" d="M12 10.5v3M12 16h.01"/><path class="gd-plus" d="M12 11v5M9.5 13.5h5"/></svg>';
$("shareBtn").before(gdBtn);
gdBtn.onclick = () => { if (gdOn()) gdSync(true); else gdOpenSetup(); };
/* open Settings at the Google Drive section */
function gdOpenSetup() {
  if (openPop !== $("viewPop")) $("viewBtn").click();
  requestAnimationFrame(() => {
    const pop = $("viewPop"), lab = gdBox.previousElementSibling || gdBox;
    pop.scrollTop = Math.max(0, lab.offsetTop - 8);
    gdBox.animate([{ background: "var(--chip-on)" }, { background: "transparent" }], { duration: 1400 });
    if (!gdOn() && !$("gdClient").value) setTimeout(() => { try { $("gdClient").focus({ preventScroll: true }); } catch (e) {} }, 300);
  });
}
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
  gdBox.querySelector("#gdOrigin").textContent = /^https?:/.test(location.origin) && !/claudeusercontent|claude\.ai/.test(location.origin) ? location.origin : "https://metajjd.github.io";
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
    ".gd-btn .gd-ok, .gd-btn .gd-up, .gd-btn .gd-bang, .gd-btn .gd-plus { display: none; }\n" +
    ".gd-btn[data-s=off] .gd-plus { display: inline; }\n" +
    ".gd-btn[data-s=off] { color: var(--muted); }\n" +
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
  gdBtn.hidden = false;
  gdBtn.dataset.s = on ? (gd.status || "ok") : "off";
  const last = gd.cfg.last ? fmtDate(gd.cfg.last) : "not yet";
  const tips = { ok: "Synced with Google Drive", busy: "Syncing…", tap: "Tap to sync with Google Drive", error: "Sync problem: tap to try again", offline: "Offline: Margin will sync when you're back online" };
  gdBtn.title = on ? (tips[gd.status] || tips.ok) : "Set up Google Drive sync";
  gdBtn.setAttribute("aria-label", gdBtn.title);
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
  catch (e) { toast("Google sign-in doesn't work in this preview. Open Margin at https://metajjd.github.io/margin/ (your Home Screen app) and connect Drive there.", 8000); return; }
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
