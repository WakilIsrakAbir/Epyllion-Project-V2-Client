// ==========================================================
// TABS & SIDEBAR: Tab Management, Sidebar
// ==========================================================
function renderTabs() {
    const container = document.getElementById('dynamicTabsWrapper'); let tabHtml = '';
    const tabBar = document.getElementById('tabBarContainer');
    if (openTabs.length === 0) {
        if(tabBar) tabBar.classList.add('hidden');
    } else {
        if(tabBar) tabBar.classList.remove('hidden');
    }
    openTabs.forEach(t => {
        let onClickStr = `loadMenuData('${t.dept}', '${t.title}', '${t.mode}')`;
        if(t.mode === 'actualTracking') onClickStr = `loadActualTracking('${t.dept}')`;
        else if(t.mode === 'trackingReport') onClickStr = `loadTrackingReport('${t.dept}')`;
        else if(t.mode === 'loadCalculation') onClickStr = `showLoadCalculation('${t.dept}')`;
        else if(t.mode === 'planFilter') onClickStr = `showPlanFilter('${t.dept}')`;
        else if(t.mode === 'planTrackingFilter') onClickStr = `showPlanVsActualTrackingFilter('${t.dept}')`;
        else if(t.mode === 'planningProdInfo') onClickStr = `showPlanningProdInfo()`;
        else if(t.mode === 'batch') onClickStr = `showBatchTab('${t.dept}')`;
        
        tabHtml += `<div class="px-3 sm:px-4 py-2 text-[11px] sm:text-[13px] border border-gray-200 border-b-0 rounded-t cursor-pointer flex items-center shrink-0 transition-colors ${activeTabId === t.id ? 'bg-white font-bold text-gray-800' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}" onclick="${onClickStr}">${t.title} <i class="fas fa-times ml-2 text-[10px] text-gray-400 hover:text-red-500 transition-colors" onclick="closeTab(event, '${t.id}')"></i></div>`;
    });
    container.innerHTML = tabHtml;
}
function closeTab(e, id) {
    e.stopPropagation(); openTabs = openTabs.filter(t => t.id !== id);
    if (openTabs.length === 0) showDashboardHome(); 
    else {
        let t = openTabs[0];
        if(t.mode === 'actualTracking') loadActualTracking(t.dept);
        else if(t.mode === 'trackingReport') loadTrackingReport(t.dept);
        else if(t.mode === 'loadCalculation') showLoadCalculation(t.dept);
        else if(t.mode === 'planFilter') showPlanFilter(t.dept);
        else if(t.mode === 'planTrackingFilter') showPlanVsActualTrackingFilter(t.dept);
        else if(t.mode === 'planningProdInfo') showPlanningProdInfo();
        else if(t.mode === 'batch') showBatchTab(t.dept);
        else loadMenuData(t.dept, t.title, t.mode);
    }
}
function toggleSubmenu(header, id) {
    const m = document.getElementById(id); const i = header.querySelector('.fa-chevron-left');
    m.classList.toggle('hidden'); i.classList.toggle('-rotate-90');
}
function toggleSidebar() {
    const s = document.getElementById('sidebar'); const overlay = document.getElementById('mobileOverlay');
    if (window.innerWidth >= 768) s.classList.toggle('sidebar-collapsed');
    else { s.classList.toggle('-translate-x-full'); overlay.classList.toggle('hidden'); }
}
function closeSidebarMobile() {
    if (window.innerWidth < 768) { document.getElementById('sidebar').classList.add('-translate-x-full'); document.getElementById('mobileOverlay').classList.add('hidden'); }
}

    function downloadCompletedList() {
        let compData = Object.values(groupedData).filter(g => g.generalInfo && g.generalInfo.OrderStatus === 'Completed');
        if (compData.length === 0) return showToast("No completed data to download");

        compData.sort((a, b) => new Date(a.generalInfo.CompletedDate || 0) - new Date(b.generalInfo.CompletedDate || 0));

        let exportArr = compData.map(d => ({
            "Order/Booking No": d.bookingNo,
            "Completed Date": d.generalInfo.CompletedDate ? formatDateDisplay(d.generalInfo.CompletedDate) : 'N/A',
            "Buyer": Array.from(d.buyers).join(', '),
            "Status": "Completed"
        }));

        const ws = XLSX.utils.json_to_sheet(exportArr);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Completed List");
        XLSX.writeFile(wb, `${activeTabId.replace('_report', '')}_Completed_List.xlsx`);
    }

        async function clearAllPlanningData() {
            if (confirm("⚠️ WARNING: Are you sure you want to delete ALL saved planning, statuses, AND all uploaded Excel files? This action will completely reset the system.")) {
                const adminPassword = prompt("Please enter your Admin Password to confirm complete system wipe:");
                if (!adminPassword) {
                    showToast("Action cancelled. Admin password required.");
                    return;
                }

                showToast("Initiating complete system wipe...");
                try {
                    const res = await fetch('https://abir-backend-api.onrender.com/api/files/clear-all-planning', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ adminPassword })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        showToast("System completely reset! All data and files deleted.");
                        markDataDirty();
                        loadUploadedFiles();
                        await fetchAndProcessData(true);
                        renderMainTable();
                    } else {
                        showToast(data.message || "Failed to clear database. Invalid password or permissions.", true);
                    }
                } catch (e) {
                    showToast("Server Connection Error!", true);
                }
            }
        }
