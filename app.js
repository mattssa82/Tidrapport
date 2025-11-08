// app.js
// Tidrapport v10.16
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION = "10.16";
  const DATA_KEY = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  let allData = {};      // { "10":[{_id,datum,kategori,tid,projekt,kortid,beskrivning}, ...], ... }
  let settings = {
    autoBackup:false,
    redDayHours:8
  };

  let editId = null;     // aktivt _id-bundle för redigering

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    populateCategorySelects();
    renderMonth();
    renderYearOverview();
    registerServiceWorker();
    if(window.lucide){ lucide.createIcons(); }
    console.log("Tidrapport v"+APP_VERSION+" klar ✅");
  });

  // ---------- Helpers ----------
  function get(id){ return document.getElementById(id); }

  function genRowId(){
    return "r_" + Date.now().toString(36) + "_" + Math.floor(Math.random()*1e6).toString(36);
  }

  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10) || (new Date()).getFullYear();
    const m = parseInt(get("monthSelect").value,10) || (new Date()).getMonth()+1;
    return [y,m];
  }

  function isAbsenceCat(name){
    const c = (name||"").toLowerCase();
    return c.includes("vab") || c.includes("sjuk") || c.includes("föräldra");
  }

  function isBankCat(name){
    const c = (name||"").toLowerCase();
    return (
      c.includes("flextid") ||
      c.includes("övertid") ||
      c.includes("öt ") ||
      c.includes("öt-") ||
      c.includes("semester") ||
      c.includes("atf")
    );
  }

  // ---------- Load / Save ----------

  function loadData(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
      if(!allData || typeof allData!=="object") allData = {};
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
      const parsed = raw ? JSON.parse(raw) : {};
      if(parsed && typeof parsed==="object"){
        settings = Object.assign({
          autoBackup:false,
          redDayHours:8
        }, parsed);
      }
    }catch{
      settings = { autoBackup:false, redDayHours:8 };
    }

    if(get("companyInput"))  get("companyInput").value = settings.company || "";
    if(get("nameInput"))     get("nameInput").value = settings.name || "";
    if(get("anstnrInput"))   get("anstnrInput").value = settings.emp || "";
    if(get("redDayHoursInput")) get("redDayHoursInput").value = settings.redDayHours || 8;

    const tgl = get("autoBackupToggle");
    if(tgl){
      tgl.classList.toggle("on", !!settings.autoBackup);
    }
  }

  function saveSettingsFromUI(){
    settings.company = (get("companyInput").value||"").trim();
    settings.name    = (get("nameInput").value||"").trim();
    settings.emp     = (get("anstnrInput").value||"").trim();
    const redH = parseFloat(get("redDayHoursInput").value.replace(",","."));
    settings.redDayHours = !isNaN(redH) && redH>0 ? redH : 8;

    settings.autoBackup = get("autoBackupToggle").classList.contains("on");

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    renderMonth();
    renderYearOverview();
    autoLocalBackup("settings-change");
    alert("Inställningar sparade.");
  }

  // ---------- UI bind ----------

  function bindUI(){
    // meny toggle (mobil)
    initMenuToggle();

    // form knappar
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

    // backup / import / export
    get("manualBackupBtn").addEventListener("click", manualBackupNow);
    get("manualBackupBtn2").addEventListener("click", manualBackupNow);

    get("importFileInput").addEventListener("change", onImportFileInputChange);

    get("exportCsvBtn").addEventListener("click", () => {
      exportCSVImpl(flattenDataForExportMonth(), settings,
        get("yearSelect").value, get("monthSelect").value);
    });
    get("exportPdfBtn").addEventListener("click", () => {
      exportPDFImpl(flattenDataForExportMonth(), settings,
        get("yearSelect").value, get("monthSelect").value);
    });
    get("exportYearBtn").addEventListener("click", () => {
      exportYearImpl(flattenDataFullYear(), settings);
    });

    // clear all
    get("clearAllBtn").addEventListener("click", clearAllDataConfirm);

    // settings
    get("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);
    const tgl = get("autoBackupToggle");
    if(tgl){
      tgl.addEventListener("click", () => {
        tgl.classList.toggle("on");
      });
    }

    // periodval
    get("yearSelect").addEventListener("change", () => {
      renderMonth();
      renderYearOverview();
    });
    get("monthSelect").addEventListener("change", () => {
      renderMonth();
    });

    // datum: klick var som helst => picker (stöd)
    const di = get("dateInput");
    if(di && di.showPicker){
      di.addEventListener("click", e => e.target.showPicker());
    }
  }

  function initMenuToggle(){
    const panel = get("sidePanel");
    const btn = get("menuToggleBtn");
    if(!panel || !btn) return;

    const mqMobile = window.matchMedia("(max-width: 900px)");

    function syncDesktop(){
      if(!mqMobile.matches){
        // desktop: panel alltid synlig, ingen overlay
        panel.classList.remove("open");
        panel.style.transform = "none";
        panel.setAttribute("aria-hidden","false");
        btn.setAttribute("aria-expanded","false");
      }else{
        // mobil utgångsläge: stängd
        panel.style.transform = "";
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden","true");
        btn.setAttribute("aria-expanded","false");
      }
    }
    syncDesktop();
    mqMobile.addEventListener("change", syncDesktop);

    btn.addEventListener("click", () => {
      if(!mqMobile.matches) return; // på desktop gör inte menyn något
      const willOpen = !panel.classList.contains("open");
      panel.classList.toggle("open", willOpen);
      panel.setAttribute("aria-hidden", willOpen ? "false" : "true");
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
      if(!mqMobile.matches) return;
      if(!panel.contains(e.target) && !btn.contains(e.target)){
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden","true");
        btn.setAttribute("aria-expanded","false");
      }
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
      "Föräldraledig",
      "Traktamente"
    ];

    const main = get("catMainSelect");
    main.innerHTML = CATS.map(c=>`<option value="${c}">${c}</option>`).join("");

    document.querySelectorAll(".catExtraSelect").forEach(sel => {
      sel.innerHTML =
        `<option value="">(ingen)</option>` +
        CATS.map(c=>`<option value="${c}">${c}</option>`).join("");
    });
  }

  // ---------- År / Månad ----------

  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");
    if(!ySel || !mSel) return;

    const years = new Set();
    const now = new Date();
    const curY = now.getFullYear();
    years.add(curY);

    Object.keys(allData).forEach(mKey => {
      (allData[mKey]||[]).forEach(r => {
        if(!r.datum) return;
        const y = (new Date(r.datum)).getFullYear();
        if(!isNaN(y)) years.add(y);
      });
    });

    const sortedY = [...years].sort((a,b)=>a-b);
    ySel.innerHTML = sortedY.map(y =>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];
    const curM = now.getMonth()+1;
    mSel.innerHTML = monthNames.map((name,i) =>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  // ---------- Spara / Lägg till ----------

  function onSaveEntry(){
    const datum = (get("dateInput").value||"").trim();
    if(!datum){
      alert("Välj datum.");
      return;
    }

    const projekt = (get("projektInput").value||"").trim();

    let drive = parseFloat((get("driveHoursInput").value||"").replace(",","."));
    if(isNaN(drive)) drive = 0;

    // Bygg kategoripaket
    const cats = [];

    const mainCat = (get("catMainSelect").value||"").trim();
    let mainH = (get("catMainHours").value||"").toString().replace(",",".");
    mainH = mainH === "" ? NaN : parseFloat(mainH);
    if(mainCat){
      if(isNaN(mainH)){
        alert("Fyll i timmar för Kategori 1.");
        return;
      }
      cats.push({cat:mainCat, h:mainH});
    }else{
      alert("Kategori 1 måste vara vald.");
      return;
    }

    document.querySelectorAll(".catExtraSelect").forEach(sel => {
      const idx = sel.dataset.extraIndex;
      const inp = document.querySelector(`.catExtraHours[data-extra-index="${idx}"]`);
      const c = (sel.value||"").trim();
      let hRaw = (inp.value||"").toString().replace(",",".");
      const hasVal = c || hRaw !== "";
      if(!hasVal) return;
      if(!c){
        alert("Välj kategori för extra rad.");
        return;
      }
      const h = hRaw === "" ? NaN : parseFloat(hRaw);
      if(isNaN(h)){
        alert("Ogiltiga timmar i extra kategori.");
        return;
      }
      cats.push({cat:c, h});
    });

    if(!cats.length){
      alert("Ingen kategori angiven.");
      return;
    }

    // Regler: inga dubbletter
    const seen = new Set();
    for(const c of cats){
      const key = c.cat.toLowerCase();
      if(seen.has(key)){
        alert("Samma kategori får inte väljas flera gånger i samma inmatning.");
        return;
      }
      seen.add(key);
    }

    // Regler: Ordinarie + frånvaro får inte blandas
    const hasOrd = cats.some(c=>c.cat.toLowerCase().includes("ordinarie"));
    const hasAbs = cats.some(c=>isAbsenceCat(c.cat));
    if(hasOrd && hasAbs){
      alert("Ordinarie tid kan inte kombineras med VAB/Sjuk/Föräldraledig i samma inmatning.\nLägg dem som separata rader istället.");
      return;
    }

    // Regler: Ordinarie får inte kombineras med negativa banktimmar i samma inmatning
    if(hasOrd){
      const hasNegBank = cats.some(c=>c.h < 0 && isBankCat(c.cat));
      if(hasNegBank){
        alert("Ordinarie tid kan inte kombineras med minus-timmar (Flex/ATF/ÖT/Semester) i samma inmatning.\nGör dem som egen rad.");
        return;
      }
    }

    // Traktamente: får ha tid = 0, påverkar ej timmar
    // (ingen extra regel här – logiken ligger i balans/export)

    const note = (get("noteInput").value||"").trim();
    const [year, month] = currentYearMonth();
    if(!allData[month]) allData[month] = [];

    const rowId = editId || genRowId();

    // Ta bort befintligt paket om vi sparar om
    if(editId){
      allData[month] = (allData[month]||[]).filter(r => r._id !== editId);
    }

    // Skriv en rad per kategori; första får körtid + anteckning
    cats.forEach((c, index) => {
      allData[month].push({
        _id: rowId,
        datum,
        projekt,
        kategori: c.cat,
        tid: c.h,
        kortid: index===0 ? drive : 0,
        beskrivning: index===0 ? note : ""
      });
    });

    saveData(editId ? "edit-entry" : "add-entry");
    clearForm();
    renderMonth();
    renderYearOverview();
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

    // reset selects
    populateCategorySelects();
    document.querySelectorAll(".catExtraHours").forEach(i => i.value = "");
  }

  function cancelEdit(){
    clearForm();
  }

  // ---------- Edit / Delete ----------

  function startEdit(rowId){
    const [year,month] = currentYearMonth();
    const arr = allData[month] || [];
    const bundle = arr.filter(r => r._id === rowId);
    if(!bundle.length) return;

    editId = rowId;

    // Sortera inom paketet stabilt
    bundle.sort((a,b)=>{
      const ak=(a.kategori||"").toLowerCase();
      const bk=(b.kategori||"").toLowerCase();
      return ak.localeCompare(bk);
    });

    const base = bundle[0];
    get("dateInput").value = base.datum || "";
    get("projektInput").value = base.projekt || "";
    get("driveHoursInput").value = base.kortid || "";
    get("noteInput").value = base.beskrivning || "";

    // Fördela upp till 3 kategorier tillbaka
    populateCategorySelects();

    const slots = [
      {sel:get("catMainSelect"), inp:get("catMainHours")},
      {
        sel:document.querySelector('.catExtraSelect[data-extra-index="1"]'),
        inp:document.querySelector('.catExtraHours[data-extra-index="1"]')
      },
      {
        sel:document.querySelector('.catExtraSelect[data-extra-index="2"]'),
        inp:document.querySelector('.catExtraHours[data-extra-index="2"]')
      }
    ];

    bundle.slice(0,3).forEach((r,i)=>{
      if(slots[i].sel){
        slots[i].sel.value = r.kategori || "";
      }
      if(slots[i].inp){
        slots[i].inp.value = (r.tid !== undefined ? r.tid : "");
      }
    });

    get("saveEntryLabel").textContent = "Spara";
    get("cancelEditBtn").style.display = "inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    const [year,month] = currentYearMonth();
    if(!confirm("Ta bort inmatningen (alla rader med samma paket)?")) return;
    allData[month] = (allData[month]||[]).filter(r => r._id !== rowId);
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
  }

  // ---------- Render månad ----------

  function renderMonth(){
    const [year,month] = currentYearMonth();
    const tbody = get("monthTableBody");
    const sumCell = get("monthSummaryCell");
    if(!tbody || !sumCell) return;

    tbody.innerHTML = "";

    const rows = (allData[month]||[]).slice()
      .filter(r => !!r.datum)
      .sort((a,b)=>{
        const da = a.datum.localeCompare(b.datum);
        if(da!==0) return da;
        if(a._id < b._id) return -1;
        if(a._id > b._id) return 1;
        return (a.kategori||"").localeCompare((b.kategori||""));
      });

    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    const noted = new Set(); // för att bara visa körtid/anteckning på första raden per _id

    rows.forEach(r => {
      const tr = document.createElement("tr");
      const st = statusMap[r.datum]?.status;
      if(st) tr.classList.add("dagstatus--"+st);

      const firstOfBundle = !noted.has(r._id);
      if(firstOfBundle) noted.add(r._id);

      tr.innerHTML = `
        <td>${r.datum || ""}</td>
        <td>${r.projekt || ""}</td>
        <td>${r.kategori || ""}</td>
        <td>${(r.tid ?? "").toString()}</td>
        <td>${firstOfBundle ? ((r.kortid ?? 0) || "") : ""}</td>
        <td>${firstOfBundle ? ((r.beskrivning||"").replace(/\r?\n/g," ")) : ""}</td>
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
    tbody.querySelectorAll("button[data-act='edit']").forEach(btn=>{
      btn.addEventListener("click", ()=>startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn=>{
      btn.addEventListener("click", ()=>deleteRow(btn.dataset.id));
    });

    if(window.lucide){ lucide.createIcons(); }

    renderMonthSummary(rows, statusMap);
    renderAlertsForMonth(statusMap);
  }

  function renderMonthSummary(rows, statusMap){
    const cell = get("monthSummaryCell");
    if(!cell) return;

    const sum = {
      ordinarie:0,
      kortid:0,
      flextid:0,
      ot1:0,
      ot2:0,
      otHelg:0,
      semester:0,
      atf:0,
      vab:0,
      sjuk:0,
      fl:0,
      trakt:0
    };

    rows.forEach(r => {
      const name = (r.kategori||"").toLowerCase();
      const h = parseFloat(r.tid)||0;
      const kort = parseFloat(r.kortid)||0;

      // ordinarie direkt
      if(name.includes("ordinarie")) sum.ordinarie += h;

      // bank-kategorier påverkar både egna fält och ev. ordinarie vid minus
      if(name.includes("flex")){
        sum.flextid += h;
        if(h<0) sum.ordinarie += Math.abs(h);
      }
      if(name.includes("övertid") && name.includes("<2")){
        sum.ot1 += h;
        if(h<0) sum.ordinarie += Math.abs(h);
      }
      if(name.includes("övertid") && name.includes(">2")){
        sum.ot2 += h;
        if(h<0) sum.ordinarie += Math.abs(h);
      }
      if(name.includes("övertid") && name.includes("helg")){
        sum.otHelg += h;
        if(h<0) sum.ordinarie += Math.abs(h);
      }
      if(name.includes("semester")){
        sum.semester += h;
        if(h<0) sum.ordinarie += Math.abs(h);
      }
      if(name.includes("atf")){
        sum.atf += h;
        if(h<0) sum.ordinarie += Math.abs(h);
      }

      if(name.includes("vab")) sum.vab += h;
      if(name.includes("sjuk")) sum.sjuk += h;
      if(name.includes("föräldra")) sum.fl += h;

      if(name.includes("trakt")) sum.trakt += 1;

      sum.kortid += kort;
    });

    cell.textContent =
      `Ordinarie: ${sum.ordinarie.toFixed(2)} h | `+
      `Körtid: ${sum.kortid.toFixed(2)} h | `+
      `Flex: ${sum.flextid.toFixed(2)} h | `+
      `ÖT<2: ${sum.ot1.toFixed(2)} h | `+
      `ÖT>2: ${sum.ot2.toFixed(2)} h | `+
      `ÖT Helg: ${sum.otHelg.toFixed(2)} h | `+
      `Semester: ${sum.semester.toFixed(2)} h | `+
      `ATF: ${sum.atf.toFixed(2)} h | `+
      `VAB: ${sum.vab.toFixed(2)} h | `+
      `Sjuk: ${sum.sjuk.toFixed(2)} h | `+
      `FL: ${sum.fl.toFixed(2)} h | `+
      `Trakt: ${sum.trakt} st`;
  }

  // ---------- Larm / Obalans ----------

  function renderAlertsForMonth(statusMap){
    const alertSection = get("alertSection");
    const list = get("alertList");
    if(!alertSection || !list) return;

    const entries = [];

    const [year,month] = currentYearMonth();
    const now = new Date();
    const todayStr = now.toISOString().slice(0,10);

    Object.keys(statusMap||{}).forEach(dateStr => {
      const st = statusMap[dateStr];
      // visa bara för dagar som redan "varit"
      if(dateStr >= todayStr) return;

      if(st.status === "saknas"){
        entries.push(`🔴 ${dateStr}: Ingen registrering.`);
      }else if(st.status === "orange_under"){
        entries.push(`⚠️ ${dateStr}: Under 8h.`);
      }else if(st.status === "orange_absence"){
        entries.push(`ℹ️ ${dateStr}: Frånvaro (t.ex. VAB/Sjuk/FL).`);
      }
    });

    list.innerHTML = "";
    if(!entries.length){
      alertSection.style.display = "none";
      return;
    }

    entries.forEach(t=>{
      const li=document.createElement("li");
      li.textContent = t;
      list.appendChild(li);
    });

    alertSection.style.display = "block";
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
      const arr = allData[m] || [];
      const S = {
        ord:0,
        kort:0,
        flex:0,
        ot1:0,
        ot2:0,
        otHelg:0,
        sem:0,
        atf:0,
        vab:0,
        sjuk:0,
        fl:0,
        trakt:0
      };

      arr.forEach(r=>{
        if(!r.datum) return;
        const name = (r.kategori||"").toLowerCase();
        const h = parseFloat(r.tid)||0;
        const kort = parseFloat(r.kortid)||0;

        if(name.includes("ordinarie")) S.ord += h;

        if(name.includes("flex")){
          S.flex += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("övertid") && name.includes("<2")){
          S.ot1 += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("övertid") && name.includes(">2")){
          S.ot2 += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("övertid") && name.includes("helg")){
          S.otHelg += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("semester")){
          S.sem += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("atf")){
          S.atf += h;
          if(h<0) S.ord += Math.abs(h);
        }

        if(name.includes("vab")) S.vab += h;
        if(name.includes("sjuk")) S.sjuk += h;
        if(name.includes("föräldra")) S.fl += h;
        if(name.includes("trakt")) S.trakt += 1;

        S.kort += kort;
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m-1]}</td>
        <td>${S.ord.toFixed(2)}</td>
        <td>${S.kort.toFixed(2)}</td>
        <td>${S.flex.toFixed(2)}</td>
        <td>${S.ot1.toFixed(2)}</td>
        <td>${S.ot2.toFixed(2)}</td>
        <td>${S.otHelg.toFixed(2)}</td>
        <td>${S.sem.toFixed(2)}</td>
        <td>${S.atf.toFixed(2)}</td>
        <td>${S.vab.toFixed(2)}</td>
        <td>${S.sjuk.toFixed(2)}</td>
        <td>${S.fl.toFixed(2)}</td>
        <td>${S.trakt}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ---------- Export helpers ----------

  function flattenDataForExportMonth(){
    const [year,month] = currentYearMonth();
    return (allData[month]||[])
      .slice()
      .sort((a,b)=>a.datum.localeCompare(b.datum));
  }

  function flattenDataFullYear(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=>out.push(r));
    });
    return out;
  }

  // ---------- Backup / Import ----------

  function manualBackupNow(){
    manualBackup();
  }

  function onImportFileInputChange(ev){
    const f = ev.target.files[0];
    if(!f) return;
    importBackupFile(f, payload => {
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
    if(!confirm("Är du säker? Detta raderar ALL lokal data i appen.")) return;
    allData = {};
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
  }

  // ---------- Service worker ----------

  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
        .catch(err => console.warn("SW fel:", err));
    }
  }

})();