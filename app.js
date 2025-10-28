// ===== app.js – huvudlogik för Tidrapport Next (Q4 2025) =====
const APP = (() => {

  const el = {
    qDate: document.getElementById("datum"),
    qProj: document.getElementById("projekt"),
    qDesc: document.getElementById("beskrivning"),
    qType: document.getElementById("kategori"),
    qHours: document.getElementById("tid"),
    qDrive: document.getElementById("kortid"),
    qAddBtn: document.getElementById("btnAdd"),
    qAddLabel: document.getElementById("btnAddLabel"),
    qCancel: document.getElementById("btnCancel"),
    tableBody: document.getElementById("rows"),
    yearBody: document.getElementById("yearBody"),
    monthSel: document.getElementById("menuMonth"),
  };

  const STORAGE_KEY = "tidrapport:data";
  const CFG_KEY = "tidrapport:cfg";

  let state = {
    data: JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
    settings: JSON.parse(localStorage.getItem(CFG_KEY) || "{}"),
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    editingIndex: null
  };

  // === Hjälpfunktioner ===
  const $ = id => document.getElementById(id);
  const keyYM = () => `${state.year}-${String(state.month + 1).padStart(2, "0")}`;
  const saveLocal = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  const saveCfg = () => localStorage.setItem(CFG_KEY, JSON.stringify(state.settings));
  const formatDateLocal = d => d.toISOString().split("T")[0];

  // === Autospar (debounce 60 s) ===
  let lastBackupAt = 0;
  function save() {
    saveLocal();
    const cfg = state.settings || {};
    if (cfg.autoBackup) {
      const now = Date.now();
      if (now - lastBackupAt > 60000) {
        if (window.autoLocalBackup) window.autoLocalBackup();
        lastBackupAt = now;
      }
    }
    renderMonth();
    renderYear();
  }

  // === Meny-toggle ===
  function toggleMenu(force) {
    const menu = document.getElementById("menu");
    const open = force ?? !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    menu.setAttribute("aria-hidden", open ? "false" : "true");
  }
  window.toggleMenu = toggleMenu;

  // === Månadsmeny ===
  function initMonthSelector() {
    if (!el.monthSel) return;
    el.monthSel.innerHTML = Array.from({ length: 12 }, (_, i) =>
      `<option value="${i}">${new Date(0, i).toLocaleString("sv-SE", { month: "long" })}</option>`
    ).join("");
    el.monthSel.value = state.month;
  }
  window.changeMonth = function () {
    state.month = Number(el.monthSel.value);
    renderMonth();
  };

  // === Inmatning ===
  el.qAddBtn?.addEventListener("click", () => {
    const row = {
      date: el.qDate.value || formatDateLocal(new Date()),
      project: el.qProj.value?.trim() || "",
      desc: el.qDesc.value?.trim() || "",
      type: el.qType.value || "Ordinarie",
      hours: parseFloat(el.qHours.value || "0") || 0,
      kortid: parseFloat(el.qDrive.value || "0") || 0
    };

    const ignoreTypes = ["VAB", "Sjuk-tim", "Semester-tim", "Föräldraledig", "Traktamente"];
    if (ignoreTypes.includes(row.type) && !row.hours) row.hours = 0;

    if (state.editingIndex === null) addRow(row);
    else updateRow(state.editingIndex, row);
  });

  el.qCancel?.addEventListener("click", resetForm);

  function addRow(row) {
    const k = keyYM();
    if (!state.data[k]) state.data[k] = [];
    state.data[k].push(row);
    resetForm();
    save();
  }

  function updateRow(index, row) {
    const k = keyYM();
    if (!state.data[k]) return;
    state.data[k][index] = row;
    resetForm();
    save();
  }

  function resetForm() {
    ["qDate", "qProj", "qDesc", "qHours", "qDrive"].forEach(k => (el[k].value = ""));
    el.qType.value = "Ordinarie";
    state.editingIndex = null;
    el.qAddLabel.textContent = "Lägg till";
    el.qCancel.style.display = "none";
    if (window.lucide) lucide.createIcons();
  }

  function editRow(index) {
    const k = keyYM();
    const r = (state.data[k] || [])[index];
    if (!r) return;
    el.qDate.value = r.date;
    el.qProj.value = r.project;
    el.qDesc.value = r.desc;
    el.qType.value = r.type;
    el.qHours.value = r.hours;
    el.qDrive.value = r.kortid;
    state.editingIndex = index;
    el.qAddLabel.textContent = "Spara";
    el.qCancel.style.display = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeRow(index) {
    if (!confirm("Vill du verkligen ta bort den här raden?")) return;
    const k = keyYM();
    if (!state.data[k]) return;
    state.data[k].splice(index, 1);
    if (state.editingIndex === index) resetForm();
    save();
  }

  // === Balanslogik & rendering ===
  function swedishHolidays(year) {
    const H = new Map();
    const add = (m, d) => H.set(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, true);
    add(1, 1); add(1, 6); add(5, 1); add(6, 6); add(12, 25); add(12, 26);
    return H;
  }

  function renderMonth() {
    const k = keyYM();
    const rows = state.data[k] || [];
    el.tableBody.innerHTML = "";

    const H = state.settings.holidays !== false ? swedishHolidays(state.year) : new Map();

    rows.forEach((r, i) => {
      const tr = document.createElement("tr");
      const d = new Date(r.date);
      const dow = d.getDay();
      const iso = r.date;
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = H.has(iso);
      if (isWeekend) tr.classList.add("weekend");
      if (isHoliday) tr.classList.add("holiday");
      tr.innerHTML = `
        <td>${r.date}</td><td>${r.project}</td><td>${r.type}</td>
        <td>${r.hours}</td><td>${r.kortid}</td><td>${r.desc}</td>
        <td style="white-space:nowrap;display:flex;gap:.4rem">
          <button class="btn ghost" onclick="APP.editRow(${i})"><i data-lucide='edit-3'></i></button>
          <button class="btn danger" onclick="APP.removeRow(${i})"><i data-lucide='trash-2'></i></button>
        </td>`;
      el.tableBody.appendChild(tr);
    });

    window.currentMonthData = rows.map(r => ({
      Datum: r.date, Projekt: r.project, Kategori: r.type,
      Tid: r.hours, Körtid: r.kortid, Beskrivning: r.desc
    }));
    calcTotals(rows);
    if (window.lucide) lucide.createIcons();
  }

  function calcTotals(rows) {
    const totals = {};
    rows.forEach(r => totals[r.type] = (totals[r.type] || 0) + Number(r.hours || 0));
    $("totalsCell").innerHTML = Object.entries(totals)
      .map(([k, v]) => `${k}: ${v.toFixed(2)}h`).join(" · ");
  }

  function renderYear() {
    const tbody = el.yearBody;
    tbody.innerHTML = "";
    const fullYear = [];
    for (let m = 0; m < 12; m++) {
      const k = `${state.year}-${String(m + 1).padStart(2, "0")}`;
      const rows = state.data[k] || [];
      fullYear.push(...rows.map(r => ({
        Datum: r.date, Projekt: r.project, Kategori: r.type, Tid: r.hours, Körtid: r.kortid, Beskrivning: r.desc
      })));
      if (!rows.length) continue;
      const totals = {};
      rows.forEach(r => totals[r.type] = (totals[r.type] || 0) + Number(r.hours || 0));
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${new Date(state.year, m).toLocaleString("sv-SE",{month:"long"})}</td>` +
        Object.keys(totals).map(k => `<td>${totals[k].toFixed(1)}</td>`).join("");
      tbody.appendChild(tr);
    }
    window.fullYearData = fullYear;
    if (window.lucide) lucide.createIcons();
  }

  // === Inställningar + Dark mode ===
  window.saveSettings = function () {
    state.settings.company = $("cfgCompany")?.value || state.settings.company;
    state.settings.name = $("cfgName")?.value || state.settings.name;
    state.settings.emp = $("cfgEmp")?.value || state.settings.emp;
    state.settings.owner = $("cfgOwner")?.value || state.settings.owner;
    state.settings.year = Number($("cfgYear")?.value) || state.settings.year || new Date().getFullYear();
    state.settings.note = $("cfgNote")?.value || state.settings.note;
    state.settings.autoBackup = $("cfgAutoBackup")?.checked ?? state.settings.autoBackup;
    state.settings.holidays = $("cfgHolidays")?.checked ?? state.settings.holidays;
    state.settings.holidayHours = Number($("cfgHolidayHours")?.value) || state.settings.holidayHours || 8;
    state.settings.darkMode = $("cfgDarkMode")?.checked ?? state.settings.darkMode;
    document.documentElement.dataset.theme = state.settings.darkMode ? "dark" : "light";
    saveCfg();
    alert("Inställningar sparade!");
    initMonthSelector();
    renderMonth(); renderYear();
  };

  window.resetSettings = () => {
    if (!confirm("Rensa alla inställningar?")) return;
    localStorage.removeItem(CFG_KEY); location.reload();
  };

  window.resetAll = () => {
    if (!confirm("Ta bort all data och inställningar?")) return;
    localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(CFG_KEY);
    location.reload();
  };

  function openSearch() {
    alert("Sökfunktionen finns på söksidan – öppna via menyn!");
  }

  return { removeRow, editRow, toggleMenu, renderMonth, openSearch };
})();

// === Init ===
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  const cfg = JSON.parse(localStorage.getItem("tidrapport:cfg") || "{}");
  if (cfg.darkMode) document.documentElement.dataset.theme = "dark";
  if (document.getElementById("cfgDarkMode")) document.getElementById("cfgDarkMode").checked = !!cfg.darkMode;

  // fyll månadsväljare om den finns
  const sel = document.getElementById("menuMonth");
  if (sel) {
    sel.innerHTML = Array.from({length:12}, (_,i)=>`<option value="${i}">${new Date(0,i).toLocaleString("sv-SE",{month:"long"})}</option>`).join("");
    sel.value = new Date().getMonth();
  }

  APP.renderMonth();
  setTimeout(() => APP.renderMonth(), 50); // säkra ikonrender
});

console.log("%cApp.js laddad ✅ (Tidrapport Next Q4 2025)", "color:green");