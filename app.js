// app.js
// Tidrapport v10.23
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION = "10.23";
  const DATA_KEY = "tidrapport_data_v10";           // { "9":[...], "10":[...], ... }
  const SETTINGS_KEY = "tidrapport_settings_v10";   // { company,name,emp,redDays,showRedDays,autoBackup,... }

  // State
  let allData = {};      // månadsindex -> array av rader [{ _id, datum, kategori, tid, projekt, kortid, beskrivning }]
  let settings = {};
  let editId = null;     // aktiv rad som redigeras, annars null

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    populateCategorySelects();
    renderMonth();
    renderYearOverview();
    renderAlarmsForMonth();
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

    // skjut in i UI
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
    renderAlarmsForMonth();
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

  // ===== Input helpers =====
  function normMinus(s){ return (s||"").replace(/[–—−]/g,"-"); }

  function toNumRaw(s){
    if (s==null) return NaN;
    s = normMinus((""+s).replace(/\s+/g,"")).replace(",",".");
    if (!/^[-]?\d*(\.\d+)?$/.test(s)) return NaN;
    return s==="" ? NaN : parseFloat(s);
  }

  function roundQuarter(n){ return Math.round(n*4)/4; }

  function parseHourInput(v, allowEmpty=false){
    if (allowEmpty && (v==="" || v==null)) return 0;
    const n = toNumRaw(v);
    if (isNaN(n)) return NaN;
    return roundQuarter(n);
  }

  function sanitizeProject(s){
    s = (s||"").normalize("NFC").replace(/\s+/g,"");
    return s.replace(/[^0-9A-Za-zÅÄÖåäö]/g,"");
  }

  const ABSENCE_CATS = [
    "vab",
    "sjuk",
    "sjuk-tim",
    "föräldraledig",
    "föräldraledighet",
    "fl"  // kortform
  ];

  const NEGATIVE_BANK_CATS = [
    "flextid",
    "atf",
    "atf-tim",
    "övertid <2",
    "övertid >2",
    "övertid-helg",
    "övertid helg",
    "semester",
    "semester-tim"
  ];

  // -----------------------------
  // UI bindings
  // -----------------------------
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

    // sök-knapp i sidomenyn
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
      renderAlarmsForMonth();
    });
    get("monthSelect").addEventListener("change", ()=>{
      renderMonth();
      renderAlarmsForMonth();
    });

    // meny toggle
    initMenuToggle();

    // klick vart som helst i datumfältet ska öppna pickern (på mobiler som stödjer showPicker)
    const di = get("dateInput");
    if (di && di.showPicker){
      di.addEventListener("click", e => { e.target.showPicker(); });
    }
  }

  // -----------------------------
  // Meny toggle (mobil/offcanvas)
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

    // Bygg lista på år: nuvarande år + år som finns i datat
    const yearsSeen = new Set();
    const curY = new Date().getFullYear();
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

    // Månad som namn
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
  // Lägg till / Spara rad
  // -----------------------------
  function onSaveEntry(){
    const [year,month] = currentYearMonth();
    if (!allData[month]) allData[month]=[];

    const datum = get("dateInput").value;
    if (!datum){
      alert("Datum saknas.");
      return;
    }

    const projektRaw = get("projektInput").value;
    const projektVal = sanitizeProject(projektRaw);
    if (!projektVal){
      alert("Projekt nr måste anges.");
      return;
    }

    const noteVal = (get("noteInput").value||"").trim();
    if (!noteVal){
      alert("Dagboksanteckning måste fyllas i (kort beskrivning).");
      return;
    }

    // Huvudkategori
    const catMain = get("catMainSelect").value || "";
    const catMainHours = parseHourInput(get("catMainHours").value, true);
    if (isNaN(catMainHours)){
      alert("Ogiltigt värde i 'Tid (h)' för Kategori 1.");
      return;
    }

    // Extra kategori 1
    const ex1Sel = document.querySelector('.catExtraSelect[data-extra-index="1"]');
    const ex1Hrs = document.querySelector('.catExtraHours[data-extra-index="1"]');
    const cat1   = ex1Sel ? (ex1Sel.value||"") : "";
    const hrs1   = ex1Hrs ? parseHourInput(ex1Hrs.value, true) : 0;
    if (ex1Hrs && isNaN(hrs1)){
      alert("Ogiltigt värde i 'Tid (h)' för Extra kategori 2.");
      return;
    }

    // Extra kategori 2
    const ex2Sel = document.querySelector('.catExtraSelect[data-extra-index="2"]');
    const ex2Hrs = document.querySelector('.catExtraHours[data-extra-index="2"]');
    const cat2   = ex2Sel ? (ex2Sel.value||"") : "";
    const hrs2   = ex2Hrs ? parseHourInput(ex2Hrs.value, true) : 0;
    if (ex2Hrs && isNaN(hrs2)){
      alert("Ogiltigt värde i 'Tid (h)' för Extra kategori 3.");
      return;
    }

    // Traktamente
    const trakt = get("traktChk").checked;

    // Körtid
    const driveHrsVal = parseHourInput(get("driveHoursInput").value, true);
    if (isNaN(driveHrsVal)){
      alert("Ogiltigt värde i 'Körtid (h)'.");
      return;
    }

    // samla in alla kategorier med timmar
    const chosen = [];
    if (catMain && catMainHours !== 0) chosen.push({cat:catMain, hrs:catMainHours});
    if (cat1   && hrs1        !== 0)   chosen.push({cat:cat1,   hrs:hrs1});
    if (cat2   && hrs2        !== 0)   chosen.push({cat:cat2,   hrs:hrs2});

    if (!chosen.length && !trakt){
      alert("Minst en kategori med tid eller Traktamente måste anges.");
      return;
    }

    // inga dubbla kategorier i samma inmatning
    const seenCats = new Set();
    for (const c of chosen){
      const key = c.cat.toLowerCase();
      if (seenCats.has(key)){
        alert("Samma kategori får inte användas två gånger i samma inmatning.");
        return;
      }
      seenCats.add(key);
    }

    // kontroll Ordinarie + frånvaro (VAB/Sjuk/FL)
    const hasOrd = chosen.some(c => (c.cat||"").toLowerCase().includes("ordinarie"));
    const hasAbs = chosen.some(c => {
      const n = (c.cat||"").toLowerCase();
      return ABSENCE_CATS.some(a=>n.includes(a));
    });
    if (hasOrd && hasAbs){
      alert("Du kan inte kombinera Ordinarie tid med VAB/Sjuk/Föräldraledig i samma inmatning. Lägg dem på separata rader.");
      return;
    }

    // kontroll Ordinarie + negativa timmar (flex/komp/ATF/övertid/semester)
    const hasNeg = chosen.some(c => c.hrs < 0);
    if (hasOrd && hasNeg){
      alert(
        "Ordinarie tid kan inte kombineras med negativa timmar (Flex/ATF/ÖT/Semester) " +
        "i samma inmatning.\n\n" +
        "Lägg Ordinarie tid på en rad och uttag från tidbank (negativa timmar) på en separat rad."
      );
      return;
    }

    const rowId = editId || genRowId();

    // om vi redigerar -> ta bort gamla posten med samma id först
    if (editId){
      allData[month] = allData[month].filter(r => r._id !== editId);
    }

    // Bygg rader: första kategorin bär körtid + anteckning, övriga bara timmar
    let isFirst = true;
    chosen.forEach(c => {
      allData[month].push({
        _id: rowId,
        datum,
        kategori: c.cat,
        tid: c.hrs,
        projekt: projektVal,
        kortid: isFirst ? driveHrsVal : 0,
        beskrivning: isFirst ? noteVal : ""
      });
      isFirst = false;
    });

    // traktamente rad (0h, bara räkna som antal)
    if (trakt){
      allData[month].push({
        _id: rowId,
        datum,
        kategori: "Traktamente",
        tid: 0,
        projekt: projektVal,
        kortid: 0,
        beskrivning: ""
      });
    }

    saveData(editId ? "edit-entry" : "add-entry");
    clearForm();
    renderMonth();
    renderYearOverview();
    renderAlarmsForMonth();
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
    const [y,m]=currentYearMonth();
    const arr = allData[m]||[];
    const bundle = arr.filter(r=>r._id===rowId);
    if (!bundle.length) return;

    editId = rowId;

    const base = bundle[0];
    get("dateInput").value = base.datum || "";
    get("projektInput").value = base.projekt || "";
    get("driveHoursInput").value = base.kortid || "";
    get("noteInput").value = base.beskrivning || "";

    // sortera kategorierna så att Ordinarie hamnar först om möjligt
    const cats = bundle
      .filter(r => (r.kategori||"").toLowerCase() !== "traktamente")
      .slice(0,3);

    if (cats[0]){
      get("catMainSelect").value = cats[0].kategori || "";
      get("catMainHours").value = cats[0].tid || "";
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

    const hasTrakt = bundle.some(r=>(r.kategori||"").toLowerCase().includes("trakt"));
    get("traktChk").checked = hasTrakt;

    get("saveEntryLabel").textContent="Spara";
    get("cancelEditBtn").style.display="inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    const [y,m]=currentYearMonth();
    if(!confirm("Ta bort raden?")) return;
    allData[m] = (allData[m]||[]).filter(r=>r._id!==rowId);
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
    renderAlarmsForMonth();
  }

  // -----------------------------
  // Månadsrendering
  // -----------------------------
  function renderMonth(){
    const [year, month] = currentYearMonth();
    const tbody = get("monthTableBody");
    tbody.innerHTML="";

    const rows = allData[month]||[];

    // Sortera på datum
    const sorted = rows.slice().sort((a,b)=>a.datum.localeCompare(b.datum));

    // statusMap från balansregler
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
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
          <button class="icon-table-btn" data-act="del" data-id="${r._id}" title="Ta bort">
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

    const sum={
      ordinarie:0,
      flextid:0,
      ot_lt2:0,
      ot_gt2:0,
      semester:0,
      atf:0,
      vab:0,
      fl:0,
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
      if(name.includes("övertid") && (name.includes(">2")||name.includes("helg"))) sum.ot_gt2+=h;
      if(name.includes("semest")) sum.semester+=h;
      if(name.includes("atf")) sum.atf+=h;
      if(name.includes("vab")) sum.vab+=h;
      if(name.includes("föräldraled")) sum.fl+=h;
      if(name.includes("sjuk")) sum.sjuk+=h;
      if(name.includes("trakt")) sum.trakt+=1;

      sum.kortid += parseFloat(r.kortid)||0;
    });

    cell.textContent =
      `Ordinarie: ${sum.ordinarie.toFixed(2)}h | `+
      `Körtid: ${sum.kortid.toFixed(2)}h | `+
      `Flex: ${sum.flextid.toFixed(2)}h | `+
      `ÖT<2: ${sum.ot_lt2.toFixed(2)}h | `+
      `ÖT>2/Helg: ${sum.ot_gt2.toFixed(2)}h | `+
      `Semester: ${sum.semester.toFixed(2)}h | `+
      `ATF: ${sum.atf.toFixed(2)}h | `+
      `VAB: ${sum.vab.toFixed(2)}h | `+
      `FL: ${sum.fl.toFixed(2)}h | `+
      `Sjuk: ${sum.sjuk.toFixed(2)}h | `+
      `Trakt: ${sum.trakt} st`;
  }

  // -----------------------------
  // Larm / obalans
  // -----------------------------
  function renderAlarmsForMonth(){
    const tbody = get("alarmTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const [year, month] = currentYearMonth();
    const rows = allData[month] || [];
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d=1; d<=daysInMonth; d++){
      const ds = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const st = statusMap[ds];
      if (!st) continue;

      const dayType = st.status;
      const tot = st.totalHours || 0;

      // helg / röddag larmas inte
      if (dayType==="helg" || dayType==="röddag") continue;

      if (dayType==="saknas"){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${ds}</td>
          <td>${tot.toFixed(2)}h</td>
          <td>🔴 Ingen registrering</td>
        `;
        tbody.appendChild(tr);
      } else if (dayType==="orange_under"){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${ds}</td>
          <td>${tot.toFixed(2)}h</td>
          <td>⚠️ Under 8h</td>
        `;
        tbody.appendChild(tr);
      } else if (dayType==="orange_absence"){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${ds}</td>
          <td>${tot.toFixed(2)}h</td>
          <td>⚠️ Frånvaro (VAB/Sjuk/FL)</td>
        `;
        tbody.appendChild(tr);
      }
      // grön visas inte alls
    }

    if (!tbody.children.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="3"><i>Inga larm eller obalanser för vald månad.</i></td>`;
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
        fl:0,
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
        if(n.includes("övertid") && n.includes("helg")) sum.ot_helg+=h;
        if(n.includes("semest")) sum.semester+=h;
        if(n.includes("atf")) sum.atf+=h;
        if(n.includes("vab")) sum.vab+=h;
        if(n.includes("föräldraled")) sum.fl+=h;
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
        <td>${sum.fl.toFixed(2)}</td>
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
      renderAlarmsForMonth();
      alert("Import klar.");
    });
  }

  function clearAllDataConfirm(){
    const input = prompt("⚠️ RADERA ALL DATA.\nSkriv: RADERA ALLT");
    if (input!=="RADERA ALLT") return;
    allData={};
    localStorage.setItem(DATA_KEY,JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
    renderAlarmsForMonth();
  }

  // -----------------------------
  // Hjälp för export (flatten)
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