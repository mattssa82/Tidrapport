// app.js
// Tidrapport v10.26
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION = "10.26";
  const DATA_KEY = "tidrapport_data_v10";         // { "1":[...], "2":[...], ... }
  const SETTINGS_KEY = "tidrapport_settings_v10"; // { company,name,emp,redDays,showRedDays,autoBackup,... }

  // State
  let allData = {};   // månadsnummer -> array av rader { _id, datum, projekt, kategori, tid, kortid, beskrivning }
  let settings = {};
  let editId = null;  

  // Kategorier (dropdown)
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
    "Tjänstledig",
    "Traktamente"
  ];

  // ===== Helpers =====
  function get(id){ return document.getElementById(id); }

  function normMinus(s){ return (s||"").replace(/[–—−]/g,"-"); }

  function toNumStrict(s){
    s = normMinus(String(s??"").trim()).replace(",",".");
    if(s==="") return 0;
    if(!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
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
    initMenuToggle();

    setupCategoryRows();
    bindUI();

    renderMonth();
    renderYearOverview();
    renderAlarms();

    // SW
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js");
    }

    if(window.lucide) lucide.createIcons();
  });

  // ===== Data =====
  function loadData(){
    try{
      allData = JSON.parse(localStorage.getItem(DATA_KEY)||"{}") || {};
    }catch{
      allData = {};
    }
  }

  function saveData(reason){
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    if(typeof window.autoLocalBackup === "function"){
      window.autoLocalBackup(reason||"save");
    }
  }

  // ===== Settings =====
  function loadSettings(){
    try{
      settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}") || {};
    }catch{
      settings = {};
    }

    get("companyInput").value = settings.company||"";
    get("nameInput").value = settings.name||"";
    get("anstnrInput").value = settings.emp||"";
    get("redDaysInput").value = settings.redDays||"";
    get("showRedDaysChk").checked = !!settings.showRedDays;
    get("autoBackupChk").checked = !!settings.autoBackup;

    // toggle pills
    syncTogglePill("toggleShowRedDays","showRedDaysChk");
    syncTogglePill("toggleAutoBackup","autoBackupChk");
  }

  function saveSettingsFromUI(){
    settings.company = (get("companyInput").value||"").trim();
    settings.name    = (get("nameInput").value||"").trim();
    settings.emp     = (get("anstnrInput").value||"").trim();
    settings.redDays = (get("redDaysInput").value||"").trim();
    settings.showRedDays = !!get("showRedDaysChk").checked;
    settings.autoBackup  = !!get("autoBackupChk").checked;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if(typeof window.autoLocalBackup === "function"){
      window.autoLocalBackup("settings");
    }
    alert("Inställningar sparade.");
    renderMonth();
    renderYearOverview();
    renderAlarms();
  }

  function syncTogglePill(pillId, chkId){
    const pill=get(pillId), chk=get(chkId);
    if(!pill||!chk) return;
    pill.classList.toggle("on", !!chk.checked);
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
      document.body.style.overflow = willOpen ? "hidden" : "";
    });

    // klick utanför stänger
    document.addEventListener("click", e => {
      if(!panel.contains(e.target) && !btn.contains(e.target)){
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden","true");
        btn.setAttribute("aria-expanded","false");
        document.body.style.overflow="";
      }
    });
  }

  // ===== Period selectors =====
  function populateYearMonthSelectors(){
    const ysel=get("yearSelect");
    const msel=get("monthSelect");
    if(!ysel||!msel) return;

    const now=new Date();
    const curY=now.getFullYear();
    const curM=now.getMonth()+1;

    const years=new Set([curY-1,curY,curY+1]);
    Object.values(allData).forEach(arr=>{
      (arr||[]).forEach(r=>{
        if(r?.datum){
          const y=new Date(r.datum).getFullYear();
          if(!isNaN(y)) years.add(y);
        }
      });
    });

    const ySorted=[...years].sort((a,b)=>a-b);
    ysel.innerHTML = ySorted.map(y=>`<option value="${y}" ${y===curY?"selected":""}>${y}</option>`).join("");

    const monthNames=["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
    msel.innerHTML = monthNames.map((name,i)=>`<option value="${i+1}" ${(i+1)===curM?"selected":""}>${name}</option>`).join("");

    ysel.onchange = ()=>{ renderMonth(); renderYearOverview(); renderAlarms(); };
    msel.onchange = ()=>{ renderMonth(); renderAlarms(); };
  }

  // ===== UI bind =====
  function bindUI(){
    get("openHelpBtn").onclick = ()=>location.href="help.html";
    get("openSearchBtn").onclick = ()=>location.href="search.html";

    get("saveEntryBtn").onclick = onSaveEntry;
    get("cancelEditBtn").onclick = cancelEdit;

    get("manualBackupBtn").onclick = ()=>window.manualBackup && window.manualBackup();
    get("manualBackupBtn2").onclick = ()=>window.manualBackup && window.manualBackup();

    get("importFileInput").onchange = onImportFileInputChange;

    get("exportCsvBtn").onclick = ()=>window.exportCSVImpl && window.exportCSVImpl(flattenDataForExportMonth(),settings,get("yearSelect").value,get("monthSelect").value);
    get("exportPdfBtn").onclick = ()=>window.exportPDFImpl && window.exportPDFImpl(flattenDataForExportMonth(),settings,get("yearSelect").value,get("monthSelect").value);
    get("exportYearBtn").onclick = ()=>window.exportYearImpl && window.exportYearImpl(flattenDataFullYear(),settings);

    get("saveSettingsBtn").onclick = saveSettingsFromUI;

    // toggle pills click
    get("toggleShowRedDays").onclick = ()=>{
      const chk=get("showRedDaysChk");
      chk.checked=!chk.checked;
      syncTogglePill("toggleShowRedDays","showRedDaysChk");
    };
    get("toggleAutoBackup").onclick = ()=>{
      const chk=get("autoBackupChk");
      chk.checked=!chk.checked;
      syncTogglePill("toggleAutoBackup","autoBackupChk");
    };
  }

  // ===== Category rows =====
  function setupCategoryRows(){
    const c=get("catRowsContainer");
    if(!c) return;
    c.innerHTML="";
    addCategoryRow();
    get("addCatRowBtn").onclick = ()=>addCategoryRow();
  }

  function addCategoryRow(cat="",hours=""){
    const c=get("catRowsContainer");
    const d=document.createElement("div");
    d.className="cat-row";

    const select=document.createElement("select");
    select.className="cat-name";
    select.innerHTML = `<option value="">(välj)</option>` + DEFAULT_CATS.map(x=>`<option>${x}</option>`).join("");
    select.value=cat;

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.className="cat-hours";
    input.value=hours;

    const btn=document.createElement("button");
    btn.type="button";
    btn.className="remove-cat-btn";
    btn.innerHTML = `<i data-lucide="minus"></i>`;
    btn.onclick=()=>d.remove();

    d.appendChild(select);
    d.appendChild(input);
    d.appendChild(btn);
    c.appendChild(d);

    if(window.lucide) lucide.createIcons();
  }

  function readCategoryRows(){
    const rows=[];
    document.querySelectorAll(".cat-row").forEach(r=>{
      const cat=r.querySelector(".cat-name")?.value?.trim()||"";
      const raw=r.querySelector(".cat-hours")?.value||"";
      if(!cat && !raw.trim()) return;

      if(!cat) throw new Error("Välj kategori på rader som har tid.");

      const val = toNumStrict(raw);
      if(isNaN(val)) throw new Error("Ogiltig tid. Tillåtna tecken: 0–9, . , -");

      rows.push({kategori:cat, tid:val});
    });
    if(!rows.length) throw new Error("Minst en kategori-rad krävs.");
    return rows;
  }

  function genRowId(){
    return Date.now()+"_"+Math.floor(Math.random()*1e6);
  }

  // ===== Save entry =====
  function onSaveEntry(){
    const datum=get("dateInput").value;
    const projekt=sanitizeProject(get("projektInput").value);
    const drive=toNumStrict(get("driveHoursInput").value);
    const note=(get("noteInput").value||"").trim();

    if(!datum){ alert("Datum krävs."); return; }
    if(!projekt){ alert("Projekt nr krävs."); return; }
    if(!note){ alert("Dagboksanteckning krävs."); return; }
    if(isNaN(drive)){ alert("Ogiltig körtid."); return; }

    let cats;
    try{ cats=readCategoryRows(); }
    catch(e){ alert(e.message); return; }

    const d=new Date(datum);
    const month=d.getMonth()+1;
    if(!allData[month]) allData[month]=[];

    const id=editId||genRowId();

    // om edit: ta bort gamla rader i gruppen
    if(editId){
      allData[month]=allData[month].filter(r=>r._id!==editId);
    }

    // Spara en rad per kategori (körtid på första)
    cats.forEach((c,i)=>{
      allData[month].push({
        _id:id,
        datum,
        projekt,
        kategori:c.kategori,
        tid:c.tid,
        kortid: i===0 ? drive : 0,
        beskrivning: note
      });
    });

    saveData("add");
    location.reload();
  }

  function cancelEdit(){ location.reload(); }

  // ===== Export helpers =====
  function flattenDataForExportMonth(){
    const m=parseInt(get("monthSelect").value,10);
    return (allData[m]||[]).slice();
  }

  function flattenDataFullYear(){
    const out=[];
    Object.values(allData).forEach(a=>a.forEach(r=>out.push(r)));
    return out;
  }

  // ===== Rendering =====
  function renderMonth(){
    const tbody=get("monthTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const year=parseInt(get("yearSelect").value,10);
    const month=parseInt(get("monthSelect").value,10);
    const rows=(allData[month]||[]).filter(r=>{
      const d=new Date(r.datum);
      return d.getFullYear()===year;
    }).slice().sort((a,b)=>(a.datum||"").localeCompare(b.datum||""));

    let statusMap={};
    try{
      if(window.BalansRegler?.buildDayStatusMap){
        statusMap = window.BalansRegler.buildDayStatusMap(rows, settings, year, month) || {};
      }
    }catch{}

    let lastWeek=null;
    rows.forEach(r=>{
      const week=getISOWeek(new Date(r.datum));
      if(week!==lastWeek){
        const wtr=document.createElement("tr");
        wtr.className="week-row";
        wtr.innerHTML=`<td colspan="7">Vecka ${week}</td>`;
        tbody.appendChild(wtr);
        lastWeek=week;
      }

      const tr=document.createElement("tr");
      const st=statusMap[r.datum]?.status;
      if(st) tr.classList.add("dagstatus--"+st);

      tr.innerHTML=`
        <td>${r.datum||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${r.tid ?? ""}</td>
        <td>${r.kortid ?? ""}</td>
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
        const id=btn.getAttribute("data-id");
        const act=btn.getAttribute("data-action");
        if(act==="delete") deleteGroup(id);
        if(act==="edit") editGroup(id);
      });
    });

    renderMonthSummary(rows);
    if(window.lucide) lucide.createIcons();
  }

  function renderMonthSummary(rows){
    const cell=get("monthSummaryCell");
    if(!cell) return;

    const sum = {
      ordinarie:0, kortid:0, flextid:0,
      ot_lt2:0, ot_gt2:0, ot_helg:0,
      semester:0, atf:0, vab:0, sjuk:0, fl:0, tl:0,
      trakt:0
    };

    rows.forEach(r=>{
      const n=(r.kategori||"").toLowerCase();
      const h=parseFloat(r.tid)||0;

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

    const f=v=>(Math.round(v*100)/100).toFixed(2);

    cell.textContent =
      `Ordinarie: ${f(sum.ordinarie)}h | `+
      `Körtid: ${f(sum.kortid)}h | `+
      `Flex: ${f(sum.flextid)}h | `+
      `ÖT<2: ${f(sum.ot_lt2)}h | `+
      `ÖT>2: ${f(sum.ot_gt2)}h | `+
      `Helg: ${f(sum.ot_helg)}h | `+
      `Semester: ${f(sum.semester)}h | `+
      `ATF: ${f(sum.atf)}h | `+
      `VAB: ${f(sum.vab)}h | `+
      `Sjuk: ${f(sum.sjuk)}h | `+
      `FL: ${f(sum.fl)}h | `+
      `TL: ${f(sum.tl)}h | `+
      `Trakt: ${sum.trakt} st`;
  }

  function renderYearOverview(){
    const tbody = get("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const monthNames = {
      1:"Januari",2:"Februari",3:"Mars",4:"April",5:"Maj",6:"Juni",
      7:"Juli",8:"Augusti",9:"September",10:"Oktober",11:"November",12:"December"
    };

    const fmt = v => (v && Math.abs(v) > 0 ? v.toFixed(2) : "");
    const fmtInt = v => (v && v !== 0 ? String(v) : "");

    for(let m=1;m<=12;m++){
      const arr = allData[m]||[];
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

      arr.forEach(r=>{
        const n = (r.kategori||"").toLowerCase();
        const h = parseFloat(r.tid)||0;

        if(n.includes("ordinarie")) sum.ordinarie+=h;
        if(n.includes("flex"))      sum.flextid+=h;
        if(n.includes("övertid") && n.includes("<2")) sum.ot_lt2+=h;
        if(n.includes("övertid") && n.includes(">2")) sum.ot_gt2+=h;
        if(n.includes("övertid-helg")) sum.ot_helg+=h;

        if(n.includes("semest")) sum.semester+=h;
        if(n.includes("atf"))    sum.atf+=h;
        if(n.includes("vab"))    sum.vab+=h;
        if(n.includes("sjuk"))   sum.sjuk+=h;
        if(n.includes("föräldral")) sum.fl+=h;
        if(n.includes("tjänstledig")) sum.tl+=h;

        if(n.includes("trakt")) sum.trakt+=1;

        sum.kortid += parseFloat(r.kortid)||0;
      });

      const tr=document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m]}</td>
        <td>${fmt(sum.ordinarie)}</td>
        <td>${fmt(sum.kortid)}</td>
        <td>${fmt(sum.flextid)}</td>
        <td>${fmt(sum.ot_lt2)}</td>
        <td>${fmt(sum.ot_gt2)}</td>
        <td>${fmt(sum.ot_helg)}</td>
        <td>${fmt(sum.semester)}</td>
        <td>${fmt(sum.atf)}</td>
        <td>${fmt(sum.vab)}</td>
        <td>${fmt(sum.sjuk)}</td>
        <td>${fmt(sum.fl)}</td>
        <td>${fmt(sum.tl)}</td>
        <td>${fmtInt(sum.trakt)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderAlarms(){
    const list=get("alarmList");
    if(!list) return;
    list.innerHTML="";

    const year=parseInt(get("yearSelect").value,10);
    const month=parseInt(get("monthSelect").value,10);
    const rows=(allData[month]||[]).filter(r=>new Date(r.datum).getFullYear()===year);

    let map={};
    try{
      if(window.BalansRegler?.buildDayStatusMap){
        map = window.BalansRegler.buildDayStatusMap(rows, settings, year, month) || {};
      }
    }catch{}

    const alarms=[];
    Object.keys(map).sort().forEach(ds=>{
      const st=map[ds]?.status;
      if(st==="saknas"){
        alarms.push({type:"red", date:ds, msg:"Ingen registrering denna vardag."});
      }else if(st==="orange_under"){
        alarms.push({type:"yellow", date:ds, msg:"Under 8 timmar denna dag."});
      }else if(st==="orange_absence"){
        alarms.push({type:"yellow", date:ds, msg:"Frånvaro (VAB / Sjuk / FL / TL) denna dag."});
      }
    });

    if(!alarms.length){
      const li=document.createElement("li");
      li.innerHTML=`
        <span class="alarm-icon alarm-icon--blue">i</span>
        <span class="alarm-text"><span class="date">Info</span><span class="msg">Inga larm denna månad.</span></span>
      `;
      list.appendChild(li);
      return;
    }

    alarms.forEach(a=>{
      const li=document.createElement("li");
      const cls=a.type==="red" ? "alarm-icon--red" : "alarm-icon--yellow";
      li.innerHTML=`
        <span class="alarm-icon ${cls}">!</span>
        <span class="alarm-text"><span class="date">${a.date}</span><span class="msg">${a.msg}</span></span>
      `;
      list.appendChild(li);
    });
  }

  function deleteGroup(id){
    const month=parseInt(get("monthSelect").value,10);
    if(!confirm("Radera denna registrering?")) return;
    allData[month]=(allData[month]||[]).filter(r=>r._id!==id);
    saveData("delete");
    renderMonth(); renderYearOverview(); renderAlarms();
  }

  function editGroup(id){
    const month=parseInt(get("monthSelect").value,10);
    const group=(allData[month]||[]).filter(r=>r._id===id);
    if(!group.length) return;

    editId=id;
    get("saveEntryLabel").textContent="Spara";
    get("cancelEditBtn").style.display="inline-flex";

    get("dateInput").value=group[0].datum||"";
    get("projektInput").value=group[0].projekt||"";
    get("driveHoursInput").value=group[0].kortid ?? "";
    get("noteInput").value=group[0].beskrivning||"";

    const c=get("catRowsContainer");
    c.innerHTML="";
    group.forEach(r=>addCategoryRow(r.kategori||"", r.tid ?? ""));

    if(window.lucide) lucide.createIcons();
  }

  // ISO week
  function getISOWeek(d){
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function onImportFileInputChange(e){
    const f=e.target.files?.[0];
    if(!f) return;
    if(window.importBackupFile){
      window.importBackupFile(f, payload=>{
        if(payload?.data){
          allData=payload.data;
          settings=payload.settings||settings;
          localStorage.setItem(DATA_KEY, JSON.stringify(allData));
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          if(typeof window.autoLocalBackup === "function"){
            window.autoLocalBackup("import");
          }
          location.reload();
        }
      });
    }
  }

})();