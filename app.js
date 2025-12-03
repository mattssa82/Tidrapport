// app.js
// Tidrapport v10.25
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION = "10.25";
  const DATA_KEY = "tidrapport_data_v10";         // { "1":[...], "2":[...], ... }
  const SETTINGS_KEY = "tidrapport_settings_v10"; // { company,name,emp,redDays,showRedDays,autoBackup,... }

  // State
  let allData = {};   // månadsnummer -> array av rader { _id, datum, projekt, kategori, tid, kortid, beskrivning }
  let settings = {};
  let editId = null;  // bundlat id (en “inmatning”, flera rader)

  // ===== Helpers för timmar / text =====
  function normMinus(s){ return (s||"").replace(/[–—−]/g,"-"); }

  function toNumRaw(s){
    if(s==null) return NaN;
    s = normMinus((""+s).replace(/\s+/g,"")).replace(",",".");
    if(!/^[-]?\d*(\.\d+)?$/.test(s)) return NaN;
    return s==="" ? NaN : parseFloat(s);
  }

  function roundQuarter(n){ return Math.round(n*4)/4; }

  function parseHourInput(v, allowEmpty=false){
    if(allowEmpty && (v===""||v==null)) return 0;
    const n = toNumRaw(v);
    if(isNaN(n)) return NaN;
    return roundQuarter(n);
  }

  function sanitizeProject(s){
    s=(s||"").normalize("NFC").replace(/\s+/g,"");
    return s.replace(/[^0-9A-Za-zÅÄÖåäö]/g,"");
  }

  function get(id){ return document.getElementById(id); }

  function genRowId(){
    return Date.now()+"_"+Math.floor(Math.random()*1e6);
  }

  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10);
    const m = parseInt(get("monthSelect").value,10);
    return [y,m];
  }

  // ISO-veckonummer
  function getISOWeek(dateStr){
    const d = new Date(dateStr);
    if(isNaN(d)) return null;
    const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNr = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(),0,4));
    const diff = (target - firstThursday)/86400000;
    return 1 + Math.floor(diff/7);
  }

  // ===== Init =====
  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    setupCategoryRows();
    bindUI();
    renderMonth();
    renderYearOverview();
    renderAlarms();
    registerServiceWorker();
    console.log("Tidrapport v"+APP_VERSION+" laddad ✅");
  });

  // ===== Load / Save =====
  function loadData(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
      if(typeof allData!=="object" || !allData) allData = {};
    }catch{
      allData = {};
    }
  }

  function saveData(reason){
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup(reason || "data-change"); // från backup.js
  }

  function loadSettings(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      settings = raw ? JSON.parse(raw) : {};
      if(typeof settings!=="object" || !settings) settings = {};
    }catch{
      settings = {};
    }
    get("companyInput").value = settings.company || "";
    get("nameInput").value    = settings.name || "";
    get("anstnrInput").value  = settings.emp || "";
    get("redDaysInput").value = settings.redDays || "";
    get("showRedDaysChk").checked = !!settings.showRedDays;
    get("autoBackupChk").checked  = !!settings.autoBackup;

    togglePillState("toggleShowRedDays", settings.showRedDays);
    togglePillState("toggleAutoBackup", settings.autoBackup);
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
    renderAlarms();
    autoLocalBackup("settings-change");
  }

  // ===== UI bindningar =====
  function bindUI(){
    // meny toggle
    initMenuToggle();

    // header-knappar
    const openHelpBtn = get("openHelpBtn");
    if(openHelpBtn){
      openHelpBtn.addEventListener("click", () => {
        window.location.href = "help.html";
      });
    }
    const openSearchBtnHeader = get("openSearchBtn");
    if(openSearchBtnHeader){
      openSearchBtnHeader.addEventListener("click", () => {
        window.location.href = "search.html";
      });
    }

    // entry-knappar
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

    get("manualBackupBtn").addEventListener("click", manualBackupNow);
    get("manualBackupBtn2").addEventListener("click", manualBackupNow);

    get("importFileInput").addEventListener("change", onImportFileInputChange);

    // export
    get("exportCsvBtn").addEventListener("click", () => {
      exportCSVImpl(
        flattenDataForExportMonth(),
        settings,
        get("yearSelect").value,
        get("monthSelect").value
      );
    });
    get("exportPdfBtn").addEventListener("click", () => {
      exportPDFImpl(
        flattenDataForExportMonth(),
        settings,
        get("yearSelect").value,
        get("monthSelect").value
      );
    });
    get("exportYearBtn").addEventListener("click", () => {
      exportYearImpl(
        flattenDataFullYear(),
        settings
      );
    });

    // inställningar
    get("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);

    // toggles
    setupToggle("toggleShowRedDays", "showRedDaysChk");
    setupToggle("toggleAutoBackup", "autoBackupChk");

    // år/månad
    get("yearSelect").addEventListener("change", () => {
      renderMonth();
      renderYearOverview();
      renderAlarms();
    });
    get("monthSelect").addEventListener("change", () => {
      renderMonth();
      renderAlarms();
    });

    // datum: klick var som helst
    const di = get("dateInput");
    if(di && di.showPicker){
      di.addEventListener("click", e => {
        e.target.showPicker();
      });
    }
  }

  // ===== Meny off-canvas =====
  function initMenuToggle(){
    const panel = get("sidePanel");
    const btn   = get("menuToggleBtn");
    if(!panel || !btn) return;

    btn.addEventListener("click", () => {
      const willOpen = !panel.classList.contains("open");
      panel.classList.toggle("open", willOpen);
      panel.setAttribute("aria-hidden", willOpen ? "false" : "true");
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    // klick utanför stänger
    document.addEventListener("click", e => {
      if(!panel.contains(e.target) && !btn.contains(e.target)){
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden","true");
        btn.setAttribute("aria-expanded","false");
      }
    });
  }

  // ===== Toggles (input_boolean-stil) =====
  function setupToggle(pillId, chkId){
    const pill = get(pillId);
    const chk  = get(chkId);
    if(!pill || !chk) return;
    const update = () => {
      togglePillState(pillId, chk.checked);
    };
    chk.addEventListener("change", update);
    pill.addEventListener("click", e => {
      if(e.target===chk) return;
      chk.checked = !chk.checked;
      update();
    });
    update();
  }

  function togglePillState(pillId, on){
    const pill = get(pillId);
    if(!pill) return;
    if(on) pill.classList.add("on");
    else pill.classList.remove("on");
  }

  // ===== Kategorirader =====
  const DEFAULT_CATS = [
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

  function setupCategoryRows(){
    const container = get("catRowsContainer");
    const addBtn    = get("addCatRowBtn");
    if(!container || !addBtn) return;
    container.innerHTML = "";
    addCategoryRow(); // minst en rad
    addBtn.addEventListener("click", () => addCategoryRow());
  }

  function buildCategorySelectHtml(selectedValue){
    const options = ['<option value="">(välj kategori)</option>']
      .concat(DEFAULT_CATS.map(c => `<option value="${c}">${c}</option>`));
    return `<select class="cat-name">${options.join("")}</select>`;
  }

  function addCategoryRow(cat="", hours=""){
    const container = get("catRowsContainer");
    if(!container) return;
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `
      ${buildCategorySelectHtml(cat)}
      <input type="text" class="cat-hours" inputmode="decimal" />
      <button type="button" class="remove-cat-btn" title="Ta bort kategori">
        <i data-lucide="minus"></i>
      </button>
    `;
    container.appendChild(row);

    const sel = row.querySelector(".cat-name");
    const inp = row.querySelector(".cat-hours");
    const btn = row.querySelector(".remove-cat-btn");

    if(sel && cat){
      sel.value = cat;
    }
    if(inp && hours!==""){
      inp.value = hours;
    }

    btn.addEventListener("click", () => {
      const allRows = container.querySelectorAll(".cat-row");
      if(allRows.length<=1){
        // nollställ istället
        const s = row.querySelector(".cat-name");
        const h = row.querySelector(".cat-hours");
        if(s) s.value="";
        if(h) h.value="";
        return;
      }
      row.remove();
    });

    if(window.lucide) lucide.createIcons();
  }

  function readCategoryRows(){
    const container = get("catRowsContainer");
    if(!container) return [];
    const rows = [];
    container.querySelectorAll(".cat-row").forEach(row => {
      const sel = row.querySelector(".cat-name");
      const inp = row.querySelector(".cat-hours");
      const cat = sel ? sel.value.trim() : "";
      const raw = inp ? inp.value : "";
      if(!cat && (!raw || raw.trim()==="")) return; // helt tom rad
      const val = parseHourInput(raw, true);
      if(isNaN(val)){
        throw new Error("Ogiltig tid i kategori-raden. Tillåtna tecken: 0-9, ., -");
      }
      rows.push({kategori:cat, tid:val, raw:raw});
    });
    return rows;
  }

  // ===== År / Månad dropdowns =====
  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");
    if(!ySel || !mSel) return;

    const yearsSeen = new Set();
    const curY = new Date().getFullYear();
    yearsSeen.add(curY);

    Object.keys(allData).forEach(mKey => {
      (allData[mKey]||[]).forEach(r => {
        if(!r.datum) return;
        const y = (new Date(r.datum)).getFullYear();
        if(!isNaN(y)) yearsSeen.add(y);
      });
    });

    const yearsSorted = [...yearsSeen].sort((a,b)=>a-b);
    ySel.innerHTML = yearsSorted.map(y =>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];
    const curM = new Date().getMonth()+1;
    mSel.innerHTML = monthNames.map((name,i) =>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  // ===== Lägg till / Spara rad =====
  function onSaveEntry(){
    const [year,month] = currentYearMonth();
    if(!allData[month]) allData[month]=[];

    const datum = get("dateInput").value;
    if(!datum){
      alert("Datum saknas.");
      return;
    }
    const projektRaw = get("projektInput").value;
    const projekt = sanitizeProject(projektRaw);
    if(!projekt){
      alert("Projekt nr saknas eller är ogiltigt.");
      return;
    }

    const driveRaw = get("driveHoursInput").value;
    const driveVal = driveRaw ? parseHourInput(driveRaw,true) : 0;
    if(isNaN(driveVal)){
      alert("Ogiltig körtid. Tillåtna tecken: 0-9, ., -");
      return;
    }

    let cats;
    try{
      cats = readCategoryRows();
    }catch(err){
      alert(err.message || err);
      return;
    }
    if(!cats.length){
      alert("Minst en kategori rad behövs.");
      return;
    }

    const note = get("noteInput").value.trim();
    if(!note){
      alert("Dagboksanteckning saknas.");
      return;
    }

    // kontroll: inga dubbletter av kategori i samma inmatning
    const seen = new Set();
    for(const c of cats){
      if(!c.kategori) continue;
      const key = c.kategori.toLowerCase();
      if(seen.has(key)){
        alert("Du kan inte ha två rader med samma kategori i samma inmatning.");
        return;
      }
      seen.add(key);
    }

    // regler: Ordinarie tid + negativa “arbetstids-kategorier” i samma inmatning => blockera
    const hasOrdinariePos = cats.some(c =>
      (c.kategori||"").toLowerCase().includes("ordinarie") && c.tid>0
    );
    const negWorkCats = ["flextid","atf","övertid","övertid-helg","övertid helg","semester","traktamente"];
    const hasNegWork = cats.some(c => {
      const name=(c.kategori||"").toLowerCase();
      if(c.tid>=0) return false;
      return negWorkCats.some(x=>name.includes(x));
    });
    if(hasOrdinariePos && hasNegWork){
      alert("Ordinarie tid kan inte kombineras med negativa timmar (t.ex. Flextid -2h) i samma inmatning.\n" +
            "Lägg då negativa rader i en separat inmatning.");
      return;
    }

    // ordinarie + VAB/Sjuk/FL blockeras helt
    const absenceCats = ["vab","sjuk","föräldraledig","föräldraledighet"];
    const hasAbsence = cats.some(c => {
      const name=(c.kategori||"").toLowerCase();
      return absenceCats.some(x=>name.includes(x));
    });
    if(hasOrdinariePos && hasAbsence){
      alert("Ordinarie tid kan inte kombineras med VAB/Sjuk/Föräldraledig i samma inmatning.");
      return;
    }

    const rowId = editId || genRowId();

    // vid edit: ta bort alla gamla rader med samma id
    if(editId){
      allData[month] = (allData[month]||[]).filter(r => r._id !== editId);
    }

    // skapa rad per kategori
    cats.forEach((c, idx) => {
      if(!c.kategori) return;
      const row = {
        _id: rowId,
        datum,
        projekt,
        kategori: c.kategori,
        tid: c.tid,
        kortid: idx===0 ? driveVal : 0, // körtid bara på första raden
        beskrivning: note
      };
      allData[month].push(row);
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
    get("dateInput").value="";
    get("projektInput").value="";
    get("driveHoursInput").value="";
    get("noteInput").value="";
    setupCategoryRows();
    get("saveEntryLabel").textContent="Lägg till";
    get("cancelEditBtn").style.display="none";
  }

  // ===== Redigera / Radera =====
  function startEdit(rowId){
    const [y,m] = currentYearMonth();
    const arr = allData[m]||[];
    const bundle = arr.filter(r=>r._id===rowId);
    if(!bundle.length) return;

    editId = rowId;
    const base = bundle[0];

    get("dateInput").value   = base.datum || "";
    get("projektInput").value = base.projekt || "";
    get("driveHoursInput").value = (base.kortid!=null ? String(base.kortid) : "");
    get("noteInput").value   = base.beskrivning || "";

    // bygg upp kat-rader från bundle
    const container = get("catRowsContainer");
    if(!container) return;
    container.innerHTML="";
    bundle.forEach((r, idx) => {
      addCategoryRow(r.kategori || "", r.tid!=null ? String(r.tid) : "");
    });

    get("saveEntryLabel").textContent="Spara";
    get("cancelEditBtn").style.display="inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    const [y,m]=currentYearMonth();
    if(!confirm("Ta bort raden (alla kategorirader i denna inmatning)?")) return;
    allData[m] = (allData[m]||[]).filter(r=>r._id!==rowId);
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
    renderAlarms();
  }

  // ===== Månadsrendering =====
  function renderMonth(){
    const [year, month] = currentYearMonth();
    const tbody = get("monthTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const rows = allData[month]||[];

    const sorted = rows.slice().sort((a,b)=>{
      const ad = (a.datum||"");
      const bd = (b.datum||"");
      if(ad === bd){
        // så att alla med samma _id hamnar ihop
        return (a._id||"").localeCompare(b._id||"");
      }
      return ad.localeCompare(bd);
    });

    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    let lastWeek = null;

    sorted.forEach(r=>{
      if(!r.datum) return;
      const wk = getISOWeek(r.datum);
      if(wk!=null && wk!==lastWeek){
        // sätt vecka-rad
        const wtr = document.createElement("tr");
        wtr.className="week-row";
        wtr.innerHTML = `<td colspan="7">----- v${wk} -----</td>`;
        tbody.appendChild(wtr);
        lastWeek = wk;
      }

      const tr = document.createElement("tr");
      const st = statusMap[r.datum]?.status || "";
      if(st) tr.classList.add("dagstatus--"+st);

      tr.innerHTML = `
        <td>${r.datum||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${r.tid!=null ? r.tid : ""}</td>
        <td>${r.kortid!=null ? r.kortid : ""}</td>
        <td>${(r.beskrivning||"").replace(/\r?\n/g," ")}</td>
        <td style="white-space:nowrap;">
          <button class="icon-table-btn" data-act="edit" data-id="${r._id}" title="Ändra">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="icon-table-btn" data-act="del" data-id="${r._id}" title="Ta bort">
            <i data-lucide="trash-2" class="trash-icon"></i>
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

    if(window.lucide) lucide.createIcons();

    renderMonthSummary(rows, statusMap);
  }

  function renderMonthSummary(rows, statusMap){
    const cell = get("monthSummaryCell");
    if(!cell) return;

    const sum = {
      ordinarie:0,
      kortid:0,
      flextid:0,
      ot_lt2:0,
      ot_gt2:0,
      semester:0,
      atf:0,
      vab:0,
      sjuk:0,
      fl:0,
      trakt:0
    };

    rows.forEach(r=>{
      const name=(r.kategori||"").toLowerCase();
      const h = parseFloat(r.tid)||0;

      if(name.includes("ordinarie")) sum.ordinarie += h;
      if(name.includes("flex"))      sum.flextid += h;
      if(name.includes("övertid") && name.includes("<2")) sum.ot_lt2 += h;
      if(name.includes("övertid") && (name.includes(">2")||name.includes("helg"))) sum.ot_gt2 += h;
      if(name.includes("semest")) sum.semester += h;
      if(name.includes("atf"))    sum.atf += h;
      if(name.includes("vab"))    sum.vab += h;
      if(name.includes("sjuk"))   sum.sjuk += h;
      if(name.includes("föräldral")) sum.fl += h;
      if(name.includes("trakt"))  sum.trakt += 1;
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
      `Sjuk: ${sum.sjuk.toFixed(2)}h | `+
      `FL: ${sum.fl.toFixed(2)}h | `+
      `Trakt: ${sum.trakt} st`;
  }

  // ===== Årsöversikt =====
  function renderYearOverview(){
    const tbody = get("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const monthNames = {
      1:"Januari",2:"Februari",3:"Mars",4:"April",5:"Maj",6:"Juni",
      7:"Juli",8:"Augusti",9:"September",10:"Oktober",11:"November",12:"December"
    };

    for(let m=1;m<=12;m++){
      const arr = allData[m]||[];
      const sum = {
        ordinarie:0,
        kortid:0,
        flextid:0,
        ot_lt2:0,
        ot_gt2:0,
        semester:0,
        atf:0,
        vab:0,
        sjuk:0,
        fl:0,
        trakt:0
      };

      arr.forEach(r=>{
        const n = (r.kategori||"").toLowerCase();
        const h = parseFloat(r.tid)||0;

        if(n.includes("ordinarie")) sum.ordinarie+=h;
        if(n.includes("flex"))      sum.flextid+=h;
        if(n.includes("övertid") && n.includes("<2")) sum.ot_lt2+=h;
        if(n.includes("övertid") && (n.includes(">2")||n.includes("helg"))) sum.ot_gt2+=h;
        if(n.includes("semest")) sum.semester+=h;
        if(n.includes("atf"))    sum.atf+=h;
        if(n.includes("vab"))    sum.vab+=h;
        if(n.includes("sjuk"))   sum.sjuk+=h;
        if(n.includes("föräldral")) sum.fl+=h;
        if(n.includes("trakt"))  sum.trakt+=1;
        sum.kortid += parseFloat(r.kortid)||0;
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m]}</td>
        <td>${sum.ordinarie.toFixed(2)}</td>
        <td>${sum.kortid.toFixed(2)}</td>
        <td>${sum.flextid.toFixed(2)}</td>
        <td>${sum.ot_lt2.toFixed(2)}</td>
        <td>${sum.ot_gt2.toFixed(2)}</td>
        <td>${sum.semester.toFixed(2)}</td>
        <td>${sum.atf.toFixed(2)}</td>
        <td>${sum.vab.toFixed(2)}</td>
        <td>${sum.sjuk.toFixed(2)}</td>
        <td>${sum.fl.toFixed(2)}</td>
        <td>${sum.trakt}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ===== Larm / obalans =====
  function renderAlarms(){
    const listEl = get("alarmList");
    if(!listEl) return;
    listEl.innerHTML = "";

    const [year,month] = currentYearMonth();
    const rows = allData[month]||[];

    if(!window.BalansRegler){
      const li=document.createElement("li");
      li.textContent="Balansregler saknas (balansregler.js ej laddad).";
      listEl.appendChild(li);
      return;
    }

    const statusMap = BalansRegler.buildDayStatusMap(rows, settings, year, month);
    const entries = [];

    Object.keys(statusMap).sort().forEach(ds=>{
      const info = statusMap[ds];
      const s = info.status;
      if(s==="helg" || s==="röddag" || s==="grön") return;
      if(s==="saknas"){
        entries.push({
          date:ds,
          type:"red",
          msg:"Ingen registrering denna dag."
        });
      }else if(s==="orange_under"){
        entries.push({
          date:ds,
          type:"yellow",
          msg:"Under 8h arbetstid denna dag."
        });
      }else if(s==="orange_absence"){
        entries.push({
          date:ds,
          type:"yellow",
          msg:"Frånvaro (t.ex. VAB / Sjuk / FL) denna dag."
        });
      }
    });

    if(!entries.length){
      const li=document.createElement("li");
      li.innerHTML =
        `<span class="alarm-icon alarm-icon--blue"><i data-lucide="check"></i></span>`+
        `<div class="alarm-text"><span class="msg">Inga larm för vald månad.</span></div>`;
      listEl.appendChild(li);
      if(window.lucide) lucide.createIcons();
      return;
    }

    entries.forEach(e=>{
      const li=document.createElement("li");
      const cls = e.type==="red" ? "alarm-icon--red" : "alarm-icon--yellow";
      const icon = e.type==="red" ? "alert-octagon" : "alert-triangle";
      li.innerHTML = `
        <span class="alarm-icon ${cls}"><i data-lucide="${icon}"></i></span>
        <div class="alarm-text">
          <span class="date">${e.date}</span>
          <span class="msg">${e.msg}</span>
        </div>
      `;
      listEl.appendChild(li);
    });

    if(window.lucide) lucide.createIcons();
  }

  // ===== Backup / Import =====
  function manualBackupNow(){
    manualBackup(); // från backup.js
  }

  function onImportFileInputChange(ev){
    const f = ev.target.files[0];
    if(!f) return;
    importBackupFile(f, (payload)=>{
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

  // ===== Clear all =====
  function clearAllDataConfirm(){
    if(typeof window.resetAll === "function"){
      window.resetAll();
      return;
    }
    if(!confirm("Är du säker? Detta raderar ALL din data i appen.")) return;
    allData={};
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
    renderAlarms();
  }
  // koppla till knapp
  const clearBtn = get("clearAllBtn");
  if(clearBtn){
    clearBtn.addEventListener("click", clearAllDataConfirm);
  }

  // ===== Flatten för export =====
  function flattenDataForExportMonth(){
    const [year,month] = currentYearMonth();
    return (allData[month]||[]).slice().sort((a,b)=>a.datum.localeCompare(b.datum));
  }

  function flattenDataFullYear(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=>out.push(r));
    });
    return out;
  }

  // ===== Service Worker =====
  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
        .then(()=>console.log("Service Worker registrerad (v"+APP_VERSION+")"))
        .catch(e=>console.warn("SW fel:",e));
    }
  }

  // Exponera rensa-funktion så backup.js kan hooka in “RADERA ALLT” prompt
  window._tidrapportClearAllInternal = function(){
    allData={};
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
    renderAlarms();
  };

})();