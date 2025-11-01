// app.js
// Tidrapport v10.9
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION = "10.9";

  // behåll samma keys så vi inte tappar befintlig data
  const DATA_KEY     = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  // STATE
  let allData = {};   // { "9":[{_id,datum,kategori,tid,projekt,kortid,beskrivning}, ...], "10":[...], ... }
  let settings = {};
  let editId = null;  // bundle-id vi redigerar, annars null

  // DOM refs helper
  function get(id){ return document.getElementById(id); }

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    initCatRows(); // startar med en tom kategori-rad
    renderMonth();
    renderYearOverview();
    renderAlarmList();

    registerServiceWorker();

    if (window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" klar ✅");
  });

  // -------------------------------------------------
  // LOAD / SAVE
  // -------------------------------------------------
  function loadData(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
      if (typeof allData !== "object" || allData===null) allData = {};
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
      if (typeof settings !== "object" || settings===null) settings = {};
    }catch{
      settings = {};
    }

    // defaultvärden om saknas
    if (settings.redDayHours == null) settings.redDayHours = 8;

    // skicka in i UI
    get("companyInput").value      = settings.company      || "";
    get("nameInput").value         = settings.name         || "";
    get("anstnrInput").value       = settings.emp          || "";
    get("autoBackupChk").checked   = !!settings.autoBackup;

    get("redDaysInput").value      = settings.redDays      || "";
    get("showRedDaysChk").checked  = !!settings.showRedDays;
    get("redDayHoursInput").value  = settings.redDayHours;
  }

  function saveSettingsFromUI(){
    settings.company      = get("companyInput").value.trim();
    settings.name         = get("nameInput").value.trim();
    settings.emp          = get("anstnrInput").value.trim();
    settings.autoBackup   = get("autoBackupChk").checked;

    settings.redDays      = get("redDaysInput").value.trim();
    settings.showRedDays  = get("showRedDaysChk").checked;
    settings.redDayHours  = parseFloat(get("redDayHoursInput").value||"0") || 0;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    alert("Inställningar sparade.");
    renderMonth();
    renderYearOverview();
    renderAlarmList();
    autoLocalBackup("settings-change");
  }

  // -------------------------------------------------
  // HELPERS
  // -------------------------------------------------
  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10);
    const m = parseInt(get("monthSelect").value,10);
    return [y,m];
  }

  function genRowId(){
    return Date.now() + "_" + Math.floor(Math.random()*1e6);
  }

  // bygg lista över tillgängliga kategorier
  // OBS: Traktamente är en egen kategori (tid = 0h men räknas som trakt 1 st)
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

  function makeCatSelectHTML(value){
    return `
      <label>
        Kategori
        <select class="catSelect">
          <option value=""></option>
          ${CATS.map(c=>`<option value="${c}" ${c===value?"selected":""}>${c}</option>`).join("")}
        </select>
      </label>
    `;
  }
  function makeCatHoursHTML(value){
    return `
      <label>
        Tid (h)
        <input class="catHoursInput" type="number" step="0.25" value="${value!=null?value:""}" />
      </label>
    `;
  }

  // -------------------------------------------------
  // KATEGORI-RADER (+/-) I FORMULÄRET
  // -------------------------------------------------
  function initCatRows(){
    const block = get("catBlock");
    block.innerHTML = "";
    addCatRow(); // minst en rad
  }

  function addCatRow(catVal="", hrsVal=""){
    const block = get("catBlock");

    const row = document.createElement("div");
    row.className = "cat-row";

    row.innerHTML = `
      ${makeCatSelectHTML(catVal)}
      ${makeCatHoursHTML(hrsVal)}
      <button class="remove-cat-btn" title="Ta bort rad">
        <i data-lucide="minus-circle"></i>
      </button>
    `;

    block.appendChild(row);

    // koppla minus-knappen
    row.querySelector(".remove-cat-btn").addEventListener("click", ()=>{
      removeCatRow(row);
    });

    if (window.lucide) lucide.createIcons();
  }

  function removeCatRow(rowEl){
    const block = get("catBlock");
    const rows = block.querySelectorAll(".cat-row");
    if (rows.length <= 1){
      // alltid minst en rad
      rowEl.querySelector(".catSelect").value = "";
      rowEl.querySelector(".catHoursInput").value = "";
      return;
    }
    block.removeChild(rowEl);
  }

  function readCatRows(){
    // returnerar [{kategori:"Ordinarie tid", tid:8}, ...]
    // Viktigt: inga dubbletter av kategori i samma inmatning
    const seen = new Set();
    const out = [];
    const rows = get("catBlock").querySelectorAll(".cat-row");
    rows.forEach(r=>{
      const catSel = r.querySelector(".catSelect");
      const hrsInp = r.querySelector(".catHoursInput");
      if(!catSel) return;
      const cat = (catSel.value||"").trim();
      if(!cat) return;
      if(seen.has(cat.toLowerCase())) return; // blockera dubblett
      seen.add(cat.toLowerCase());

      let h = parseFloat((hrsInp && hrsInp.value)||"0");
      if(Number.isNaN(h)) h = 0;

      out.push({kategori:cat, tid:h});
    });
    return out;
  }

  function fillCatRowsFromBundle(bundle){
    // bundle = alla rader med samma _id (från startEdit)
    const block = get("catBlock");
    block.innerHTML = "";
    // vi tar varje unik kategori/tid
    bundle.forEach(item=>{
      addCatRow(item.kategori||"", item.tid!=null?item.tid:"");
    });
    // om inga -> lägg en tom
    if (!bundle.length){
      addCatRow();
    }
  }

  // -------------------------------------------------
  // UI-BINDNINGAR
  // -------------------------------------------------
  function bindUI(){
    // formulär-knappar
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);
    get("addCatRowBtn").addEventListener("click", ()=>{
      addCatRow();
    });

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

    // rensa allt
    get("clearAllBtn").addEventListener("click", clearAllDataConfirm);

    // inställningar
    get("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);

    // period
    get("yearSelect").addEventListener("change", ()=>{
      renderMonth();
      renderMonthSummaryAndAlarm();
    });
    get("monthSelect").addEventListener("change", ()=>{
      renderMonth();
      renderMonthSummaryAndAlarm();
    });

    // meny toggle (mobil)
    initMenuToggle();

    // klicka på datumfältet ska öppna pickern om möjligt (mobil quality-of-life)
    const di = get("dateInput");
    if (di && di.showPicker){
      di.addEventListener("click", e => { e.target.showPicker(); });
    }
  }

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
      // stäng om man klickar utanför i mobil-läge
      if (!panel.contains(e.target) && !btn.contains(e.target)){
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden","true");
        btn.setAttribute("aria-expanded","false");
      }
    });
  }

  // -------------------------------------------------
  // ÅR / MÅNAD DROPDOWNS
  // -------------------------------------------------
  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");

    // samla alla år vi har data för + nuvarande år
    const yearsSeen = new Set();
    const curY = new Date().getFullYear();
    yearsSeen.add(curY);

    Object.keys(allData).forEach(mKey=>{
      (allData[mKey]||[]).forEach(r=>{
        if(!r.datum) return;
        const y = (new Date(r.datum)).getFullYear();
        if(!isNaN(y)) yearsSeen.add(y);
      });
    });

    const yearsSorted = [...yearsSeen].sort((a,b)=>a-b);
    ySel.innerHTML = yearsSorted.map(y=>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");

    // svenska månadsnamn
    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];
    const curM = new Date().getMonth()+1;
    mSel.innerHTML = monthNames.map((name,i)=>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  // -------------------------------------------------
  // SPARA / LÄGGA TILL RAD(ER)
  // -------------------------------------------------
  function onSaveEntry(){
    const [year,month] = currentYearMonth();
    if (!allData[month]) allData[month] = [];

    const datumVal   = get("dateInput").value;
    if(!datumVal){
      alert("Datum saknas.");
      return;
    }

    const projektVal = get("projektInput").value.trim();
    const driveHrs   = parseFloat(get("driveHoursInput").value||"0") || 0;
    const noteVal    = get("noteInput").value.trim();

    // alla kategori-rader
    const catRows = readCatRows();
    if (!catRows.length){
      alert("Minst en kategori behövs.");
      return;
    }

    const rowId = editId || genRowId();

    // om vi redigerar -> rensa bort gamla bundle först
    if (editId){
      allData[month] = allData[month].filter(r => r._id !== editId);
    }

    // pusha alla katRows som egna poster (bundle via samma _id)
    catRows.forEach(entry=>{
      allData[month].push({
        _id: rowId,
        datum: datumVal,
        kategori: entry.kategori,
        tid: entry.tid,
        projekt: projektVal,
        kortid: driveHrs,
        beskrivning: noteVal
      });
    });

    saveData(editId ? "edit-entry" : "add-entry");
    clearForm();
    renderMonth();
    renderYearOverview();
    renderAlarmList();
  }

  function cancelEdit(){
    clearForm();
  }

  function clearForm(){
    editId = null;

    get("dateInput").value = "";
    get("projektInput").value = "";
    get("driveHoursInput").value = "";
    get("noteInput").value = "";

    // nollställ kategori-blocket
    initCatRows();

    get("saveEntryLabel").textContent = "Lägg till";
    get("cancelEditBtn").style.display = "none";
  }

  // -------------------------------------------------
  // REDIGERA / RADERA RAD
  // -------------------------------------------------
  function startEdit(rowId){
    const [y,m] = currentYearMonth();
    const arr   = allData[m]||[];
    const bundle = arr.filter(r=>r._id===rowId);
    if(!bundle.length) return;

    editId = rowId;

    // gemensamma fält
    const base = bundle[0];
    get("dateInput").value        = base.datum || "";
    get("projektInput").value     = base.projekt || "";
    get("driveHoursInput").value  = base.kortid || "";
    get("noteInput").value        = base.beskrivning || "";

    // fyll kategori-raderna från bundle
    fillCatRowsFromBundle(bundle);

    get("saveEntryLabel").textContent = "Spara";
    get("cancelEditBtn").style.display = "inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    const [y,m] = currentYearMonth();
    if(!confirm("Ta bort raden?")) return;
    allData[m] = (allData[m]||[]).filter(r=>r._id!==rowId);
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
    renderAlarmList();
  }

  // -------------------------------------------------
  // MÅNADSVY
  // -------------------------------------------------
  function renderMonth(){
    const [year,month] = currentYearMonth();
    const tbody = get("monthTableBody");
    tbody.innerHTML = "";

    const rows = allData[month]||[];

    // Sortera på datum, sen projekt, sen kategori
    const sorted = rows.slice().sort((a,b)=>{
      if (a.datum !== b.datum) return a.datum.localeCompare(b.datum);
      if ((a.projekt||"") !== (b.projekt||"")) return (a.projekt||"").localeCompare(b.projekt||"");
      return (a.kategori||"").localeCompare(b.kategori||"");
    });

    // Statuskarta för färgläggning
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    sorted.forEach(r=>{
      const tr = document.createElement("tr");

      const st = statusMap[r.datum]?.status || "";
      if (st) tr.classList.add("dagstatus--"+st);

      tr.innerHTML = `
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
          <button class="icon-table-btn" data-act="del" data-id="${r._id}" title="Ta bort" style="color:#c0392b;">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("button[data-act='edit']").forEach(btn=>{
      btn.addEventListener("click",()=>startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn=>{
      btn.addEventListener("click",()=>deleteRow(btn.dataset.id));
    });

    if (window.lucide) lucide.createIcons();

    renderMonthSummaryAndAlarm();
  }

  function renderMonthSummaryAndAlarm(){
    renderMonthSummary();
    renderAlarmList();
  }

  // Summering längst ner i månadslistan
  // - totals per kategori-typ (Ordinarie, Flex, ÖT, etc)
  // - per projekt total tid
  function renderMonthSummary(){
    const [year,month] = currentYearMonth();
    const rows = allData[month]||[];
    const cell = get("monthSummaryCell");
    if(!cell) return;

    const sum = {
      ordinarie:0,
      flextid:0,
      ot_lt2:0,
      ot_gt2:0,
      ot_helg:0,
      semester:0,
      atf:0,
      vab:0,
      sjuk:0,
      trakt:0,
      kortid:0
    };

    // summering per projekt
    const projSum = {}; // { "Y2506": totalTid }

    rows.forEach(r=>{
      const name=(r.kategori||"").toLowerCase();
      const h=parseFloat(r.tid)||0;

      if(name.includes("ordinarie")) sum.ordinarie += h;
      if(name.includes("flex"))      sum.flextid += h;
      if(name.includes("övertid") && name.includes("<2")) sum.ot_lt2 += h;
      if(name.includes("övertid") && name.includes(">2") && !name.includes("helg")) sum.ot_gt2 += h;
      if(name.includes("övertid") && name.includes("helg")) sum.ot_helg += h;
      if(name.includes("semest"))    sum.semester += h;
      if(name.includes("atf"))       sum.atf += h;
      if(name.includes("vab"))       sum.vab += h;
      if(name.includes("sjuk"))      sum.sjuk += h;
      if(name.includes("trakt"))     sum.trakt += 1;

      sum.kortid += parseFloat(r.kortid)||0;

      // projekt-summering
      const p = r.projekt||"";
      if(p){
        if(!projSum[p]) projSum[p]=0;
        projSum[p]+=h;
      }
    });

    // bygg text
    let html = "";
    html += `Ordinarie: ${sum.ordinarie.toFixed(2)}h | `;
    html += `Flex: ${sum.flextid.toFixed(2)}h | `;
    html += `ÖT<2: ${sum.ot_lt2.toFixed(2)}h | `;
    html += `ÖT>2: ${sum.ot_gt2.toFixed(2)}h | `;
    html += `ÖT-Helg: ${sum.ot_helg.toFixed(2)}h | `;
    html += `Semester: ${sum.semester.toFixed(2)}h | `;
    html += `ATF: ${sum.atf.toFixed(2)}h | `;
    html += `VAB: ${sum.vab.toFixed(2)}h | `;
    html += `Sjuk: ${sum.sjuk.toFixed(2)}h | `;
    html += `Trakt: ${sum.trakt} st | `;
    html += `Körtid: ${sum.kortid.toFixed(2)}h`;

    // radbryt och lista projektsummor
    const projKeys = Object.keys(projSum).sort((a,b)=>a.localeCompare(b));
    if (projKeys.length){
      html += "<br/>Projekt:";
      projKeys.forEach(p=>{
        html += ` ${p} ${projSum[p].toFixed(2)}h;`;
      });
    }

    cell.innerHTML = html;
  }

  // -------------------------------------------------
  // LARM / OBALANS
  // -------------------------------------------------
  // Vi tar statusMap från BalansRegler.
  // Visa för dagar som redan passerat (datum < idag),
  // status inte "grön", inte "helg", inte "röddag".
  // Kolumner: Datum / Tid (h) / Status-text
  function renderAlarmList(){
    const [year,month] = currentYearMonth();
    const tbody = get("alarmTableBody");
    if(!tbody) return;
    tbody.innerHTML = "";

    const rows = allData[month]||[];
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    const todayStr = (new Date()).toISOString().slice(0,10);

    // bygg per datum
    Object.keys(statusMap).sort().forEach(dateStr=>{
      const stObj = statusMap[dateStr];
      if(!stObj) return;

      // bara om datumet är i det förflutna
      if(dateStr >= todayStr) return;

      const st = stObj.status;
      if(st==="grön") return;
      if(st==="helg") return;
      if(st==="röddag") return;

      // status-text
      let statusText = "";
      if(st==="saknas"){
        statusText = "Ingen registrering";
      }else if(st==="orange_under"){
        statusText = "Under 8h";
      }else if(st==="orange_absence"){
        statusText = "Frånvaro (VAB/Sjuk/Föräldraledig)";
      }else{
        statusText = st;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${dateStr}</td>
        <td>${(stObj.totalHours||0).toFixed(2)}</td>
        <td>${statusText}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // -------------------------------------------------
  // ÅRSÖVERSIKT
  // -------------------------------------------------
  function fmt(v, isInt){
    const num = parseFloat(v)||0;
    if(num===0) return "";
    if(isInt) return String(num);
    return num.toFixed(2);
  }

  function renderYearOverview(){
    const tbody = get("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML = "";

    // svensk månad
    const monthNames = {
      1:"Januari",2:"Februari",3:"Mars",4:"April",5:"Maj",6:"Juni",
      7:"Juli",8:"Augusti",9:"September",10:"Oktober",11:"November",12:"December"
    };

    for(let m=1;m<=12;m++){
      const arr = allData[m]||[];
      const sum={
        ordinarie:0,
        flextid:0,
        ot_lt2:0,
        ot_gt2:0,
        ot_helg:0,
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
        if(n.includes("övertid") && n.includes(">2") && !n.includes("helg")) sum.ot_gt2+=h;
        if(n.includes("övertid") && n.includes("helg")) sum.ot_helg+=h;
        if(n.includes("semest"))    sum.semester+=h;
        if(n.includes("atf"))       sum.atf+=h;
        if(n.includes("vab"))       sum.vab+=h;
        if(n.includes("sjuk"))      sum.sjuk+=h;
        if(n.includes("trakt"))     sum.trakt+=1;

        sum.kortid += parseFloat(r.kortid)||0;
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m]}</td>
        <td>${fmt(sum.ordinarie)}</td>
        <td>${fmt(sum.flextid)}</td>
        <td>${fmt(sum.ot_lt2)}</td>
        <td>${fmt(sum.ot_gt2)}</td>
        <td>${fmt(sum.ot_helg)}</td>
        <td>${fmt(sum.semester)}</td>
        <td>${fmt(sum.atf)}</td>
        <td>${fmt(sum.vab)}</td>
        <td>${fmt(sum.sjuk)}</td>
        <td>${fmt(sum.trakt,true)}</td>
        <td>${fmt(sum.kortid)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // -------------------------------------------------
  // BACKUP / IMPORT
  // -------------------------------------------------
  function manualBackupNow(){
    manualBackup(); // från backup.js
  }

  function onImportFileInputChange(ev){
    const f = ev.target.files[0];
    if(!f) return;
    importBackupFile(f,(payload)=>{
      // merge data
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
      renderAlarmList();
      alert("Import klar.");
    });
  }

  function clearAllDataConfirm(){
    if(!confirm("Är du säker? Detta raderar ALL din data i appen.")) return;
    allData = {};
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
    renderAlarmList();
  }

  // -------------------------------------------------
  // EXPORT HJÄLP
  // -------------------------------------------------
  function flattenDataForExportMonth(){
    const [year,month] = currentYearMonth();
    return (allData[month]||[])
      .slice()
      .sort((a,b)=>a.datum.localeCompare(b.datum));
  }

  function flattenDataFullYear(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=> out.push(r));
    });
    return out;
  }

  // -------------------------------------------------
  // SERVICE WORKER
  // -------------------------------------------------
  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
      .then(()=>console.log("Service Worker registrerad (v"+APP_VERSION+")"))
      .catch(e=>console.warn("SW fel:",e));
    }
  }

})();