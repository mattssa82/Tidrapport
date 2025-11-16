// app.js
// Tidrapport v10.23
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION   = "10.23";
  const DATA_KEY      = "tidrapport_data_v10";        // { "1":[...], "2":[...], ... }
  const SETTINGS_KEY  = "tidrapport_settings_v10";    // { company,name,emp,redDays,showRedDays,autoBackup }

  // State
  let allData = {};    // monthNum -> [ { _id, datum, kategori, tid, projekt, kortid, beskrivning } ]
  let settings = {};
  let editId = null;

  // Kategorier
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

  // ===== Hjälpare =====
  function get(id){ return document.getElementById(id); }

  function genRowId(){
    return Date.now() + "_" + Math.floor(Math.random()*1e6);
  }

  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10);
    const m = parseInt(get("monthSelect").value,10);
    return [y,m];
  }

  // Minus-stöd & validering
  function normMinus(s){ return (s||"").replace(/[–—−]/g,"-"); }

  function toNumRaw(s){
    if(s==null) return NaN;
    s = normMinus((""+s).replace(/\s+/g,"")).replace(",",".");
    if(!/^[-]?\d*(\.\d+)?$/.test(s)) return NaN;
    return s==="" ? NaN : parseFloat(s);
  }

  function roundQuarter(n){ return Math.round(n*4)/4; }

  function parseHourInput(v, allowEmpty=false){
    if(allowEmpty && (v==="" || v==null)) return 0;
    const n = toNumRaw(v);
    if(isNaN(n)) return NaN;
    return roundQuarter(n);
  }

  function sanitizeProject(s){
    s = (s||"").normalize("NFC").replace(/\s+/g,"");
    return s.replace(/[^0-9A-Za-zÅÄÖåäö]/g,"");
  }

  // ===== Init =====
  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    initCategoryRows();
    renderMonth();
    renderYearOverview();
    registerServiceWorker();
    if(window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" laddad ✅");
  });

  // ===== Load / Save =====
  function loadData(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
      if(typeof allData!=="object" || allData===null) allData = {};
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
      if(typeof settings!=="object" || settings===null) settings = {};
    }catch{
      settings = {};
    }

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

  // ===== Meny / UI-bindningar =====
  function bindUI(){
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

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

    get("openSearchBtn").addEventListener("click", ()=>{
      window.location.href = "search.html";
    });

    get("clearAllBtn").addEventListener("click", resetAll);

    get("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);

    get("yearSelect").addEventListener("change", ()=>{
      renderMonth();
      renderYearOverview();
    });
    get("monthSelect").addEventListener("change", renderMonth);

    initMenuToggle();

    const di = get("dateInput");
    if(di && di.showPicker){
      di.addEventListener("click", e => { e.target.showPicker(); });
    }

    get("addCatRowBtn").addEventListener("click", addCategoryRow);
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
      if(!panel.contains(e.target) && !btn.contains(e.target)){
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden","true");
        btn.setAttribute("aria-expanded","false");
      }
    });
  }

  // ===== År / Månad dropdowns =====
  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");

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
    ySel.innerHTML = yearsSorted.map(y =>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];
    const curM = new Date().getMonth()+1;
    mSel.innerHTML = monthNames.map((name,i)=>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  // ===== Kategorirader (dynamiska) =====
  function initCategoryRows(){
    const cont = document.getElementById("catRows");
    cont.innerHTML = "";
    addCategoryRow(); // en obligatorisk rad
  }

  function createCatRow(idSuffix, isMain){
    const row = document.createElement("div");
    row.className = "cat-row" + (isMain ? " cat-row-main" : "");
    row.dataset.rowId = idSuffix;

    const sel = document.createElement("select");
    sel.className = "cat-select";
    sel.innerHTML = `<option value="">(välj)</option>` +
      CATS.map(c=>`<option value="${c}">${c}</option>`).join("");

    const inp = document.createElement("input");
    inp.className = "cat-hours";
    inp.type = "text";
    inp.inputMode = "decimal";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-remove";
    btn.innerHTML = `<i data-lucide="minus-circle"></i>`;
    if(isMain){
      btn.disabled = true;
      btn.title = "Första raden kan inte tas bort";
    }else{
      btn.addEventListener("click", ()=>{
        row.remove();
      });
    }

    row.appendChild(sel);
    row.appendChild(inp);
    row.appendChild(btn);
    return row;
  }

  function addCategoryRow(){
    const cont = document.getElementById("catRows");
    const existing = Array.from(cont.querySelectorAll(".cat-row"));
    const usedCats = existing
      .map(r=>r.querySelector(".cat-select").value)
      .filter(Boolean);

    if(usedCats.length >= CATS.length){
      alert("Du har redan använt alla kategorier en gång i denna inmatning.");
      return;
    }
    const idSuffix = "r"+(existing.length+1);
    const row = createCatRow(idSuffix, existing.length===0);
    cont.appendChild(row);
    if(window.lucide) lucide.createIcons();
  }

  function readCategoryRows(){
    const cont = document.getElementById("catRows");
    const rows = Array.from(cont.querySelectorAll(".cat-row"));

    const seen = new Set();
    const result = [];

    for(const r of rows){
      const sel = r.querySelector(".cat-select");
      const inp = r.querySelector(".cat-hours");

      const cat = (sel.value||"").trim();
      const raw = inp.value;

      if(!cat && !raw) continue; // helt tom rad -> hoppa över

      if(cat && seen.has(cat)){
        get("catValidation").textContent = "Du kan inte välja samma kategori flera gånger i samma inmatning.";
        return null;
      }
      if(cat) seen.add(cat);

      const h = parseHourInput(raw, true);
      if(isNaN(h)){
        get("catValidation").textContent = "Ogiltigt timvärde. Använd t.ex. 8, 7.5 eller -2.";
        return null;
      }

      result.push({ kategori:cat, tid:h });
    }

    if(!result.length){
      get("catValidation").textContent = "Minst en kategori med tid krävs.";
      return null;
    }

    get("catValidation").textContent = "";
    return result;
  }

  // ===== Validering av hela formuläret =====
  function validateForm(){
    const msgEl = get("formValidation");
    msgEl.textContent = "";

    const datum = get("dateInput").value;
    if(!datum){
      msgEl.textContent = "Datum måste fyllas i.";
      return false;
    }

    const projektRaw = get("projektInput").value;
    const projektVal = sanitizeProject(projektRaw);
    if(!projektVal){
      msgEl.textContent = "Projekt nr måste fyllas i (bokstäver/siffror, utan mellanslag).";
      return false;
    }

    const catRows = readCategoryRows();
    if(!catRows) return false;

    // Block: Ordinarie + VAB/Sjuk/FL i samma inmatning
    const names = catRows.map(r => (r.kategori||"").toLowerCase());
    const hasOrd = names.some(n=>n.includes("ordinarie"));
    const hasAbs = names.some(n=> n.includes("vab") || n.includes("sjuk") || n.includes("föräldral"));

    if(hasOrd && hasAbs){
      msgEl.textContent = "Du kan inte kombinera Ordinarie tid med VAB/Sjuk/Föräldraledig i samma inmatning.";
      return false;
    }

    // Minst en rad med icke-noll timmar eller Traktamente
    const hasAnyTime = catRows.some(r => r.kategori && (r.tid !== 0 || r.kategori.toLowerCase().includes("trakt")));
    if(!hasAnyTime){
      msgEl.textContent = "Minst en kategori måste ha tid (eller Traktamente).";
      return false;
    }

    const noteVal = (get("noteInput").value||"").trim();
    if(!noteVal){
      msgEl.textContent = "Dagboksanteckning måste fyllas i (kort vad du gjort).";
      return false;
    }

    msgEl.textContent = "";
    return true;
  }

  // ===== Lägg till / spara rad =====
  function onSaveEntry(){
    if(!validateForm()) return;

    const [year, month] = currentYearMonth();
    if(!allData[month]) allData[month] = [];

    const datum       = get("dateInput").value;
    const projektVal  = sanitizeProject(get("projektInput").value);
    const driveHrsVal = parseHourInput(get("driveHoursInput").value || "0", true);
    const noteVal     = get("noteInput").value.trim();
    const catRows     = readCategoryRows();
    if(!catRows) return;

    const rowId = editId || genRowId();

    // Om vi redigerar: ta bort alla gamla rader med samma id och datum
    if(editId){
      allData[month] = (allData[month]||[]).filter(r => r._id !== editId);
    }

    // Första kategori får bära körtid
    catRows.forEach((c, idx)=>{
      if(!c.kategori) return;
      const isTrakt = c.kategori.toLowerCase().includes("trakt");

      allData[month].push({
        _id: rowId,
        datum,
        kategori: c.kategori,
        tid: isTrakt ? 0 : c.tid, // Traktamente ska inte räkna timmar
        projekt: projektVal,
        kortid: idx===0 ? driveHrsVal : 0,
        beskrivning: noteVal
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
    get("saveEntryLabel").textContent = "Lägg till";
    get("cancelEditBtn").style.display = "none";
    get("formValidation").textContent = "";
    get("catValidation").textContent = "";
    initCategoryRows();
  }

  function cancelEdit(){
    clearForm();
  }

  // ===== Redigera / Radera =====
  function startEdit(rowId){
    const [y,m] = currentYearMonth();
    const arr = allData[m] || [];
    const bundle = arr.filter(r=>r._id===rowId);
    if(!bundle.length) return;

    editId = rowId;

    const base = bundle[0];
    get("dateInput").value    = base.datum || "";
    get("projektInput").value = base.projekt || "";
    get("driveHoursInput").value = base.kortid || "";
    get("noteInput").value = base.beskrivning || "";

    const cont = document.getElementById("catRows");
    cont.innerHTML = "";
    bundle.forEach((r, idx)=>{
      const row = createCatRow("edit"+idx, idx===0);
      row.querySelector(".cat-select").value = r.kategori || "";
      row.querySelector(".cat-hours").value  = r.kategori.toLowerCase().includes("trakt") ? "" : (r.tid || "");
      cont.appendChild(row);
    });
    if(window.lucide) lucide.createIcons();

    get("saveEntryLabel").textContent = "Spara";
    get("cancelEditBtn").style.display = "inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    const [y,m] = currentYearMonth();
    if(!confirm("Ta bort alla rader för denna inmatning (datum + kategorier)?")) return;
    allData[m] = (allData[m]||[]).filter(r=>r._id !== rowId);
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
  }

  // ===== Render månad =====
  function renderMonth(){
    const [year, month] = currentYearMonth();
    const tbody = get("monthTableBody");
    tbody.innerHTML = "";

    const rows = allData[month] || [];
    const sorted = rows.slice().sort((a,b)=> a.datum.localeCompare(b.datum));

    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(sorted, settings, year, month)
      : {};

    sorted.forEach(r=>{
      const tr = document.createElement("tr");
      const st = statusMap[r.datum]?.status || "";
      if(st) tr.classList.add("dagstatus--"+st);

      tr.innerHTML = `
        <td>${r.datum||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${(r.tid||0)}</td>
        <td>${(r.kortid||0)}</td>
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

    tbody.querySelectorAll("button[data-act='edit']").forEach(btn=>{
      btn.addEventListener("click",()=>startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn=>{
      btn.addEventListener("click",()=>deleteRow(btn.dataset.id));
    });

    if(window.lucide) lucide.createIcons();

    renderMonthSummary(rows);
    renderAlerts(statusMap);
  }

  function renderMonthSummary(rows){
    const cell = get("monthSummaryCell");
    if(!cell) return;

    const sum = {
      ordinarie:0,
      kortid:0,
      flextid:0,
      ot_lt2:0,
      ot_gt2:0,
      ot_helg:0,
      semester:0,
      atf:0,
      vab:0,
      sjuk:0,
      fl:0,
      trakt:0
    };

    rows.forEach(r=>{
      const n = (r.kategori||"").toLowerCase();
      const h = parseFloat(r.tid)||0;
      const k = parseFloat(r.kortid)||0;

      if(n.includes("ordinarie")) sum.ordinarie += h;
      if(n.includes("flex"))      sum.flextid   += h;
      if(n.includes("övertid") && n.includes("<2")) sum.ot_lt2 += h;
      if(n.includes("övertid") && n.includes(">2")) sum.ot_gt2 += h;
      if(n.includes("övertid-helg") || (n.includes("övertid") && n.includes("helg"))) sum.ot_helg += h;
      if(n.includes("semest"))    sum.semester  += h;
      if(n.includes("atf"))       sum.atf       += h;
      if(n.includes("vab"))       sum.vab       += h;
      if(n.includes("sjuk"))      sum.sjuk      += h;
      if(n.includes("föräld"))    sum.fl        += h;
      if(n.includes("trakt"))     sum.trakt    += 1;

      sum.kortid += k;
    });

    cell.textContent =
      `Ordinarie: ${sum.ordinarie.toFixed(2)}h | ` +
      `Körtid: ${sum.kortid.toFixed(2)}h | ` +
      `Flex: ${sum.flextid.toFixed(2)}h | ` +
      `ÖT<2: ${sum.ot_lt2.toFixed(2)}h | ` +
      `ÖT>2: ${sum.ot_gt2.toFixed(2)}h | ` +
      `ÖT-Helg: ${sum.ot_helg.toFixed(2)}h | ` +
      `Semester: ${sum.semester.toFixed(2)}h | ` +
      `ATF: ${sum.atf.toFixed(2)}h | ` +
      `VAB: ${sum.vab.toFixed(2)}h | ` +
      `Sjuk: ${sum.sjuk.toFixed(2)}h | ` +
      `Föräldraledig: ${sum.fl.toFixed(2)}h | ` +
      `Trakt: ${sum.trakt} st`;
  }

  // ===== Larm / Obalans =====
  function renderAlerts(statusMap){
    const tbody = get("alertsTableBody");
    if(!tbody) return;
    tbody.innerHTML = "";

    const entries = Object.keys(statusMap).sort().map(d=>({datum:d,...statusMap[d]}));

    const problem = entries.filter(e=>{
      return e.status==="saknas" || e.status==="orange_under" || e.status==="orange_absence";
    });

    if(!problem.length){
      tbody.innerHTML = `<tr><td colspan="3"><i>Inga larm för denna månad.</i></td></tr>`;
      return;
    }

    problem.forEach(e=>{
      let icon = "";
      let text = "";
      if(e.status==="saknas"){
        icon = "alert-octagon";
        text = "Ingen registrering (vardag).";
      }else if(e.status==="orange_under"){
        icon = "alert-triangle";
        text = `Under 8h registrerad tid (${(e.totalHours||0).toFixed(2)}h).`;
      }else if(e.status==="orange_absence"){
        icon = "alert-circle";
        text = "Endast frånvaro (VAB/Sjuk/Föräldraledig).";
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${e.datum}</td>
        <td><i data-lucide="${icon}"></i></td>
        <td>${text}</td>
      `;
      tbody.appendChild(tr);
    });

    if(window.lucide) lucide.createIcons();
  }

  // ===== Årsöversikt =====
  function renderYearOverview(){
    const tbody = get("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML = "";

    const [year] = currentYearMonth();
    const monthNames = {
      1:"Januari",2:"Februari",3:"Mars",4:"April",5:"Maj",6:"Juni",
      7:"Juli",8:"Augusti",9:"September",10:"Oktober",11:"November",12:"December"
    };

    for(let m=1;m<=12;m++){
      const arr = (allData[m]||[]).filter(r=>{
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear() === year;
      });

      if(!arr.length) continue; // hoppa över helt tomma månader

      const S = {
        ordinarie:0,
        kortid:0,
        flextid:0,
        ot_lt2:0,
        ot_gt2:0,
        ot_helg:0,
        semester:0,
        atf:0,
        vab:0,
        sjuk:0,
        fl:0,
        trakt:0
      };

      arr.forEach(r=>{
        const n=(r.kategori||"").toLowerCase();
        const h=parseFloat(r.tid)||0;
        const k=parseFloat(r.kortid)||0;

        if(n.includes("ordinarie")) S.ordinarie+=h;
        if(n.includes("flex"))      S.flextid+=h;
        if(n.includes("övertid") && n.includes("<2")) S.ot_lt2+=h;
        if(n.includes("övertid") && n.includes(">2")) S.ot_gt2+=h;
        if(n.includes("övertid-helg") || (n.includes("övertid") && n.includes("helg"))) S.ot_helg+=h;
        if(n.includes("semest"))    S.semester+=h;
        if(n.includes("atf"))       S.atf+=h;
        if(n.includes("vab"))       S.vab+=h;
        if(n.includes("sjuk"))      S.sjuk+=h;
        if(n.includes("föräld"))    S.fl+=h;
        if(n.includes("trakt"))     S.trakt+=1;

        S.kortid += k;
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m]}</td>
        <td>${S.ordinarie.toFixed(2)}</td>
        <td>${S.kortid.toFixed(2)}</td>
        <td>${S.flextid.toFixed(2)}</td>
        <td>${S.ot_lt2.toFixed(2)}</td>
        <td>${S.ot_gt2.toFixed(2)}</td>
        <td>${S.ot_helg.toFixed(2)}</td>
        <td>${S.semester.toFixed(2)}</td>
        <td>${S.atf.toFixed(2)}</td>
        <td>${S.vab.toFixed(2)}</td>
        <td>${S.sjuk.toFixed(2)}</td>
        <td>${S.fl.toFixed(2)}</td>
        <td>${S.trakt}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ===== Backup / Import =====
  function manualBackupNow(){
    manualBackup();
  }

  function onImportFileInputChange(ev){
    const f = ev.target.files[0];
    if(!f) return;
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

  function resetAll(){
    const input = prompt("⚠️ RADERA ALL DATA.\nSkriv: RADERA ALLT");
    if(input!=="RADERA ALLT") return;
    allData = {};
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
    alert("All data är nu raderad.");
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

})();