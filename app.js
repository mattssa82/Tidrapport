// app.js
// Tidrapport v10.4
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){
  const APP_VERSION = "10.4";
  const DATA_KEY = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  let allData = {};     // { "10":[{...}, ...], "11":[...], ... }
  let settings = {};
  let editId = null;

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    renderMonth();
    renderYearOverview();
    renderAlarms();
    registerServiceWorker();
    if (window.lucide) lucide.createIcons();
    console.log("Tidrapport v" + APP_VERSION + " startad ✅");
  });

  // -----------------------------
  // Laddning & sparning
  // -----------------------------
  function loadData(){
    try {
      allData = JSON.parse(localStorage.getItem(DATA_KEY)) || {};
    } catch { allData = {}; }
  }

  function saveData(reason){
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup(reason || "data-change");
    renderMonth();
    renderYearOverview();
    renderAlarms();
  }

  function loadSettings(){
    try {
      settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch { settings = {}; }

    get("companyInput").value     = settings.company || "";
    get("nameInput").value        = settings.name || "";
    get("anstnrInput").value      = settings.emp || "";
    get("holidayHoursInput").value = (typeof settings.holidayHours==="number" ? settings.holidayHours : 8);
    get("autoBackupChk").checked  = !!settings.autoBackup;
  }

  function saveSettingsFromUI(){
    settings.company      = get("companyInput").value.trim();
    settings.name         = get("nameInput").value.trim();
    settings.emp          = get("anstnrInput").value.trim();
    settings.holidayHours = parseFloat(get("holidayHoursInput").value || 8);
    settings.autoBackup   = get("autoBackupChk").checked;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    alert("Inställningar sparade.");
    saveData("settings-change");
  }

  // -----------------------------
  // Hjälpfunktioner
  // -----------------------------
  function get(id){ return document.getElementById(id); }

  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10);
    const m = parseInt(get("monthSelect").value,10);
    return [y,m];
  }

  function genRowId(){ return Date.now() + "_" + Math.floor(Math.random()*1e6); }

  // -----------------------------
  // UI-bindningar
  // -----------------------------
  function bindUI(){
    // huvudknappar
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);
    get("manualBackupBtn").addEventListener("click", manualBackupNow);
    get("manualBackupBtn2").addEventListener("click", manualBackupNow);
    // IMPORT (vi triggar filväljaren via prompt)
    // du kan välja att visa en riktig knapp senare
    // men knappen finns ej i sidomenyn för att du bad om mindre kaos
    // kör via console om du vill: document.getElementById("importFileInput").click()
    const importEl = document.getElementById("importFileInput");
    if (importEl){
      importEl.addEventListener("change", onImportFileInputChange);
    }

    get("exportCsvBtn").addEventListener("click", exportMonthCSV);
    get("exportPdfBtn").addEventListener("click", exportMonthPDF);
    get("exportYearBtn").addEventListener("click", exportYearCSV);

    get("clearAllBtn").addEventListener("click", clearAllDataConfirm);

    get("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);

    // val av år/månad
    get("yearSelect").addEventListener("change", ()=>{
      renderMonth();
      renderYearOverview();
      renderAlarms();
    });
    get("monthSelect").addEventListener("change", ()=>{
      renderMonth();
      renderAlarms();
    });

    // meny
    initMenuToggle();

    // dynamiska kategorirader
    get("addCatRowBtn").addEventListener("click", ()=>addCategoryRow());

    // klicka var som helst i datumfält öppnar pickern (mobiler)
    const di = get("dateInput");
    if (di && di.showPicker){
      di.addEventListener("click", e => e.target.showPicker());
    }

    // top header knappar
    get("openSearchInlineBtn").addEventListener("click", ()=>{
      location.href="search.html";
    });
    get("openHelpInlineBtn").addEventListener("click", ()=>{
      location.href="help.html";
    });
  }

  // -----------------------------
  // Menyhantering (mobil/offcanvas)
  // -----------------------------
  function initMenuToggle(){
    const panel = get("sidePanel");
    const btn = get("menuToggleBtn");
    btn.addEventListener("click", ()=>{
      const willOpen = !panel.classList.contains("open");
      panel.classList.toggle("open", willOpen);
      panel.setAttribute("aria-hidden", willOpen ? "false":"true");
      btn.setAttribute("aria-expanded", willOpen ? "true":"false");
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
  // Dynamiska kategorirader
  // -----------------------------
  function addCategoryRow(initialCat="", initialHours=""){
    const cont = get("catRowsContainer");
    const row = document.createElement("div");
    row.className = "cat-row";

    row.innerHTML = `
      <div class="cat-inline">
        <select class="catSelect">
          ${categoryOptions(initialCat)}
        </select>
        <input class="catHours" type="number" step="0.25" min="0" value="${initialHours || ""}">
        <button class="removeCatBtn" title="Ta bort kategori">
          <i data-lucide="minus-circle"></i> Ta bort
        </button>
      </div>
    `;

    cont.appendChild(row);
    const btn = row.querySelector(".removeCatBtn");
    btn.addEventListener("click", ()=>{ row.remove(); });
    if (window.lucide) lucide.createIcons();
  }

  function categoryOptions(selected=""){
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
    return `<option value=""></option>` +
      CATS.map(c=>`<option value="${c}" ${c===selected?"selected":""}>${c}</option>`).join("");
  }

  // -----------------------------
  // Lägg till / redigera / spara
  // -----------------------------
  function onSaveEntry(){
    const [year,month] = currentYearMonth();
    if (!allData[month]) allData[month] = [];

    const datum = get("dateInput").value;
    if (!datum){
      alert("Datum saknas.");
      return;
    }

    const projekt = get("projektInput").value.trim();
    const drive = parseFloat(get("driveHoursInput").value||"0")||0;
    const note = get("noteInput").value.trim();

    const cats = Array.from(document.querySelectorAll("#catRowsContainer .cat-row"))
      .map(r=>{
        const cat = r.querySelector(".catSelect").value;
        const h = parseFloat(r.querySelector(".catHours").value||"0")||0;
        return {cat,h};
      })
      .filter(c=>c.cat);

    if (!cats.length){
      alert("Minst en kategori krävs.");
      return;
    }

    const rowId = editId || genRowId();
    if (editId){
      allData[month] = allData[month].filter(r => r._id !== editId);
    }

    cats.forEach(c=>{
      allData[month].push({
        _id: rowId,
        datum,
        kategori: c.cat,
        tid: c.h,
        projekt,
        kortid: drive,
        beskrivning: note
      });
    });

    saveData(editId ? "edit-entry" : "add-entry");
    clearForm();
  }

  function cancelEdit(){ clearForm(); }

  function clearForm(){
    editId = null;
    get("dateInput").value = "";
    get("projektInput").value = "";
    get("driveHoursInput").value = "";
    get("noteInput").value = "";
    get("saveEntryLabel").textContent = "Lägg till";
    get("cancelEditBtn").style.display = "none";
    get("catRowsContainer").innerHTML = "";
  }

  // -----------------------------
  // Tabellrendering (månad)
  // -----------------------------
  function renderMonth(){
    const [year,month] = currentYearMonth();
    const tbody = get("monthTableBody");
    tbody.innerHTML = "";

    const rows = allData[month] || [];
    const sorted = rows.slice().sort((a,b)=>a.datum.localeCompare(b.datum));

    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    sorted.forEach(r=>{
      const tr=document.createElement("tr");
      const st=statusMap[r.datum]?.status||"";
      if(st) tr.classList.add("dagstatus--"+st);

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

    tbody.querySelectorAll("button[data-act='edit']").forEach(btn=>{
      btn.addEventListener("click",()=>startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn=>{
      btn.addEventListener("click",()=>deleteRow(btn.dataset.id));
    });

    if(window.lucide) lucide.createIcons();
    renderMonthSummary(rows);
  }

  // -----------------------------
  // Månads-summering per kategori & per projekt
  // -----------------------------
  function renderMonthSummary(rows){
    const cell = get("monthSummaryCell");
    if(!cell) return;

    const sumByCat = {};
    const sumByProj = {};

    rows.forEach(r=>{
      const cat = (r.kategori||"").toLowerCase();
      const h = parseFloat(r.tid)||0;
      const proj = r.projekt||"";

      if(!sumByProj[proj]) sumByProj[proj]=0;
      sumByProj[proj]+=h;

      if(cat.includes("ordinarie")) sumByCat.ordinarie=(sumByCat.ordinarie||0)+h;
      else if(cat.includes("flex")) sumByCat.flex=(sumByCat.flex||0)+h;
      else if(cat.includes("övertid") && cat.includes("<2")) sumByCat.ot1=(sumByCat.ot1||0)+h;
      else if(cat.includes("övertid") && (cat.includes(">2")||cat.includes("helg"))) sumByCat.ot2=(sumByCat.ot2||0)+h;
      else if(cat.includes("semest")) sumByCat.semester=(sumByCat.semester||0)+h;
      else if(cat.includes("atf")) sumByCat.atf=(sumByCat.atf||0)+h;
      else if(cat.includes("vab")) sumByCat.vab=(sumByCat.vab||0)+h;
      else if(cat.includes("sjuk")) sumByCat.sjuk=(sumByCat.sjuk||0)+h;
      else if(cat.includes("trakt")) sumByCat.trakt=(sumByCat.trakt||0)+1;
    });

    const parts=[];
    for(const [k,v] of Object.entries(sumByCat)){
      if(k==="trakt"){
        parts.push(`Trakt: ${v} st`);
      } else {
        parts.push(`${k.charAt(0).toUpperCase()+k.slice(1)}: ${v.toFixed(2)}h`);
      }
    }

    const projParts=[];
    for(const [p,v] of Object.entries(sumByProj)){
      if(!p) continue;
      projParts.push(`${p}: ${v.toFixed(2)}h`);
    }

    cell.innerHTML = `
      <div><b>Kategori:</b> ${parts.join(" | ")}</div>
      <div style="margin-top:.25rem;"><b>Per projekt:</b> ${projParts.join(" | ")}</div>
    `;
  }

  // -----------------------------
  // Redigera / ta bort rader
  // -----------------------------
  function startEdit(rowId){
    const [y,m] = currentYearMonth();
    const arr = allData[m]||[];
    const bundle = arr.filter(r=>r._id===rowId);
    if(!bundle.length) return;

    editId=rowId;
    const base=bundle[0];

    get("dateInput").value = base.datum || "";
    get("projektInput").value = base.projekt || "";
    get("driveHoursInput").value = base.kortid || "";
    get("noteInput").value = base.beskrivning || "";

    const cont=get("catRowsContainer");
    cont.innerHTML="";
    bundle.forEach(r=> addCategoryRow(r.kategori,r.tid));

    get("saveEntryLabel").textContent="Spara";
    get("cancelEditBtn").style.display="inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    const [y,m]=currentYearMonth();
    if(!confirm("Ta bort raden?")) return;
    allData[m] = (allData[m]||[]).filter(r=>r._id!==rowId);
    saveData("delete-entry");
  }

  // -----------------------------
  // Årsöversikt
  // -----------------------------
  function renderYearOverview(){
    const tbody = get("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];

    for(let m=1;m<=12;m++){
      const arr = allData[m]||[];
      const sum={ord:0,flex:0,ot1:0,ot2:0,sem:0,atf:0,vab:0,sjuk:0,trakt:0,kortid:0};

      arr.forEach(r=>{
        const n=(r.kategori||"").toLowerCase();
        const h=parseFloat(r.tid)||0;

        if(n.includes("ordinarie")) sum.ord+=h;
        if(n.includes("flex")) sum.flex+=h;
        if(n.includes("övertid")&&n.includes("<2")) sum.ot1+=h;
        if(n.includes("övertid")&&(n.includes(">2")||n.includes("helg"))) sum.ot2+=h;
        if(n.includes("semest")) sum.sem+=h;
        if(n.includes("atf")) sum.atf+=h;
        if(n.includes("vab")) sum.vab+=h;
        if(n.includes("sjuk")) sum.sjuk+=h;
        if(n.includes("trakt")) sum.trakt+=1;

        sum.kortid += parseFloat(r.kortid)||0;
      });

      const tr=document.createElement("tr");
      const val=(v)=>v>0?v.toFixed(2):"";
      tr.innerHTML=`
        <td>${monthNames[m-1]}</td>
        <td>${val(sum.ord)}</td>
        <td>${val(sum.flex)}</td>
        <td>${val(sum.ot1)}</td>
        <td>${val(sum.ot2)}</td>
        <td>${val(sum.sem)}</td>
        <td>${val(sum.atf)}</td>
        <td>${val(sum.vab)}</td>
        <td>${val(sum.sjuk)}</td>
        <td>${sum.trakt>0?sum.trakt:""}</td>
        <td>${val(sum.kortid)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // -----------------------------
  // Larm / balansavvikelser
  // -----------------------------
  function renderAlarms(){
    const [year,month] = currentYearMonth();
    const tbody = get("alarmTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const rows = allData[month]||[];
    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    const today = new Date();

    // bygg struktur per datum så vi kan visa projekt/kategori/tid
    const byDate={};
    rows.forEach(r=>{
      if(!byDate[r.datum]) byDate[r.datum]=[];
      byDate[r.datum].push(r);
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    for(let d=1; d<=daysInMonth; d++){
      const ds=`${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const curDate=new Date(ds);

      // Larma bara dagar som redan passerat eller är idag
      if(curDate>today) continue;

      const st=statusMap[ds]?.status;
      if(st==="helg" || st==="röddag") continue; // inget larm på helg/röddag

      if(st==="saknas"){
        // ingen rad alls den dagen
        const tr=document.createElement("tr");
        tr.innerHTML=`
          <td>${ds}</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>🔴 Ingen registrering</td>
        `;
        tbody.appendChild(tr);
        continue;
      }

      if(st==="orange_under" || st==="orange_absence"){
        // under 8h eller bara frånvaro
        // ta första raden bara som "exempel"
        const first = (byDate[ds] && byDate[ds][0]) ? byDate[ds][0] : {};
        const tr=document.createElement("tr");
        tr.innerHTML=`
          <td>${ds}</td>
          <td>${first.projekt||""}</td>
          <td>${first.tid||""}</td>
          <td>${first.kategori||""}</td>
          <td>⚠️ Under 8h / Frånvaro</td>
        `;
        tbody.appendChild(tr);
      }

      // status "grön" får inget larm
    }

    if(!tbody.children.length){
      const tr=document.createElement("tr");
      tr.innerHTML=`<td colspan="5">Inga larm 🎉</td>`;
      tbody.appendChild(tr);
    }
  }

  // -----------------------------
  // År/Månad dropdowns
  // -----------------------------
  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");

    // samla år från data + nuvarande år
    const yearsSeen = new Set();
    const curY = new Date().getFullYear();
    yearsSeen.add(curY);

    Object.keys(allData).forEach(mKey=>{
      (allData[mKey]||[]).forEach(r=>{
        if(!r.datum) return;
        const y=(new Date(r.datum)).getFullYear();
        if(!isNaN(y)) yearsSeen.add(y);
      });
    });

    const yearsSorted=[...yearsSeen].sort((a,b)=>a-b);
    ySel.innerHTML = yearsSorted.map(y=>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");

    // Månader som namn
    const monthNames=[
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];
    const curM = new Date().getMonth()+1;
    mSel.innerHTML = monthNames.map((name,i)=>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  // -----------------------------
  // Backup / Import / Clear
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
      alert("Import klar.");
    });
  }

  function clearAllDataConfirm(){
    // din text: "RENSA ALLT"
    const areYouSure = prompt('Skriv "RENSA ALLT" för att ta bort all data permanent:');
    if(areYouSure!=="RENSA ALLT") return;
    allData={};
    localStorage.setItem(DATA_KEY,JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
    renderAlarms();
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