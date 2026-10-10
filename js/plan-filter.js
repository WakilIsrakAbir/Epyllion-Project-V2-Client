// ==========================================================
// PLAN FILTER: Dynamic filtering for all plans
// ==========================================================

const pfConfigs = {
  knitting: {
    title: "Knitting Plan Filter",
    cols: [
      "OrderNo",
      "Buyer",
      "Color",
      "FabricConstruction",
      "GSM",
      "RequiredQtyKgs",
      "Allowance",
      "YarnReq",
      "AllocatedQty",
      "YarnBala",
      "GreyReq",
      "KnitProd",
      "KnitBala",
      "Plan Start Date",
      "Plan End Date",
      "Plan Type",
    ],
  },
  dyeing: {
    title: "Dyeing Plan Filter",
    cols: [
      "OrderNo",
      "Buyer",
      "Color",
      "Unit",
      "ProcessName",
      "RequiredQtyKgs",
      "Allowance",
      "YarnReq",
      "AllocatedQty",
      "YarnBala",
      "GreyReq",
      "KnitProd",
      "KnitBala",
      "BPQty",
      "DyeingProd",
      "DyeingBala",
      "NetReceivedQtyKgs",
      "NetDeliveryQtyKgs",
      "DeliBal",
      "RFD",
      "Slowmoving",
      "FFStock",
      "Plan Start Date",
      "Plan End Date",
      "Plan Type",
    ],
  },
  delivery: {
    title: "Delivery Plan Filter",
    cols: [
      "OrderNo",
      "Buyer",
      "Color",
      "FabricConstruction",
      "GSM",
      "RequiredQtyKgs",
      "Allowance",
      "YarnReq",
      "AllocatedQty",
      "YarnBala",
      "GreyReq",
      "KnitProd",
      "KnitBala",
      "BPQty",
      "DyeingProd",
      "DyeingBala",
      "NetReceivedQtyKgs",
      "NetDeliveryQtyKgs",
      "DeliBal",
      "RFD",
      "Slowmoving",
      "FFStock",
      "Plan Start Date",
      "Plan End Date",
      "Plan Type",
    ],
  },
  deliveryfloor: {
    title: "Delivery Plan (Floor) Filter",
    cols: [
      "OrderNo",
      "Buyer",
      "Color",
      "FabricConstruction",
      "GSM",
      "RequiredQtyKgs",
      "NetReceivedQtyKgs",
      "NetDeliveryQtyKgs",
      "DeliBal",
      "RFD",
      "Slowmoving",
      "FFStock",
      "Plan Start Date",
      "Plan End Date",
      "Plan Type",
    ],
  },
  yd: {
    title: "YD Plan Filter",
    cols: [
      "OrderNo",
      "Buyer",
      "Booking Type",
      "YDB",
      "YD Booking Date",
      "Barrier Qty.",
      "Workable Qty.",
      "YD REQ.",
      "DYED",
      "YD BALANCE",
      "YD Delivered",
      "YD DELIVERY BALANCE",
      "Plan Start Date",
      "Plan End Date",
      "Plan Type",
    ],
  },
};

let pfCurrentDept = "knitting";
let pfAllData = [];
let pfFilteredData = [];

function showPlanFilter(deptKey) {
  pfCurrentDept = deptKey;

  // Set Active Page State
  localStorage.setItem(
    "activePage",
    JSON.stringify({ page: "planFilter", dept: deptKey }),
  );

  // Hide all core views, including our new view
  if (typeof hideAllCoreViews === "function") {
    hideAllCoreViews();
  }

  // Ensure actual views are hidden
  document.getElementById("planFilterView").classList.remove("hidden");

  const uniqueId = `planFilter_${deptKey}`;
  activeTabId = uniqueId;
  const menuTitle = pfConfigs[deptKey].title;

  if (typeof openTabs !== "undefined") {
    if (!openTabs.find((tab) => tab.id === uniqueId)) {
      openTabs.push({
        id: uniqueId,
        title: menuTitle,
        dept: deptKey,
        mode: "planFilter",
      });
    }
    renderTabs();
  }

  document.getElementById("planFilterTitle").innerText = menuTitle;
  if (typeof setActiveSidebarMenu === "function") {
    setActiveSidebarMenu(`menu-${deptKey}-planfilter`);
  }

  // Set default dates (first day of current month to today)
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  const fmtDate = (d) => {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  };

  document.getElementById("pfFromDate").value = fmtDate(firstDay);
  document.getElementById("pfToDate").value = fmtDate(today);
  document.getElementById("pfToDate").min = fmtDate(firstDay);

  // Fetch data for the selected department
  fetchPlanFilterData(deptKey);
}

// Convert "2-Jul" to "2026-07-02" assuming current year
function parseShortDateToISO(dateStr) {
  if (!dateStr || dateStr === "-" || dateStr === "N/A") return "";
  const parts = dateStr.split("-");
  if (parts.length === 2) {
    const day = parseInt(parts[0], 10);
    const months = {
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11,
    };
    const month = months[parts[1].trim()];
    if (month !== undefined && !isNaN(day)) {
      const year = new Date().getFullYear();
      const dt = new Date(year, month, day);
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      return `${dt.getFullYear()}-${mm}-${dd}`;
    }
  }

  // Try standard parse
  const dt = new Date(dateStr);
  if (!isNaN(dt.getTime())) {
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${dt.getFullYear()}-${mm}-${dd}`;
  }
  return "";
}

async function fetchPlanFilterData(deptKey) {
  const loadingEl = document.getElementById("loadingData");
  if (loadingEl) loadingEl.classList.remove("hidden");

  pfAllData = [];
  document.getElementById("pfBuyerOptions").innerHTML = "";
  document.getElementById("pfBuyerAll").checked = true;
  updatePfBuyerLabel();

  try {
    const dbDeptKey = deptKey === "deliveryfloor" ? "delivery" : deptKey;
    const res = await fetch(
      `${API_BASE}/api/orders/tracking/${dbDeptKey}?all=true`,
    );
    if (!res.ok) {
      if (loadingEl) loadingEl.classList.add("hidden");
      return;
    }
    const data = await res.json();
    const { planDocs, orderMap } = data;
    const loadedTrackingOrderNos = new Set();

    planDocs.forEach((plan) => {
      const deptItems = plan[dbDeptKey];
      if (deptItems && Array.isArray(deptItems)) {
        deptItems.forEach((item) => {
          const planType =
            deptKey === "deliveryfloor" ? item.floorPlanType : item.planType;

          if (planType === "Confirm" || planType === "Tentative") {
            loadedTrackingOrderNos.add(plan.orderNo);
            const orderInfo = orderMap[plan.orderNo] || {};
            let displayBuyer = orderInfo.buyer || plan.buyer || "N/A";

            const src = { ...(item.itemData || {}), ...item };
            const row = {
              OrderNo: plan.orderNo,
              Buyer: displayBuyer,
              Color: getColData(src, ['Color', 'Colour', 'Fab Color']) || plan.color || "N/A",
              FabricConstruction: getColData(src, ['FabricConstruction', 'Construction', 'Fab Const', 'Fabric']),
              GSM: getColData(src, ['GSM', 'G.S.M']),
              RequiredQtyKgs: getColData(src, ['RequiredQtyKgs', 'Req Qty', 'Qty', 'Order Qty']),
              Allowance: getColData(src, ['Allowance %', 'Allowance', 'Wastage %', 'Wastage', 'Allow %', 'Allow']),
              YarnReq: getColData(src, ['Yarn req.', 'YarnReq', 'Yarn Req', 'Yarn Req.']),
              AllocatedQty: getColData(src, ['Allocated Qty', 'Allocated Qty ', 'AllocatedQty', 'Alloc Qty']),
              YarnBala: getColData(src, ['Yarn bala.', 'YarnBala', 'Yarn Bala', 'Yarn Balance']),
              GreyReq: getColData(src, ['Grey Req.', 'GreyReq', 'Grey Req']),
              KnitProd: getColData(src, ['Knit Prod.', 'KnitProd', 'Knit Prod', 'Knit Production']),
              KnitBala: getColData(src, ['Knit. Bala.', 'KnitBala', 'Knit Bala.', 'Knit Bala', 'Knit. Bal.']),
              Unit: getColData(src, ['Unit']),
              ProcessName: getColData(src, ['Process Name', 'ProcessName', 'Process']),
              BPQty: getColData(src, ['BP Qty', 'BPQty', 'BP_Qty']),
              DyeingProd: getColData(src, ['Dyeing Prod.', 'DyeingProd', 'Dyeing Prod', 'Dyeing ok', 'Dyeing Production']),
              DyeingBala: getColData(src, ['Dyeing Bala.', 'DyeingBala', 'Dyeing Bala', 'Dyeing Bal.']),
              NetReceivedQtyKgs: getColData(src, ['NetReceivedQtyKgs', 'NetReceivedQty', 'ReceivedQty']),
              NetDeliveryQtyKgs: getColData(src, ['NetDeliveryQtyKgs', 'NetDeliveryQty', 'DeliveryQty']),
              DeliBal: getColData(src, ['Deli. Bal.', 'Deli Bal.', 'DeliBal', 'Delivery Balance', 'Deli. Bala.']),
              RFD: getColData(src, ['RFD']),
              Slowmoving: getColData(src, ['Slowmoving', 'Slow Moving']),
              FFStock: getColData(src, ['FFStock', 'FF Stock', 'FF_Stock']),
              // YD fields
              'Booking Type': getColData(src, ['Booking Type', 'Type', 'YD Type']),
              YDB: getColData(src, ['YDB', 'YD B']),
              'YD Booking Date': getColData(src, ['YD Booking Date']),
              'Barrier Qty.': getColData(src, ['Barrier Qty.', 'Barrier Qty']),
              'Workable Qty.': getColData(src, ['Workable Qty.', 'Workable Qty']),
              'YD REQ.': getColData(src, ['YD REQ.', 'YD REQ', 'Requirement']),
              DYED: getColData(src, ['DYED', 'Dyed']),
              'YD BALANCE': getColData(src, ['YD BALANCE', 'YD Balance']),
              'YD Delivered': getColData(src, ['YD Delivered', 'Delivered']),
              'YD DELIVERY BALANCE': getColData(src, ['YD DELIVERY BALANCE', 'YD Balance_1', 'YD Delivery Balance']),
            };

            if (!row.DeliBal || Number(row.DeliBal) === 0) {
              const req = Number(row.RequiredQtyKgs) || 0;
              const del = Number(row.NetDeliveryQtyKgs) || 0;
              if (req > 0 && del > 0) row.DeliBal = req - del;
            }

            // Handle date mapping
            const sd =
              deptKey === "deliveryfloor"
                ? item.floorStartDate
                : item.startDate;
            const ed =
              deptKey === "deliveryfloor" ? item.floorEndDate : item.endDate;

            row["Plan Start Date"] = sd || "";
            row["Plan End Date"] = ed || "";
            row["Plan Type"] = planType;

            row._start = parseShortDateToISO(row["Plan Start Date"]);
            row._end = parseShortDateToISO(row["Plan End Date"]);

            pfAllData.push(row);
          }
        });
      }
    });

    // Also fetch Tentative orders from the orders collection
    try {
      const tentativeDeptKey = deptKey === "deliveryfloor" ? "delivery" : deptKey;
      const tentativeRes = await fetch(
        `${API_BASE}/api/orders?dept=${tentativeDeptKey}&status=Tentative&limit=10000&populateItems=true`,
      );
      if (tentativeRes.ok) {
        const tentativeData = await tentativeRes.json();
        if (tentativeData.orders) {
          tentativeData.orders.forEach((order) => {
            // Skip if we already loaded it from tracking
            if (loadedTrackingOrderNos.has(order.orderNo)) return;

            const items = order[`${tentativeDeptKey}Items`] || [];
            items.forEach((item) => {
              const planType = "Tentative";

              // Prevent duplicating items if they are already in tracking (tracking items will have 'startDate' etc.)
              // Tracking items are already added above.

              // Normalize item fields using getColData to match pfConfigs column names
              const row = {
                OrderNo: order.orderNo,
                Buyer: order.buyer || "N/A",
                Color: getColData(item, ['Color', 'Colour', 'Fab Color']) || "N/A",
                FabricConstruction: getColData(item, ['FabricConstruction', 'Construction', 'Fab Const', 'Fabric']),
                GSM: getColData(item, ['GSM', 'G.S.M']),
                RequiredQtyKgs: getColData(item, ['RequiredQtyKgs', 'Req Qty', 'Qty', 'Order Qty']),
                Allowance: getColData(item, ['Allowance %', 'Allowance', 'Wastage %', 'Wastage', 'Allow %', 'Allow']),
                YarnReq: getColData(item, ['Yarn req.', 'YarnReq', 'Yarn Req', 'Yarn Req.']),
                AllocatedQty: getColData(item, ['Allocated Qty', 'Allocated Qty ', 'AllocatedQty', 'Alloc Qty']),
                YarnBala: getColData(item, ['Yarn bala.', 'YarnBala', 'Yarn Bala', 'Yarn Balance']),
                GreyReq: getColData(item, ['Grey Req.', 'GreyReq', 'Grey Req']),
                KnitProd: getColData(item, ['Knit Prod.', 'KnitProd', 'Knit Prod', 'Knit Production']),
                KnitBala: getColData(item, ['Knit. Bala.', 'KnitBala', 'Knit Bala.', 'Knit Bala', 'Knit. Bal.']),
                Unit: getColData(item, ['Unit']),
                ProcessName: getColData(item, ['Process Name', 'ProcessName', 'Process']),
                BPQty: getColData(item, ['BP Qty', 'BPQty', 'BP_Qty']),
                DyeingProd: getColData(item, ['Dyeing Prod.', 'DyeingProd', 'Dyeing Prod', 'Dyeing ok', 'Dyeing Production']),
                DyeingBala: getColData(item, ['Dyeing Bala.', 'DyeingBala', 'Dyeing Bala', 'Dyeing Bal.']),
                NetReceivedQtyKgs: getColData(item, ['NetReceivedQtyKgs', 'NetReceivedQty', 'ReceivedQty']),
                NetDeliveryQtyKgs: getColData(item, ['NetDeliveryQtyKgs', 'NetDeliveryQty', 'DeliveryQty']),
                DeliBal: getColData(item, ['Deli. Bal.', 'Deli Bal.', 'DeliBal', 'Delivery Balance', 'Deli. Bala.']),
                RFD: getColData(item, ['RFD']),
                Slowmoving: getColData(item, ['Slowmoving', 'Slow Moving']),
                FFStock: getColData(item, ['FFStock', 'FF Stock', 'FF_Stock']),
                // YD fields
                'Booking Type': getColData(item, ['Booking Type', 'Type', 'YD Type']),
                YDB: getColData(item, ['YDB', 'YD B']),
                'YD Booking Date': getColData(item, ['YD Booking Date']),
                'Barrier Qty.': getColData(item, ['Barrier Qty.', 'Barrier Qty']),
                'Workable Qty.': getColData(item, ['Workable Qty.', 'Workable Qty']),
                'YD REQ.': getColData(item, ['YD REQ.', 'YD REQ', 'Requirement']),
                DYED: getColData(item, ['DYED', 'Dyed']),
                'YD BALANCE': getColData(item, ['YD BALANCE', 'YD Balance']),
                'YD Delivered': getColData(item, ['YD Delivered', 'Delivered']),
                'YD DELIVERY BALANCE': getColData(item, ['YD DELIVERY BALANCE', 'YD Balance_1', 'YD Delivery Balance']),
              };

              if (!row.DeliBal || Number(row.DeliBal) === 0) {
                const req = Number(row.RequiredQtyKgs) || 0;
                const del = Number(row.NetDeliveryQtyKgs) || 0;
                if (req > 0 && del > 0) row.DeliBal = req - del;
              }

              // Map order-level dates if item doesn't have them
              let sd = "";
              let ed = "";
              if (deptKey === "knitting") {
                sd = order.knitStart;
                ed = order.knitEnd;
              } else if (deptKey === "dyeing") {
                sd = order.dyeStart;
                ed = order.dyeEnd;
              } else if (
                deptKey === "delivery" ||
                deptKey === "deliveryfloor"
              ) {
                sd = order.deliStart;
                ed = order.deliEnd;
              } else if (deptKey === "yd") {
                sd = order.ydStart;
                ed = order.ydEnd;
              }

              row["Plan Start Date"] = sd || "";
              row["Plan End Date"] = ed || "";
              row["Plan Type"] = planType;

              row._start = parseShortDateToISO(row["Plan Start Date"]);
              row._end = parseShortDateToISO(row["Plan End Date"]);

              // Only add if it has some dates to be filtered by
              pfAllData.push(row);
            });
          });
        }
      }
    } catch (e) {
      console.error("Error fetching tentative orders", e);
    }

    // Fetch buyers list from API to ensure we have all active buyers from uploaded files
    try {
      const pRes = await fetch(
        `${API_BASE}/api/orders?dept=${deptKey}&status=Pending&limit=1`,
      );
      const cRes = await fetch(
        `${API_BASE}/api/orders?dept=${deptKey}&status=Confirm&limit=1`,
      );
      const tRes = await fetch(
        `${API_BASE}/api/orders?dept=${deptKey}&status=Tentative&limit=1`,
      );

      let allApiBuyers = [];
      if (pRes.ok) allApiBuyers.push(...((await pRes.json()).buyers || []));
      if (cRes.ok) allApiBuyers.push(...((await cRes.json()).buyers || []));
      if (tRes.ok) allApiBuyers.push(...((await tRes.json()).buyers || []));

      // combine with buyers already in the local data
      pfAllData.forEach((r) => {
        if (r.Buyer) allApiBuyers.push(r.Buyer.trim().toUpperCase());
      });

      // set unique and sort
      window._pfAllBuyers = [
        ...new Set(
          allApiBuyers
            .map((b) => (typeof b === "string" ? b.trim().toUpperCase() : b))
            .filter(Boolean),
        ),
      ].sort();
    } catch (e) {
      console.error("Failed to fetch API buyers", e);
      window._pfAllBuyers = [
        ...new Set(
          pfAllData
            .map((r) => (r.Buyer ? r.Buyer.trim().toUpperCase() : ""))
            .filter(Boolean),
        ),
      ].sort();
    }

    populatePfBuyers();
  } catch (e) {
    console.error("Error fetching plan filter data:", e);
  }

  if (loadingEl) loadingEl.classList.add("hidden");
}

function pfSelectedBuyers() {
  if (document.getElementById("pfBuyerAll").checked) return [];
  return [...document.querySelectorAll(".pf-buyer-choice:checked")].map(
    (x) => x.value,
  );
}

function updatePfBuyerLabel() {
  const s = pfSelectedBuyers();
  const el = document.getElementById("pfBuyerLabel");
  el.textContent = !s.length
    ? "All Buyers"
    : s.length <= 2
      ? s.join(", ")
      : `${s.length} Buyers Selected`;
  el.title = s.length ? s.join(", ") : "All Buyers";
}

function populatePfBuyers() {
  const buyers =
    window._pfAllBuyers ||
    [
      ...new Set(
        pfAllData
          .map((r) => (r.Buyer ? r.Buyer.trim().toUpperCase() : ""))
          .filter(Boolean),
      ),
    ].sort();

  // Apply role-based filtering for buyers if user has restricted buyers
  let allowedBuyers = null;
  try {
    const perms = JSON.parse(localStorage.getItem("permissions"));
    if (perms && perms.buyers && perms.buyers.accessType !== "all") {
      allowedBuyers = (perms.buyers.buyerIds || []).map((b) =>
        String(b)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ""),
      );
    }
  } catch (e) {}

  let filteredBuyers = buyers;
  if (allowedBuyers) {
    filteredBuyers = buyers.filter((b) =>
      allowedBuyers.includes(
        String(b)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ""),
      ),
    );
  }

  document.getElementById("pfBuyerAll").checked = true;
  document.getElementById("pfBuyerOptions").innerHTML = filteredBuyers
    .map((b) => {
      const escaped = String(b ?? "").replace(
        /[&<>"']/g,
        (m) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
          })[m],
      );
      return `<label class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-gray-700">
            <input class="pf-buyer-choice" type="checkbox" value="${escaped}"><span>${escaped}</span>
        </label>`;
    })
    .join("");

  document.querySelectorAll(".pf-buyer-choice").forEach((cb) => {
    cb.onchange = () => {
      const picked = [...document.querySelectorAll(".pf-buyer-choice:checked")];
      document.getElementById("pfBuyerAll").checked = !picked.length;
      updatePfBuyerLabel();
    };
  });
  updatePfBuyerLabel();
}

function previewPlanFilter() {
  const f = document.getElementById("pfFromDate").value;
  const t = document.getElementById("pfToDate").value;
  const type = document.getElementById("pfDateType").value;
  const buyers = new Set(pfSelectedBuyers());

  if (!f || !t) {
    if (typeof showToast === "function")
      showToast("Please select both From and To dates.");
    else alert("Please select both From and To dates.");
    return;
  }

  pfFilteredData = pfAllData.filter((r) => {
    const dt = type === "start" ? r._start : r._end;
    const buyerNorm = r.Buyer ? r.Buyer.trim().toUpperCase() : "";
    return dt && dt >= f && dt <= t && (!buyers.size || buyers.has(buyerNorm));
  });

  if (!pfFilteredData.length) {
    if (typeof showToast === "function")
      showToast("No matching plan data found for the selected criteria.");
    else alert("No matching plan data found.");
    return;
  }

  const cols = pfConfigs[pfCurrentDept].cols;
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[m],
    );

  document.getElementById("pfModalTitle").textContent =
    pfConfigs[pfCurrentDept].title;

  const metaStr = `${type === "start" ? "Start Date" : "End Date"}: ${f} to ${t} | Buyer: ${[...buyers].join(", ") || "All Buyers"} | Rows: ${pfFilteredData.length}`;
  document.getElementById("pfModalMeta").textContent = metaStr;

  document.getElementById("pfThead").innerHTML =
    "<tr>" +
    cols
      .map(
        (c) =>
          `<th class="p-2 border border-gray-300 whitespace-nowrap text-center">${esc(c)}</th>`,
      )
      .join("") +
    "</tr>";
  document.getElementById("pfTbody").innerHTML = pfFilteredData
    .map(
      (r) =>
        "<tr>" +
        cols
          .map(
            (c) =>
              `<td class="p-2 border border-gray-300 text-center whitespace-nowrap">${esc(r[c])}</td>`,
          )
          .join("") +
        "</tr>",
    )
    .join("");

  document.getElementById("pfModal").classList.remove("hidden");
}

function closePlanFilterModal() {
  document.getElementById("pfModal").classList.add("hidden");
}

function exportPlanFilterExcel() {
  const cols = pfConfigs[pfCurrentDept].cols;
  const rows = pfFilteredData.map((r) =>
    Object.fromEntries(cols.map((c) => [c, r[c] ?? ""])),
  );

  const ws = XLSX.utils.json_to_sheet(rows, { header: cols });
  ws["!cols"] = cols.map((c) => ({
    wch: Math.max(12, Math.min(26, c.length + 3)),
  }));

  // Apply date formatting to Plan Start Date & Plan End Date columns
  formatExcelWorksheet(ws);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Plan Filter");
  XLSX.writeFile(wb, `${pfCurrentDept}_plan_filter_${Date.now()}.xlsx`);
}

// Setup Event Listeners for UI
document.addEventListener("DOMContentLoaded", () => {
  const buyerBtn = document.getElementById("pfBuyerBtn");
  const buyerDropdown = document.getElementById("pfBuyerDropdown");
  const buyerAll = document.getElementById("pfBuyerAll");

  if (buyerBtn) {
    buyerBtn.onclick = (e) => {
      e.stopPropagation();
      buyerDropdown.classList.toggle("hidden");
    };
  }

  if (buyerDropdown) {
    buyerDropdown.onclick = (e) => e.stopPropagation();
  }

  if (buyerAll) {
    buyerAll.onchange = (e) => {
      if (e.target.checked) {
        document
          .querySelectorAll(".pf-buyer-choice")
          .forEach((x) => (x.checked = false));
      } else if (!document.querySelector(".pf-buyer-choice:checked")) {
        e.target.checked = true;
      }
      updatePfBuyerLabel();
    };
  }

  document.addEventListener("click", () => {
    if (buyerDropdown && !buyerDropdown.classList.contains("hidden")) {
      buyerDropdown.classList.add("hidden");
    }
  });

  const pfFromDate = document.getElementById("pfFromDate");
  const pfToDate = document.getElementById("pfToDate");
  if (pfFromDate && pfToDate) {
    pfFromDate.addEventListener("change", (e) => {
      const minDate = e.target.value;
      pfToDate.min = minDate;
      if (pfToDate.value && pfToDate.value < minDate) {
        pfToDate.value = minDate;
      }
    });
  }
});
