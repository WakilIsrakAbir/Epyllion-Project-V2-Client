// ==========================================================
// LOAD CALCULATION: Reports & Summaries
// ==========================================================
// ==========================================
// LOAD CALCULATION LOGIC
// ==========================================
const LOAD_MONTH_COUNT = 5;
let activeMainMenu = 'detailed';
let activeDetailedDepartment = 'knitting';
let activeSummaryDepartment = 'knitting';

let globalLoadData = { knitting: [], dyeing: [], delivery: [], yd: [], deliveryfloor: [] };

const LOAD_REPORT_CONFIG = {
    knitting: {
        name: 'Knitting',
        pendingQtyField: 'KnitBala',
        columns: ['OrderNo', 'Color', 'FabricConstruction', 'GSM', 'Buyer', 'GreyReq', 'KnitProd', 'KnitBala']
    },
    dyeing: {
        name: 'Dyeing',
        pendingQtyField: 'DyeingBala',
        columns: ['OrderNo', 'Color', 'RequiredQtyKgs', 'Buyer', 'Unit', 'ProcessName', 'GreyReq', 'KnitProd', 'KnitBala', 'BPQty', 'DyeingProd', 'DyeingBala']
    },
    delivery: {
        name: 'Delivery',
        pendingQtyField: 'DeliBal',
        columns: ['OrderNo', 'Color', 'FabricConstruction', 'GSM', 'Buyer', 'RequiredQtyKgs', 'NetReceivedQtyKgs', 'NetDeliveryQtyKgs', 'DeliBal', 'RFD', 'Slowmoving']
    },
    yd: {
        name: 'YD',
        pendingQtyField: 'YD DELIVERY BALANCE',
        columns: ['OrderNo', 'Booking Type', 'YDB', 'Buyer', 'YD REQ.', 'DYED', 'YD BALANCE', 'YD Delivered', 'YD DELIVERY BALANCE']
    },
    deliveryfloor: {
        name: 'Delivery (Floor)',
        pendingQtyField: 'DeliBal',
        columns: ['OrderNo', 'Color', 'FabricConstruction', 'GSM', 'Buyer', 'RequiredQtyKgs', 'NetReceivedQtyKgs', 'NetDeliveryQtyKgs', 'DeliBal', 'RFD', 'Slowmoving']
    }
};

function showLoadCalculation(menuName) {
    localStorage.setItem('activePage', JSON.stringify({ page: 'loadCalculation', menu: menuName }));
    const uniqueId = `loadCalculation_${menuName}`;
    activeTabId = uniqueId;

    hideAllCoreViews();
    document.getElementById('loadCalculationView').classList.remove('hidden');
    
    activeMainMenu = menuName;

    const detailedMenu = document.getElementById('detailedMenu');
    const summaryMenu = document.getElementById('summaryMenu');
    const detailedButtons = document.getElementById('detailedButtons');
    const summaryButtons = document.getElementById('summaryButtons');

    detailedMenu.classList.toggle('hidden', menuName !== 'detailed');
    summaryMenu.classList.toggle('hidden', menuName !== 'summary');
    
    if (detailedButtons) detailedButtons.classList.toggle('hidden', menuName !== 'detailed');
    if (summaryButtons) summaryButtons.classList.toggle('hidden', menuName !== 'summary');

    const detailedLink = document.getElementById('menu-load-detailed');
    const summaryLink = document.getElementById('menu-load-summary');

    if(detailedLink) detailedLink.classList.toggle('active', menuName === 'detailed');
    if(summaryLink) summaryLink.classList.toggle('active', menuName === 'summary');

    const title = menuName === 'detailed' ? 'Detailed Load Download' : 'Buyer-wise Load Summary';
    const description = menuName === 'detailed' ? 'Download item-level Knitting, Dyeing and Delivery load reports.' : 'Download buyer-wise Knitting, Dyeing and Delivery load summaries.';

    const menuTitle = menuName === 'detailed' ? 'Detailed Load' : 'Load Summary';
    if (!openTabs.find(tab => tab.id === uniqueId)) openTabs.push({ id: uniqueId, title: menuTitle, dept: menuName, mode: 'loadCalculation' });
    renderTabs();

    if (document.getElementById('contentTabTitle')) document.getElementById('contentTabTitle').textContent = title;
    if (document.getElementById('pageMainTitle')) document.getElementById('pageMainTitle').textContent = title;
    if (document.getElementById('pageMainDescription')) document.getElementById('pageMainDescription').textContent = description;

    closeSidebarMobile();
    
    setActiveSidebarMenu(menuName === 'detailed' ? 'menu-load-detailed' : 'menu-load-summary');
    
    if (document.getElementById('loadStartMonth').options.length === 0) {
        initLoadMonthSelector();
    }
    
    if (menuName === 'summary') {
        const btnYd = document.getElementById('summaryBtnYd');
        const btnKnit = document.getElementById('summaryBtnKnitting');
        const btnDye = document.getElementById('summaryBtnDyeing');
        const btnDeli = document.getElementById('summaryBtnDelivery');
        const btnFloor = document.getElementById('summaryBtnDeliveryfloor');
        let permYd = false, permKnit = false, permDye = false, permDeli = false, permFloor = false;

        if (btnYd && btnKnit && btnDye && btnDeli && btnFloor) {
            const permsStr = localStorage.getItem('permissions');
            if (permsStr) {
                try {
                    const p = JSON.parse(permsStr);
                    if (p.actions) {
                        permKnit = !!p.actions.loadSummaryKnitting;
                        permDye = !!p.actions.loadSummaryDyeing;
                        permDeli = !!p.actions.loadSummaryDelivery;
                        // Fallback for existing cached permissions that lack the new keys
                        permYd = p.actions.loadSummaryYd !== undefined ? !!p.actions.loadSummaryYd : permKnit;
                        permFloor = p.actions.loadSummaryDeliveryfloor !== undefined ? !!p.actions.loadSummaryDeliveryfloor : permKnit;
                    }
                } catch (e) {}
            }
            btnYd.style.display = permYd ? '' : 'none';
            btnKnit.style.display = permKnit ? '' : 'none';
            btnDye.style.display = permDye ? '' : 'none';
            btnDeli.style.display = permDeli ? '' : 'none';
            btnFloor.style.display = permFloor ? '' : 'none';
        }
        
        // Show empty state — do not auto-load any department
        // Reset all department tab buttons to default style
        document.querySelectorAll('.department-tab').forEach(tab => {
            tab.className = 'department-tab px-4 py-2 rounded border text-xs font-bold bg-white text-gray-700 hover:bg-gray-50';
        });
        // Show prompt in summary table
        const table = document.getElementById('summaryPreviewTable');
        if (table) {
            table.querySelector('thead').innerHTML = '';
            const tbody = table.querySelector('tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="12" class="p-10">
                    <div class="flex flex-col items-center justify-center">
                        <i class="fas fa-hand-pointer text-4xl text-blue-400 mb-4"></i>
                        <h3 class="text-gray-800 font-bold text-lg">Select a Department</h3>
                        <p class="text-sm text-gray-500 mt-1">Click on a department button above (Knitting, Dyeing, Delivery, etc.) to view the buyer-wise load summary.</p>
                    </div>
                </td></tr>`;
            }
            const tfoot = table.querySelector('tfoot');
            if (tfoot) tfoot.innerHTML = '';
        }
    } else {
        refreshCurrentView();
    }
}

// Helper: Resolve plan start, end, and planType based on fallback rules
function resolveItemPlanDates(dept, savedItem, itemData, order) {
    let planStart = '';
    let planEnd = '';
    let planType = '';

    if (dept === 'yd') {
        // Priority 1: Tentative & Confirm YD Date from Tentative & Confirm list
        if (savedItem && (savedItem.planType === 'Confirm' || savedItem.planType === 'Tentative') && savedItem.startDate && savedItem.endDate) {
            planStart = savedItem.startDate;
            planEnd = savedItem.endDate;
            planType = savedItem.planType;
        } else {
            // Priority 2: T&A YD Plan (YD T&A Start and YD T&A End) from Order management (YD Plan) menu
            let ydTnAStart = getColData(itemData, ['YD T&A Start', 'T&A Start', 'YD T&A Start Date', 'YD TNA Start', 'TNA Start', 'Start Date']) || '';
            let ydTnAEnd = getColData(itemData, ['YD T&A End', 'T&A End', 'YD T&A End Date', 'YD TNA End', 'TNA End', 'End Date']) || '';
            if (typeof ydTnAStart === 'number') ydTnAStart = formatExcelDate(ydTnAStart);
            if (typeof ydTnAEnd === 'number') ydTnAEnd = formatExcelDate(ydTnAEnd);

            if (ydTnAStart && ydTnAEnd) {
                planStart = ydTnAStart;
                planEnd = ydTnAEnd;
                planType = 'T&A';
            } else if (order.yarnDate) {
                planStart = order.yarnDate;
                planEnd = order.yarnDate;
                planType = 'T&A';
            }
        }
    } else if (dept === 'knitting') {
        // Priority 1: Tentative & Confirm Knitting Date from Tentative & Confirm list
        if (savedItem && (savedItem.planType === 'Confirm' || savedItem.planType === 'Tentative') && savedItem.startDate && savedItem.endDate) {
            planStart = savedItem.startDate;
            planEnd = savedItem.endDate;
            planType = savedItem.planType;
        } else {
            // Priority 2: T&A Knitting Plan (Knitting T&A Start and Knitting T&A End) from Order management (Knitting Plan) menu
            let knitTnAStart = getColData(itemData, ['TAKnittingStart', 'T&A Knitting Start', 'KnitStart']) || order.knitStart || '';
            let knitTnAEnd = getColData(itemData, ['TAKnittingEnd', 'T&A Knitting End', 'KnitEnd']) || order.knitEnd || '';
            if (typeof knitTnAStart === 'number') knitTnAStart = formatExcelDate(knitTnAStart);
            if (typeof knitTnAEnd === 'number') knitTnAEnd = formatExcelDate(knitTnAEnd);

            if (knitTnAStart && knitTnAEnd) {
                planStart = knitTnAStart;
                planEnd = knitTnAEnd;
                planType = 'T&A';
            }
        }
    } else if (dept === 'dyeing') {
        // Priority 1: Tentative & Confirm Dyeing Date from Tentative & Confirm list
        if (savedItem && (savedItem.planType === 'Confirm' || savedItem.planType === 'Tentative') && savedItem.startDate && savedItem.endDate) {
            planStart = savedItem.startDate;
            planEnd = savedItem.endDate;
            planType = savedItem.planType;
        } else {
            // Priority 2: T&A Dyeing Plan (Dyeing T&A Start and Dyeing T&A End) from Order management (Dyeing Plan) menu
            let dyeTnAStart = getColData(itemData, ['TADyeingStart', 'T&A Dyeing Start', 'DyeStart']) || order.dyeStart || '';
            let dyeTnAEnd = getColData(itemData, ['TADyeingEnd', 'T&A Dyeing End', 'DyeEnd']) || order.dyeEnd || '';
            if (typeof dyeTnAStart === 'number') dyeTnAStart = formatExcelDate(dyeTnAStart);
            if (typeof dyeTnAEnd === 'number') dyeTnAEnd = formatExcelDate(dyeTnAEnd);

            if (dyeTnAStart && dyeTnAEnd) {
                planStart = dyeTnAStart;
                planEnd = dyeTnAEnd;
                planType = 'T&A';
            }
        }
    } else if (dept === 'delivery') {
        // Priority 1: Tentative & Confirm Delivery Date from Tentative & Confirm list
        if (savedItem && (savedItem.planType === 'Confirm' || savedItem.planType === 'Tentative') && savedItem.startDate && savedItem.endDate) {
            planStart = savedItem.startDate;
            planEnd = savedItem.endDate;
            planType = savedItem.planType;
        } else {
            // Priority 2: Delivery Planning (Floor) (Start and End) from Order management (Delivery Planning (Floor)) menu
            let floorStart = savedItem?.floorStartDate || getColData(itemData, ['floorStartDate', 'Delivery Plan Start (Floor)', 'Floor Start']) || '';
            let floorEnd = savedItem?.floorEndDate || getColData(itemData, ['floorEndDate', 'Delivery Plan End (Floor)', 'Floor End']) || '';
            if (typeof floorStart === 'number') floorStart = formatExcelDate(floorStart);
            if (typeof floorEnd === 'number') floorEnd = formatExcelDate(floorEnd);

            if (floorStart && floorEnd) {
                planStart = floorStart;
                planEnd = floorEnd;
                planType = (savedItem && (savedItem.floorPlanType === 'Confirm' || savedItem.floorPlanType === 'Tentative')) ? savedItem.floorPlanType : 'Floor';
            } else {
                // Priority 3: T&A Deli. Start & T&A Deli. End date
                let deliTnAStart = getColData(itemData, ['TADeliStart', 'T&A Deli. Start', 'DeliStart']) || order.deliStart || '';
                let deliTnAEnd = getColData(itemData, ['TADeliEnd', 'T&A Deli. End', 'DeliEnd']) || order.deliEnd || '';
                if (typeof deliTnAStart === 'number') deliTnAStart = formatExcelDate(deliTnAStart);
                if (typeof deliTnAEnd === 'number') deliTnAEnd = formatExcelDate(deliTnAEnd);

                if (deliTnAStart && deliTnAEnd) {
                    planStart = deliTnAStart;
                    planEnd = deliTnAEnd;
                    planType = 'T&A';
                }
            }
        }
    } else if (dept === 'deliveryfloor') {
        // Priority 1: Tentative & Confirm Delivery Planning (Floor) Date from Tentative & Confirm list
        if (savedItem && (savedItem.floorPlanType === 'Confirm' || savedItem.floorPlanType === 'Tentative') && savedItem.floorStartDate && savedItem.floorEndDate) {
            planStart = savedItem.floorStartDate;
            planEnd = savedItem.floorEndDate;
            planType = savedItem.floorPlanType;
        } else {
            // Priority 2: T&A Deli. Start & T&A Deli. End date
            let deliTnAStart = getColData(itemData, ['TADeliStart', 'T&A Deli. Start', 'DeliStart']) || order.deliStart || '';
            let deliTnAEnd = getColData(itemData, ['TADeliEnd', 'T&A Deli. End', 'DeliEnd']) || order.deliEnd || '';
            if (typeof deliTnAStart === 'number') deliTnAStart = formatExcelDate(deliTnAStart);
            if (typeof deliTnAEnd === 'number') deliTnAEnd = formatExcelDate(deliTnAEnd);

            if (deliTnAStart && deliTnAEnd) {
                planStart = deliTnAStart;
                planEnd = deliTnAEnd;
                planType = 'T&A';
            }
        }
    }

    return { planStart, planEnd, planType };
}

function buildLoadRowFromItem(order, itemData, dept, planDates) {
    let row = {};
    row.OrderNo = order.orderNo;
    row.Buyer = getColData(itemData, ['Buyer', 'BuyerName', 'Customer']) || order.buyer || '';
    row.Color = getColData(itemData, ['Color', 'Colour', 'Fab Color']);
    row.FabricConstruction = getColData(itemData, ['FabricConstruction', 'Construction', 'Fab Const', 'Fabric']);
    row.GSM = getColData(itemData, ['GSM', 'G.S.M']);
    row.RequiredQtyKgs = getColData(itemData, ['RequiredQtyKgs', 'Req Qty', 'Qty', 'Order Qty']);
    row.Allowance = getColData(itemData, ['Allowance %', 'Allowance', 'Wastage %', 'Wastage', 'Allow %', 'Allow']);
    row.YarnReq = getColData(itemData, ['Yarn req.', 'YarnReq', 'Yarn Req', 'Yarn Req.']);
    row.AllocatedQty = getColData(itemData, ['Allocated Qty', 'Allocated Qty ', 'AllocatedQty', 'Alloc Qty']);
    row.YarnBala = getColData(itemData, ['Yarn bala.', 'YarnBala', 'Yarn Bala', 'Yarn Balance']);
    row.GreyReq = getColData(itemData, ['Grey Req.', 'GreyReq', 'Grey Req']);
    row.KnitProd = getColData(itemData, ['Knit Prod.', 'KnitProd', 'Knit Prod', 'Knit Production']);
    row.KnitBala = getColData(itemData, ['Knit. Bala.', 'KnitBala', 'Knit Bala.', 'Knit Bala', 'Knit. Bal.']);
    row.BPQty = getColData(itemData, ['BP Qty', 'BPQty', 'BP_Qty']);
    row.DyeingProd = getColData(itemData, ['Dyeing Prod.', 'DyeingProd', 'Dyeing Prod', 'Dyeing ok', 'Dyeing Production']);
    row.DyeingBala = getColData(itemData, ['Dyeing Bala.', 'DyeingBala', 'Dyeing Bala', 'Dyeing Bal.']);
    row.NetReceivedQtyKgs = getColData(itemData, ['NetReceivedQtyKgs', 'NetReceivedQty', 'ReceivedQty']);
    row.NetDeliveryQtyKgs = getColData(itemData, ['NetDeliveryQtyKgs', 'NetDeliveryQty', 'DeliveryQty']);
    row.DeliBal = getColData(itemData, ['Deli. Bal.', 'Deli Bal.', 'DeliBal', 'Delivery Balance', 'Deli. Bala.']);
    row.RFD = getColData(itemData, ['RFD']);
    row.Slowmoving = getColData(itemData, ['Slowmoving', 'Slow Moving']);
    row.FFStock = getColData(itemData, ['FF Stock', 'FFStock', 'FF_Stock']);
    row.Unit = getColData(itemData, ['Unit']);
    row.ProcessName = getColData(itemData, ['Process Name', 'ProcessName', 'Process']);

    // YD fields
    row['Booking Type'] = getColData(itemData, ['Booking Type', 'Type', 'YD Type']);
    row.YDB = getColData(itemData, ['YDB', 'YD B']);
    row['YD REQ.'] = getColData(itemData, ['YD REQ.', 'YD REQ', 'Requirement']);
    row.DYED = getColData(itemData, ['DYED', 'Dyed']);
    row['YD BALANCE'] = getColData(itemData, ['YD BALANCE', 'YD Balance']);
    row['YD Delivered'] = getColData(itemData, ['YD Delivered', 'Delivered']);
    row['YD DELIVERY BALANCE'] = getColData(itemData, ['YD DELIVERY BALANCE', 'YD Balance_1', 'YD Delivery Balance']);

    // Fallbacks for pending balance quantities if not populated directly
    if (!row.DeliBal || loadNumber(row.DeliBal) === 0) {
        const req = loadNumber(row.RequiredQtyKgs);
        const del = loadNumber(row.NetDeliveryQtyKgs);
        if (req > 0 && del > 0) row.DeliBal = req - del;
        else if (req > 0) row.DeliBal = req;
    }
    if (!row.KnitBala || loadNumber(row.KnitBala) === 0) {
        const req = loadNumber(row.GreyReq);
        const prod = loadNumber(row.KnitProd);
        if (req > 0 && prod > 0) row.KnitBala = req - prod;
        else if (req > 0) row.KnitBala = req;
    }
    if (!row.DyeingBala || loadNumber(row.DyeingBala) === 0) {
        const req = loadNumber(row.RequiredQtyKgs) || loadNumber(row.BPQty);
        const prod = loadNumber(row.DyeingProd);
        if (req > 0 && prod > 0) row.DyeingBala = req - prod;
        else if (req > 0) row.DyeingBala = req;
    }
    if (!row['YD DELIVERY BALANCE'] || loadNumber(row['YD DELIVERY BALANCE']) === 0) {
        const req = loadNumber(row['YD REQ.']);
        const del = loadNumber(row['YD Delivered']);
        if (req > 0 && del > 0) row['YD DELIVERY BALANCE'] = req - del;
        else if (req > 0) row['YD DELIVERY BALANCE'] = req;
    }

    row.planStart = planDates.planStart;
    row.planEnd = planDates.planEnd;
    row.planType = planDates.planType;

    return row;
}

function processOrdersForLoadDepartment(orders, planMap, dept) {
    const results = [];
    const actualDept = dept === 'deliveryfloor' ? 'delivery' : dept;
    const itemsField = `${actualDept}Items`;

    (orders || []).forEach(order => {
        const planData = (planMap && planMap[order.orderNo]) ? planMap[order.orderNo] : null;
        const savedItems = (planData && Array.isArray(planData[actualDept])) ? planData[actualDept] : [];
        const excelItems = Array.isArray(order[itemsField]) ? order[itemsField] : [];

        // If excelItems has rows, process excelItems (with savedItem merge)
        // If excelItems is empty, process savedItems
        const baseItems = excelItems.length > 0 ? excelItems : savedItems;

        baseItems.forEach((baseItem, idx) => {
            let itemData = (baseItem.itemData) ? { ...baseItem.itemData } : { ...baseItem };
            let savedItem = null;

            if (excelItems.length > 0) {
                const exId = typeof generateItemId === 'function' ? generateItemId(baseItem, actualDept) : `item_${idx}`;
                const myColor = String(itemData.Color || itemData.Colour || itemData['Fab Color'] || '').trim().toLowerCase();
                const myConst = String(itemData.FabricConstruction || itemData.Construction || '').trim().toLowerCase();
                const myGsm = String(itemData.GSM || '').trim().toLowerCase();

                savedItem = savedItems.find(s => s.itemId === exId)
                    || savedItems.find(s => {
                        const sColor = String(s.itemData?.Color || s.itemData?.Colour || '').trim().toLowerCase();
                        const sConst = String(s.itemData?.FabricConstruction || s.itemData?.Construction || '').trim().toLowerCase();
                        const sGsm = String(s.itemData?.GSM || '').trim().toLowerCase();
                        return sColor && sColor === myColor && (!myConst || sConst === myConst) && (!myGsm || sGsm === myGsm);
                    })
                    || savedItems.find(s => {
                        const sColor = String(s.itemData?.Color || s.itemData?.Colour || '').trim().toLowerCase();
                        return sColor && sColor === myColor;
                    });

                if (savedItem && savedItem.itemData) {
                    itemData = { ...itemData, ...savedItem.itemData };
                }
            } else {
                savedItem = baseItem;
            }

            const planDates = resolveItemPlanDates(dept, savedItem, itemData, order);
            const row = buildLoadRowFromItem(order, itemData, dept, planDates);
            results.push(row);
        });
    });

    return results;
}

async function fetchLoadCalculationData() {
    globalLoadData = { knitting: [], dyeing: [], delivery: [], yd: [], deliveryfloor: [] };

    // Fetch confirmed + tentative + pending plan data for each department from API
    const depts = ['knitting', 'dyeing', 'delivery', 'yd'];

    const fetchPromises = depts.map(async (dept) => {
        try {
            const res = await fetch(`${API_BASE}/api/orders/report/${dept}?includePending=true`);
            if (!res || !res.ok) return;
            const data = await res.json();

            if (!data.orders || !data.planMap) return;

            globalLoadData[dept] = processOrdersForLoadDepartment(data.orders, data.planMap, dept);

            // Also populate deliveryfloor from delivery data
            if (dept === 'delivery') {
                globalLoadData.deliveryfloor = processOrdersForLoadDepartment(data.orders, data.planMap, 'deliveryfloor');
            }
        } catch (e) {
            console.error(`Load calc fetch error for ${dept}:`, e);
        }
    });

    await Promise.all(fetchPromises);
}

// Fetch data for a single department on-demand (for download click)
async function ensureLoadDataForDept(dept) {
    if (globalLoadData[dept] && globalLoadData[dept].length > 0) return; // already loaded

    const actualDept = dept === 'deliveryfloor' ? 'delivery' : dept;
    try {
        const res = await fetch(`${API_BASE}/api/orders/report/${actualDept}?includePending=true`);
        if (!res || !res.ok) return;
        const data = await res.json();
        if (!data.orders || !data.planMap) return;

        globalLoadData[dept] = processOrdersForLoadDepartment(data.orders, data.planMap, dept);
    } catch (e) {
        console.error(`Load data fetch error for ${dept}:`, e);
    }
}

function initLoadMonthSelector() {
    const select = document.getElementById('loadStartMonth');
    select.innerHTML = '';
    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    for (let i = -12; i <= 24; i++) {
        const monthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + i, 1);
        const value = monthDate.getFullYear() + '-' + String(monthDate.getMonth() + 1).padStart(2, '0');
        const label = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '-');
        
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        if (i === 0) option.selected = true;
        select.appendChild(option);
    }
}

function parseLoadDate(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    if (typeof value === 'number' && value > 25000 && value < 70000) {
        const d = new Date(Math.round((value - 25569) * 86400 * 1000));
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const text = String(value).trim();
    if (/^\d{5}$/.test(text)) {
        const num = Number(text);
        if (num > 25000 && num < 70000) {
            const d = new Date(Math.round((num - 25569) * 86400 * 1000));
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }
    }
    const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function startOfLoadDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function addLoadMonths(date, number) { return new Date(date.getFullYear(), date.getMonth() + number, 1); }
function loadMonthEnd(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
function minLoadDate(date1, date2) { return date1 <= date2 ? date1 : date2; }
function maxLoadDate(date1, date2) { return date1 >= date2 ? date1 : date2; }
function inclusiveLoadDays(startDate, endDate) { return Math.floor((startOfLoadDay(endDate) - startOfLoadDay(startDate)) / 86400000) + 1; }

function loadNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    const cleaned = String(value).replace(/,/g, '').replace(/\s*Kg$/i, '').trim();
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
}

function getSelectedLoadMonths() {
    const selectedValue = document.getElementById('loadStartMonth').value;
    if(!selectedValue) return [];
    const [year, month] = selectedValue.split('-').map(Number);
    const firstMonth = new Date(year, month - 1, 1);
    return Array.from({ length: LOAD_MONTH_COUNT }, (_, index) => addLoadMonths(firstMonth, index));
}

function formatLoadMonthHeader(date) { return date.toLocaleDateString('en-US', { month: 'short' }); }
function formatSummaryMonthHeader(date) { return date.toLocaleDateString('en-US', { month: 'long' }); }
function formatLoadMonthYear(date) { return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '-'); }
function formatLoadDate(dateValue) {
    const date = parseLoadDate(dateValue);
    if (!date) return '';
    return date.getDate() + '-' + date.toLocaleDateString('en-US', { month: 'short' });
}

function calculateLoadAllocation(pendingQty, planStartValue, planEndValue, reportMonths) {
    const qty = Math.max(0, loadNumber(pendingQty));
    const planStart = parseLoadDate(planStartValue);
    const planEnd = parseLoadDate(planEndValue);
    const today = startOfLoadDay(new Date());

    const emptyResult = { leadDay: 0, loadPerDay: 0, monthlyLoads: new Array(LOAD_MONTH_COUNT).fill(0) };

    if (!planStart || !planEnd || qty <= 0) return emptyResult;

    if (planEnd <= today) {
        return {
            leadDay: 1,
            loadPerDay: Math.round(qty),
            monthlyLoads: reportMonths.map((_, index) => index === 0 ? Math.round(qty) : 0)
        };
    }

    const allocationStart = maxLoadDate(planStart, today);
    const leadDay = Math.max(1, inclusiveLoadDays(allocationStart, planEnd));

    const monthlyLoads = reportMonths.map(monthStart => {
        const currentMonthEnd = loadMonthEnd(monthStart);
        const previousMonthEnd = loadMonthEnd(addLoadMonths(monthStart, -1));
        const currentCutoff = minLoadDate(planEnd, currentMonthEnd);
        const previousCutoff = minLoadDate(planEnd, previousMonthEnd);
        
        const currentDays = Math.max(0, inclusiveLoadDays(allocationStart, currentCutoff));
        const previousDays = Math.max(0, inclusiveLoadDays(allocationStart, previousCutoff));

        const currentCumulative = Math.round(qty * currentDays / leadDay);
        const previousCumulative = Math.round(qty * previousDays / leadDay);

        return Math.max(0, currentCumulative - previousCumulative);
    });

    return {
        leadDay,
        loadPerDay: Math.round(qty / leadDay),
        monthlyLoads
    };
}

function buildReportData(department) {
    const config = LOAD_REPORT_CONFIG[department];
    const reportMonths = getSelectedLoadMonths();
    const sourceRows = globalLoadData[department] || [];

    const headers = [
        ...config.columns,
        `${config.name} Plan Start Date`,
        `${config.name} Plan End Date`,
        `${config.name} Plan Type`,
        'Lead Day',
        'L/Day',
        ...reportMonths.map(formatLoadMonthHeader)
    ];

    const rows = sourceRows
        .filter(row => {
            const hasDates = Boolean(row.planStart && row.planEnd);
            return hasDates || row.planType === 'Confirm' || row.planType === 'Tentative';
        })
        .filter(row => loadNumber(row[config.pendingQtyField]) > 0)
        .map(row => {
            const allocation = calculateLoadAllocation(row[config.pendingQtyField], row.planStart, row.planEnd, reportMonths);
            return {
                source: row,
                excelRow: [
                    ...config.columns.map(col => row[col] !== undefined && row[col] !== null ? row[col] : ''),
                    formatLoadDate(row.planStart),
                    formatLoadDate(row.planEnd),
                    row.planType || '',
                    allocation.leadDay,
                    allocation.loadPerDay,
                    ...allocation.monthlyLoads
                ],
                monthlyLoads: allocation.monthlyLoads
            };
        });

    return { config, reportMonths, headers, rows };
}

function buildSummaryData(department) {
    const detailData = buildReportData(department);
    const buyerMap = new Map();

    detailData.rows.forEach(detailRow => {
        const buyer = String(detailRow.source.Buyer || 'Unspecified').trim() || 'Unspecified';
        if (!buyerMap.has(buyer)) buyerMap.set(buyer, new Array(LOAD_MONTH_COUNT).fill(0));
        
        const buyerMonths = buyerMap.get(buyer);
        detailRow.monthlyLoads.forEach((value, index) => {
            buyerMonths[index] += loadNumber(value);
        });
    });

    const summaryRows = Array.from(buyerMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
        .map(([buyer, monthlyValues]) => ({ buyer, monthlyValues, total: monthlyValues.reduce((sum, val) => sum + val, 0) }));

    const grandMonthlyTotals = new Array(LOAD_MONTH_COUNT).fill(0);
    summaryRows.forEach(row => {
        row.monthlyValues.forEach((val, idx) => grandMonthlyTotals[idx] += val);
    });
    const grandTotal = grandMonthlyTotals.reduce((sum, val) => sum + val, 0);

    return {
        config: detailData.config,
        reportMonths: detailData.reportMonths,
        headers: ['Buyer', ...detailData.reportMonths.map(formatSummaryMonthHeader), 'Total [Kg]'],
        rows: summaryRows,
        grandMonthlyTotals,
        grandTotal
    };
}

function setSummaryDepartment(department) {
    activeSummaryDepartment = department;
    document.querySelectorAll('.department-tab').forEach(tab => {
        tab.className = 'department-tab px-4 py-2 rounded border text-xs font-bold bg-white text-gray-700 hover:bg-gray-50';
    });
    const deptBtnName = department.charAt(0).toUpperCase() + department.slice(1);
    const activeBtn = document.getElementById('summaryBtn' + deptBtnName);
    if(activeBtn) {
        activeBtn.className = `department-tab px-4 py-2 rounded border text-xs font-bold active-${department}`;
    }
    refreshCurrentView();
}

async function refreshCurrentView() {
    if (activeMainMenu === 'summary') {
        const table = document.getElementById('summaryPreviewTable');
        if (table) {
            const tbody = table.querySelector('tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="12" class="p-10">
                    <div class="flex flex-col items-center justify-center">
                        <div class="relative flex justify-center items-center w-14 h-14 mb-4">
                            <div class="absolute w-full h-full rounded-full border-4 border-gray-200 dark:border-gray-700"></div>
                            <div class="absolute w-full h-full rounded-full border-4 border-transparent border-t-emerald-500 border-r-emerald-500 animate-spin"></div>
                            <div class="absolute w-10 h-10 rounded-full border-4 border-transparent border-b-blue-500 border-l-blue-500 animate-[spin_1.5s_linear_infinite_reverse]"></div>
                            <div class="absolute w-4 h-4 rounded-full bg-orange-500 animate-pulse"></div>
                        </div>
                        <h3 class="text-gray-800 font-bold text-lg">Loading Summary Data...</h3>
                        <p class="text-sm text-gray-500 mt-1">Please wait while data is being processed</p>
                    </div>
                </td></tr>`;
            }
            const tfoot = table.querySelector('tfoot');
            if (tfoot) {
                tfoot.innerHTML = '';
            }
        }
        
        // Force browser repaint so spinner is visible before heavy JS execution
        await new Promise(resolve => setTimeout(resolve, 50));
        
        await ensureLoadDataForDept(activeSummaryDepartment);
        const data = buildSummaryData(activeSummaryDepartment);
        renderSummaryTable(data);
    }
}

function renderSummaryTable(data) {
    const table = document.getElementById('summaryPreviewTable');
    table.querySelector('thead').innerHTML = `<tr>${data.headers.map(h => `<th class="p-2 border text-center">${h}</th>`).join('')}</tr>`;
    
    const tbody = table.querySelector('tbody');
    if (data.rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${data.headers.length}" class="text-center p-4 text-slate-500">No load data available for this department.</td></tr>`;
        table.querySelector('tfoot').innerHTML = '';
        return;
    }

    tbody.innerHTML = data.rows.map(row => `
        <tr>
            <td class="p-2 border text-left font-semibold text-slate-700">${row.buyer}</td>
            ${row.monthlyValues.map(val => `<td class="p-2 border text-right">${val.toLocaleString()}</td>`).join('')}
            <td class="p-2 border text-right font-bold text-slate-800">${row.total.toLocaleString()}</td>
        </tr>
    `).join('');

    table.querySelector('tfoot').innerHTML = `
        <tr>
            <td class="p-2 border text-left">Grand Total</td>
            ${data.grandMonthlyTotals.map(val => `<td class="p-2 border text-right">${val.toLocaleString()}</td>`).join('')}
            <td class="p-2 border text-right">${data.grandTotal.toLocaleString()}</td>
        </tr>
    `;
}

async function downloadLoadReport(department) {
    const deptCapitalized = department.charAt(0).toUpperCase() + department.slice(1);
    const btnId = 'btnLoadDetailed' + deptCapitalized;
    const btn = document.getElementById(btnId);
    let originalHtml = '';
    if (btn) {
        originalHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin text-sm"></i> Loading...`;
        btn.disabled = true;
    }

    try {
        showToast(`Loading ${department} data...`);
        await ensureLoadDataForDept(department);
        const { config, reportMonths, headers, rows } = buildReportData(department);
        if (!rows.length) { showToast(`No ${config.name} load data found.`); return; }

        const worksheetData = [headers, ...rows.map(row => row.excelRow)];
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        
        worksheet['!autofilter'] = {
            ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } })
        };
        worksheet['!cols'] = headers.map(header => {
            if (header.includes('Date') || header.includes('Construction') || header.includes('Process')) return { wch: 21 };
            return { wch: Math.max(10, Math.min(String(header).length + 3, 18)) };
        });

        // Apply special formatting
        formatExcelWorksheet(worksheet);

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `${config.name} Load`);
        const filename = `${config.name}_Load_${formatLoadMonthYear(reportMonths[0])}.xlsx`;
        XLSX.writeFile(workbook, filename);
    } catch (error) {
        console.error("Error downloading report:", error);
        showToast("Error generating report");
    } finally {
        if (btn) {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }
}

async function downloadLoadSummary(department) {
    const deptCapitalized = department.charAt(0).toUpperCase() + department.slice(1);
    const btnId = 'btnLoadSummary' + deptCapitalized;
    const btn = document.getElementById(btnId);
    let originalHtml = '';
    if (btn) {
        originalHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin text-sm"></i> Loading...`;
        btn.disabled = true;
    }

    try {
        showToast(`Loading ${department} summary...`);
        await ensureLoadDataForDept(department);
        const { config, reportMonths, headers, rows, grandMonthlyTotals, grandTotal } = buildSummaryData(department);
        if (!rows.length) { showToast(`No ${config.name} summary data found.`); return; }

        const worksheetData = [
            headers,
            ...rows.map(row => [row.buyer, ...row.monthlyValues, row.total]),
            ['Grand Total', ...grandMonthlyTotals, grandTotal]
        ];

        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        worksheet['!cols'] = [{ wch: 25 }, ...reportMonths.map(() => ({ wch: 15 })), { wch: 15 }];
        
        // Apply special formatting
        formatExcelWorksheet(worksheet);

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `${config.name} Summary`);
        const filename = `${config.name}_Summary_${formatLoadMonthYear(reportMonths[0])}.xlsx`;
        XLSX.writeFile(workbook, filename);
    } catch (error) {
        console.error("Error downloading summary:", error);
        showToast("Error generating summary");
    } finally {
        if (btn) {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }
}

