// app.js
// Tidrapport v10.26
// i samarbete med ChatGPT & Martin Mattsson
//
// Huvudapp: inmatning, månadsvy, årsöversikt, larm/obalans, settings, hooks för export/backup.

"use strict";

(function(){

  const DATA_KEY     = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";
  const APP_VERSION  = "10.26";

  // ===== DOM helpers =====
  const $ = (id)=>document.getElementById(id);

  // ===== State =====
  let allData = {};    // { monthNumber: [rows...] }
  let settings = {};
  let editId = null;   // om vi redigerar en inmatning (grupp av rader)

  // ===== Kategorier =====
  // (visas i dropdown i inmatningen)
  const DEFAULT_CATS = [
    "Ordinarie tid",
    "Flextid",
    "Semester",
    "ATF",
    "ATF-tim",
    "Övertid <2",
    "Övertid >2",
    "Övertid-Helg",
    "VAB",
    "Sjuk",
    "Sjuk-tim",
    "Föräldraledig",
    "Tjänstledig",
    "Traktamente"
  ];

  // ===== Util: parse numeriska fält (stöd för - och .) =====
  function normMinus(str){
    return (str||"").replace(/[–—−]/g,"-");
  }

  function parseNum(str){
    if(str==null) return NaN;
    const s = normMinus(String(str)).trim().replace(",",".");
    if(s==="") return 0;
    const ok = /^-?\d+(\.\d+)?$/.test(s);
    if(!ok) return NaN;
    return parseFloat(s);
  }

  function format2(n){
    return (Math.round((n||0)*100)/100).toFixed(2);
  }

  function monthName(m){
    const names=["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
    return names[(m-1)] || "";
  }

  // ===== Load / Save =====
  function loadAll(){
    try{
      allData = JSON.parse(localStorage.getItem(DATA_KEY)||"{}") || {};
    }catch{
      allData = {};
    }
    try{
      settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}") || {};
    }catch{
      settings = {};
    }
  }

  function persistAll(reason){
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    if(typeof window.autoLocalBackup === "function"){
      window.autoLocalBackup(reason||"save");
    }
  }

  // ===== UI init =====
  document.addEventListener("DOMContentLoaded", () => {
    loadAll();
    initSelectors();
    initSettingsUI();
    initCategoryRowsUI();
    initButtons();
    initMenuToggle();

    renderMonthTable();
    renderYearTable();
    renderAlarms();

    // icon refresh
    if(window.lucide) lucide.createIcons();

    // SW
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js");
    }
  });

  // ===== Menu toggle (aria-hidden fix kvar som i v10.25) =====
  function initMenuToggle(){
    const btn = $("menuToggleBtn");
    const panel = $("sidePanel");
    if(!btn || !panel) return;

    function setOpen(open){
      panel.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      panel.setAttribute("aria-hidden", open ? "false" : "true");
    }

    btn.addEventListener("click", ()=>{
      const open = !panel.classList.contains("open");
      setOpen(open);
    });

    // stäng vid klick utanför (valfritt, men skönt)
    document.addEventListener("click",(e)=>{
      if(!panel.classList.contains("open")) return;
      if(panel.contains(e.target) || btn.contains(e.target)) return;
      setOpen(false);
    });
  }

  // ===== Period selectors =====
  function initSelectors(){
    const ysel = $("yearSelect");
    const msel = $("monthSelect");
    if(!ysel || !msel) return;

    const cur = new Date();
    const curY = cur.getFullYear();
    const curM = cur.getMonth()+1;

    // år: nuvarande +- 2 (men inkludera år som finns i data)
    const years = new Set([curY-1, curY, curY+1]);
    Object.keys(allData).forEach(mKey=>{
      (allData[mKey]||[]).forEach(r=>{
        if(r.datum){
          const y = new Date(r.datum).getFullYear();
          if(!isNaN(y)) years.add(y);
        }
      });
    });

    const ySorted = [...years].sort((a,b)=>a-b);
    ysel.innerHTML = ySorted.map(y=>`<option value="${y}" ${y===curY?"selected":""}>${y}</option>`).join("");

    msel.innerHTML = Array.from({length:12},(_,i)=>{
      const m=i+1;
      return `<option value="${m}" ${m===curM?"selected":""}>${monthName(m)}</option>`;
    }).join("");

    ysel.addEventListener("change", ()=>{
      renderMonthTable();
      renderYearTable();
      renderAlarms();
    });

    msel.addEventListener("change", ()=>{
      renderMonthTable();
      renderAlarms();
    });
  }

  // ===== Settings UI =====
  function initSettingsUI(){
    $("companyInput").value = settings.company||"";
    $("nameInput").value    = settings.name||"";
    $("anstnrInput").value  = settings.emp||"";
    $("redDaysInput").value = settings.redDays||"";

    $("showRedDaysChk").checked = !!settings.showRedDays;
    $("autoBackupChk").checked  = !!settings.autoBackup;

    // toggles visual
    syncTogglePill("toggleShowRedDays","showRedDaysChk");
    syncTogglePill("toggleAutoBackup","autoBackupChk");

    $("toggleShowRedDays").addEventListener("click", ()=>{
      $("showRedDaysChk").checked = !$("showRedDaysChk").checked;
      syncTogglePill("toggleShowRedDays","showRedDaysChk");
    });
    $("toggleAutoBackup").addEventListener("click", ()=>{
      $("autoBackupChk").checked = !$("autoBackupChk").checked;
      syncTogglePill("toggleAutoBackup","autoBackupChk");
    });

    $("saveSettingsBtn").addEventListener("click", ()=>{
      settings.company = ($("companyInput").value||"").trim();
      settings.name    = ($("nameInput").value||"").trim();
      settings.emp     = ($("anstnrInput").value||"").trim();
      settings.redDays = ($("redDaysInput").value||"").trim();
      settings.showRedDays = $("showRedDaysChk").checked;
      settings.autoBackup  = $("autoBackupChk").checked;

      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      if(typeof window.autoLocalBackup === "function"){
        window.autoLocalBackup("settings");
      }
      alert("Inställningar sparade.");
      renderMonthTable();
      renderYearTable();
      renderAlarms();
    });
  }

  function syncTogglePill(pillId, chkId){
    const pill = $(pillId);
    const chk = $(chkId);
    if(!pill || !chk) return;
    pill.classList.toggle("on", !!chk.checked);
  }

  // ===== Category rows UI =====
  function initCategoryRowsUI(){
    $("addCatRowBtn").addEventListener("click", ()=>{
      addCatRow();
    });
    // start med en rad
    addCatRow();
  }

  function addCatRow(catValue="", hoursValue=""){
    const wrap = $("catRowsContainer");
    const row = document.createElement("div");
    row.className="cat-row";

    const select = document.createElement("select");
    select.className="catSelect";
    select.innerHTML = `<option value="">(välj)</option>` + DEFAULT_CATS.map(c=>`<option value="${c}">${c}</option>`).join("");
    select.value = catValue;

    const input = document.createElement("input");
    input.type="text";
    input.className="catHours";
    input.value = hoursValue;

    const btn = document.createElement("button");
    btn.type="button";
    btn.className="remove-cat-btn";
    btn.innerHTML = `<i data-lucide="x"></i>`;
    btn.addEventListener("click", ()=> row.remove());

    row.appendChild(select);
    row.appendChild(input);
    row.appendChild(btn);
    wrap.appendChild(row);

    if(window.lucide) lucide.createIcons();
  }

  function readCatRows(){
    const rows = [];
    const catsInUse = new Set();

    document.querySelectorAll("#catRowsContainer .cat-row").forEach(r=>{
      const cat = (r.querySelector("select")?.value||"").trim();
      const tidRaw = r.querySelector("input")?.value||"";
      if(!cat && !tidRaw.trim()) return;

      if(!cat){
        throw new Error("Välj kategori på alla rader som har tid.");
      }
      if(catsInUse.has(cat.toLowerCase())){
        throw new Error("Du kan inte ha samma kategori två gånger i samma inmatning.");
      }
      catsInUse.add(cat.toLowerCase());

      const tid = parseNum(tidRaw);
      if(isNaN(tid)){
        throw new Error("Ogiltig tid – använd 0–9, . och -");
      }

      rows.push({kategori:cat, tid});
    });

    if(!rows.length){
      throw new Error("Minst en kategori-rad krävs.");
    }
    return rows;
  }

  // ===== Buttons =====
  function initButtons(){
    $("openHelpBtn").addEventListener("click", ()=> location.href="help.html");
    $("openSearchBtn").addEventListener("click", ()=> location.href="search.html");

    $("saveEntryBtn").addEventListener("click", onSaveEntry);
    $("cancelEditBtn").addEventListener("click", ()=> resetEntryForm());

    $("manualBackupBtn").addEventListener("click", ()=> window.manualBackup && window.manualBackup());
    $("manualBackupBtn2").addEventListener("click", ()=> window.manualBackup && window.manualBackup());

    $("importFileInput").addEventListener("change", (e)=>{
      const f = e.target.files?.[0];
      if(!f) return;
      window.importBackupFile && window.importBackupFile(f, (payload)=>{
        if(payload && payload.data){
          allData = payload.data;
          settings = payload.settings || settings;
          localStorage.setItem(DATA_KEY, JSON.stringify(allData));
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          if(typeof window.autoLocalBackup === "function"){
            window.autoLocalBackup("import");
          }
          alert("Import klar.");
          location.reload();
        }
      });
    });

    $("exportCsvBtn").addEventListener("click", ()=>{
      const rows = getRowsForMonth();
      window.exportCSVImpl && window.exportCSVImpl(rows, settings, $("yearSelect").value, $("monthSelect").value);
    });
    $("exportPdfBtn").addEventListener("click", ()=>{
      const rows = getRowsForMonth();
      window.exportPDFImpl && window.exportPDFImpl(rows, settings, $("yearSelect").value, $("monthSelect").value);
    });
    $("exportYearBtn").addEventListener("click", ()=>{
      const rows = flattenAllRows();
      window.exportYearImpl && window.exportYearImpl(rows, settings);
    });

    $("clearAllBtn").addEventListener("click", ()=>{
      window.resetAll && window.resetAll();
    });
  }

  // ===== Save entry =====
  function onSaveEntry(){
    try{
      const datum = $("dateInput").value;
      const projekt = ($("projektInput").value||"").trim();
      const kortidRaw = ($("driveHoursInput").value||"").trim();
      const beskrivning = ($("noteInput").value||"").trim();

      if(!datum){
        alert("Välj datum.");
        return;
      }
      if(!projekt){
        alert("Fyll i projekt nr.");
        return;
      }
      if(!beskrivning){
        alert("Fyll i dagboksanteckning.");
        return;
      }

      const kortid = parseNum(kortidRaw);
      if(isNaN(kortid)){
        alert("Ogiltig körtid – använd 0–9, . och -");
        return;
      }

      const catRows = readCatRows();

      // regler: ordinarie får inte kombineras med vissa negativa i samma inmatning
      const lowerCats = catRows.map(r=>(r.kategori||"").toLowerCase());
      const hasOrdinarie = lowerCats.some(c=>c.includes("ordinarie"));
      const hasAbsence = lowerCats.some(c=>["vab","sjuk","föräldraledig","föräldraledighet","tjänstledig"].some(a=>c.includes(a)));
      if(hasOrdinarie && hasAbsence){
        alert("Ordinarie tid får inte kombineras med VAB/Sjuk/FL/TL i samma inmatning.");
        return;
      }

      // ordinarie får inte kombineras med negativ flextid/atf/övertid/semester/trakt
      const negWorkCats = ["flextid","atf","atf-tim","övertid","semester","trakt"];
      const hasNegOther = catRows.some(r=>{
        const c=(r.kategori||"").toLowerCase();
        const isIn = negWorkCats.some(n=>c.includes(n));
        return isIn && (r.tid<0) && hasOrdinarie;
      });
      if(hasNegOther){
        alert("Ordinarie tid får inte kombineras med negativa timmar på Flex/ATF/ÖT/Semester/Trakt i samma inmatning. Lägg negativa i en egen inmatning.");
        return;
      }

      // spara
      const d = new Date(datum);
      const m = d.getMonth()+1;
      if(!allData[m]) allData[m]=[];

      const groupId = editId || (Date.now()+"_"+Math.random().toString(16).slice(2));

      // om redigering: ta bort gamla rader i gruppen
      if(editId){
        allData[m] = (allData[m]||[]).filter(r=>r._id !== editId);
      }

      catRows.forEach((r, idx)=>{
        allData[m].push({
          _id: groupId,
          datum,
          projekt,
          kategori: r.kategori,
          tid: r.tid,
          kortid: idx===0 ? kortid : 0,
          beskrivning
        });
      });

      persistAll("save-entry");
      resetEntryForm();
      renderMonthTable();
      renderYearTable();
      renderAlarms();

    }catch(err){
      alert(err.message || err);
    }
  }

  function resetEntryForm(){
    editId=null;
    $("dateInput").value="";
    $("projektInput").value="";
    $("driveHoursInput").value="";
    $("noteInput").value="";
    $("saveEntryLabel").textContent="Lägg till";
    $("cancelEditBtn").style.display="none";
    $("catRowsContainer").innerHTML="";
    addCatRow();
    if(window.lucide) lucide.createIcons();
  }

  // ===== Data helpers =====
  function getRowsForMonth(){
    const year = parseInt($("yearSelect").value,10);
    const month = parseInt($("monthSelect").value,10);
    const rows = (allData[month]||[]).filter(r=>{
      if(!r.datum) return false;
      const d = new Date(r.datum);
      return d.getFullYear()===year && (d.getMonth()+1)===month;
    });
    return rows;
  }

  function flattenAllRows(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=> out.push(r));
    });
    return out;
  }

  // ===== Render: month table =====
  function renderMonthTable(){
    const tbody = $("monthTableBody");
    tbody.innerHTML="";

    const rows = getRowsForMonth();

    // status map (balansregler)
    let statusMap = {};
    try{
      if(window.BalansRegler && typeof window.BalansRegler.buildDayStatusMap==="function"){
        // bygg med rows för månaden
        const y = parseInt($("yearSelect").value,10);
        const m = parseInt($("monthSelect").value,10);
        statusMap = window.BalansRegler.buildDayStatusMap(rows, settings, y, m) || {};
      }
    }catch{
      statusMap = {};
    }

    // sortera på datum
    rows.sort((a,b)=> (a.datum||"").localeCompare(b.datum||""));

    // bygg veckor
    let lastWeek = null;

    rows.forEach(r=>{
      const d = new Date(r.datum);
      const week = getISOWeek(d);
      if(week !== lastWeek){
        const wtr = document.createElement("tr");
        wtr.className="week-row";
        wtr.innerHTML = `<td colspan="7">Vecka ${week}</td>`;
        tbody.appendChild(wtr);
        lastWeek = week;
      }

      const tr = document.createElement("tr");

      // dagstatus färg
      const ds = statusMap[r.datum]?.status;
      if(ds){
        tr.classList.add("dagstatus--"+ds.replace(/\s/g,"_"));
      }

      tr.innerHTML = `
        <td>${r.datum||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${r.tid!=null ? r.tid : ""}</td>
        <td>${r.kortid!=null ? r.kortid : ""}</td>
        <td>${(r.beskrivning||"").replace(/\r?\n/g," ")}</td>
        <td>
          <button class="icon-table-btn" title="Redigera" data-action="edit" data-id="${r._id}">
            <i data-lucide="pencil"></i>
          </button>
          <button class="icon-table-btn" title="Radera" data-action="delete" data-id="${r._id}">
            <i class="trash-icon" data-lucide="trash-2"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("button[data-action]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-action");
        if(act==="delete") deleteGroup(id);
        if(act==="edit") editGroup(id);
      });
    });

    // uppdatera summary
    renderMonthSummary(rows);

    if(window.lucide) lucide.createIcons();
  }

  function renderMonthSummary(rows){
    const cell = $("monthSummaryCell");

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
      tl:0,
      trakt:0
    };

    rows.forEach(r=>{
      const name = (r.kategori||"").toLowerCase();
      const h = parseFloat(r.tid)||0;

      if(name.includes("ordinarie")) sum.ordinarie += h;
      if(name.includes("flex")) sum.flextid += h;

      if(name.includes("övertid") && name.includes("<2")) sum.ot_lt2 += h;
      if(name.includes("övertid") && name.includes(">2")) sum.ot_gt2 += h;
      if(name.includes("övertid-helg")) sum.ot_helg += h;

      if(name.includes("semest")) sum.semester += h;
      if(name.includes("atf")) sum.atf += h;
      if(name.includes("vab")) sum.vab += h;
      if(name.includes("sjuk")) sum.sjuk += h;
      if(name.includes("föräldral")) sum.fl += h;
      if(name.includes("tjänstledig")) sum.tl += h;

      if(name.includes("trakt")) sum.trakt += 1;

      sum.kortid += parseFloat(r.kortid)||0;
    });

    cell.textContent =
      `Ordinarie: ${format2(sum.ordinarie)}h | `+
      `Körtid: ${format2(sum.kortid)}h | `+
      `Flex: ${format2(sum.flextid)}h | `+
      `ÖT<2: ${format2(sum.ot_lt2)}h | `+
      `ÖT>2: ${format2(sum.ot_gt2)}h | `+
      `Helg: ${format2(sum.ot_helg)}h | `+
      `Semester: ${format2(sum.semester)}h | `+
      `ATF: ${format2(sum.atf)}h | `+
      `VAB: ${format2(sum.vab)}h | `+
      `Sjuk: ${format2(sum.sjuk)}h | `+
      `FL: ${format2(sum.fl)}h | `+
      `TL: ${format2(sum.tl)}h | `+
      `Trakt: ${sum.trakt} st`;
  }

  // ===== Render: year overview =====
  function renderYearTable(){
    const tbody = $("yearTableBody");
    tbody.innerHTML="";

    const year = parseInt($("yearSelect").value,10);

    for(let m=1;m<=12;m++){
      const rows = (allData[m]||[]).filter(r=>{
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear()===year && (d.getMonth()+1)===m;
      });

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
        tl:0,
        trakt:0
      };

      rows.forEach(r=>{
        const n = (r.kategori||"").toLowerCase();
        const h = parseFloat(r.tid)||0;

        if(n.includes("ordinarie")) sum.ordinarie+=h;
        if(n.includes("flex")) sum.flextid+=h;
        if(n.includes("övertid") && n.includes("<2")) sum.ot_lt2+=h;
        if(n.includes("övertid") && n.includes(">2")) sum.ot_gt2+=h;
        if(n.includes("övertid-helg")) sum.ot_helg+=h;
        if(n.includes("semest")) sum.semester+=h;
        if(n.includes("atf")) sum.atf+=h;
        if(n.includes("vab")) sum.vab+=h;
        if(n.includes("sjuk")) sum.sjuk+=h;
        if(n.includes("föräldral")) sum.fl+=h;
        if(n.includes("tjänstledig")) sum.tl+=h;
        if(n.includes("trakt")) sum.trakt+=1;

        sum.kortid += parseFloat(r.kortid)||0;
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthName(m)}</td>
        <td>${format2(sum.ordinarie)}</td>
        <td>${format2(sum.kortid)}</td>
        <td>${format2(sum.flextid)}</td>
        <td>${format2(sum.ot_lt2)}</td>
        <td>${format2(sum.ot_gt2)}</td>
        <td>${format2(sum.ot_helg)}</td>
        <td>${format2(sum.semester)}</td>
        <td>${format2(sum.atf)}</td>
        <td>${format2(sum.vab)}</td>
        <td>${format2(sum.sjuk)}</td>
        <td>${format2(sum.fl)}</td>
        <td>${format2(sum.tl)}</td>
        <td>${sum.trakt}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ===== Render: alarms =====
  function renderAlarms(){
    const list = $("alarmList");
    list.innerHTML="";

    const rows = getRowsForMonth();
    const year = parseInt($("yearSelect").value,10);
    const month = parseInt($("monthSelect").value,10);

    // status map från balansregler
    let map = {};
    try{
      if(window.BalansRegler && typeof window.BalansRegler.buildDayStatusMap==="function"){
        map = window.BalansRegler.buildDayStatusMap(rows, settings, year, month) || {};
      }
    }catch{
      map = {};
    }

    const alarms = [];
    Object.keys(map).sort().forEach(ds=>{
      const st = map[ds]?.status;
      if(st==="saknas"){
        alarms.push({
          type:"red",
          date:ds,
          msg:"Ingen registrering denna vardag."
        });
      }else if(st==="orange_under"){
        alarms.push({
          type:"yellow",
          date:ds,
          msg:"Under 8 timmar denna dag."
        });
      }else if(st==="orange_absence"){
        alarms.push({
          type:"yellow",
          date:ds,
          msg:"Frånvaro (VAB / Sjuk / FL / TL) denna dag."
        });
      }
    });

    if(!alarms.length){
      const li=document.createElement("li");
      li.innerHTML = `
        <span class="alarm-icon alarm-icon--blue">i</span>
        <span class="alarm-text">
          <span class="date">Info</span>
          <span class="msg">Inga larm denna månad.</span>
        </span>
      `;
      list.appendChild(li);
      return;
    }

    alarms.forEach(a=>{
      const li=document.createElement("li");
      const icon = a.type==="red" ? "!" : "!";
      const cls = a.type==="red" ? "alarm-icon--red" : "alarm-icon--yellow";
      li.innerHTML = `
        <span class="alarm-icon ${cls}">${icon}</span>
        <span class="alarm-text">
          <span class="date">${a.date}</span>
          <span class="msg">${a.msg}</span>
        </span>
      `;
      list.appendChild(li);
    });
  }

  // ===== Edit / delete =====
  function deleteGroup(id){
    const month = parseInt($("monthSelect").value,10);
    if(!confirm("Radera denna registrering?")) return;

    allData[month] = (allData[month]||[]).filter(r=>r._id!==id);
    persistAll("delete");
    renderMonthTable();
    renderYearTable();
    renderAlarms();
  }

  function editGroup(id){
    const month = parseInt($("monthSelect").value,10);
    const group = (allData[month]||[]).filter(r=>r._id===id);
    if(!group.length) return;

    editId=id;
    $("saveEntryLabel").textContent="Spara";
    $("cancelEditBtn").style.display="inline-flex";

    $("dateInput").value = group[0].datum || "";
    $("projektInput").value = group[0].projekt || "";
    $("driveHoursInput").value = (group[0].kortid!=null ? group[0].kortid : "");
    $("noteInput").value = group[0].beskrivning || "";

    $("catRowsContainer").innerHTML="";
    group.forEach(r=>{
      addCatRow(r.kategori||"", r.tid!=null ? r.tid : "");
    });

    if(window.lucide) lucide.createIcons();
  }

  // ISO week (enkel)
  function getISOWeek(d){
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

})();