// ==========================================================
// FILE UPLOAD: Upload, List, Delete Files
// ==========================================================
async function handleExcelUpload() {
    const file = document.getElementById('excelFile').files[0];
    if (!file) return alert("Select file first");
    const fd = new FormData();
    fd.append('document', file);
    fd.append('uploadedBy', localStorage.getItem('username'));
    fd.append('role', localStorage.getItem('role'));
    fd.append('category', activeUploadCategory);

    try {
        const res = await fetch('https://abir-backend-api.onrender.com/api/files/upload', { method: 'POST', body: fd });
        if (res.ok) {
            showToast("Upload Success!");
            document.getElementById('excelFile').value = '';
            markDataDirty(); // Invalidate caches so next load fetches fresh data
            loadUploadedFiles();
            if (activeTabId !== 'dashboard' && activeTabId !== 'dataManagement') fetchAndProcessData();
        } else {
            let message = "Upload error";
            try { const data = await res.json(); if (data && data.message) message = data.message; } catch (e) {}
            alert(message);
        }
    } catch (e) { alert("Server error"); }
}

async function loadUploadedFiles() {
    try {
        const res = await fetch(`https://abir-backend-api.onrender.com/api/files/all`);
        const allFiles = await res.json();
        const body = document.getElementById('fileListBody');

        const filteredFiles = allFiles.filter(f => {
            const fileCat = f.category || 'General';
            return fileCat === activeUploadCategory;
        });

        const uniqueFilesMap = new Map();
        filteredFiles.forEach(f => {
            if (!uniqueFilesMap.has(f.originalName)) {
                uniqueFilesMap.set(f.originalName, f);
            }
        });

        const displayFiles = Array.from(uniqueFilesMap.values());

        let fileHtml = '';
        if (displayFiles.length === 0) {
            fileHtml = `<tr><td colspan="5" class="p-4 text-center text-gray-500 font-medium">No ${activeUploadCategory} files uploaded yet.</td></tr>`;
        } else {
            const permsStr = localStorage.getItem('permissions');
            let canDelete = false;
            if (permsStr) {
                try {
                    const p = JSON.parse(permsStr);
                    if (p.actions && p.actions.deleteFiles) canDelete = true;
                } catch(e){}
            }

            displayFiles.forEach(f => {
                const catBadge = f.category ? `<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold text-[10px]">${f.category}</span>` : `<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-bold text-[10px]">General</span>`;
                const deleteBtn = canDelete ? `<button onclick="deleteFileGroup('${f.originalName}', '${f.category || 'General'}')" class="bg-red-100 text-red-500 hover:bg-red-500 hover:text-white px-2 py-1 rounded transition-colors" title="Delete"><i class="fas fa-trash"></i></button>` : '';
                fileHtml += `
                <tr class="border-b hover:bg-gray-50 transition-colors">
                    <td class="p-2">${catBadge}</td>
                    <td class="p-2 text-blue-600 font-medium"><i class="fas fa-file-excel mr-1 text-gray-400"></i> ${f.originalName}</td>
                    <td class="p-2 font-semibold">${f.uploadedBy}</td>
                    <td class="p-2 text-xs text-gray-500">${new Date(f.createdAt).toLocaleString()}</td>
                    <td class="p-2 text-center">
                        ${deleteBtn}
                    </td>
                </tr>`;
            });
        }
        body.innerHTML = fileHtml;
    } catch (e) { console.error("Load file err", e); }
}

// Removes the stored copies of the older versions of one file. The server keeps the file in use (the
// latest upload) and the upload history, and never touches planning data.
async function deleteFileGroup(originalName, category) {
    if (confirm(`Remove the stored copies of the older versions of '${originalName}'?\n\nThe file in use (the latest upload) is kept, the upload history stays, and no planning data is deleted.`)) {
        try {
            const res = await fetch(`https://abir-backend-api.onrender.com/api/files/all`);
            const allFiles = await res.json();
            const versions = allFiles.filter(f => f.originalName === originalName && (f.category || 'General') === category && !f.blobDeleted);

            showToast("Removing old copies...");
            let removed = 0;
            for (let f of versions) {
                const r = await fetch(`https://abir-backend-api.onrender.com/api/files/${f._id}`, { method: 'DELETE' });
                if (r.ok) removed++;
            }
            showToast(removed ? `${removed} old ${removed === 1 ? 'copy' : 'copies'} removed. The file in use was kept.` : "Only the file in use is stored, and it was kept.");
            loadUploadedFiles();
        } catch (e) { alert("Delete error"); }
    }
}

