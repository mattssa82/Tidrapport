// app.js - Tidrapport v10.18
// I samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION   = "10.18";
  const DATA_KEY      = "tidrapport_data_v10";
  const SETTINGS_KEY  = "tidrapport_settings_v10";

  let allData = {};      // { "10":[{_id,datum,kategori,tid,projekt,kortid,beskrivning}, ...], ... }
  let settings = {};
  let editId = null;

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateCategorySelects();
    populateYearMonthSelectors();
    bindUI();
    renderMonth();
    renderYearOverview();
    registerServiceWorker();
    if(window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" klar.");
  });

  // ---------------- HELPERS ----------------

  function get(id){ return document.getElementById(id); }

  function parseNum(str){
    if(str==null) return 0;
    const s = String(str).replace(",", ".").trim();
    if(!s) return 0;
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : 0;
  }

  function genId(){
    return "r"+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36);
  }

  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10);
    const m = parseInt(get("monthSelect").value,10);
    return [y,m];
  }

  function showPopup(msg){
    const box = get("warnPopup");
    const txt = get("warnPopupText");
    if(!box || !txt){ alert(msg); return; }
    txt.textContent = msg;
    box.style.display = "flex";
    if(window.lucide) lucide.createIcons();
    setTimeout(()=>{ box.style.display="none"; }, 4200);
  }

  // ---------------- SETTINGS ----------------

  function loadSettings(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      settings = raw ? JSON.parse(raw) : {};
      if(typeof settings !== "object" || !settings) settings = {};
    }catch{
      settings = {};
    }

    get("companyInput").value     = settings.company || "";
    get("nameInput").value        = settings.name || "";
    get("anstnrInput").value      = settings.emp || "";
    get("redDaysInput").value     = settings.userRedDays || "";
    get("redDayHoursInput").value = settings.redDayHours != null ? String(settings.redDayHours) : "";
    get("showRedDaysChk").checked = !!settings.showRedDays;
    get("autoBackupChk").checked  = !!settings.autoBackup;
  }

  function saveSettingsFromUI(){
    settings.company      = get("companyInput").value.trim();
    settings.name         = get("nameInput").value.trim();
    settings.emp          = get("anstnrInput").value.trim();
    settings.userRedDays  = get("redDaysInput").value.trim();
    settings.redDayHours  = parseNum(get("redDayHoursInput").value) || 8;
    settings.showRedDays  = get("showRedDaysChk").checked;
    settings.autoBackup   = get("autoBackupChk").checked;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    autoLocalBackup("settings-change");
    alert("Inställningar sparade.");
    renderMonth();
    renderYearOverview();
  }

  // ---------------- DATA ----------------

  function loadData(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
      if(typeof allData !== "object" || !allData) allData = {};
    }catch{
      allData = {};
    }
  }

  function saveData(reason){
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup(reason || "data-change");
  }

  // ---------------- UI BINDING ----------------

  function bindUI(){
    // meny toggle
    initMenuToggle();

    // inmatning
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

    // backup / import / export
    get("manualBackupBtn").addEventListener("click", manualBackup);
    get("manualBackupBtn2").addEventListener("click", manualBackup);
    get("importFileInput").addEventListener("change", onImportFile);
    get("exportCsvBtn").addEventListener("click", ()=> {
      const [y,m] = currentYearMonth();
      exportCSVImpl(flattenMonth(y,m), settings, y, m);
    });
    get("exportPdfBtn").addEventListener("click", ()=> {
      const [y,m] = currentYearMonth();
      exportPDFImpl(flattenMonth(y,m), settings, y, m);
    });
    get("exportYearBtn").addEventListener("click", ()=> {
      exportYearImpl(flattenAll(), settings);
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

    // datum klick -> visa picker (mobiler)
    const di = get("dateInput");
    if(di && di.showPicker){
      di.addEventListener("click", e => e.target.showPicker());
    }
  }

  function initMenuToggle(){
    const panel = get("sidePanel");
    const btn   = get("menuToggleBtn");
    if(!panel || !btn) return;

    function close(){
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden","true");
      btn.setAttribute("aria-expanded","false");
    }
    function open(){
      panel.classList.add("open");
      panel.setAttribute("aria-hidden","false");
      btn.setAttribute("aria-expanded","true");
    }

    btn.addEventListener("click", e=>{
      e.stopPropagation();
      if(panel.classList.contains("open")) close(); else open();
    });

    document.addEventListener("click", e=>{
      if(!panel.contains(e.target) && !btn.contains(e.target)){
        close();
      }
    });
  }

  // ---------------- CATEGORIES ----------------

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
    const main = get("catMainSelect");
    const ex1  = get("catExtraSelect1");
    const ex2  = get("catExtraSelect2");
    if(main){
      main.innerHTML = '<option value="">(välj)</option>' +
        CATS.map(c=>`<option value="${c}">${c}</option>`).join("");
    }
    [ex1,ex2].forEach(sel=>{
      if(!sel) return;
      sel.innerHTML = '<option value="">(ingen)</option>' +
        CATS.map(c=>`<option value="${c}">${c}</option>`).join("");
    });
  }

  // ---------------- YEAR/MONTH SELECT ----------------

  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");
    if(!ySel || !mSel) return;

    const years = new Set();
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth()+1;
    years.add(curY);

    Object.keys(allData).forEach(mKey=>{
      (allData[mKey]||[]).forEach(r=>{
        if(!r.datum) return;
        const y = (new Date(r.datum)).getFullYear();
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
    mSel.innerHTML = monthNames.map((n,i)=>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${n}</option>`
    ).join("");
  }

  // ---------------- SAVE ENTRY ----------------

  function readCatRow(selId, hrsId, label){
    const sel = get(selId);
    const inp = get(hrsId);
    if(!sel || !inp) return null;

    const cat = (sel.value || "").trim();
    const raw = (inp.value || "").trim();
    if(!cat && !raw) return null;
    if(!cat){
      showPopup(`Välj kategori för ${label}.`);
      throw "abort";
    }
    const hours = parseNum(raw || "0");
    if(!Number.isFinite(hours)){
      showPopup(`Ogiltigt timtal i ${label}.`);
      throw "abort";
    }
    return { cat, hours };
  }

  function validateCombo(cats){
    if(!cats.length) {
      showPopup("Ange minst en kategori/tid.");
      return false;
    }

    const hasOrd = cats.some(c => /ordinarie/i.test(c.cat) && c.hours !== 0);
    const hasAbs = cats.some(c => /(vab|sjuk|föräldraledig)/i.test(c.cat) && c.hours !== 0);
    const hasNegBank = cats.some(c =>
      c.hours < 0 && /(flex|atf|övertid|semester)/i.test(c.cat)
    );

    if(hasOrd && hasAbs){
      showPopup("Ordinarie tid kan inte kombineras med VAB/Sjuk/Föräldraledig i samma inmatning. Dela upp dagen i separata rader.");
      return false;
    }
    if(hasOrd && hasNegBank){
      showPopup("Ordinarie tid + negativa timmar (Flex/ATF/ÖT/Semester) i samma inmatning är inte tillåtet. Lägg dem som egna rader.");
      return false;
    }
    return true;
  }

  function onSaveEntry(){
    const date = get("dateInput").value;
    if(!date){
      showPopup("Välj datum.");
      return;
    }

    const projekt = get("projektInput").value.trim();
    const kortid  = parseNum(get("driveHoursInput").value);
    const note    = get("noteInput").value.trim();

    let cats = [];
    try{
      const c1 = readCatRow("catMainSelect","catMainHours","Kategori 1");
      const c2 = readCatRow("catExtraSelect1","catExtraHours1","Extra kategori 2");
      const c3 = readCatRow("catExtraSelect2","catExtraHours2","Extra kategori 3");
      [c1,c2,c3].forEach(c => { if(c) cats.push(c); });
    }catch(e){
      if(e==="abort") return;
      console.error(e);
      return;
    }

    if(!validateCombo(cats)) return;

    const month = (new Date(date+"T00:00")).getMonth()+1;
    if(!allData[month]) allData[month] = [];

    const rowId = editId || genId();

    // rensa gammal grupp vid edit
    if(editId){
      Object.keys(allData).forEach(m=>{
        allData[m] = (allData[m]||[]).filter(r => r._id !== editId);
      });
    }

    // skapa rader: samma _id, första får kortid + note
    cats.forEach((c,idx)=>{
      allData[month].push({
        _id: rowId,
        datum: date,
        projekt: projekt,
        kategori: c.cat,
        tid: c.hours,
        kortid: idx===0 ? kortid : 0,
        beskrivning: idx===0 ? note : ""
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
    get("noteInput").value = "";
    get("catMainSelect").value = "";
    get("catMainHours").value = "";
    get("catExtraSelect1").value = "";
    get("catExtraHours1").value = "";
    get("catExtraSelect2").value = "";
    get("catExtraHours2").value = "";
    get("saveEntryLabel").textContent = "Lägg till";
    get("cancelEditBtn").style.display = "none";
  }

  function cancelEdit(){
    clearForm();
  }

  // ---------------- EDIT / DELETE ----------------

  function startEdit(rowId){
    // hitta bundlade rader (var som helst)
    let bundle = [];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=>{
        if(r._id === rowId) bundle.push(r);
      });
    });
    if(!bundle.length) return;

    editId = rowId;
    bundle.sort((a,b)=>a.kategori.localeCompare(b.kategori));

    const base = bundle[0];
    get("dateInput").value       = base.datum || "";
    get("projektInput").value    = base.projekt || "";
    get("driveHoursInput").value = base.kortid || "";
    get("noteInput").value       = base.beskrivning || "";

    // fyll kat-rader
    const cats = bundle;

    // rad1
    if(cats[0]){
      get("catMainSelect").value = cats[0].kategori || "";
      get("catMainHours").value  = cats[0].tid || "";
    }
    // rad2
    if(cats[1]){
      get("catExtraSelect1").value = cats[1].kategori || "";
      get("catExtraHours1").value  = cats[1].tid || "";
    }else{
      get("catExtraSelect1").value = "";
      get("catExtraHours1").value  = "";
    }
    // rad3
    if(cats[2]){
      get("catExtraSelect2").value = cats[2].kategori || "";
      get("catExtraHours2").value  = cats[2].tid || "";
    }else{
      get("catExtraSelect2").value = "";
      get("catExtraHours2").value  = "";
    }

    get("saveEntryLabel").textContent = "Spara";
    get("cancelEditBtn").style.display = "inline-flex";
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    if(!confirm("Ta bort den här posten (alla rader i gruppen)?")) return;
    Object.keys(allData).forEach(m=>{
      allData[m] = (allData[m]||[]).filter(r=>r._id !== rowId);
    });
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
  }

  // ---------------- RENDER MONTH ----------------

  function buildStatusMap(rows, y, m){
    const map = {};
    const reds = window.Balans.parseUserRedDays(settings.userRedDays);
    const days = new Date(y,m,0).getDate();

    for(let d=1; d<=days; d++){
      const ds = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const rs = rows.filter(r=>r.datum===ds);
      const isRed = settings.showRedDays && reds.has(ds);
      const st = window.Balans.getDayStatus(ds, rs, isRed);
      map[ds] = st;
    }
    return map;
  }

  function renderMonth(){
    const [y,m] = currentYearMonth();
    const tbody = get("monthTableBody");
    const sumCell = get("monthSummaryCell");
    if(!tbody || !sumCell) return;
    tbody.innerHTML = "";
    sumCell.textContent = "";

    const rows = (allData[m] || []).slice().sort((a,b)=> {
      const da = a.datum || "";
      const db = b.datum || "";
      if(da !== db) return da.localeCompare(db);
      return (a.projekt||"").localeCompare(b.projekt||"");
    });

    const statusMap = buildStatusMap(rows, y, m);

    rows.forEach(r=>{
      const tr = document.createElement("tr");
      const s = statusMap[r.datum];
      if(s){
        if(s.code === "MISSING") tr.classList.add("day-miss");
        else if(s.code === "UNDER") tr.classList.add("day-under");
        else if(s.code === "OK"){} // ingen färg för radnivå när ok (låt data tala)
        else if(s.code === "FREE") tr.classList.add("day-free");
      }

      tr.innerHTML = `
        <td>${r.datum || ""}</td>
        <td>${r.projekt || ""}</td>
        <td>${r.kategori || ""}</td>
        <td>${(r.tid ?? "").toString()}</td>
        <td>${(r.kortid ?? "").toString()}</td>
        <td>${(r.beskrivning || "").replace(/\r?\n/g," ")}</td>
        <td>
          <button class="icon-table-btn edit" data-id="${r._id}" title="Ändra">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="icon-table-btn del" data-id="${r._id}" title="Ta bort">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // bind actions
    tbody.querySelectorAll(".icon-table-btn.edit").forEach(btn=>{
      btn.addEventListener("click", ()=> startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll(".icon-table-btn.del").forEach(btn=>{
      btn.addEventListener("click", ()=> deleteRow(btn.dataset.id));
    });

    if(window.lucide) lucide.createIcons();

    renderMonthSummary(rows, sumCell);
    renderLarm(rows, y, m);
  }

  function renderMonthSummary(rows, cell){
    const sum = {
      ord:0, flex:0, ot1:0, ot2:0, sem:0, atf:0,
      vab:0, sjuk:0, fl:0, trakt:0, kortid:0
    };
    rows.forEach(r=>{
      const h = parseNum(r.tid);
      const k = parseNum(r.kortid);
      const c = (r.kategori || "").toLowerCase();

      if(/trakt/.test(c)) sum.trakt += 1;
      else if(/ordinarie/.test(c)) sum.ord += h;
      else if(/flex/.test(c)) sum.flex += h;
      else if(/övertid/.test(c) && /<2/.test(c)) sum.ot1 += h;
      else if(/övertid/.test(c) && (/>2/.test(c) || /helg/.test(c))) sum.ot2 += h;
      else if(/semest/.test(c)) sum.sem += h;
      else if(/atf/.test(c)) sum.atf += h;
      else if(/vab/.test(c)) sum.vab += h;
      else if(/sjuk/.test(c)) sum.sjuk += h;
      else if(/föräldraledig/.test(c)) sum.fl += h;

      sum.kortid += k;
    });

    cell.textContent =
      `Ordinarie: ${sum.ord.toFixed(2)} h | `+
      `Körtid: ${sum.kortid.toFixed(2)} h | `+
      `Flex: ${sum.flex.toFixed(2)} h | `+
      `ÖT<2: ${sum.ot1.toFixed(2)} h | `+
      `ÖT>2/Helg: ${sum.ot2.toFixed(2)} h | `+
      `Semester: ${sum.sem.toFixed(2)} h | `+
      `ATF: ${sum.atf.toFixed(2)} h | `+
      `VAB: ${sum.vab.toFixed(2)} h | `+
      `Sjuk: ${sum.sjuk.toFixed(2)} h | `+
      `FL: ${sum.fl.toFixed(2)} h | `+
      `Trakt: ${sum.trakt} st`;
  }

  // ---------------- LARM / OBALANS ----------------

  function renderLarm(rows, y, m){
    const cont = get("alarmContainer");
    if(!cont) return;

    const larm = window.Balans.buildLarm(rows, y, m, settings);
    if(!larm.length){
      cont.className = "alarm-empty";
      cont.innerHTML = "Inga avvikelser registrerade.";
      return;
    }

    const lines = larm.map(item=>{
      const icon = item.code === "MISSING"
        ? "🔴"
        : (item.code === "UNDER" ? "⚠️" : "ℹ️");
      return `<tr>
        <td>${item.date}</td>
        <td>${icon} ${item.status}</td>
      </tr>`;
    }).join("");

    cont.className = "";
    cont.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:.75rem;">
        <thead>
          <tr>
            <th style="text-align:left;padding:.25rem .4rem;border-bottom:1px solid #ddd;">Datum</th>
            <th style="text-align:left;padding:.25rem .4rem;border-bottom:1px solid #ddd;">Status (larm)</th>
          </tr>
        </thead>
        <tbody>
          ${lines}
        </tbody>
      </table>
    `;
  }

  // ---------------- YEAR OVERVIEW ----------------

  function renderYearOverview(){
    const tb = get("yearTableBody");
    if(!tb) return;
    tb.innerHTML = "";

    const [y] = currentYearMonth();
    const all = flattenAll();
    const summary = window.Balans.buildYearSummary(all, y);

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];

    summary.forEach((S,idx)=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[idx]}</td>
        <td>${S.ord.toFixed(2)}</td>
        <td>${S.kortid.toFixed(2)}</td>
        <td>${S.flex.toFixed(2)}</td>
        <td>${S.ot_lt.toFixed(2)}</td>
        <td>${S.ot_gt.toFixed(2)}</td>
        <td>${S.sem.toFixed(2)}</td>
        <td>${S.atf.toFixed(2)}</td>
        <td>${S.vab.toFixed(2)}</td>
        <td>${S.sjuk.toFixed(2)}</td>
        <td>${S.fl.toFixed(2)}</td>
        <td>${S.trakt}</td>
      `;
      tb.appendChild(tr);
    });
  }

  // ---------------- FLATTEN HELPERS ----------------

  function flattenMonth(year,month){
    return (allData[month]||[]).filter(r=>{
      if(!r.datum) return false;
      const d = new Date(r.datum);
      return d.getFullYear()===Number(year) && (d.getMonth()+1)===Number(month);
    }).sort((a,b)=>a.datum.localeCompare(b.datum));
  }

  function flattenAll(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=>out.push(r));
    });
    return out;
  }

  // ---------------- IMPORT / CLEAR ----------------

  function onImportFile(ev){
    const f = ev.target.files[0];
    if(!f) return;
    importBackupFile(f, payload=>{
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
    if(!confirm("Är du säker? Detta raderar ALL data i denna webbläsare.")) return;
    allData = {};
    saveData("clearAll");
    renderMonth();
    renderYearOverview();
  }

  // ---------------- SERVICE WORKER ----------------

  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
        .catch(err=>console.warn("SW fel:",err));
    }
  }

})();