// ==========================================================
// PLANNING & PRODUCTION INFO: 3-Section Order Planning & Production Report
// ==========================================================

let ppiCurrentPage = 1;
let ppiRowsPerPage = 10;
let ppiSearchQuery = "";
let ppiTotalFromServer = 0;
let ppiTotalPagesFromServer = 0;
let ppiOrders = [];
let ppiCurrentData = null;

// ==========================================
// Date Formatting Helper
// ==========================================
function formatPPIDate(dateStr) {
  if (!dateStr || dateStr === "-" || dateStr === "N/A" || dateStr === "—")
    return "—";
  const d = new Date(
    dateStr + (String(dateStr).includes("T") ? "" : "T00:00:00"),
  );
  if (isNaN(d.getTime())) return String(dateStr);
  return d
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .replace(/ /g, "-");
}

function calcPPILeadDay(planStr, actStr) {
  if (
    !planStr ||
    !actStr ||
    planStr === "—" ||
    actStr === "—" ||
    planStr === "-" ||
    actStr === "-"
  )
    return "—";
  const pDate = new Date(
    planStr + (String(planStr).includes("T") ? "" : "T00:00:00"),
  );
  const aDate = new Date(
    actStr + (String(actStr).includes("T") ? "" : "T00:00:00"),
  );
  if (isNaN(pDate.getTime()) || isNaN(aDate.getTime())) return "—";
  const diffDays = Math.round(
    (aDate.setHours(0, 0, 0, 0) - pDate.setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24),
  );
  if (diffDays > 0) return `+${diffDays}`;
  if (diffDays === 0) return `0`;
  return `${diffDays}`;
}

function getPPIOTTResult(planStr, actStr) {
  if (!planStr || planStr === "—" || planStr === "-") return "—";
  const pDate = new Date(
    planStr + (String(planStr).includes("T") ? "" : "T00:00:00"),
  );
  if (isNaN(pDate.getTime())) return "—";

  if (actStr && actStr !== "—" && actStr !== "-") {
    const aDate = new Date(
      actStr + (String(actStr).includes("T") ? "" : "T00:00:00"),
    );
    if (!isNaN(aDate.getTime())) {
      return aDate.setHours(0, 0, 0, 0) <= pDate.setHours(0, 0, 0, 0)
        ? '<span class="text-emerald-600 dark:text-emerald-400 font-black">Pass</span>'
        : '<span class="text-rose-600 dark:text-rose-400 font-black">Fail</span>';
    }
  }

  // When actual is empty, check if plan date is past
  const today = new Date().setHours(0, 0, 0, 0);
  if (pDate.setHours(0, 0, 0, 0) < today) {
    return '<span class="text-rose-600 dark:text-rose-400 font-black">Fail</span>';
  }
  return "—";
}

// Helper to extract numeric value from row item
function ppiGetNum(item, fieldNames) {
  for (const f of fieldNames) {
    if (item[f] !== undefined && item[f] !== null && item[f] !== "") {
      const clean = String(item[f]).replace(/,/g, "").replace(/%/g, "").trim();
      const num = parseFloat(clean);
      if (!isNaN(num)) return num;
    }
  }
  // Case-insensitive check
  const keys = Object.keys(item);
  for (const f of fieldNames) {
    const norm = f.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = keys.find(
      (k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === norm,
    );
    if (
      found &&
      item[found] !== undefined &&
      item[found] !== null &&
      item[found] !== ""
    ) {
      const clean = String(item[found])
        .replace(/,/g, "")
        .replace(/%/g, "")
        .trim();
      const num = parseFloat(clean);
      if (!isNaN(num)) return num;
    }
  }
  return 0;
}

function ppiGetString(item, fieldNames) {
  for (const f of fieldNames) {
    if (
      item[f] !== undefined &&
      item[f] !== null &&
      String(item[f]).trim() !== ""
    ) {
      return String(item[f]).trim();
    }
  }
  const keys = Object.keys(item);
  for (const f of fieldNames) {
    const norm = f.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = keys.find(
      (k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === norm,
    );
    if (
      found &&
      item[found] !== undefined &&
      item[found] !== null &&
      String(item[found]).trim() !== ""
    ) {
      return String(item[found]).trim();
    }
  }
  return "";
}

// ==========================================
// Item ID & Department Plan Status Resolvers
// ==========================================
function getPPIItemId(item, dept, orderNo) {
  if (!item) return "";
  if (item.itemId) return String(item.itemId).toLowerCase().replace(/\s+/g, "");

  const bNo =
    ppiGetString(item, [
      "BookingNo",
      "OrderNo",
      "EWO",
      "Booking",
      "Order No",
      "Booking No",
    ]) ||
    orderNo ||
    "N/A";
  const color =
    ppiGetString(item, ["Color", "Colour", "Fab Color", "color", "colour"]) ||
    "N/A";

  if (dept === "knitting" || dept === "delivery") {
    const fabConst =
      ppiGetString(item, [
        "FabricConstruction",
        "Fabric Construction",
        "Construction",
        "Fab Const",
        "Fabric",
      ]) || "N/A";
    const gsm =
      ppiGetString(item, ["GSM", "G.S.M", "Body GSM", "gsm"]) || "N/A";
    return `${bNo}_${color}_${fabConst}_${gsm}`
      .toLowerCase()
      .replace(/\s+/g, "");
  } else if (dept === "yd") {
    const type =
      ppiGetString(item, ["Booking Type", "Type", "YD Type", "BookingType"]) ||
      "N/A";
    const ydb = ppiGetString(item, ["YDB", "YD B"]) || "N/A";
    return `${bNo}_${type}_${ydb}`.toLowerCase().replace(/\s+/g, "");
  } else {
    // dyeing, finishing
    const procName =
      ppiGetString(item, [
        "Process Name",
        "ProcessName",
        "Process",
        "processName",
      ]) || "N/A";
    return `${bNo}_${color}_${procName}`.toLowerCase().replace(/\s+/g, "");
  }
}

function resolveDepartmentPlanInfo(
  currentItems,
  savedPlanItems,
  dept,
  defaultStart,
  defaultEnd,
  orderNo,
) {
  const items = currentItems || [];
  const savedList = savedPlanItems || [];

  if (items.length === 0) {
    return {
      planType:
        defaultStart && defaultStart !== "—" && defaultStart !== "-"
          ? "T&A"
          : "Pending",
      startDate: defaultStart || "—",
      endDate: defaultEnd || "—",
    };
  }

  // Map saved plan items by itemId
  const planMap = new Map();
  savedList.forEach((p) => {
    const id = p.itemId
      ? String(p.itemId).toLowerCase().replace(/\s+/g, "")
      : getPPIItemId(p.itemData || p, dept, orderNo);
    if (id) planMap.set(id, p);
  });

  let hasPendingOrMissing = false;
  let hasTentative = false;
  let confirmCount = 0;
  let matchCount = 0;
  const validStarts = [];
  const validEnds = [];

  items.forEach((item, idx) => {
    const itemId = getPPIItemId(item, dept, orderNo) || `item_${idx}`;
    const saved = planMap.get(itemId);

    if (saved) {
      matchCount++;
    }

    const isDelivery = dept === "delivery";
    const pType = isDelivery
      ? saved?.floorPlanType || saved?.planType || ""
      : saved?.planType || "";

    const pStart = isDelivery
      ? saved?.floorStartDate ||
        saved?.["Delivery Plan Start (Floor)"] ||
        saved?.startDate ||
        saved?.["Plan Start Date"] ||
        saved?.["Start Date"] ||
        ""
      : saved?.startDate ||
        saved?.["Plan Start Date"] ||
        saved?.["Plan Start"] ||
        saved?.["Start Date"] ||
        saved?.["Knit Start Date"] ||
        saved?.["Dyeing Start Date"] ||
        "";

    const pEnd = isDelivery
      ? saved?.floorEndDate ||
        saved?.["Delivery Plan End (Floor)"] ||
        saved?.endDate ||
        saved?.["Plan End Date"] ||
        saved?.["End Date"] ||
        ""
      : saved?.endDate ||
        saved?.["Plan End Date"] ||
        saved?.["Plan End"] ||
        saved?.["End Date"] ||
        saved?.["Knit End Date"] ||
        saved?.["Dyeing End Date"] ||
        "";

    const cleanType = String(pType).trim();

    if (
      !cleanType ||
      cleanType === "Select" ||
      cleanType === "Pending" ||
      cleanType === "—" ||
      cleanType === "-"
    ) {
      hasPendingOrMissing = true;
    } else if (cleanType === "Tentative") {
      hasTentative = true;
      if (pStart && pStart !== "—" && pStart !== "-") validStarts.push(pStart);
      if (pEnd && pEnd !== "—" && pEnd !== "-") validEnds.push(pEnd);
    } else if (cleanType === "Confirm") {
      confirmCount++;
      if (pStart && pStart !== "—" && pStart !== "-") validStarts.push(pStart);
      if (pEnd && pEnd !== "—" && pEnd !== "-") validEnds.push(pEnd);
    } else {
      hasPendingOrMissing = true;
    }
  });

  let overallType = "Pending";
  if (matchCount === 0) {
    if (savedList.length > 0) {
      overallType = "Pending";
    } else {
      overallType =
        defaultStart && defaultStart !== "—" && defaultStart !== "-"
          ? "T&A"
          : "Pending";
    }
  } else if (hasPendingOrMissing) {
    overallType = "Pending";
  } else if (hasTentative) {
    overallType = "Tentative";
  } else if (confirmCount === items.length && items.length > 0) {
    overallType = "Confirm";
  } else {
    overallType = "Pending";
  }

  validStarts.sort();
  validEnds.sort();

  let finalStart = defaultStart || "—";
  let finalEnd = defaultEnd || "—";

  if (validStarts.length > 0) {
    finalStart = validStarts[0];
  }
  if (validEnds.length > 0) {
    finalEnd = validEnds[validEnds.length - 1];
  }

  return {
    planType: overallType,
    startDate: finalStart,
    endDate: finalEnd,
  };
}

// ==========================================
// Show Planning & Production Info Page
// ==========================================
async function showPlanningProdInfo() {
  localStorage.setItem(
    "activePage",
    JSON.stringify({ page: "planningProdInfo" }),
  );

  if (typeof hideAllCoreViews === "function") {
    hideAllCoreViews();
  }

  const ppiSection = document.getElementById("planningProdInfoSection");
  if (ppiSection) ppiSection.classList.remove("hidden");

  const listView = document.getElementById("ppiListView");
  const detailedView = document.getElementById("ppiDetailedView");
  if (listView) listView.classList.remove("hidden");
  if (detailedView) detailedView.classList.add("hidden");

  const uniqueId = "planningProdInfo";
  activeTabId = uniqueId;

  if (typeof openTabs !== "undefined") {
    if (!openTabs.find((tab) => tab.id === uniqueId)) {
      openTabs.push({
        id: uniqueId,
        title: "Planning & Production Info",
        mode: "planningProdInfo",
      });
    }
    if (typeof renderTabs === "function") renderTabs();
  }

  if (typeof setActiveSidebarMenu === "function") {
    setActiveSidebarMenu("menu-planning-prod-info");
  }
  if (typeof closeSidebarMobile === "function") {
    closeSidebarMobile();
  }

  ppiSearchQuery = "";
  ppiCurrentPage = 1;
  const searchInp = document.getElementById("ppiSearchInput");
  if (searchInp) searchInp.value = "";

  await refreshPPIOrderList();
}

function getPPIApiBase() {
  if (typeof API_BASE !== "undefined" && API_BASE) return API_BASE;
  return "https://abir-backend-api.onrender.com";
}

// ==========================================
// Fetch paginated order list from server
// ==========================================
async function fetchPPIOrderList() {
  try {
    const search = ppiSearchQuery || "";
    const base = getPPIApiBase();
    const res = await fetch(
      `${base}/api/orders/all-list?page=${ppiCurrentPage}&limit=${ppiRowsPerPage}&search=${encodeURIComponent(search)}`,
    );
    if (!res.ok) return;
    const data = await res.json();

    ppiOrders = data.orders || [];
    ppiTotalFromServer = data.total || 0;
    ppiTotalPagesFromServer = data.totalPages || 0;
  } catch (err) {
    console.error("Error fetching Planning & Production Info list:", err);
    if (typeof showToast === "function")
      showToast("Failed to fetch order list");
  }
}

async function refreshPPIOrderList() {
  const spinner = document.getElementById("ppiLoadingSpinner");
  if (spinner) spinner.classList.remove("hidden");
  await fetchPPIOrderList();
  if (spinner) spinner.classList.add("hidden");
  renderPPIOrderList();
}

function renderPPIOrderList() {
  const tbody = document.getElementById("ppiTableBody");
  if (!tbody) return;

  if (!ppiOrders || ppiOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="p-10 text-center text-slate-400 font-medium">No orders found.</td></tr>`;
    document.getElementById("ppiPageInfo").innerText = "Showing 0-0 of 0";
    document.getElementById("ppiPageButtons").innerHTML = "";
    return;
  }

  const start = (ppiCurrentPage - 1) * ppiRowsPerPage;
  const total = ppiTotalFromServer;
  const totalPages = ppiTotalPagesFromServer;

  tbody.innerHTML = ppiOrders
    .map(
      (order) => `
    <tr class="hover:bg-blue-50/60 dark:hover:bg-slate-800/60 transition-colors border-b border-slate-100 dark:border-slate-800">
      <td class="p-3 border-r border-slate-200 dark:border-slate-800 text-center w-20">
        <button onclick="openPPIDetailedView('${encodeURIComponent(order.orderNo)}')" 
          class="bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white dark:bg-blue-900/40 dark:text-blue-300 w-8 h-8 rounded-lg shadow-sm transition flex items-center justify-center mx-auto" 
          title="View Detailed Report">
          <i class="fas fa-eye"></i>
        </button>
      </td>
      <td class="p-3 border-r border-slate-200 dark:border-slate-800 font-bold text-blue-600 dark:text-blue-400 w-1/3">
        ${order.orderNo}
      </td>
      <td class="p-3 font-medium text-slate-700 dark:text-slate-300 uppercase text-xs">
        ${order.buyer || "N/A"}
      </td>
    </tr>
  `,
    )
    .join("");

  document.getElementById("ppiPageInfo").innerText =
    `Showing ${total === 0 ? 0 : start + 1}-${Math.min(start + ppiRowsPerPage, total)} of ${total}`;

  // Pagination buttons
  const btnContainer = document.getElementById("ppiPageButtons");
  btnContainer.innerHTML = "";

  const prevBtn = document.createElement("button");
  prevBtn.className = `px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded text-xs ${
    ppiCurrentPage === 1
      ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
      : "bg-white dark:bg-[#181c25] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
  }`;
  prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
  prevBtn.onclick = () => {
    if (ppiCurrentPage > 1) {
      ppiCurrentPage--;
      refreshPPIOrderList();
    }
  };

  const nextBtn = document.createElement("button");
  nextBtn.className = `px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded text-xs ${
    ppiCurrentPage >= totalPages
      ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
      : "bg-white dark:bg-[#181c25] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
  }`;
  nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
  nextBtn.onclick = () => {
    if (ppiCurrentPage < totalPages) {
      ppiCurrentPage++;
      refreshPPIOrderList();
    }
  };

  btnContainer.appendChild(prevBtn);
  btnContainer.appendChild(nextBtn);
}

function filterPPIOrderList() {
  ppiSearchQuery =
    document.getElementById("ppiSearchInput")?.value.trim() || "";
  ppiCurrentPage = 1;
  refreshPPIOrderList();
}

function changePPIRowsPerPage() {
  ppiRowsPerPage = parseInt(document.getElementById("ppiRowsPerPage").value);
  ppiCurrentPage = 1;
  refreshPPIOrderList();
}

// ==========================================
// Open & Render Detailed View
// ==========================================
async function openPPIDetailedView(encodedOrderNo) {
  const orderNo = decodeURIComponent(encodedOrderNo);
  const spinner = document.getElementById("ppiDetailedLoadingSpinner");
  if (spinner) spinner.classList.remove("hidden");

  document.getElementById("ppiListView").classList.add("hidden");
  document.getElementById("ppiDetailedView").classList.remove("hidden");
  requestAnimationFrame(() => fitReportToScreen());

  try {
    const base = getPPIApiBase();
    const res = await fetch(
      `${base}/api/orders/${encodeURIComponent(orderNo)}?dept=knitting`,
    );
    if (!res.ok) throw new Error("Failed to fetch order details");
    const data = await res.json();
    ppiCurrentData = {
      order: data.order || {},
      planData: data.planData || {},
    };

    renderPPIDetailedReport(ppiCurrentData.order, ppiCurrentData.planData);
    requestAnimationFrame(() => fitReportToScreen());
  } catch (err) {
    console.error("Error loading order detail:", err);
    if (typeof showToast === "function")
      showToast("Error loading order details.");
  } finally {
    if (spinner) spinner.classList.add("hidden");
  }
}

function closePPIDetailedView() {
  document.getElementById("ppiDetailedView").classList.add("hidden");
  document.getElementById("ppiListView").classList.remove("hidden");
}

function renderPPIDetailedReport(order, planData) {
  const o = order || {};
  const pd = planData || {};

  document.getElementById("ppiBadgeBookingNo").innerText =
    `Booking #${o.orderNo || "—"}`;

  const fill = (id, val) => {
    const el = document.getElementById(id);
    if (el)
      el.innerText =
        val !== undefined && val !== null && val !== "" ? val : "—";
  };

  // 1. SPECIFICATION SECTION
  const kItems = o.knittingItems || [];
  const dItems = o.dyeingItems || [];
  const delItems = o.deliveryItems || [];

  // 1. SPECIFICATION SECTION: Red-marked all data will come from "General Information & Planning" uploaded file only.
  // Blue-marked "Final Conf." renamed as "Style" & its data also from "General Information & Planning" uploaded file.
  fill("ppi_val_bookingNo", o.orderNo);
  fill("ppi_val_pmc", o.pmc);
  fill(
    "ppi_val_ald",
    o.ald ||
      o["ALD"] ||
      (o.eventDay ? `${o.eventDay} ok out of ${o.eventDay}` : "—"),
  );
  fill("ppi_val_buyer", o.buyer);
  fill("ppi_val_merchant", o.bookingBy || o.bookedBy);
  fill("ppi_val_batchPlan", o.bpStatus || "Pending");
  fill("ppi_val_bookingDate", formatPPIDate(o.bookingDate));
  fill("ppi_val_eventDay", o.eventDay);
  fill("ppi_val_bodyFabric", o.bodyFabric || o["Body Fabric"] || "—");
  fill(
    "ppi_val_orderQty",
    o.requiredQtyKgs ? `${Number(o.requiredQtyKgs).toLocaleString()} KG` : "—",
  );
  fill("ppi_val_programType", o.programType || o["Program type"] || "SOLID");
  fill("ppi_val_bodyGsm", o.bodyGsm || o["Body GSM"] || "—");
  fill("ppi_val_buyerTeam", o.buyerTeam);
  fill("ppi_val_brush", o.brush || o["Brush"] || "NO");
  fill(
    "ppi_val_pmcNotes",
    o.pmcNotes || o["PMC Notes"] || o.fabricNotes || "—",
  );
  fill("ppi_val_unit", o.floor || o.unit || "EFL");
  fill("ppi_val_peach", o.peach || o["Peach"] || "NO");
  fill("ppi_val_fabricNotes", o.fabricNotes);
  fill("ppi_val_gmtUnit", o.gmtUnit);
  fill("ppi_val_heatset", o.heatset || o["Heatset"] || "NO");
  fill("ppi_val_style", o.style || o["Style"] || "—");
  fill("ppi_val_finalConf", o.style || o["Style"] || "—");

  // 2. PLANNING SECTION: Evaluate plan status and dates strictly from current active items
  const knitPlanInfo = resolveDepartmentPlanInfo(
    kItems,
    pd.knitting,
    "knitting",
    o.knitStart,
    o.knitEnd,
    o.orderNo,
  );
  const dyePlanInfo = resolveDepartmentPlanInfo(
    dItems,
    pd.dyeing,
    "dyeing",
    o.dyeStart,
    o.dyeEnd,
    o.orderNo,
  );
  const deliPlanInfo = resolveDepartmentPlanInfo(
    delItems,
    pd.delivery,
    "delivery",
    o.deliStart,
    o.deliEnd,
    o.orderNo,
  );

  const planKnitStart = knitPlanInfo.startDate;
  const planKnitEnd = knitPlanInfo.endDate;
  const knitPlanType = knitPlanInfo.planType;

  const planDyeStart = dyePlanInfo.startDate;
  const planDyeEnd = dyePlanInfo.endDate;
  const dyePlanType = dyePlanInfo.planType;

  const planDeliStart = deliPlanInfo.startDate;
  const planDeliEnd = deliPlanInfo.endDate;
  const deliPlanType = deliPlanInfo.planType;

  fill("ppi_plan_yarn", formatPPIDate(o.yarnDate));
  fill("ppi_plan_knitStart", formatPPIDate(planKnitStart));
  fill("ppi_plan_knitEnd", formatPPIDate(planKnitEnd));
  fill("ppi_plan_dyeStart", formatPPIDate(planDyeStart));
  fill("ppi_plan_dyeEnd", formatPPIDate(planDyeEnd));
  fill("ppi_plan_deliStart", formatPPIDate(planDeliStart));
  fill("ppi_plan_deliEnd", formatPPIDate(planDeliEnd));

  // Plan Type row (New row below Planned)
  const renderPlanTypeBadge = (type) => {
    if (!type || type === "—" || type === "-") return "—";
    const t = String(type).trim();
    let colorClass =
      "bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200";
    if (t === "Confirm")
      colorClass =
        "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800";
    else if (t === "Tentative")
      colorClass =
        "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800";
    else if (t === "Pending")
      colorClass =
        "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-bold";
    else if (t === "T&A")
      colorClass =
        "bg-slate-200/90 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold";
    return `<span class="inline-block px-3 py-0.5 rounded ${colorClass} font-bold text-[11px] shadow-sm">${t}</span>`;
  };

  const setBadgeHtml = (id, type) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = renderPlanTypeBadge(type);
  };

  setBadgeHtml("ppi_pt_yarn", "T&A");
  setBadgeHtml("ppi_pt_knit", knitPlanType);
  setBadgeHtml("ppi_pt_dye", dyePlanType);
  setBadgeHtml("ppi_pt_deli", deliPlanType);

  // Actual Yarn Date: only consider active items from kItems
  let actYarnDate = "";
  if (pd.knitting && pd.knitting.length > 0) {
    const activeIds = new Set(
      kItems.map(
        (item, idx) =>
          getPPIItemId(item, "knitting", o.orderNo) || `item_${idx}`,
      ),
    );
    const activeSaved = pd.knitting.filter((i) => {
      const id = i.itemId
        ? String(i.itemId).toLowerCase().replace(/\s+/g, "")
        : getPPIItemId(i.itemData || i, "knitting", o.orderNo);
      return activeIds.has(id);
    });
    const found = activeSaved.map((i) => i.yarnDate).find(Boolean);
    if (found) actYarnDate = found;
  }
  if (!actYarnDate && pd.knittingActual && pd.knittingActual.yarnDate) {
    actYarnDate = pd.knittingActual.yarnDate;
  }

  const actKnit = pd.knittingActual || {};
  const actDye = pd.dyeingActual || {};
  const actDeli = pd.deliveryfloorActual || pd.deliveryActual || {};

  fill("ppi_act_yarn", formatPPIDate(actYarnDate));
  fill("ppi_act_knitStart", formatPPIDate(actKnit.actualStart));
  fill("ppi_act_knitEnd", formatPPIDate(actKnit.actualEnd));
  fill("ppi_act_dyeStart", formatPPIDate(actDye.actualStart));
  fill("ppi_act_dyeEnd", formatPPIDate(actDye.actualEnd));
  fill("ppi_act_deliStart", formatPPIDate(actDeli.actualStart));
  fill("ppi_act_deliEnd", formatPPIDate(actDeli.actualEnd));

  // Lead Days
  fill("ppi_ld_yarn", calcPPILeadDay(o.yarnDate, actYarnDate));
  fill("ppi_ld_knitStart", calcPPILeadDay(planKnitStart, actKnit.actualStart));
  fill("ppi_ld_knitEnd", calcPPILeadDay(planKnitEnd, actKnit.actualEnd));
  fill("ppi_ld_dyeStart", calcPPILeadDay(planDyeStart, actDye.actualStart));
  fill("ppi_ld_dyeEnd", calcPPILeadDay(planDyeEnd, actDye.actualEnd));
  fill("ppi_ld_deliStart", calcPPILeadDay(planDeliStart, actDeli.actualStart));
  fill("ppi_ld_deliEnd", calcPPILeadDay(planDeliEnd, actDeli.actualEnd));

  // OTT Result
  const setHtml = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };
  setHtml("ppi_ott_yarn", getPPIOTTResult(o.yarnDate, actYarnDate));
  setHtml(
    "ppi_ott_knitStart",
    getPPIOTTResult(planKnitStart, actKnit.actualStart),
  );
  setHtml("ppi_ott_knitEnd", getPPIOTTResult(planKnitEnd, actKnit.actualEnd));
  setHtml(
    "ppi_ott_dyeStart",
    getPPIOTTResult(planDyeStart, actDye.actualStart),
  );
  setHtml("ppi_ott_dyeEnd", getPPIOTTResult(planDyeEnd, actDye.actualEnd));
  setHtml(
    "ppi_ott_deliStart",
    getPPIOTTResult(planDeliStart, actDeli.actualStart),
  );
  setHtml("ppi_ott_deliEnd", getPPIOTTResult(planDeliEnd, actDeli.actualEnd));

  const fmtRsn = (reason, dept) => {
    if (!reason && !dept) return "—";
    if (reason && dept) return `${reason} - ${dept}`;
    return reason || dept;
  };
  fill("ppi_rsn_yarn", "—");
  fill(
    "ppi_rsn_knit",
    fmtRsn(actKnit.failReason || actKnit.remarks, actKnit.relatedDept),
  );
  fill(
    "ppi_rsn_dye",
    fmtRsn(actDye.failReason || actDye.remarks, actDye.relatedDept),
  );
  fill(
    "ppi_rsn_deli",
    fmtRsn(actDeli.failReason || actDeli.remarks, actDeli.relatedDept),
  );

  // 3. COLOR BREAKDOWN TABLE
  renderPPIColorSummary(kItems, dItems, delItems);
}

function renderPPIColorSummary(knittingItems, dyeingItems, deliveryItems) {
  const colorMap = new Map();
  const getColorName = (item) =>
    ppiGetString(item, ["Color", "Colour", "Fab Color", "color", "colour"]);

  [knittingItems, dyeingItems, deliveryItems].forEach((items) => {
    items.forEach((item) => {
      const col = getColorName(item);
      if (!col) return;
      const key = col.toLowerCase().replace(/\s+/g, " ");
      if (!colorMap.has(key)) colorMap.set(key, col);
    });
  });

  const colors = Array.from(colorMap.entries()).map(([key, label], idx) => ({
    key,
    label: label || `Col-${idx + 1}`,
  }));

  const badgeColorCount = document.getElementById("ppiBadgeColorCount");
  if (badgeColorCount)
    badgeColorCount.innerText = `${colors.length} Color${colors.length === 1 ? "" : "s"}`;

  const thead = document.getElementById("ppiSummaryThead");
  const tbody = document.getElementById("ppiSummaryTbody");
  if (!thead || !tbody) return;

  const colorAggs = {};
  colors.forEach((col) => {
    colorAggs[col.key] = {
      allowances: [],
      allocQty: 0,
      yarnBal: 0,
      knitProd: 0,
      knitBal: 0,
      dyeOk: 0,
      dyeBal: 0,
      bookingQty: 0,
      receivedQty: 0,
      deliveredQty: 0,
      deliBal: 0,
      rfd: 0,
      slowMoving: 0,
    };
  });

  knittingItems.forEach((item) => {
    const colName = getColorName(item);
    if (!colName) return;
    const key = colName.toLowerCase().replace(/\s+/g, " ");
    const agg = colorAggs[key];
    if (!agg) return;

    const allow = ppiGetNum(item, [
      "Allowance %",
      "Allowance",
      "Wastage %",
      "Wastage",
      "Allow %",
      "Allow",
    ]);
    if (allow > 0) agg.allowances.push(allow > 1 ? allow / 100 : allow);

    agg.allocQty += ppiGetNum(item, [
      "Allocated Qty",
      "Allocated Qty ",
      "AllocatedQty",
    ]);
    agg.yarnBal += ppiGetNum(item, ["Yarn bala.", "Yarn Bala", "YarnBala"]);
    agg.knitProd += ppiGetNum(item, ["Knit Prod.", "KnitProd"]);
    agg.knitBal += ppiGetNum(item, ["Knit. Bala.", "KnitBala", "Knit Bala"]);
  });

  dyeingItems.forEach((item) => {
    const colName = getColorName(item);
    if (!colName) return;
    const key = colName.toLowerCase().replace(/\s+/g, " ");
    const agg = colorAggs[key];
    if (!agg) return;

    agg.dyeOk += ppiGetNum(item, ["Dyeing ok", "Dyeing Prod.", "DyeingProd"]);
    agg.dyeBal += ppiGetNum(item, [
      "Dyeing Bal.",
      "Dyeing Bala.",
      "DyeingBala",
    ]);
  });

  deliveryItems.forEach((item) => {
    const colName = getColorName(item);
    if (!colName) return;
    const key = colName.toLowerCase().replace(/\s+/g, " ");
    const agg = colorAggs[key];
    if (!agg) return;

    agg.bookingQty += ppiGetNum(item, [
      "RequiredQtyKgs",
      "Required Qty Kgs",
      "Booking qty",
    ]);
    agg.receivedQty += ppiGetNum(item, [
      "NetReceivedQtyKgs",
      "Net Received Qty",
      "Received Qty",
    ]);
    agg.deliveredQty += ppiGetNum(item, [
      "NetDeliveryQtyKgs",
      "Net Delivery Qty",
      "Delivered Qty",
    ]);
    agg.deliBal += ppiGetNum(item, ["Deli. Bal.", "Deli. Bala.", "DeliBal"]);
    agg.rfd += ppiGetNum(item, ["RFD"]);
    agg.slowMoving += ppiGetNum(item, ["Slowmoving", "Slow Moving"]);
  });

  const metrics = [
    {
      label: "Allowance %",
      isPercent: true,
      isAvg: true,
      getValue: (agg) =>
        agg.allowances.length
          ? agg.allowances.reduce((a, b) => a + b, 0) / agg.allowances.length
          : 0,
    },
    { label: "Allocated Qty", getValue: (agg) => agg.allocQty },
    { label: "Yarn bala.", getValue: (agg) => agg.yarnBal },
    { label: "Knit Prod.", getValue: (agg) => agg.knitProd },
    { label: "Knit. Bala.", getValue: (agg) => agg.knitBal },
    { label: "Dyeing ok", getValue: (agg) => agg.dyeOk },
    { label: "Dyeing Bal.", getValue: (agg) => agg.dyeBal },
    { label: "Booking qty", getValue: (agg) => agg.bookingQty },
    { label: "Received Qty.", getValue: (agg) => agg.receivedQty },
    { label: "Delivered Qty", getValue: (agg) => agg.deliveredQty },
    { label: "Deli. Bala.", getValue: (agg) => agg.deliBal },
    { label: "RFD", getValue: (agg) => agg.rfd },
    { label: "Slow moving", getValue: (agg) => agg.slowMoving },
  ];

  if (colors.length === 0) {
    thead.innerHTML = `
      <tr>
        <th class="p-2.5 text-left font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200">Color</th>
        ${metrics.map((m) => `<th class="p-2.5 text-center font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200">${m.label}</th>`).join("")}
      </tr>
    `;
    tbody.innerHTML = `
      <tr>
        <td colspan="${metrics.length + 1}" class="p-6 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">No color data found for this order.</td>
      </tr>
    `;
    return;
  }

  // Header: Color column + all metric columns
  thead.innerHTML = `
    <tr>
      <th class="p-2.5 text-left border-r border-slate-300 dark:border-slate-700 font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 min-w-[100px]">Color</th>
      ${metrics.map((m) => `<th class="p-2.5 border-r border-slate-300 dark:border-slate-700 text-center font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 whitespace-nowrap min-w-[85px]">${m.label}</th>`).join("")}
    </tr>
  `;

  // Rows: Each color is a row
  const rowsHtml = colors
    .map((col, idx) => {
      const isShaded = idx % 2 === 1;
      const agg = colorAggs[col.key] || {};
      const cellsHtml = metrics
        .map((m) => {
          const v = m.getValue(agg);
          const fmtVal = m.isPercent
            ? `${(v * 100).toFixed(0)}%`
            : Math.round(v).toLocaleString();
          return `<td class="p-2 border-r border-slate-300 dark:border-slate-700 text-center font-medium">${fmtVal}</td>`;
        })
        .join("");

      return `
      <tr class="${isShaded ? "bg-slate-50/80 dark:bg-[#141822]" : "bg-white dark:bg-[#181c25]"} hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors">
        <td class="p-2 font-bold text-slate-800 dark:text-slate-200 border-r border-slate-300 dark:border-slate-700 text-left">${col.label}</td>
        ${cellsHtml}
      </tr>
    `;
    })
    .join("");

  // Total summary row at bottom
  const totalCellsHtml = metrics
    .map((m) => {
      const vals = colors.map((col) => m.getValue(colorAggs[col.key]));
      const total = m.isAvg
        ? vals.filter((v) => v > 0).length
          ? vals.reduce((a, b) => a + b, 0) / vals.filter((v) => v > 0).length
          : 0
        : vals.reduce((a, b) => a + b, 0);
      const fmtTotal = m.isPercent
        ? `${(total * 100).toFixed(0)}%`
        : Math.round(total).toLocaleString();
      return `<td class="p-2 border-r border-slate-300 dark:border-slate-700 text-center font-black">${fmtTotal}</td>`;
    })
    .join("");

  const totalRowHtml = `
    <tr class="bg-amber-100/90 dark:bg-amber-950/80 text-amber-950 dark:text-amber-100 font-black border-t-2 border-slate-300 dark:border-slate-600">
      <td class="p-2 font-black border-r border-slate-300 dark:border-slate-700 text-left">Total</td>
      ${totalCellsHtml}
    </tr>
  `;

  tbody.innerHTML = rowsHtml + totalRowHtml;
}

// ==========================================
// Excel Export
// ==========================================
function exportPPIToExcel() {
  if (!ppiCurrentData || !ppiCurrentData.order) {
    if (typeof showToast === "function")
      showToast("No detailed data to export!");
    return;
  }

  if (typeof XLSX === "undefined") {
    if (typeof showToast === "function")
      showToast("Excel export library not available.");
    return;
  }

  const o = ppiCurrentData.order;
  const pd = ppiCurrentData.planData || {};

  const kItems = o.knittingItems || [];
  const dItems = o.dyeingItems || [];
  const delItems = o.deliveryItems || [];
  const firstItem = kItems[0] || dItems[0] || delItems[0] || {};

  const bodyFabric =
    o.bodyFabric ||
    o["Body Fabric"] ||
    ppiGetString(firstItem, [
      "FabricConstruction",
      "Fabric Construction",
      "BodyFabric",
      "Body Fabric",
      "Fabric",
    ]);
  const bodyGsm =
    o.bodyGsm ||
    o["Body GSM"] ||
    ppiGetString(firstItem, ["GSM", "Gsm", "Body GSM"]);
  const programType =
    o.programType ||
    o["Program type"] ||
    ppiGetString(firstItem, [
      "Process Name",
      "ProcessName",
      "ProgramType",
      "Program Type",
    ]) ||
    "SOLID";

  // Section 2 Milestones
  let planKnitStart = o.knitStart, planKnitEnd = o.knitEnd;
  let knitPlanType = "T&A";
  if (pd.knitting && pd.knitting.length > 0) {
    const starts = pd.knitting.map(i => i.startDate || i["Plan Start Date"] || i["Plan Start"] || i["Start Date"] || i["Knit Start Date"]).filter(Boolean).sort();
    const ends = pd.knitting.map(i => i.endDate || i["Plan End Date"] || i["Plan End"] || i["End Date"] || i["Knit End Date"]).filter(Boolean).sort();
    if (starts.length) {
      planKnitStart = starts[0];
      planKnitEnd = ends[ends.length - 1];
    }
    const savedType = pd.knitting.map(i => i.planType).find(Boolean);
    if (savedType && savedType !== 'Select') knitPlanType = savedType;
  }

  let planDyeStart = o.dyeStart, planDyeEnd = o.dyeEnd;
  let dyePlanType = "T&A";
  if (pd.dyeing && pd.dyeing.length > 0) {
    const starts = pd.dyeing.map(i => i.startDate || i["Plan Start Date"] || i["Plan Start"] || i["Start Date"] || i["Dyeing Start Date"]).filter(Boolean).sort();
    const ends = pd.dyeing.map(i => i.endDate || i["Plan End Date"] || i["Plan End"] || i["End Date"] || i["Dyeing End Date"]).filter(Boolean).sort();
    if (starts.length) {
      planDyeStart = starts[0];
      planDyeEnd = ends[ends.length - 1];
    }
    const savedType = pd.dyeing.map(i => i.planType).find(Boolean);
    if (savedType && savedType !== 'Select') dyePlanType = savedType;
  }

  let planDeliStart = o.deliStart, planDeliEnd = o.deliEnd;
  let deliPlanType = "T&A";
  if (pd.delivery && pd.delivery.length > 0) {
    const floorItems = pd.delivery.filter(i => {
      const type = i.floorPlanType || i["Delivery Plan Type (Floor)"] || "";
      return type === 'Confirm' || type === 'Tentative';
    });
    const sourceItems = floorItems.length ? floorItems : pd.delivery;
    const starts = sourceItems.map(i => i.floorStartDate || i["Delivery Plan Start (Floor)"] || i.startDate || i["Delivery Plan Start"]).filter(Boolean).sort();
    const ends = sourceItems.map(i => i.floorEndDate || i["Delivery Plan End (Floor)"] || i.endDate || i["Delivery Plan End"]).filter(Boolean).sort();
    if (starts.length) {
      planDeliStart = starts[0];
      planDeliEnd = ends[ends.length - 1];
    }
    const savedType = sourceItems.map(i => i.floorPlanType || i.planType).find(Boolean);
    if (savedType && savedType !== 'Select') deliPlanType = savedType;
  }

  let actYarnDate = "";
  if (pd.knitting && pd.knitting.length > 0) {
    const found = pd.knitting.map(i => i.yarnDate).find(Boolean);
    if (found) actYarnDate = found;
  }
  if (!actYarnDate && pd.knittingActual && pd.knittingActual.yarnDate) {
    actYarnDate = pd.knittingActual.yarnDate;
  }

  const actKnit = pd.knittingActual || {};
  const actDye = pd.dyeingActual || {};
  const actDeli = pd.deliveryfloorActual || pd.deliveryActual || {};

  // Section 1 Spec
  const sheetData = [
    ["Booking Specification"],
    [
      "Booking No.",
      o.orderNo || "",
      "",
      "Buyer Name",
      o.buyer || "",
      "",
      "Buyer Team",
      o.buyerTeam || "",
    ],
    [
      "Booking Date",
      formatPPIDate(o.bookingDate),
      "",
      "Event Day",
      o.eventDay || "",
      "",
      "Style",
      o.style || o["Style"] || o.finalConfirmation || "",
    ],
    [
      "PMC",
      o.pmc || "",
      "",
      "Merchant",
      o.bookingBy || o.bookedBy || "",
      "",
      "Unit",
      o.floor || o.unit || "EFL",
    ],
    [
      "Gmt Unit",
      o.gmtUnit || "",
      "",
      "Program type",
      programType,
      "",
      "Order Qty (KG)",
      o.requiredQtyKgs ? `${Number(o.requiredQtyKgs).toLocaleString()} KG` : "",
    ],
    [
      "Batch Plan",
      o.bpStatus || "Pending",
      "",
      "Body Fabric",
      bodyFabric,
      "",
      "Body GSM",
      bodyGsm,
    ],
    [
      "Brush",
      o.brush || o["Brush"] || "NO",
      "",
      "Peach",
      o.peach || o["Peach"] || "NO",
      "",
      "Heatset",
      o.heatset || o["Heatset"] || "NO",
    ],
    [
      "ALD",
      o.ald ||
        o["ALD"] ||
        (o.eventDay ? `${o.eventDay} ok out of ${o.eventDay}` : ""),
      "",
      "PMC Notes",
      o.pmcNotes || o["PMC Notes"] || o.fabricNotes || "",
      "",
      "Fabric Notes",
      o.fabricNotes || "",
    ],
    [],
    ["Booking Planning"],
    [
      "Timeline Phase",
      "Yarn Date",
      "Knit Start",
      "Knit End",
      "Dye Start",
      "Dye End",
      "Deli Start (Floor)",
      "Deli End (Floor)",
    ],
    [
      "Planned",
      formatPPIDate(o.yarnDate),
      formatPPIDate(planKnitStart),
      formatPPIDate(planKnitEnd),
      formatPPIDate(planDyeStart),
      formatPPIDate(planDyeEnd),
      formatPPIDate(planDeliStart),
      formatPPIDate(planDeliEnd),
    ],
    [
      "Plan Type",
      "T&A",
      knitPlanType,
      knitPlanType,
      dyePlanType,
      dyePlanType,
      deliPlanType,
      deliPlanType,
    ],
    [
      "Actual",
      formatPPIDate(actYarnDate),
      formatPPIDate(actKnit.actualStart),
      formatPPIDate(actKnit.actualEnd),
      formatPPIDate(actDye.actualStart),
      formatPPIDate(actDye.actualEnd),
      formatPPIDate(actDeli.actualStart),
      formatPPIDate(actDeli.actualEnd),
    ],
    [
      "Lead Day",
      calcPPILeadDay(o.yarnDate, actYarnDate),
      calcPPILeadDay(planKnitStart, actKnit.actualStart),
      calcPPILeadDay(planKnitEnd, actKnit.actualEnd),
      calcPPILeadDay(planDyeStart, actDye.actualStart),
      calcPPILeadDay(planDyeEnd, actDye.actualEnd),
      calcPPILeadDay(planDeliStart, actDeli.actualStart),
      calcPPILeadDay(planDeliEnd, actDeli.actualEnd),
    ],
    [
      "OTT Result",
      getPPIOTTResult(o.yarnDate, actYarnDate).replace(/<[^>]+>/g, ""),
      getPPIOTTResult(planKnitStart, actKnit.actualStart).replace(
        /<[^>]+>/g,
        "",
      ),
      getPPIOTTResult(planKnitEnd, actKnit.actualEnd).replace(/<[^>]+>/g, ""),
      getPPIOTTResult(planDyeStart, actDye.actualStart).replace(/<[^>]+>/g, ""),
      getPPIOTTResult(planDyeEnd, actDye.actualEnd).replace(/<[^>]+>/g, ""),
      getPPIOTTResult(planDeliStart, actDeli.actualStart).replace(
        /<[^>]+>/g,
        "",
      ),
      getPPIOTTResult(planDeliEnd, actDeli.actualEnd).replace(/<[^>]+>/g, ""),
    ],
    [
      "Reason & Dept",
      "—",
      actKnit.failReason
        ? `${actKnit.failReason}${actKnit.relatedDept ? " - " + actKnit.relatedDept : ""}`
        : "—",
      "",
      actDye.failReason
        ? `${actDye.failReason}${actDye.relatedDept ? " - " + actDye.relatedDept : ""}`
        : "—",
      "",
      actDeli.failReason
        ? `${actDeli.failReason}${actDeli.relatedDept ? " - " + actDeli.relatedDept : ""}`
        : "—",
      "",
    ],
  ];

  // Section 3 Color Summary
  const getColorName = (item) =>
    ppiGetString(item, ["Color", "Colour", "Fab Color", "color", "colour"]);
  const colorMap = new Map();
  [kItems, dItems, delItems].forEach((items) => {
    items.forEach((item) => {
      const col = getColorName(item);
      if (!col) return;
      const key = col.toLowerCase().replace(/\s+/g, " ");
      if (!colorMap.has(key)) colorMap.set(key, col);
    });
  });

  const colors = Array.from(colorMap.entries()).map(([key, label], idx) => ({
    key,
    label: label || `Col-${idx + 1}`,
  }));

  const metrics = [
    {
      label: "Allowance %",
      isPercent: true,
      isAvg: true,
      getValue: (agg) =>
        agg.allowances.length
          ? agg.allowances.reduce((a, b) => a + b, 0) / agg.allowances.length
          : 0,
    },
    { label: "Allocated Qty", getValue: (agg) => agg.allocQty },
    { label: "Yarn bala.", getValue: (agg) => agg.yarnBal },
    { label: "Knit Prod.", getValue: (agg) => agg.knitProd },
    { label: "Knit. Bala.", getValue: (agg) => agg.knitBal },
    { label: "Dyeing ok", getValue: (agg) => agg.dyeOk },
    { label: "Dyeing Bal.", getValue: (agg) => agg.dyeBal },
    { label: "Booking qty", getValue: (agg) => agg.bookingQty },
    { label: "Received Qty.", getValue: (agg) => agg.receivedQty },
    { label: "Delivered Qty", getValue: (agg) => agg.deliveredQty },
    { label: "Deli. Bala.", getValue: (agg) => agg.deliBal },
    { label: "RFD", getValue: (agg) => agg.rfd },
    { label: "Slow moving", getValue: (agg) => agg.slowMoving },
  ];

  sheetData.push([]);
  sheetData.push(["Details Booking Summary (Color-Wise)"]);
  sheetData.push(["Color", ...metrics.map((m) => m.label)]);

  const colorAggs = {};
  colors.forEach((col) => {
    colorAggs[col.key] = {
      allowances: [],
      allocQty: 0,
      yarnBal: 0,
      knitProd: 0,
      knitBal: 0,
      dyeOk: 0,
      dyeBal: 0,
      bookingQty: 0,
      receivedQty: 0,
      deliveredQty: 0,
      deliBal: 0,
      rfd: 0,
      slowMoving: 0,
    };
  });

  kItems.forEach((item) => {
    const colName = getColorName(item);
    if (!colName) return;
    const agg = colorAggs[colName.toLowerCase().replace(/\s+/g, " ")];
    if (!agg) return;
    const allow = ppiGetNum(item, [
      "Allowance %",
      "Allowance",
      "Wastage %",
      "Wastage",
      "Allow %",
      "Allow",
    ]);
    if (allow > 0) agg.allowances.push(allow > 1 ? allow / 100 : allow);
    agg.allocQty += ppiGetNum(item, [
      "Allocated Qty",
      "Allocated Qty ",
      "AllocatedQty",
    ]);
    agg.yarnBal += ppiGetNum(item, ["Yarn bala.", "Yarn Bala", "YarnBala"]);
    agg.knitProd += ppiGetNum(item, ["Knit Prod.", "KnitProd"]);
    agg.knitBal += ppiGetNum(item, ["Knit. Bala.", "KnitBala"]);
  });

  dItems.forEach((item) => {
    const colName = getColorName(item);
    if (!colName) return;
    const agg = colorAggs[colName.toLowerCase().replace(/\s+/g, " ")];
    if (!agg) return;
    agg.dyeOk += ppiGetNum(item, [
      "Dyeing ok",
      "Dyeing Prod.",
      "DyeingProd",
      "BP Qty",
      "BPQty",
    ]);
    agg.dyeBal += ppiGetNum(item, [
      "Dyeing Bal.",
      "Dyeing Bala.",
      "DyeingBala",
    ]);
  });

  delItems.forEach((item) => {
    const colName = getColorName(item);
    if (!colName) return;
    const agg = colorAggs[colName.toLowerCase().replace(/\s+/g, " ")];
    if (!agg) return;
    agg.bookingQty += ppiGetNum(item, ["RequiredQtyKgs", "Booking qty"]);
    agg.receivedQty += ppiGetNum(item, ["NetReceivedQtyKgs", "Received Qty"]);
    agg.deliveredQty += ppiGetNum(item, ["NetDeliveryQtyKgs", "Delivered Qty"]);
    agg.deliBal += ppiGetNum(item, ["Deli. Bal.", "Deli. Bala."]);
    agg.rfd += ppiGetNum(item, ["RFD"]);
    agg.slowMoving += ppiGetNum(item, ["Slowmoving"]);
  });

  colors.forEach((col) => {
    const agg = colorAggs[col.key] || {};
    const rowVals = metrics.map((m) => {
      const v = m.getValue(agg);
      return m.isPercent ? `${(v * 100).toFixed(0)}%` : Math.round(v);
    });
    sheetData.push([col.label, ...rowVals]);
  });

  const totalRow = metrics.map((m) => {
    const vals = colors.map((col) => m.getValue(colorAggs[col.key]));
    const total = m.isAvg
      ? vals.filter((v) => v > 0).length
        ? vals.reduce((a, b) => a + b, 0) / vals.filter((v) => v > 0).length
        : 0
      : vals.reduce((a, b) => a + b, 0);
    return m.isPercent ? `${(total * 100).toFixed(0)}%` : Math.round(total);
  });
  sheetData.push(["Total", ...totalRow]);

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws["!cols"] = [{ wch: 18 }, ...metrics.map(() => ({ wch: 14 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planning_Production_Info");
  XLSX.writeFile(wb, `Planning_Production_Info_${o.orderNo}.xlsx`);
  if (typeof showToast === "function")
    showToast("Excel downloaded successfully!");
}

// ==========================================
// ZOOM & SCREEN FIT SYSTEM
// ==========================================
let reportZoom = 1;
let reportAutoFit = false;

function resetToolbarFitPosition() {
  const toolbar = document.getElementById("reportActionToolbar");
  if (toolbar) {
    toolbar.style.paddingRight = "";
  }
}

function alignFitToolbarToReport() {
  const toolbar = document.getElementById("reportActionToolbar");
  const viewport = document.getElementById("reportViewport");
  if (!toolbar || !viewport) return;

  const scrollbarWidth = viewport.offsetWidth - viewport.clientWidth;
  if (scrollbarWidth > 0) {
    toolbar.style.paddingRight = `${scrollbarWidth + 16}px`;
  } else {
    toolbar.style.paddingRight = "16px";
  }
}

function setReportZoom(value, fitted = false) {
  const clamped = Math.min(1.5, Math.max(0.3, Math.round(value * 100) / 100));
  reportZoom = clamped;
  reportAutoFit = fitted;

  const sheet = document.getElementById("reportSheet");
  const zoomLabel = document.getElementById("reportZoomLabel");
  const fitBtn = document.getElementById("fitScreenBtn");

  if (sheet) {
    sheet.style.transformOrigin = "top left";
    sheet.style.transform = `scale(${reportZoom})`;

    const unscaledWidth = sheet.offsetWidth || 1152;
    if (reportZoom < 1) {
      sheet.style.marginBottom = `-${(1 - reportZoom) * (sheet.offsetHeight || 600)}px`;
      sheet.style.marginRight = `-${(1 - reportZoom) * unscaledWidth}px`;
    } else {
      sheet.style.marginBottom = "0px";
      sheet.style.marginRight = "0px";
    }
  }

  if (zoomLabel) {
    zoomLabel.innerText = `${Math.round(reportZoom * 100)}%`;
  }

  if (fitBtn) {
    if (fitted) {
      fitBtn.classList.remove("bg-blue-600", "hover:bg-blue-700");
      fitBtn.classList.add(
        "bg-indigo-600",
        "hover:bg-indigo-700",
        "ring-2",
        "ring-indigo-300",
      );
    } else {
      fitBtn.classList.remove(
        "bg-indigo-600",
        "hover:bg-indigo-700",
        "ring-2",
        "ring-indigo-300",
      );
      fitBtn.classList.add("bg-blue-600", "hover:bg-blue-700");
    }
  }

  alignFitToolbarToReport();
}

function fitReportToScreen() {
  const viewport = document.getElementById("reportViewport");
  const sheet = document.getElementById("reportSheet");
  if (!viewport || !sheet) return;

  const availableWidth = viewport.clientWidth - 32;
  const originalWidth = sheet.scrollWidth || sheet.offsetWidth || 1152;

  if (availableWidth > 0 && originalWidth > 0) {
    const targetScale = Math.min(1.0, availableWidth / originalWidth);
    setReportZoom(targetScale, true);
  }
}

function changeReportZoom(delta) {
  setReportZoom(reportZoom + delta, false);
}

function resetReportZoom() {
  setReportZoom(1.0, false);
}

window.addEventListener("resize", () => {
  if (reportAutoFit) {
    const detailedView = document.getElementById("ppiDetailedView");
    if (detailedView && !detailedView.classList.contains("hidden")) {
      requestAnimationFrame(fitReportToScreen);
    }
  }
});

// ==========================================
// DYNAMIC A4 LANDSCAPE PRINT ENGINE
// ==========================================

function getPrintUsername() {
  const displayEl = document.getElementById("displayUsername");
  if (displayEl) {
    const txt = displayEl.innerText.trim();
    if (txt && txt !== "Loading..." && txt !== "-") {
      return txt;
    }
  }
  const u = localStorage.getItem("username");
  const r = localStorage.getItem("role");
  if (u && r) return `${u} (${r})`;
  if (u) return u;
  return "System User";
}

function formatPrintDateTime(d = new Date()) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = String(d.getDate()).padStart(2, "0");
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, "0");

  return `${day}-${month}-${year} ${strHours}:${minutes}:${seconds} ${ampm}`;
}

function stripPrintCloneIds(root) {
  if (!root) return;
  if (root.removeAttribute) {
    root.removeAttribute("id");
  }
  const elementsWithId = root.querySelectorAll
    ? root.querySelectorAll("[id]")
    : [];
  elementsWithId.forEach((el) => el.removeAttribute("id"));
}

function createPrintPage(printedAt, username, bookingTitle) {
  const page = document.createElement("div");
  page.className = "print-page";

  const inner = document.createElement("div");
  inner.className = "print-page-inner";

  const titleDiv = document.createElement("div");
  titleDiv.className = "print-report-title";
  titleDiv.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;">
      <i class="fas fa-file-contract text-blue-600"></i>
      <span style="font-size:11pt;font-weight:800;color:#0f172a;">Detailed Planning & Production Info</span>
    </div>
    <div style="font-size:9pt;font-weight:700;color:#1e40af;font-family:monospace;">${bookingTitle || ""}</div>
  `;
  inner.appendChild(titleDiv);

  const contentDiv = document.createElement("div");
  contentDiv.className = "print-content";
  inner.appendChild(contentDiv);

  page.appendChild(inner);

  const footerDiv = document.createElement("div");
  footerDiv.className = "print-footer";
  footerDiv.innerHTML = `
    <div class="print-footer-left">
      <div>Printed Date &amp; Time: ${printedAt}</div>
      <div>Print by: ${username}</div>
    </div>
    <div class="print-footer-center">This is the PMC internal ERP System Generated Report</div>
    <div class="print-footer-right print-page-number"></div>
  `;
  page.appendChild(footerDiv);

  return page;
}

function createSummaryPrintShell(
  theadHtml,
  colorCountText,
  isContinuation = false,
) {
  const section = document.createElement("section");
  section.className = "w-full";

  const header = document.createElement("div");
  header.className =
    "bg-[#b45309] text-white px-3 py-1.5 rounded-t font-black text-xs uppercase flex items-center justify-between";
  header.innerHTML = `
    <span><i class="fas fa-layer-group mr-1.5"></i> Details Booking Summary (Color-Wise)${isContinuation ? " - Continued" : ""}</span>
    <span class="text-[10px] font-semibold bg-white/20 px-2 py-0.5 rounded">${colorCountText || ""}</span>
  `;
  section.appendChild(header);

  const tableWrap = document.createElement("div");
  tableWrap.className =
    "overflow-hidden border border-t-0 border-slate-300 rounded-b";

  const table = document.createElement("table");
  table.className = "w-full text-xs border-collapse";

  const thead = document.createElement("thead");
  thead.className =
    "bg-amber-100 text-amber-950 font-bold border-b border-slate-300";
  thead.innerHTML = theadHtml || "";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  tbody.className = "divide-y divide-slate-200";
  table.appendChild(tbody);

  tableWrap.appendChild(table);
  section.appendChild(tableWrap);

  return { section, tbody };
}

function printContentOverflows(page) {
  return page.scrollHeight > page.clientHeight + 2;
}

function buildPrintPages() {
  const container = document.getElementById("printPagesContainer");
  if (!container) return;
  container.innerHTML = "";

  const specSec = document.getElementById("bookingSpecSection");
  const planSec = document.getElementById("bookingPlanSection");
  const summaryThead = document.getElementById("ppiSummaryThead");
  const summaryTbody = document.getElementById("ppiSummaryTbody");
  const badgeBookingNo = document.getElementById("ppiBadgeBookingNo");
  const badgeColorCount = document.getElementById("ppiBadgeColorCount");

  const bookingTitle = badgeBookingNo ? badgeBookingNo.innerText.trim() : "";
  const colorCountText = badgeColorCount
    ? badgeColorCount.innerText.trim()
    : "";
  const printedAt = formatPrintDateTime();
  const username = getPrintUsername();

  // Temporarily position container for off-screen measurement
  container.style.position = "fixed";
  container.style.left = "-20000px";
  container.style.top = "0";
  container.style.width = "287mm";
  container.style.display = "block";
  container.style.visibility = "hidden";
  container.style.zIndex = "-9999";

  // Create Page 1
  let currentPage = createPrintPage(printedAt, username, bookingTitle);
  container.appendChild(currentPage);
  let currentContent = currentPage.querySelector(".print-content");

  // Append Section 1: Booking Specification
  if (specSec) {
    const cloneSpec = specSec.cloneNode(true);
    stripPrintCloneIds(cloneSpec);
    currentContent.appendChild(cloneSpec);
  }

  // Append Section 2: Booking Planning
  if (planSec) {
    const clonePlan = planSec.cloneNode(true);
    stripPrintCloneIds(clonePlan);
    currentContent.appendChild(clonePlan);
  }

  // Summary Table: header and rows
  const theadHtml = summaryThead ? summaryThead.innerHTML : "";
  const allRows = summaryTbody
    ? Array.from(summaryTbody.querySelectorAll("tr"))
    : [];

  if (allRows.length > 0) {
    let summaryShell = createSummaryPrintShell(
      theadHtml,
      colorCountText,
      false,
    );
    currentContent.appendChild(summaryShell.section);

    let rowsInCurrentShell = 0;

    for (let i = 0; i < allRows.length; i++) {
      const origRow = allRows[i];
      const cloneRow = origRow.cloneNode(true);
      stripPrintCloneIds(cloneRow);
      summaryShell.tbody.appendChild(cloneRow);
      rowsInCurrentShell++;

      if (printContentOverflows(currentPage)) {
        if (rowsInCurrentShell > 1) {
          summaryShell.tbody.removeChild(cloneRow);
          i--;
        } else {
          currentContent.removeChild(summaryShell.section);
          i--;
        }

        currentPage = createPrintPage(printedAt, username, bookingTitle);
        container.appendChild(currentPage);
        currentContent = currentPage.querySelector(".print-content");

        summaryShell = createSummaryPrintShell(theadHtml, colorCountText, true);
        currentContent.appendChild(summaryShell.section);
        rowsInCurrentShell = 0;
      }
    }
  }

  // Stamp total page counts across all compiled pages
  const pages = container.querySelectorAll(".print-page");
  const totalPages = pages.length || 1;
  pages.forEach((page, idx) => {
    const pageNumEl = page.querySelector(".print-page-number");
    if (pageNumEl) {
      const curStr = String(idx + 1).padStart(2, "0");
      const totStr = String(totalPages).padStart(2, "0");
      pageNumEl.innerText = `Page ${curStr} out of ${totStr}`;
    }
  });

  // Restore container inline styles
  container.style.position = "";
  container.style.left = "";
  container.style.top = "";
  container.style.width = "";
  container.style.display = "";
  container.style.visibility = "";
  container.style.zIndex = "";
}

function clearPrintPages() {
  const container = document.getElementById("printPagesContainer");
  if (container) {
    container.innerHTML = "";
  }
}

function printReport() {
  buildPrintPages();
  window.print();
}

window.addEventListener("beforeprint", () => {
  const detailedView = document.getElementById("ppiDetailedView");
  if (detailedView && !detailedView.classList.contains("hidden")) {
    const container = document.getElementById("printPagesContainer");
    if (!container || container.children.length === 0) {
      buildPrintPages();
    }
  }
});

window.addEventListener("afterprint", () => {
  clearPrintPages();
});
