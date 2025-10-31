// app.js
// Tidrapport v10.2
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION   = "10.2";
  const DATA_KEY      = "tidrapport_data_v10";         // { "9":[...], "10":[...], ... }
  const SETTINGS_KEY  = "tidrapport_settings_v10";     // { company,name,emp,redDays,showRedDays,autoBackup,... }

  // State
  // allData[monthNumber] = [ { _id, datum, kategori, tid, projekt, kortid, beskrivning }, ... ]
  let allData   = {};
  let settings  = {};
  let editId    = null; // aktiv bunt som redigeras

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    populateCategorySelects();
    renderMonth();
    renderYearOverview();
    registerServiceWorker();
    if (window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" laddad ✅");
  });

  // -----------------------------
  // Load / Save
  // -----------------------------
  function loadData(){
    try {
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
      if (typeof allData !== "object" || allData === null) allData = {};
    } catch {
      allData = {};
    }
  }

  function saveData(reason){
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup(reason || "data-change");
  }

  function loadSettings(){
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      settings = raw ? JSON.parse(raw) : {};
      if (typeof settings !== "object" || settings === null) settings = {};
    } catch {
      settings = {};
    }

    // fyll UI
    get("companyInput").value     = settings.company    || "";
    get("nameInput").value        = settings.name       || "";
    get("anstnrInput").value      = settings.emp        || "";
    get("redDaysInput").value     = settings.redDays    || "";
    get("showRedDaysChk").checked = !!settings.showRedDays;
    get("autoBackupChk").checked  = !!settings.autoBackup;
  }

  function saveSettingsFromUI(){
    settings.company     = get("companyInput").value.trim();
    settings.name        = get("nameInput").value.trim();
    settings.emp         = get("anstnrInput").value.trim();
    settings.redDays     = get("redDaysInput").value.trim();
    settings.showRedDays = get("showRedDaysChk").checked;
    settings.autoBackup  = get("autoBackupChk").checked;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    alert("Inställningar sparade.");
    renderMonth();
    renderYearOverview();
    autoLocalBackup("settings-change");
  }

  // -----------------------------
  // Helpers
  // -----------------------------
  function get(id){ return document.getElementById(id); }

  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10);
    const m = parseInt(get("monthSelect").value,10);
    return [y,m];
  }

  function genRowId(){
    return Date.now() + "_" + Math.floor(Math.random()*1e6);
  }

  // -----------------------------
  // UI bindings
  // -----------------------------
  function bindUI(){
    // inmatning
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

    // backup / import / export
    get("manualBackupBtn").addEventListener("click", manualBackupNow);
    get("manualBackupBtn2").addEventListener("click", manualBackupNow);
    get("importFileInput").addEventListener("change", onImportFileInputChange);

    get("exportCsvBtn").addEventListener("click", ()=>{
      const [year, month] = currentYearMonth();
      exportCSVImpl(
        flattenDataForExportMonth(year, month),
        settings,
        year,
        month
      );
    });

    get("exportPdfBtn").addEventListener("click", ()=>{
      const [year, month] = currentYearMonth();
      exportPDFImpl(
        flattenDataForExportMonth(year, month),
        settings,
        year,
        month
      );
    });

    get("exportYearBtn").addEventListener("click", ()=>{
      exportYearImpl(
        flattenDataFullYear(),
        settings
      );
    });

    // sök
    get("openSearchBtn").addEventListener("click", ()=>{
      window.open("search.html","_blank","noopener");
    });

    // rensa allt
    get("clearAllBtn").addEventListener("click", clearAllDataConfirm);

    // inställningar
    get("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);

    // periodval
    get("yearSelect").addEventListener("change", ()=>{
      renderMonth();
      renderYearOverview();
    });
    get("monthSelect").addEventListener("change", renderMonth);

    // meny toggle
    initMenuToggle();

    // klick på datumfältet -> visa picker om stöds
    const di = get("dateInput");
    if (di && di.showPicker){
      di.addEventListener("click", e => { e.target.showPicker(); });
    }
  }

  // -----------------------------
  // Meny toggle
  // -----------------------------
  function initMenuToggle(){
    const panel = get("sidePanel");
    const btn   = get("menuToggleBtn");

    btn.addEventListener("click", ()=>{
      const willOpen = !panel.classList.contains("open");
      panel.classList.toggle("open", willOpen);
      panel.setAttribute("aria-hidden", willOpen ? "false" : "true");
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    document.addEventListener("click", e=>{
      if (!panel.contains(e.target) && !btn.contains(e.target)){
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden","true");
        btn.setAttribute("aria-expanded","false");
      }
    });
  }

  // -----------------------------
  // Kategorival
  // -----------------------------
  function populateCategorySelects(){
    const CATS = [
      "Ordinarie tid",
      "Flextid",
      "ATF-tim",
      "Övertid <2",
      "Övertid >2",
      "Övertid-Helg",
      "Semester",
      "Sjuk",
      "VAB",
      "Föräldraledig",
      "Traktamente"
    ];

    const mainSel = get("catMainSelect");
    mainSel.innerHTML = CATS.map(c=>`<option value="${c}">${c}</option>`).join("");

    document.querySelectorAll(".catExtraSelect").forEach(sel=>{
      sel.innerHTML = `<option value="">(ingen)</option>` +
        CATS.map(c=>`<option value="${c}">${c}</option>`).join("");
    });
  }

  // -----------------------------
  // År / Månad dropdowns
  // -----------------------------
  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");

    // samla år
    const yearsSeen = new Set();
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth()+1;
    yearsSeen.add(curY);

    Object.keys(allData).forEach(mKey=>{
      (allData[mKey]||[]).forEach(r=>{
        if (!r.datum) return;
        const y = (new Date(r.datum)).getFullYear();
        if (!isNaN(y)) yearsSeen.add(y);
      });
    });

    const yearsSorted = [...yearsSeen].sort((a,b)=>a-b);
    ySel.innerHTML = yearsSorted.map(y=>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");

    // Månadsnamn
    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];

    mSel.innerHTML = monthNames.map((name,i)=>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  // -----------------------------
  // Lägg till / Spara rad
  // -----------------------------
  function onSaveEntry(){
    const datum = get("dateInput").value;
    if (!datum){
      alert("Datum saknas.");
      return;
    }

    // räkna ut riktig månad utifrån datumet (för att undvika felmånad-buggen)
    const dObj = new Date(datum);
    const realMonth = dObj.getMonth()+1; // 1-12
    if (!allData[realMonth]) allData[realMonth]=[];

    // Huvudkategori
    const catMain = get("catMainSelect").value || "";
    const catMainHours = parseFloat(get("catMainHours").value||"0")||0;

    // Extra kategori 1
    const ex1Sel = document.querySelector('.catExtraSelect[data-extra-index="1"]');
    const ex1Hrs = document.querySelector('.catExtraHours[data-extra-index="1"]');
    const cat1   = ex1Sel ? (ex1Sel.value||"") : "";
    const hrs1   = ex1Hrs ? (parseFloat(ex1Hrs.value||"0")||0) : 0;

    // Extra kategori 2
    const ex2Sel = document.querySelector('.catExtraSelect[data-extra-index="2"]');
    const ex2Hrs = document.querySelector('.catExtraHours[data-extra-index="2"]');
    const cat2   = ex2Sel ? (ex2Sel.value||"") : "";
    const hrs2   = ex2Hrs ? (parseFloat(ex2Hrs.value||"0")||0) : 0;

    // Traktamente
    const trakt = get("traktChk").checked;

    // Projekt, körtid, anteckning
    const projektVal  = get("projektInput").value.trim();
    const driveHrsVal = parseFloat(get("driveHoursInput").value||"0")||0;
    const noteVal     = get("noteInput").value.trim();

    // id
    const rowId = editId || genRowId();

    // om vi redigerar -> ta bort ALLA gamla rader med samma _id i den "rätta" månaden (realMonth)
    if (editId){
      allData[realMonth] = (allData[realMonth]||[]).filter(r => r._id !== editId);
    }

    // huvudkategori
    if (catMain){
      allData[realMonth].push({
        _id: rowId,
        datum,
        kategori: catMain,
        tid: catMainHours,
        projekt: projektVal,
        kortid: driveHrsVal,
        beskrivning: noteVal
      });
    }

    // extra1
    if (cat1){
      allData[realMonth].push({
        _id: rowId,
        datum,
        kategori: cat1,
        tid: hrs1,
        projekt: projektVal,
        kortid: driveHrsVal,
        beskrivning: noteVal
      });
    }

    // extra2
    if (cat2){
      allData[realMonth].push({
        _id: rowId,
        datum,
        kategori: cat2,
        tid: hrs2,
        projekt: projektVal,
        kortid: driveHrsVal,
        beskrivning: noteVal
      });
    }

    // traktamente (0h)
    if (trakt){
      allData[realMonth].push({
        _id: rowId,
        datum,
        kategori: "Traktamente",
        tid: 0,
        projekt: projektVal,
        kortid: driveHrsVal,
        beskrivning: noteVal
      });
    }

    saveData(editId ? "edit-entry" : "add-entry");
    clearForm();
    renderMonth();
    renderYearOverview();
  }

  function cancelEdit(){
    clearForm();
  }

  function clearForm(){
    editId = null;
    get("dateInput").value = "";
    get("catMainSelect").value = "";
    get("catMainHours").value = "";
    document.querySelectorAll(".catExtraSelect").forEach(sel=>sel.value="");
    document.querySelectorAll(".catExtraHours").forEach(inp=>inp.value="");
    get("traktChk").checked=false;
    get("projektInput").value="";
    get("driveHoursInput").value="";
    get("noteInput").value="";
    get("saveEntryLabel").textContent="Lägg till";
    get("cancelEditBtn").style.display="none";
  }

  // -----------------------------
  // Redigera / Radera
  // -----------------------------
  function startEdit(rowId){
    // vi måste hitta bunten i ALLA månader, för säkerhets skull
    let bundle = [];
    let foundMonth = null;

    Object.keys(allData).forEach(mKey=>{
      const arr = allData[mKey]||[];
      const parts = arr.filter(r=>r._id===rowId);
      if (parts.length){
        bundle = parts;
        foundMonth = mKey;
      }
    });
    if (!bundle.length) return;

    editId = rowId;

    // Alla har samma datum/projekt/kortid/beskrivning
    const base = bundle[0];
    get("dateInput").value        = base.datum || "";
    get("projektInput").value     = base.projekt || "";
    get("driveHoursInput").value  = base.kortid || "";
    get("noteInput").value        = base.beskrivning || "";

    // Första tre kategorier in i formuläret
    const cats = bundle.filter(b=>b.kategori && !b.kategori.toLowerCase().includes("trakt")).slice(0,3);

    if (cats[0]){
      get("catMainSelect").value = cats[0].kategori || "";
      get("catMainHours").value  = cats[0].tid || "";
    } else {
      get("catMainSelect").value = "";
      get("catMainHours").value = "";
    }

    if (cats[1]){
      const ex1Sel = document.querySelector('.catExtraSelect[data-extra-index="1"]');
      const ex1Hrs = document.querySelector('.catExtraHours[data-extra-index="1"]');
      if (ex1Sel) ex1Sel.value = cats[1].kategori || "";
      if (ex1Hrs) ex1Hrs.value = cats[1].tid || "";
    } else {
      const ex1Sel = document.querySelector('.catExtraSelect[data-extra-index="1"]');
      const ex1Hrs = document.querySelector('.catExtraHours[data-extra-index="1"]');
      if (ex1Sel) ex1Sel.value = "";
      if (ex1Hrs) ex1Hrs.value = "";
    }

    if (cats[2]){
      const ex2Sel = document.querySelector('.catExtraSelect[data-extra-index="2"]');
      const ex2Hrs = document.querySelector('.catExtraHours[data-extra-index="2"]');
      if (ex2Sel) ex2Sel.value = cats[2].kategori || "";
      if (ex2Hrs) ex2Hrs.value = cats[2].tid || "";
    } else {
      const ex2Sel = document.querySelector('.catExtraSelect[data-extra-index="2"]');
      const ex2Hrs = document.querySelector('.catExtraHours[data-extra-index="2"]');
      if (ex2Sel) ex2Sel.value = "";
      if (ex2Hrs) ex2Hrs.value = "";
    }

    // traktamente?
    const hasTrakt = bundle.some(r=>(r.kategori||"").toLowerCase().includes("trakt"));
    get("traktChk").checked = hasTrakt;

    get("saveEntryLabel").textContent="Spara";
    get("cancelEditBtn").style.display="inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    if(!confirm("Ta bort raden?")) return;

    Object.keys(allData).forEach(mKey=>{
      allData[mKey] = (allData[mKey]||[]).filter(r=>r._id!==rowId);
    });

    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
  }

  // -----------------------------
  // Månadsrendering (grupperad per post-id/datum)
  // -----------------------------
  function renderMonth(){
    const [year, month] = currentYearMonth();
    const tbody = get("monthTableBody");
    tbody.innerHTML="";

    const rowsRaw = allData[month]||[];

    // bygg statusMap för hela månaden (per datum)
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rowsRaw, settings, year, month)
      : {};

    // gruppera per _id (en arbetsdag = bunt med samma _id)
    const bundlesById = {};
    rowsRaw.forEach(r=>{
      if(!bundlesById[r._id]) bundlesById[r._id]=[];
      bundlesById[r._id].push(r);
    });

    // sortera bunterna efter datum
    const bundleList = Object.values(bundlesById).sort((a,b)=>{
      const da = a[0]?.datum||"";
      const db = b[0]?.datum||"";
      return da.localeCompare(db);
    });

    bundleList.forEach(bundle=>{
      // bundle = alla rader med samma _id
      // vi ska visa EN rad
      const first = bundle[0] || {};
      const day   = first.datum || "";
      const proj  = first.projekt || "";
      const note  = (first.beskrivning||"").replace(/\r?\n/g," ");
      // körtid: vi tar max eller första, men normalt är samma på alla
      const drive = bundle[0]?.kortid || 0;

      // bygg "Kategori(er)" + räkna totalTid
      let totalTid = 0;
      const catsOut = [];
      bundle.forEach(item=>{
        const nm  = item.kategori || "";
        const tid = parseFloat(item.tid)||0;
        totalTid += tid;
        // skriv t.ex. "Ordinarie tid 6h"
        // traktamente ska ändå synas
        catsOut.push(tid ? `${nm} ${tid}h` : nm);
      });

      // statusklass (balansfärg)
      const st = statusMap[day]?.status || "";
      const tr=document.createElement("tr");
      if (st) tr.classList.add("dagstatus--"+st);

      tr.innerHTML = `
        <td>${day}</td>
        <td>${proj}</td>
        <td>${catsOut.join(", ")}</td>
        <td>${totalTid}</td>
        <td>${drive || 0}</td>
        <td>${note}</td>
        <td style="white-space:nowrap;">
          <button class="icon-table-btn" data-act="edit" data-id="${first._id}" title="Ändra">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="icon-table-btn" data-act="del" data-id="${first._id}" title="Ta bort">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // bind knappar i tabellen
    tbody.querySelectorAll("button[data-act='edit']").forEach(btn=>{
      btn.addEventListener("click",()=>startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn=>{
      btn.addEventListener("click",()=>deleteRow(btn.dataset.id));
    });

    if (window.lucide) lucide.createIcons();

    renderMonthSummary(rowsRaw, statusMap);
  }

  function renderMonthSummary(rowsRaw, statusMap){
    const cell=get("monthSummaryCell");
    if(!cell) return;

    const sum={
      ordinarie:0,
      flextid:0,
      ot_lt2:0,
      ot_gt2:0,
      semester:0,
      atf:0,
      vab:0,
      sjuk:0,
      trakt:0,
      kortid:0
    };

    rowsRaw.forEach(r=>{
      const name=(r.kategori||"").toLowerCase();
      const h=parseFloat(r.tid)||0;

      if(name.includes("ordinarie")) sum.ordinarie+=h;
      if(name.includes("flex"))      sum.flextid+=h;
      if(name.includes("övertid") && name.includes("<2")) sum.ot_lt2+=h;
      if(name.includes("övertid") && (name.includes(">2")||name.includes("helg"))) sum.ot_gt2+=h;
      if(name.includes("semest"))    sum.semester+=h;
      if(name.includes("atf"))       sum.atf+=h;
      if(name.includes("vab"))       sum.vab+=h;
      if(name.includes("sjuk"))      sum.sjuk+=h;
      if(name.includes("trakt"))     sum.trakt+=1;

      sum.kortid += parseFloat(r.kortid)||0;
    });

    cell.textContent =
      `Ordinarie: ${sum.ordinarie.toFixed(2)}h | `+
      `Flex: ${sum.flextid.toFixed(2)}h | `+
      `ÖT<2: ${sum.ot_lt2.toFixed(2)}h | `+
      `ÖT>2/Helg: ${sum.ot_gt2.toFixed(2)}h | `+
      `Semester: ${sum.semester.toFixed(2)}h | `+
      `ATF: ${sum.atf.toFixed(2)}h | `+
      `VAB: ${sum.vab.toFixed(2)}h | `+
      `Sjuk: ${sum.sjuk.toFixed(2)}h | `+
      `Trakt: ${sum.trakt} st | `+
      `Körtid: ${sum.kortid.toFixed(2)}h`;
  }

  // -----------------------------
  // Årsöversikt
  // -----------------------------
  function renderYearOverview(){
    const tbody=get("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const monthNames={
      1:"Januari",
      2:"Februari",
      3:"Mars",
      4:"April",
      5:"Maj",
      6:"Juni",
      7:"Juli",
      8:"Augusti",
      9:"September",
      10:"Oktober",
      11:"November",
      12:"December"
    };

    for(let m=1;m<=12;m++){
      const arr = allData[m]||[];
      const sum={
        ordinarie:0,
        flextid:0,
        ot_lt2:0,
        ot_gt2:0,
        semester:0,
        atf:0,
        vab:0,
        sjuk:0,
        trakt:0,
        kortid:0
      };

      arr.forEach(r=>{
        const n=(r.kategori||"").toLowerCase();
        const h=parseFloat(r.tid)||0;

        if(n.includes("ordinarie")) sum.ordinarie+=h;
        if(n.includes("flex"))      sum.flextid+=h;
        if(n.includes("övertid") && n.includes("<2")) sum.ot_lt2+=h;
        if(n.includes("övertid") && (n.includes(">2")||n.includes("helg"))) sum.ot_gt2+=h;
        if(n.includes("semest"))    sum.semester+=h;
        if(n.includes("atf"))       sum.atf+=h;
        if(n.includes("vab"))       sum.vab+=h;
        if(n.includes("sjuk"))      sum.sjuk+=h;
        if(n.includes("trakt"))     sum.trakt+=1;

        sum.kortid += parseFloat(r.kortid)||0;
      });

      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${monthNames[m]}</td>
        <td>${sum.ordinarie.toFixed(2)}</td>
        <td>${sum.flextid.toFixed(2)}</td>
        <td>${sum.ot_lt2.toFixed(2)}</td>
        <td>${sum.ot_gt2.toFixed(2)}</td>
        <td>${sum.semester.toFixed(2)}</td>
        <td>${sum.atf.toFixed(2)}</td>
        <td>${sum.vab.toFixed(2)}</td>
        <td>${sum.sjuk.toFixed(2)}</td>
        <td>${sum.trakt}</td>
        <td>${sum.kortid.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // -----------------------------
  // Backup / Import
  // -----------------------------
  function manualBackupNow(){
    manualBackup(); // från backup.js
  }

  function onImportFileInputChange(ev){
    const f=ev.target.files[0];
    if(!f)return;
    importBackupFile(f,(payload)=>{
      if(payload.data && typeof payload.data==="object"){
        allData = payload.data;
      }
      if(payload.settings && typeof payload.settings==="object"){
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
    if(!confirm("Är du säker? Detta raderar ALL din data i appen.")) return;
    allData={};
    localStorage.setItem(DATA_KEY,JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
  }

  // -----------------------------
  // Hjälp för export
  // -----------------------------
  function flattenDataForExportMonth(year, month){
    // gör en utsorterad lista av rader som matchar vald Y+M (för CSV/PDF)
    const rowsMonth = (allData[month]||[]).slice().filter(r=>{
      if(!r.datum) return false;
      const d=new Date(r.datum);
      return d.getFullYear()===Number(year) && (d.getMonth()+1)===Number(month);
    }).sort((a,b)=>a.datum.localeCompare(b.datum));
    return rowsMonth;
  }

  function flattenDataFullYear(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=>out.push(r));
    });
    return out;
  }

  // -----------------------------
  // Service Worker
  // -----------------------------
  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
      .then(()=>console.log("Service Worker registrerad (v"+APP_VERSION+")"))
      .catch(e=>console.warn("SW fel:",e));
    }
  }

})();