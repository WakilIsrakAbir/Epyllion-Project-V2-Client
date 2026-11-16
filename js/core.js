// ==========================================================
// CORE: Init, Permissions, Navigation
// ==========================================================

// Global fetch interceptor to append authorization headers, buyer filters, and catch 401/403
const originalFetch = window.fetch;
window.fetch = async function (resource, init = {}) {
  let urlStr =
    typeof resource === "string"
      ? resource
      : resource instanceof Request
        ? resource.url
        : String(resource);

  // If requesting our backend API
  const isBackendCall =
    urlStr.includes("abir-backend-api.onrender.com") ||
    urlStr.includes("localhost:5000") ||
    urlStr.startsWith("/api/");

  if (isBackendCall) {
    const token = localStorage.getItem("token");

    // Copy or initialize headers
    let headers;
    if (init.headers instanceof Headers) {
      headers = init.headers;
    } else if (Array.isArray(init.headers)) {
      headers = new Headers(init.headers);
    } else if (init.headers && typeof init.headers === "object") {
      headers = new Headers(init.headers);
    } else {
      headers = new Headers();
    }

    // Attach Bearer token if present and not already set
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    // If body is a JSON string or plain object (and NOT FormData), ensure Content-Type is application/json
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    init.headers = headers;
  }

  // Buyer query parameter handling for orders API
  if (
    urlStr.includes("/api/orders") &&
    !urlStr.includes("/api/orders/buyers")
  ) {
    let perms = null;
    try {
      perms = JSON.parse(localStorage.getItem("permissions"));
    } catch (e) {}

    if (perms && perms.buyers && perms.buyers.accessType !== "all") {
      const allowedIds = (perms.buyers.buyerIds || []).join(",");
      const urlObj = new URL(urlStr, window.location.origin);

      if (allowedIds) {
        urlObj.searchParams.set("allowedBuyers", allowedIds);
      } else {
        urlObj.searchParams.set("allowedBuyers", "NONE_ASSIGNED");
      }
      urlStr = urlObj.toString();

      if (resource instanceof Request) {
        resource = new Request(urlStr, init);
      } else {
        resource = urlStr;
      }
    }
  }

  try {
    const response = await originalFetch.call(this, resource, init);

    // Global 401 / 403 handling for backend calls
    if (isBackendCall && (response.status === 401 || response.status === 403)) {
      if (!urlStr.includes("/api/auth/login") && !window.location.pathname.endsWith("login.html")) {
        console.warn("Unauthorized API call (401/403). Redirecting to login...");
        if (typeof showToast === "function") {
          showToast("Session expired or unauthorized. Please log in again.", true);
        }
        localStorage.removeItem("token");
        localStorage.removeItem("sessionExpiresAt");
        setTimeout(() => {
          window.location.href = "login.html";
        }, 800);
      }
    }

    return response;
  } catch (fetchErr) {
    throw fetchErr;
  }
};
function initDashboard() {
  if (!isMidnightSessionValid()) {
    logout(true);
    return;
  }
  document.getElementById("displayUsername").innerText =
    `${localStorage.getItem("username")} (${localStorage.getItem("role")})`;
  applyPermissions();
  loadUploadedFiles();
  startHeartbeat();
  startMidnightWatcher();

  const savedState = localStorage.getItem("activePage");
  if (savedState) {
    const state = JSON.parse(savedState);
    if (state.page === "dashboard") {
      showDashboardHome();
    } else if (state.page === "dataManagement") {
      showDataManagementView();
    } else if (state.page === "menu") {
      loadMenuData(state.dept, state.title, state.mode);
    } else if (state.page === "orderStatus") {
      showOrderStatus();
    } else if (state.page === "productInfo") {
      showProductInfo();
    } else if (state.page === "planningProdInfo") {
      showPlanningProdInfo();
    } else if (state.page === "actualTracking" && state.dept) {
      loadActualTracking(state.dept);
    } else if (state.page === "planFilter" && state.dept) {
      showPlanFilter(state.dept);
    } else if (state.page === "setup") {
      showSetupView();
    } else {
      showDashboardHome();
    }
  } else {
    showDashboardHome();
  }
}

function setActiveSidebarMenu(activeId) {
  const isDark = document.documentElement.classList.contains("dark");
  const textClass = isDark ? "dm-text-light" : "text-black";
  const removeTextClass = isDark ? "text-black" : "dm-text-light";

  document.querySelectorAll(".sidebar-menu-item").forEach((el) => {
    el.classList.remove(
      "bg-sidebarActive",
      "text-black",
      "dm-text-light",
      "border-[#4CAF50]",
    );
    el.classList.add("border-transparent");

    if (el.classList.contains("submenu-item")) {
      el.classList.add(textClass);
    }
  });

  const activeEl = document.getElementById(activeId);
  if (activeEl) {
    activeEl.classList.remove("border-transparent");
    activeEl.classList.add("bg-sidebarActive", textClass, "border-[#4CAF50]");

    let parentMenu = activeEl.closest("ul");
    while (parentMenu && parentMenu.id !== "sidebar") {
      if (parentMenu.classList.contains("hidden")) {
        parentMenu.classList.remove("hidden");
        const prevEl = parentMenu.previousElementSibling;
        const chevron = prevEl ? prevEl.querySelector(".fa-chevron-left") : null;
        if (chevron) chevron.classList.add("-rotate-90");
      }
      parentMenu = parentMenu.parentElement ? parentMenu.parentElement.closest("ul") : null;
    }
  }
}

function applyPermissions() {
  const role = localStorage.getItem("role");
  const permsStr = localStorage.getItem("permissions");
  let permissions = null;

  if (permsStr) {
    try {
      permissions = JSON.parse(permsStr);
    } catch (e) {}
  }

  const uploadArea = document.getElementById("uploadArea");
  const sidebarManageUsers = document.getElementById("sidebarManageUsers");
  const sidebarDataManagement = document.getElementById(
    "sidebarDataManagement",
  );

  if (permissions && permissions.menus) {
    const m = permissions.menus;

    // Toggle Main Menus
    if (m.manageUsers && m.manageUsers.view)
      sidebarManageUsers?.classList.remove("hidden");
    else sidebarManageUsers?.classList.add("hidden");

    // Toggle Data Management Main Menu & Submenus
    if (m.dataManagement || role === "Admin") {
      const hasDmAccess = role === "Admin" || !!(m.dataManagement?.view || m.dataManagement?.setup);
      if (hasDmAccess) {
        sidebarDataManagement?.classList.remove("hidden");
      } else {
        sidebarDataManagement?.classList.add("hidden");
      }

      const sourceUploadEl = document.getElementById("menu-data-mgmt");
      if (sourceUploadEl) {
        (role === "Admin" || m.dataManagement?.view)
          ? sourceUploadEl.parentElement.classList.remove("hidden")
          : sourceUploadEl.parentElement.classList.add("hidden");
      }

      const setupEl = document.getElementById("menu-setup-dropdowns");
      if (setupEl) {
        (role === "Admin" || m.dataManagement?.setup)
          ? setupEl.parentElement.classList.remove("hidden")
          : setupEl.parentElement.classList.add("hidden");
      }
    } else {
      sidebarDataManagement?.classList.add("hidden");
    }

    const hasAny = (obj) => obj && Object.values(obj).some((v) => v);

    // Toggle Order Management Submenus
    if (m.orderManagement) {
      const orderMenuEl = document.getElementById("orderMenu");
      if (orderMenuEl)
        hasAny(m.orderManagement)
          ? orderMenuEl.parentElement.classList.remove("hidden")
          : orderMenuEl.parentElement.classList.add("hidden");
      ["yd", "knitting", "dyeing", "finishing", "delivery"].forEach((k) => {
        const el = document.getElementById(`menu-${k}-manage`);
        if (el)
          m.orderManagement[k]
            ? el.parentElement.classList.remove("hidden")
            : el.parentElement.classList.add("hidden");
      });
    }

    // Toggle Reports Submenus
    if (m.reports) {
      const reportMenuEl = document.getElementById("reportMenu");
      if (reportMenuEl)
        hasAny(m.reports)
          ? reportMenuEl.parentElement.classList.remove("hidden")
          : reportMenuEl.parentElement.classList.add("hidden");
      ["yd", "knitting", "dyeing", "finishing", "delivery"].forEach((k) => {
        const el = document.getElementById(`menu-${k}-report`);
        if (el)
          m.reports[k]
            ? el.parentElement.classList.remove("hidden")
            : el.parentElement.classList.add("hidden");
      });
      const os = document.getElementById("menu-order-status");
      if (os)
        m.reports.orderStatus
          ? os.parentElement.classList.remove("hidden")
          : os.parentElement.classList.add("hidden");
      const pi = document.getElementById("menu-prod-info");
      if (pi)
        m.reports.productInfo
          ? pi.parentElement.classList.remove("hidden")
          : pi.parentElement.classList.add("hidden");
      const ppi = document.getElementById("menu-planning-prod-info");
      if (ppi)
        (role === "Admin" || m.reports.planningProdInfo)
          ? ppi.parentElement.classList.remove("hidden")
          : ppi.parentElement.classList.add("hidden");
    }

    // Toggle Plan Filter Submenus
    if (m.planFilter) {
      const planFilterMenuEl = document.getElementById("planFilterSubmenu");
      if (planFilterMenuEl)
        hasAny(m.planFilter)
          ? planFilterMenuEl.parentElement.classList.remove("hidden")
          : planFilterMenuEl.parentElement.classList.add("hidden");
      ["yd", "knitting", "dyeing", "delivery", "deliveryfloor"].forEach((k) => {
        const el = document.getElementById(`menu-${k}-planfilter`);
        if (el)
          m.planFilter[k]
            ? el.parentElement.classList.remove("hidden")
            : el.parentElement.classList.add("hidden");
      });
    }

    // Toggle Actual Tracking
    if (m.actualTracking) {
      const actualMenuEl = document.getElementById("actualMenu");
      if (actualMenuEl)
        hasAny(m.actualTracking)
          ? actualMenuEl.parentElement.classList.remove("hidden")
          : actualMenuEl.parentElement.classList.add("hidden");
      [
        "yd",
        "knitting",
        "dyeing",
        "finishing",
        "delivery",
        "deliveryfloor",
      ].forEach((k) => {
        const el = document.getElementById(`menu-${k}-actual`);
        if (el)
          m.actualTracking[k]
            ? el.parentElement.classList.remove("hidden")
            : el.parentElement.classList.add("hidden");
      });
    }

    // Toggle Tracking Reports
    if (m.trackingReports) {
      const trackingReportMenuEl = document.getElementById(
        "submenu-actual-report",
      );
      if (trackingReportMenuEl)
        hasAny(m.trackingReports)
          ? trackingReportMenuEl.parentElement.classList.remove("hidden")
          : trackingReportMenuEl.parentElement.classList.add("hidden");
      [
        "yd",
        "knitting",
        "dyeing",
        "finishing",
        "delivery",
        "deliveryfloor",
      ].forEach((k) => {
        const el = document.getElementById(`menu-${k}-actual-report`);
        if (el)
          m.trackingReports[k]
            ? el.parentElement.classList.remove("hidden")
            : el.parentElement.classList.add("hidden");
      });
    }

    // Toggle Plan Vs Actual Tracking Filter
    if (m.planTrackingFilter) {
      const actualFilterMenuEl = document.getElementById(
        "submenu-actual-filter",
      );
      if (actualFilterMenuEl)
        hasAny(m.planTrackingFilter)
          ? actualFilterMenuEl.parentElement.classList.remove("hidden")
          : actualFilterMenuEl.parentElement.classList.add("hidden");
      [
        "yd",
        "knitting",
        "dyeing",
        "delivery",
        "deliveryfloor",
      ].forEach((k) => {
        const el = document.getElementById(`menu-${k}-actualfilter`);
        if (el)
          m.planTrackingFilter[k]
            ? el.parentElement.classList.remove("hidden")
            : el.parentElement.classList.add("hidden");
      });
    }

    // Toggle Load Calculation
    if (m.loadCalculation) {
      const loadCalcMenuEl = document.getElementById("submenu-load-calc");
      if (loadCalcMenuEl)
        hasAny(m.loadCalculation)
          ? loadCalcMenuEl.parentElement.classList.remove("hidden")
          : loadCalcMenuEl.parentElement.classList.add("hidden");
      const lDetailed = document.getElementById("menu-load-detailed");
      if (lDetailed)
        m.loadCalculation.detailed
          ? lDetailed.parentElement.classList.remove("hidden")
          : lDetailed.parentElement.classList.add("hidden");
      const lSummary = document.getElementById("menu-load-summary");
      if (lSummary)
        m.loadCalculation.summary
          ? lSummary.parentElement.classList.remove("hidden")
          : lSummary.parentElement.classList.add("hidden");
    }

    // Enforce Granular Upload & Data Management Permissions
    let canUpload = false;
    if (permissions.actions) {
      const a = permissions.actions;

      const toggleElement = (id, hasPerm) => {
        const el = document.getElementById(id);
        if (el) el.style.display = hasPerm ? "" : "none";
      };

      // Hide/show individual category tabs
      const tabs = [
        { id: "tabGeneral", perm: a.uploadGeneral, name: "General" },
        { id: "tabYD", perm: a.uploadYD, name: "YD" },
        { id: "tabKnitting", perm: a.uploadKnitting, name: "Knitting" },
        { id: "tabDyeing", perm: a.uploadDyeing, name: "Dyeing" },
        { id: "tabFinishing", perm: a.uploadFinishing, name: "Finishing" },
        { id: "tabDelivery", perm: a.uploadDelivery, name: "Delivery" },
      ];

      let firstVisibleTab = null;
      tabs.forEach((t) => {
        toggleElement(t.id, t.perm);
        if (t.perm && !firstVisibleTab) firstVisibleTab = t.name;
      });

      if (firstVisibleTab && typeof setUploadCategory === "function") {
        setUploadCategory(firstVisibleTab);
      }

      if (
        a.uploadGeneral ||
        a.uploadYD ||
        a.uploadKnitting ||
        a.uploadDyeing ||
        a.uploadFinishing ||
        a.uploadDelivery
      ) {
        canUpload = true;
      }
    }
    if (uploadArea) uploadArea.style.display = canUpload ? "flex" : "none";

    // Handle Download & Export permissions
    if (permissions.downloads) {
      const d = permissions.downloads;

      const toggleBtn = (id, hasPerm) => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = hasPerm ? "" : "none";
      };

      toggleBtn("btnOSDetailedExcel", d.osDetailedExcel);
      toggleBtn("btnOSDetailedPDF", d.osDetailedPdf);

      toggleBtn("btnLoadDetailedYd", d.loadDetailedYd !== undefined ? d.loadDetailedYd : d.loadDetailedKnitting);
      toggleBtn("btnLoadDetailedKnitting", d.loadDetailedKnitting);
      toggleBtn("btnLoadDetailedDyeing", d.loadDetailedDyeing);
      toggleBtn("btnLoadDetailedDelivery", d.loadDetailedDelivery);
      toggleBtn("btnLoadDetailedDeliveryfloor", d.loadDetailedDeliveryfloor !== undefined ? d.loadDetailedDeliveryfloor : d.loadDetailedKnitting);
      toggleBtn("btnLoadSummaryYd", d.loadSummaryYd !== undefined ? d.loadSummaryYd : d.loadSummaryKnitting);
      toggleBtn("btnLoadSummaryKnitting", d.loadSummaryKnitting);
      toggleBtn("btnLoadSummaryDyeing", d.loadSummaryDyeing);
      toggleBtn("btnLoadSummaryDelivery", d.loadSummaryDelivery);
      toggleBtn("btnLoadSummaryDeliveryfloor", d.loadSummaryDeliveryfloor !== undefined ? d.loadSummaryDeliveryfloor : d.loadSummaryKnitting);
    }
  } else {
    // Fallback to legacy role checks
    if (role === "Admin") {
      if (sidebarManageUsers) sidebarManageUsers.classList.remove("hidden");
    } else {
      if (sidebarManageUsers) sidebarManageUsers.classList.add("hidden");
    }
    if (role === "Viewer" || role === "Approver") {
      if (sidebarDataManagement) sidebarDataManagement.classList.add("hidden");
    } else {
      if (sidebarDataManagement)
        sidebarDataManagement.classList.remove("hidden");
    }
    if (role === "Admin") {
      const setupEl = document.getElementById("menu-setup-dropdowns");
      if (setupEl) setupEl.parentElement.classList.remove("hidden");
    } else {
      const setupEl = document.getElementById("menu-setup-dropdowns");
      if (setupEl) setupEl.parentElement.classList.add("hidden");
    }
  }
}

function getNextMidnightTimestamp() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return midnight.getTime();
}

function isMidnightSessionValid() {
  const token = localStorage.getItem("token");
  if (!token) return false;

  const sessionExpiresAt = Number(localStorage.getItem("sessionExpiresAt") || 0);
  if (!sessionExpiresAt) {
    localStorage.setItem("sessionExpiresAt", String(getNextMidnightTimestamp()));
    return true;
  }

  if (Date.now() >= sessionExpiresAt) {
    return false;
  }

  return true;
}

let midnightWatcherTimer = null;
let midnightWatcherInterval = null;

function startMidnightWatcher() {
  const checkAndEnforceMidnight = () => {
    if (!isMidnightSessionValid()) {
      logout(true);
    }
  };

  checkAndEnforceMidnight();

  const sessionExpiresAt = Number(localStorage.getItem("sessionExpiresAt") || getNextMidnightTimestamp());
  const msUntilMidnight = Math.max(sessionExpiresAt - Date.now(), 1000);

  if (midnightWatcherTimer) clearTimeout(midnightWatcherTimer);
  midnightWatcherTimer = setTimeout(() => {
    logout(true);
  }, msUntilMidnight);

  if (midnightWatcherInterval) clearInterval(midnightWatcherInterval);
  midnightWatcherInterval = setInterval(checkAndEnforceMidnight, 10000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkAndEnforceMidnight();
    }
  });

  window.addEventListener("focus", () => {
    checkAndEnforceMidnight();
  });
}

function startHeartbeat() {
  const token = localStorage.getItem("token");
  if (!token) return;

  const sendHeartbeat = () => {
    fetch("https://abir-backend-api.onrender.com/api/auth/heartbeat", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          logout(true);
        }
      })
      .catch((err) => console.log("Heartbeat failed", err));
  };

  // Send immediately, then every 60 seconds
  sendHeartbeat();
  setInterval(sendHeartbeat, 60000);
}

function logout(expired = false) {
  localStorage.clear();
  window.location.href = expired ? "login.html?expired=midnight" : "login.html";
}
function showToast(msg) {
  const t = document.getElementById("toast");
  document.getElementById("toastMessage").textContent = msg;
  t.classList.remove("opacity-0", "pointer-events-none");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(
    () => t.classList.add("opacity-0", "pointer-events-none"),
    3000,
  );
}

function hideAllCoreViews() {
  const views = [
    "dashboardHomeView",
    "dataManagementView",
    "setupView",
    "listView",
    "detailedView",
    "planVsActualReportView",
    "planVsActualView",
    "orderStatusSection",
    "productInfoSection",
    "planningProdInfoSection",
    "loadCalculationView",
    "planFilterView",
    "planVsActualTrackingFilterView",
  ];
  views.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
}

function showDashboardHome() {
  localStorage.setItem("activePage", JSON.stringify({ page: "dashboard" }));

  activeTabId = "dashboard";
  hideAllCoreViews();
  document.getElementById("dashboardHomeView").classList.remove("hidden");
  renderTabs();
  closeSidebarMobile();
  setActiveSidebarMenu("menu-dashboard");
}

function showDataManagementView() {
  const role = localStorage.getItem("role");
  const permsStr = localStorage.getItem("permissions");
  let hasPerm = role === "Admin";
  if (!hasPerm && permsStr) {
    try {
      const p = JSON.parse(permsStr);
      if (p?.menus?.dataManagement?.view) hasPerm = true;
    } catch (e) {}
  } else if (!hasPerm && !permsStr && role === "Planner") {
    hasPerm = true;
  }

  if (!hasPerm) {
    if (typeof showToast === "function") {
      showToast("Access Denied: Data Management permission required.", true);
    }
    showDashboardHome();
    return;
  }

  localStorage.setItem(
    "activePage",
    JSON.stringify({ page: "dataManagement" }),
  );

  activeTabId = "dataManagement";
  hideAllCoreViews();
  document.getElementById("dataManagementView").classList.remove("hidden");
  renderTabs();
  closeSidebarMobile();
  setActiveSidebarMenu("menu-data-mgmt");
}

function showSetupView() {
  const role = localStorage.getItem("role");
  const permsStr = localStorage.getItem("permissions");
  let hasPerm = role === "Admin";
  if (!hasPerm && permsStr) {
    try {
      const p = JSON.parse(permsStr);
      if (p?.menus?.dataManagement?.setup) hasPerm = true;
    } catch (e) {}
  }

  if (!hasPerm) {
    if (typeof showToast === "function") {
      showToast("Access Denied: Setup permission required.", true);
    }
    showDashboardHome();
    return;
  }

  localStorage.setItem(
    "activePage",
    JSON.stringify({ page: "setup" }),
  );

  activeTabId = "setup";
  hideAllCoreViews();
  const setupEl = document.getElementById("setupView");
  if (setupEl) setupEl.classList.remove("hidden");
  if (typeof renderSetupTables === "function") {
    renderSetupTables();
  }
  renderTabs();
  closeSidebarMobile();
  setActiveSidebarMenu("menu-setup-dropdowns");
}

async function loadMenuData(deptKey, menuName, mode = "manage") {
  localStorage.setItem(
    "activePage",
    JSON.stringify({
      page: "menu",
      dept: deptKey,
      title: menuName,
      mode: mode,
    }),
  );

  const uniqueId = mode === "report" ? `${deptKey}_report` : deptKey;
  activeTabId = uniqueId;
  isReportMode = mode === "report";

  hideAllCoreViews();
  document.getElementById("listView").classList.remove("hidden");

  if (isReportMode) {
    document.getElementById("normalListContainer").classList.add("hidden");
    document.getElementById("reportActionContainer").classList.remove("hidden");
    document.getElementById("reportActionContainer").style.display = "flex";
    document.getElementById("reportPageHeader").innerText =
      `${deptKey.charAt(0).toUpperCase() + deptKey.slice(1)} Department Reports`;

    const permsStr = localStorage.getItem("permissions");
    if (permsStr) {
      try {
        const permissions = JSON.parse(permsStr);
        if (permissions && permissions.downloads) {
          const d = permissions.downloads;
          const btn = document.getElementById("btnReportUpdatedExcel");
          if (btn) {
            const deptMap = {
              yd: "YD",
              knitting: "Knitting",
              dyeing: "Dyeing",
              finishing: "Finishing",
              delivery: "Delivery",
            };
            const key = "reportUpdatedExcel" + deptMap[deptKey];
            btn.style.display = d[key] ? "" : "none";
          }
        }
      } catch (e) {}
    }
  } else {
    document.getElementById("normalListContainer").classList.remove("hidden");
    document.getElementById("reportActionContainer").classList.add("hidden");
    document.getElementById("reportActionContainer").style.display = "none";
    activateMainTab("Pending");
  }

  if (!openTabs.find((tab) => tab.id === uniqueId))
    openTabs.push({ id: uniqueId, title: menuName, dept: deptKey, mode: mode });
  renderTabs();

  document
    .querySelectorAll(".header-search")
    .forEach((inp) => (inp.value = ""));
  colFilters = {};
  activeBuyer = "";

  if (!isReportMode) renderDynamicHeaders();
  setActiveSidebarMenu("menu-" + deptKey + "-" + mode);

  await fetchAndProcessData();
  closeSidebarMobile();
}

function setUploadCategory(cat) {
  activeUploadCategory = cat;
  document
    .querySelectorAll(".upload-tab")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById("tab" + cat).classList.add("active");
  document.getElementById("currentUploadLabel").innerText = cat + " Data";
  document.getElementById("directoryLabel").innerText = cat;
  loadUploadedFiles();
}
