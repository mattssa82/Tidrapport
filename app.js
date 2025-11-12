// Tidrapport v10.22
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION = "10.22";
  const DATA_KEY = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  // State
  let allData = {};   // { "1":[{ _id, datum, kategori, tid, projekt, kortid, beskrivning }], ... }
  let settings = {};
  let editId = null;

  // Kategorier (standard)
  const CATS = [
    "Ordinarie tid",
    "Flextid",
    "ATF-tim",
    "Övertid <2",
    "Övertid >2",
    "ÖT-Helg",
    "Semester",
    "Sjuk",
    "VAB",
    "Föräldraledig",
    "Traktamente"
  ];

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    buildCatRowsUI(true);
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

    // defaults
    if (typeof settings.showRedDays === "undefined") settings.showRedDays = true;
    if (!settings.redDayStdHours) settings.redDayStdHours = 8;

    // UI
    get("companyInput").value     = settings.company || "";
    get("nameInput").value        = settings.name || "";
    get("anstnrInput").value      = settings.emp || "";
    get("showRedDaysChk").checked = !!settings.showRedDays;
    get("autoBackupChk").checked  = !!settings.autoBackup;
    get("redDayStdHours").value   = settings.redDayStdHours;
  }

  function saveSettingsFromUI(){
    settings.company     = get("companyInput").value.trim();
    settings.name        = get("nameInput").value.trim();
    settings.emp         = get("anstnrInput").value.trim();
    settings.showRedDays = get("showRedDaysChk").checked;
    settings.autoBackup  = get("autoBackupChk").checked;
    const rd = parseFloat(get("redDayStdHours").value.replace(",", "."));
    settings.redDayStdHours = !isNaN(rd) ? rd : 8;

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

  // tillåt minus: "  -1.5  " -> -1.5 , annars 0 om blank
  function parseHours(str){
    if (typeof str !== "string") return 0;
    const s = str.replace(",", ".").trim();
    if (s === "") return 0;
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // -----------------------------
  // UI
  // -----------------------------
  function bindUI(){
    // meny
    initMenuToggle();

    // header-länkar öppnar in-place (inte ny flik)
    get("openHelpLink").addEventListener("click", (e)=>{ e.preventDefault(); window.location.href="help.html"; });
    get("openSearchLink").addEventListener("click",(e)=>{ e.preventDefault(); window.location.href="search.html"; });

    // inmatning
    get("addCatBtn").addEventListener("click", ()=> addCatRow());
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

    // backup / import / export
    get("manualBackupBtn").addEventListener("click", manualBackupNow);
    get("manualBackupBtn2").addEventListener("click", manualBackupNow);
    get("importFileInput").addEventListener("change", onImportFileInputChange);

    get("exportCsvBtn").addEventListener("click", ()=>{
      exportCSVImpl( flattenDataForExportMonth(), settings, get("yearSelect").value, get("monthSelect").value );
    });
    get("exportPdfBtn").addEventListener("click", ()=>{
      exportPDFImpl( flattenDataForExportMonth(), settings, get("yearSelect").value, get("monthSelect").value );
    });
    get("exportYearBtn").addEventListener("click", ()=>{
      exportYearImpl( flattenDataFullYear(), settings );
    });

    // sök-knapp i menyn (öppna i samma sida)
    get("openSearchBtn").addEventListener("click", ()=>{
      window.location.href="search.html";
    });

    // rensa allt
    get("clearAllBtn").addEventListener("click", clearAllDataConfirm);

    // inställningar
    get("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);

    // periodval
    get("yearSelect").addEventListener("change", ()=>{
      renderMonth(); renderYearOverview(); renderAlarms();
    });
    get("monthSelect").addEventListener("change", ()=>{
      renderMonth(); renderAlarms();
    });

    // klick på datumfält ska inte “låsa”, men vi accepterar valfritt textdatum (YYYY-MM-DD)
    const di = get("dateInput");
    di.addEventListener("blur", ()=>{ // normalisera ev. datum
      const s = (di.value||"").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return;
      // inget tvång
    });
  }

  // meny toggle
  function initMenuToggle(){
    const panel = get("sidePanel");
    const btn   = get("menuToggleBtn");

    const close = ()=>{
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden","true");
      btn.setAttribute("aria-expanded","false");
    };
    const open = ()=>{
      panel.classList.add("open");
      panel.setAttribute("aria-hidden","false");
      btn.setAttribute("aria-expanded","true");
    };

    btn.addEventListener("click", ()=>{
      if (panel.classList.contains("open")) close(); else open();
    });

    // stäng när man klickar utanför
    document.addEventListener("click", e=>{
      if (!panel.contains(e.target) && !btn.contains(e.target)) close();
    });
  }

  // Bygg kategori-rader UI (minst 1 rad)
  function buildCatRowsUI(initial=false){
    const wrap = get("catsWrap");
    wrap.innerHTML = "";
    addCatRow(true); // huvudrad
    if (!initial && window.lucide) lucide.createIcons();
  }

  function addCatRow(isMain=false){
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `
      <select class="catSel">
        ${CATS.map(c=>`<option value="${c}">${c}</option>`).join("")}
      </select>
      <input class="num catHrs" type="text" inputmode="decimal" placeholder="h" />
      ${isMain ? `<span class="muted" style="color:var(--muted);font-size:.8rem;">(Huvudrad)</span>` :
      `<button class="rem" title="Ta bort"><i data-lucide="minus-circle"></i></button>`}
    `;
    get("catsWrap").appendChild(row);

    // ta bort-knapp
    const rem = row.querySelector(".rem");
    if (rem){
      rem.addEventListener("click", ()=>{ row.remove(); });
    }
    if (window.lucide) lucide.createIcons();
  }

  // -----------------------------
  // År / Månad
  // -----------------------------
  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");

    const yearsSeen = new Set();
    const curY = new Date().getFullYear();
    yearsSeen.add(curY);

    Object.keys(allData).forEach(mKey=>{
      (allData[mKey]||[]).forEach(r=>{
        if (!r.datum) return;
        const y = (new Date(r.datum)).getFullYear();
        if (!isNaN(y)) yearsSeen.add(y);
      });
    });

    const yearsSorted = [...yearsSeen].sort((a,b)=>a-b);
    ySel.innerHTML = yearsSorted.map(y=>`<option value="${y}" ${y===curY?'selected':''}>${y}</option>`).join("");

    const monthNames = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
    const curM = new Date().getMonth()+1;
    mSel.innerHTML = monthNames.map((name,i)=>`<option value="${i+1}" ${i+1===curM?'selected':''}>${name}</option>`).join("");
  }

  // -----------------------------
  // Regler för kombinationer
  // -----------------------------
  const NEGATIVE_TO_ORD = ["Flextid","ATF-tim","Övertid <2","Övertid >2","ÖT-Helg","Semester"]; // negativa blir +Ordinarie
  const ABSENCE = ["VAB","Sjuk","Föräldraledig"];
  function isNegativeCat(name){
    return NEGATIVE_TO_ORD.some(x=>x.toLowerCase()===name.toLowerCase());
  }
  function isAbsence(name){
    return ABSENCE.some(x=>x.toLowerCase()===name.toLowerCase());
  }

  // Varningstexter (popup) vid otillåtna kombinationer
  function popupWarn(msg){
    alert(msg);
  }

  // -----------------------------
  // Lägg till / Spara rad(er)
  // -----------------------------
  function onSaveEntry(){
    const [year,month] = currentYearMonth();
    if (!allData[month]) allData[month]=[];

    const datum = (get("dateInput").value||"").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)){
      alert("Ogiltigt datum (format: YYYY-MM-DD).");
      return;
    }

    const projektVal  = (get("projektInput").value||"").trim();
    const driveHrsVal = parseHours(get("driveHoursInput").value||"");
    const noteVal     = (get("noteInput").value||"").trim();

    // Läs kategori-rader
    const rows = [];
    const rowsEls = Array.from(get("catsWrap").querySelectorAll(".cat-row"));
    if (!rowsEls.length){
      popupWarn("Lägg till minst en kategori-rad.");
      return;
    }

    // samla råinmatning
    rowsEls.forEach((el, idx)=>{
      const cat = el.querySelector(".catSel").value;
      const hrs = parseHours(el.querySelector(".catHrs").value||"");
      rows.push({cat, hrs});
    });

    // Regler (i samma inmatning):
    // 1) Ordinarie tid får inte kombineras med negativa timmar (Flextid/ATF/ÖT*/Semester)
    const hasOrd = rows.some(r=>r.cat==="Ordinarie tid" && r.hrs>0);
    const hasNeg = rows.some(r=> isNegativeCat(r.cat) && r.hrs<0 );
    if (hasOrd && hasNeg){
      popupWarn("Ordinarie tid kan inte kombineras med negativa timmar (Flex, ATF, ÖT, Semester) i samma inmatning.\nLägg dem som separata inmatningar.");
      return;
    }

    // 2) Ordinarie tid får inte kombineras med frånvaro (VAB/Sjuk/FL)
    const hasAbs = rows.some(r=> isAbsence(r.cat) && r.hrs !== 0);
    if (hasOrd && hasAbs){
      popupWarn("Ordinarie tid kan inte kombineras med VAB/Sjuk/Föräldraledig i samma inmatning.");
      return;
    }

    // 3) Traktamente räknas som kategori med 0h (räknas som 1 st)
    rows.forEach(r=>{
      if (r.cat==="Traktamente") r.hrs = 0;
    });

    // 4) Förhindra dubblett av samma kategori inom samma inmatning
    const seen = new Set();
    for (const r of rows){
      const key = r.cat.toLowerCase();
      if (seen.has(key)){
        popupWarn(`Du har valt kategorin "${r.cat}" mer än en gång i samma inmatning. Ta bort dubbletten.`);
        return;
      }
      seen.add(key);
    }

    // Skriv ut poster
    const rowId = editId || genRowId();
    if (editId){
      allData[month] = allData[month].filter(r => r._id !== editId);
    }

    // Endast första raden får bära anteckningen; körtid läggs på den första kategoriposten
    rows.forEach((r, idx)=>{
      allData[month].push({
        _id: rowId,
        datum,
        kategori: r.cat,
        tid: r.hrs,
        projekt: projektVal,
        kortid: idx===0 ? driveHrsVal : 0,
        beskrivning: idx===0 ? noteVal : ""
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
    get("saveEntryLabel").textContent="Lägg till";
    get("cancelEditBtn").style.display="none";
    buildCatRowsUI(); // återställ en huvudrad
  }

  // Redigera / Ta bort
  function startEdit(rowId){
    const [y,m]=currentYearMonth();
    const arr = allData[m]||[];
    const bundle = arr.filter(r=>r._id===rowId);
    if (!bundle.length) return;

    editId = rowId;
    const base = bundle[0];

    get("dateInput").value       = base.datum || "";
    get("projektInput").value    = base.projekt || "";
    get("driveHoursInput").value = base.kortid || "";
    get("noteInput").value       = base.beskrivning || "";

    buildCatRowsUI();
    const wrap = get("catsWrap");
    // första tre in i UI, men här speglar vi alla
    wrap.innerHTML = "";
    bundle.forEach((b, idx)=>{
      const row = document.createElement("div");
      row.className="cat-row";
      row.innerHTML = `
        <select class="catSel">${CATS.map(c=>`<option value="${c}" ${c===b.kategori?'selected':''}>${c}</option>`).join("")}</select>
        <input class="num catHrs" type="text" inputmode="decimal" value="${b.tid||0}" />
        ${idx===0? `<span class="muted" style="color:var(--muted);font-size:.8rem;">(Huvudrad)</span>` : `<button class="rem" title="Ta bort"><i data-lucide="minus-circle"></i></button>`}
      `;
      wrap.appendChild(row);
      const rem = row.querySelector(".rem");
      if (rem) rem.addEventListener("click", ()=> row.remove());
    });

    get("saveEntryLabel").textContent="Spara";
    get("cancelEditBtn").style.display="inline-flex";
    if (window.lucide) lucide.createIcons();
    window.scrollTo({top:0,behavior:"smooth"});
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
  // Render månad
  // -----------------------------
  function renderMonth(){
    const [year, month] = currentYearMonth();
    const tbody = get("monthTableBody");
    tbody.innerHTML="";

    const rows = allData[month]||[];
    const sorted = rows.slice().sort((a,b)=>a.datum.localeCompare(b.datum));

    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(sorted, settings, year, month)
      : {};

    sorted.forEach(r=>{
      const tr=document.createElement("tr");
      const st = statusMap[r.datum]?.status || "";
      if (st) tr.classList.add("dagstatus--"+st);

      tr.innerHTML = `
        <td>${r.datum||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${fmtNum(r.tid)}</td>
        <td>${fmtNum(r.kortid)}</td>
        <td>${(r.beskrivning||"").replace(/\r?\n/g," ")}</td>
        <td style="white-space:nowrap;">
          <button class="icon-table-btn" data-act="edit" data-id="${r._id}" title="Ändra"><i data-lucide="edit-3"></i></button>
          <button class="icon-table-btn" data-act="del" data-id="${r._id}" title="Ta bort" style="color:var(--danger)"><i data-lucide="trash-2"></i></button>
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

    renderMonthSummary(rows, statusMap, year, month);
  }

  function fmtNum(n){
    const v = parseFloat(n)||0;
    return (Math.round(v*100)/100).toString().replace(".", ",");
  }

  function renderMonthSummary(rows, statusMap, year, month){
    const cell = get("monthSummaryCell");
    if(!cell) return;

    const sum={
      ordinarie:0, flextid:0, ot_lt2:0, ot_gt2:0, ot_helg:0,
      semester:0, atf:0, vab:0, sjuk:0, fl:0,
      trakt:0, kortid:0
    };

    rows.forEach(r=>{
      const n=(r.kategori||"").toLowerCase();
      const h=parseFloat(r.tid)||0;
      if(n.includes("ordinarie")) sum.ordinarie+=h;
      if(n.includes("flex")) sum.flextid+=h;
      if(n.includes("övertid") && n.includes("<2")) sum.ot_lt2+=h;
      if(n.includes("övertid") && n.includes(">2")) sum.ot_gt2+=h;
      if(n.includes("helg")) sum.ot_helg+=h;
      if(n.includes("semest")) sum.semester+=h;
      if(n.includes("atf")) sum.atf+=h;
      if(n.includes("vab")) sum.vab+=h;
      if(n.includes("sjuk")) sum.sjuk+=h;
      if(n.includes("föräldra")) sum.fl+=h;
      if(n.includes("trakt")) sum.trakt+=1;
      sum.kortid += parseFloat(r.kortid)||0;
    });

    cell.textContent =
      `Ordinarie: ${fmtNum(sum.ordinarie)}h | `+
      `Körtid: ${fmtNum(sum.kortid)}h | `+
      `Flex: ${fmtNum(sum.flextid)}h | `+
      `ÖT<2: ${fmtNum(sum.ot_lt2)}h | `+
      `ÖT>2: ${fmtNum(sum.ot_gt2)}h | `+
      `ÖT-Helg: ${fmtNum(sum.ot_helg)}h | `+
      `Semester: ${fmtNum(sum.semester)}h | `+
      `ATF: ${fmtNum(sum.atf)}h | `+
      `VAB: ${fmtNum(sum.vab)}h | `+
      `Sjuk: ${fmtNum(sum.sjuk)}h | `+
      `FL: ${fmtNum(sum.fl)}h | `+
      `Trakt: ${sum.trakt} st`;
  }

  // -----------------------------
  // Årsöversikt
  // -----------------------------
  function renderYearOverview(){
    const tbody=get("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const monthNames={
      1:"Januari",2:"Februari",3:"Mars",4:"April",5:"Maj",6:"Juni",
      7:"Juli",8:"Augusti",9:"September",10:"Oktober",11:"November",12:"December"
    };

    for(let m=1;m<=12;m++){
      const arr = allData[m]||[];
      const sum={
        ordinarie:0, flextid:0, ot1:0, ot2:0, othel:0,
        semester:0, atf:0, vab:0, sjuk:0, fl:0, trakt:0, kortid:0
      };

      arr.forEach(r=>{
        const n=(r.kategori||"").toLowerCase();
        const h=parseFloat(r.tid)||0;

        if(n.includes("ordinarie")) sum.ordinarie+=h;
        if(n.includes("flex")) sum.flextid+=h;
        if(n.includes("övertid") && n.includes("<2")) sum.ot1+=h;
        if(n.includes("övertid") && n.includes(">2")) sum.ot2+=h;
        if(n.includes("helg")) sum.othel+=h;
        if(n.includes("semest")) sum.semester+=h;
        if(n.includes("atf")) sum.atf+=h;
        if(n.includes("vab")) sum.vab+=h;
        if(n.includes("sjuk")) sum.sjuk+=h;
        if(n.includes("föräldra")) sum.fl+=h;
        if(n.includes("trakt")) sum.trakt+=1;

        sum.kortid += parseFloat(r.kortid)||0;
      });

      const tr=document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m]}</td>
        <td>${fmtNum(sum.ordinarie)}</td>
        <td>${fmtNum(sum.kortid)}</td>
        <td>${fmtNum(sum.flextid)}</td>
        <td>${fmtNum(sum.ot1)}</td>
        <td>${fmtNum(sum.ot2)}</td>
        <td>${fmtNum(sum.othel)}</td>
        <td>${fmtNum(sum.semester)}</td>
        <td>${fmtNum(sum.atf)}</td>
        <td>${fmtNum(sum.vab)}</td>
        <td>${fmtNum(sum.sjuk)}</td>
        <td>${fmtNum(sum.fl)}</td>
        <td>${sum.trakt}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // -----------------------------
  // Larm / Obalans
  // -----------------------------
  function renderAlarms(){
    const [year,month] = currentYearMonth();
    const rows = allData[month]||[];
    const map = BalansRegler.buildDayStatusMap(rows, settings, year, month);
    const tbody = get("alarmsTbody");
    if (!tbody) return;
    tbody.innerHTML="";

    // Visa ENDAST dagar som “varit” (<= idag om samma månad/år, annars alla historiska i månaden)
    const now = new Date();
    const isThisMonth = (now.getFullYear()===year && (now.getMonth()+1)===month);

    const daysInMonth=new Date(year,month,0).getDate();
    for (let d=1; d<=daysInMonth; d++){
      const ds = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const state = map[ds];
      if (!state) continue;

      if (isThisMonth){
        const cur = new Date(`${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}T23:59:59`);
        if (cur.getTime() > now.getTime()) continue; // framtid -> visa ej larm
      }

      // helg/röddag ska ej larma
      if (state.status==="helg" || state.status==="röddag") continue;
      if (state.status==="grön") continue; // OK visas ej

      let badgeClass="warn"; let label="⚠️ Under 8h";
      if (state.status==="saknas"){ badgeClass="err"; label="🔴 Ingen registrering"; }
      if (state.status==="orange_absence"){ badgeClass="warn"; label="🟡 Frånvaro"; }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${ds}</td>
        <td><span class="badge ${badgeClass}">${label}</span></td>
        <td>${fmtNum(state.totalHours)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // -----------------------------
  // Backup / Import
  // -----------------------------
  function manualBackupNow(){ manualBackup(); }

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
    if(!confirm("Är du säker? Detta raderar ALL din data i appen.")) return;
    allData={};
    localStorage.setItem(DATA_KEY,JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth(); renderYearOverview(); renderAlarms();
  }

  // -----------------------------
  // Hjälp för export
  // -----------------------------
  function flattenDataForExportMonth(){
    const [year,month]=currentYearMonth();
    const list = (allData[month]||[]).slice().sort((a,b)=>a.datum.localeCompare(b.datum));
    return list;
  }

  function flattenDataFullYear(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=> out.push(r));
    });
    return out;
  }

  // -----------------------------
  // Service Worker
  // -----------------------------
  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
      .then(()=>console.log("SW registrerad v"+APP_VERSION))
      .catch(e=>console.warn("SW fel:",e));
    }
  }

})();