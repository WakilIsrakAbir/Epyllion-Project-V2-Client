/* ==========================================================
   Batch Plan module: bridge between the Batch Plan page (batch.html)
   and the project backend (/api/batch). Loaded before batch-app.js.
   The demo kept everything in browser IndexedDB; here every save goes
   to MongoDB through the backend so all users share the same data.
   ========================================================== */
const BatchApi = (() => {
  const API_BASE = "https://abir-backend-api.onrender.com";
  const FLOORS = ["EFL", "EKL", "EXT", "PLUVIA", "OUTSIDE"];
  let user = null;

  function token() { try { return localStorage.getItem("token") || ""; } catch (_) { return ""; } }

  function backToLogin() {
    try { (window.top || window).location.href = "login.html"; } catch (_) { window.location.href = "login.html"; }
  }

  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + token() };
    let response;
    try {
      response = await fetch(API_BASE + "/api/batch" + path, { ...options, headers });
    } catch (_) {
      throw new Error("Cannot reach the server (" + API_BASE + "). Check the internet connection and reload.");
    }
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

  function loadState() { return request("/state"); }
  function commit(payload) { return request("/commit", { method: "POST", body: JSON.stringify(payload) }); }

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

  /* ---------- floor counts for the project sidebar ---------- */
  function notifyCounts() {
    try {
      if (!storageReady || window.parent === window) return;
      const plan = Object.fromEntries(FLOORS.map(f => [f, 0])), card = Object.fromEntries(FLOORS.map(f => [f, 0]));
      for (const booking of getStoredMasterList()) for (const floor of getOrderFloors(booking.number)) plan[floor]++;
      for (const scope of confirmedCardScopes(null)) if (scope.floor) card[scope.floor] = (card[scope.floor] || 0) + 1;
      window.parent.postMessage({ type: "batch-counts", plan, card }, "*");
    } catch (error) { console.warn("Batch counts not sent:", error); }
  }

  /* ---------- routing: the project sidebar sets location.hash ---------- */
  // Views switch even when the data failed to load; every edit is still blocked until storageReady.
  function route() {
    const [section, sub] = decodeURIComponent((location.hash || "#plan").slice(1)).split("/");
    const floor = FLOORS.includes(String(sub || "").toUpperCase()) ? String(sub).toUpperCase() : null;
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

  // The page stays hidden (body.batch-loading, css/batch.css) until the requested page is open.
  function showPage() { document.body.classList.remove("batch-loading"); }
  function ready() { showLoadError(""); buildBuyerPills(); route(); showPage(); notifyCounts(); }

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

  /* A floor-jump button opened the same order on another floor: tell the project page, so its
     sidebar and tab follow. The hash is replaced without a hashchange, which would close the report. */
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

  return { loadState, commit, applyPermissions, notifyCounts, ready, failed, route, has, syncRoute, hasUnsavedChanges };
})();
// Top-level const is not a window property; the project page (index.html) calls BatchApi.route().
window.BatchApi = BatchApi;
