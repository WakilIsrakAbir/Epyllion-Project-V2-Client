// ==========================================================
// BATCH PLAN MODULE HOST (additive)
// Opens batch.html (Batch Plan, Batch Card, Batch Report and the three
// Setup pages from the Batch Plan demo) inside the main area.
// ==========================================================

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

/* Plan section 18: the Dyeing Plan units (EFL, EKL, Ext, DTL, ...) are tabs in the heading of batch.html.
   A unit route is "plan/<KEY>" or "card/<KEY>"; its permission key is the unit key in small letters
   (menus.batchPlan.dtl). The project side keeps one "Batch Plan" tab and one "Batch Card" tab whose route
   follows the open unit, so a reload or a click on the tab returns to that unit. batch.html itself
   replaces a unit that is no longer in use (BatchApi.route) and reports the route back (markBatchRoute). */
function batchRouteInfo(route) {
  if (BATCH_ROUTES[route]) return BATCH_ROUTES[route];
  const match = /^(plan|card)\/([A-Z0-9]{1,40})$/.exec(String(route || ""));
  if (!match) return null;
  const [, kind, key] = match;
  return [kind === "plan" ? "Batch Plan" : "Batch Card", "menu-batch-" + kind + "-all", kind === "plan" ? "batchPlan" : "batchCard", key.toLowerCase()];
}
// The unit pages of Batch Plan share one top tab ("batch:plan"); Batch Card the same ("batch:card").
function batchTabId(route) {
  const match = /^(plan|card)(\/|$)/.exec(String(route || ""));
  return "batch:" + (match ? match[1] : route);
}

function batchPermissions() {
  try { return JSON.parse(localStorage.getItem("permissions")); } catch (e) { return null; }
}
function batchHasMenu(group, key) {
  if (localStorage.getItem("role") === "Admin") return true;
  const p = batchPermissions();
  return !!(p && p.menus && p.menus[group] && p.menus[group][key] === true);
}
// Any permission in a menu group (the unit keys are not a fixed list).
function batchHasAnyMenu(group) {
  if (localStorage.getItem("role") === "Admin") return true;
  const p = batchPermissions();
  return !!(p && p.menus && p.menus[group] && Object.values(p.menus[group]).some((v) => v === true));
}
/* A unit page can be opened with that unit's permission or with the all-orders permission (the server's
   canUseFloor rule, lib/batch/source.js). The plain "plan"/"card" route (key "all") opens with any
   permission of the group: batch.html then shows all orders or the first unit the user may open. */
function batchCanOpen(group, key) {
  if (key === "all") return batchHasAnyMenu(group);
  return batchHasMenu(group, key) || batchHasMenu(group, "all");
}
function batchHasAction(key) {
  if (localStorage.getItem("role") === "Admin") return true;
  const p = batchPermissions();
  return !!(p && p.actions && p.actions[key] === true);
}
function batchHasAccess() {
  return batchHasAnyMenu("batchPlan") || batchHasAnyMenu("batchCard") || batchHasAnyMenu("batchReport") ||
    ["dyeingMc", "flatAllowance", "unitSetup"].some((key) => batchHasMenu("dataManagement", key));
}

/* The unit opened last on Batch Plan and on Batch Card (plan section 18.3, question 2), kept in this
   browser so the sidebar item returns to it. */
const BATCH_LAST_ROUTE_KEY = "batchLastRoute";
function batchLastRoutes() {
  try { const v = JSON.parse(localStorage.getItem(BATCH_LAST_ROUTE_KEY) || "null"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; }
}
function rememberBatchRoute(route) {
  const match = /^(plan|card)(?:\/[A-Z0-9]{1,40})?$/.exec(String(route || ""));
  if (!match) return;
  const last = batchLastRoutes();
  last[match[1]] = route;
  try { localStorage.setItem(BATCH_LAST_ROUTE_KEY, JSON.stringify(last)); } catch (e) { /* ignore */ }
}
// Sidebar click: the route opened last for that kind when the user may still open it, else the plain route.
function batchMenuRoute(kind) {
  const last = batchLastRoutes()[kind];
  const info = last && batchRouteInfo(last);
  return info && String(last).startsWith(kind + "/") && batchCanOpen(info[2], info[3]) ? last : kind;
}

// Set when a source file is uploaded or deleted; the Batch Plan page then reloads its data on next open.
let batchDataStale = false;

// The top tab of this route shows it: one tab per kind, its route is the one opened last.
function setBatchTab(route, title) {
  activeTabId = batchTabId(route);
  const tab = openTabs.find((t) => t.id === activeTabId);
  if (tab) { tab.dept = route; tab.title = title; }
  else openTabs.push({ id: activeTabId, title, dept: route, mode: "batch" });
  renderTabs();
}

// fromTab: the user clicked an open top tab, so an open report on that same page is kept.
function showBatchModule(route, fromTab) {
  if (!batchRouteInfo(route)) route = "plan";
  const [title, menuId, group, key] = batchRouteInfo(route);
  if (!batchCanOpen(group, key)) {
    if (typeof showToast === "function") showToast("Access Denied: " + title + " permission required.", true);
    showDashboardHome();
    return;
  }
  localStorage.setItem("activePage", JSON.stringify({ page: "batch", route }));
  rememberBatchRoute(route);
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
  setBatchTab(route, title);
  setActiveSidebarMenu(menuId);
  closeSidebarMobile();
}

// batch.html moved to another unit (a unit tab in its heading, a floor-jump button, a search result, or
// a unit that is no longer in use): show that route as the open tab and page, without touching the iframe.
function markBatchRoute(route) {
  const info = batchRouteInfo(route);
  if (!info) return;
  const [title, menuId, group, key] = info;
  if (!batchCanOpen(group, key)) return;
  localStorage.setItem("activePage", JSON.stringify({ page: "batch", route }));
  rememberBatchRoute(route);
  setBatchTab(route, title);
  setActiveSidebarMenu(menuId);
}

// Messages from batch.html: the route after a unit change inside the page.
window.addEventListener("message", (event) => {
  const frame = document.getElementById("batchModuleFrame");
  if (!frame || event.source !== frame.contentWindow || !event.data) return;
  if (event.data.type === "batch-route") markBatchRoute(String(event.data.route || ""));
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

  // Order Management > Batch Plan / Batch Card: shown with any permission of the group (the unit tabs
  // inside the page follow the same permissions).
  for (const [groupId, permGroup, parentMenu] of [["sidebarBatchPlanGroup", "batchPlan", "orderMenu"], ["sidebarBatchCardGroup", "batchCard", "orderMenu"]]) {
    const any = batchHasAnyMenu(permGroup);
    document.getElementById(groupId)?.classList.toggle("hidden", !any);
    if (any) document.getElementById(parentMenu)?.parentElement.classList.remove("hidden");
  }

  // Report > Batch Report
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
    batchDataStale = true; // new data can bring new units and orders
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
    // A saved unit page is opened as saved; batch.html replaces a unit that is no longer in use.
    if (state && state.page === "batch" && state.route && localStorage.getItem("token")) showBatchModule(String(state.route));
  };
})();
