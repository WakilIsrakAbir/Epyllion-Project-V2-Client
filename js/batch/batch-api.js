/* ==========================================================
   Batch Plan module: bridge between the Batch Plan page (batch.html)
   and the project backend (/api/batch). Loaded before batch-app.js.
   The demo kept everything in browser IndexedDB; here every save goes
   to MongoDB through the backend so all users share the same data.
   ========================================================== */
const BatchApi = (() => {
  const API_BASE = "https://abir-backend-api.onrender.com";
  // Unit keys of the current unit tabs (plan sections 16.3 and 18): BATCH_FLOORS in batch-app.js, filled from the server.
  const floorKeys = () => BATCH_FLOORS.map(floor => floor.key);
  let user = null;

  function token() { try { return localStorage.getItem("token") || ""; } catch (_) { return ""; } }

  function backToLogin() {
    try { (window.top || window).location.href = "login.html"; } catch (_) { window.location.href = "login.html"; }
  }

  // onHeaders(response) is called as soon as the server answered, before the body is downloaded.
  async function request(path, options = {}, onHeaders = null) {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + token() };
    let response;
    try {
      response = await fetch(API_BASE + "/api/batch" + path, { ...options, headers });
    } catch (_) {
      throw new Error("Cannot reach the server (" + API_BASE + "). Check the internet connection and reload.");
    }
    if (onHeaders) { try { onHeaders(response); } catch (_) { /* ignore */ } }
    let data = null;
    try { data = await response.json(); } catch (_) { data = null; }
    if (response.status === 401 || (response.status === 403 && !(data && data.code === "PERMISSION") && /token|inactive|expired/i.test(data?.message || ""))) {
      backToLogin();
      throw new Error("Session expired. Please log in again.");
    }
    if (response.status === 404 && !data) {
      throw new Error("The server does not have the Batch Plan update yet. Deploy the updated backend (routes/batch.js and the /api/batch line in server.js), then reload this page.");
    }
    if (!response.ok) throw new Error((data && data.message) || ("Server error " + response.status));
    return data;
  }

  function commit(payload) { return request("/commit", { method: "POST", body: JSON.stringify(payload) }); }

  /* ---------- loading (plan section 18.10): the project's spinner, its progress text and the timings ---------- */
  // Times since the page was opened (performance.now()): request sent, server answered, data parsed, page ready.
  // The summary goes to the console and to the title of the header badge, so a slow load can be explained.
  const loadTimes = { requested: 0, headers: 0, parsed: 0, ready: 0, serverTiming: "" };
  let loadingClock = null;
  function loadingText(text) { const el = document.getElementById("batchLoadingText"); if (el && text) el.textContent = text; }
  function startLoadingClock() {
    const hint = document.getElementById("batchLoadingHint");
    if (!hint || loadingClock) return;
    const started = performance.now();
    loadingClock = setInterval(() => {
      const seconds = Math.round((performance.now() - started) / 1000);
      hint.textContent = seconds >= 6 ? seconds + " s · The server may be waking up after a pause; the first load can then take up to a minute." : (seconds ? seconds + " s" : "");
    }, 1000);
  }
  function stopLoadingClock() { if (loadingClock) clearInterval(loadingClock); loadingClock = null; }
  function fetchState() {
    loadTimes.requested = performance.now();
    loadingText("Connecting to the server…");
    return request("/state", {}, response => {
      loadTimes.headers = performance.now();
      loadTimes.serverTiming = response.headers.get("server-timing") || "";
      loadingText("Downloading orders, saved plans and setup tables…");
    }).then(data => { loadTimes.parsed = performance.now(); loadingText("Preparing the lists…"); return data; });
  }
  // The data request starts as soon as this script runs, before js/batch/batch-app.js is parsed.
  let statePrefetch = fetchState();
  statePrefetch.catch(() => { /* reported when loadState() is awaited */ });
  startLoadingClock();
  function loadState() {
    if (statePrefetch) { const pending = statePrefetch; statePrefetch = null; return pending; }
    return fetchState();
  }
  function reportLoadTimes() {
    loadTimes.ready = performance.now();
    const ms = value => Math.max(0, Math.round(value));
    let size = "";
    try {
      const entry = performance.getEntriesByType("resource").find(e => e.name === API_BASE + "/api/batch/state");
      if (entry && entry.decodedBodySize) size = ` · data ${Math.round(entry.decodedBodySize / 1024)} KB (${Math.round((entry.encodedBodySize || entry.transferSize || 0) / 1024)} KB compressed)`;
    } catch (_) { /* ignore */ }
    const text = `Loaded in ${(loadTimes.ready / 1000).toFixed(1)} s · page scripts ${ms(loadTimes.requested)} ms · server ${ms(loadTimes.headers - loadTimes.requested)} ms · download and parse ${ms(loadTimes.parsed - loadTimes.headers)} ms · render ${ms(loadTimes.ready - loadTimes.parsed)} ms${size}${loadTimes.serverTiming ? " · server: " + loadTimes.serverTiming : ""}`;
    try { console.info("[Batch Plan] " + text); } catch (_) { /* ignore */ }
    const badge = document.getElementById("viewBadge");
    if (badge) badge.title = text;
    return text;
  }

  /* ---------- theme: follow the project's dark mode (js/dark-mode.js writes theme-preference) ---------- */
  function applyTheme(value) { document.documentElement.classList.toggle("dark", value !== "light"); }
  window.addEventListener("storage", event => { if (event.key === "theme-preference") applyTheme(event.newValue); });

  /* ---------- permissions (the server checks the same keys) ---------- */
  function has(path) {
    if (!user) return false;
    if (user.role === "Admin") return true;
    let node = user.permissions;
    for (const part of path.split(".")) node = node && node[part];
    return node === true;
  }
  function applyPermissions(currentUser) {
    user = currentUser || null;
    const body = document.body, flag = (name, allowed) => body.classList.toggle("perm-no-" + name, !allowed);
    flag("edit", has("actions.batchEdit"));
    flag("tentative", has("actions.batchTentative"));
    flag("confirm", has("actions.batchConfirm"));
    flag("internal", has("actions.batchInternalChange"));
    flag("pending", has("actions.batchMovePending"));
    flag("card", has("actions.batchCardGenerate"));
    flag("dyeingmc", has("menus.dataManagement.dyeingMc"));
    flag("flat", has("menus.dataManagement.flatAllowance"));
    flag("unit", has("menus.dataManagement.unitSetup"));
    flag("plan-print", has("downloads.batchPlanPrint"));
    flag("card-print", has("downloads.batchCardPrint"));
    flag("dyeable-excel", has("downloads.dyeableExcel"));
    flag("summary-excel", has("downloads.dyeableSummaryExcel"));
    flag("daily-excel", has("downloads.dailyConfirmExcel"));
  }

  /* ---------- buyer pills built from the data (the demo had a fixed list) ---------- */
  function buildBuyerPills() {
    const container = document.getElementById("buyerPillsContainer");
    if (!container) return;
    const buyers = Array.from(new Set(getStoredMasterList().map(b => String(b.buyer || "").trim().toUpperCase()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    container.innerHTML = ['<button class="buyer-btn active" data-buyer="ALL">ALL BUYERS</button>']
      .concat(buyers.map(b => '<button class="buyer-btn" data-buyer="' + esc(b) + '">' + esc(b) + "</button>")).join("");
    activeBuyerFilter = "ALL";
    container.onclick = event => {
      const button = event.target.closest(".buyer-btn");
      if (!button) return;
      container.querySelectorAll(".buyer-btn").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      activeBuyerFilter = button.dataset.buyer;
      renderBatchRegister();
    };
  }

  /* ---------- routing: the project sidebar and the unit tabs in the heading set location.hash ---------- */
  // Views switch even when the data failed to load; every edit is still blocked until storageReady.
  function route() {
    const [section, sub] = decodeURIComponent((location.hash || "#plan").slice(1)).split("/");
    let floor = floorKeys().includes(String(sub || "").toUpperCase()) ? String(sub).toUpperCase() : null;
    // A unit that is no longer in the list (e.g. a saved page) opens the all-orders page for a user who may
    // see all orders, else the first unit the user may open. The plain "plan"/"card" route (sidebar item,
    // plan section 18) opens the first unit the user may open when the all-orders permission is missing.
    // The project's tab and sidebar follow (syncRoute). A user with neither gets the all-orders page empty
    // (getFloorBookings, renderCardRegister).
    if (storageReady && !floor && (section === "plan" || section === "card")) {
      const group = section === "card" ? "batchCard" : "batchPlan";
      const all = has("menus." + group + ".all");
      if (!all) floor = floorKeys().find(key => has("menus." + group + "." + key.toLowerCase())) || null;
      if ((all || floor) && (sub || floor)) syncRoute(floor ? section + "/" + floor : section);
    }
    if (section === "card") { selectCardFloor(floor); return; }
    if (section === "setup") { selectSetupPanel(sub === "flat" ? "flat" : sub === "unit" ? "unit" : "dyeing"); return; }
    if (section === "report") {
      if (sub === "daily") { dyeableReportMode = "daily"; switchMainView("reports"); openDailyConfirmFilters(); return; }
      const mode = sub === "summary" ? "summary" : "detail";
      dyeableReportMode = mode; switchMainView("reports"); openDyeableFilters(mode); return;
    }
    selectFloor(floor);
  }
  window.addEventListener("hashchange", route);

  // The loading spinner stays (body.batch-loading, css/batch.css) until the requested page is open.
  function showPage() { stopLoadingClock(); document.body.classList.remove("batch-loading"); }
  function ready() { showLoadError(""); buildBuyerPills(); route(); showPage(); reportLoadTimes(); }

  /* ---------- a banner that stays visible when the data could not be loaded ---------- */
  function showLoadError(message) {
    let banner = document.getElementById("batchLoadError");
    if (!message) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "batchLoadError";
      banner.setAttribute("role", "alert");
      banner.style.cssText = "position:sticky;top:0;z-index:999;margin:0;padding:12px 16px;background:#fef2f2;color:#991b1b;border-bottom:1px solid #fecaca;font:600 13px/1.4 system-ui,sans-serif;";
      document.body.prepend(banner);
    }
    banner.textContent = "Batch Plan data could not be loaded. " + message;
  }
  function failed(error) { showLoadError((error && error.message) || String(error)); route(); showPage(); }

  /* The page moved to another unit (a unit tab in the heading, a floor-jump button or a search result):
     tell the project page, so its tab, sidebar highlight and saved page follow. The hash is replaced
     without a hashchange, which would close an open report. */
  function syncRoute(newRoute) {
    try { history.replaceState(null, "", "#" + newRoute); } catch (_) { /* ignore */ }
    if (window.parent !== window) window.parent.postMessage({ type: "batch-route", route: newRoute }, "*");
  }

  // Unsaved work on this page: an edited plan report or a Setup table draft. The project page asks
  // before it reloads this page for newer data.
  function hasUnsavedChanges() {
    try {
      return !!((reportDraft && reportDraft.dirty) || (unitSetupDraft && unitSetupDraft.size) || setupDirty || flatAllowanceDirty);
    } catch (_) { return false; }
  }

  return { loadState, commit, applyPermissions, ready, failed, route, has, syncRoute, hasUnsavedChanges, reportLoadTimes };
})();
// Top-level const is not a window property; the project page (index.html) calls BatchApi.route().
window.BatchApi = BatchApi;
