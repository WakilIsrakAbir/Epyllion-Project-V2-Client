// ==========================================================
// BATCH PLAN MODULE HOST (additive)
// Opens batch.html (Batch Plan, Batch Card, Batch Report and the three
// Setup pages from the Batch Plan demo) inside the main area.
// ==========================================================
const BATCH_FLOOR_ROUTES = [["EFL", "EFL Floor"], ["EKL", "EKL Floor"], ["EXT", "Ext Floor"], ["PLUVIA", "Pluvia Wash"], ["OUTSIDE", "Outside Dyeing"]];

// route -> [tab title, sidebar menu id, permission group, permission key]
const BATCH_ROUTES = {
  "plan": ["Batch Plan", "menu-batch-plan-all", "batchPlan", "all"],
  "card": ["Batch Card", "menu-batch-card-all", "batchCard", "all"],
  "setup/dyeing": ["Dyeing MC", "menu-batch-setup-dyeing", "dataManagement", "dyeingMc"],
  "setup/flat": ["Flat Allowance", "menu-batch-setup-flat", "dataManagement", "flatAllowance"],
  "setup/unit": ["Unit Setup", "menu-batch-setup-unit", "dataManagement", "unitSetup"],
  "report/detail": ["Dyeable Batch", "menu-batch-report-detail", "batchReport", "dyeableBatch"],
  "report/summary": ["Dyeable Batch Summary", "menu-batch-report-summary", "batchReport", "dyeableSummary"],
  "report/daily": ["Daily Confirm Batch Plan", "menu-batch-report-daily", "batchReport", "dailyConfirm"],
};
BATCH_FLOOR_ROUTES.forEach(([key, label]) => {
  BATCH_ROUTES["plan/" + key] = ["Batch Plan · " + label, "menu-batch-plan-" + key.toLowerCase(), "batchPlan", key.toLowerCase()];
  BATCH_ROUTES["card/" + key] = ["Batch Card · " + label, "menu-batch-card-" + key.toLowerCase(), "batchCard", key.toLowerCase()];
});

function batchPermissions() {
  try { return JSON.parse(localStorage.getItem("permissions")); } catch (e) { return null; }
}
function batchHasMenu(group, key) {
  if (localStorage.getItem("role") === "Admin") return true;
  const p = batchPermissions();
  return !!(p && p.menus && p.menus[group] && p.menus[group][key] === true);
}
// A floor page can be opened with that floor's permission or with the all-orders permission
// (the server's canUseFloor rule, lib/batch/source.js).
function batchCanOpen(group, key) {
  return batchHasMenu(group, key) || (key !== "all" && batchHasMenu(group, "all"));
}
function batchHasAction(key) {
  if (localStorage.getItem("role") === "Admin") return true;
  const p = batchPermissions();
  return !!(p && p.actions && p.actions[key] === true);
}

// Set when a source file is uploaded or deleted; the Batch Plan page then reloads its data on next open.
let batchDataStale = false;

// fromTab: the user clicked an open top tab, so an open report on that same page is kept.
function showBatchModule(route, fromTab) {
  if (!BATCH_ROUTES[route]) route = "plan";
  const [title, menuId, group, key] = BATCH_ROUTES[route];
  if (!batchCanOpen(group, key)) {
    if (typeof showToast === "function") showToast("Access Denied: " + title + " permission required.", true);
    showDashboardHome();
    return;
  }
  localStorage.setItem("activePage", JSON.stringify({ page: "batch", route }));
  activeTabId = "batch:" + route;
  hideAllCoreViews();
  document.getElementById("batchModuleView").classList.remove("hidden");

  const frame = document.getElementById("batchModuleFrame");
  let reloaded = false;
  if (!frame.getAttribute("src")) {
    frame.setAttribute("src", "batch.html#" + route);
    reloaded = true;
  } else {
    try {
      const win = frame.contentWindow;
      // Newer data (upload, Dyeing Plan save, unit list change): reload the page so it reads it,
      // unless the user wants to keep unsaved work there first.
      const reload = batchDataStale && !(win.BatchApi && win.BatchApi.hasUnsavedChanges && win.BatchApi.hasUnsavedChanges() &&
        !confirm("Batch Plan has unsaved changes. Load the latest data and discard them?"));
      if (reload) {
        win.history.replaceState(null, "", "#" + route);
        win.location.reload();
        reloaded = true;
      } else if (win.location.hash !== "#" + route) win.location.hash = route;
      else if (!fromTab && win.BatchApi) win.BatchApi.route();
    } catch (e) {
      frame.setAttribute("src", "batch.html#" + route);
      reloaded = true;
    }
  }

  if (reloaded) batchDataStale = false;
  if (!openTabs.find((t) => t.id === activeTabId)) openTabs.push({ id: activeTabId, title, dept: route, mode: "batch" });
  renderTabs();
  setActiveSidebarMenu(menuId);
  closeSidebarMobile();
}

// A floor-jump button inside batch.html moved to another floor: show that route as the active tab
// and sidebar item, without touching the iframe (it already shows the order there).
function markBatchRoute(route) {
  if (!BATCH_ROUTES[route]) return;
  const [title, menuId, group, key] = BATCH_ROUTES[route];
  if (!batchCanOpen(group, key)) return;
  localStorage.setItem("activePage", JSON.stringify({ page: "batch", route }));
  activeTabId = "batch:" + route;
  if (!openTabs.find((t) => t.id === activeTabId)) openTabs.push({ id: activeTabId, title, dept: route, mode: "batch" });
  renderTabs();
  setActiveSidebarMenu(menuId);
}

// Messages from batch.html: floor counts (Batch Plan: orders per floor; Batch Card: confirmed orders per floor)
// and the route after a floor-jump button.
window.addEventListener("message", (event) => {
  const frame = document.getElementById("batchModuleFrame");
  if (!frame || event.source !== frame.contentWindow || !event.data) return;
  if (event.data.type === "batch-route") { markBatchRoute(String(event.data.route || "")); return; }
  if (event.data.type !== "batch-counts") return;
  for (const [kind, counts] of [["plan", event.data.plan || {}], ["card", event.data.card || {}]]) {
    for (const [floor, count] of Object.entries(counts)) {
      const span = document.querySelector(`[data-batch-count="${kind}-${floor}"]`);
      if (span) span.textContent = count;
    }
  }
});

// Called at the end of applyPermissions() in core.js.
function applyBatchPermissions() {
  const toggle = (id, visible) => {
    const el = document.getElementById(id);
    if (el) (el.closest("li") || el).classList.toggle("hidden", !visible);
  };
  const role = localStorage.getItem("role");
  const p = batchPermissions();

  // Data Management > Setup group
  const setupItems = { "menu-batch-setup-dyeing": "dyeingMc", "menu-batch-setup-flat": "flatAllowance", "menu-batch-setup-unit": "unitSetup" };
  let anySetup = false;
  for (const [id, key] of Object.entries(setupItems)) { const on = batchHasMenu("dataManagement", key); toggle(id, on); anySetup = anySetup || on; }
  const dropdownLi = document.getElementById("menu-setup-dropdowns")?.closest("li");
  const dropdownVisible = dropdownLi ? !dropdownLi.classList.contains("hidden") : false;
  const setupGroup = document.getElementById("sidebarSetupGroup");
  if (setupGroup) setupGroup.classList.toggle("hidden", !(anySetup || dropdownVisible));
  if (anySetup) document.getElementById("sidebarDataManagement")?.classList.remove("hidden");

  // Order Management > Batch Plan / Batch Card, Report > Batch Report
  const groups = [
    ["sidebarBatchPlanGroup", "batchPlan", "plan", ["all", "efl", "ekl", "ext", "pluvia", "outside"], "orderMenu"],
    ["sidebarBatchCardGroup", "batchCard", "card", ["all", "efl", "ekl", "ext", "pluvia", "outside"], "orderMenu"],
  ];
  for (const [groupId, permGroup, prefix, keys, parentMenu] of groups) {
    let any = false;
    for (const key of keys) {
      const on = batchCanOpen(permGroup, key);
      any = any || on;
      if (key !== "all") toggle(`menu-batch-${prefix}-${key}`, on);
    }
    const header = document.getElementById(`menu-batch-${prefix}-all`);
    if (header) header.classList.toggle("batch-menu-disabled", !batchHasMenu(permGroup, "all"));
    document.getElementById(groupId)?.classList.toggle("hidden", !any);
    if (any) document.getElementById(parentMenu)?.parentElement.classList.remove("hidden");
  }
  let anyReport = false;
  for (const [id, key] of [["menu-batch-report-detail", "dyeableBatch"], ["menu-batch-report-summary", "dyeableSummary"], ["menu-batch-report-daily", "dailyConfirm"]]) {
    const on = batchHasMenu("batchReport", key); toggle(id, on); anyReport = anyReport || on;
  }
  document.getElementById("sidebarBatchReportGroup")?.classList.toggle("hidden", !anyReport);
  if (anyReport) document.getElementById("reportMenu")?.parentElement.classList.remove("hidden");

  // Source File Upload > BP Data tab
  const canUploadBP = batchHasAction("uploadBP") || (!p && role === "Admin");
  const bpTab = document.getElementById("tabBP");
  if (bpTab) bpTab.style.display = canUploadBP ? "" : "none";
  if (canUploadBP) {
    const area = document.getElementById("uploadArea"); if (area) area.style.display = "flex";
    // If BP Data is the only allowed upload, select its tab instead of a hidden one.
    const activeTab = document.querySelector(".upload-tab.active");
    if (activeTab && activeTab.style.display === "none" && typeof setUploadCategory === "function") setUploadCategory("BP");
  }
}

function showBatchTab(route) { showBatchModule(route, true); }

// Batch Plan / Batch Card header: open all orders, or just expand the floors when only floors are allowed.
function openBatchGroup(header, submenuId, route) {
  const [, , group, key] = BATCH_ROUTES[route];
  const submenu = document.getElementById(submenuId);
  if (submenu && submenu.classList.contains("hidden")) toggleSubmenu(header, submenuId);
  if (batchHasMenu(group, key)) showBatchModule(route);
}

// ---- Hooks into core.js without editing it (functions are global, so they can be wrapped) ----
(function () {
  const originalHide = hideAllCoreViews;
  hideAllCoreViews = function () {
    originalHide.apply(this, arguments);
    document.getElementById("batchModuleView")?.classList.add("hidden");
  };
  const originalApply = applyPermissions;
  applyPermissions = function () {
    originalApply.apply(this, arguments);
    applyBatchPermissions();
  };
  const originalDirty = markDataDirty;
  markDataDirty = function () {
    originalDirty.apply(this, arguments);
    batchDataStale = true;
  };
  // Dropdown Master Setup (js/setup.js) can change the unit list that Unit Setup offers: reload the
  // Batch Plan page the next time it is opened, but only when the unit list really changed
  // (not for a cancelled or failed action, and not for Process changes).
  const unitListText = () => {
    try { return JSON.stringify((typeof dropdownMasterCache !== "undefined" && dropdownMasterCache.units) || []); } catch (e) { return ""; }
  };
  for (const name of ["handleAddDropdownItem", "handleEditDropdownItem", "toggleDropdownItemStatus", "deleteDropdownItem"]) {
    const original = window[name];
    if (typeof original !== "function") continue;
    window[name] = async function () {
      const before = unitListText();
      try { return await original.apply(this, arguments); } finally { if (unitListText() !== before) batchDataStale = true; }
    };
  }
  const originalInit = initDashboard;
  initDashboard = function () {
    // Read the saved page first: the original falls back to the dashboard and overwrites it.
    let state = null;
    try { state = JSON.parse(localStorage.getItem("activePage") || "null"); } catch (e) { state = null; }
    originalInit.apply(this, arguments);
    if (state && state.page === "batch" && state.route && localStorage.getItem("token")) showBatchModule(state.route);
  };
})();
