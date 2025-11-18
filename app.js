// app.js
// Tidrapport v10.24
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION   = "10.24";
  const DATA_KEY      = "tidrapport_data_v10";
  const SETTINGS_KEY  = "tidrapport_settings_v10";

  // State
  let allData  = {};   // { "1":[{_id,datum,kategori,tid,projekt,kortid,beskrivning}], ... }
  let settings = {};
  let editId   = null;

  // ===== Helpers =====
  function get(id){ return document.getElementById(id); }

  function genRowId(){
    return Date.now() + "_" + Math.floor(Math.random()*1e6);
  }

  // minus-stöd, 0-9 . , -
  function normMinus(s){
    return (s||"").replace(/[–—−]/g,"-");
  }
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
    s=(s||"").normalize("NFC");
    return s.replace(/\s+/g,"").replace(/[^0-9A-Za-zÅÄÖåäö]/g,"");
  }

  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10);
    const m = parseInt(get("monthSelect").value,10);
    return [y,m];
  }

  // ===== Load / Save =====
  function loadData(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
      if(typeof allData!=="object" || !allData) allData={};
    }catch{
      allData={};
    }
  }

  function saveData(reason){
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup(reason||"data-change");
  }

  function loadSettings(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      settings = raw ? JSON.parse(raw) : {};
      if(typeof settings!=="object" || !settings) settings={};
    }catch{
      settings={};
    }

    get("companyInput").value     = settings.company     || "";
    get("nameInput").value        = settings.name        || "";
    get("anstnrInput").value      = settings.emp         || "";
    get("redDaysInput").value     = settings.redDays     || "";
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

  // ===== Kategorier =====
  const CAT_LIST = [
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

  const NEG_BANK_CATS = [
    "Flextid",
    "ATF-tim",
    "Övertid <2",
    "Övertid >2",
    "Övertid-Helg",
    "Semester"
  ];

  const ABSENCE_CATS = [
    "Sjuk",
    "VAB",
    "Föräldraledig"
  ];

  function createCatRow(initialCat="", initialHours=""){
    const cont = document.createElement("div");
    cont.className="cat-row";

    const sel = document.createElement("select");
    sel.className="cat-select";
    sel.innerHTML = `<option value="">(välj)</option>` +
      CAT_LIST.map(c=>`<option value="${c}">${c}</option>`).join("");
    sel.value = initialCat || "";

    const inp = document.createElement("input");
    inp.className="cat-hours";
    inp.type="text";
    inp.inputMode="decimal";
    inp.value = initialHours!==undefined ? initialHours : "";

    const btn = document.createElement("button");
    btn.type="button";
    btn.className="cat-remove";
    btn.innerHTML = `<i data-lucide="minus-circle"></i><span>Ta bort</span>`;
    btn.addEventListener("click", ()=>{
      cont.remove();
      if(window.lucide) lucide.createIcons();
    });

    cont.appendChild(sel);
    cont.appendChild(inp);
    cont.appendChild(btn);

    return cont;
  }

  function ensureAtLeastOneCatRow(){
    const holder = get("catRowsContainer");
    if(!holder.querySelector(".cat-row")){
      holder.appendChild(createCatRow());
    }
  }

  // ===== År/månad selectors =====
  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");

    const years = new Set();
    const curY  = new Date().getFullYear();
    years.add(curY);

    Object.keys(allData).forEach(mKey=>{
      (allData[mKey]||[]).forEach(r=>{
        if(!r.datum) return;
        const y = (new Date(r.datum)).getFullYear();
        if(!isNaN(y)) years.add(y);
      });
    });

    const list = [...years].sort((a,b)=>a-b);
    ySel.innerHTML = list.map(y=>`<option value="${y}" ${y===curY?"selected":""}>${y}</option>`).join("");

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];
    const curM = new Date().getMonth()+1;
    mSel.innerHTML = monthNames.map((name,i)=>
      `<option value="${i+1}" ${i+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  // ===== UI bindings =====
  function bindUI(){
    // inmatning
    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

    // kategorirader
    get("addCatRowBtn").addEventListener("click", ()=>{
      const holder = get("catRowsContainer");
      holder.appendChild(createCatRow());
      if(window.lucide) lucide.createIcons();
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

    // sök öppnas i samma flik (du har Hem-knapp där)
    get("openSearchBtn").addEventListener("click", ()=>{
      window.location.href="search.html";
    });

    // rensa allt
    get("clearAllBtn").addEventListener("click", resetAll);

    // inställningar
    get("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);

    // period
    get("yearSelect").addEventListener("change", ()=>{
      renderMonth();
      renderYearOverview();
    });
    get("monthSelect").addEventListener("change", renderMonth);

    // menytoggle
    initMenuToggle();

    // datum: klick öppnar picker om stöd
    const di = get("dateInput");
    if(di && di.showPicker){
      di.addEventListener("click", e=>{ e.target.showPicker(); });
    }
  }

  function initMenuToggle(){
    const panel = get("sidePanel");
    const btn   = get("menuToggleBtn");

    btn.addEventListener("click", ()=>{
      const willOpen = !panel.classList.contains("open");
      panel.classList.toggle("open", willOpen);
      panel.setAttribute("aria-hidden", willOpen ? "false":"true");
      btn.setAttribute("aria-expanded", willOpen ? "true":"false");
    });

    document.addEventListener("click", e=>{
      if(!panel.contains(e.target) && !btn.contains(e.target)){
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden","true");
        btn.setAttribute("aria-expanded","false");
      }
    });
  }

  // ===== Reset all (med prompt) =====
  window.resetAll = function(){
    const input = prompt("⚠️ RADERA ALL DATA.\nSkriv: RADERA ALLT");
    if(input!=="RADERA ALLT") return;
    allData={};
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
  };

  // ===== Spara rad =====
  function onSaveEntry(){
    const [year,month] = currentYearMonth();
    if(!allData[month]) allData[month]=[];

    const datum = get("dateInput").value;
    if(!datum){
      alert("Datum saknas.");
      return;
    }

    const projRaw  = get("projektInput").value.trim();
    const projekt  = projRaw; // vi vill inte alltid tvångssanera, exporten kan ändå använda
    if(!projekt){
      alert("Projekt nr saknas.");
      return;
    }

    const driveStr = get("driveHoursInput").value.trim();
    const driveNum = driveStr==="" ? 0 : parseHourInput(driveStr,true);
    if(isNaN(driveNum)){
      alert("Körtid (h) har ogiltigt format. Använd t.ex. 1,5 eller -2.");
      return;
    }

    const note = get("noteInput").value.trim();
    if(!note){
      alert("Dagboksanteckning saknas.");
      return;
    }

    // plocka kategorier
    const holder = get("catRowsContainer");
    const rows   = [...holder.querySelectorAll(".cat-row")];

    const catEntries = [];
    rows.forEach(r=>{
      const sel = r.querySelector(".cat-select");
      const inp = r.querySelector(".cat-hours");
      const cat = sel ? sel.value : "";
      const hrsRaw = inp ? inp.value.trim() : "";

      if(!cat && !hrsRaw) return; // helt tom rad

      const h = parseHourInput(hrsRaw,true);
      if(isNaN(h)){
        throw new Error("Ogiltigt tidsformat i kategori-rad.");
      }
      // både + och - timmar är ok (vi validerar sen)
      catEntries.push({kategori:cat, tid:h});
    });

    if(!catEntries.length){
      alert("Minst en kategori med tid krävs.");
      return;
    }

    // inga dubbletter
    const names = catEntries.map(c=>c.kategori).filter(Boolean);
    const nameSet = new Set(names);
    if(nameSet.size !== names.length){
      alert("Du kan inte ha samma kategori två gånger i samma inmatning.");
      return;
    }

    const hasOrdinarie = names.includes("Ordinarie tid");
    const hasAbsence   = names.some(n=>ABSENCE_CATS.includes(n));

    // blockera Ordinarie + VAB/Sjuk/FL i samma inmatning
    if(hasOrdinarie && hasAbsence){
      alert("Ordinarie tid kan inte kombineras i samma inmatning med VAB, Sjuk eller Föräldraledig.\nRegistrera dem på separata rader.");
      return;
    }

    // blockera konstiga -värden ihop med Ordinarie
    if(hasOrdinarie){
      for(const c of catEntries){
        if(c.tid<0 && !NEG_BANK_CATS.includes(c.kategori)){
          alert("Negativa timmar i '"+c.kategori+"' kan inte kombineras med Ordinarie tid.\nRegistrera detta separat.");
          return;
        }
      }
    }

    const rowId = editId || genRowId();

    // om redigering → ta bort gamla rader
    if(editId){
      allData[month] = (allData[month]||[]).filter(r=>r._id!==editId);
    }

    // skriv ut rader – första kategori får körtid + anteckning
    catEntries.forEach((c,idx)=>{
      allData[month].push({
        _id: rowId,
        datum,
        kategori: c.kategori,
        tid: c.tid,
        projekt,
        kortid: idx===0 ? driveNum : 0,
        beskrivning: idx===0 ? note : ""
      });
    });

    saveData(editId ? "edit-entry":"add-entry");
    clearForm();
    renderMonth();
    renderYearOverview();
  }

  function cancelEdit(){
    clearForm();
  }

  function clearForm(){
    editId=null;
    get("dateInput").value="";
    get("projektInput").value="";
    get("driveHoursInput").value="";
    get("noteInput").value="";
    get("saveEntryLabel").textContent="Lägg till";
    get("cancelEditBtn").style.display="none";

    const holder = get("catRowsContainer");
    holder.innerHTML="";
    ensureAtLeastOneCatRow();
    if(window.lucide) lucide.createIcons();
  }

  function startEdit(rowId){
    const [y,m]=currentYearMonth();
    const arr = allData[m]||[];
    const bundle = arr.filter(r=>r._id===rowId);
    if(!bundle.length) return;

    editId = rowId;
    const base = bundle[0];

    get("dateInput").value   = base.datum || "";
    get("projektInput").value= base.projekt || "";
    get("driveHoursInput").value = base.kortid || "";
    get("noteInput").value   = base.beskrivning || "";

    const holder = get("catRowsContainer");
    holder.innerHTML="";
    bundle.forEach((r)=>{
      holder.appendChild(createCatRow(r.kategori||"", r.tid!=null?r.tid:""));
    });
    ensureAtLeastOneCatRow();

    get("saveEntryLabel").textContent="Spara";
    get("cancelEditBtn").style.display="inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
    if(window.lucide) lucide.createIcons();
  }

  function deleteRow(rowId){
    const [y,m]=currentYearMonth();
    if(!confirm("Ta bort denna inmatning (alla tillhörande kategorirader)?")) return;
    allData[m] = (allData[m]||[]).filter(r=>r._id!==rowId);
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
  }

  // ===== Import / backup wrappers =====
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

  // ===== Flatten för export =====
  function flattenDataForExportMonth(){
    const [year,month]=currentYearMonth();
    return (allData[month]||[]).slice().sort((a,b)=>a.datum.localeCompare(b.datum));
  }

  function flattenDataFullYear(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=> out.push(r));
    });
    return out;
  }

  // ===== Rendering: Månad =====
  function renderMonth(){
    const [year,month] = currentYearMonth();
    const tbody = get("monthTableBody");
    tbody.innerHTML="";

    const rows = allData[month]||[];
    // sortera
    const sorted = rows.slice().sort((a,b)=>a.datum.localeCompare(b.datum));

    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(sorted, settings, year, month)
      : {};

    // vi vill kunna se vecka
    let lastWeek = null;

    sorted.forEach(r=>{
      const tr = document.createElement("tr");

      const stObj = statusMap[r.datum] || {};
      const st = stObj.status || "";

      if(st) tr.classList.add("dagstatus--"+st);

      // vecka
      const d = new Date(r.datum);
      const w = !isNaN(d) ? isoWeekNumber(d) : "";

      if(w!=="" && w!==lastWeek){
        tr.classList.add("week-separator-top");
        lastWeek = w;
      }

      tr.innerHTML = `
        <td>${r.datum||""}</td>
        <td>${w||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${(r.tid!=null?r.tid:0)}</td>
        <td>${(r.kortid!=null?r.kortid:0)}</td>
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

    renderMonthSummary(rows, statusMap);
    renderAlarms(statusMap, year, month);
  }

  function isoWeekNumber(d){
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((date - yearStart)/86400000)+1)/7);
    return weekNo;
  }

  function renderMonthSummary(rows, statusMap){
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
      fl:0,
      trakt:0,
      kortid:0
    };

    rows.forEach(r=>{
      const name = (r.kategori||"").toLowerCase();
      const h = parseFloat(r.tid)||0;

      if(name.includes("ordinarie")) sum.ordinarie+=h;
      if(name.includes("flex"))      sum.flextid+=h;
      if(name.includes("övertid") && name.includes("<2")) sum.ot_lt2+=h;
      if(name.includes("övertid") && name.includes(">2")) sum.ot_gt2+=h;
      if(name.includes("övertid") && name.includes("helg")) sum.ot_helg+=h;
      if(name.includes("semest"))   sum.semester+=h;
      if(name.includes("atf"))      sum.atf+=h;
      if(name.includes("vab"))      sum.vab+=h;
      if(name.includes("sjuk"))     sum.sjuk+=h;
      if(name.includes("föräld"))   sum.fl+=h;
      if(name.includes("trakt"))    sum.trakt += 1;

      sum.kortid += parseFloat(r.kortid)||0;
    });

    const parts = [];
    parts.push(`Ordinarie: ${sum.ordinarie.toFixed(2)}h`);
    parts.push(`Flex: ${sum.flextid.toFixed(2)}h`);
    parts.push(`ÖT <2: ${sum.ot_lt2.toFixed(2)}h`);
    parts.push(`ÖT >2: ${sum.ot_gt2.toFixed(2)}h`);
    parts.push(`ÖT-Helg: ${sum.ot_helg.toFixed(2)}h`);
    parts.push(`Semester: ${sum.semester.toFixed(2)}h`);
    parts.push(`ATF: ${sum.atf.toFixed(2)}h`);
    parts.push(`VAB: ${sum.vab.toFixed(2)}h`);
    parts.push(`Sjuk: ${sum.sjuk.toFixed(2)}h`);
    parts.push(`FL: ${sum.fl.toFixed(2)}h`);
    parts.push(`Trakt: ${sum.trakt} st`);
    parts.push(`Körtid: ${sum.kortid.toFixed(2)}h`);

    cell.textContent = parts.join(" | ");
  }

  // ===== Larm / obalans =====
  function renderAlarms(statusMap, year, month){
    const box = get("alarmList");
    if(!box) return;
    box.innerHTML="";

    const daysInMonth = new Date(year,month,0).getDate();
    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);

    const items = [];

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const info = statusMap[ds];
      if(!info) continue;

      const isPast = ds <= todayStr;

      if(info.status==="saknas" && isPast){
        items.push({date:ds,type:"red",msg:"Ingen registrering (vardag)"});
      }else if(info.status==="orange_under" && isPast){
        items.push({date:ds,type:"yellow",msg:"Under 8 h arbetad tid"});
      }else if(info.status==="orange_absence" && isPast){
        items.push({date:ds,type:"yellow",msg:"Frånvarodag (VAB/Sjuk/FL)"});
      }
      // helg/röddag visar vi inte som larm
    }

    if(!items.length){
      const okRow=document.createElement("div");
      okRow.className="alarm-row alarm-row--ok";
      okRow.innerHTML = `
        <span class="alarm-date"></span>
        <span class="alarm-msg">Inga varningar för vald månad. ✅</span>
        <span class="alarm-icon"></span>
      `;
      box.appendChild(okRow);
      return;
    }

    items.forEach(it=>{
      const row = document.createElement("div");
      row.className="alarm-row";
      const icon = it.type==="red"
        ? `<i data-lucide="alert-octagon"></i>`
        : `<i data-lucide="alert-triangle"></i>`;
      row.innerHTML = `
        <span class="alarm-date">${it.date}</span>
        <span class="alarm-msg">${it.msg}</span>
        <span class="alarm-icon">${icon}</span>
      `;
      box.appendChild(row);
    });

    if(window.lucide) lucide.createIcons();
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

    const sumsByMonth = {};
    for(let m=1;m<=12;m++){
      sumsByMonth[m] = {
        kortid:0,
        ordinarie:0,
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
    }

    Object.keys(allData).forEach(mKey=>{
      const m = parseInt(mKey,10);
      const arr = allData[mKey]||[];
      arr.forEach(r=>{
        if(!r.datum) return;
        const d = new Date(r.datum);
        const mm = d.getMonth()+1;
        const S = sumsByMonth[mm];
        if(!S) return;

        const name=(r.kategori||"").toLowerCase();
        const h=parseFloat(r.tid)||0;

        S.kortid += parseFloat(r.kortid)||0;

        if(name.includes("ordinarie")) S.ordinarie+=h;
        if(name.includes("flex"))      S.flextid+=h;
        if(name.includes("övertid") && name.includes("<2")) S.ot1+=h;
        if(name.includes("övertid") && name.includes(">2")) S.ot2+=h;
        if(name.includes("övertid") && name.includes("helg")) S.otHelg+=h;
        if(name.includes("semest"))   S.semester+=h;
        if(name.includes("atf"))      S.atf+=h;
        if(name.includes("vab"))      S.vab+=h;
        if(name.includes("sjuk"))     S.sjuk+=h;
        if(name.includes("föräld"))   S.fl+=h;
        if(name.includes("trakt"))    S.trakt+=1;
      });
    });

    for(let m=1;m<=12;m++){
      const S = sumsByMonth[m];
      const hasAny =
        S.kortid || S.ordinarie || S.flextid || S.ot1 || S.ot2 || S.otHelg ||
        S.semester || S.atf || S.vab || S.sjuk || S.fl || S.trakt;

      if(!hasAny){
        // rad utan siffror (bara rubrik + tomma)
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${monthNames[m]}</td>
          <td></td><td></td><td></td><td></td><td></td><td></td>
          <td></td><td></td><td></td><td></td><td></td><td></td>
        `;
        tbody.appendChild(tr);
        continue;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m]}</td>
        <td>${S.kortid.toFixed(2)}</td>
        <td>${S.ordinarie.toFixed(2)}</td>
        <td>${S.flextid.toFixed(2)}</td>
        <td>${S.ot1.toFixed(2)}</td>
        <td>${S.ot2.toFixed(2)}</td>
        <td>${S.otHelg.toFixed(2)}</td>
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

  // ===== Service worker =====
  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
        .then(()=>console.log("Service Worker registrerad (v"+APP_VERSION+")"))
        .catch(e=>console.warn("SW fel:",e));
    }
  }

  // ===== DOM ready =====
  document.addEventListener("DOMContentLoaded", ()=>{
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    ensureAtLeastOneCatRow();
    renderMonth();
    renderYearOverview();
    registerServiceWorker();
    if(window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" laddad ✅");
  });

})();