// app.js
// Huvudlogik för Tidrapport v10.21

(function () {
  const STORAGE_KEY = "tidrapport_v10_21_entries";
  const SETTINGS_KEY = "tidrapport_v10_21_settings";

  const categoryOptions = [
    "Ordinarie tid",
    "Flextid",
    "Övertid <2",
    "Övertid >2",
    "ÖT Helg",
    "Semester",
    "Semester-tim",
    "ATF",
    "VAB",
    "Föräldraledig",
    "Sjuk",
    "Traktamente"
  ];

  // ----- DOM helpers -----
  const $ = (id) => document.getElementById(id);

  // Elements
  const dateInput = $("date");
  const projectInput = $("project");
  const driveInput = $("drive");
  const noteInput = $("note");
  const categoryRowsEl = $("categoryRows");
  const addCategoryRowBtn = $("addCategoryRowBtn");
  const addEntryBtn = $("addEntryBtn");
  const quickBackupBtn = $("quickBackupBtn");

  const entriesBody = $("entriesBody");
  const totalsLine = $("totalsLine");
  const alarmList = $("alarmList");
  const yearBody = $("yearBody");

  const menuToggle = $("menuToggle");
  const menuBackdrop = $("menuBackdrop");
  const sideMenu = $("sideMenu");
  const menuYear = $("menuYear");
  const menuMonth = $("menuMonth");
  const importFile = $("importFile");
  const menuBackupBtn = $("menuBackupBtn");
  const menuExportCsvBtn = $("menuExportCsvBtn");
  const menuExportPdfBtn = $("menuExportPdfBtn");
  const menuExportYearBtn = $("menuExportYearBtn");
  const menuSearchBtn = $("menuSearchBtn");
  const menuClearBtn = $("menuClearBtn");
  const settingCompany = $("settingCompany");
  const settingName = $("settingName");
  const settingEmployee = $("settingEmployee");
  const settingRedDayHours = $("settingRedDayHours");
  const toggleShowRedDays = $("toggleShowRedDays");
  const toggleAutoBackup = $("toggleAutoBackup");

  const goSearch = $("goSearch");
  const goHelp = $("goHelp");

  // ----- State -----
  let entries = loadEntries();
  let settings = loadSettings();
  let currentYearMonth = getTodayYearMonth();

  // ----- Init -----
  init();

  function init() {
    initCategoryRows();
    initMenu();
    bindEvents();
    renderAll();
  }

  function bindEvents() {
    addCategoryRowBtn.addEventListener("click", () => addCategoryRow());
    addEntryBtn.addEventListener("click", onAddEntry);
    quickBackupBtn.addEventListener("click", () => Backup.exportJson(entries));

    menuToggle.addEventListener("click", openMenu);
    menuBackdrop.addEventListener("click", closeMenu);

    menuBackupBtn.addEventListener("click", () => Backup.exportJson(entries));
    importFile.addEventListener("change", onImportJson);
    menuExportCsvBtn.addEventListener("click", () => Exporter.exportMonthCsv(currentYearMonth.year, currentYearMonth.month, entries));
    menuExportPdfBtn.addEventListener("click", () => Exporter.exportMonthPdf(currentYearMonth.year, currentYearMonth.month, entries, settings));
    menuExportYearBtn.addEventListener("click", () => Exporter.exportYearCsv(entries));
    menuSearchBtn.addEventListener("click", () => { window.location.href = "search.html"; });
    menuClearBtn.addEventListener("click", onClearAll);

    menuYear.addEventListener("change", onChangePeriod);
    menuMonth.addEventListener("change", onChangePeriod);

    settingCompany.addEventListener("input", saveSettingsFromUI);
    settingName.addEventListener("input", saveSettingsFromUI);
    settingEmployee.addEventListener("input", saveSettingsFromUI);
    settingRedDayHours.addEventListener("input", saveSettingsFromUI);

    toggleShowRedDays.addEventListener("click", () => {
      toggleShowRedDays.classList.toggle("on");
      settings.showRedDays = toggleShowRedDays.classList.contains("on");
      saveSettings();
      renderAll();
    });

    toggleAutoBackup.addEventListener("click", () => {
      toggleAutoBackup.classList.toggle("on");
      settings.autoBackup = toggleAutoBackup.classList.contains("on");
      saveSettings();
    });

    goSearch.addEventListener("click", () => { window.location.href = "search.html"; });
    goHelp.addEventListener("click", () => { window.location.href = "help.html"; });
  }

  // ----- Category rows -----
  function initCategoryRows() {
    categoryRowsEl.innerHTML = "";
    addCategoryRow();
  }

  function addCategoryRow(category = "", hours = "") {
    const row = document.createElement("div");
    row.className = "category-row";

    const sel = document.createElement("select");
    sel.className = "category-select";
    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = "(välj)";
    sel.appendChild(optEmpty);
    for (const cat of categoryOptions) {
      const o = document.createElement("option");
      o.value = cat;
      o.textContent = cat;
      sel.appendChild(o);
    }
    if (category) sel.value = category;

    const hoursInput = document.createElement("input");
    hoursInput.className = "hours-input";
    hoursInput.type = "text";
    hoursInput.placeholder = "t.ex. 8 eller -2";
    hoursInput.value = hours;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "−";
    removeBtn.title = "Ta bort rad";
    removeBtn.addEventListener("click", () => {
      if (categoryRowsEl.children.length > 1) {
        row.remove();
      }
    });

    row.appendChild(sel);
    row.appendChild(hoursInput);
    row.appendChild(removeBtn);

    categoryRowsEl.appendChild(row);
  }

  // ----- Add entry -----
  function onAddEntry() {
    const date = dateInput.value;
    if (!date) return alert("Välj datum.");
    const project = projectInput.value.trim();
    const drive = parseNumber(driveInput.value);
    const note = noteInput.value.trim();

    const cats = [];
    for (const row of categoryRowsEl.querySelectorAll(".category-row")) {
      const sel = row.querySelector("select");
      const inp = row.querySelector("input");
      const cat = sel.value;
      const hrsStr = inp.value.trim();
      if (!cat && !hrsStr) continue;
      if (!cat || !hrsStr) {
        return alert("Varje kategori-rad måste ha både kategori och timmar.");
      }
      const hrs = parseNumber(hrsStr);
      if (isNaN(hrs)) {
        return alert("Ogiltigt timvärde: " + hrsStr);
      }
      cats.push({ category: cat, hours: hrs });
    }

    if (cats.length === 0) {
      return alert("Ange minst en kategori.");
    }

    // Regler i inmatningen

    // 1. Inga dubbletter
    const names = cats.map(c => c.category);
    const hasDup = names.some((c, i) => names.indexOf(c) !== i);
    if (hasDup) {
      return alert("Samma kategori får inte förekomma två gånger i samma inmatning.");
    }

    const hasOrd = names.includes("Ordinarie tid");
    const hasAbsence = Balansregler.ABSENCE.some(a => names.includes(a));
    const hasMinus = cats.some(c => c.hours < 0 && Balansregler.NEG_BANK.includes(c.category));

    if (hasOrd && hasAbsence) {
      return alert("Du kan inte blanda Ordinarie tid med VAB/Sjuk/FL i samma inmatning.");
    }
    if (hasOrd && hasMinus) {
      return alert("Du kan inte blanda Ordinarie tid med minusvärden (Flex-/ATF-/ÖT-/Semester-tim) i samma inmatning.");
    }

    // Skapa bunt
    const id = "id_" + Date.now() + "_" + Math.random().toString(16).slice(2);
    const newEntries = [];
    cats.forEach((c, index) => {
      newEntries.push({
        id,
        date,
        project,
        category: c.category,
        hours: c.hours,
        drive: index === 0 ? (isNaN(drive) ? 0 : drive) : 0,
        note: index === 0 ? note : ""
      });
    });

    entries = entries.concat(newEntries);
    saveEntries();
    if (settings.autoBackup) {
      Backup.exportJson(entries, true);
    }

    // Reset formulär (behåll datum/projekt för smidig inmatning)
    driveInput.value = "";
    noteInput.value = "";
    initCategoryRows();

    renderAll();
  }

  // ----- Storage -----
  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveEntries() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    renderAll();
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const s = raw ? JSON.parse(raw) : {};
      return {
        company: s.company || "",
        name: s.name || "",
        employee: s.employee || "",
        redDayHours: typeof s.redDayHours === "number" ? s.redDayHours : 8,
        showRedDays: !!s.showRedDays,
        autoBackup: !!s.autoBackup,
        extraRedDays: Array.isArray(s.extraRedDays) ? s.extraRedDays : []
      };
    } catch {
      return {
        company: "",
        name: "",
        employee: "",
        redDayHours: 8,
        showRedDays: true,
        autoBackup: false,
        extraRedDays: []
      };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function saveSettingsFromUI() {
    settings.company = settingCompany.value.trim();
    settings.name = settingName.value.trim();
    settings.employee = settingEmployee.value.trim();
    settings.redDayHours = parseFloat(settingRedDayHours.value) || 8;
    saveSettings();
  }

  // ----- Render -----
  function renderAll() {
    renderMenuUI();
    renderEntriesTable();
    renderTotalsAndAlarm();
    renderYearOverview();
  }

  function renderMenuUI() {
    // Period dropdowns
    const years = getKnownYears();
    menuYear.innerHTML = "";
    years.forEach(y => {
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      if (y === currentYearMonth.year) o.selected = true;
      menuYear.appendChild(o);
    });
    menuMonth.innerHTML = "";
    for (let m = 1; m <= 12; m++) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m.toString().padStart(2,"0");
      if (m === currentYearMonth.month) o.selected = true;
      menuMonth.appendChild(o);
    }

    // Settings UI
    settingCompany.value = settings.company || "";
    settingName.value = settings.name || "";
    settingEmployee.value = settings.employee || "";
    settingRedDayHours.value = settings.redDayHours != null ? settings.redDayHours : 8;
    toggleShowRedDays.classList.toggle("on", !!settings.showRedDays);
    toggleAutoBackup.classList.toggle("on", !!settings.autoBackup);
  }

  function renderEntriesTable() {
    const {year, month} = currentYearMonth;
    const monthEntries = entries
      .filter(e => {
        const d = e.date.split("-");
        return Number(d[0]) === year && Number(d[1]) === month;
      })
      .sort((a,b) => (a.date+a.id).localeCompare(b.date+b.id));

    entriesBody.innerHTML = "";

    const grouped = groupBy(monthEntries, e => e.id);
    for (const groupId of Object.keys(grouped).sort()) {
      const rows = grouped[groupId];
      for (let i = 0; i < rows.length; i++) {
        const e = rows[i];
        const tr = document.createElement("tr");

        // Färg per dag (inte per rad)
        const dayEntries = monthEntries.filter(x => x.date === e.date);
        const cls = Balansregler.classifyDay(e.date, dayEntries, settings).status;
        if (cls === "ok") tr.classList.add("row-ok");
        else if (cls === "under") tr.classList.add("row-warn");
        else if (cls === "missing") tr.classList.add("row-absent");

        const tdDate = document.createElement("td");
        tdDate.textContent = i === 0 ? e.date : "";
        const tdProj = document.createElement("td");
        tdProj.textContent = i === 0 ? e.project : "";
        const tdCat = document.createElement("td");
        tdCat.textContent = e.category;
        const tdHours = document.createElement("td");
        tdHours.textContent = formatNumber(e.hours);
        const tdDrive = document.createElement("td");
        tdDrive.textContent = i === 0 && e.drive ? formatNumber(e.drive) : "";
        const tdNote = document.createElement("td");
        tdNote.textContent = i === 0 ? e.note : "";

        const tdDel = document.createElement("td");
        if (i === 0) {
          const btn = document.createElement("button");
          btn.textContent = "🗑️";
          btn.style.border = "none";
          btn.style.background = "none";
          btn.style.cursor = "pointer";
          btn.title = "Ta bort alla rader i denna inmatning";
          btn.addEventListener("click", () => {
            if (confirm("Ta bort denna inmatning (alla rader)?")) {
              entries = entries.filter(x => x.id !== e.id);
              saveEntries();
            }
          });
          tdDel.appendChild(btn);
        }

        tr.appendChild(tdDate);
        tr.appendChild(tdProj);
        tr.appendChild(tdCat);
        tr.appendChild(tdHours);
        tr.appendChild(tdDrive);
        tr.appendChild(tdNote);
        tr.appendChild(tdDel);

        entriesBody.appendChild(tr);
      }
    }
  }

  function renderTotalsAndAlarm() {
    const {year, month} = currentYearMonth;
    const monthEntries = entries.filter(e => {
      const [y,m] = e.date.split("-").map(Number);
      return y === year && m === month;
    });

    // Totals
    const {sum, drive} = (() => {
      const s = {};
      let d = 0;
      for (const e of monthEntries) {
        s[e.category] = (s[e.category] || 0) + e.hours;
        d += (e.drive || 0);
      }
      return {sum: s, drive: d};
    })();

    const parts = [];
    parts.push("Ordinarie: " + formatNumber(sum["Ordinarie tid"] || 0) + "h");
    parts.push("Körtid: " + formatNumber(drive) + "h");
    parts.push("Flex: " + formatNumber(sum["Flextid"] || 0) + "h");
    parts.push("ÖT<2: " + formatNumber(sum["Övertid <2"] || 0) + "h");
    parts.push("ÖT>2: " + formatNumber(sum["Övertid >2"] || 0) + "h");
    parts.push("ÖT Helg: " + formatNumber(sum["ÖT Helg"] || 0) + "h");
    parts.push("Semester: " + formatNumber((sum["Semester"]||0)+(sum["Semester-tim"]||0)) + "h");
    parts.push("ATF: " + formatNumber(sum["ATF"] || 0) + "h");
    parts.push("VAB: " + formatNumber(sum["VAB"] || 0) + "h");
    parts.push("FL: " + formatNumber(sum["Föräldraledig"] || 0) + "h");
    parts.push("Sjuk: " + formatNumber(sum["Sjuk"] || 0) + "h");
    parts.push("Trakt: " + (sum["Traktamente"] || 0) + " st");

    totalsLine.textContent = parts.join(" | ");

    // Alarm-lista
    alarmList.innerHTML = "";
    if (monthEntries.length === 0) return;

    const daysInMonth = new Date(year, month, 0).getDate();
    const todayStr = getTodayIso();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dayEntries = monthEntries.filter(e => e.date === dateStr);
      const info = Balansregler.classifyDay(dateStr, dayEntries, settings, todayStr);
      if (!info.showAlarm) continue;

      const row = document.createElement("div");
      row.className = "alarm-row";
      const icon = document.createElement("span");
      icon.textContent = info.status === "missing" ? "ⓘ" : "⚠️";
      const dateSpan = document.createElement("span");
      dateSpan.className = "date";
      dateSpan.textContent = dateStr;
      const msg = document.createElement("span");
      msg.className = "msg";
      msg.textContent = info.label;

      row.appendChild(icon);
      row.appendChild(dateSpan);
      row.appendChild(msg);
      alarmList.appendChild(row);
    }
  }

  function renderYearOverview() {
    const {monthNames, result} = Balansregler.computeYearTotals(entries);
    yearBody.innerHTML = "";
    for (let m = 1; m <= 12; m++) {
      const r = result[m];
      const tr = document.createElement("tr");
      const cells = [
        monthNames[m-1],
        r ? formatNumber(r.ord) : "0",
        r ? formatNumber(r.drive) : "0",
        r ? formatNumber(r.flex) : "0",
        r ? formatNumber(r.otlt2) : "0",
        r ? formatNumber(r.otgt2) : "0",
        r ? formatNumber(r.othel) : "0",
        r ? formatNumber(r.sem) : "0",
        r ? formatNumber(r.atf) : "0",
        r ? formatNumber(r.vab) : "0",
        r ? formatNumber(r.fl) : "0",
        r ? formatNumber(r.sjuk) : "0",
        r ? (r.trakt || 0) : "0"
      ];
      for (const c of cells) {
        const td = document.createElement("td");
        td.textContent = c;
        tr.appendChild(td);
      }
      yearBody.appendChild(tr);
    }
  }

  // ----- Menu open/close -----
  function openMenu() {
    sideMenu.classList.add("open");
    menuBackdrop.classList.add("open");
  }
  function closeMenu() {
    sideMenu.classList.remove("open");
    menuBackdrop.classList.remove("open");
  }

  // ----- Events -----
  function onImportJson(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error();
        if (!confirm("Detta ersätter befintliga registreringar. Fortsätta?")) return;
        entries = data;
        saveEntries();
        alert("Data importerad.");
      } catch {
        alert("Ogiltig fil.");
      }
    };
    reader.readAsText(file);
  }

  function onClearAll() {
    if (!confirm("Är du säker? Detta raderar ALL din data.")) return;
    entries = [];
    localStorage.removeItem(STORAGE_KEY);
    renderAll();
  }

  function onChangePeriod() {
    const y = Number(menuYear.value) || currentYearMonth.year;
    const m = Number(menuMonth.value) || currentYearMonth.month;
    currentYearMonth = {year: y, month: m};
    renderAll();
  }

  // ----- Utils -----
  function parseNumber(str) {
    if (!str) return 0;
    const s = str.replace(",", ".").trim();
    return Number(s);
  }
  function formatNumber(v) {
    return (Math.round(v * 100) / 100).toFixed(2).replace(".", ",");
  }
  function groupBy(arr, fn) {
    const map = {};
    arr.forEach(item => {
      const k = fn(item);
      (map[k] = map[k] || []).push(item);
    });
    return map;
  }
  function getKnownYears() {
    const years = new Set();
    const today = new Date().getFullYear();
    years.add(today);
    entries.forEach(e => {
      const y = Number(e.date.split("-")[0]);
      if (y) years.add(y);
    });
    return Array.from(years).sort((a,b)=>a-b);
  }
  function getTodayYearMonth() {
    const t = new Date();
    return {year: t.getFullYear(), month: t.getMonth()+1};
  }
  function getTodayIso() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
  }

})();