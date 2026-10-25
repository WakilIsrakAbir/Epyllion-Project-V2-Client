// ==========================================================
// BATCH PLAN MODULE HOST (additive)
// Opens batch.html (Batch Plan, Batch Card, Batch Report and the three
// Setup pages from the Batch Plan demo) inside the main area.
// ==========================================================
const BATCH_API_BASE = "https://abir-backend-api.onrender.com";

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

/* Plan section 16.3: Batch Plan and Batch Card have one submenu per Dyeing Plan unit in use
   ([{key, label}], e.g. EFL, EKL, Ext, DTL). The list comes from GET /api/batch/units when the page
   opens and from batch.html each time it loads its data. A unit route is "plan/<KEY>" or "card/<KEY>";
   its permission key is the unit key in small letters (menus.batchPlan.dtl). */
let batchUnits = [];
const batchUnitCounts = { plan: {}, card: {} };

function batchRouteInfo(route) {
  if (BATCH_ROUTES[route]) return BATCH_ROUTES[route];
  const match = /^(plan|card)\/([A-Z0-9]{1,40})$/.exec(String(route || ""));
  if (!match) return null;
  const [, kind, key] = match;
  const unit = batchUnits.find((u) => u.key === key);
  return [(kind === "plan" ? "Batch Plan · " : "Batch Card · ") + batchEscape(unit ? unit.label : key),
    "menu-batch-" + kind + "-" + key.toLowerCase(), kind === "plan" ? "batchPlan" : "batchCard", key.toLowerCase()];
}

function batchPermissions() {
  try { return JSON.parse(localStorage.getItem("permissions")); } catch (e) { return null; }
}
function batchHasMenu(group, key) {
  if (localStorage.getItem("role") === "Admin") return true;
  const p = batchPermissions();
  return !!(p && p.menus && p.menus[group] && p.menus[group][key] === true);
}
// A unit page can be opened with that unit's permission or with the all-orders permission
// (the server's canUseFloor rule, lib/batch/source.js).
function batchCanOpen(group, key) {
  return batchHasMenu(group, key) || (key !== "all" && batchHasMenu(group, "all"));
}
// Any permission in a menu group (the unit keys are not a fixed list).
function batchHasAnyMenu(group) {
  if (localStorage.getItem("role") === "Admin") return true;
  const p = batchPermissions();
  return !!(p && p.menus && p.menus[group] && Object.values(p.menus[group]).some((v) => v === true));
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

// Set when a source file is uploaded or deleted; the Batch Plan page then reloads its data on next open.
let batchDataStale = false;

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

// A floor-jump button inside batch.html moved to another unit: show that route as the active tab
// and sidebar item, without touching the iframe (it already shows the order there).
function markBatchRoute(route) {
  const info = batchRouteInfo(route);
  if (!info) return;
  const [title, menuId, group, key] = info;
  if (!batchCanOpen(group, key)) return;
  localStorage.setItem("activePage", JSON.stringify({ page: "batch", route }));
  activeTabId = "batch:" + route;
  if (!openTabs.find((t) => t.id === activeTabId)) openTabs.push({ id: activeTabId, title, dept: route, mode: "batch" });
  renderTabs();
  setActiveSidebarMenu(menuId);
}

function batchEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Builds the unit submenus under Batch Plan and Batch Card from batchUnits, showing only units the
   user may open, and keeps the counts and the highlighted item. */
function renderBatchUnitMenus() {
  for (const [kind, group, listId] of [["plan", "batchPlan", "batchPlanSubmenu"], ["card", "batchCard", "batchCardSubmenu"]]) {
    const list = document.getElementById(listId);
    if (!list) continue;
    list.innerHTML = batchUnits.filter((unit) => batchCanOpen(group, unit.key.toLowerCase())).map((unit) => {
      const count = batchUnitCounts[kind][unit.key];
      return `<li><a href="#" id="menu-batch-${kind}-${unit.key.toLowerCase()}"
        class="sidebar-menu-item submenu-item block py-2 pl-14 pr-4 border-l-4 border-transparent text-black hover:text-black transition-colors flex justify-between"
        onclick="showBatchModule('${kind}/${unit.key}')">${batchEscape(unit.label)} <span class="text-[11px] text-gray-500" data-batch-count="${kind}-${unit.key}">${count === undefined ? "" : count}</span></a></li>`;
    }).join("");
  }
  // Keep the highlight on the open unit page after the list is rebuilt (only while that page is shown).
  const route = String(activeTabId || "").startsWith("batch:") ? String(activeTabId).slice(6) : "";
  const info = route && batchRouteInfo(route);
  const shown = !document.getElementById("batchModuleView")?.classList.contains("hidden");
  if (info && shown && /^(plan|card)\//.test(route)) setActiveSidebarMenu(info[1]);
}

function setBatchUnits(units) {
  if (!Array.isArray(units)) return;
  batchUnits = units.filter((u) => u && /^[A-Z0-9]{1,40}$/.test(String(u.key || "")))
    .map((u) => ({ key: String(u.key), label: String(u.label || u.key).replace(/[<>&"'`]/g, "").trim() || String(u.key) }));
  renderBatchUnitMenus();
  // Open unit tabs show the unit's name once the list is known.
  let renamed = false;
  for (const tab of openTabs) {
    if (tab.mode !== "batch" || !/^(plan|card)\//.test(tab.dept)) continue;
    const info = batchRouteInfo(tab.dept);
    if (info && tab.title !== info[0]) { tab.title = info[0]; renamed = true; }
  }
  if (renamed) renderTabs();
}

// GET /api/batch/units: the unit list for the sidebar before batch.html is opened.
// Resolves to true when the list was loaded.
let batchUnitsRequest = null;
function loadBatchUnits() {
  if (!localStorage.getItem("token") || !batchHasAccess()) return Promise.resolve(false);
  if (batchUnitsRequest) return batchUnitsRequest;
  batchUnitsRequest = fetch(BATCH_API_BASE + "/api/batch/units")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data || !Array.isArray(data.units)) return false;
      setBatchUnits(data.units);
      return true;
    })
    .catch((error) => { console.warn("Batch units not loaded:", error); return false; })
    .finally(() => { batchUnitsRequest = null; });
  return batchUnitsRequest;
}

// A saved unit page whose unit is no longer in the list: all orders for a user who may see them,
// else the first unit the user may open, else nothing (null).
function batchRestoreRoute(route) {
  const [kind, key] = route.split("/");
  if (batchUnits.some((u) => u.key === key)) return route;
  const group = kind === "plan" ? "batchPlan" : "batchCard";
  if (batchHasMenu(group, "all")) return kind;
  const unit = batchUnits.find((u) => batchCanOpen(group, u.key.toLowerCase()));
  return unit ? kind + "/" + unit.key : null;
}

// Messages from batch.html: the unit list with counts (Batch Plan: orders per unit; Batch Card: confirmed
// orders per unit) and the route after a floor-jump button.
window.addEventListener("message", (event) => {
  const frame = document.getElementById("batchModuleFrame");
  if (!frame || event.source !== frame.contentWindow || !event.data) return;
  if (event.data.type === "batch-route") { markBatchRoute(String(event.data.route || "")); return; }
  if (event.data.type !== "batch-counts") return;
  batchUnitCounts.plan = event.data.plan || {};
  batchUnitCounts.card = event.data.card || {};
  if (Array.isArray(event.data.units)) setBatchUnits(event.data.units);
  for (const [kind, counts] of [["plan", batchUnitCounts.plan], ["card", batchUnitCounts.card]]) {
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

  // Order Management > Batch Plan / Batch Card (unit submenus are built by renderBatchUnitMenus)
  for (const [groupId, permGroup, prefix, parentMenu] of [["sidebarBatchPlanGroup", "batchPlan", "plan", "orderMenu"], ["sidebarBatchCardGroup", "batchCard", "card", "orderMenu"]]) {
    const any = batchHasAnyMenu(permGroup);
    const header = document.getElementById(`menu-batch-${prefix}-all`);
    if (header) header.classList.toggle("batch-menu-disabled", !batchHasMenu(permGroup, "all"));
    document.getElementById(groupId)?.classList.toggle("hidden", !any);
    if (any) document.getElementById(parentMenu)?.parentElement.classList.remove("hidden");
  }
  renderBatchUnitMenus();

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

// Batch Plan / Batch Card header: open all orders, or just expand the units when only units are allowed.
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
    loadBatchUnits(); // new data can bring new units
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
      try { return await original.apply(this, arguments); } finally { if (unitListText() !== before) { batchDataStale = true; loadBatchUnits(); } }
    };
  }
  const originalInit = initDashboard;
  initDashboard = function () {
    // Read the saved page first: the original falls back to the dashboard and overwrites it.
    let state = null;
    try { state = JSON.parse(localStorage.getItem("activePage") || "null"); } catch (e) { state = null; }
    originalInit.apply(this, arguments);
    const unitsLoaded = loadBatchUnits();
    if (!(state && state.page === "batch" && state.route && localStorage.getItem("token"))) return;
    const route = String(state.route);
    if (!/^(plan|card)\//.test(route)) { showBatchModule(route); return; }
    // A unit page waits for the unit list, so a unit that is no longer in use is not opened again.
    // If the user opened another page meanwhile, that page stays.
    const tabAtStart = activeTabId;
    unitsLoaded.then((loaded) => {
      if (activeTabId !== tabAtStart) return;
      const target = loaded ? batchRestoreRoute(route) : route;
      if (target) showBatchModule(target);
    });
  };
})();
