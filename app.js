// app.js
// Tidrapport v10.11
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION   = "10.11";
  const DATA_KEY      = "tidrapport_data_v10";        // { "1":[...], "2":[...], ... } (månadsnummer -> rader)
  const SETTINGS_KEY  = "tidrapport_settings_v10";    // { company,name,emp,redDays,showRedDays,autoBackup,... }

  // State i RAM
  let allData   = {};   // { "1":[ { _id, datum, kategori, tid, projekt, kortid, beskrivning }, ... ], "2":[...] }
  let settings  = {};
  let editId    = null; // om vi redigerar ett bundle (_id), annars null

  // ===== DOM READY =====
  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    populateCategoryTemplate();
    renderAll();
    registerServiceWorker();
    if (window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" laddad ✅");
  });

  // ===== HELPERS =====
  function $(id){ return document.getElementById(id); }

  function currentYearMonth(){
    const y = parseInt($("yearSelect").value,10);
    const m = parseInt($("monthSelect").value,10);
    return [y,m];
  }

  function genRowId(){
    return Date.now()+"_"+Math.floor(Math.random()*1e6);
  }

  // ===== LOAD/SAVE DATA =====
  function loadData(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
      if (typeof allData !== "object" || !allData) allData = {};
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
      if (typeof settings !== "object" || !settings) settings = {};
    }catch{
      settings = {};
    }

    // tryck in i UI
    $("companyInput").value      = settings.company       || "";
    $("nameInput").value         = settings.name          || "";
    $("anstnrInput").value       = settings.emp           || "";
    $("redDaysInput").value      = settings.redDays       || "";
    $("showRedDaysChk").checked  = !!settings.showRedDays;
    $("autoBackupChk").checked   = !!settings.autoBackup;
  }

  function saveSettingsFromUI(){
    settings.company      = $("companyInput").value.trim();
    settings.name         = $("nameInput").value.trim();
    settings.emp          = $("anstnrInput").value.trim();
    settings.redDays      = $("redDaysInput").value.trim();
    settings.showRedDays  = $("showRedDaysChk").checked;
    settings.autoBackup   = $("autoBackupChk").checked;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    alert("Inställningar sparade.");
    renderAll();
    autoLocalBackup("settings-change");
  }

  // ===== YEAR/MONTH SELECTORS =====
  function populateYearMonthSelectors(){
    const ySel = $("yearSelect");
    const mSel = $("monthSelect");

    // Bygg upp lista med år: nuvarande år + alla år som finns i datat
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

  // ===== UI BINDINGS =====
  function bindUI(){
    // formulär-knappar
    $("addCategoryRowBtn").addEventListener("click", addCategoryRow);
    $("saveEntryBtn").addEventListener("click", onSaveEntry);
    $("cancelEditBtn").addEventListener("click", cancelEdit);

    // backup / import / export
    $("manualBackupBtn").addEventListener("click", manualBackupNow);
    $("importFileInput").addEventListener("change", onImportFileInputChange);

    $("exportCsvBtn").addEventListener("click", ()=>{
      exportCSVImpl(
        flattenDataForExportMonth(),
        settings,
        $("yearSelect").value,
        $("monthSelect").value
      );
    });

    $("exportPdfBtn").addEventListener("click", ()=>{
      exportPDFImpl(
        flattenDataForExportMonth(),
        settings,
        $("yearSelect").value,
        $("monthSelect").value
      );
    });

    $("exportYearBtn").addEventListener("click", ()=>{
      exportYearImpl(
        flattenDataFullYear(),
        settings
      );
    });

    $("clearAllBtn").addEventListener("click", clearAllDataConfirm);

    // inställningar
    $("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);

    // periodval
    $("yearSelect").addEventListener("change", renderAll);
    $("monthSelect").addEventListener("change", renderAll);

    // meny toggle/offcanvas
    initMenuToggle();

    // dateInput -> klick överallt öppnar picker om browser stödjer showPicker
    const di = $("dateInput");
    if (di && di.showPicker){
      di.addEventListener("click", e => { e.target.showPicker(); });
    }
  }

  function initMenuToggle(){
    const panel = $("sidePanel");
    const btn   = $("menuToggleBtn");

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

  // ===== KATEGORI-INMATNING (dynamiska rader) =====

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

  function populateCategoryTemplate(){
    // vi skapar första raden
    const block = $("catBlock");
    block.innerHTML = "";
    addCategoryRow(); // lägger första
    updateCategoryRowUI();
  }

  function addCategoryRow(){
    const block = $("catBlock");

    const lineId = "catLine_"+Date.now()+"_"+Math.floor(Math.random()*1e6);

    const line = document.createElement("div");
    line.className = "cat-line";
    line.dataset.lineId = lineId;

    line.innerHTML = `
      <div class="cat-field-select">
        <label>Kategori</label>
        <select class="catSelect"></select>
      </div>
      <div class="cat-field-hours">
        <label>Tid (h)</label>
        <input class="catHours" type="number" step="0.25" />
      </div>
      <div class="cat-remove-wrap">
        <button class="cat-remove-btn" data-act="remove">
          <i data-lucide="minus-circle"></i>
          <span>Ta bort</span>
        </button>
      </div>
    `;

    block.appendChild(line);

    // fyll select med CATS
    refreshCatOptions();

    // disable (-) på första raden
    updateCategoryRowUI();

    // events
    const removeBtn = line.querySelector(".cat-remove-btn");
    removeBtn.addEventListener("click", ()=>{
      removeCategoryRow(lineId);
    });

    // om man byter kategori -> uppdatera disable-list
    line.querySelector(".catSelect").addEventListener("change", refreshCatOptions);

    if (window.lucide) lucide.createIcons();
  }

  function removeCategoryRow(lineId){
    const block = $("catBlock");
    const lines = [...block.querySelectorAll(".cat-line")];
    if (lines.length<=1){
      // första raden får inte tas bort
      return;
    }
    const target = block.querySelector(`.cat-line[data-line-id="${lineId}"]`);
    if (target) target.remove();
    refreshCatOptions();
    updateCategoryRowUI();
  }

  function getCategoryLines(){
    const block = $("catBlock");
    return [...block.querySelectorAll(".cat-line")].map(line=>{
      return {
        node: line,
        select: line.querySelector(".catSelect"),
        hours:  line.querySelector(".catHours"),
        removeBtn: line.querySelector(".cat-remove-btn")
      };
    });
  }

  function refreshCatOptions(){
    // spärr dubbletter: om "Ordinarie tid" redan vald i en rad, disable den i andra selects
    const lines = getCategoryLines();
    const chosen = new Set();
    lines.forEach(l=>{
      const val = l.select.value;
      if (val) chosen.add(val);
    });

    lines.forEach(l=>{
      const cur = l.select.value;
      l.select.innerHTML =
        `<option value="">(välj)</option>`+
        CATS.map(c=>{
          const dis = (c!==cur && chosen.has(c)) ? "disabled" : "";
          return `<option value="${c}" ${c===cur?"selected":""} ${dis}>${c}</option>`;
        }).join("");
    });
  }

  function updateCategoryRowUI(){
    const lines = getCategoryLines();
    lines.forEach((l,idx)=>{
      if (idx===0){
        // första raden -> ingen ta bort-knapp
        l.removeBtn.style.visibility = "hidden";
        l.removeBtn.style.pointerEvents="none";
      } else {
        l.removeBtn.style.visibility = "visible";
        l.removeBtn.style.pointerEvents="auto";
      }
    });
  }

  // ===== SPARA / REDIGERA =====

  function onSaveEntry(){
    const [year,month] = currentYearMonth();
    if (!allData[month]) allData[month]=[];

    const datumVal = $("dateInput").value;
    if (!datumVal){
      alert("Datum saknas.");
      return;
    }

    const projektVal  = $("projektInput").value.trim();
    const driveHrsVal = parseFloat($("driveHoursInput").value||"0")||0;
    const noteVal     = $("noteInput").value.trim();

    // samla alla kategorirader
    const catLines = getCategoryLines();
    const validLines = catLines
      .map(l=>{
        const cat = l.select.value||"";
        const hrs = parseFloat(l.hours.value||"0")||0;
        return cat ? {cat,hrs} : null;
      })
      .filter(x=>x);

    if (!validLines.length){
      alert("Ingen kategori vald.");
      return;
    }

    const rowId = editId || genRowId();

    // om vi redigerar -> ta bort alla gamla poster med samma _id först
    if (editId){
      allData[month] = allData[month].filter(r => r._id !== editId);
    }

    // lägg in varje kategori som egen rad (kompatibelt med export/backup)
    validLines.forEach(item=>{
      allData[month].push({
        _id: rowId,
        datum: datumVal,
        kategori: item.cat,
        tid: item.hrs,
        projekt: projektVal,
        kortid: driveHrsVal,
        beskrivning: noteVal
      });
    });

    saveData(editId ? "edit-entry" : "add-entry");
    clearForm();
    renderAll();
  }

  function startEdit(rowId){
    const [y,m] = currentYearMonth();
    const arr = allData[m]||[];
    const bundle = arr.filter(r=>r._id===rowId);
    if (!bundle.length) return;

    editId = rowId;

    const base = bundle[0];
    $("dateInput").value        = base.datum || "";
    $("projektInput").value     = base.projekt || "";
    $("driveHoursInput").value  = base.kortid || "";
    $("noteInput").value        = base.beskrivning || "";

    // återskapa kategori-raderna
    const block = $("catBlock");
    block.innerHTML = "";
    bundle.forEach((r,idx)=>{
      addCategoryRow();
      const lines = getCategoryLines();
      const last = lines[lines.length-1];
      last.select.value = r.kategori || "";
      last.hours.value  = r.tid || "";
    });
    refreshCatOptions();
    updateCategoryRowUI();

    $("saveEntryLabel").textContent="Spara";
    $("cancelEditBtn").style.display="inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    const [y,m] = currentYearMonth();
    if(!confirm("Ta bort raden?")) return;
    allData[m] = (allData[m]||[]).filter(r=>r._id!==rowId);
    saveData("delete-entry");
    renderAll();
  }

  function cancelEdit(){
    clearForm();
  }

  function clearForm(){
    editId = null;
    $("dateInput").value="";
    $("projektInput").value="";
    $("driveHoursInput").value="";
    $("noteInput").value="";
    populateCategoryTemplate();
    $("saveEntryLabel").textContent="Lägg till";
    $("cancelEditBtn").style.display="none";
  }

  // ===== RENDER (MÅNAD, LARM, ÅR) =====

  function renderAll(){
    renderMonth();
    renderMonthSummaryAndAlarms();
    renderYearOverview();
    if (window.lucide) lucide.createIcons();
  }

  function renderMonth(){
    const [year, month] = currentYearMonth();
    const tbody = $("monthTableBody");
    tbody.innerHTML="";

    const rows = allData[month]||[];
    // sortera på datum
    const sorted = rows.slice().sort((a,b)=>a.datum.localeCompare(b.datum));

    // bygga bundles per _id
    const bundlesById = {};
    sorted.forEach(r=>{
      if (!bundlesById[r._id]){
        bundlesById[r._id] = {
          _id: r._id,
          datum: r.datum,
          projekt: r.projekt,
          kortid: r.kortid || 0,
          beskrivning: r.beskrivning || "",
          cats: []
        };
      }
      bundlesById[r._id].cats.push({
        kategori: r.kategori || "",
        tid: parseFloat(r.tid)||0
      });
    });

    // statusMap per dag
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    Object.values(bundlesById)
      .sort((a,b)=> (a.datum||"").localeCompare(b.datum||""))
      .forEach(bundle=>{
        // kategori-text och totalTid
        let totTid = 0;
        const catText = bundle.cats.map(c=>{
          totTid += c.tid;
          // Traktamente ska visas utan "0h"
          if (c.kategori.toLowerCase().includes("trakt")){
            return "Traktamente";
          }
          return `${c.kategori} ${c.tid}h`;
        }).join("; ");

        const tr = document.createElement("tr");

        const st = statusMap[bundle.datum]?.status || "";
        if (st) tr.classList.add("dagstatus--"+st);

        tr.innerHTML = `
          <td>${bundle.datum||""}</td>
          <td>${bundle.projekt||""}</td>
          <td>${catText}</td>
          <td>${totTid.toFixed(2)}</td>
          <td>${(parseFloat(bundle.kortid)||0).toFixed(2)}</td>
          <td>${(bundle.beskrivning||"").replace(/\r?\n/g," ")}</td>
          <td style="white-space:nowrap;">
            <button class="icon-table-btn" data-act="edit" data-id="${bundle._id}" title="Ändra">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="icon-table-btn" data-act="del" data-id="${bundle._id}" title="Ta bort" style="color:#c0392b;">
              <i data-lucide="trash-2"></i>
            </button>
          </td>
        `;

        tbody.appendChild(tr);
      });

    // knappar i tabellen
    tbody.querySelectorAll("button[data-act='edit']").forEach(btn=>{
      btn.addEventListener("click",()=>startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn=>{
      btn.addEventListener("click",()=>deleteRow(btn.dataset.id));
    });
  }

  function renderMonthSummaryAndAlarms(){
    const [year, month] = currentYearMonth();
    const rows = allData[month]||[];

    // statusMap för larmfönster
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    // summeringar för footer
    const sum = {
      ordinarie:0,
      flex:0,
      ot_lt2:0,
      ot_gt2:0,
      semester:0,
      atf:0,
      vab:0,
      sjuk:0,
      fledig:0,
      trakt:0,
      kortid:0
    };

    // vi räknar per bundleId så att kortid inte dubblas
    const seenIds = new Set();
    rows.forEach(r=>{
      const name=(r.kategori||"").toLowerCase();
      const h=parseFloat(r.tid)||0;

      if(name.includes("ordinarie")) sum.ordinarie+=h;
      if(name.includes("flex")) sum.flex+=h;
      if(name.includes("övertid") && name.includes("<2")) sum.ot_lt2+=h;
      if(name.includes("övertid") && name.includes(">2") && !name.includes("helg")) sum.ot_gt2+=h;
      if(name.includes("övertid") && name.includes("helg")) sum.ot_gt2+=h; // räkna helg i samma klump ÖT>2/Helg i month footer
      if(name.includes("semest")) sum.semester+=h;
      if(name.includes("atf")) sum.atf+=h;
      if(name.includes("vab")) sum.vab+=h;
      if(name.includes("sjuk")) sum.sjuk+=h;
      if(name.includes("föräldra")) sum.fledig+=h;
      if(name.includes("trakt")) sum.trakt+=1;

      if(!seenIds.has(r._id)){
        seenIds.add(r._id);
        sum.kortid += parseFloat(r.kortid)||0;
      }
    });

    $("monthSummaryCell").textContent =
      `Ordinarie: ${sum.ordinarie.toFixed(2)}h | `+
      `Flex: ${sum.flex.toFixed(2)}h | `+
      `ÖT<2: ${sum.ot_lt2.toFixed(2)}h | `+
      `ÖT>2/Helg: ${sum.ot_gt2.toFixed(2)}h | `+
      `Semester: ${sum.semester.toFixed(2)}h | `+
      `ATF: ${sum.atf.toFixed(2)}h | `+
      `VAB: ${sum.vab.toFixed(2)}h | `+
      `Sjuk: ${sum.sjuk.toFixed(2)}h | `+
      `F-ledig: ${sum.fledig.toFixed(2)}h | `+
      `Trakt: ${sum.trakt} st | `+
      `Körtid: ${sum.kortid.toFixed(2)}h`;

    // LARM / OBALANS-tabellen
    const alarmBody = $("alarmTableBody");
    alarmBody.innerHTML="";

    // Vi listar dagar i månaden
    const daysInMonth = new Date(year, month, 0).getDate();
    for(let d=1; d<=daysInMonth; d++){
      const ds = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

      const info = statusMap[ds];
      if(!info) continue;

      // hoppa helg/röddag, ska inte larma
      if(info.status==="helg" || info.status==="röddag") continue;
      // hoppa helt OK/grön
      if(info.status==="grön") continue;

      // status-text
      let statusText = "";
      if(info.status==="saknas"){
        statusText = "Ingen registrering";
      } else if(info.status==="orange_under"){
        statusText = "Under 8h";
      } else if(info.status==="orange_absence"){
        statusText = "Frånvaro";
      } else {
        continue;
      }

      // bara larma historiska datum (d < idag) – vi försöker:
      const todayStr = new Date().toISOString().slice(0,10);
      if (ds >= todayStr) {
        // framtid / idag pågående -> inget larm
        continue;
      }

      const tr=document.createElement("tr");
      tr.innerHTML = `
        <td>${ds}</td>
        <td>${(info.totalHours||0).toFixed(2)}</td>
        <td>${statusText}</td>
      `;
      alarmBody.appendChild(tr);
    }
  }

  function renderYearOverview(){
    const tbody=$("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    // summera varje månad 1..12
    const monthsSv={
      1:"Januari",2:"Februari",3:"Mars",4:"April",5:"Maj",6:"Juni",
      7:"Juli",8:"Augusti",9:"September",10:"Oktober",11:"November",12:"December"
    };

    for(let m=1;m<=12;m++){
      const arr = allData[m]||[];
      const sums = {
        ordinarie:0,
        kortid:0,
        flex:0,
        ot_lt2:0,
        ot_gt2:0,
        ot_helg:0,
        semester:0,
        atf:0,
        vab:0,
        sjuk:0,
        fledig:0,
        trakt:0
      };

      const seenIds = new Set();
      arr.forEach(r=>{
        const n=(r.kategori||"").toLowerCase();
        const h=parseFloat(r.tid)||0;

        if(n.includes("ordinarie")) sums.ordinarie+=h;
        if(n.includes("flex"))     sums.flex+=h;
        if(n.includes("övertid") && n.includes("<2")) sums.ot_lt2+=h;
        if(n.includes("övertid") && n.includes(">2") && !n.includes("helg")) sums.ot_gt2+=h;
        if(n.includes("övertid") && n.includes("helg")) sums.ot_helg+=h;
        if(n.includes("semest"))  sums.semester+=h;
        if(n.includes("atf"))     sums.atf+=h;
        if(n.includes("vab"))     sums.vab+=h;
        if(n.includes("sjuk"))    sums.sjuk+=h;
        if(n.includes("föräldra"))sums.fledig+=h;
        if(n.includes("trakt"))   sums.trakt+=1;

        if(!seenIds.has(r._id)){
          seenIds.add(r._id);
          sums.kortid += parseFloat(r.kortid)||0;
        }
      });

      function fmt(v){
        if(!v || v===0) return "";
        if(typeof v==="number") return v.toFixed(2).replace(/\.00$/,"");
        return v;
      }

      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${monthsSv[m]}</td>
        <td>${fmt(sums.ordinarie)}</td>
        <td>${fmt(sums.kortid)}</td>
        <td>${fmt(sums.flex)}</td>
        <td>${fmt(sums.ot_lt2)}</td>
        <td>${fmt(sums.ot_gt2)}</td>
        <td>${fmt(sums.ot_helg)}</td>
        <td>${fmt(sums.semester)}</td>
        <td>${fmt(sums.atf)}</td>
        <td>${fmt(sums.vab)}</td>
        <td>${fmt(sums.sjuk)}</td>
        <td>${fmt(sums.fledig)}</td>
        <td>${fmt(sums.trakt)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ===== BACKUP / IMPORT =====
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
      renderAll();
      alert("Import klar.");
    });
  }

  function clearAllDataConfirm(){
    if(!confirm("Är du säker? Detta raderar ALL din data i appen.")) return;
    allData={};
    localStorage.setItem(DATA_KEY,JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderAll();
  }

  // ===== EXPORT HJÄLP =====
  function flattenDataForExportMonth(){
    const [year,month]=currentYearMonth();
    return (allData[month]||[]).slice().sort((a,b)=>a.datum.localeCompare(b.datum));
  }
  function flattenDataFullYear(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=>out.push(r));
    });
    return out;
  }

  // ===== SW/PWA =====
  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
        .then(()=>console.log("Service Worker registrerad (v"+APP_VERSION+")"))
        .catch(e=>console.warn("SW fel:",e));
    }
  }

})();