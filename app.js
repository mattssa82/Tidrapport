// app.js
// Tidrapport v10.19
// Bas v10.15 + regler & larm
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION = "10.19";
  const DATA_KEY = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  let allData = {};    // { "1":[rows], "2":[rows], ... }
  let settings = {};
  let editId = null;

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    populateCategorySelects();
    renderMonth();
    renderYearOverview();
    registerServiceWorker();
    if(window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" klar.");
  });

  // ---------- Helpers ----------

  function get(id){ return document.getElementById(id); }

  function parseFloatSafe(v){
    if(v === undefined || v === null) return 0;
    const s = String(v).replace(",", ".").trim();
    if(s === "") return 0;
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  }

  function genRowId(){
    return Date.now()+"_"+Math.floor(Math.random()*1e6);
  }

  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10);
    const m = parseInt(get("monthSelect").value,10);
    return [y,m];
  }

  // ---------- Load / Save ----------

  function loadData(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
      if(!allData || typeof allData !== "object") allData = {};
    }catch{
      allData = {};
    }
  }

  function saveData(reason){
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup(reason || "data-change");
  }

  function loadSettings(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      settings = raw ? JSON.parse(raw) : {};
      if(!settings || typeof settings !== "object") settings = {};
    }catch{
      settings = {};
    }

    get("companyInput").value = settings.company || "";
    get("nameInput").value = settings.name || "";
    get("anstnrInput").value = settings.emp || "";
    get("autoBackupChk").checked = !!settings.autoBackup;
    get("redDayHoursInput").value = settings.redDayHours != null ? settings.redDayHours : 8;
  }

  function saveSettingsFromUI(){
    settings.company = get("companyInput").value.trim();
    settings.name = get("nameInput").value.trim();
    settings.emp = get("anstnrInput").value.trim();
    settings.autoBackup = get("autoBackupChk").checked;
    settings.redDayHours = parseFloatSafe(get("redDayHoursInput").value) || 8;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    renderMonth();
    renderYearOverview();
    autoLocalBackup("settings-change");
    alert("Inställningar sparade.");
  }

  // ---------- UI bind ----------

  function bindUI(){
    // inmatning
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

    // backup / import / export
    get("manualBackupBtn").addEventListener("click", manualBackupNow);
    get("manualBackupBtn2").addEventListener("click", manualBackupNow);
    get("importFileInput").addEventListener("change", onImportFileInputChange);

    get("exportCsvBtn").addEventListener("click", () => {
      const [y,m] = currentYearMonth();
      exportCSVImpl(flattenDataForExportMonth(), settings, y, m);
    });
    get("exportPdfBtn").addEventListener("click", () => {
      const [y,m] = currentYearMonth();
      exportPDFImpl(flattenDataForExportMonth(), settings, y, m);
    });
    get("exportYearBtn").addEventListener("click", () => {
      exportYearImpl(flattenDataFullYear(), settings);
    });

    // sökknapp i menyn -> separat sida
    get("openSearchBtn").addEventListener("click", () => {
      window.location.href = "search.html";
    });

    // rensa allt
    get("clearAllBtn").addEventListener("click", clearAllDataConfirm);

    // inställningar
    get("autoBackupChk").addEventListener("change", saveSettingsFromUI);
    get("redDayHoursInput").addEventListener("change", saveSettingsFromUI);
    get("saveSettingsBtn") && get("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);

    // period
    get("yearSelect").addEventListener("change", () => {
      renderMonth();
      renderYearOverview();
    });
    get("monthSelect").addEventListener("change", renderMonth);

    // meny
    initMenuToggle();

    // klick i datum öppnar picker (om stöd)
    const di = get("dateInput");
    if(di && di.showPicker){
      di.addEventListener("click", e => e.target.showPicker());
    }
  }

  function initMenuToggle(){
    const panel = get("sidePanel");
    const btn = get("menuToggleBtn");
    if(!panel || !btn) return;

    btn.addEventListener("click", e => {
      e.stopPropagation();
      const willOpen = !panel.classList.contains("open");
      panel.classList.toggle("open", willOpen);
      panel.setAttribute("aria-hidden", willOpen ? "false" : "true");
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    document.addEventListener("click", e => {
      if(!panel.classList.contains("open")) return;
      if(panel.contains(e.target) || btn.contains(e.target)) return;
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden","true");
      btn.setAttribute("aria-expanded","false");
    });
  }

  // ---------- Kategorier ----------

  function populateCategorySelects(){
    const CATS = [
      "Ordinarie tid",
      "Flextid",
      "ATF",
      "Övertid <2",
      "Övertid >2",
      "Övertid Helg",
      "Semester",
      "VAB",
      "Sjuk",
      "FL",
      "Traktamente",
      "Röddag"
    ];

    const main = get("catMainSelect");
    main.innerHTML = CATS.map(c => `<option value="${c}">${c}</option>`).join("");

    document.querySelectorAll(".catExtraSelect").forEach(sel => {
      sel.innerHTML =
        `<option value="">(ingen)</option>` +
        CATS.map(c => `<option value="${c}">${c}</option>`).join("");
    });
  }

  // ---------- Periodval ----------

  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth()+1;

    const years = new Set([curY]);
    Object.keys(allData).forEach(mKey => {
      (allData[mKey] || []).forEach(r => {
        if(!r.datum) return;
        const d = new Date(r.datum);
        const y = d.getFullYear();
        if(!isNaN(y)) years.add(y);
      });
    });

    const sorted = [...years].sort((a,b)=>a-b);
    ySel.innerHTML = sorted.map(y =>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];
    mSel.innerHTML = monthNames.map((name,i) =>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  // ---------- Spara rad (bundle) ----------

  function onSaveEntry(){
    const [year, month] = currentYearMonth();
    if(!allData[month]) allData[month] = [];

    const datum = (get("dateInput").value || "").trim();
    if(!datum){
      alert("Datum saknas.");
      return;
    }

    // säkerställ att datum tillhör vald månad
    const d = new Date(datum);
    if(isNaN(d.getTime()) || (d.getMonth()+1) !== month || d.getFullYear() !== year){
      if(!confirm("Datumet ligger inte i vald period. Vill du spara ändå?")){
        return;
      }
    }

    const projekt = (get("projektInput").value || "").trim();
    const drive = parseFloatSafe(get("driveHoursInput").value);

    // samla kategorier (max 3 st + ev. Traktamente)
    const cats = [];

    const mainCat = get("catMainSelect").value || "";
    const mainH = parseFloatSafe(get("catMainHours").value);
    if(mainCat){
      cats.push({ cat: mainCat, h: mainH });
    }

    document.querySelectorAll(".catExtraSelect").forEach(sel => {
      const idx = sel.dataset.extraIndex;
      const hInput = document.querySelector(`.catExtraHours[data-extra-index="${idx}"]`);
      const cat = sel.value || "";
      const h = parseFloatSafe(hInput ? hInput.value : "");
      if(cat){
        cats.push({ cat, h });
      }
    });

    if(!cats.length){
      alert("Minst en kategori krävs.");
      return;
    }

    // REGLER: inga dubletter av kategori i samma inmatning
    const seen = new Set();
    for(const c of cats){
      const key = c.cat.toLowerCase();
      if(seen.has(key)){
        alert("Samma kategori får inte förekomma flera gånger i samma inmatning.");
        return;
      }
      seen.add(key);
    }

    const hasOrd = cats.some(c => c.cat.toLowerCase().includes("ordinarie"));
    const hasAbs = cats.some(c => isAbsenceCat(c.cat));
    const hasNegBank = cats.some(c => c.h < 0 && isBankCat(c.cat));

    // Ordinarie + VAB/Sjuk/FL i samma input → ej tillåtet
    if(hasOrd && hasAbs){
      alert("Ordinarie tid kan inte kombineras med VAB/Sjuk/FL i samma inmatning. Dela upp dagen i flera rader.");
      return;
    }

    // Ordinarie + minusbank i samma input → ej tillåtet
    if(hasOrd && hasNegBank){
      alert("Ordinarie tid kan inte kombineras med minusvärden (Flextid/ATF/ÖT/Helg/semester-tim) i samma inmatning. Dela upp detta.");
      return;
    }

    const note = (get("noteInput").value || "").trim();
    const rowId = editId || genRowId();

    // Om vi redigerar: ta bort alla gamla med samma id
    if(editId){
      allData[month] = (allData[month] || []).filter(r => r._id !== editId);
    }

    // Skriv ut rader:
    // - Första kategori-raden får körtid + anteckning.
    // - Övriga rader: kortid = 0, beskrivning = "".
    cats.forEach((c, index) => {
      allData[month].push({
        _id: rowId,
        datum,
        projekt,
        kategori: c.cat,
        tid: c.h,
        kortid: index === 0 ? drive : 0,
        beskrivning: index === 0 ? note : ""
      });
    });

    saveData(editId ? "edit-entry" : "add-entry");
    clearForm();
    renderMonth();
    renderYearOverview();
  }

  function isAbsenceCat(cat){
    const c = (cat || "").toLowerCase();
    return c.includes("vab") || c.includes("sjuk") || c === "fl" || c.includes("föräldraled");
  }

  function isBankCat(cat){
    const c = (cat || "").toLowerCase();
    return (
      c.includes("flextid") ||
      c === "atf" ||
      c.includes("övertid") ||
      c.includes("helg") ||
      c.includes("semester-tim")
    );
  }

  function cancelEdit(){
    clearForm();
  }

  function clearForm(){
    editId = null;
    get("dateInput").value = "";
    get("projektInput").value = "";
    get("driveHoursInput").value = "";
    get("catMainHours").value = "";
    get("noteInput").value = "";
    get("saveEntryLabel").textContent = "Lägg till";
    get("cancelEditBtn").style.display = "none";
    // återställ selecter
    populateCategorySelects();
    // töm extrahours
    document.querySelectorAll(".catExtraHours").forEach(i => i.value="");
  }

  // ---------- Redigera / Radera ----------

  function startEdit(rowId){
    const [year,month] = currentYearMonth();
    const arr = allData[month] || [];
    const bundle = arr.filter(r => r._id === rowId);
    if(!bundle.length) return;

    editId = rowId;
    const base = bundle[0];

    get("dateInput").value = base.datum || "";
    get("projektInput").value = base.projekt || "";
    get("driveHoursInput").value = base.kortid || "";
    get("noteInput").value = base.beskrivning || "";

    // sort by index they were created? vi tar i ordning
    const cats = bundle.map(r => ({cat:r.kategori, h:r.tid}));

    populateCategorySelects();

    if(cats[0]){
      get("catMainSelect").value = cats[0].cat || "";
      get("catMainHours").value = cats[0].h || "";
    }
    const ex1Sel = document.querySelector('.catExtraSelect[data-extra-index="1"]');
    const ex1H = document.querySelector('.catExtraHours[data-extra-index="1"]');
    const ex2Sel = document.querySelector('.catExtraSelect[data-extra-index="2"]');
    const ex2H = document.querySelector('.catExtraHours[data-extra-index="2"]');

    if(cats[1] && ex1Sel && ex1H){
      ex1Sel.value = cats[1].cat || "";
      ex1H.value = cats[1].h || "";
    }
    if(cats[2] && ex2Sel && ex2H){
      ex2Sel.value = cats[2].cat || "";
      ex2H.value = cats[2].h || "";
    }

    get("saveEntryLabel").textContent = "Spara";
    get("cancelEditBtn").style.display = "inline-flex";
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    const [year,month] = currentYearMonth();
    if(!confirm("Ta bort inmatningen?")) return;
    allData[month] = (allData[month] || []).filter(r => r._id !== rowId);
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
  }

  // ---------- Render MÅNAD ----------

  function renderMonth(){
    const [year,month] = currentYearMonth();
    const tbody = get("monthTableBody");
    if(!tbody) return;
    tbody.innerHTML = "";

    const rows = (allData[month] || []).slice().sort((a,b) =>
      (a.datum||"").localeCompare(b.datum||"") || (a._id||"").localeCompare(b._id||"")
    );

    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    rows.forEach(r => {
      const tr = document.createElement("tr");
      const st = statusMap[r.datum]?.status;
      if(st){ tr.classList.add("dagstatus--"+st); }

      tr.innerHTML = `
        <td>${r.datum || ""}</td>
        <td>${r.projekt || ""}</td>
        <td>${r.kategori || ""}</td>
        <td>${(r.tid ?? "")}</td>
        <td>${r.kortid ? r.kortid : ""}</td>
        <td>${(r.beskrivning || "").replace(/\r?\n/g," ")}</td>
        <td style="white-space:nowrap;">
          <button class="icon-table-btn" data-act="edit" data-id="${r._id}" title="Ändra">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="icon-table-btn delete" data-act="del" data-id="${r._id}" title="Ta bort">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // actions
    tbody.querySelectorAll("button[data-act='edit']").forEach(b => {
      b.addEventListener("click", () => startEdit(b.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(b => {
      b.addEventListener("click", () => deleteRow(b.dataset.id));
    });

    if(window.lucide) lucide.createIcons();
    renderMonthSummary(rows);
    renderAlarms(statusMap, year, month);
  }

  function renderMonthSummary(rows){
    const cell = get("monthSummaryCell");
    if(!cell) return;

    const sum = {
      ord:0,
      kortid:0,
      flex:0,
      ot1:0,
      ot2:0,
      oth:0,
      sem:0,
      atf:0,
      vab:0,
      fl:0,
      sjuk:0,
      trakt:0
    };

    rows.forEach(r => {
      const cat = (r.kategori || "").toLowerCase();
      const h = parseFloatSafe(r.tid);
      const k = parseFloatSafe(r.kortid);

      if(cat.includes("trakt")) sum.trakt += 1;

      // minusbank -> på månadsnivå summerar vi som registrerat, ej flytt till ordinarie här
      if(cat.includes("ordinarie")) sum.ord += h;
      if(cat.includes("flex")) sum.flex += h;
      if(cat === "atf") sum.atf += h;
      if(cat.includes("övertid") && cat.includes("<2")) sum.ot1 += h;
      if(cat.includes("övertid") && cat.includes(">2")) sum.ot2 += h;
      if(cat.includes("övertid") && cat.includes("helg")) sum.oth += h;
      if(cat.includes("semest") && !cat.includes("tim")) sum.sem += h;
      if(cat.includes("vab")) sum.vab += h;
      if(cat === "fl") sum.fl += h;
      if(cat.includes("sjuk")) sum.sjuk += h;

      sum.kortid += k;
    });

    cell.textContent =
      `Ordinarie: ${sum.ord.toFixed(2)}h | `+
      `Körtid: ${sum.kortid.toFixed(2)}h | `+
      `Flex: ${sum.flex.toFixed(2)}h | `+
      `ÖT<2: ${sum.ot1.toFixed(2)}h | `+
      `ÖT>2: ${sum.ot2.toFixed(2)}h | `+
      `ÖT Helg: ${sum.oth.toFixed(2)}h | `+
      `Semester: ${sum.sem.toFixed(2)}h | `+
      `ATF: ${sum.atf.toFixed(2)}h | `+
      `VAB: ${sum.vab.toFixed(2)}h | `+
      `FL: ${sum.fl.toFixed(2)}h | `+
      `Sjuk: ${sum.sjuk.toFixed(2)}h | `+
      `Trakt: ${sum.trakt} st`;
  }

  // ---------- Larm / Obalans ----------

  function renderAlarms(statusMap, year, month){
    const card = get("alarmCard");
    const list = get("alarmList");
    if(!card || !list){
      return;
    }
    list.innerHTML = "";

    const today = new Date();
    let count = 0;

    Object.keys(statusMap).sort().forEach(ds => {
      const d = new Date(ds);
      if(isNaN(d)) return;
      if(d > today) return; // framtid → inget larm

      const st = statusMap[ds].status;
      if(st === "saknas" || st === "orange_under" || st === "orange_absence"){
        count++;
        const li = document.createElement("li");

        let icon = "alert-octagon";
        let text = "";
        if(st === "saknas"){
          text = "Ingen registrering (vardag).";
          icon = "alert-octagon";
        }else if(st === "orange_under"){
          text = "Under 8h registrerad tid.";
          icon = "alert-triangle";
        }else if(st === "orange_absence"){
          text = "Frånvaro (VAB/Sjuk/FL) markerad.";
          icon = "info";
        }

        li.innerHTML = `
          <span class="alarm-icon"><i data-lucide="${icon}"></i></span>
          <span class="alarm-date">${ds}</span>
          <span class="alarm-text">${text}</span>
        `;
        list.appendChild(li);
      }
    });

    if(window.lucide) lucide.createIcons();

    card.classList.toggle("hidden", count === 0);
  }

  // ---------- Årsöversikt ----------

  function renderYearOverview(){
    const tbody = get("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML = "";

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];

    for(let m=1; m<=12; m++){
      const arr = (allData[m] || []);
      const sum = {
        ord:0,
        kortid:0,
        flex:0,
        ot1:0,
        ot2:0,
        oth:0,
        sem:0,
        atf:0,
        vab:0,
        fl:0,
        sjuk:0,
        trakt:0
      };

      arr.forEach(r => {
        const cat = (r.kategori || "").toLowerCase();
        const h = parseFloatSafe(r.tid);
        const k = parseFloatSafe(r.kortid);

        if(cat.includes("trakt")) sum.trakt += 1;
        if(cat.includes("ordinarie")) sum.ord += h;
        if(cat.includes("flex")) sum.flex += h;
        if(cat === "atf") sum.atf += h;
        if(cat.includes("övertid") && cat.includes("<2")) sum.ot1 += h;
        if(cat.includes("övertid") && cat.includes(">2")) sum.ot2 += h;
        if(cat.includes("övertid") && cat.includes("helg")) sum.oth += h;
        if(cat.includes("semest") && !cat.includes("tim")) sum.sem += h;
        if(cat.includes("vab")) sum.vab += h;
        if(cat === "fl") sum.fl += h;
        if(cat.includes("sjuk")) sum.sjuk += h;

        sum.kortid += k;
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m-1]}</td>
        <td>${sum.ord.toFixed(2)}</td>
        <td>${sum.kortid.toFixed(2)}</td>
        <td>${sum.flex.toFixed(2)}</td>
        <td>${sum.ot1.toFixed(2)}</td>
        <td>${sum.ot2.toFixed(2)}</td>
        <td>${sum.oth.toFixed(2)}</td>
        <td>${sum.sem.toFixed(2)}</td>
        <td>${sum.atf.toFixed(2)}</td>
        <td>${sum.vab.toFixed(2)}</td>
        <td>${sum.fl.toFixed(2)}</td>
        <td>${sum.sjuk.toFixed(2)}</td>
        <td>${sum.trakt}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ---------- Backup / Import ----------

  function manualBackupNow(){
    manualBackup();
  }

  function onImportFileInputChange(ev){
    const f = ev.target.files[0];
    if(!f) return;

    importBackupFile(f, payload => {
      if(payload.data && typeof payload.data === "object"){
        allData = payload.data;
      }
      if(payload.settings && typeof payload.settings === "object"){
        settings = Object.assign({}, settings, payload.settings);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
      saveData("import");
      loadSettings();
      populateYearMonthSelectors();
      renderMonth();
      renderYearOverview();
      alert("Import klar.");
    });
  }

  function clearAllDataConfirm(){
    if(!confirm("Är du säker? Detta raderar ALL din data.")) return;
    allData = {};
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
  }

  // ---------- Flatten helpers ----------

  function flattenDataForExportMonth(){
    const [year,month] = currentYearMonth();
    return (allData[month] || []).slice().sort((a,b) =>
      (a.datum||"").localeCompare(b.datum||"") || (a._id||"").localeCompare(b._id||"")
    );
  }

  function flattenDataFullYear(){
    const out = [];
    Object.keys(allData).forEach(m => {
      (allData[m] || []).forEach(r => out.push(r));
    });
    return out;
  }

  // ---------- SW ----------

  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
        .catch(err => console.warn("SW fel:", err));
    }
  }

})();