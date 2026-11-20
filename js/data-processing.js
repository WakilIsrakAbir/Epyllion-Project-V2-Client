// ==========================================================
// DATA PROCESSING: Fetch from paginated API (Approach A)
// ==========================================================

const API_BASE = "https://abir-backend-api.onrender.com";

// Called after mutations — triggers re-fetch on next navigation
function markDataDirty() {
  /* no-op with server-side approach */
}

function generateItemId(itemData, tabId) {
  if (!itemData) return Date.now().toString();
  const currentDept = tabId.replace("_report", "");
  let bNo = String(
    itemData.OrderNo !== undefined && itemData.OrderNo !== null
      ? itemData.OrderNo
      : "N/A",
  ).trim();
  let color = String(
    itemData.Color !== undefined && itemData.Color !== null
      ? itemData.Color
      : "N/A",
  ).trim();

  if (currentDept === "knitting" || currentDept === "delivery") {
    let fabConst = String(
      itemData.FabricConstruction !== undefined &&
        itemData.FabricConstruction !== null
        ? itemData.FabricConstruction
        : "N/A",
    ).trim();
    let gsm = String(
      itemData.GSM !== undefined && itemData.GSM !== null
        ? itemData.GSM
        : "N/A",
    ).trim();
    return `${bNo}_${color}_${fabConst}_${gsm}`
      .toLowerCase()
      .replace(/\s+/g, "");
  } else if (currentDept === "yd") {
    let type = String(
      itemData["Booking Type"] !== undefined &&
        itemData["Booking Type"] !== null
        ? itemData["Booking Type"]
        : "N/A",
    ).trim();
    let ydb = String(
      itemData.YDB !== undefined && itemData.YDB !== null
        ? itemData.YDB
        : "N/A",
    ).trim();
    return `${bNo}_${type}_${ydb}`.toLowerCase().replace(/\s+/g, "");
  } else {
    let procName = String(
      itemData.ProcessName !== undefined && itemData.ProcessName !== null
        ? itemData.ProcessName
        : (itemData["Process Name"] !== undefined && itemData["Process Name"] !== null
          ? itemData["Process Name"]
          : "")
    ).trim();
    if (procName.toLowerCase() === "n/a" || procName === "-") procName = "";
    return `${bNo}_${color}_${procName}`.toLowerCase().replace(/\s+/g, "");
  }
}

function activateMainTab(tabName) {
  activeMainTab = tabName;
  const tabs = ["Pending", "Confirm", "Tentative", "All"];
  tabs.forEach((t) => {
    const btn = document.getElementById("btn" + t);
    if (btn) {
      if (t === tabName)
        btn.className =
          "bg-[#313644] text-white px-3 sm:px-6 py-1.5 sm:py-2 font-bold rounded-sm cursor-pointer shadow-sm uppercase tracking-wide transition-colors text-[10px] sm:text-[13px] flex-1 sm:flex-none text-center";
      else
        btn.className =
          "bg-white text-gray-800 border border-gray-300 px-3 sm:px-6 py-1.5 sm:py-2 font-bold rounded-sm cursor-pointer shadow-sm hover:bg-gray-50 uppercase tracking-wide transition-colors text-[10px] sm:text-[13px] flex-1 sm:flex-none text-center";
    }
  });
  activeBuyer = "";
  document
    .querySelectorAll(".buyer-tab")
    .forEach((t) => t.classList.remove("active"));
  currentPage = 1;
  // Fetch from server with new status filter
  fetchAndProcessData();
}

async function searchGlobalBooking() {
  const searchVal = document.getElementById("globalBookingSearch").value.trim();
  if (!searchVal) {
    showToast("Please enter a Booking No. to search");
    return;
  }

  const currentDept = activeTabId.replace("_report", "");

  // Search across all statuses to find the order
  const statuses = ["Pending", "Confirm", "Tentative", "Completed"];
  let foundOrder = null;
  let foundStatus = "";

  for (const status of statuses) {
    try {
      const res = await fetch(
        `${API_BASE}/api/orders?dept=${currentDept}&status=${status}&search=${encodeURIComponent(searchVal)}&exact=true&limit=1`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.orders && data.orders.length > 0) {
          foundOrder = data.orders[0];
          foundStatus = status;
          break;
        }
      }
    } catch (e) {}
  }

  if (!foundOrder) {
    showToast(`Booking "${searchVal}" not found in this department!`);
    return;
  }

  // Switch to the correct tab
  activeMainTab = foundStatus === "Completed" ? "All" : foundStatus;
  const tabs = ["Pending", "Confirm", "Tentative", "All"];
  tabs.forEach((t) => {
    const btn = document.getElementById("btn" + t);
    if (btn) {
      if (t === activeMainTab)
        btn.className =
          "bg-[#313644] text-white px-3 sm:px-6 py-1.5 sm:py-2 font-bold rounded-sm cursor-pointer shadow-sm uppercase tracking-wide transition-colors text-[10px] sm:text-[13px] flex-1 sm:flex-none text-center";
      else
        btn.className =
          "bg-white text-gray-800 border border-gray-300 px-3 sm:px-6 py-1.5 sm:py-2 font-bold rounded-sm cursor-pointer shadow-sm hover:bg-gray-50 uppercase tracking-wide transition-colors text-[10px] sm:text-[13px] flex-1 sm:flex-none text-center";
    }
  });

  activeBuyer = foundOrder.buyer || "";
  currentPage = 1;

  // Fetch page with search to highlight
  const searchParams = new URLSearchParams({
    dept: currentDept,
    status: foundStatus,
    page: "1",
    limit: String(rowsPerPage),
    search: searchVal,
    exact: "true",
  });

  const listRes = await fetch(`${API_BASE}/api/orders?${searchParams}`).catch(
    () => null,
  );
  if (listRes && listRes.ok) {
    const listData = await listRes.json();
    renderBuyerTabs(listData.buyers || []);
    renderMainTableFromAPI(listData, foundStatus);

    // Highlight the found row
    setTimeout(() => {
      const rows = document.querySelectorAll("#mainTableBody tr");
      rows.forEach((row) => {
        const bookingCell = row.querySelector("td:nth-child(2)");
        if (
          bookingCell &&
          bookingCell.innerText.trim().toLowerCase() === searchVal.toLowerCase()
        ) {
          row.style.backgroundColor = "#fef08a";
          row.style.transition = "background-color 0.3s";
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => {
            row.style.backgroundColor = "";
          }, 4000);
        }
      });
      showToast(`Found "${foundOrder.orderNo}" in ${foundStatus} list!`);
    }, 200);
  }
}

function clearGlobalSearch() {
  document.getElementById("globalBookingSearch").value = "";
  activateMainTab("Pending");
  showToast("Search cleared. Showing Pending List.");
}

// ==========================================================
// MAIN DATA FETCH: Now uses paginated /api/orders endpoint
// No more Excel download/parse! Server returns ready data.
// ==========================================================
async function fetchAndProcessData(isSilent = false) {
  const currentDept = activeTabId.replace("_report", "");

  if (!isSilent) {
    document.getElementById("loadingData").classList.remove("hidden");
  }

  try {
    if (isReportMode) {
      await fetchReportData(currentDept);
    } else {
      await fetchOrderList(currentDept);
    }
  } catch (e) {
    console.error("Error processing data:", e);
  }

  document.getElementById("loadingData").classList.add("hidden");
}

// Fetch paginated order list for Order Management view
async function fetchOrderList(currentDept) {
  const status = activeMainTab === "All" ? "Completed" : activeMainTab;
  const searchParams = new URLSearchParams({
    dept: currentDept,
    status: status,
    page: currentPage,
    limit: rowsPerPage,
  });
  if (activeBuyer) searchParams.set("buyer", activeBuyer);

  // Single API call — returns orders + buyers for current status
  const ordersRes = await fetch(`${API_BASE}/api/orders?${searchParams}`).catch(
    (e) => null,
  );

  let ordersData = { orders: [], total: 0, page: 1, totalPages: 0, buyers: [] };
  if (ordersRes && ordersRes.ok) {
    ordersData = await ordersRes.json();
  }

  let allBuyers = ordersData.buyers || [];

  // Apply buyer permissions
  let userPerms = null;
  try {
    userPerms = JSON.parse(localStorage.getItem("permissions"));
  } catch (e) {}
  if (userPerms && userPerms.buyers && userPerms.buyers.accessType !== "all") {
    const ids = userPerms.buyers.buyerIds || [];
    allBuyers = allBuyers.filter((b) => {
      const id = String(b)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      return ids.includes(id);
    });
  }

  // Cache department buyers so selecting a buyer never hides the other buyer tabs
  if (!window.deptBuyersCache) window.deptBuyersCache = {};
  if (allBuyers.length > 0) {
    if (!window.deptBuyersCache[currentDept] || !activeBuyer) {
      window.deptBuyersCache[currentDept] = allBuyers;
    }
  }
  const buyersToRender =
    window.deptBuyersCache[currentDept] && window.deptBuyersCache[currentDept].length > 0
      ? window.deptBuyersCache[currentDept]
      : allBuyers;

  // Build groupedData compatible structure for renderMainTable
  groupedData = {};
  ordersData.orders.forEach((order) => {
    groupedData[order.orderNo] = {
      bookingNo: order.orderNo,
      buyers: new Set([order.buyer || "N/A"]),
      bookingDate: order.bookingDate
        ? formatDateDisplay(order.bookingDate)
        : "N/A",
      status: order.status || "N/A",
      generalInfo: {
        OrderStatus: status === "Completed" ? "Completed" : "On Process",
      },
      mergedItems: [{ planType: status }], // Stub so filtering works
      isPending: status === "Pending",
      isConfirm: status === "Confirm",
      isTentative: status === "Tentative",
    };
  });

  // Render buyer tabs (always keep all buyer tabs visible)
  renderBuyerTabs(buyersToRender);

  // Render table with server-side pagination info
  renderMainTableFromAPI(ordersData, status);
}

// Render main table from API response (server-side pagination)
function renderMainTableFromAPI(data, status) {
  const tbody = document.getElementById("mainTableBody");
  const emptyState = document.getElementById("emptyState");
  const dataTableWrapper = document.getElementById("dataTableContentWrapper");
  const paginationControls = document.getElementById("paginationControls");
  const thead = document.querySelector("#dataTableContent thead");
  const buyerFilterContainer = document.getElementById("buyerFilterContainer");

  if (status === "Completed") {
    buyerFilterContainer.classList.add("hidden");
    dataTableWrapper.classList.remove("hidden");
    emptyState.classList.add("hidden");

    if (data.orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-gray-500 font-medium">No completed orders found.</td></tr>`;
      paginationControls.classList.add("hidden");
      return;
    }

    if (thead.dataset.currentTab !== "All") {
      thead.innerHTML = `
            <tr class="bg-gray-800 text-white text-[11px] font-bold border-b border-gray-700">
                <th class="p-2 border-r border-gray-700 text-center w-[120px]">
                    <button onclick="downloadCompletedList()" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded shadow text-[10px]"><i class="fas fa-file-excel mr-1"></i> EXCEL</button>
                </th>
                <th class="p-2 border-r border-gray-700">Order/Booking No.</th>
                <th class="p-2 border-r border-gray-700 text-center">Completed Date</th>
                <th class="p-2">Buyer</th>
            </tr>
            <tr class="bg-white border-b border-gray-300">
                <th class="p-1 border-r border-gray-300 bg-white"></th>
                <th class="p-1 border-r border-gray-300 bg-white"><input type="text" class="header-search" oninput="filterByColumn(1, this.value)" placeholder="Search No..."></th>
                <th class="p-1 border-r border-gray-300 bg-white"><input type="text" class="header-search" oninput="filterByColumn('compDate', this.value)" placeholder="Search Date..."></th>
                <th class="p-1 border-r border-gray-300 bg-white"><input type="text" class="header-search" oninput="filterByColumn(3, this.value)" placeholder="Search Buyer..."></th>
            </tr>`;
      thead.dataset.currentTab = "All";
    }

    let html = "";
    data.orders.forEach((o) => {
      html += `
            <tr class="hover:bg-gray-50 border-b border-gray-200 bg-white transition-colors">
                <td class="p-2 border-r border-gray-200 text-center">
                    <button onclick="openDetailedView('${encodeURIComponent(o.orderNo)}')" class="bg-blue-100 text-blue-600 px-3 py-1 rounded hover:bg-blue-600 hover:text-white transition shadow-sm" title="View/Edit"><i class="fas fa-eye"></i></button>
                </td>
                <td class="p-2 border-r border-gray-200 text-gray-800 font-bold">${o.orderNo}</td>
                <td class="p-2 border-r border-gray-200 text-center text-gray-600 font-medium">${o.bookingDate ? formatDateDisplay(o.bookingDate) : "N/A"}</td>
                <td class="p-2 border-r border-gray-200 font-medium text-gray-600">${o.buyer || "N/A"}</td>
            </tr>`;
    });
    tbody.innerHTML = html;

    paginationControls.classList.remove("hidden");
    updatePaginationUI(
      (data.page - 1) * data.limit,
      Math.min(data.page * data.limit, data.total),
      data.total,
      data.totalPages,
    );
    return;
  }

  // Active list (Pending/Confirm/Tentative)
  if (thead.dataset.currentTab !== "Active") {
    thead.innerHTML = `
        <tr class="text-gray-700 text-[11px] font-bold border-b border-gray-300">
            <th class="p-2 border-r border-gray-300 text-center w-[50px] bg-tableHeader">Manage</th>
            <th class="p-2 border-r border-gray-300 bg-tableHeader">Order/Booking No.</th>
            <th class="p-2 border-r border-gray-300 text-center bg-tableHeader">Booking Date</th>
            <th class="p-2 border-r border-gray-300 bg-tableHeader text-blue-700">Buyer</th>
            <th class="p-2 border-r border-gray-300 bg-tableHeader w-[700px]">Status</th>
        </tr>
        <tr class="bg-white border-b border-gray-300">
            <th class="p-1 border-r border-gray-300 bg-white"></th>
            <th class="p-1 border-r border-gray-300 bg-white"><input type="text" class="header-search" oninput="filterByColumn(1, this.value)" placeholder="Search No..."></th>
            <th class="p-1 border-r border-gray-300 bg-white"><input type="text" class="header-search" oninput="filterByColumn(2, this.value)" placeholder="Search Date..."></th>
            <th class="p-1 border-r border-gray-300 bg-white"><input type="text" class="header-search" oninput="filterByColumn(3, this.value)" placeholder="Search Buyer..."></th>
            <th class="p-1 border-r border-gray-300 bg-white"><input type="text" class="header-search" oninput="filterByColumn(4, this.value)" placeholder="Search Status..."></th>
        </tr>`;
    thead.dataset.currentTab = "Active";
  }

  buyerFilterContainer.classList.remove("hidden");

  if (data.orders.length === 0) {
    dataTableWrapper.classList.remove("hidden");
    emptyState.classList.add("hidden");
    paginationControls.classList.add("hidden");
    tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-gray-500 bg-white border-b border-gray-200"><i class="fas fa-search text-3xl mb-3 text-gray-300 block"></i>No ${activeMainTab} data found.</td></tr>`;
    return;
  }

  dataTableWrapper.classList.remove("hidden");
  emptyState.classList.add("hidden");
  paginationControls.classList.remove("hidden");

  let html = "";
  data.orders.forEach((o) => {
    html += `
        <tr class="hover:bg-blue-50 border-b border-gray-200 transition-colors">
            <td class="p-2 border-r border-gray-200 text-center"><button onclick="openDetailedView('${encodeURIComponent(o.orderNo)}')" class="bg-blue-100 text-blue-600 px-3 py-1 rounded hover:bg-blue-600 hover:text-white transition shadow-sm"><i class="fas fa-eye"></i></button></td>
            <td class="p-2 border-r border-gray-200 text-blue-700 font-bold">${o.orderNo}</td>
            <td class="p-2 border-r border-gray-200 text-center">${o.bookingDate ? formatDateDisplay(o.bookingDate) : "N/A"}</td>
            <td class="p-2 border-r border-gray-200 font-medium text-gray-800">${o.buyer || "N/A"}</td>
            <td class="p-2 border-r border-gray-200 text-gray-600 font-medium">${o.status || "N/A"}</td>
        </tr>`;
  });
  tbody.innerHTML = html;

  updatePaginationUI(
    (data.page - 1) * data.limit,
    Math.min(data.page * data.limit, data.total),
    data.total,
    data.totalPages,
  );
}

// Report page: show the Updated (Confirm + Tentative) card and the Pending card for this department
async function fetchReportData(currentDept) {
  try {
    // Only check if data exists (fast count queries) — don't fetch full data
    const countOrders = async (status) => {
      const res = await fetch(
        `${API_BASE}/api/orders?dept=${currentDept}&status=${status}&limit=1`,
      );
      if (!res || !res.ok) return 0;
      const d = await res.json();
      return d.total || 0;
    };
    const [confirmCount, tentativeCount, pendingCount] = await Promise.all([
      countOrders("Confirm"),
      countOrders("Tentative"),
      countOrders("Pending"),
    ]);
    const hasConfirm = confirmCount > 0;
    const hasTentative = tentativeCount > 0;
    const hasPending = pendingCount > 0;

    const cardCombinedReport = document.getElementById("cardCombinedReport");
    const cardPendingReport = document.getElementById("cardPendingReport");
    const reportEmpty = document.getElementById("reportEmptyState");
    const cardsGrid = document.getElementById("reportCardsGrid");
    const titleEl = document.getElementById("combinedReportTitle");
    const btnTextEl = document.getElementById("combinedReportBtnText");
    const pendingTitleEl = document.getElementById("pendingReportTitle");
    const pendingCountEl = document.getElementById("pendingReportCount");

    if (titleEl)
      titleEl.innerText = `Updated ${currentDept.toUpperCase()} Report`;
    if (btnTextEl)
      btnTextEl.innerText = `Download ${currentDept.toUpperCase()} Data`;
    if (pendingTitleEl)
      pendingTitleEl.innerText = `Pending ${currentDept.toUpperCase()} Report`;
    if (pendingCountEl)
      pendingCountEl.innerText = `${pendingCount} pending order${pendingCount === 1 ? "" : "s"}`;

    // The Updated report of YD and Delivery also includes Pending orders
    const hasCombined = hasConfirm || hasTentative || (hasPending && (currentDept === "yd" || currentDept === "delivery"));
    const hasData = hasCombined || hasPending;

    if (cardCombinedReport)
      cardCombinedReport.style.display = hasCombined ? "flex" : "none";
    if (cardPendingReport)
      cardPendingReport.style.display = hasPending ? "flex" : "none";

    if (!hasData) {
      if (cardsGrid) cardsGrid.style.display = "none";
      if (reportEmpty) {
        reportEmpty.classList.remove("hidden");
        reportEmpty.style.display = "flex";
      }
    } else {
      if (cardsGrid) cardsGrid.style.display = "flex";
      if (reportEmpty) {
        reportEmpty.classList.add("hidden");
        reportEmpty.style.display = "none";
      }
    }
  } catch (e) {
    console.error("Report fetch error:", e);
  }
}

// Actually fetch full report data — called when download button is clicked
async function fetchFullReportDataForExport(currentDept) {
  try {
    const res = await fetch(`${API_BASE}/api/orders/report/${currentDept}`);
    if (!res || !res.ok) return;
    const data = await res.json();

    groupedData = {};
    if (data.orders) {
      data.orders.forEach((order) => {
        const planData = data.planMap[order.orderNo];
        const itemsField = `${currentDept}Items`;
        groupedData[order.orderNo] = {
          bookingNo: order.orderNo,
          buyers: new Set([order.buyer || "N/A"]),
          generalInfo: {},
          dbData: planData || null,
          mergedItems:
            planData && planData[currentDept] ? planData[currentDept] : [],
          isConfirm: true,
        };
      });
    }
  } catch (e) {
    console.error("Report fetch error:", e);
  }
}

// Updated report: Confirm + Tentative (YD and Delivery also Pending)
function exportCombinedReportToExcel() {
  const btn = window.event ? window.event.currentTarget : null;
  const dept = activeTabId.replace("_report", "").toUpperCase();
  return downloadDeptReportExcel(btn, "report-download", `${dept} Report`, "Updated");
}

// Pending report: only the department's Pending orders, same columns as the Updated report
function exportPendingReportToExcel() {
  const btn = window.event ? window.event.currentTarget : null;
  const dept = activeTabId.replace("_report", "").toUpperCase();
  return downloadDeptReportExcel(btn, "pending-download", `Pending ${dept} Report`, "Pending");
}

async function downloadDeptReportExcel(btn, endpoint, label, fileTag) {
  const currentDeptLower = activeTabId.replace("_report", "");

  // Show loading on the download button
  let btnText = "";
  if (btn) {
    btnText = btn.innerHTML;
    btn.innerHTML =
      '<i class="fas fa-spinner fa-spin mr-1"></i> Downloading...';
    btn.disabled = true;
    btn.style.opacity = "0.7";
  }
  showToast(`Downloading ${label}... Please wait.`);

  // Direct download from backend — server generates Excel file
  try {
    const res = await fetch(
      `${API_BASE}/api/orders/${endpoint}/${currentDeptLower}`,
    );
    if (!res.ok) {
      showToast(`No data found for ${label}!`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().split("T")[0];
    a.download = `${currentDeptLower.toUpperCase()}_${fileTag}_Report_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${label} downloaded!`);
  } catch (e) {
    console.error("Download error:", e);
    showToast("Download failed. Try again.");
  } finally {
    if (btn) {
      btn.innerHTML = btnText;
      btn.disabled = false;
      btn.style.opacity = "1";
    }
  }
}

function renderBuyerTabs(buyers) {
  const container = document.getElementById("buyerFilterContainer");
  container.innerHTML = "";
  buyers.forEach((b) => {
    const btn = document.createElement("div");
    btn.className = `buyer-tab ${activeBuyer !== "" && activeBuyer.toLowerCase() === b.toLowerCase() ? "active" : ""}`;
    btn.innerText = b;
    btn.onclick = () => activateBuyerFilter(b);
    container.appendChild(btn);
  });
}

function activateBuyerFilter(buyer) {
  if (activeBuyer && activeBuyer.toLowerCase() === buyer.toLowerCase()) {
    activeBuyer = ""; // Toggle off to show all buyers' data
  } else {
    activeBuyer = buyer;
  }
  document.querySelectorAll(".buyer-tab").forEach((t) => {
    if (activeBuyer && t.innerText.toLowerCase() === activeBuyer.toLowerCase())
      t.classList.add("active");
    else t.classList.remove("active");
  });
  currentPage = 1;
  fetchAndProcessData(true);
}

function filterByColumn(colIndex, val) {
  colFilters[colIndex] = String(val).toLowerCase().trim();
  currentPage = 1;
  // For server-side filtering, trigger a search via the search param
  // For now, use client-side filtering on the current page (search still works via API)
  fetchAndProcessData(true);
}
