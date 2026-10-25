// Ensure global authorization interceptor for manage-users
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(resource, init = {}) {
    let urlStr = typeof resource === "string" ? resource : resource instanceof Request ? resource.url : String(resource);
    const isBackendCall = urlStr.includes("abir-backend-api.onrender.com") || urlStr.includes("localhost:5000") || urlStr.startsWith("/api/");
    if (isBackendCall) {
      const token = localStorage.getItem("token");
      let headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      init.headers = headers;
    }

    try {
      const response = await originalFetch.call(this, resource, init);
      if (isBackendCall && (response.status === 401 || response.status === 403)) {
        if (!urlStr.includes("/api/auth/login") && !window.location.pathname.endsWith("login.html")) {
          if (typeof showToast === "function") {
            showToast("Session expired or unauthorized. Redirecting to login...", true);
          }
          localStorage.removeItem("token");
          localStorage.removeItem("sessionExpiresAt");
          setTimeout(() => { window.location.href = "login.html"; }, 800);
        }
      }
      return response;
    } catch (err) {
      throw err;
    }
  };
})();

let BUYERS = [];
let buyersLoaded = false;

async function updateDynamicBuyers() {
  BUYERS = [];
  try {
    const res = await fetch(
      `https://abir-backend-api.onrender.com/api/orders/buyers?t=${Date.now()}`,
    );
    if (res.ok) {
      const buyerNames = await res.json();
      buyerNames.forEach((buyer) => {
        const id = buyer.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (id) {
          BUYERS.push({ id, name: buyer });
        }
      });
    }
  } catch (e) {
    console.error("Error fetching buyers from backend", e);
  }

  // Ensure unique by ID
  const uniqueBuyers = [];
  const existingIds = new Set();
  BUYERS.forEach((b) => {
    if (!existingIds.has(b.id)) {
      uniqueBuyers.push(b);
      existingIds.add(b.id);
    }
  });
  BUYERS = uniqueBuyers;

  BUYERS.sort((a, b) => a.name.localeCompare(b.name));
  buyersLoaded = true;
}

const MENU_GROUPS = [
  {
    key: "dataManagement",
    title: "Data Management",
    icon: "fa-database",
    items: [
      ["view", "Source File Upload"],
      ["setup", "Dropdown Master Setup"],
      ["dyeingMc", "Dyeing MC"],
      ["flatAllowance", "Flat Allowance"],
      ["unitSetup", "Unit Setup"],
    ],
  },
  {
    key: "orderManagement",
    title: "Order Management",
    icon: "fa-boxes-stacked",
    items: [
      ["yd", "YD Plan"],
      ["knitting", "Knitting Plan"],
      ["dyeing", "Dyeing Plan"],
      ["finishing", "Finishing Plan"],
      ["delivery", "Delivery Plan"],
    ],
  },
  {
    // Unit items are replaced by loadBatchUnitPermissionItems() with the Dyeing Plan units (plan section 16.3).
    key: "batchPlan",
    title: "Batch Plan",
    icon: "fa-layer-group",
    items: [
      ["all", "All Orders"],
      ["efl", "EFL"],
      ["ekl", "EKL"],
      ["ext", "Ext"],
      ["pluvia", "Pluvia"],
      ["outside", "Outside"],
    ],
  },
  {
    key: "batchCard",
    title: "Batch Card",
    icon: "fa-id-card",
    items: [
      ["all", "All Orders"],
      ["efl", "EFL"],
      ["ekl", "EKL"],
      ["ext", "Ext"],
      ["pluvia", "Pluvia"],
      ["outside", "Outside"],
    ],
  },
  {
    key: "reports",
    title: "Report",
    icon: "fa-chart-column",
    items: [
      ["yd", "Updated YD Report"],
      ["knitting", "Updated Knitting Report"],
      ["dyeing", "Updated Dyeing Report"],
      ["finishing", "Updated Finishing Report"],
      ["delivery", "Updated Delivery Report"],
      ["orderStatus", "Order Status"],
      ["productInfo", "Product Info"],
      ["planningProdInfo", "Planning & Production Info"],
    ],
  },
  {
    key: "batchReport",
    title: "Batch Report",
    icon: "fa-chart-simple",
    items: [
      ["dyeableBatch", "Dyeable Batch"],
      ["dyeableSummary", "Dyeable Batch Summary"],
      ["dailyConfirm", "Daily Confirm Batch Plan"],
    ],
  },
  {
    key: "planFilter",
    title: "Plan Filter",
    icon: "fa-filter",
    items: [
      ["yd", "YD Plan Filter"],
      ["knitting", "Knitting Plan Filter"],
      ["dyeing", "Dyeing Plan Filter"],
      ["delivery", "Delivery Plan Filter"],
      ["deliveryfloor", "Delivery Plan (Floor) Filter"],
    ],
  },
  {
    key: "actualTracking",
    title: "Plan Vs Actual Tracking",
    icon: "fa-scale-balanced",
    items: [
      ["yd", "YD"],
      ["knitting", "Knitting"],
      ["dyeing", "Dyeing"],
      ["finishing", "Finishing"],
      ["delivery", "Delivery"],
      ["deliveryfloor", "Delivery (Floor)"],
    ],
  },
  {
    key: "trackingReports",
    title: "Tracking Report",
    icon: "fa-file-waveform",
    items: [
      ["yd", "YD"],
      ["knitting", "Knitting"],
      ["dyeing", "Dyeing"],
      ["finishing", "Finishing"],
      ["delivery", "Delivery"],
      ["deliveryfloor", "Delivery (Floor)"],
    ],
  },
  {
    key: "planTrackingFilter",
    title: "Plan Vs Actual Tracking Filter",
    icon: "fa-filter",
    items: [
      ["yd", "YD Plan Tracking Filter"],
      ["knitting", "Knitting Plan Tracking Filter"],
      ["dyeing", "Dyeing Plan Tracking Filter"],
      ["delivery", "Delivery Plan Tracking Filter"],
      ["deliveryfloor", "Delivery Plan (Floor) Tracking Filter"],
    ],
  },
  {
    key: "loadCalculation",
    title: "Load Calculation",
    icon: "fa-calculator",
    items: [
      ["detailed", "Detailed Load Download"],
      ["summary", "Buyer-wise Load Summary"],
    ],
  },
  {
    key: "manageUsers",
    title: "Manage Users",
    icon: "fa-users-gear",
    items: [["view", "Manage Users"]],
  },
];

const ACTION_GROUPS = [
  {
    title: "Data Upload & Management",
    icon: "fa-upload",
    items: [
      ["uploadGeneral", "Upload General Data"],
      ["uploadYD", "Upload YD Data"],
      ["uploadKnitting", "Upload Knitting Data"],
      ["uploadDyeing", "Upload Dyeing Data"],
      ["uploadFinishing", "Upload Finishing Data"],
      ["uploadDelivery", "Upload Delivery Data"],
      ["uploadBP", "Upload BP Data"],
      ["deleteFiles", "Delete Uploaded Files"],
      ["wipeSystem", "Wipe System Data"],
    ],
  },
  {
    title: "Planning Save Permissions",
    icon: "fa-floppy-disk",
    items: [
      ["saveYD", "Save YD Planning"],
      ["saveKnitting", "Save Knitting Planning"],
      ["saveDyeing", "Save Dyeing Planning"],
      ["saveFinishing", "Save Finishing Planning"],
      ["saveDelivery", "Save Delivery Planning"],
    ],
  },
  {
    title: "Actual Tracking Save Permissions",
    icon: "fa-floppy-disk",
    items: [
      ["saveActualYD", "Save Actual Data (YD)"],
      ["saveActualKnitting", "Save Actual Data (Knitting)"],
      ["saveActualDyeing", "Save Actual Data (Dyeing)"],
      ["saveActualFinishing", "Save Actual Data (Finishing)"],
      ["saveActualDelivery", "Save Actual Data (Delivery)"],
      ["saveActualDeliveryFloor", "Save Actual Data (Delivery Floor)"],
    ],
  },
  {
    title: "Buyer-wise Load Summary Permissions",
    icon: "fa-chart-column",
    items: [
      ["loadSummaryYd", "Load Summary (YD)"],
      ["loadSummaryKnitting", "Load Summary (Knitting)"],
      ["loadSummaryDyeing", "Load Summary (Dyeing)"],
      ["loadSummaryDelivery", "Load Summary (Delivery)"],
      ["loadSummaryDeliveryfloor", "Load Summary (Delivery Floor)"],
    ],
  },
  {
    title: "Batch Plan Actions",
    icon: "fa-layer-group",
    items: [
      ["batchEdit", "Edit Batch Plan (rows, machines, General Info)"],
      ["batchTentative", "Make Batch Plan Tentative"],
      ["batchConfirm", "Confirm / Re-Confirm Batch Plan"],
      ["batchInternalChange", "Approve Internal change"],
      ["batchMovePending", "Move Batch Plan to Pending"],
      ["batchCardGenerate", "Generate / Revise Batch Card"],
    ],
  },
  {
    title: "Order Workflow Actions",
    icon: "fa-arrows-rotate",
    items: [
      ["confirmPlan", "Move to Confirm"],
      ["tentativePlan", "Move to Tentative"],
      ["completeOrder", "Mark Order Completed"],
      ["reopenOrder", "Reopen Completed Order"],
      ["changeOrderStatus", "Change Order Status"],
      ["deletePlan", "Delete Planning Data"],
    ],
  },
];

const DOWNLOAD_GROUPS = [
  {
    title: "Report Menu",
    items: [
      ["osDetailedExcel", "Order Status (Excel)"],
      ["osDetailedPdf", "Order Status (PDF)"],
      ["reportUpdatedExcelYD", "Updated YD Report (Combined)"],
      ["reportUpdatedExcelKnitting", "Updated Knitting Report (Combined)"],
      ["reportUpdatedExcelDyeing", "Updated Dyeing Report (Combined)"],
      ["reportUpdatedExcelFinishing", "Updated Finishing Report (Combined)"],
      ["reportUpdatedExcelDelivery", "Updated Delivery Report (Combined)"],
    ],
  },
  {
    title: "Tracking Report Menu",
    items: [
      ["trackingYD", "YD Tracking Reports (Excel/PDF)"],
      ["trackingKnitting", "Knitting Tracking Reports (Excel/PDF)"],
      ["trackingDyeing", "Dyeing Tracking Reports (Excel/PDF)"],
      ["trackingFinishing", "Finishing Tracking Reports (Excel/PDF)"],
      ["trackingDelivery", "Delivery Tracking Reports (Excel/PDF)"],
      [
        "trackingDeliveryFloor",
        "Delivery (Floor) Tracking Reports (Excel/PDF)",
      ],
    ],
  },
  {
    title: "Load Calculation Menu",
    items: [
      ["loadDetailedYd", "Detailed Load (YD)"],
      ["loadDetailedKnitting", "Detailed Load (Knitting)"],
      ["loadDetailedDyeing", "Detailed Load (Dyeing)"],
      ["loadDetailedDelivery", "Detailed Load (Delivery)"],
      ["loadDetailedDeliveryfloor", "Detailed Load (Delivery Floor)"],
      ["loadSummaryYd", "Load Summary (YD)"],
      ["loadSummaryKnitting", "Load Summary (Knitting)"],
      ["loadSummaryDyeing", "Load Summary (Dyeing)"],
      ["loadSummaryDelivery", "Load Summary (Delivery)"],
      ["loadSummaryDeliveryfloor", "Load Summary (Delivery Floor)"],
    ],
  },
  {
    title: "Batch Plan & Batch Report",
    items: [
      ["batchPlanPrint", "Batch Plan Print / PDF"],
      ["batchCardPrint", "Batch Card Print / PDF"],
      ["dyeableExcel", "Dyeable Batch (Excel)"],
      ["dyeableSummaryExcel", "Dyeable Batch Summary (Excel / Print)"],
      ["dailyConfirmExcel", "Daily Confirm Batch Plan (Excel / Print)"],
    ],
  },
];

function emptyPermissions() {
  const menus = {};
  MENU_GROUPS.forEach((g) => {
    menus[g.key] = {};
    g.items.forEach(([k]) => (menus[g.key][k] = false));
  });
  const actions = {};
  ACTION_GROUPS.forEach((g) => g.items.forEach(([k]) => (actions[k] = false)));

  const downloads = {};
  DOWNLOAD_GROUPS.forEach((g) =>
    g.items.forEach(([k]) => (downloads[k] = false)),
  );
  return {
    menus,
    actions,
    buyers: { accessType: "all", buyerIds: [] },
    downloads,
  };
}

function makeTemplate(role) {
  const p = emptyPermissions();
  const setMenu = (group, values = true) =>
    Object.keys(p.menus[group]).forEach((k) => (p.menus[group][k] = values));
  const setAllObj = (obj, value = true) =>
    Object.keys(obj).forEach((k) => (obj[k] = value));
  if (role === "Admin") {
    Object.keys(p.menus).forEach((k) => setMenu(k));
    setAllObj(p.actions);
    setAllObj(p.downloads);
    p.buyers.accessType = "all";
  } else if (role === "Approver") {
    [
      "orderManagement",
      "reports",
      "planFilter",
      "actualTracking",
      "trackingReports",
      "planTrackingFilter",
      "loadCalculation",
    ].forEach((k) => setMenu(k));
    [
      "confirmPlan",
      "tentativePlan",
      "completeOrder",
      "reopenOrder",
      "changeOrderStatus",
      "batchConfirm",
      "batchInternalChange",
      "batchMovePending",
      "batchCardGenerate",
    ].forEach((k) => (p.actions[k] = true));
    ["batchPlan", "batchCard", "batchReport"].forEach((k) => setMenu(k));
    setAllObj(p.downloads);
    p.buyers.accessType = "all";
  } else if (role === "Planner") {
    [
      "orderManagement",
      "reports",
      "planFilter",
      "actualTracking",
      "planTrackingFilter",
      "loadCalculation",
    ].forEach((k) => setMenu(k));
    p.menus.dataManagement.view = true;
    ["batchPlan", "batchCard", "batchReport"].forEach((k) => setMenu(k));
    [
      "batchEdit",
      "batchTentative",
      "saveYD",
      "saveKnitting",
      "saveDyeing",
      "saveFinishing",
      "saveDelivery",
      "saveActualYD",
      "saveActualKnitting",
      "saveActualDyeing",
      "saveActualFinishing",
      "saveActualDelivery",
      "saveActualDeliveryFloor",
      "tentativePlan",
      "loadSummaryYd",
      "loadSummaryKnitting",
      "loadSummaryDyeing",
      "loadSummaryDelivery",
      "loadSummaryDeliveryfloor",
    ].forEach((k) => (p.actions[k] = true));

    [
      "reportUpdatedExcelYD",
      "reportUpdatedExcelKnitting",
      "reportUpdatedExcelDyeing",
      "reportUpdatedExcelFinishing",
      "reportUpdatedExcelDelivery",
      "osDetailedExcel",
      "osDetailedPdf",
      "loadDetailedYd",
      "loadDetailedKnitting",
      "loadDetailedDyeing",
      "loadDetailedDelivery",
      "loadDetailedDeliveryfloor",
      "loadSummaryYd",
      "loadSummaryKnitting",
      "loadSummaryDyeing",
      "loadSummaryDelivery",
      "loadSummaryDeliveryfloor",
      // Planners need Tracking Downloads since they have actualTracking menu
      "trackingYD",
      "trackingKnitting",
      "trackingDyeing",
      "trackingFinishing",
      "trackingDelivery",
      "trackingDeliveryFloor",
      "batchPlanPrint",
      "batchCardPrint",
      "dyeableExcel",
      "dyeableSummaryExcel",
      "dailyConfirmExcel",
    ].forEach((k) => (p.downloads[k] = true));
    p.buyers.accessType = "selected";
    p.buyers.buyerIds = ["hm", "next", "marks"];
  } else {
    ["reports", "planFilter", "trackingReports", "planTrackingFilter", "batchReport"].forEach((k) => setMenu(k));
    ["globalSearch"].forEach((k) => (p.actions[k] = true));

    [
      // Viewers need report downloads since they have reports menu
      "reportUpdatedExcelYD",
      "reportUpdatedExcelKnitting",
      "reportUpdatedExcelDyeing",
      "reportUpdatedExcelFinishing",
      "reportUpdatedExcelDelivery",
      "osDetailedExcel",
      "osDetailedPdf",
      // Tracking downloads
      "trackingYD",
      "trackingKnitting",
      "trackingDyeing",
      "trackingFinishing",
      "trackingDelivery",
      "trackingDeliveryFloor",
    ].forEach((k) => (p.downloads[k] = true));
    p.buyers.accessType = "selected";
    p.buyers.buyerIds = ["hm", "next"];
  }
  return p;
}

function normalizePermissions(rawPermissions, role) {
  const template = makeTemplate(role || "Viewer");
  if (!rawPermissions || typeof rawPermissions !== "object") {
    return template;
  }

  // If rawPermissions is an empty object ({})
  if (Object.keys(rawPermissions).length === 0) {
    return template;
  }

  const emptyP = emptyPermissions();
  const normalized = {
    menus: {},
    actions: { ...template.actions, ...(rawPermissions.actions || {}) },
    buyers: {
      accessType: rawPermissions.buyers?.accessType || template.buyers?.accessType || "all",
      buyerIds: Array.isArray(rawPermissions.buyers?.buyerIds)
        ? rawPermissions.buyers.buyerIds
        : (template.buyers?.buyerIds || []),
    },
    downloads: { ...template.downloads, ...(rawPermissions.downloads || {}) },
  };

  // Deep merge menus for all known groups
  Object.keys(emptyP.menus).forEach((group) => {
    normalized.menus[group] = {
      ...(template.menus[group] || {}),
      ...(rawPermissions.menus && rawPermissions.menus[group]
        ? rawPermissions.menus[group]
        : {}),
    };
  });

  // Batch Plan keys are new: a user saved before they existed gets them only when
  // an Admin ticks them in the permission builder, never from the role template.
  const isMissing = (obj, key) => !obj || !Object.prototype.hasOwnProperty.call(obj, key);
  // Batch Plan and Batch Card have one key per Dyeing Plan unit; a unit key the user never had is off.
  const batchMenuKeys = { ...BATCH_PERMISSION_KEYS.menus };
  MENU_GROUPS.filter((g) => g.key === "batchPlan" || g.key === "batchCard").forEach((g) => { batchMenuKeys[g.key] = g.items.map(([k]) => k); });
  Object.entries(batchMenuKeys).forEach(([group, keys]) => {
    keys.forEach((key) => {
      if (isMissing(rawPermissions.menus && rawPermissions.menus[group], key)) normalized.menus[group][key] = false;
    });
  });
  BATCH_PERMISSION_KEYS.actions.forEach((key) => {
    if (isMissing(rawPermissions.actions, key)) normalized.actions[key] = false;
  });
  BATCH_PERMISSION_KEYS.downloads.forEach((key) => {
    if (isMissing(rawPermissions.downloads, key)) normalized.downloads[key] = false;
  });

  return normalized;
}

const BATCH_PERMISSION_KEYS = {
  menus: {
    dataManagement: ["dyeingMc", "flatAllowance", "unitSetup"],
    batchPlan: ["all", "efl", "ekl", "ext", "pluvia", "outside"],
    batchCard: ["all", "efl", "ekl", "ext", "pluvia", "outside"],
    batchReport: ["dyeableBatch", "dyeableSummary", "dailyConfirm"],
  },
  actions: ["uploadBP", "batchEdit", "batchTentative", "batchConfirm", "batchInternalChange", "batchMovePending", "batchCardGenerate"],
  downloads: ["batchPlanPrint", "batchCardPrint", "dyeableExcel", "dyeableSummaryExcel", "dailyConfirmExcel"],
};

let users = [];
let createPermissions = makeTemplate("Viewer");
let permissionDraft = null;
let permissionTarget = null;
let pendingEditPermissions = null;
let toastTimeout;
let liveUpdateInterval = null;

function showToast(msg, isError = false) {
  const t = document.getElementById("toast");
  document.getElementById("toastMessage").textContent = msg;
  t.classList.remove("translate-x-[140%]");

  const icon = document.getElementById("toastIcon");
  if (isError) {
    t.classList.replace("bg-slate-900", "bg-red-600");
    icon.className = "fa-solid fa-triangle-exclamation text-white";
  } else {
    t.classList.replace("bg-red-600", "bg-slate-900");
    icon.className = "fa-solid fa-circle-check text-emerald-400";
  }

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    t.classList.add("translate-x-[140%]");
  }, 3000);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function formatDate(dateStr) {
  if (!dateStr || dateStr === "Never") return "Never";
  const d = new Date(dateStr);
  return isNaN(d)
    ? dateStr
    : d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function toggleTheme() {
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  localStorage.setItem("theme-preference", isDark ? "dark" : "light");
  document.getElementById("themeIcon").className = isDark
    ? "fa-solid fa-sun text-amber-400"
    : "fa-solid fa-moon text-slate-600";
}

function togglePassword(id, btn) {
  const inp = document.getElementById(id);
  if (inp.type === "password") {
    inp.type = "text";
    btn.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
  } else {
    inp.type = "password";
    btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
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

function logout(expired = false) {
  localStorage.clear();
  window.location.href = expired ? "login.html?expired=midnight" : "login.html";
}

function checkAdminAndLoadUsers() {
  if (!isMidnightSessionValid()) {
    logout(true);
    return;
  }
  startMidnightWatcher();

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("username");

  if (!token) {
    window.location.href = "login.html";
    return;
  }
  if (role !== "Admin") {
    alert("Access Denied! Only Admins can manage users.");
    window.location.href = "index.html";
    return;
  }

  document.getElementById("displayUsername").innerText = username;
  document.getElementById("displayRole").innerText = role;
  document.getElementById("headerInitials").innerText = username
    ? username.charAt(0).toUpperCase()
    : "A";

  const isDark = document.documentElement.classList.contains("dark");
  document.getElementById("themeIcon").className = isDark
    ? "fa-solid fa-sun text-amber-400"
    : "fa-solid fa-moon text-slate-600";

  loadUsers();
}

async function loadUsers(silent = false) {
  if (!silent) {
    const root = document.getElementById("userDirectory");
    if (root) {
      root.innerHTML = `
          <div class="lg:col-span-2 2xl:col-span-3 flex justify-center items-center h-40 text-slate-400">
              <div class="relative flex justify-center items-center w-8 h-8 mr-3">
                  <div class="absolute w-full h-full rounded-full border-4 border-slate-200 dark:border-slate-700"></div>
                  <div class="absolute w-full h-full rounded-full border-4 border-transparent border-t-emerald-500 border-r-emerald-500 animate-spin"></div>
                  <div class="absolute w-5 h-5 rounded-full border-4 border-transparent border-b-blue-500 border-l-blue-500 animate-[spin_1.5s_linear_infinite_reverse]"></div>
              </div> Loading Directory...
          </div>
        `;
    }
  }

  const token = localStorage.getItem("token");

  if (!token) return;

  try {
    const res = await fetch(
      "https://abir-backend-api.onrender.com/api/auth/users",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) throw new Error("Failed to fetch users");
    const rawUsers = await res.json();

    const now = Date.now();
    const liveThreshold = 2 * 60 * 1000; // 2 minutes

    users = rawUsers.map((u) => {
      let isLive = false;
      if (u.lastActive) {
        const diff = now - new Date(u.lastActive).getTime();
        // Strict check: diff must be between -60 seconds (clock skew) and the threshold.
        // This prevents users with future timestamps (e.g. timezone bugs) from always appearing active.
        isLive = diff >= -60000 && diff < liveThreshold;
      }

      return {
        id: u._id,
        username: u.username,
        role: u.role,
        status: u.status || "active",
        createdAt: new Date(u.createdAt).toLocaleDateString(),
        lastLogin: u.lastActive
          ? `${new Date(u.lastActive).toLocaleTimeString()} [diff: ${Math.round((now - new Date(u.lastActive).getTime()) / 1000)}s]`
          : "Never",
        isLive: isLive,
        permissions: normalizePermissions(u.permissions, u.role),
      };
    });

    renderUsers();
    updateDashboardStats();

    // Loading state is automatically replaced by renderUsers()
  } catch (err) {
    console.error(err);
    if (!silent) {
      const root = document.getElementById("userDirectory");
      if (root) {
        root.innerHTML = `
            <div class="lg:col-span-2 2xl:col-span-3 rounded-2xl border border-dashed border-red-300 bg-red-50 p-12 text-center text-red-600 dark:border-red-900/50 dark:bg-red-900/10">
                <i class="fa-solid fa-triangle-exclamation text-4xl mb-3"></i>
                <p class="font-bold">Failed to load users.</p>
                <p class="text-sm opacity-80 mt-1">${err.message || "Please try again later."}</p>
            </div>
          `;
      }
    }
  }
}

function countTrue(obj) {
  if (typeof obj === "boolean") return obj ? 1 : 0;
  if (!obj || typeof obj !== "object") return 0;
  return Object.values(obj).filter(Boolean).length;
}
function flattenMenuCount(menus) {
  if (!menus || typeof menus !== "object") return 0;
  return Object.values(menus).reduce((n, g) => {
    if (typeof g === "boolean") return n + (g ? 1 : 0);
    return n + countTrue(g);
  }, 0);
}
function totalMenuCount() {
  return MENU_GROUPS.reduce((n, g) => n + g.items.length, 0);
}
function totalActionCount() {
  return ACTION_GROUPS.reduce((n, g) => n + g.items.length, 0);
}

function totalDownloadCount() {
  return DOWNLOAD_GROUPS.reduce((n, g) => n + g.items.length, 0);
}

function permissionCounts(p) {
  if (!p || typeof p !== "object") return { menu: 0, action: 0, download: 0 };
  return {
    menu: flattenMenuCount(p.menus),
    action: countTrue(p.actions),
    download: countTrue(p.downloads),
  };
}

function permissionSummaryHtml(p) {
  const c = permissionCounts(p);
  const buyerType = p?.buyers?.accessType || "all";
  const buyerIds = Array.isArray(p?.buyers?.buyerIds) ? p.buyers.buyerIds : [];
  const buyerText =
    buyerType === "all"
      ? "All buyers"
      : buyerType === "none"
        ? "No buyer"
        : `${buyerIds.length} selected`;
  return `<div class="grid grid-cols-2 gap-2">
      <div><span class="text-slate-500">Menu access</span><p class="font-black">${c.menu}/${totalMenuCount()}</p></div>
      <div><span class="text-slate-500">Save/actions</span><p class="font-black">${c.action}/${totalActionCount()}</p></div>
      <div><span class="text-slate-500">Buyer access</span><p class="font-black">${buyerText}</p></div>
      <div><span class="text-slate-500">Downloads</span><p class="font-black">${c.download}/${totalDownloadCount()}</p></div>
    </div>`;
}

function updateCreatePermissionSummary() {
  document.getElementById("createPermissionSummary").innerHTML =
    permissionSummaryHtml(createPermissions);
}

function applyTemplateFromRole(scope) {
  const role = document.getElementById(
    scope === "create" ? "createRole" : "editRole",
  ).value;
  if (scope === "create") {
    document.getElementById("createTemplate").value = role;
    createPermissions = makeTemplate(role);
    updateCreatePermissionSummary();
  }
}
function applySelectedTemplate(scope) {
  if (scope !== "create") return;
  const val = document.getElementById("createTemplate").value;
  if (val !== "Custom") {
    createPermissions = makeTemplate(val);
    document.getElementById("createRole").value = val;
    updateCreatePermissionSummary();
    showToast(`${val} permission template applied.`);
  }
}

function updateDashboardStats() {
  document.getElementById("statTotal").textContent = users.length;
  document.getElementById("statAdmins").textContent = users.filter(
    (u) => u.role === "Admin",
  ).length;
  document.getElementById("statCustom").textContent = users.filter(
    (u) =>
      JSON.stringify(u.permissions) !== JSON.stringify(makeTemplate(u.role)),
  ).length;
  document.getElementById("statBuyerRestricted").textContent = users.filter(
    (u) => u.permissions?.buyers?.accessType === "selected",
  ).length;
}

function buyerNames(p) {
  if (!p?.buyers) return "All buyers";
  if (p.buyers.accessType === "all") return "All buyers";
  if (p.buyers.accessType === "none") return "No buyer access";
  const ids = Array.isArray(p.buyers.buyerIds) ? p.buyers.buyerIds : [];
  return (
    ids
      .map((id) => BUYERS.find((b) => b.id === id)?.name)
      .filter(Boolean)
      .join(", ") || "None selected"
  );
}

function renderUsers() {
  const q = document.getElementById("userSearch").value.trim().toLowerCase();
  const role = document.getElementById("roleFilter").value;
  const status = document.getElementById("statusFilter").value;
  const filtered = users.filter(
    (u) =>
      (!q ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)) &&
      (role === "all" || u.role === role) &&
      (status === "all" || u.status === status),
  );
  const root = document.getElementById("userDirectory");
  if (!filtered.length) {
    root.innerHTML = `<div class="lg:col-span-2 2xl:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-[#181c25]"><i class="fa-solid fa-users-slash text-4xl text-slate-300"></i><p class="mt-3 font-bold">No users matched your filter.</p></div>`;
    updateDashboardStats();
    return;
  }
  root.innerHTML = filtered
    .map((user) => {
      const c = permissionCounts(user.permissions);
      const initials = user.username.slice(0, 2).toUpperCase();
      const isActive = user.status === "active";
      return `<article class="permission-card fade-in relative rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-[#181c25]">
        <div class="p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex gap-3 min-w-0">
              <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-800 to-slate-600 text-white flex items-center justify-center font-black shrink-0 relative">
                ${initials}
                ${user.isLive ? '<span class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#181c25]"></span>' : ""}
              </div>
              <div class="min-w-0">
                <h3 class="font-black truncate" title="${escapeHtml(user.username)}">${escapeHtml(user.username)}</h3>
                <div class="flex flex-wrap items-center gap-1.5 mt-1">
                  <span class="role-pill text-[10px] font-black px-2 py-1 rounded-full" data-role="${user.role}">${user.role}</span>
                </div>
              </div>
            </div>
            <button onclick="deleteUser('${user.id}', '${escapeHtml(user.username)}')" class="w-8 h-8 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30" title="Delete User"><i class="fa-solid fa-trash-can"></i></button>
          </div>
  
          <div class="grid grid-cols-4 gap-2 mt-4">
            <div class="rounded-lg bg-slate-50 p-2 text-center dark:bg-[#11151d]"><p class="text-[10px] text-slate-500">Menus</p><p class="font-black text-sm">${c.menu}</p></div>
            <div class="rounded-lg bg-slate-50 p-2 text-center dark:bg-[#11151d]"><p class="text-[10px] text-slate-500">Actions</p><p class="font-black text-sm">${c.action}</p></div>

            <div class="rounded-lg bg-slate-50 p-2 text-center dark:bg-[#11151d]"><p class="text-[10px] text-slate-500">Downloads</p><p class="font-black text-sm">${c.download}</p></div>
          </div>
  
          <div class="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p class="text-[10px] uppercase font-black text-slate-400">Buyer Visibility</p>
            <p class="text-xs font-bold mt-1 truncate" title="${buyerNames(user.permissions)}"><i class="fa-solid fa-tags text-amber-500 mr-1"></i>${buyerNames(user.permissions)}</p>
          </div>
  
          <div class="mt-3 flex justify-between text-[11px] text-slate-500">
            <span>Created: ${formatDate(user.createdAt)}</span>
            <span class="flex items-center gap-1 font-semibold text-slate-400 dark:text-slate-500">
              <i class="fa-solid fa-lock text-[10px]"></i> Encrypted
            </span>
          </div>
        </div>
        <div class="grid grid-cols-2 border-t border-slate-200 dark:border-slate-800">
          <button onclick="openEditUser('${user.id}')" class="py-3 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 border-r border-slate-200 dark:border-slate-800"><i class="fa-solid fa-pen mr-1"></i>Edit Profile</button>
          <button onclick="openPermissionBuilder('${user.id}')" class="py-3 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"><i class="fa-solid fa-sliders mr-1"></i>Permissions</button>
        </div>
      </article>`;
    })
    .join("");
  updateDashboardStats();
}

async function createUser(event) {
  event.preventDefault();
  const username = document.getElementById("createUsername").value.trim();
  const password = document.getElementById("createPassword").value;
  const role = document.getElementById("createRole").value;
  const status = document.getElementById("createStatus")?.value || "active";

  if (username.length < 3)
    return showToast("Username must contain at least 3 characters.", true);
  if (password.length < 6)
    return showToast("Password must contain at least 6 characters.", true);

  const btn = document.getElementById("createBtn");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Creating...';

  try {
    const response = await fetch(
      "https://abir-backend-api.onrender.com/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          role,
          status,
          permissions: createPermissions,
        }),
      },
    );

    const data = await response.json();
    if (response.ok) {
      showToast("User Created Successfully!");
      event.target.reset();
      document.getElementById("createRole").value = "Viewer";
      document.getElementById("createTemplate").value = "Viewer";
      createPermissions = makeTemplate("Viewer");
      updateCreatePermissionSummary();
      loadUsers();
    } else {
      showToast(data.message || "Failed to create user.", true);
    }
  } catch (error) {
    console.error("Error:", error);
    showToast("Server error during creation.", true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function deleteUser(userId, username) {
  if (
    confirm(
      `Are you absolutely sure you want to delete '${username}'? This action cannot be undone.`,
    )
  ) {
    try {
      const response = await fetch(
        `https://abir-backend-api.onrender.com/api/auth/user/${userId}`,
        {
          method: "DELETE",
        },
      );
      if (response.ok) {
        showToast("User deleted successfully!");
        loadUsers();
      } else {
        showToast("Failed to delete user.", true);
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      showToast("Server error during deletion.", true);
    }
  }
}

function openEditUser(id) {
  const u = users.find((x) => x.id === id);
  if (!u) return;
  document.getElementById("editUserId").value = id;
  document.getElementById("editUsername").value = u.username;
  document.getElementById("editRole").value = u.role;
  document.getElementById("editStatus").value = u.status;
  document.getElementById("editPassword").value = "";
  document.getElementById("editUserSubtitle").textContent =
    `Editing ${u.username}`;
  pendingEditPermissions = clone(u.permissions);
  document.getElementById("editUserModal").classList.remove("hidden");
}
function closeEditUserModal() {
  document.getElementById("editUserModal").classList.add("hidden");
  pendingEditPermissions = null;
}

function openPermissionBuilderForEditingUser() {
  permissionTarget = "edit-buffer";
  permissionDraft = clone(pendingEditPermissions);
  document.getElementById("permissionModalTitle").textContent =
    "Edit User Permissions";
  renderPermissionBuilder();
  document.getElementById("permissionModal").classList.remove("hidden");
}

async function saveUserProfile(event) {
  event.preventDefault();
  const id = document.getElementById("editUserId").value;
  const u = users.find((x) => x.id === id);
  if (!u) return;
  const username = document.getElementById("editUsername").value.trim();
  const password = document.getElementById("editPassword").value;

  const payload = {
    username,
    role: document.getElementById("editRole").value,
    status: document.getElementById("editStatus").value,
    permissions: pendingEditPermissions
      ? pendingEditPermissions
      : u.permissions,
  };
  if (password) payload.password = password;

  const btn = document.getElementById("editBtn");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  try {
    const response = await fetch(
      `https://abir-backend-api.onrender.com/api/auth/user/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (response.ok) {
      showToast("User profile updated.");
      closeEditUserModal();
      loadUsers();
    } else {
      showToast(
        "Update failed. Backend may not support PUT /api/auth/user/:id",
        true,
      );
    }
  } catch (e) {
    showToast("Server error during update.", true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function openPermissionBuilder(target) {
  permissionTarget = target;
  if (target === "create") {
    permissionDraft = clone(createPermissions);
    document.getElementById("permissionModalTitle").textContent =
      "Configure New User Permissions";
  } else {
    const u = users.find((x) => x.id === target);
    if (!u) return;

    permissionDraft = normalizePermissions(u.permissions, u.role);

    document.getElementById("permissionModalTitle").textContent =
      `Permissions: ${u.username}`;
  }

  document.getElementById("permissionModal").classList.remove("hidden");
  renderPermissionBuilder();
}

function closePermissionBuilder() {
  document.getElementById("permissionModal").classList.add("hidden");
  permissionDraft = null;
  permissionTarget = null;
}

async function savePermissionBuilder() {
  syncDraftFromDom();
  if (permissionTarget === "create") {
    createPermissions = clone(permissionDraft);
    document.getElementById("createTemplate").value = "Custom";
    updateCreatePermissionSummary();
    document.getElementById("permissionModal").classList.add("hidden");
    showToast("Permissions applied to new user form.");
  } else if (permissionTarget === "edit-buffer") {
    pendingEditPermissions = clone(permissionDraft);
    document.getElementById("permissionModal").classList.add("hidden");
  } else {
    const u = users.find((x) => x.id === permissionTarget);
    if (u) {
      const payload = { permissions: clone(permissionDraft) };
      try {
        const response = await fetch(
          `https://abir-backend-api.onrender.com/api/auth/user/${u.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (response.ok) {
          showToast("Permissions updated directly.");
          loadUsers();
        } else {
          showToast("Backend update failed.", true);
        }
      } catch (e) {
        showToast("Server error.", true);
      }
    }
    document.getElementById("permissionModal").classList.add("hidden");
  }
  permissionDraft = null;
  permissionTarget = null;
}

async function showPermissionTab(tabId, btn) {
  document
    .querySelectorAll(".permission-tab")
    .forEach((t) => t.classList.add("hidden"));
  document.getElementById(`permissionTab-${tabId}`).classList.remove("hidden");

  if (tabId === "buyers" && !buyersLoaded) {
    const buyersTab = document.getElementById("permissionTab-buyers");
    buyersTab.innerHTML = `<div class="flex flex-col items-center justify-center p-10 h-full">
            <div class="relative flex justify-center items-center w-14 h-14 mb-4">
                <div class="absolute w-full h-full rounded-full border-4 border-gray-200 dark:border-gray-700"></div>
                <div class="absolute w-full h-full rounded-full border-4 border-transparent border-t-emerald-500 border-r-emerald-500 animate-spin"></div>
                <div class="absolute w-10 h-10 rounded-full border-4 border-transparent border-b-blue-500 border-l-blue-500 animate-[spin_1.5s_linear_infinite_reverse]"></div>
                <div class="absolute w-4 h-4 rounded-full bg-orange-500 animate-pulse"></div>
            </div>
            <span class="font-bold text-gray-500">Extracting buyers from uploaded files...</span>
          </div>`;
    await updateDynamicBuyers();
    renderBuyerPermissions();
  }

  document.querySelectorAll(".permission-nav").forEach((b) => {
    b.classList.remove("active", "bg-blue-600", "text-white");
    b.classList.add("hover:bg-slate-200", "dark:hover:bg-slate-800");
  });
  btn.classList.remove("hover:bg-slate-200", "dark:hover:bg-slate-800");
  btn.classList.add("active", "bg-blue-600", "text-white");
}

function renderPermissionBuilder() {
  renderMenuPermissions();
  renderActionPermissions();
  renderBuyerPermissions();
  renderDownloadPermissions();
  showPermissionTab(
    "menu",
    document.querySelector('.permission-nav[data-tab="menu"]'),
  );
}

function switchRow(path, key, label, checked, description = "") {
  const id = `perm-${path}-${key}`.replaceAll(".", "-");
  return `<label class="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-3 hover:border-blue-300 dark:border-slate-700 dark:hover:border-blue-700 cursor-pointer">
      <span class="min-w-0"><span class="block text-sm font-bold">${label}</span>${description ? `<span class="block text-[11px] text-slate-500 mt-0.5">${description}</span>` : ""}</span>
      <span class="switch"><input id="${id}" data-path="${path}" data-key="${key}" type="checkbox" ${checked ? "checked" : ""} class="perm-checkbox"><span class="slider"></span></span>
    </label>`;
}

// Batch Plan / Batch Card: a unit this user is ticked for but that is no longer listed (plan section 16.3)
// still gets a switch, so the tick can be seen and removed.
function permissionMenuItems(g) {
  if (g.key !== "batchPlan" && g.key !== "batchCard") return g.items;
  const listed = new Set(g.items.map(([k]) => k));
  const ticked = (permissionDraft && permissionDraft.menus[g.key]) || {};
  const extra = Object.keys(ticked).filter((k) => ticked[k] === true && !listed.has(k) && /^[a-z0-9]{1,40}$/.test(k))
    .map((k) => [k, k.toUpperCase() + " (not in use)"]);
  return [...g.items, ...extra];
}

function renderMenuPermissions() {
  document.getElementById("permissionTab-menu").innerHTML =
    `<div><h3 class="font-black text-lg">Menu & Submenu Access</h3></div>` +
    MENU_GROUPS.map(
      (g) => `
    <div class="permission-card rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div class="px-4 py-3 bg-slate-50 dark:bg-[#11151d] flex items-center justify-between"><h4 class="font-black text-sm"><i class="fa-solid ${g.icon} text-blue-500 w-5 mr-2"></i>${g.title}</h4></div>
      <div class="p-3 grid md:grid-cols-2 gap-2">${permissionMenuItems(g).map(([k, l]) => switchRow(`menus.${g.key}`, k, l, permissionDraft.menus[g.key][k])).join("")}</div>
    </div>`,
    ).join("");
}
function renderActionPermissions() {
  document.getElementById("permissionTab-actions").innerHTML =
    `<div><h3 class="font-black text-lg">Save Data & Action Permissions</h3></div>` +
    ACTION_GROUPS.map(
      (g) =>
        `<div class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"><div class="px-4 py-3 bg-slate-50 dark:bg-[#11151d]"><h4 class="font-black text-sm"><i class="fa-solid ${g.icon} text-emerald-500 w-5 mr-2"></i>${g.title}</h4></div><div class="p-3 grid md:grid-cols-2 gap-2">${g.items.map(([k, l]) => switchRow("actions", k, l, permissionDraft.actions[k])).join("")}</div></div>`,
    ).join("");
}
function buyerAccessChanged(val) {
  permissionDraft.buyers.accessType = val;
  document.getElementById("buyerSelectionPanel").className =
    val === "selected"
      ? "rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
      : "hidden";
}
function setAllBuyers(check) {
  document
    .querySelectorAll(".buyer-checkbox")
    .forEach((cb) => (cb.checked = check));
}
function renderBuyerPermissions() {
  const originalType = permissionDraft.buyers.accessType;
  document.getElementById("permissionTab-buyers").innerHTML = `
      <div><h3 class="font-black text-lg">Buyer-wise Data Visibility</h3></div>
      <div id="buyerSelectionPanel" class="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="p-3 bg-slate-50 dark:bg-[#11151d] flex flex-col sm:flex-row gap-2 justify-between"><div><h4 class="font-black text-sm">Select Buyers</h4></div><div class="flex gap-2"><button type="button" onclick="setAllBuyers(true)" class="px-3 py-1.5 rounded border text-xs font-bold">Select All</button><button type="button" onclick="setAllBuyers(false)" class="px-3 py-1.5 rounded border text-xs font-bold">Clear</button></div></div>
        <div class="p-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">${BUYERS.map((b) => `<label class="flex items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><input data-buyer-id="${b.id}" type="checkbox" ${originalType === "all" || permissionDraft.buyers.buyerIds.includes(b.id) ? "checked" : ""} class="w-4 h-4 accent-blue-600 buyer-checkbox"><span class="font-bold text-sm">${b.name}</span></label>`).join("")}</div>
      </div>`;
}

function renderDownloadPermissions() {
  document.getElementById("permissionTab-downloads").innerHTML =
    `<div><h3 class="font-black text-lg">Download & Export Permissions</h3></div>` +
    DOWNLOAD_GROUPS.map(
      (g) =>
        `<div class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"><div class="px-4 py-3 bg-slate-50 dark:bg-[#11151d]"><h4 class="font-black text-sm">${g.title}</h4></div><div class="p-3 grid md:grid-cols-2 gap-2">${g.items.map(([k, l]) => switchRow("downloads", k, l, permissionDraft.downloads[k])).join("")}</div></div>`,
    ).join("");
}

function syncDraftFromDom() {
  document.querySelectorAll(".perm-checkbox").forEach((cb) => {
    const path = cb.getAttribute("data-path");
    const key = cb.getAttribute("data-key");
    if (path.startsWith("menus.")) {
      const group = path.split(".")[1];
      permissionDraft.menus[group][key] = cb.checked;
    } else {
      permissionDraft[path][key] = cb.checked;
    }
  });
  permissionDraft.buyers.accessType = "selected";
  const arr = [];
  document.querySelectorAll(".buyer-checkbox").forEach((cb) => {
    if (cb.checked) arr.push(cb.getAttribute("data-buyer-id"));
  });
  permissionDraft.buyers.buyerIds = arr;
}

function setAllPermissions(val) {
  document
    .querySelectorAll(".perm-checkbox")
    .forEach((cb) => (cb.checked = val));
}

/* Plan section 16.3: Batch Plan and Batch Card permissions have one switch per Dyeing Plan unit
   (Dropdown Master Setup units plus the units used in Batch Plan). A unit's key is made exactly as the
   server's unitKey (lib/batch/source.js) does, in small letters: the demo's five floors keep their keys. */
const BATCH_LEGACY_UNIT_ALIASES = {
  EFL: ["EFL", "EFL Floor", "Epyllion Fabrics Limited"],
  EKL: ["EKL", "EKL Floor", "Epyllion Knitex Limited"],
  EXT: ["Ext", "Ext Floor", "EFL-Ext", "EFL Ext", "Extension", "Extension Floor"],
  PLUVIA: ["Pluvia", "Pluvia Wash", "Pluvia Washing"],
  OUTSIDE: ["Outside", "Outside Dyeing", "Outside Dyeing Floor", "Out Side", "Out Side Dyeing", "Outsource", "Outsourcing", "Subcontract", "Subcontract Dyeing"],
};
const BATCH_NO_UNIT_TEXTS = new Set(["-", "n/a", "na", "select", "null", "undefined", "none", "0"]);
function batchUnitPermissionKey(name) {
  const text = String(name ?? "").trim();
  if (!text || text.includes("+") || BATCH_NO_UNIT_TEXTS.has(text.toLowerCase())) return "";
  const key = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!key || key === "ALL") return "";
  for (const [floor, aliases] of Object.entries(BATCH_LEGACY_UNIT_ALIASES)) {
    if (aliases.some((alias) => alias.toUpperCase().replace(/[^A-Z0-9]/g, "") === key)) return floor.toLowerCase();
  }
  return key.slice(0, 40).toLowerCase();
}
async function loadBatchUnitPermissionItems() {
  if (!localStorage.getItem("token")) return;
  const units = new Map();
  // Unit names come from Dropdown Master and the Dyeing file, and switchRow writes the label as HTML:
  // only a plain unit key is taken, and characters that could form markup are dropped from the label.
  const add = (key, label) => {
    if (!/^[a-z0-9]{1,40}$/.test(key) || key === "all" || units.has(key)) return;
    units.set(key, String(label || "").replace(/[<>&"'`]/g, "").trim() || key.toUpperCase());
  };
  try {
    const res = await fetch("https://abir-backend-api.onrender.com/api/dropdowns");
    if (res.ok) ((await res.json()).units || []).forEach((u) => add(batchUnitPermissionKey(u.name), u.name));
  } catch (e) { console.warn("Dropdown units not loaded:", e); }
  try {
    const res = await fetch("https://abir-backend-api.onrender.com/api/batch/units");
    if (res.ok) ((await res.json()).units || []).forEach((u) => add(String(u.key || "").toLowerCase(), u.label));
  } catch (e) { console.warn("Batch units not loaded:", e); }
  if (!units.size) return;
  // The demo's five floor keys stay switchable, so an old tick (e.g. pluvia) can still be removed.
  [["efl", "EFL"], ["ekl", "EKL"], ["ext", "Ext"], ["pluvia", "Pluvia"], ["outside", "Outside"]].forEach(([key, label]) => add(key, label));
  // The permission switches are built from these items each time the permission builder opens.
  MENU_GROUPS.filter((g) => g.key === "batchPlan" || g.key === "batchCard").forEach((g) => {
    g.items = [["all", "All Orders"], ...Array.from(units, ([key, label]) => [key, label])];
  });
}
loadBatchUnitPermissionItems();

updateCreatePermissionSummary();
