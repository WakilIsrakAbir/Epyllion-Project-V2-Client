// ==========================================================
// DETAILED VIEW: Order Detail Form (fetches from API on demand)
// ==========================================================
async function openDetailedView(encodedBookingNo) {
    const bookingNo = decodeURIComponent(encodedBookingNo);
    const currentDept = activeTabId.replace('_report', '');

    // Check save permission
    const saveBtn = document.getElementById('saveDatesBtn');
    if (saveBtn) {
        const permsStr = localStorage.getItem('permissions');
        let canSave = false;
        if (permsStr) {
            try {
                const p = JSON.parse(permsStr);
                if (p.actions) {
                    const deptMap = { yd: 'saveYD', knitting: 'saveKnitting', dyeing: 'saveDyeing', finishing: 'saveFinishing', delivery: 'saveDelivery' };
                    const permKey = deptMap[currentDept];
                    canSave = permKey ? p.actions[permKey] : false;
                }
            } catch (e) {}
        }
        saveBtn.style.display = canSave ? '' : 'none';
    }

    // Show loading
    document.getElementById('listView').classList.add('hidden');
    document.getElementById('detailedView').classList.remove('hidden');
    document.getElementById('detFabricItemsBody').innerHTML = '<tr><td colspan="20" class="p-10 text-center text-gray-500">Loading order data...</td></tr>';

    // Fetch single order from API
    let data = null;
    try {
        const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(bookingNo)}?dept=${currentDept}`);
        if (res.ok) {
            const result = await res.json();
            // Build compatible data structure
            const order = result.order;
            const planData = result.planData;
            
            data = {
                bookingNo: order.orderNo,
                buyers: new Set([order.buyer || 'N/A']),
                bookingDate: order.bookingDate ? formatDateDisplay(order.bookingDate) : 'N/A',
                buyerTeam: order.buyerTeam || '',
                bookedBy: order.bookedBy || order.bookingBy || '',
                style: order.style || '',
                generalInfo: {
                    EWO: order.orderNo,
                    OrderQty: order.requiredQtyKgs,
                    GmtUnit: order.gmtUnit || order.bookingUnit || '',
                    Floor: order.floor || order.unit || '',
                    FinalConf: order.finalConfirmation,
                    BPStatus: order.bpStatus ? formatDateDisplay(order.bpStatus) : '',
                    PMC: order.pmc || '',
                    OrderStatus: planData ? (planData[`${currentDept}Status`] || 'On Process') : 'On Process',
                    EventDay: order.eventDay,
                    Ship1: order.ship1 ? formatDateDisplay(order.ship1) : 'N/A',
                    ShipLast: order.shipLast ? formatDateDisplay(order.shipLast) : 'N/A',
                    YarnDate: order.yarnDate ? formatDateDisplay(order.yarnDate) : 'N/A',
                    DeliStart: order.deliStart ? formatDateDisplay(order.deliStart) : 'N/A',
                    DeliEnd: order.deliEnd ? formatDateDisplay(order.deliEnd) : 'N/A',
                    KnitStart: order.knitStart ? formatDateDisplay(order.knitStart) : 'N/A',
                    KnitEnd: order.knitEnd ? formatDateDisplay(order.knitEnd) : 'N/A',
                    DyeStart: order.dyeStart ? formatDateDisplay(order.dyeStart) : 'N/A',
                    DyeEnd: order.dyeEnd ? formatDateDisplay(order.dyeEnd) : 'N/A',
                    FabNotes: order.fabricNotes
                },
                dbData: planData,
                mergedItems: [],
                excelItems: order[`${currentDept}Items`] || []
            };

            // Build merged items from excel items + plan data
            const dbItems = (planData && planData[currentDept]) ? planData[currentDept] : [];
            const dbMap = new Map();
            dbItems.forEach(item => { if (item.itemId) dbMap.set(item.itemId, item); });

            data.excelItems.forEach((exItem, idx) => {
                // Normalize item data using getColData for flexible column matching
                let itemData = {};
                if (currentDept === 'knitting' || currentDept === 'delivery') {
                    itemData = {
                        OrderNo: getColData(exItem, ['BookingNo', 'OrderNo', 'EWO', 'Booking', 'Order No', 'Booking No']),
                        Color: getColData(exItem, ['Color', 'Colour', 'Fab Color']),
                        FabricConstruction: getColData(exItem, ['FabricConstruction', 'Construction', 'Fab Const', 'Fabric']),
                        GSM: getColData(exItem, ['GSM', 'G.S.M']),
                        RequiredQtyKgs: getColData(exItem, ['RequiredQtyKgs', 'Req Qty', 'Qty']),
                        Buyer: getColData(exItem, ['Buyer', 'BuyerName', 'Customer']),
                        Allowance: getColData(exItem, ['Allowance %', 'Allowance', 'Wastage %', 'Wastage', 'Allow %', 'Allow']),
                        YarnReq: getColData(exItem, ['Yarn req.', 'YarnReq', 'Yarn Req', 'Yarn Req.']),
                        AllocatedQty: getColData(exItem, ['Allocated Qty', 'Allocated Qty ', 'AllocatedQty', 'Alloc Qty']),
                        YarnBala: getColData(exItem, ['Yarn bala.', 'YarnBala', 'Yarn Bala', 'Yarn Balance']),
                        GreyReq: getColData(exItem, ['Grey Req.', 'GreyReq', 'Grey Req']),
                        KnitProd: getColData(exItem, ['Knit Prod.', 'KnitProd', 'Knit Prod', 'Knit Production']),
                        KnitBala: getColData(exItem, ['Knit. Bala.', 'KnitBala', 'Knit Bala.', 'Knit Bala', 'Knit. Bal.']),
                        NetReceivedQtyKgs: getColData(exItem, ['NetReceivedQtyKgs', 'NetReceivedQty', 'ReceivedQty']),
                        NetDeliveryQtyKgs: getColData(exItem, ['NetDeliveryQtyKgs', 'NetDeliveryQty', 'DeliveryQty']),
                        DeliBal: getColData(exItem, ['Deli. Bal.', 'Deli Bal.', 'DeliBal', 'Delivery Balance', 'Deli. Bala.']),
                        RFD: getColData(exItem, ['RFD']),
                        Slowmoving: getColData(exItem, ['Slowmoving', 'Slow Moving']),
                        FFStock: getColData(exItem, ['FF Stock', 'FFStock', 'FF_Stock'])
                    };
                } else if (currentDept === 'yd') {
                    itemData = {
                        OrderNo: getColData(exItem, ['BookingNo', 'OrderNo', 'EWO', 'Booking', 'Order No', 'Booking No']),
                        'Booking Type': getColData(exItem, ['Booking Type', 'Type', 'YD Type']),
                        YDB: getColData(exItem, ['YDB', 'YD B']),
                        'YD Booking Date': getColData(exItem, ['YD Booking Date', 'Date', 'Booking Date']),
                        'YD T&A Start': getColData(exItem, ['YD T&A Start', 'T&A Start', 'YD T&A Start Date', 'YD TNA Start', 'TNA Start', 'Start Date']),
                        'YD T&A End': getColData(exItem, ['YD T&A End', 'T&A End', 'YD T&A End Date', 'YD TNA End', 'TNA End', 'End Date']),
                        'YD REQ.': getColData(exItem, ['YD REQ.', 'YD REQ', 'YD Req', 'Requirement']),
                        DYED: getColData(exItem, ['DYED', 'Dyed', 'Dye']),
                        'YD BALANCE': getColData(exItem, ['YD BALANCE', 'YD Balance']),
                        'YD Delivered': getColData(exItem, ['YD Delivered', 'Delivered', 'Delivery']),
                        'YD DELIVERY BALANCE': getColData(exItem, ['YD DELIVERY BALANCE', 'YD Balance_1', 'YD Balance 2']),
                        'Barrier Qty.': getColData(exItem, ['Barrier Qty.', 'Barrier Qty', 'Barrier']),
                        'Workable Qty.': getColData(exItem, ['Workable Qty.', 'Workable Qty', 'Workable'])
                    };
                } else {
                    // Dyeing / Finishing
                    itemData = {
                        OrderNo: getColData(exItem, ['BookingNo', 'OrderNo', 'EWO', 'Booking', 'Order No', 'Booking No']),
                        Color: getColData(exItem, ['Color', 'Colour', 'Fab Color']),
                        RequiredQtyKgs: getColData(exItem, ['RequiredQtyKgs', 'Req Qty', 'Qty', 'Order Qty']),
                        Buyer: getColData(exItem, ['Buyer', 'BuyerName', 'Customer']),
                        Unit: getColData(exItem, ['Unit']),
                        ProcessName: getColData(exItem, ['Process Name', 'ProcessName', 'Process']),
                        Allowance: getColData(exItem, ['Allowance %', 'Allowance', 'Wastage %', 'Wastage', 'Allow %', 'Allow']),
                        YarnReq: getColData(exItem, ['Yarn req.', 'YarnReq', 'Yarn Req', 'Yarn Req.']),
                        AllocatedQty: getColData(exItem, ['Allocated Qty', 'Allocated Qty ', 'AllocatedQty', 'Alloc Qty']),
                        YarnBala: getColData(exItem, ['Yarn bala.', 'YarnBala', 'Yarn Bala', 'Yarn Balance']),
                        GreyReq: getColData(exItem, ['Grey Req.', 'GreyReq', 'Grey Req']),
                        KnitProd: getColData(exItem, ['Knit Prod.', 'KnitProd', 'Knit Prod', 'Knit Production']),
                        KnitBala: getColData(exItem, ['Knit. Bala.', 'KnitBala', 'Knit Bala.', 'Knit Bala', 'Knit. Bal.']),
                        BPQty: getColData(exItem, ['BP Qty', 'BPQty', 'BP_Qty']),
                        DyeingProd: getColData(exItem, ['Dyeing Prod.', 'DyeingProd', 'Dyeing Prod', 'Dyeing ok', 'Dyeing Production']),
                        DyeingBala: getColData(exItem, ['Dyeing Bala.', 'DyeingBala', 'Dyeing Bala', 'Dyeing Bal.']),
                        NetReceivedQtyKgs: getColData(exItem, ['NetReceivedQtyKgs', 'NetReceivedQty', 'ReceivedQty']),
                        NetDeliveryQtyKgs: getColData(exItem, ['NetDeliveryQtyKgs', 'NetDeliveryQty', 'DeliveryQty']),
                        DeliBal: getColData(exItem, ['Deli. Bal.', 'Deli Bal.', 'DeliBal', 'Delivery Balance', 'Deli. Bala.']),
                        RFD: getColData(exItem, ['RFD']),
                        Slowmoving: getColData(exItem, ['Slowmoving', 'Slow Moving']),
                        FFStock: getColData(exItem, ['FF Stock', 'FFStock', 'FF_Stock'])
                    };
                }

                const itemId = generateItemId(itemData, currentDept) || `item_${idx}`;
                
                const dbItem = dbMap.get(itemId);
                
                if (dbItem && dbItem.itemData) {
                    if (dbItem.itemData.Unit) itemData.Unit = dbItem.itemData.Unit;
                    if (dbItem.itemData.ProcessName) itemData.ProcessName = dbItem.itemData.ProcessName;
                    if (dbItem.itemData['Process Name']) itemData['Process Name'] = dbItem.itemData['Process Name'];
                    if (dbItem.itemData['Barrier Qty.']) itemData['Barrier Qty.'] = dbItem.itemData['Barrier Qty.'];
                    if (dbItem.itemData['Workable Qty.']) itemData['Workable Qty.'] = dbItem.itemData['Workable Qty.'];
                }

                data.mergedItems.push({
                    itemId: itemId,
                    itemData: itemData,
                    startDate: dbItem ? dbItem.startDate || '' : '',
                    endDate: dbItem ? dbItem.endDate || '' : '',
                    planType: dbItem ? dbItem.planType || '' : '',
                    limitation: dbItem ? dbItem.limitation || '' : '',
                    remarks: dbItem ? dbItem.remarks || '' : '',
                    floorStartDate: dbItem ? dbItem.floorStartDate || '' : '',
                    floorEndDate: dbItem ? dbItem.floorEndDate || '' : '',
                    floorPlanType: dbItem ? dbItem.floorPlanType || '' : '',
                    yarnOkDate: dbItem ? dbItem.yarnOkDate || '' : '',
                    matchingOptionDate: dbItem ? dbItem.matchingOptionDate || '' : '',
                    yarnDate: dbItem ? dbItem.yarnDate || '' : '',
                    source: dbItem ? 'Both' : 'Excel'
                });
            });

            // Store in groupedData so save-planning can access it
            groupedData[bookingNo] = data;
        }
    } catch (e) {
        console.error('Error fetching order detail:', e);
    }

    if (!data) {
        document.getElementById('detFabricItemsBody').innerHTML = '<tr><td colspan="20" class="p-10 text-center text-red-500">Failed to load order data.</td></tr>';
        return;
    }

    currentViewIndex = bookingNo;
    document.getElementById('listView').classList.add('hidden');
    document.getElementById('detailedView').classList.remove('hidden');

    const setSafeVal = (id, val) => {
        document.getElementById(id).value = (val !== undefined && val !== null && val !== '') ? val : '';
    };

    setSafeVal('detEWO', data.generalInfo.EWO);
    setSafeVal('detBookingNo', data.bookingNo);
    setSafeVal('detBookingDate', data.bookingDate);
    setSafeVal('detGmtUnit', data.generalInfo.GmtUnit);
    setSafeVal('detFloor', data.generalInfo.Floor);
    setSafeVal('detFinalConf', data.generalInfo.FinalConf);
    setSafeVal('detBPStatus', data.generalInfo.BPStatus);
    setSafeVal('detPMC', data.generalInfo.PMC);
    setSafeVal('detOrderStatus', data.generalInfo.OrderStatus || 'On Process');

    setSafeVal('detBuyer', data.buyers.size > 0 ? Array.from(data.buyers).join(', ') : 'N/A');
    setSafeVal('detBuyerTeam', data.buyerTeam);
    setSafeVal('detBookedBy', data.bookedBy);
    setSafeVal('detStyle', data.style);
    setSafeVal('detOrderQty', data.generalInfo.OrderQty);
    setSafeVal('detEventDay', data.generalInfo.EventDay);
    setSafeVal('detShip1', data.generalInfo.Ship1);
    setSafeVal('detShipLast', data.generalInfo.ShipLast);
    setSafeVal('detYarnDate', data.generalInfo.YarnDate);
    setSafeVal('detDeliStart', data.generalInfo.DeliStart);
    setSafeVal('detDeliEnd', data.generalInfo.DeliEnd);
    setSafeVal('detKnitStart', data.generalInfo.KnitStart);
    setSafeVal('detKnitEnd', data.generalInfo.KnitEnd);
    setSafeVal('detDyeStart', data.generalInfo.DyeStart);
    setSafeVal('detDyeEnd', data.generalInfo.DyeEnd);
    setSafeVal('detFabNotes', data.generalInfo.FabNotes);

    const itemBody = document.getElementById('detFabricItemsBody');
    let itemHtml = '';

    data.mergedItems.forEach((item) => {
        let rowClass = "hover:bg-blue-50 border-b border-gray-200 transition-colors fabric-row bg-white";
        let encodedItemData = encodeURIComponent(JSON.stringify(item.itemData || {}));

        itemHtml += `<tr class="${rowClass}" data-itemid="${item.itemId}" data-itemdata="${encodedItemData}">`;

        if (currentDept === 'knitting') {
            
            const leftCols = ['Color', 'FabricConstruction', 'GSM'];
            leftCols.forEach(c => {
                let val = item.itemData[c];
                itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px]">${val !== undefined && val !== null ? val : ''}</td>`;
            });

            
            let yarnDateVal = item.yarnDate || '';

            itemHtml += `
                <td class="p-2 border-r border-gray-300 dark:border-[#2a3346] text-center bg-yellow-50 dark:bg-yellow-900/10"><input type="date" class="row-yarn-date p-1 border border-yellow-300 dark:border-yellow-700/50 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none dark:bg-[#151921] dark:text-yellow-100" value="${yarnDateVal}" oninput="autoFillYarnDate(this)" onchange="autoFillYarnDate(this)"></td>
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-start-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none" value="${item.startDate || ''}" ${yarnDateVal ? `min="${yarnDateVal}"` : ''} onchange="enforceEndDateMin(this, 'row-end-date')"></td>
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-end-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none" value="${item.endDate || ''}" ${item.startDate ? `min="${item.startDate}"` : (yarnDateVal ? `min="${yarnDateVal}"` : '')} onchange="checkEndDateValid(this, 'row-start-date')"></td>
                <td class="p-2 border-r border-gray-300 text-center">
                    <select class="row-plan-type p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none cursor-pointer" data-prev-val="${item.planType || ''}" onchange="checkKnittingPlanType(this)">
                        <option value="" ${!item.planType ? 'selected' : ''}>Select</option>
                        <option value="Confirm" ${item.planType === 'Confirm' ? 'selected' : ''}>Confirm</option>
                        <option value="Tentative" ${item.planType === 'Tentative' ? 'selected' : ''}>Tentative</option>
                    </select>
                </td>
                <td class="p-2 border-r border-gray-300"><textarea rows="1" class="row-limitation resizable-table-input w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" placeholder="Limitation">${item.limitation || ''}</textarea></td>
                <td class="p-2 border-r border-gray-300"><textarea rows="1" class="row-remarks resizable-table-input w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" placeholder="Notes">${item.remarks || ''}</textarea></td>
            `;

            
            const rightCols = ['GreyReq', 'KnitProd', 'KnitBala', 'YarnReq', 'AllocatedQty', 'YarnBala', 'Allowance'];
            rightCols.forEach(c => {
                let val = item.itemData[c];
                itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px]">${val !== undefined && val !== null ? val : ''}</td>`;
            });
        }
        else if (currentDept === 'dyeing') {
            
            itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px]">${item.itemData['Color'] || ''}</td>`;

            let unitVal = item.itemData['Unit'] || '';
            const unitOptionsHtml = typeof buildDynamicOptions === 'function' 
                ? buildDynamicOptions('unit', unitVal)
                : `<option value="" ${!unitVal ? 'selected' : ''}>Select</option><option value="EFL" ${unitVal === 'EFL' ? 'selected' : ''}>EFL</option><option value="EKL" ${unitVal === 'EKL' ? 'selected' : ''}>EKL</option><option value="Ext" ${unitVal === 'Ext' ? 'selected' : ''}>Ext</option><option value="Outside" ${unitVal === 'Outside' ? 'selected' : ''}>Outside</option>`;

            itemHtml += `<td class="p-2 border-r border-gray-300 text-center min-w-[100px]">
                <select class="row-unit p-1 border border-gray-300 rounded text-[10px] w-full focus:border-blue-500 outline-none cursor-pointer">
                    ${unitOptionsHtml}
                </select>
            </td>`;

            let processVal = item.itemData['ProcessName'] || item.itemData['Process Name'] || '';
            const processOptionsHtml = typeof buildDynamicOptions === 'function'
                ? buildDynamicOptions('process', processVal)
                : `<option value="" ${!processVal ? 'selected' : ''}>Select</option><option value="Solid" ${processVal === 'Solid' ? 'selected' : ''}>Solid</option><option value="Dyeing Wash" ${processVal === 'Dyeing Wash' ? 'selected' : ''}>Dyeing Wash</option><option value="HTR" ${processVal === 'HTR' ? 'selected' : ''}>HTR</option><option value="Pluvia" ${processVal === 'Pluvia' ? 'selected' : ''}>Pluvia</option><option value="SB" ${processVal === 'SB' ? 'selected' : ''}>SB</option><option value="WH" ${processVal === 'WH' ? 'selected' : ''}>WH</option><option value="DF" ${processVal === 'DF' ? 'selected' : ''}>DF</option>`;

            itemHtml += `<td class="p-2 border-r border-gray-300 text-center min-w-[110px]">
                <select class="row-process p-1 border border-gray-300 rounded text-[10px] w-full focus:border-blue-500 outline-none cursor-pointer">
                    ${processOptionsHtml}
                </select>
            </td>`;

            let knitPlan = { start: '', end: '', type: '', limit: '', remark: '' };
            if (data.dbData && data.dbData.knitting) {
                let myColor = String(item.itemData.Color || '').trim().toLowerCase();
                const kItem = data.dbData.knitting.find(k => k.itemData && String(k.itemData.Color || '').trim().toLowerCase() === myColor);
                if (kItem) {
                    knitPlan.start = kItem.startDate || '';
                    knitPlan.end = kItem.endDate || '';
                    knitPlan.type = kItem.planType || '';
                    knitPlan.limit = kItem.limitation || '';
                    knitPlan.remark = kItem.remarks || '';
                }
            }

            const isKnitTypeSelected = Boolean(knitPlan.type && knitPlan.type !== 'Select' && knitPlan.type !== '-' && knitPlan.type !== '');
            const dyeDisabledAttr = !isKnitTypeSelected ? 'disabled' : '';
            const dyeDisabledCls = !isKnitTypeSelected ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800/60' : '';
            const dyeDisabledTitle = !isKnitTypeSelected ? 'title="Knitting Plan type selection is mandatory to input Dyeing plan"' : '';

            itemHtml += `
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px] knit-start" data-val="${knitPlan.start}">${formatDateDisplay(knitPlan.start)}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px] knit-end" data-val="${knitPlan.end}">${formatDateDisplay(knitPlan.end)}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px] font-semibold knit-type" data-val="${knitPlan.type}">${knitPlan.type || '-'}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[100px]">${knitPlan.limit}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[100px]">${knitPlan.remark}</td>
            `;

            itemHtml += `
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-start-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none ${dyeDisabledCls}" value="${item.startDate || ''}" ${dyeDisabledAttr} ${dyeDisabledTitle} onchange="enforceEndDateMin(this, 'row-end-date')"></td>
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-end-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none ${dyeDisabledCls}" value="${item.endDate || ''}" ${dyeDisabledAttr} ${dyeDisabledTitle} ${item.startDate ? `min="${item.startDate}"` : ''} onchange="checkEndDateValid(this, 'row-start-date')"></td>
                <td class="p-2 border-r border-gray-300 text-center">
                    <select class="row-plan-type p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none cursor-pointer ${dyeDisabledCls}" ${dyeDisabledAttr} ${dyeDisabledTitle}>
                        <option value="" ${!item.planType ? 'selected' : ''}>Select</option>
                        <option value="Confirm" ${item.planType === 'Confirm' ? 'selected' : ''}>Confirm</option>
                        <option value="Tentative" ${item.planType === 'Tentative' ? 'selected' : ''}>Tentative</option>
                    </select>
                </td>
                <td class="p-2 border-r border-gray-300"><textarea rows="1" class="row-limitation resizable-table-input w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" placeholder="Limitation">${item.limitation || ''}</textarea></td>
                <td class="p-2 border-r border-gray-300"><textarea rows="1" class="row-remarks resizable-table-input w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" placeholder="Notes">${item.remarks || ''}</textarea></td>
            `;

            const numCols = ['BPQty', 'DyeingProd', 'DyeingBala', 'KnitProd', 'KnitBala'];
            numCols.forEach(c => {
                let val = item.itemData[c];
                itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px]">${val !== undefined && val !== null ? val : ''}</td>`;
            });
        }
        else if (currentDept === 'delivery') {
            itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px]">${item.itemData['Color'] || ''}</td>`;
            itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px]">${item.itemData['FabricConstruction'] || ''}</td>`;
            itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px]">${item.itemData['GSM'] || ''}</td>`;

            let knitPlan = { start: '', end: '' };
            let dyePlan = { start: '', end: '', type: '' };

            if (data.dbData) {
                let myColor = String(item.itemData.Color || '').trim().toLowerCase();
                let myConst = String(item.itemData.FabricConstruction || '').trim().toLowerCase();

                if (data.dbData.knitting) {
                    const kItem = data.dbData.knitting.find(k => k.itemData && String(k.itemData.Color || '').trim().toLowerCase() === myColor && String(k.itemData.FabricConstruction || '').trim().toLowerCase() === myConst);
                    if (kItem) { knitPlan.start = kItem.startDate || ''; knitPlan.end = kItem.endDate || ''; }
                }
                if (data.dbData.dyeing) {
                    const dItem = data.dbData.dyeing.find(d => d.itemData && String(d.itemData.Color || '').trim().toLowerCase() === myColor);
                    if (dItem) { dyePlan.start = dItem.startDate || ''; dyePlan.end = dItem.endDate || ''; dyePlan.type = dItem.planType || ''; }
                }
            }

            const isDyeTypeSelected = Boolean(dyePlan.type && dyePlan.type !== 'Select' && dyePlan.type !== '-' && dyePlan.type !== '');
            const deliDisabledAttr = !isDyeTypeSelected ? 'disabled' : '';
            const deliDisabledCls = !isDyeTypeSelected ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800/60' : '';
            const deliDisabledTitle = !isDyeTypeSelected ? 'title="Dyeing Plan type selection is mandatory to input Delivery plan"' : '';

            // Generate Floor Dates
            let floorStart = item.floorStartDate || '';
            let floorEnd = item.floorEndDate || '';
            let floorPlanType = item.floorPlanType || '';

            if (isDyeTypeSelected) {
                if (!item.floorStartDate && dyePlan.start) {
                    let d = new Date(dyePlan.start);
                    d.setDate(d.getDate() + 7);
                    floorStart = d.toISOString().split('T')[0];
                }
                if (!item.floorEndDate && dyePlan.end) {
                    let d = new Date(dyePlan.end);
                    d.setDate(d.getDate() + 7);
                    floorEnd = d.toISOString().split('T')[0];
                }
                if (!item.floorPlanType) {
                    floorPlanType = 'Tentative';
                }
            }

            itemHtml += `
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-floor-start p-1 border border-gray-300 rounded text-[10px] w-[110px] focus:border-blue-500 outline-none bg-blue-50 ${deliDisabledCls}" value="${floorStart}" ${deliDisabledAttr} ${deliDisabledTitle} onchange="enforceEndDateMin(this, 'row-floor-end')"></td>
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-floor-end p-1 border border-gray-300 rounded text-[10px] w-[110px] focus:border-blue-500 outline-none bg-blue-50 ${deliDisabledCls}" value="${floorEnd}" ${deliDisabledAttr} ${deliDisabledTitle} ${floorStart ? `min="${floorStart}"` : ''} onchange="checkEndDateValid(this, 'row-floor-start')"></td>
                <td class="p-2 border-r border-gray-300 text-center">
                    <select class="row-floor-plan p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none cursor-pointer ${deliDisabledCls}" ${deliDisabledAttr} ${deliDisabledTitle}>
                        <option value="" ${!floorPlanType ? 'selected' : ''}>Select</option>
                        <option value="Confirm" ${floorPlanType === 'Confirm' ? 'selected' : ''}>Confirm</option>
                        <option value="Tentative" ${floorPlanType === 'Tentative' ? 'selected' : ''}>Tentative</option>
                    </select>
                </td>
            `;

            itemHtml += `
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-start-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none ${deliDisabledCls}" value="${item.startDate || ''}" ${deliDisabledAttr} ${deliDisabledTitle} onchange="enforceEndDateMin(this, 'row-end-date')"></td>
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-end-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none ${deliDisabledCls}" value="${item.endDate || ''}" ${deliDisabledAttr} ${deliDisabledTitle} ${item.startDate ? `min="${item.startDate}"` : ''} onchange="checkEndDateValid(this, 'row-start-date')"></td>
                <td class="p-2 border-r border-gray-300 text-center">
                    <select class="row-plan-type p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none cursor-pointer ${deliDisabledCls}" ${deliDisabledAttr} ${deliDisabledTitle}>
                        <option value="" ${!item.planType ? 'selected' : ''}>Select</option>
                        <option value="Confirm" ${item.planType === 'Confirm' ? 'selected' : ''}>Confirm</option>
                        <option value="Tentative" ${item.planType === 'Tentative' ? 'selected' : ''}>Tentative</option>
                    </select>
                </td>
                <td class="p-2 border-r border-gray-300"><textarea rows="1" class="row-limitation resizable-table-input w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" placeholder="Limitation">${item.limitation || ''}</textarea></td>
                <td class="p-2 border-r border-gray-300"><textarea rows="1" class="row-remarks resizable-table-input w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" placeholder="Notes">${item.remarks || ''}</textarea></td>
            `;

            itemHtml += `
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px] dye-start" data-val="${dyePlan.start}">${formatDateDisplay(dyePlan.start)}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px] dye-end" data-val="${dyePlan.end}">${formatDateDisplay(dyePlan.end)}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px] font-semibold dye-type" data-val="${dyePlan.type}">${dyePlan.type || '-'}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px] knit-start" data-val="${knitPlan.start}">${formatDateDisplay(knitPlan.start)}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px] knit-end" data-val="${knitPlan.end}">${formatDateDisplay(knitPlan.end)}</td>
            `;

            const numCols = ['RequiredQtyKgs', 'NetReceivedQtyKgs', 'NetDeliveryQtyKgs', 'DeliBal', 'RFD', 'Slowmoving', 'FFStock'];
            numCols.forEach(c => {
                let val = item.itemData[c];
                itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px]">${val !== undefined && val !== null ? val : ''}</td>`;
            });
        }
        else if (currentDept === 'yd') {
            const leftCols = ['Booking Type', 'YDB', 'YD Booking Date'];
            leftCols.forEach(c => {
                let val = item.itemData[c];
                if (c === 'YD Booking Date' && typeof val === 'number') {
                    val = formatExcelDate(val);
                }
                itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px]">${val !== undefined && val !== null ? val : ''}</td>`;
            });

            itemHtml += `
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-start-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none" value="${item.startDate || ''}" onchange="enforceEndDateMin(this, 'row-end-date'); syncFloorDates(this, 'start')"></td>
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-end-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none" value="${item.endDate || ''}" ${item.startDate ? `min="${item.startDate}"` : ''} onchange="checkEndDateValid(this, 'row-start-date'); syncFloorDates(this, 'end')"></td>
                <td class="p-2 border-r border-gray-300 text-center">
                    <select class="row-plan-type p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none cursor-pointer">
                        <option value="" ${!item.planType ? 'selected' : ''}>Select</option>
                        <option value="Confirm" ${item.planType === 'Confirm' ? 'selected' : ''}>Confirm</option>
                        <option value="Tentative" ${item.planType === 'Tentative' ? 'selected' : ''}>Tentative</option>
                    </select>
                </td>
                <td class="p-2 border-r border-gray-300"><textarea rows="1" class="row-limitation resizable-table-input w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" placeholder="Limitation">${item.limitation || ''}</textarea></td>
                <td class="p-2 border-r border-gray-300"><textarea rows="1" class="row-remarks resizable-table-input w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" placeholder="Remarks">${item.remarks || ''}</textarea></td>
            `;

            let knitPlan = { start: '', end: '' };
            if (data.dbData && data.dbData.knitting && data.dbData.knitting.length > 0) {
                const kItem = data.dbData.knitting[0];
                if (kItem) { knitPlan.start = kItem.startDate || ''; knitPlan.end = kItem.endDate || ''; }
            } else {
                let parsedKnitStart = data.generalInfo.KnitStart !== 'N/A' && data.generalInfo.KnitStart !== '-' ? data.generalInfo.KnitStart : '';
                let parsedKnitEnd = data.generalInfo.KnitEnd !== 'N/A' && data.generalInfo.KnitEnd !== '-' ? data.generalInfo.KnitEnd : '';
                // Since format is dd-Mon-yy, we may need to skip converting if it's already display string, 
                // but formatDateDisplay handles both string and actual date parsing gracefully.
                // However here we just show what we got.
                knitPlan.start = parsedKnitStart;
                knitPlan.end = parsedKnitEnd;
            }
            
            let floorStart = item.floorStartDate || '';
            let floorEnd = item.floorEndDate || '';
            let floorPlanType = item.floorPlanType || '';
            let yarnOkDate = item.yarnOkDate || '';
            let matchingOptionDate = item.matchingOptionDate || '';

            let ydTnAStart = item.itemData['YD T&A Start'] || '';
            let ydTnAEnd = item.itemData['YD T&A End'] || '';
            if (typeof ydTnAStart === 'number') ydTnAStart = formatExcelDate(ydTnAStart);
            if (typeof ydTnAEnd === 'number') ydTnAEnd = formatExcelDate(ydTnAEnd);

            // Default dates for Floor
            if (!item.floorStartDate && item.startDate) {
                let d = new Date(item.startDate);
                d.setDate(d.getDate() - 4);
                floorStart = d.toISOString().split('T')[0];
            }
            if (!item.floorEndDate && item.endDate) {
                let d = new Date(item.endDate);
                d.setDate(d.getDate() - 4);
                floorEnd = d.toISOString().split('T')[0];
            }
            if (!item.floorPlanType) {
                floorPlanType = '';
            }

            itemHtml += `
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-yarn-ok-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none" value="${yarnOkDate}"></td>
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-matching-option-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none" value="${matchingOptionDate}"></td>
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-floor-start p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none" value="${floorStart}" onchange="enforceEndDateMin(this, 'row-floor-end')"></td>
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-floor-end p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none" value="${floorEnd}" ${floorStart ? `min="${floorStart}"` : ''} onchange="checkEndDateValid(this, 'row-floor-start')"></td>
                <td class="p-2 border-r border-gray-300 text-center">
                    <select class="row-floor-plan p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none cursor-pointer">
                        <option value="" ${!floorPlanType ? 'selected' : ''}>Select</option>
                        <option value="Confirm" ${floorPlanType === 'Confirm' ? 'selected' : ''}>Confirm</option>
                        <option value="Tentative" ${floorPlanType === 'Tentative' ? 'selected' : ''}>Tentative</option>
                    </select>
                </td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px]">${ydTnAStart}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px]">${ydTnAEnd}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px]">${knitPlan.start && knitPlan.start.includes('-') && knitPlan.start.length === 10 ? formatDateDisplay(knitPlan.start) : knitPlan.start}</td>
                <td class="p-2 border-r border-gray-300 text-center text-gray-500 bg-gray-50 min-w-[80px]">${knitPlan.end && knitPlan.end.includes('-') && knitPlan.end.length === 10 ? formatDateDisplay(knitPlan.end) : knitPlan.end}</td>
            `;

            const rightCols = ['Barrier Qty.', 'Workable Qty.', 'YD REQ.', 'DYED', 'YD BALANCE', 'YD Delivered', 'YD DELIVERY BALANCE'];
            rightCols.forEach(c => {
                let val = item.itemData[c];
                let className = c === 'YD DELIVERY BALANCE' ? 'text-red-600 font-bold' : '';
                
                if (c === 'Barrier Qty.') {
                    itemHtml += `<td class="p-2 border-r border-gray-300 text-center min-w-[80px]"><input type="number" class="row-barrier-qty w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" value="${val !== undefined && val !== null ? val : ''}"></td>`;
                } else if (c === 'Workable Qty.') {
                    itemHtml += `<td class="p-2 border-r border-gray-300 text-center min-w-[80px]"><input type="number" class="row-workable-qty w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" value="${val !== undefined && val !== null ? val : ''}"></td>`;
                } else {
                    itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px] ${className}">${val !== undefined && val !== null ? val : ''}</td>`;
                }
            });
        }
        else {
            let cols = ['OrderNo', 'Color', 'RequiredQtyKgs', 'Buyer', 'Unit', 'ProcessName', 'GreyReq', 'KnitProd', 'KnitBala', 'BPQty', 'DyeingProd', 'DyeingBala', 'NetReceivedQtyKgs', 'NetDeliveryQtyKgs', 'RFD', 'Slowmoving', 'FFStock'];

            cols.forEach(c => {
                let val = item.itemData[c];
                itemHtml += `<td class="p-2 border-r border-gray-300 text-center whitespace-normal min-w-[80px]">${val !== undefined && val !== null ? val : ''}</td>`;
            });

            itemHtml += `
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-start-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none" value="${item.startDate || ''}" onchange="enforceEndDateMin(this, 'row-end-date')"></td>
                <td class="p-2 border-r border-gray-300 text-center"><input type="date" class="row-end-date p-1 border border-gray-300 rounded text-[10px] w-[90px] focus:border-blue-500 outline-none" value="${item.endDate || ''}" ${item.startDate ? `min="${item.startDate}"` : ''} onchange="checkEndDateValid(this, 'row-start-date')"></td>
                <td class="p-2 border-r border-gray-300 text-center">
                    <select class="row-plan-type p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none cursor-pointer">
                        <option value="" ${!item.planType ? 'selected' : ''}>Select</option>
                        <option value="Confirm" ${item.planType === 'Confirm' ? 'selected' : ''}>Confirm</option>
                        <option value="Tentative" ${item.planType === 'Tentative' ? 'selected' : ''}>Tentative</option>
                    </select>
                </td>
                <td class="p-2 border-r border-gray-300"><textarea rows="1" class="row-limitation resizable-table-input w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" placeholder="Limitation">${item.limitation || ''}</textarea></td>
                <td class="p-2 border-r border-gray-300"><textarea rows="1" class="row-remarks resizable-table-input w-full p-1 border border-gray-300 rounded text-[10px] focus:border-blue-500 outline-none" placeholder="Notes">${item.remarks || ''}</textarea></td>
            `;
        }

        itemHtml += `</tr>`;
    });
    itemBody.innerHTML = itemHtml;

    const userRole = localStorage.getItem('role');
    const isAdmin = userRole ? (userRole.toLowerCase() === 'admin' || userRole.toLowerCase() === 'approver') : false;

    document.querySelectorAll('#detFabricItemsBody .fabric-row').forEach(row => {
        const planSelect = row.querySelector('.row-plan-type');
        const startInput = row.querySelector('.row-start-date');
        const endInput = row.querySelector('.row-end-date');

        const isConfirmed = planSelect && planSelect.value === 'Confirm';

        if (isConfirmed && !isAdmin) {
            if (planSelect) planSelect.disabled = true;
            if (startInput) startInput.disabled = true;
            if (endInput) endInput.disabled = true;
        }

        if (currentDept === 'delivery') {
            const dyeStart = row.querySelector('.dye-start')?.dataset.val;
            if (!dyeStart || dyeStart === '-' || dyeStart === '') {
                if (planSelect) planSelect.disabled = true;
                if (startInput) startInput.disabled = true;
                if (endInput) endInput.disabled = true;
            }
        }
    });

    if (currentDept === 'dyeing') {
        const unitInputs = document.querySelectorAll('#detFabricItemsBody .row-unit');
        const processInputs = document.querySelectorAll('#detFabricItemsBody .row-process');

        const checkAndToggleRow = (row) => {
            const unitVal = row.querySelector('.row-unit').value;
            const processVal = row.querySelector('.row-process').value;

            const isReady = unitVal !== '' && unitVal !== 'Select' && processVal !== '' && processVal !== 'Select';

            const inputsToToggle = row.querySelectorAll('.row-start-date, .row-end-date, .row-plan-type, .row-limitation, .row-remarks');

            inputsToToggle.forEach(inp => {
                if (!isReady) {
                    inp.disabled = true;
                    inp.classList.add('bg-gray-100', 'cursor-not-allowed');
                } else {
                    const planSelect = row.querySelector('.row-plan-type');
                    const isConfirmed = planSelect && planSelect.value === 'Confirm';

                    if (isConfirmed && !isAdmin && (inp.classList.contains('row-start-date') || inp.classList.contains('row-end-date') || inp.classList.contains('row-plan-type'))) {
                        inp.disabled = true;
                    } else {
                        inp.disabled = false;
                        inp.classList.remove('bg-gray-100', 'cursor-not-allowed');
                    }
                }
            });
        };

        document.querySelectorAll('#detFabricItemsBody .fabric-row').forEach(row => checkAndToggleRow(row));

        unitInputs.forEach((input, index) => {
            input.addEventListener('change', function () {
                const newVal = this.value;
                checkAndToggleRow(this.closest('tr'));
                if (index === 0) {
                    unitInputs.forEach((otherInput, idx) => {
                        if (idx !== 0) {
                            otherInput.value = newVal;
                            checkAndToggleRow(otherInput.closest('tr'));
                        }
                    });
                }
            });
        });

        processInputs.forEach((input, index) => {
            input.addEventListener('change', function () {
                const newVal = this.value;
                checkAndToggleRow(this.closest('tr'));
                if (index === 0) {
                    processInputs.forEach((otherInput, idx) => {
                        if (idx !== 0) {
                            otherInput.value = newVal;
                            checkAndToggleRow(otherInput.closest('tr'));
                        }
                    });
                }
            });
        });
    }

    
    if (currentDept === 'knitting' || currentDept === 'dyeing' || currentDept === 'delivery') {
        const startDateInputs = document.querySelectorAll('#detFabricItemsBody .row-start-date');
        const endDateInputs = document.querySelectorAll('#detFabricItemsBody .row-end-date');
        const planTypeInputs = document.querySelectorAll('#detFabricItemsBody .row-plan-type');

        const isValidStartDate = (row, newStart) => {
            const endVal = row.querySelector('.row-end-date').value;
            if (newStart && endVal && new Date(newStart) > new Date(endVal)) {
                showToast("Start Date cannot be greater than End Date!");
                return false;
            }
            if (currentDept === 'dyeing' && newStart) {
                const knitStart = row.querySelector('.knit-start').dataset.val;
                const knitEnd = row.querySelector('.knit-end').dataset.val;
                const knitType = row.querySelector('.knit-type').dataset.val;

                if (!knitStart && !knitEnd && (!knitType || knitType === 'Select' || knitType === '')) {
                    showToast("Cannot set Dyeing plan because Knitting plan is blank!");
                    return false;
                }

                if (knitStart && new Date(newStart).setHours(0, 0, 0, 0) < new Date(knitStart).setHours(0, 0, 0, 0)) {
                    showToast("Dyeing Start Date cannot be less than Knitting Start Date!");
                    return false;
                }
            }
            return true;
        };

        const isValidEndDate = (row, newEnd) => {
            const startVal = row.querySelector('.row-start-date').value;
            if (startVal && newEnd && new Date(startVal) > new Date(newEnd)) {
                showToast("Start Date cannot be greater than End Date!");
                return false;
            }
            if (currentDept === 'dyeing' && newEnd) {
                const knitStart = row.querySelector('.knit-start').dataset.val;
                const knitEnd = row.querySelector('.knit-end').dataset.val;
                const knitType = row.querySelector('.knit-type').dataset.val;

                if (!knitStart && !knitEnd && (!knitType || knitType === 'Select' || knitType === '')) {
                    showToast("Cannot set Dyeing plan because Knitting plan is blank!");
                    return false;
                }

                if (knitEnd && new Date(newEnd).setHours(0, 0, 0, 0) < new Date(knitEnd).setHours(0, 0, 0, 0)) {
                    showToast("Dyeing End Date cannot be less than Knitting End Date!");
                    return false;
                }
            }
            return true;
        };

        const isValidPlanType = (row, startVal, endVal, planTypeVal) => {
            if ((planTypeVal === 'Confirm' || planTypeVal === 'Tentative') && (!startVal || !endVal)) {
                showToast("Start and End dates are required to set Plan Type.");
                return false;
            }
            if (currentDept === 'dyeing' && planTypeVal) {
                const knitStart = row.querySelector('.knit-start').dataset.val;
                const knitEnd = row.querySelector('.knit-end').dataset.val;
                const knitType = String(row.querySelector('.knit-type').dataset.val || "").trim();

                if (!knitStart && !knitEnd && (!knitType || knitType === 'Select' || knitType === '')) {
                    showToast("Cannot set Dyeing plan because Knitting plan is blank!");
                    return false;
                }

                if (planTypeVal === 'Confirm' && knitType === 'Tentative') {
                    showToast("Cannot confirm Dyeing when Knitting is Tentative.");
                    return false;
                }

                if (planTypeVal === 'Confirm') {
                    const finalConf = document.getElementById('detFinalConf').value.trim().toLowerCase();

                    if (finalConf === 'no') {
                        showToast("Cannot confirm Dyeing because Final Confirmation is 'No'.");
                        return false;
                    }
                }
            }

            if (currentDept === 'delivery' && planTypeVal) {
                const dyeType = String(row.querySelector('.dye-type').dataset.val || "").trim();

                if (planTypeVal === 'Confirm' && (dyeType === 'Tentative' || dyeType === '-' || dyeType === '')) {
                    showToast("Cannot confirm Delivery when Dyeing is Tentative or blank.");
                    return false;
                }
            }

            return true;
        };

        startDateInputs.forEach((input, index) => {
            input.addEventListener('change', function () {
                const newVal = this.value;
                const row = this.closest('tr');
                const endVal = row.querySelector('.row-end-date').value;
                const planTypeInput = row.querySelector('.row-plan-type');

                if (!isValidStartDate(row, newVal)) { this.value = ""; return; }
                if (!isValidPlanType(row, newVal, endVal, planTypeInput.value)) planTypeInput.value = "";

                if (index === 0) {
                    startDateInputs.forEach((otherInput, idx) => {
                        if (idx !== 0) {
                            const otherRow = otherInput.closest('tr');
                            if (isValidStartDate(otherRow, newVal)) {
                                otherInput.value = newVal;
                                const otherPlan = otherRow.querySelector('.row-plan-type');
                                if (!isValidPlanType(otherRow, newVal, otherRow.querySelector('.row-end-date').value, otherPlan.value)) otherPlan.value = "";
                            } else {
                                otherInput.value = "";
                            }
                        }
                    });
                }
            });
        });

        endDateInputs.forEach((input, index) => {
            input.addEventListener('change', function () {
                const newVal = this.value;
                const row = this.closest('tr');
                const startVal = row.querySelector('.row-start-date').value;
                const planTypeInput = row.querySelector('.row-plan-type');

                if (!isValidEndDate(row, newVal)) { this.value = ""; return; }
                if (!isValidPlanType(row, startVal, newVal, planTypeInput.value)) planTypeInput.value = "";

                if (index === 0) {
                    endDateInputs.forEach((otherInput, idx) => {
                        if (idx !== 0) {
                            const otherRow = otherInput.closest('tr');
                            if (isValidEndDate(otherRow, newVal)) {
                                otherInput.value = newVal;
                                const otherPlan = otherRow.querySelector('.row-plan-type');
                                if (!isValidPlanType(otherRow, otherRow.querySelector('.row-start-date').value, newVal, otherPlan.value)) otherPlan.value = "";
                            } else {
                                otherInput.value = "";
                            }
                        }
                    });
                }
            });
        });

        planTypeInputs.forEach((input, index) => {
            input.addEventListener('change', function () {
                const newVal = this.value;
                const row = this.closest('tr');
                const startVal = row.querySelector('.row-start-date').value;
                const endVal = row.querySelector('.row-end-date').value;

                if (!isValidPlanType(row, startVal, endVal, newVal)) {
                    this.value = "";
                    this.selectedIndex = 0;
                    return;
                }

                if (index === 0) {
                    planTypeInputs.forEach((otherInput, idx) => {
                        if (idx !== 0) {
                            if (newVal === "") {
                                otherInput.value = "";
                                otherInput.selectedIndex = 0;
                            } else {
                                const otherRow = otherInput.closest('tr');
                                const otherStart = otherRow.querySelector('.row-start-date').value;
                                const otherEnd = otherRow.querySelector('.row-end-date').value;
                                if (isValidPlanType(otherRow, otherStart, otherEnd, newVal)) {
                                    otherInput.value = newVal;
                                } else {
                                    otherInput.value = "";
                                    otherInput.selectedIndex = 0;
                                }
                            }
                        }
                    });
                }
            });
        });

        const floorStartInputs = document.querySelectorAll('#detFabricItemsBody .row-floor-start');
        const floorEndInputs = document.querySelectorAll('#detFabricItemsBody .row-floor-end');
        const floorPlanInputs = document.querySelectorAll('#detFabricItemsBody .row-floor-plan');

        if (floorStartInputs.length > 0) {
            floorStartInputs.forEach((input, index) => {
                input.addEventListener('change', function () {
                    if (index === 0) {
                        const newVal = this.value;
                        floorStartInputs.forEach((otherInput, idx) => {
                            if (idx !== 0) otherInput.value = newVal;
                        });
                    }
                });
            });

            floorEndInputs.forEach((input, index) => {
                input.addEventListener('change', function () {
                    if (index === 0) {
                        const newVal = this.value;
                        floorEndInputs.forEach((otherInput, idx) => {
                            if (idx !== 0) otherInput.value = newVal;
                        });
                    }
                });
            });

            floorPlanInputs.forEach((input, index) => {
                input.addEventListener('change', function () {
                    if (index === 0) {
                        const newVal = this.value;
                        floorPlanInputs.forEach((otherInput, idx) => {
                            if (idx !== 0) otherInput.value = newVal;
                        });
                    }
                });
            });
        }
    }
}

function closeDetailedView() {
    document.getElementById('detailedView').classList.add('hidden');
    document.getElementById('listView').classList.remove('hidden');
    currentViewIndex = null;
}

