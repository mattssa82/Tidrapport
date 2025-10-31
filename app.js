// app.js
// Tidrapport v10.3
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION   = "10.3";
  const DATA_KEY      = "tidrapport_data_v10";         // { "9":[...], "10":[...], ... }
  const SETTINGS_KEY  = "tidrapport_settings_v10";     // { company,name,emp,redDays,showRedDays,autoBackup,redDayDefaultHours?... }

  // State
  let allData   = {};   // månadsindex -> array av rader [{ _id, datum, kategori, tid, projekt, kortid, beskrivning }]
  let settings  = {};
  let editId    = null; // aktiv rad som redigeras, annars null

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

  // -------------------------------------------------
  // Load / Save
  // -------------------------------------------------
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
    autoLocalBackup(reason || "data-change"); // backup.js
  }

  function loadSettings(){
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      settings = raw ? JSON.parse(raw) : {};
      if (typeof settings !== "object" || settings === null) settings = {};
    } catch {
      settings = {};
    }

    // defaults som vi behöver om de saknas
    if (settings.redDayDefaultHours === undefined) {
      settings.redDayDefaultHours = 8; // standard helgdag / röd dag som vi sa
    }

    // fyll UI
    get("companyInput").value        = settings.company          || "";
    get("nameInput").value           = settings.name             || "";
    get("anstnrInput").value         = settings.emp              || "";
    get("redDaysInput").value        = settings.redDays          || "";
    get("showRedDaysChk").checked    = !!settings.showRedDays;
    get("autoBackupChk").checked     = !!settings.autoBackup;
    get("redDayHoursInput").value    = settings.redDayDefaultHours || 8;
  }

  function saveSettingsFromUI(){
    settings.company             = get("companyInput").value.trim();
    settings.name                = get("nameInput").value.trim();
    settings.emp                 = get("anstnrInput").value.trim();
    settings.redDays             = get("redDaysInput").value.trim();
    settings.showRedDays         = get("showRedDaysChk").checked;
    settings.autoBackup          = get("autoBackupChk").checked;
    settings.redDayDefaultHours  = parseFloat(get("redDayHoursInput").value||"8")||8;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

    alert("Inställningar sparade.");
    renderMonth();
    renderYearOverview();
    autoLocalBackup("settings-change");
  }

  // -------------------------------------------------
  // Helpers
  // -------------------------------------------------
  function get(id){ return document.getElementById(id); }

  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10);
    const m = parseInt(get("monthSelect").value,10);
    return [y,m];
  }

  function genRowId(){
    return Date.now() + "_" + Math.floor(Math.random()*1e6);
  }

  function yyyymmddToDate(str){
    // "2025-10-03" -> Date
    const d = new Date(str);
    if (isNaN(d)) return null;
    return d;
  }

  function isPastDay(dateStr){
    // true om dagen är före idag (inte idag, inte framtid)
    const d = yyyymmddToDate(dateStr);
    if(!d) return false;
    const today = new Date();
    // nolla tid
    const td = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return dd.getTime() < td.getTime();
  }

  // -------------------------------------------------
  // UI bindings
  // -------------------------------------------------
  function bindUI(){
    // inmatningsknappar
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

    // backup / import / export
    get("manualBackupBtn").addEventListener("click", manualBackupNow);
    get("manualBackupBtn2").addEventListener("click", manualBackupNow);
    get("importFileInput").addEventListener("change", onImportFileInputChange);

    get("exportCsvBtn").addEventListener("click", ()=>{
      exportCSVImpl(
        flattenDataForExportMonth(),
        settings,
        get("yearSelect").value,
        get("monthSelect").value
      );
    });

    get("exportPdfBtn").addEventListener("click", ()=>{
      exportPDFImpl(
        flattenDataForExportMonth(),
        settings,
        get("yearSelect").value,
        get("monthSelect").value
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

    // datumfält -> klick var som helst öppnar pickern (mobiler som stödjer showPicker)
    const di = get("dateInput");
    if (di && di.showPicker){
      di.addEventListener("click", e => { e.target.showPicker(); });
    }
  }

  // -------------------------------------------------
  // Meny toggle (mobil/offcanvas)
  // -------------------------------------------------
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

  // -------------------------------------------------
  // Kategorival (inkl dynamiska extra-fält)
  // -------------------------------------------------
  function populateCategorySelects(){
    // OBS: listan är hårdkodad enligt ditt språk
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
    mainSel.innerHTML = `<option value=""></option>` +
      CATS.map(c=>`<option value="${c}">${c}</option>`).join("");

    document.querySelectorAll(".catExtraSelect").forEach(sel=>{
      sel.innerHTML =
        `<option value=""></option>` +
        CATS.map(c=>`<option value="${c}">${c}</option>`).join("");
    });
  }

  // -------------------------------------------------
  // År / Månad dropdowns
  // -------------------------------------------------
  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");

    // samla år: nuvarande år + alla år i datat
    const yearsSeen = new Set();
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth()+1;
    yearsSeen.add(curY);

    Object.keys(allData).forEach(mKey=>{
      const arr = allData[mKey]||[];
      arr.forEach(r=>{
        if (!r.datum) return;
        const y = (new Date(r.datum)).getFullYear();
        if (!isNaN(y)) yearsSeen.add(y);
      });
    });

    const yearsSorted = [...yearsSeen].sort((a,b)=>a-b);
    ySel.innerHTML = yearsSorted.map(y=>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");

    // månader som namn
    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];
    mSel.innerHTML = monthNames.map((name,i)=>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  // -------------------------------------------------
  // Lägg till / Spara rad
  // -------------------------------------------------
  function onSaveEntry(){
    const [year,month] = currentYearMonth();
    if (!allData[month]) allData[month]=[];

    const datum = get("dateInput").value;
    if (!datum){
      alert("Datum saknas.");
      return;
    }

    // plocka formulärvärden
    const catMain        = get("catMainSelect").value || "";
    const catMainHours   = parseFloat(get("catMainHours").value||"0")||0;

    const ex1Sel         = document.querySelector('.catExtraSelect[data-extra-index="1"]');
    const ex1Hrs         = document.querySelector('.catExtraHours[data-extra-index="1"]');
    const cat1           = ex1Sel ? (ex1Sel.value||"") : "";
    const hrs1           = ex1Hrs ? (parseFloat(ex1Hrs.value||"0")||0) : 0;

    const ex2Sel         = document.querySelector('.catExtraSelect[data-extra-index="2"]');
    const ex2Hrs         = document.querySelector('.catExtraHours[data-extra-index="2"]');
    const cat2           = ex2Sel ? (ex2Sel.value||"") : "";
    const hrs2           = ex2Hrs ? (parseFloat(ex2Hrs.value||"0")||0) : 0;

    const trakt          = get("traktChk").checked;

    const projektVal     = get("projektInput").value.trim();
    const driveHrsVal    = parseFloat(get("driveHoursInput").value||"0")||0;
    const noteVal        = get("noteInput").value.trim();

    // bygg bundle (max 3 kategorier + ev trakt)
    // ignorera tomma kategorier (så vi inte gör spök-rader)
    const bundleRows = [];

    if (catMain){
      bundleRows.push({
        kategori: catMain,
        tid: catMainHours
      });
    }
    if (cat1){
      bundleRows.push({
        kategori: cat1,
        tid: hrs1
      });
    }
    if (cat2){
      bundleRows.push({
        kategori: cat2,
        tid: hrs2
      });
    }
    if (trakt){
      // traktamente-rad, 0h
      bundleRows.push({
        kategori: "Traktamente",
        tid: 0
      });
    }

    // om inga kategorier valts → inget att spara
    if (!bundleRows.length){
      alert("Ingen kategori vald.");
      return;
    }

    const rowId = editId || genRowId();

    // om vi redigerar: ta bort gamla poster för rowId först
    if (editId){
      allData[month] = allData[month].filter(r => r._id !== editId);
    }

    // tryck in alla kategorivalsrader (en rad per kategori)
    bundleRows.forEach(br => {
      allData[month].push({
        _id: rowId,
        datum,
        kategori: br.kategori,
        tid: br.tid,
        projekt: projektVal,
        kortid: driveHrsVal,
        beskrivning: noteVal
      });
    });

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

  // -------------------------------------------------
  // Redigera / Radera
  // -------------------------------------------------
  function startEdit(rowId){
    const [y,m]=currentYearMonth();
    const arr = allData[m]||[];
    const bundle = arr.filter(r=>r._id===rowId);
    if (!bundle.length) return;

    editId = rowId;

    // alla har samma metadata
    const base = bundle[0];
    get("dateInput").value      = base.datum || "";
    get("projektInput").value   = base.projekt || "";
    get("driveHoursInput").value= base.kortid || "";
    get("noteInput").value      = base.beskrivning || "";

    // Ta de tre första kategoriraderna tillbaka till huvud/extra1/extra2
    const cats = bundle.filter(r=>
      (r.kategori||"").toLowerCase() !== "traktamente"
    ).slice(0,3);

    if (cats[0]){
      get("catMainSelect").value  = cats[0].kategori || "";
      get("catMainHours").value   = cats[0].tid || "";
    } else {
      get("catMainSelect").value  = "";
      get("catMainHours").value   = "";
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
    const hasTrakt = bundle.some(r=>(r.kategori||"").toLowerCase()==="traktamente");
    get("traktChk").checked = hasTrakt;

    get("saveEntryLabel").textContent="Spara";
    get("cancelEditBtn").style.display="inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    const [y,m]=currentYearMonth();
    if(!confirm("Ta bort raden (alla kategorier för det datumet)?")) return;
    allData[m] = (allData[m]||[]).filter(r=>r._id!==rowId);
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
  }

  // -------------------------------------------------
  // Månadsrendering + larm / status
  // -------------------------------------------------
  function renderMonth(){
    const [year, month] = currentYearMonth();
    const tbody = get("monthTableBody");
    const alarmBody = get("alarmTableBody");

    if (tbody) tbody.innerHTML="";
    if (alarmBody) alarmBody.innerHTML="";

    const rows = allData[month]||[];

    // sortera på datum
    const sorted = rows.slice().sort((a,b)=>a.datum.localeCompare(b.datum));

    // statusMap från balansregler
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    // rendera själva månadslistan
    sorted.forEach(r=>{
      const tr=document.createElement("tr");

      const st = statusMap[r.datum]?.status || "";
      if (st){
        tr.classList.add("dagstatus--"+st);
      }

      tr.innerHTML=`
        <td>${r.datum||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${r.tid||0}</td>
        <td>${r.kortid||0}</td>
        <td>${(r.beskrivning||"").replace(/\r?\n/g," ")}</td>
        <td style="white-space:nowrap;">
          <button class="icon-table-btn" data-act="edit" data-id="${r._id}" title="Ändra">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="icon-table-btn" data-act="del" data-id="${r._id}" title="Ta bort">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // binda knappar
    tbody.querySelectorAll("button[data-act='edit']").forEach(btn=>{
      btn.addEventListener("click",()=>startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn=>{
      btn.addEventListener("click",()=>deleteRow(btn.dataset.id));
    });

    // larm-listan
    // vi vill flagga EN gång per dag (inte per rad)
    // logik:
    //  - om status == saknas och dagen är förbi -> 🔴 Ingen registrering
    //  - om status == orange_under och dagen är förbi -> ⚠️ Under 8h
    //  - om status == orange_absence och dagen är förbi -> 🟡 Frånvaro
    // helg / röddag / grön -> inget larm
    const alarmPerDay = [];
    Object.keys(statusMap).sort().forEach(dStr=>{
      const stObj = statusMap[dStr];
      if (!stObj) return;
      if (!isPastDay(dStr)) return; // bara gamla dagar

      if (stObj.status === "saknas"){
        alarmPerDay.push({
          datum: dStr,
          projekt: "",
          tid: "",
          kategori: "",
          statusText: "🔴 Ingen registrering"
        });
      } else if (stObj.status === "orange_under"){
        alarmPerDay.push({
          datum: dStr,
          projekt: "",
          tid: stObj.totalHours || "",
          kategori: "",
          statusText: "⚠️ Under 8h"
        });
      } else if (stObj.status === "orange_absence"){
        alarmPerDay.push({
          datum: dStr,
          projekt: "",
          tid: stObj.totalHours || "",
          kategori: "",
          statusText: "🟡 Frånvaro"
        });
      }
      // helg, röddag, grön => inget larm
    });

    if (alarmBody){
      if (!alarmPerDay.length){
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="4"><i>Inga larm för passerade dagar.</i></td>`;
        alarmBody.appendChild(tr);
      } else {
        alarmPerDay.forEach(a=>{
          const tr=document.createElement("tr");
          tr.innerHTML = `
            <td>${a.datum}</td>
            <td>${a.tid !== "" ? a.tid : "-"}</td>
            <td>${a.statusText}</td>
            <td>${a.projekt||"-"}</td>
          `;
          alarmBody.appendChild(tr);
        });
      }
    }

    if (window.lucide) lucide.createIcons();
    renderMonthSummary(rows, statusMap);
  }

  // -------------------------------------------------
  // Månads-summering (inkl projekt-summering)
  // -------------------------------------------------
  function renderMonthSummary(rows, statusMap){
    const cell = get("monthSummaryCell");
    if(!cell) return;

    // summera kategorityper för månaden
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

    rows.forEach(r=>{
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

    // projekt-summering (timmar per projekt denna månad)
    const perProjekt = {};
    rows.forEach(r=>{
      const p = r.projekt || "(okänt projekt)";
      const t = parseFloat(r.tid)||0;
      if(!perProjekt[p]) perProjekt[p]=0;
      perProjekt[p]+=t;
    });

    let projSummary = " | Projekt: ";
    Object.entries(perProjekt).forEach(([p,h])=>{
      projSummary += `${p}: ${h.toFixed(2)}h, `;
    });
    projSummary = projSummary.replace(/, $/,""); // ta bort sista kommat

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
      `Körtid: ${sum.kortid.toFixed(2)}h`+
      projSummary;
  }

  // -------------------------------------------------
  // Årsöversikt
  // -------------------------------------------------
  function renderYearOverview(){
    const tbody=get("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    // Månadsnamn
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

      // snygg utskrift utan massa "0.00", vi ersätter 0 med "–"
      function fmt(v){
        const num = (typeof v==="number") ? v : parseFloat(v)||0;
        if (Math.abs(num) < 0.001) return "–";
        return num.toFixed(2).replace(/\.00$/,"");
      }

      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${monthNames[m]}</td>
        <td>${fmt(sum.ordinarie)}</td>
        <td>${fmt(sum.flextid)}</td>
        <td>${fmt(sum.ot_lt2)}</td>
        <td>${fmt(sum.ot_gt2)}</td>
        <td>${fmt(sum.semester)}</td>
        <td>${fmt(sum.atf)}</td>
        <td>${fmt(sum.vab)}</td>
        <td>${fmt(sum.sjuk)}</td>
        <td>${sum.trakt === 0 ? "–" : sum.trakt}</td>
        <td>${fmt(sum.kortid)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // -------------------------------------------------
  // Backup / Import
  // -------------------------------------------------
  function manualBackupNow(){
    manualBackup(); // backup.js
  }

  function onImportFileInputChange(ev){
    const f=ev.target.files[0];
    if(!f)return;
    importBackupFile(f,(payload)=>{
      // merge
      if(payload.data && typeof payload.data==="object"){
        allData = payload.data;
      }
      if(payload.settings && typeof payload.settings==="object"){
        settings = Object.assign({}, settings, payload.settings);
        // om gamla backupen saknar redDayDefaultHours -> håll vår nuvarande
        if (payload.settings.redDayDefaultHours === undefined && settings.redDayDefaultHours === undefined){
          settings.redDayDefaultHours = 8;
        }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
      saveData("import");
      loadSettings(); // push till UI
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

  // -------------------------------------------------
  // Export-hjälpare
  // -------------------------------------------------
  function flattenDataForExportMonth(){
    const [year,month]=currentYearMonth();
    return (allData[month]||[])
      .slice()
      .sort((a,b)=>a.datum.localeCompare(b.datum));
  }

  function flattenDataFullYear(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=>{
        out.push(r);
      });
    });
    return out;
  }

  // -------------------------------------------------
  // Service Worker
  // -------------------------------------------------
  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
      .then(()=>console.log("Service Worker registrerad (v"+APP_VERSION+")"))
      .catch(e=>console.warn("SW fel:",e));
    }
  }

  // klart
})();