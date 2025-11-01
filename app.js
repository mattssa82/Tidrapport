// app.js
// Tidrapport v10.5
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION = "10.5";

  // OBS: behåll v10 keys så vi inte tappar data
  const DATA_KEY = "tidrapport_data_v10";         // { "9":[...], "10":[...], ... }
  const SETTINGS_KEY = "tidrapport_settings_v10"; // { company,name,emp,autoBackup,redDayHours,... }

  // State
  let allData = {};    // månadsindex -> array av rader [{ _id, datum, kategori, tid, projekt, kortid, beskrivning }]
  let settings = {};
  let editId = null;   // aktiv bundle som redigeras, annars null

  // kategori-rader i formuläret (Row UI state)
  // varje rad: {rowId, kategori, timmar}
  let catFormRows = [];

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();

    renderCatRows();          // init category rows (tom)
    renderMonth();
    renderYearOverview();
    renderAlarms();

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

    // fallback
    if (settings.redDayHours == null) {
      settings.redDayHours = 8;
    }

    // skriv ut till UI
    get("companyInput").value         = settings.company     || "";
    get("nameInput").value            = settings.name        || "";
    get("anstnrInput").value          = settings.emp         || "";
    get("autoBackupChk").checked      = !!settings.autoBackup;
    get("redDayHoursInput").value     = settings.redDayHours;

  }

  function saveSettingsFromUI(){
    settings.company     = get("companyInput").value.trim();
    settings.name        = get("nameInput").value.trim();
    settings.emp         = get("anstnrInput").value.trim();
    settings.autoBackup  = get("autoBackupChk").checked;

    // hur många timmar en röd dag "räknas som"
    const rdh = parseFloat(get("redDayHoursInput").value||"0")||0;
    settings.redDayHours = rdh;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    alert("Inställningar sparade.");
    renderMonth();
    renderYearOverview();
    renderAlarms();
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

  function onlyUnique(arr){
    return Array.from(new Set(arr));
  }

  // -----------------------------
  // UI bindings
  // -----------------------------
  function bindUI(){
    // Form knappar
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

    // kategori-hantering
    get("addCatBtn").addEventListener("click", addCatRow);

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
      // öppna i nytt fönster som tidigare
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
      renderAlarms();
    });
    get("monthSelect").addEventListener("change", ()=>{
      renderMonth();
      renderAlarms();
    });

    // meny toggle (mobil)
    initMenuToggle();

    // klick vart som helst i datumfältet ska öppna pickern (på browsers som stödjer showPicker)
    const di = get("dateInput");
    if (di && di.showPicker){
      di.addEventListener("click", e => { e.target.showPicker(); });
    }
  }

  // -----------------------------
  // Meny toggle mobil/offcanvas
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
  // Kategorilista (till dropdown)
  // -----------------------------
  function getCategoryOptions(){
    // Viktigt: Traktamente är en kategori nu, ingen separat checkbox
    // Vi särar ut ÖT>2 och ÖT-Helg för årsöversikten
    return [
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
  }

  // -----------------------------
  // Dynamiska kategori-rader i formuläret
  // -----------------------------
  function addCatRow(presetCat="", presetHrs=""){
    // Begränsa så att samma kategori inte kan förekomma två gånger
    const usedCats = catFormRows.map(r=>r.kategori).filter(Boolean);
    const allCats = getCategoryOptions();
    const nextAvailable = presetCat || allCats.find(c => !usedCats.includes(c)) || "";

    const rowId = genRowId();
    catFormRows.push({
      rowId,
      kategori: nextAvailable,
      timmar: presetHrs!=="" ? String(presetHrs) : ""
    });
    renderCatRows();
  }

  function removeCatRow(rowId){
    catFormRows = catFormRows.filter(r=>r.rowId!==rowId);
    renderCatRows();
  }

  function renderCatRows(){
    const wrap = get("catRows");
    wrap.innerHTML = "";
    const allCats = getCategoryOptions();

    catFormRows.forEach(r=>{
      // vi kalkylerar vilka kategorier som är tillåtna i just den här raden:
      const usedCats = catFormRows
        .filter(x=>x.rowId!==r.rowId)
        .map(x=>x.kategori)
        .filter(Boolean);

      const allowedCats = allCats.filter(c=>!usedCats.includes(c) || c===r.kategori);

      const rowDiv = document.createElement("div");
      rowDiv.className = "cat-row";
      rowDiv.setAttribute("data-rowid", r.rowId);

      // kategori select
      const selHtml = `
        <select class="catSelect" data-rowid="${r.rowId}">
          ${allowedCats.map(c=>`
            <option value="${c}" ${c===r.kategori?"selected":""}>${c}</option>
          `).join("")}
        </select>
      `;

      // timmar input (tillåter minus)
      const hrsHtml = `
        <input class="catHours" data-rowid="${r.rowId}"
          type="number" step="0.25" value="${r.tammar ?? r.timmar || ""}" />
      `;

      // actions
      const actHtml = `
        <div class="cat-actions">
          <button class="cat-btn remove" data-rowid="${r.rowId}">
            <i data-lucide="trash-2"></i><span>Ta bort</span>
          </button>
        </div>
      `;

      rowDiv.innerHTML = selHtml + hrsHtml + actHtml;
      wrap.appendChild(rowDiv);
    });

    // eventkopplingar kategori & timmar & ta bort
    wrap.querySelectorAll(".catSelect").forEach(sel=>{
      sel.addEventListener("change", e=>{
        const rid = e.target.getAttribute("data-rowid");
        const val = e.target.value;
        const row = catFormRows.find(x=>x.rowId===rid);
        if(row){
          row.kategori = val;
        }
        // efter ändring behöver vi re-rendera för att låsa bort dubbletter
        renderCatRows();
      });
    });

    wrap.querySelectorAll(".catHours").forEach(inp=>{
      inp.addEventListener("input", e=>{
        const rid = e.target.getAttribute("data-rowid");
        const val = e.target.value;
        const row = catFormRows.find(x=>x.rowId===rid);
        if(row){
          row.timmar = val;
        }
      });
    });

    wrap.querySelectorAll(".cat-btn.remove").forEach(btn=>{
      btn.addEventListener("click", e=>{
        e.preventDefault();
        const rid = btn.getAttribute("data-rowid");
        removeCatRow(rid);
      });
    });

    if (window.lucide) lucide.createIcons();
  }

  function clearCatRows(){
    catFormRows = [];
    renderCatRows();
  }

  // -----------------------------
  // År / Månad dropdowns
  // -----------------------------
  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");

    // Samla alla år som finns i datat + nuvarande år
    const yearsSeen = new Set();
    const curY = new Date().getFullYear();
    yearsSeen.add(curY);

    Object.keys(allData).forEach(mKey=>{
      const arr = allData[mKey]||[];
      arr.forEach(r=>{
        if(!r.datum) return;
        const y = (new Date(r.datum)).getFullYear();
        if(!isNaN(y)) yearsSeen.add(y);
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
    const curM = new Date().getMonth()+1;
    mSel.innerHTML = monthNames.map((name,i)=>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  // -----------------------------
  // Spara rad(er)
  // -----------------------------
  function onSaveEntry(){
    const [year,month] = currentYearMonth();
    if (!allData[month]) allData[month]=[];

    const datumVal     = get("dateInput").value;
    const projektVal   = get("projektInput").value.trim();
    const driveHrsVal  = parseFloat(get("driveHoursInput").value||"0")||0;
    const noteVal      = get("noteInput").value.trim();

    if (!datumVal){
      alert("Datum saknas.");
      return;
    }
    if (!catFormRows.length){
      alert("Minst en kategori krävs.");
      return;
    }

    // bundle-id
    const rowId = editId || genRowId();

    // om vi redigerar -> ta bort gamla posten med samma id först
    if (editId){
      allData[month] = allData[month].filter(r => r._id !== editId);
    }

    // pusha varje kategori-rad som egen rad
    catFormRows.forEach(r=>{
      if(!r.kategori) return;
      const h = parseFloat(r.timmar||"0")||0;

      allData[month].push({
        _id: rowId,
        datum: datumVal,
        kategori: r.kategori,
        tid: h,
        projekt: projektVal,
        kortid: driveHrsVal,
        beskrivning: noteVal
      });
    });

    saveData(editId ? "edit-entry" : "add-entry");
    clearForm();
    renderMonth();
    renderYearOverview();
    renderAlarms();
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
    clearCatRows();
    get("saveEntryLabel").textContent="Lägg till";
    get("cancelEditBtn").style.display="none";
  }

  // -----------------------------
  // Redigera / Radera
  // -----------------------------
  function startEdit(rowId){
    const [y,m]=currentYearMonth();
    const arr = allData[m]||[];

    const bundle = arr.filter(r=>r._id===rowId);
    if (!bundle.length) return;

    editId = rowId;

    // Alla har samma datum/projekt/kortid/beskrivning
    const base = bundle[0];
    get("dateInput").value       = base.datum || "";
    get("projektInput").value    = base.projekt || "";
    get("driveHoursInput").value = base.kortid || "";
    get("noteInput").value       = base.beskrivning || "";

    // bygg catFormRows av bundle (unika kategorier)
    catFormRows = bundle.map(item=>({
      rowId: genRowId(),
      kategori: item.kategori || "",
      timmar: item.tid || ""
    }));
    // ta bort dubbletter om någon la samma kategori två gånger
    dedupeCatRows();
    renderCatRows();

    get("saveEntryLabel").textContent="Spara";
    get("cancelEditBtn").style.display="inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function dedupeCatRows(){
    const seen = new Set();
    catFormRows = catFormRows.filter(row=>{
      if(!row.kategori) return true;
      const k=row.kategori;
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function deleteRow(rowId){
    const [y,m]=currentYearMonth();
    if(!confirm("Ta bort raden?")) return;
    allData[m] = (allData[m]||[]).filter(r=>r._id!==rowId);
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
    renderAlarms();
  }

  // -----------------------------
  // Månadsrendering
  // -----------------------------
  function renderMonth(){
    const [year, month] = currentYearMonth();
    const tbody = get("monthTableBody");
    tbody.innerHTML="";

    const rows = allData[month]||[];
    // sortera på datum
    const sorted = rows.slice().sort((a,b)=>a.datum.localeCompare(b.datum));

    // statusMap från balansregler
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month, settings.redDayHours)
      : {};

    sorted.forEach(r=>{
      const tr=document.createElement("tr");
      const st = statusMap[r.datum]?.status || "";
      if (st) tr.classList.add("dagstatus--"+st);

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
          <button class="icon-table-btn danger" data-act="del" data-id="${r._id}" title="Ta bort">
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

    renderMonthSummary(rows, statusMap);
  }

  function renderMonthSummary(rows, statusMap){
    const cell=get("monthSummaryCell");
    if(!cell) return;

    // summera timmar per kategori-typ
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

    rows.forEach(r=>{
      const name=(r.kategori||"").toLowerCase();
      const h=parseFloat(r.tid)||0;

      if(name.includes("ordinarie")) sum.ordinarie+=h;
      if(name.includes("flex")) sum.flextid+=h;
      if(name.includes("övertid") && name.includes("<2")) sum.ot_lt2+=h;
      if(name.includes("övertid") && name.includes(">2")) sum.ot_gt2+=h;
      if(name.includes("övertid-helg") || (name.includes("övertid") && name.includes("helg"))) sum.ot_helg+=h;
      if(name.includes("semest")) sum.semester+=h;
      if(name.includes("atf")) sum.atf+=h;
      if(name.includes("vab")) sum.vab+=h;
      if(name.includes("sjuk")) sum.sjuk+=h;
      if(name.includes("trakt")) sum.trakt+=1;

      sum.kortid += parseFloat(r.kortid)||0;
    });

    cell.textContent =
      `Ordinarie: ${sum.ordinarie.toFixed(2)}h | `+
      `Flex: ${sum.flextid.toFixed(2)}h | `+
      `ÖT<2: ${sum.ot_lt2.toFixed(2)}h | `+
      `ÖT>2: ${sum.ot_gt2.toFixed(2)}h | `+
      `ÖT-Helg: ${sum.ot_helg.toFixed(2)}h | `+
      `Semester: ${sum.semester.toFixed(2)}h | `+
      `ATF: ${sum.atf.toFixed(2)}h | `+
      `VAB: ${sum.vab.toFixed(2)}h | `+
      `Sjuk: ${sum.sjuk.toFixed(2)}h | `+
      `Trakt: ${sum.trakt} st | `+
      `Körtid: ${sum.kortid.toFixed(2)}h`;
  }

  // -----------------------------
  // Alarm / Obalans-listan
  // -----------------------------
  function renderAlarms(){
    const [year, month] = currentYearMonth();
    const tbody = get("alarmTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const rows = allData[month]||[];
    if(!rows.length){
      return;
    }

    // statusMap och summering per dag
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month, settings.redDayHours)
      : {};

    // gruppera timmar per datum
    const perDay = {};
    rows.forEach(r=>{
      if(!r.datum) return;
      if(!perDay[r.datum]) perDay[r.datum] = 0;
      perDay[r.datum] += parseFloat(r.tid)||0;
    });

    // alla datum i månaden
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayStr = new Date().toISOString().slice(0,10);

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

      // visa bara historiska dagar (inte framtiden)
      if (ds > todayStr) continue;

      const st = statusMap[ds]?.status;
      const hours = (perDay[ds]||0).toFixed(2);

      // hoppa helg och röddag från larm
      if (st==="helg" || st==="röddag") {
        continue;
      }

      // grön => OK => inget larm
      if (st==="grön"){
        continue;
      }

      // saknas / orange_under / orange_absence
      let msg="";
      if (st==="saknas"){
        msg="🔴 Ingen registrering";
      } else if (st==="orange_under"){
        msg="⚠️ Under full dag (<8h)";
      } else if (st==="orange_absence"){
        msg="⚠️ Frånvaro";
      } else {
        msg=st||"";
      }

      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${ds}</td>
        <td>${hours}</td>
        <td>${msg}</td>
      `;
      tbody.appendChild(tr);
    }
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
        if(n.includes("flex")) sum.flextid+=h;
        if(n.includes("övertid") && n.includes("<2")) sum.ot_lt2+=h;
        if(n.includes("övertid") && n.includes(">2")) sum.ot_gt2+=h;
        if(n.includes("övertid-helg") || (n.includes("övertid") && n.includes("helg"))) sum.ot_helg+=h;
        if(n.includes("semest")) sum.semester+=h;
        if(n.includes("atf")) sum.atf+=h;
        if(n.includes("vab")) sum.vab+=h;
        if(n.includes("sjuk")) sum.sjuk+=h;
        if(n.includes("trakt")) sum.trakt+=1;

        sum.kortid += parseFloat(r.kortid)||0;
      });

      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${monthNames[m]}</td>
        <td>${sum.ordinarie.toFixed(2)}</td>
        <td>${sum.flextid.toFixed(2)}</td>
        <td>${sum.ot_lt2.toFixed(2)}</td>
        <td>${sum.ot_gt2.toFixed(2)}</td>
        <td>${sum.ot_helg.toFixed(2)}</td>
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
      renderAlarms();
      alert("Import klar.");
    });
  }

  function clearAllDataConfirm(){
    const sure = prompt('Skriv "RENSA ALLT" för att radera all data permanent:');
    if(sure!=="RENSA ALLT") return;
    allData={};
    localStorage.setItem(DATA_KEY,JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
    renderAlarms();
  }

  // -----------------------------
  // Export-hjälp (flatten)
  // -----------------------------
  function flattenDataForExportMonth(){
    const [year,month]=currentYearMonth();
    return (allData[month]||[]).slice().sort((a,b)=>a.datum.localeCompare(b.datum));
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