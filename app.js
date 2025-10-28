// ===== app.js – huvudlogik för Tidrapport (Vidare utveckling 1) =====

const APP = (() => {

  // --- Globala elementreferenser ---
  const el = {
    qDate: document.getElementById("datum"),
    qProj: document.getElementById("projekt"),
    qDesc: document.getElementById("beskrivning"),
    qType: document.getElementById("kategori"),
    qHours: document.getElementById("tid"),
    qAddBtn: document.getElementById("btnAdd"),
    qCancel: document.getElementById("btnCancel"),
    tableBody: document.getElementById("rows"),
    yearBody: document.getElementById("yearBody"),
    menuBtn: document.getElementById("menuBtn"),
    sideMenu: document.getElementById("menu")
  };

  const STORAGE_KEY = "tidrapport:data";
  const CFG_KEY = "tidrapport:cfg";

  let state = {
    data: JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
    settings: JSON.parse(localStorage.getItem(CFG_KEY) || "{}"),
    year: new Date().getFullYear(),
    month: new Date().getMonth()
  };

  // --- Hjälpfunktioner ---
  const $ = id => document.getElementById(id);
  const keyYM = () => `${state.year}-${String(state.month + 1).padStart(2, "0")}`;
  const saveLocal = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  const saveCfg = () => localStorage.setItem(CFG_KEY, JSON.stringify(state.settings));
  const formatDateLocal = d => d.toISOString().split("T")[0];

  // === Autosave (händelsestyrd, debounce 60s) ===
  let lastBackupAt = 0;
  function save() {
    saveLocal();
    const cfg = state.settings || {};
    if (cfg.autoBackup) {
      const now = Date.now();
      if (now - lastBackupAt > 60000) {  // 60s debounce
        if (window.autoLocalBackup) window.autoLocalBackup();
        lastBackupAt = now;
      }
    }
    renderMonth();
    renderYear();
  }

  // === Meny-toggle med ARIA ===
  function toggleMenu(force) {
    const open = force ?? (el.sideMenu.getAttribute("aria-hidden") === "true");
    el.sideMenu.classList.toggle("open", open);
    el.sideMenu.setAttribute("aria-hidden", open ? "false" : "true");
    el.menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  window.toggleMenu = toggleMenu;

  // === Lägg till / ändra rad ===
  el.qAddBtn?.addEventListener("click", () => {
    const row = {
      date: el.qDate.value || formatDateLocal(new Date()),
      project: el.qProj.value?.trim() || "",
      desc: el.qDesc.value?.trim() || "",
      type: el.qType.value || "Ordinarie",
      hours: parseFloat(el.qHours.value || "0") || 0
    };

    const ignoreTypes = ["VAB", "Sjuk-tim", "Semester-tim", "Föräldraledig", "Traktamente"];
    if (ignoreTypes.includes(row.type) && !row.hours) row.hours = 0;

    // Röd dag auto-komp
    const y = new Date(row.date).getFullYear();
    const H = state.settings.holidays !== false ? swedishHolidays(y) : new Map();
    if (H.has(row.date) && state.settings.holidays && !row.hours) {
      row.hours = state.settings.holidayHours || 8;
    }

    addRow(row);
  });

  function addRow(row) {
    const k = keyYM();
    if (!state.data[k]) state.data[k] = [];
    state.data[k].push(row);
    save();
  }

  // === Ta bort rad ===
  function removeRow(index) {
    const k = keyYM();
    if (!state.data[k]) return;
    state.data[k].splice(index, 1);
    save();
  }

  // === Balans- & renderlogik ===
  function renderMonth() {
    const k = keyYM();
    const rows = state.data[k] || [];
    const tbody = el.tableBody;
    tbody.innerHTML = "";

    // Summera ordinarie timmar + flex/ATF
    const flexTypes = ["Flextid", "ATF-tim"];
    const dayOrdSum = {};
    rows.forEach(r => {
      const t = Number(r.hours || 0);
      if (r.type === "Ordinarie" || flexTypes.includes(r.type)) {
        dayOrdSum[r.date] = (dayOrdSum[r.date] || 0) + t;
      }
    });

    const y = state.year;
    const H = state.settings.holidays !== false ? swedishHolidays(y) : new Map();

    rows.forEach((r, i) => {
      const tr = document.createElement("tr");
      const d = new Date(r.date);
      const dow = d.getDay();
      const iso = r.date;
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = H.has(iso);
      const ordHours = dayOrdSum[r.date] || 0;

      // helg/röd dag
      if (isWeekend) tr.classList.add("weekend");
      if (isHoliday) tr.classList.add("holiday");

      // auto-komp röd dag
      if (isHoliday && state.settings.holidays && ordHours === 0) {
        r.hours = state.settings.holidayHours || 8;
      }

      // huvudbalansvillkor
      const ignoreTypes = ["VAB","Sjuk-tim","Semester-tim","Föräldraledig","Traktamente"];
      const counted = ordHours >= 8 || ignoreTypes.includes(r.type) || isWeekend || isHoliday;
      if (!counted) tr.classList.add("warn");

      // celler
      tr.innerHTML = `
        <td>${r.date}</td>
        <td>${r.project}</td>
        <td>${r.type}</td>
        <td>${r.hours}</td>
        <td>${r.kortid || ""}</td>
        <td>${r.desc}</td>
        <td><button class="btn danger" onclick="APP.removeRow(${i})">🗑️</button></td>`;
      tbody.appendChild(tr);
    });

    calcTotals(rows);
  }
  window.renderMonth = renderMonth;

  function calcTotals(rows) {
    const totals = {};
    rows.forEach(r => {
      totals[r.type] = (totals[r.type] || 0) + Number(r.hours || 0);
    });
    $("totalsCell").innerHTML = Object.entries(totals)
      .map(([k, v]) => `${k}: ${v.toFixed(2)}h`).join(" · ");
  }

  function renderYear() {
    const tbody = el.yearBody;
    tbody.innerHTML = "";
    for (let m = 0; m < 12; m++) {
      const k = `${state.year}-${String(m + 1).padStart(2, "0")}`;
      const rows = state.data[k] || [];
      if (!rows.length) continue;
      const totals = {};
      rows.forEach(r => totals[r.type] = (totals[r.type] || 0) + Number(r.hours || 0));
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${new Date(state.year, m).toLocaleString("sv-SE",{month:"long"})}</td>
        <td>${(totals["Ordinarie"]||0).toFixed(1)}</td>
        <td>${(totals["Semester-tim"]||0).toFixed(1)}</td>
        <td>${(totals["ATF-tim"]||0).toFixed(1)}</td>
        <td>${(totals["Sjuk-tim"]||0).toFixed(1)}</td>
        <td>${(totals["Föräldraledig"]||0).toFixed(1)}</td>
        <td>${(totals["VAB"]||0).toFixed(1)}</td>
        <td>${(totals["Flextid"]||0).toFixed(1)}</td>
        <td>${(totals["Övertid <2"]||0).toFixed(1)}</td>
        <td>${(totals["Övertid 2>"]||0).toFixed(1)}</td>
        <td>${(totals["Övertid-Helg"]||0).toFixed(1)}</td>
        <td>${(totals["Traktamente"]||0).toFixed(1)}</td>
        <td>${(totals["Körtid"]||0).toFixed(1)}</td>`;
      tbody.appendChild(tr);
    }
  }

  // === Svenska helgdagar ===
  function swedishHolidays(year) {
    const H = new Map();
    const easter = calcEaster(year);
    const add = (m, d) => H.set(`${year}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`, true);
    add(1,1); add(1,6);
    add(easter.getMonth()+1, easter.getDate()-2);
    add(easter.getMonth()+1, easter.getDate()+1);
    add(5,1);
    const asc = new Date(easter); asc.setDate(asc.getDate()+39); add(asc.getMonth()+1, asc.getDate());
    add(6,6);
    // midsommardagen: första lördag efter 20/6
    for(let d=20;d<=26;d++){const dt=new Date(year,5,d);if(dt.getDay()==6){add(6,d);break;}}
    // alla helgons dag: första lördag mellan 31/10–6/11
    for(let d=31;d<=6;d++){const dt=new Date(year,d>12?9:10,d>12?d-12:d);if(dt.getDay()==6){add(dt.getMonth()+1,dt.getDate());break;}}
    add(12,25); add(12,26);
    return H;
  }

  function calcEaster(Y){
    const C=Math.floor(Y/100),N=Y-19*Math.floor(Y/19),
          K=Math.floor((C-17)/25),I=C-Math.floor(C/4)-Math.floor((C-K)/3)+19*N+15;
    const J=I-30*Math.floor(I/30)-Math.floor(I/28)*(1-Math.floor(I/28)*Math.floor(29/(I+1))*Math.floor((21-N)/11));
    const L=Y+Math.floor(Y/4)+J+2-C+Math.floor(C/4);
    const M=(L-7*Math.floor(L/7))+J;
    const month=3+Math.floor((M+40)/44)-1;
    const day=M+28-31*Math.floor(month/4);
    return new Date(Y,month,day);
  }

  // === Inställningar ===
  window.saveSettings = function () {
    state.settings.company = $("cfgCompany").value;
    state.settings.name = $("cfgName").value;
    state.settings.emp = $("cfgEmp").value;
    state.settings.owner = $("cfgOwner").value;
    state.settings.year = Number($("cfgYear").value) || new Date().getFullYear();
    state.settings.note = $("cfgNote").value;
    state.settings.autoBackup = $("cfgAutoBackup").checked;
    state.settings.holidays = $("cfgHolidays").checked;
    state.settings.holidayHours = Number($("cfgHolidayHours").value) || 8;
    saveCfg();
    alert("Inställningar sparade!");
    renderMonth();
  };

  window.resetSettings = function () {
    if (!confirm("Rensa alla inställningar?")) return;
    localStorage.removeItem(CFG_KEY);
    location.reload();
  };

  // === Allmän rensning ===
  window.resetAll = function () {
    if (!confirm("Vill du verkligen ta bort ALL data och inställningar?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CFG_KEY);
    location.reload();
  };

  // === Publika metoder ===
  return {
    removeRow,
    toggleMenu,
    renderMonth
  };
})();

console.log("%cApp.js laddad ✅ (Vidare utveckling 1)", "color:green");