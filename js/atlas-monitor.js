// ==========================================================
// ATLAS MONITOR (Data Management > Atlas Monitor)
// Database health from GET /api/monitor/stats, drawn as SVG charts, and the
// database backup download (GET /api/monitor/backup, Admin only).
// Additive: hooks into core.js the same way js/batch-module.js does.
// ==========================================================
(function () {
  const API = (typeof API_BASE !== "undefined" ? API_BASE : "https://abir-backend-api.onrender.com") + "/api/monitor";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STATUS_SERIES = [
    ["Confirm", "--am-s1", "--am-on-s1"],
    ["Tentative", "--am-s2", "--am-on-s2"],
    ["Pending", "--am-s3", "--am-on-s3"],
    ["Completed", "--am-s4", "--am-on-s4"],
  ];
  const DEPT_LABELS = [["yd", "YD"], ["knitting", "Knitting"], ["dyeing", "Dyeing"], ["finishing", "Finishing"], ["delivery", "Delivery"]];

  let stats = null;
  let loading = false;
  const tableMode = {}; // chart id -> showing its table instead of the chart

  // ---------- permission & navigation ----------
  function monitorAllowed() {
    if (localStorage.getItem("role") === "Admin") return true;
    try {
      const p = JSON.parse(localStorage.getItem("permissions"));
      return !!(p && p.menus && p.menus.dataManagement && p.menus.dataManagement.atlasMonitor === true);
    } catch (e) { return false; }
  }
  const view = () => document.getElementById("atlasMonitorView");

  function applyMonitorPermission() {
    const link = document.getElementById("menu-atlas-monitor");
    const allowed = monitorAllowed();
    if (link) link.closest("li").classList.toggle("hidden", !allowed);
    if (allowed) document.getElementById("sidebarDataManagement")?.classList.remove("hidden");
  }

  window.showAtlasMonitor = function () {
    if (!monitorAllowed()) {
      if (typeof showToast === "function") showToast("Access Denied: Atlas Monitor permission required.", true);
      showDashboardHome();
      return;
    }
    localStorage.setItem("activePage", JSON.stringify({ page: "atlasMonitor" }));
    activeTabId = "atlasMonitor";
    hideAllCoreViews();
    view().classList.remove("hidden");
    renderTabs();
    closeSidebarMobile();
    setActiveSidebarMenu("menu-atlas-monitor");
    ensureShell();
    if (stats) renderBody();
    load();
  };

  // ---------- formatting ----------
  const MB = 1024 * 1024; // the Atlas cluster card shows its 512 MB limit in these units
  function fmtMB(bytes) {
    if (!bytes) return "0 MB";
    const v = bytes / MB;
    if (v < 0.1) { // small sizes keep their real value, in KB
      const kb = bytes / 1024;
      return (kb < 10 ? String(Math.round(kb * 10) / 10) : Math.round(kb).toLocaleString("en-US")) + " KB";
    }
    return (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)) + " MB";
  }
  const fmtInt = n => Number(n || 0).toLocaleString("en-US");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDay(day, withYear) {
    const [y, m, d] = String(day).split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}${withYear ? " " + y : ""}`;
  }
  function fmtDateTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  }
  const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

  // ---------- DOM helpers (labels go in with textContent, never innerHTML) ----------
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    (Array.isArray(children) ? children : children ? [children] : []).forEach(c => el.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return el;
  }
  function s(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") el.textContent = v;
      else el.setAttribute(k, v);
    }
    if (parent) parent.appendChild(el);
    return el;
  }

  // ---------- styles ----------
  function injectStyles() {
    if (document.getElementById("atlasMonitorStyles")) return;
    const css = `
.am-root{--am-page:#f8fafc;--am-card:#ffffff;--am-ink:#0b0b0b;--am-ink2:#52514e;--am-muted:#6f6d68;--am-grid:#e1e0d9;--am-axis:#c3c2b7;--am-border:rgba(11,11,11,.10);
 --am-s1:#2a78d6;--am-s2:#eb6834;--am-s3:#1baf7a;--am-s4:#eda100;--am-on-s1:#fff;--am-on-s2:#fff;--am-on-s3:#fff;--am-on-s4:#0b0b0b;
 --am-wash:rgba(42,120,214,.10);--am-track:#cde2fb;--am-good:#0ca30c;--am-warn:#fab219;--am-crit:#d03b3b;--am-btn:#2a78d6;
 color:var(--am-ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
html.dark .am-root{--am-page:#0f1117;--am-card:#151a24;--am-ink:#f0efec;--am-ink2:#c3c2b7;--am-muted:#98968f;--am-grid:#262d3b;--am-axis:#3a4253;--am-border:rgba(255,255,255,.10);
 --am-s1:#3987e5;--am-s2:#d95926;--am-s3:#199e70;--am-s4:#c98500;--am-on-s4:#fff;--am-wash:rgba(57,135,229,.14);--am-track:#184f95;--am-btn:#3987e5}
.am-root .am-card{background:var(--am-card);border:1px solid var(--am-border);border-radius:12px}
.am-root .am-ink{color:var(--am-ink)} .am-root .am-ink2{color:var(--am-ink2)} .am-root .am-muted{color:var(--am-muted)}
.am-root .am-num{font-variant-numeric:tabular-nums}
.am-root .am-btn{display:inline-flex;align-items:center;gap:6px;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;border:1px solid var(--am-border);color:var(--am-ink);background:var(--am-card);cursor:pointer}
.am-root .am-btn:hover{border-color:var(--am-btn)} .am-root .am-btn:disabled{opacity:.55;cursor:wait}
.am-root .am-btn-primary{background:var(--am-btn);border-color:var(--am-btn);color:#fff}
.am-root .am-btn-primary:hover{filter:brightness(1.08)}
.am-root .am-toggle{font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;border:1px solid var(--am-border);color:var(--am-ink2);background:transparent;cursor:pointer}
.am-root .am-toggle[aria-pressed="true"]{background:var(--am-track);color:var(--am-ink)}
.am-root table.am-table{width:100%;border-collapse:collapse;font-size:12px}
.am-root table.am-table th{text-align:left;font-size:11px;font-weight:700;color:var(--am-muted);padding:7px 8px;border-bottom:1px solid var(--am-grid);white-space:nowrap}
.am-root table.am-table td{padding:7px 8px;border-bottom:1px solid var(--am-grid);color:var(--am-ink);white-space:nowrap}
.am-root table.am-table td.r,.am-root table.am-table th.r{text-align:right;font-variant-numeric:tabular-nums}
.am-root svg text{font-family:inherit}
.am-root .am-chart:focus{outline:2px solid var(--am-btn);outline-offset:2px;border-radius:4px}
.am-tip{position:fixed;z-index:9999;pointer-events:none;background:var(--am-card,#fff);color:var(--am-ink,#0b0b0b);border:1px solid var(--am-border,rgba(0,0,0,.1));border-radius:8px;padding:8px 10px;font:12px system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.18);max-width:260px}
.am-tip .am-tip-v{font-weight:700;font-size:13px} .am-tip .am-tip-l{color:var(--am-ink2,#52514e)} .am-tip .am-tip-row{display:flex;align-items:center;gap:6px;margin-top:2px}
.am-tip .am-key{display:inline-block;width:10px;height:2px;border-radius:1px}`;
    document.head.appendChild(h("style", { id: "atlasMonitorStyles", text: css }));
  }

  // ---------- tooltip ----------
  let tipEl = null;
  function tip() {
    if (!tipEl) { tipEl = h("div", { class: "am-tip am-root", role: "status" }); tipEl.style.display = "none"; document.body.appendChild(tipEl); }
    return tipEl;
  }
  // rows: [{value, label, color}] - value leads, label follows
  function showTip(x, y, title, rows) {
    const t = tip();
    t.replaceChildren();
    if (title) t.appendChild(h("div", { class: "am-tip-l", text: title }));
    rows.forEach(r => {
      const row = h("div", { class: "am-tip-row" });
      if (r.color) { const k = h("span", { class: "am-key" }); k.style.background = `var(${r.color})`; row.appendChild(k); }
      row.appendChild(h("span", { class: r.label ? "am-tip-v" : "am-tip-v", text: r.value }));
      if (r.label) row.appendChild(h("span", { class: "am-tip-l", text: r.label }));
      t.appendChild(row);
    });
    t.style.display = "block";
    const w = t.offsetWidth, hgt = t.offsetHeight;
    let left = x + 14, top = y - hgt - 10;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 16;
    t.style.left = Math.max(8, left) + "px";
    t.style.top = top + "px";
  }
  const hideTip = () => { if (tipEl) tipEl.style.display = "none"; };

  // ---------- shell ----------
  function ensureShell() {
    injectStyles();
    const root = view();
    if (root.dataset.ready) return;
    root.dataset.ready = "1";
    const refreshBtn = h("button", { class: "am-btn", type: "button", id: "amRefresh", onclick: () => load() }, [h("i", { class: "fa-solid fa-rotate-right" }), "Refresh"]);
    root.appendChild(h("div", { class: "am-root p-4 sm:p-6 md:p-8 w-full max-w-[1500px] mx-auto" }, [
      h("div", { class: "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5" }, [
        h("div", {}, [
          h("div", { class: "text-[11px] font-bold uppercase tracking-wider am-muted mb-1", text: "Data Management › Atlas Monitor" }),
          h("h1", { class: "text-xl sm:text-2xl font-black am-ink flex items-center gap-2" }, [h("i", { class: "fa-solid fa-heart-pulse", style: "color:var(--am-s1)" }), "Atlas Monitor"]),
          h("p", { class: "text-xs am-ink2 mt-1", id: "amUpdated", text: "Loading database health…" }),
        ]),
        refreshBtn,
      ]),
      h("div", { id: "amBody", class: "flex flex-col gap-5", style: "transition:opacity .2s" }),
    ]));
    let timer = null;
    new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (stats && !view().classList.contains("hidden")) renderCharts(); }, 150);
    }).observe(root);
  }

  async function load() {
    if (loading) return;
    loading = true;
    const body = document.getElementById("amBody");
    const btn = document.getElementById("amRefresh");
    if (body && stats) body.style.opacity = "0.55"; // keep the previous render while it reloads
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(API + "/stats");
      if (!res.ok) {
        let msg = "Could not load database stats.";
        try { msg = (await res.json()).message || msg; } catch (e) {}
        throw new Error(msg);
      }
      stats = await res.json();
      renderBody();
    } catch (e) {
      const upd = document.getElementById("amUpdated");
      if (upd) upd.textContent = (e.message || "Could not load database stats.") + " Try Refresh.";
    } finally {
      loading = false;
      if (body) body.style.opacity = "1";
      if (btn) btn.disabled = false;
    }
  }

  // ---------- page body ----------
  function renderBody() {
    const body = document.getElementById("amBody");
    if (!body || !stats) return;
    document.getElementById("amUpdated").textContent =
      `Live from database "${stats.database.name}" (MongoDB ${stats.database.serverVersion || "-"}). Updated ${fmtDateTime(stats.generatedAt)}.`;
    body.replaceChildren(
      h("div", { class: "grid grid-cols-1 xl:grid-cols-3 gap-5" }, [storageCard(), backupCard()]),
      kpiRow(),
      h("div", { class: "grid grid-cols-1 xl:grid-cols-2 gap-5" }, [
        chartCard("history", "Storage used over time", "Data + index, one reading per day. The line at 512 MB is the free-tier limit."),
        chartCard("collections", "Space by collection", "Data size of each collection, largest first."),
      ]),
      h("div", { class: "grid grid-cols-1 xl:grid-cols-2 gap-5" }, [
        chartCard("status", "Plan status by department", "Orders in each department's latest file, as the plan list tabs count them."),
        chartCard("uploads", "Files uploaded per day", "All categories, last 30 days."),
      ]),
      uploadsTableCard(),
    );
    renderCharts();
  }

  function storageCard() {
    const d = stats.database;
    const used = d.dataSize + d.indexSize;
    const share = pct(used, d.limitBytes);
    const level = share >= 85 ? ["--am-crit", "fa-circle-exclamation", "Almost full"] : share >= 70 ? ["--am-warn", "fa-triangle-exclamation", "Getting full"] : ["--am-good", "fa-circle-check", "Healthy"];
    const fill = h("div", { style: `height:100%;width:${Math.min(100, share)}%;background:var(${share >= 70 ? level[0] : "--am-s1"});border-radius:999px` });
    return h("div", { class: "am-card p-5 xl:col-span-2" }, [
      h("div", { class: "flex items-start justify-between gap-3" }, [
        h("div", {}, [
          h("div", { class: "text-xs font-semibold am-ink2", text: "Atlas storage used (data + index)" }),
          h("div", { class: "flex items-baseline gap-2 mt-1 flex-wrap" }, [
            h("span", { class: "font-semibold am-ink", style: "font-size:48px;line-height:1", text: fmtMB(used) }),
            h("span", { class: "text-sm am-ink2", text: `of ${fmtMB(d.limitBytes)} · ${share}%` }),
          ]),
        ]),
        h("span", { class: "inline-flex items-center gap-1.5 text-xs font-semibold am-ink px-2.5 py-1 rounded-full", style: "border:1px solid var(--am-border)" }, [
          h("i", { class: "fa-solid " + level[1], style: `color:var(${level[0]})` }), level[2],
        ]),
      ]),
      h("div", { class: "mt-4 relative" }, [
        h("div", { role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(share), "aria-label": `Storage used ${share}%`, style: "height:10px;border-radius:999px;background:var(--am-track);overflow:hidden" }, fill),
        h("div", { style: "position:absolute;left:70%;top:-3px;width:1px;height:16px;background:var(--am-ink2)" }), // 70% warning mark
      ]),
      h("div", { class: "relative text-[11px] am-muted mt-1 am-num", style: "height:16px" }, [
        h("span", { style: "position:absolute;left:0", text: "0" }),
        h("span", { style: "position:absolute;left:70%;transform:translateX(-50%);white-space:nowrap", text: "70% warning" }),
        h("span", { style: "position:absolute;right:0", text: fmtMB(d.limitBytes) }),
      ]),
      h("p", { class: "text-xs am-ink2 mt-3 leading-relaxed", text:
        `Atlas counts only data (${fmtMB(d.dataSize)}) and indexes (${fmtMB(d.indexSize)}) against the limit. ` +
        `The files on disk take ${fmtMB(d.storageSize)}, of which ${fmtMB(d.freeStorageSize)} is free space that new data reuses; disk size is not counted.` }),
    ]);
  }

  function backupCard() {
    const b = stats.backups || {};
    const last = b.last;
    const copies = (stats.collections || []).filter(c => c.name.startsWith("uploads.")).reduce((a, c) => a + c.size, 0);
    const total = (stats.collections || []).reduce((a, c) => a + c.size, 0);
    const card = h("div", { class: "am-card p-5 flex flex-col gap-3" }, [
      h("div", { class: "flex items-center gap-2" }, [h("i", { class: "fa-solid fa-download", style: "color:var(--am-s1)" }), h("span", { class: "font-bold am-ink", text: "Database backup" })]),
      h("p", { class: "text-xs am-ink2 leading-relaxed", text: "Downloads the whole database as one file to this PC. Keep it private: it holds all business data and the users' password hashes." }),
      h("div", { class: "text-xs am-ink2" }, [
        h("div", { text: last ? `Last backup: ${fmtDateTime(last.at)} by ${last.by || "-"} (${fmtMB(last.bytes)})` : "Last backup: none from this page yet" }),
      ]),
    ]);
    if (!stats.canDownloadBackup) {
      card.appendChild(h("p", { class: "text-xs am-muted", text: "Only an Admin can download backups." }));
      return card;
    }
    const check = h("input", { type: "checkbox", id: "amIncludeFiles", checked: true, class: "cursor-pointer" });
    const status = h("div", { class: "text-xs am-ink2 min-h-[16px]", role: "status" });
    const btn = h("button", { class: "am-btn am-btn-primary self-start", type: "button" }, [h("i", { class: "fa-solid fa-file-arrow-down" }), "Download backup"]);
    btn.addEventListener("click", () => downloadBackup(check.checked, btn, status));
    card.appendChild(h("label", { class: "flex items-center gap-2 text-xs am-ink cursor-pointer", for: "amIncludeFiles" }, [
      check, `Include stored Excel copies (${fmtMB(copies)} of ${fmtMB(total)} data)`,
    ]));
    card.appendChild(btn);
    card.appendChild(status);
    return card;
  }

  function kpiRow() {
    const d = stats.database, o = stats.orders, u = stats.users;
    const copies = (stats.uploads.categories || []).reduce((a, c) => ({ n: a.n + c.copiesKept, b: a.b + c.copyBytes }), { n: 0, b: 0 });
    const tiles = [
      ["Data size", fmtMB(d.dataSize), `${fmtInt(d.objects)} documents`],
      ["Index size", fmtMB(d.indexSize), `${fmtInt(d.collections)} collections`],
      ["Disk files", fmtMB(d.storageSize), `${fmtMB(d.freeStorageSize)} free inside`],
      ["Orders", fmtInt(o.active), `active · ${fmtInt(o.total)} in total`],
      ["Saved plans", fmtInt(stats.plans.saved), "orders with a saved plan"],
      ["Excel copies kept", fmtInt(copies.n), fmtMB(copies.b)],
      ["Users", fmtInt(u.total), `${fmtInt(u.online)} online now`],
    ];
    return h("div", { class: "grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3" }, tiles.map(([label, value, sub]) =>
      h("div", { class: "am-card px-4 py-3" }, [
        h("div", { class: "text-xs am-ink2", text: label }),
        h("div", { class: "text-xl font-semibold am-ink mt-0.5", text: value }),
        h("div", { class: "text-[11px] am-muted", text: sub }),
      ])));
  }

  function chartCard(id, title, subtitle) {
    const toggle = h("button", { class: "am-toggle", type: "button", "aria-pressed": tableMode[id] ? "true" : "false" }, [h("i", { class: "fa-solid fa-table-list mr-1" }), "Table"]);
    toggle.addEventListener("click", () => {
      tableMode[id] = !tableMode[id];
      toggle.setAttribute("aria-pressed", tableMode[id] ? "true" : "false");
      renderChart(id);
    });
    return h("div", { class: "am-card p-5 min-w-0" }, [
      h("div", { class: "flex items-start justify-between gap-3 mb-3" }, [
        h("div", {}, [h("div", { class: "font-bold am-ink text-sm", text: title }), h("div", { class: "text-[11px] am-muted mt-0.5", text: subtitle })]),
        toggle,
      ]),
      h("div", { id: "amChart-" + id, class: "w-full min-w-0" }),
    ]);
  }

  function uploadsTableCard() {
    const rows = stats.uploads.categories || [];
    const table = h("table", { class: "am-table" }, [
      h("thead", {}, h("tr", {}, [
        h("th", { text: "Category" }), h("th", { class: "r", text: "Copies kept" }), h("th", { class: "r", text: "Size of copies" }),
        h("th", { class: "r", text: "Uploads (all time)" }), h("th", { class: "r", text: "Copies removed" }), h("th", { text: "Last upload" }), h("th", { text: "By" }),
      ])),
      h("tbody", {}, rows.map(r => h("tr", {}, [
        h("td", { text: r.category }), h("td", { class: "r", text: fmtInt(r.copiesKept) }), h("td", { class: "r", text: fmtMB(r.copyBytes) }),
        h("td", { class: "r", text: fmtInt(r.uploads) }), h("td", { class: "r", text: fmtInt(r.copiesDeleted) }),
        h("td", { text: fmtDateTime(r.lastAt) }), h("td", { text: r.lastBy || "-" }),
      ]))),
    ]);
    return h("div", { class: "am-card p-5" }, [
      h("div", { class: "font-bold am-ink text-sm", text: "Uploaded Excel copies" }),
      h("div", { class: "text-[11px] am-muted mt-0.5 mb-3", text: "The app reads each file once when it is uploaded; the stored copies are only kept as a fallback." }),
      h("div", { class: "overflow-x-auto" }, table),
    ]);
  }

  // ---------- charts ----------
  function renderCharts() { ["history", "collections", "status", "uploads"].forEach(renderChart); }

  function renderChart(id) {
    const box = document.getElementById("amChart-" + id);
    if (!box || !stats) return;
    hideTip();
    box.replaceChildren();
    const width = Math.max(280, Math.floor(box.clientWidth || 600));
    if (tableMode[id]) { box.appendChild(chartTable(id)); return; }
    if (id === "history") historyChart(box, width);
    else if (id === "collections") collectionsChart(box, width);
    else if (id === "status") statusChart(box, width);
    else if (id === "uploads") uploadsChart(box, width);
  }

  function svgRoot(box, width, height, label) {
    const svg = s("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": label, class: "am-chart", tabindex: "0" });
    svg.style.display = "block";
    box.appendChild(svg);
    return svg;
  }
  const niceStep = (max, ticks) => {
    const raw = max / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    return [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw) || raw;
  };
  function roundedRight(x, y, w, hgt, r) { // square at the baseline (left), 4px round data-end (right)
    r = Math.min(r, w, hgt / 2);
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt - r}Q${x + w},${y + hgt} ${x + w - r},${y + hgt}H${x}Z`;
  }
  function roundedTop(x, y, w, hgt, r) { // square at the baseline (bottom), round top
    r = Math.min(r, hgt, w / 2);
    return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
  }

  // Storage used over time (single series, crosshair + tooltip)
  function historyChart(box, width) {
    const pts = (stats.history || []).map(p => ({ day: p.day, used: (p.dataSize || 0) + (p.indexSize || 0), p }));
    const limit = stats.database.limitBytes;
    const height = 320, m = { l: 52, r: 70, t: 14, b: 28 };
    const pw = width - m.l - m.r, ph = height - m.t - m.b;
    const maxV = Math.max(limit, ...pts.map(p => p.used)) * 1.04;
    const step = niceStep(maxV / MB, 4) * MB;
    const y = v => m.t + ph - (v / maxV) * ph;
    const x = i => m.l + (pts.length <= 1 ? pw / 2 : (i / (pts.length - 1)) * pw);
    const last = pts[pts.length - 1];
    const svg = svgRoot(box, width, height, last ? `Storage used: ${fmtMB(last.used)} on ${fmtDay(last.day, true)}, limit ${fmtMB(limit)}` : "No readings yet");
    for (let v = 0; v <= maxV; v += step) {
      s("line", { x1: m.l, x2: m.l + pw, y1: y(v), y2: y(v), style: "stroke:var(--am-grid);stroke-width:1" }, svg);
      s("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end", style: "fill:var(--am-muted);font-size:11px;font-variant-numeric:tabular-nums", text: Math.round(v / MB) }, svg);
    }
    s("text", { x: m.l - 8, y: m.t - 2, "text-anchor": "end", style: "fill:var(--am-muted);font-size:10px", text: "MB" }, svg);
    // limit reference line (solid hairline, labelled)
    s("line", { x1: m.l, x2: m.l + pw, y1: y(limit), y2: y(limit), style: "stroke:var(--am-crit);stroke-width:1" }, svg);
    s("text", { x: m.l + pw + 6, y: y(limit) + 4, style: "fill:var(--am-ink2);font-size:11px", text: "Limit" }, svg);
    s("line", { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph, style: "stroke:var(--am-axis);stroke-width:1" }, svg);
    if (!pts.length) return;
    const idxs = pts.length <= 1 ? [0] : [0, Math.floor((pts.length - 1) / 2), pts.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    idxs.forEach(i => s("text", { x: x(i), y: height - 8, "text-anchor": pts.length <= 1 ? "middle" : i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle", style: "fill:var(--am-muted);font-size:11px", text: fmtDay(pts[i].day) }, svg));
    if (pts.length > 1) {
      const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.used)}`).join("");
      s("path", { d: `${line}L${x(pts.length - 1)},${m.t + ph}L${x(0)},${m.t + ph}Z`, style: "fill:var(--am-wash);stroke:none" }, svg);
      s("path", { d: line, style: "fill:none;stroke:var(--am-s1);stroke-width:2;stroke-linejoin:round;stroke-linecap:round" }, svg);
    }
    const li = pts.length - 1;
    s("circle", { cx: x(li), cy: y(last.used), r: 4, style: "fill:var(--am-s1);stroke:var(--am-card);stroke-width:2" }, svg);
    s("text", { x: x(li) + 8, y: y(last.used) + 4, style: "fill:var(--am-ink);font-size:12px;font-weight:600", text: fmtMB(last.used) }, svg);
    // just under the limit line, clear of it and of the single point
    if (pts.length === 1) s("text", { x: m.l + pw / 2, y: y(limit) + 28, "text-anchor": "middle", style: "fill:var(--am-muted);font-size:11px", text: "History starts today: one reading is saved each day the page is opened" }, svg);
    // crosshair
    const cross = s("line", { y1: m.t, y2: m.t + ph, style: "stroke:var(--am-ink2);stroke-width:1;display:none" }, svg);
    const dot = s("circle", { r: 5, style: "fill:var(--am-s1);stroke:var(--am-card);stroke-width:2;display:none" }, svg);
    const showAt = (i, cx, cy) => {
      const p = pts[i];
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.style.display = "";
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.used)); dot.style.display = "";
      showTip(cx, cy, fmtDay(p.day, true), [
        { value: fmtMB(p.used), label: "used", color: "--am-s1" },
        { value: fmtMB(p.p.dataSize), label: "data" }, { value: fmtMB(p.p.indexSize), label: "index" },
        { value: `${pct(p.used, limit)}%`, label: "of limit" },
      ]);
    };
    const hit = s("rect", { x: m.l - 10, y: m.t, width: pw + 20, height: ph, style: "fill:transparent;cursor:crosshair" }, svg);
    hit.addEventListener("pointermove", e => {
      const r = svg.getBoundingClientRect();
      const rel = e.clientX - r.left;
      const i = pts.length <= 1 ? 0 : Math.max(0, Math.min(pts.length - 1, Math.round(((rel - m.l) / pw) * (pts.length - 1))));
      showAt(i, e.clientX, e.clientY);
    });
    hit.addEventListener("pointerleave", () => { cross.style.display = "none"; dot.style.display = "none"; hideTip(); });
    let focusI = li;
    svg.addEventListener("focus", () => { const r = svg.getBoundingClientRect(); showAt(focusI, r.left + x(focusI), r.top + y(pts[focusI].used)); });
    svg.addEventListener("blur", () => { cross.style.display = "none"; dot.style.display = "none"; hideTip(); });
    svg.addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      focusI = Math.max(0, Math.min(li, focusI + (e.key === "ArrowRight" ? 1 : -1)));
      const r = svg.getBoundingClientRect();
      showAt(focusI, r.left + x(focusI), r.top + y(pts[focusI].used));
    });
  }

  // Ranked horizontal bars, one hue
  function collectionsChart(box, width) {
    const rows = [...(stats.collections || [])].sort((a, b) => b.size - a.size);
    const rowH = 26, barH = 12, labelW = Math.min(150, Math.max(110, width * 0.28)), valueW = 70;
    const height = rows.length * rowH + 8;
    const pw = Math.max(40, width - labelW - valueW);
    const max = Math.max(1, ...rows.map(r => r.size));
    const svg = svgRoot(box, width, height, `Data size by collection, largest ${rows[0] ? rows[0].name + " " + fmtMB(rows[0].size) : ""}`);
    s("line", { x1: labelW, x2: labelW, y1: 0, y2: height - 4, style: "stroke:var(--am-axis);stroke-width:1" }, svg);
    rows.forEach((r, i) => {
      const cy = 4 + i * rowH + rowH / 2;
      s("text", { x: labelW - 8, y: cy + 4, "text-anchor": "end", style: "fill:var(--am-ink2);font-size:11px", text: r.name }, svg);
      const w = r.size > 0 ? Math.max(2, (r.size / max) * pw) : 0;
      const bar = w ? s("path", { d: roundedRight(labelW, cy - barH / 2, w, barH, 4), style: "fill:var(--am-s1)" }, svg) : null;
      s("text", { x: labelW + w + 6, y: cy + 4, style: "fill:var(--am-ink);font-size:11px;font-variant-numeric:tabular-nums", text: fmtMB(r.size) }, svg);
      const hit = s("rect", { x: 0, y: cy - rowH / 2, width, height: rowH, style: "fill:transparent" }, svg);
      hit.addEventListener("pointermove", e => {
        if (bar) bar.style.opacity = "0.8";
        showTip(e.clientX, e.clientY, r.name, [
          { value: fmtMB(r.size), label: "data", color: "--am-s1" }, { value: fmtInt(r.count), label: "documents" },
          { value: fmtMB(r.storageSize), label: `on disk (${fmtMB(r.freeStorageSize)} free)` }, { value: fmtMB(r.indexSize), label: `index (${r.indexes})` },
        ]);
      });
      hit.addEventListener("pointerleave", () => { if (bar) bar.style.opacity = ""; hideTip(); });
    });
  }

  // Part widths proportional to the values within `full` (less the gaps), each at least `min`,
  // so a small number is drawn small but never disappears.
  function segmentWidths(values, full, gap, min) {
    const room = Math.max(0, full - gap * (values.length - 1));
    const fixed = new Set();
    for (;;) {
      const freeSum = values.reduce((a, v, i) => (fixed.has(i) ? a : a + v), 0);
      const free = room - fixed.size * min;
      const w = values.map((v, i) => (fixed.has(i) ? min : (free * v) / freeSum));
      const small = values.map((v, i) => i).filter(i => !fixed.has(i) && w[i] < min);
      if (!small.length) return w;
      small.forEach(i => fixed.add(i));
    }
  }

  // Stacked horizontal bars: plan status per department (4 categorical series, fixed order).
  // Every part above zero is drawn and every number is shown: inside its part when it fits,
  // otherwise under the bar, beside a swatch of the part's colour.
  function statusChart(box, width) {
    const deps = DEPT_LABELS.map(([key, label]) => ({ key, label, c: stats.orders.departments[key] || {} }));
    deps.forEach(d => { d.total = STATUS_SERIES.reduce((a, [k]) => a + (d.c[k] || 0), 0); });
    const fileUploaded = stats.orders.fileUploaded || {};
    const doneAllTime = (stats.plans && stats.plans.completed) || {};
    const legend = h("div", { class: "flex flex-wrap gap-x-4 gap-y-1 mb-2" }, STATUS_SERIES.map(([name, color]) =>
      h("span", { class: "inline-flex items-center gap-1.5 text-[11px] am-ink2" }, [h("span", { style: `display:inline-block;width:10px;height:10px;border-radius:2px;background:var(${color})` }), name])));
    box.appendChild(legend);
    const barH = 22, padY = 8, labelW = 76, valueW = 54, GAP = 2, MIN_SEG = 3, chipGap = 10;
    const pw = Math.max(60, width - labelW - valueW);
    const max = Math.max(1, ...deps.map(d => d.total));
    const svg = svgRoot(box, width, deps.length * (barH + padY * 2) + 4, "Plan status by department: " + deps.map(d =>
      `${d.label} ${d.total} orders` + (d.total ? " (" + STATUS_SERIES.map(([k]) => `${k} ${d.c[k] || 0}`).join(", ") + ")" : "")).join("; "));
    let rowTop = 2;
    deps.forEach(d => {
      let rowH = barH + padY * 2;
      const top = rowTop + padY, cy = top + barH / 2;
      const wash = s("rect", { x: 0, y: rowTop, width, height: rowH, rx: 6, style: "fill:transparent" }, svg); // hover highlight
      s("text", { x: labelW - 10, y: cy + 4, "text-anchor": "end", style: "fill:var(--am-ink2);font-size:12px", text: d.label }, svg);
      if (!d.total) {
        const msg = fileUploaded[d.key] === false ? `No ${d.label} file uploaded yet` : "No orders in the latest file";
        s("text", { x: labelW, y: cy + 4, style: "fill:var(--am-muted);font-size:11px", text: msg }, svg);
        rowTop += rowH;
        return;
      }
      const parts = STATUS_SERIES.map(([k, color, on]) => ({ k, color, on, n: d.c[k] || 0 })).filter(p => p.n > 0);
      const widths = segmentWidths(parts.map(p => p.n), (d.total / max) * pw, GAP, MIN_SEG);
      const outside = [];
      let x0 = labelW;
      parts.forEach((p, j) => {
        const w = widths[j];
        p.x = x0;
        if (j === parts.length - 1) s("path", { d: roundedRight(x0, top, w, barH, 4), style: `fill:var(${p.color})` }, svg);
        else s("rect", { x: x0, y: top, width: w, height: barH, style: `fill:var(${p.color})` }, svg);
        const label = s("text", { x: x0 + 6, y: cy + 4, style: `fill:var(${p.on});font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;pointer-events:none`, text: fmtInt(p.n) }, svg);
        if (label.getComputedTextLength() + 12 > w) { label.remove(); outside.push(p); } // shown under the bar instead
        x0 += w + GAP;
      });
      s("text", { x: x0 - GAP + 6, y: cy + 4, style: "fill:var(--am-ink2);font-size:11px;font-variant-numeric:tabular-nums", text: fmtInt(d.total) }, svg);
      if (outside.length) {
        // One line under the bar: swatch + number, each starting under its own part,
        // pushed right so they never overlap, and pulled back in at the right edge.
        const chipTop = top + barH + 5;
        const chips = outside.map(p => {
          const g = s("g", {}, svg);
          s("rect", { x: 0, y: 1, width: 8, height: 8, rx: 2, style: `fill:var(${p.color})` }, g);
          const t = s("text", { x: 12, y: 9, style: "fill:var(--am-ink2);font-size:11px;font-variant-numeric:tabular-nums", text: fmtInt(p.n) }, g);
          return { g, want: p.x, w: 12 + t.getComputedTextLength() };
        });
        let prevEnd = -Infinity;
        chips.forEach(c => { c.x = Math.max(c.want, prevEnd + chipGap); prevEnd = c.x + c.w; });
        let limit = width - 2;
        for (let i = chips.length - 1; i >= 0; i--) {
          chips[i].x = Math.max(labelW, Math.min(chips[i].x, limit - chips[i].w));
          limit = chips[i].x - chipGap;
        }
        chips.forEach(c => c.g.setAttribute("transform", `translate(${c.x},${chipTop})`));
        rowH += 17;
      }
      wash.setAttribute("height", rowH);
      // The whole row is the hover target, so even a 3px part is easy to reach.
      const hit = s("rect", { x: 0, y: rowTop, width, height: rowH, style: "fill:transparent" }, svg);
      hit.addEventListener("pointermove", e => {
        wash.style.fill = "var(--am-wash)";
        const rows = STATUS_SERIES.map(([k, color]) => ({ value: fmtInt(d.c[k] || 0), label: `${k} · ${pct(d.c[k] || 0, d.total)}%`, color }));
        rows.push({ value: fmtInt(d.total), label: "orders in the latest file" });
        if (doneAllTime[d.key] !== undefined) rows.push({ value: fmtInt(doneAllTime[d.key]), label: "completed, all time" });
        showTip(e.clientX, e.clientY, d.label, rows);
      });
      hit.addEventListener("pointerleave", () => { wash.style.fill = "transparent"; hideTip(); });
      rowTop += rowH;
    });
    svg.setAttribute("height", rowTop + 2);
    svg.setAttribute("viewBox", `0 0 ${width} ${rowTop + 2}`);
    if (stats.plans && stats.plans.completed) {
      box.appendChild(h("p", { class: "text-[11px] am-ink2 mt-2 leading-relaxed" }, [
        h("span", { class: "font-semibold am-ink", text: "Completed plans, all time: " }),
        DEPT_LABELS.map(([key, label]) => `${label} ${fmtInt(doneAllTime[key])}`).join(" · "),
        h("span", { class: "am-muted", text: ". Most completed orders are no longer in the latest file, so the bars above show only a few." }),
      ]));
    }
  }

  // Columns: uploads per day (single series)
  function uploadsChart(box, width) {
    const days = stats.uploads.perDay || [];
    const height = 220, m = { l: 36, r: 10, t: 12, b: 28 };
    const pw = width - m.l - m.r, ph = height - m.t - m.b;
    const maxN = Math.max(1, ...days.map(d => d.total));
    const step = Math.max(1, Math.ceil(niceStep(maxN, 4)));
    const top = Math.ceil(maxN / step) * step;
    const y = v => m.t + ph - (v / top) * ph;
    const band = pw / Math.max(1, days.length);
    const colW = Math.min(24, Math.max(3, band * 0.62));
    const total = days.reduce((a, d) => a + d.total, 0);
    const svg = svgRoot(box, width, height, `${total} files uploaded in the last 30 days`);
    for (let v = 0; v <= top; v += step) {
      s("line", { x1: m.l, x2: m.l + pw, y1: y(v), y2: y(v), style: `stroke:var(${v === 0 ? "--am-axis" : "--am-grid"});stroke-width:1` }, svg);
      s("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", style: "fill:var(--am-muted);font-size:11px;font-variant-numeric:tabular-nums", text: v }, svg);
    }
    days.forEach((d, i) => {
      const cx = m.l + band * i + band / 2;
      const col = d.total ? s("path", { d: roundedTop(cx - colW / 2, y(d.total), colW, m.t + ph - y(d.total), 4), style: "fill:var(--am-s1)" }, svg) : null;
      // weekly labels counted back from today, so the last label never collides with another
      if ((days.length - 1 - i) % 7 === 0) s("text", { x: cx, y: height - 8, "text-anchor": i === days.length - 1 ? "end" : "middle", style: "fill:var(--am-muted);font-size:11px", text: fmtDay(d.day) }, svg);
      const hit = s("rect", { x: cx - band / 2, y: m.t, width: band, height: ph, style: "fill:transparent" }, svg);
      hit.addEventListener("pointermove", e => {
        if (col) col.style.opacity = "0.8";
        const rows = [{ value: fmtInt(d.total), label: d.total === 1 ? "file" : "files", color: "--am-s1" }];
        Object.entries(d.byCategory || {}).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => rows.push({ value: fmtInt(n), label: c }));
        showTip(e.clientX, e.clientY, fmtDay(d.day, true), rows);
      });
      hit.addEventListener("pointerleave", () => { if (col) col.style.opacity = ""; hideTip(); });
    });
  }

  // Table view of each chart (same numbers, no colour needed)
  function chartTable(id) {
    let head = [], rows = [];
    if (id === "history") {
      head = ["Day", "Used (data + index)", "Data", "Index", "Disk", "Of limit"];
      rows = [...(stats.history || [])].reverse().map(p => [fmtDay(p.day, true), fmtMB(p.dataSize + p.indexSize), fmtMB(p.dataSize), fmtMB(p.indexSize), fmtMB(p.storageSize), pct(p.dataSize + p.indexSize, stats.database.limitBytes) + "%"]);
    } else if (id === "collections") {
      head = ["Collection", "Documents", "Data", "On disk", "Free inside", "Index"];
      rows = [...stats.collections].sort((a, b) => b.size - a.size).map(c => [c.name, fmtInt(c.count), fmtMB(c.size), fmtMB(c.storageSize), fmtMB(c.freeStorageSize), fmtMB(c.indexSize)]);
    } else if (id === "status") {
      const done = (stats.plans && stats.plans.completed) || {};
      head = ["Department", ...STATUS_SERIES.map(([k]) => k), "Total", "Completed (all time)"];
      rows = DEPT_LABELS.map(([key, label]) => { const c = stats.orders.departments[key] || {}; const vals = STATUS_SERIES.map(([k]) => c[k] || 0); return [label, ...vals.map(fmtInt), fmtInt(vals.reduce((a, n) => a + n, 0)), done[key] === undefined ? "-" : fmtInt(done[key])]; });
    } else {
      head = ["Day", "Files", "By category"];
      rows = [...(stats.uploads.perDay || [])].reverse().map(d => [fmtDay(d.day, true), fmtInt(d.total), Object.entries(d.byCategory || {}).map(([c, n]) => `${c} ${n}`).join(", ") || "-"]);
    }
    return h("div", { class: "overflow-x-auto max-h-[320px] overflow-y-auto" }, h("table", { class: "am-table" }, [
      h("thead", {}, h("tr", {}, head.map((t, i) => h("th", { class: i ? "r" : "", text: t })))),
      h("tbody", {}, rows.map(r => h("tr", {}, r.map((v, i) => h("td", { class: i && !(id === "uploads" && i === 2) ? "r" : "", text: String(v) }))))),
    ]));
  }

  // ---------- backup download ----------
  async function downloadBackup(includeFiles, btn, status) {
    btn.disabled = true;
    status.textContent = "Preparing backup… (the first request can take a minute if the server was asleep)";
    try {
      const res = await fetch(API + "/backup?files=" + (includeFiles ? "1" : "0"));
      if (!res.ok) {
        let msg = "Backup failed.";
        try { msg = (await res.json()).message || msg; } catch (e) {}
        throw new Error(msg);
      }
      const name = (/filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "") || [])[1] || "abir_group_backup.jsonl.gz";
      const reader = res.body.getReader();
      const parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        status.textContent = `Downloading… ${fmtMB(got)}`;
      }
      const blob = new Blob(parts, { type: "application/gzip" });
      // A complete backup ends with its "end" line; check before saving (browsers that cannot unzip skip this).
      if (typeof DecompressionStream === "function") {
        status.textContent = "Checking the file…";
        const text = await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text();
        const lastLine = text.trimEnd().split("\n").pop();
        if (!lastLine.startsWith('{"type":"end"')) throw new Error("The download is incomplete. Please try again.");
      }
      const url = URL.createObjectURL(blob);
      const a = h("a", { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = `Saved ${name} (${fmtMB(blob.size)}). Keep this file private.`;
      if (typeof showToast === "function") showToast("Backup downloaded");
      setTimeout(load, 800); // show it as the last backup
    } catch (e) {
      status.textContent = e.message || "Backup failed.";
      if (typeof showToast === "function") showToast(e.message || "Backup failed.", true);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- hooks into core.js without editing it (as js/batch-module.js does) ----------
  const originalHide = hideAllCoreViews;
  hideAllCoreViews = function () {
    originalHide.apply(this, arguments);
    view()?.classList.add("hidden");
    hideTip();
  };
  const originalApply = applyPermissions;
  applyPermissions = function () {
    originalApply.apply(this, arguments);
    applyMonitorPermission();
  };
  const originalInit = initDashboard;
  initDashboard = function () {
    // Read the saved page first: the original falls back to the dashboard and overwrites it.
    let state = null;
    try { state = JSON.parse(localStorage.getItem("activePage") || "null"); } catch (e) { state = null; }
    originalInit.apply(this, arguments);
    if (state && state.page === "atlasMonitor" && localStorage.getItem("token")) window.showAtlasMonitor();
  };
})();
