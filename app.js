// app.js
// Tidrapport v10.8
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){
  const APP_VERSION = "10.8";
  const DATA_KEY = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  let allData = {};
  let settings = {};
  let editId = null;

  document.addEventListener("DOMContentLoaded",()=>{
    loadSettings();
    loadData();
    populateSelectors();
    populateCategorySelect();
    bindUI();
    renderMonth();
    renderYearOverview();
    renderAlarms();
    registerServiceWorker();
    if(window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" klar ✅");
  });

  // ============ LOAD/SAVE ============
  function loadData(){
    try{
      allData = JSON.parse(localStorage.getItem(DATA_KEY)||"{}") || {};
    }catch{ allData={}; }
  }

  function saveData(reason){
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup(reason||"save");
  }

  function loadSettings(){
    try{
      settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}") || {};
    }catch{ settings={}; }

    get("companyInput").value = settings.company||"";
    get("nameInput").value = settings.name||"";
    get("anstnrInput").value = settings.emp||"";
    get("redDaysInput").value = settings.redDays||"";
    get("redDayHoursInput").value = settings.redDayHours||8;
    get("showRedDaysChk").checked = !!settings.showRedDays;
    get("autoBackupChk").checked = !!settings.autoBackup;
  }

  function saveSettings(){
    settings.company = get("companyInput").value.trim();
    settings.name = get("nameInput").value.trim();
    settings.emp = get("anstnrInput").value.trim();
    settings.redDays = get("redDaysInput").value.trim();
    settings.redDayHours = parseFloat(get("redDayHoursInput").value)||8;
    settings.showRedDays = get("showRedDaysChk").checked;
    settings.autoBackup = get("autoBackupChk").checked;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    alert("Inställningar sparade");
    renderMonth();
    renderYearOverview();
    renderAlarms();
    autoLocalBackup("settings");
  }

  // ============ HELPERS ============
  function get(id){ return document.getElementById(id); }
  function genId(){ return Date.now()+"_"+Math.floor(Math.random()*1e6); }
  function currentYM(){
    return [parseInt(get("yearSelect").value,10),parseInt(get("monthSelect").value,10)];
  }

  // ============ UI ============
  function bindUI(){
    get("saveEntryBtn").addEventListener("click",saveEntry);
    get("cancelEditBtn").addEventListener("click",resetForm);
    get("manualBackupBtn").addEventListener("click",manualBackup);
    get("manualBackupBtn2").addEventListener("click",manualBackup);
    get("importFileInput").addEventListener("change",importBackupHandler);
    get("exportCsvBtn").addEventListener("click",()=>exportCSVImpl(flatMonth(),settings,get("yearSelect").value,get("monthSelect").value));
    get("exportPdfBtn").addEventListener("click",()=>exportPDFImpl(flatMonth(),settings,get("yearSelect").value,get("monthSelect").value));
    get("exportYearBtn").addEventListener("click",()=>exportYearImpl(flatYear(),settings));
    get("clearAllBtn").addEventListener("click",clearAll);
    get("saveSettingsBtn").addEventListener("click",saveSettings);
    get("addExtraCatBtn").addEventListener("click",()=>addExtraCatRow());
    get("yearSelect").addEventListener("change",()=>{renderMonth();renderYearOverview();renderAlarms();});
    get("monthSelect").addEventListener("change",()=>{renderMonth();renderAlarms();});
    initMenu();
  }

  function initMenu(){
    const panel=get("sidePanel"),btn=get("menuToggleBtn");
    btn.addEventListener("click",()=>{panel.classList.toggle("open");});
    document.addEventListener("click",e=>{
      if(!panel.contains(e.target)&&!btn.contains(e.target)){panel.classList.remove("open");}
    });
  }

  // ============ SELECTS ============
  function populateSelectors(){
    const ySel=get("yearSelect"),mSel=get("monthSelect");
    const curY=new Date().getFullYear(),curM=new Date().getMonth()+1;
    const years=new Set([curY]);
    Object.values(allData).flat().forEach(r=>{
      if(r.datum){years.add(new Date(r.datum).getFullYear());}
    });
    ySel.innerHTML=[...years].sort((a,b)=>a-b).map(y=>`<option value="${y}"${y===curY?" selected":""}>${y}</option>`).join("");
    const months=["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
    mSel.innerHTML=months.map((n,i)=>`<option value="${i+1}"${i+1===curM?" selected":""}>${n}</option>`).join("");
  }

  function populateCategorySelect(){
    const CATS=["Ordinarie tid","Flextid","ATF-tim","Övertid <2","Övertid >2","Övertid-Helg","Semester","Sjuk","VAB","Föräldraledig","Traktamente"];
    const sel=get("catMainSelect");
    sel.innerHTML=`<option value="">(välj)</option>`+CATS.map(c=>`<option value="${c}">${c}</option>`).join("");
  }

  // ============ ADD/EDIT ============
  function addExtraCatRow(){
    const wrap=get("extraCatsContainer");
    const selList=Array.from(document.querySelectorAll(".extra-cat-sel")).map(e=>e.value);
    const nextId="ex_"+Math.random().toString(36).slice(2,7);
    const div=document.createElement("div");
    div.className="inline-flex-row";
    div.innerHTML=`
      <select class="extra-cat-sel">${get("catMainSelect").innerHTML}</select>
      <input class="extra-cat-hrs" type="number" step="0.25" min="-24" />
      <button class="icon-table-btn delExtraBtn" title="Ta bort"><i data-lucide="minus-circle"></i></button>
    `;
    wrap.appendChild(div);
    div.querySelector(".delExtraBtn").addEventListener("click",()=>{div.remove();});
    if(window.lucide) lucide.createIcons();
  }

  function saveEntry(){
    const [y,m]=currentYM();
    if(!allData[m]) allData[m]=[];
    const datum=get("dateInput").value;
    if(!datum){alert("Datum saknas.");return;}
    const projekt=get("projektInput").value.trim();
    const kortid=parseFloat(get("driveHoursInput").value)||0;
    const note=get("noteInput").value.trim();

    // huvud
    const catMain=get("catMainSelect").value, hrsMain=parseFloat(get("catMainHours").value)||0;
    const cats=[];
    if(catMain) cats.push({k:catMain,h:hrsMain});
    document.querySelectorAll("#extraCatsContainer .inline-flex-row").forEach(row=>{
      const k=row.querySelector(".extra-cat-sel").value, h=parseFloat(row.querySelector(".extra-cat-hrs").value)||0;
      if(k) cats.push({k,h});
    });
    // hindra dubblettkat
    const uniqueCats=[...new Map(cats.map(c=>[c.k,c])).values()];

    // ta bort ev gamla bundle
    if(editId){allData[m]=allData[m].filter(r=>r._id!==editId);}
    const id=editId||genId();
    uniqueCats.forEach(c=>{
      allData[m].push({_id:id,datum,kategori:c.k,tid:c.h,projekt,kortid,beskrivning:note});
    });

    saveData(editId?"edit":"add");
    resetForm();renderMonth();renderYearOverview();renderAlarms();
  }

  function resetForm(){
    editId=null;
    ["dateInput","projektInput","driveHoursInput","noteInput"].forEach(i=>get(i).value="");
    get("catMainSelect").value="";get("catMainHours").value="";
    get("extraCatsContainer").innerHTML="";
    get("saveEntryLabel").textContent="Lägg till";
    get("cancelEditBtn").style.display="none";
  }

  // ============ TABLES ============
  function renderMonth(){
    const [y,m]=currentYM();const tbody=get("monthTableBody");tbody.innerHTML="";
    const rows=(allData[m]||[]).slice().sort((a,b)=>a.datum.localeCompare(b.datum));
    const status=BalansRegler.buildDayStatusMap(rows,settings,y,m);
    rows.forEach(r=>{
      const st=status[r.datum]?.status||"";
      const tr=document.createElement("tr");
      if(st) tr.classList.add("dagstatus--"+st);
      tr.innerHTML=`
        <td>${r.datum}</td><td>${r.projekt||""}</td><td>${r.kategori}</td>
        <td>${r.tid||0}</td><td>${r.kortid||0}</td><td>${(r.beskrivning||"")}</td>
        <td><button class="icon-table-btn" data-act="edit" data-id="${r._id}"><i data-lucide="edit-3"></i></button>
            <button class="icon-table-btn" data-act="del" data-id="${r._id}" style="color:#c0392b"><i data-lucide="trash-2"></i></button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("button[data-act='edit']").forEach(b=>b.addEventListener("click",()=>startEdit(b.dataset.id)));
    tbody.querySelectorAll("button[data-act='del']").forEach(b=>b.addEventListener("click",()=>deleteRow(b.dataset.id)));
    if(window.lucide) lucide.createIcons();
    renderMonthSummary(rows);
  }

  function startEdit(id){
    const [y,m]=currentYM();const arr=allData[m]||[];const set=arr.filter(r=>r._id===id);
    if(!set.length)return;editId=id;
    const base=set[0];get("dateInput").value=base.datum;get("projektInput").value=base.projekt||"";get("driveHoursInput").value=base.kortid||"";get("noteInput").value=base.beskrivning||"";
    get("catMainSelect").value=set[0].kategori;get("catMainHours").value=set[0].tid;
    get("extraCatsContainer").innerHTML="";
    set.slice(1).forEach(r=>{
      addExtraCatRow();
      const row=get("extraCatsContainer").lastElementChild;
      row.querySelector(".extra-cat-sel").value=r.kategori;
      row.querySelector(".extra-cat-hrs").value=r.tid;
    });
    get("saveEntryLabel").textContent="Spara";
    get("cancelEditBtn").style.display="inline-flex";
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(id){
    const [y,m]=currentYM();
    if(!confirm("Ta bort raden?")) return;
    allData[m]=allData[m].filter(r=>r._id!==id);
    saveData("delete");renderMonth();renderYearOverview();renderAlarms();
  }

  function renderMonthSummary(rows){
    const c=get("monthSummaryCell");
    const sum={ord:0,flex:0,ot1:0,ot2:0,sem:0,atf:0,vab:0,sjuk:0,trakt:0,kortid:0};
    rows.forEach(r=>{
      const n=(r.kategori||"").toLowerCase(),h=parseFloat(r.tid)||0;
      if(n.includes("ordinarie"))sum.ord+=h;
      if(n.includes("flex"))sum.flex+=h;
      if(n.includes("övertid")&&n.includes("<2"))sum.ot1+=h;
      if(n.includes("övertid")&&(n.includes(">2")||n.includes("helg")))sum.ot2+=h;
      if(n.includes("semest"))sum.sem+=h;
      if(n.includes("atf"))sum.atf+=h;
      if(n.includes("vab"))sum.vab+=h;
      if(n.includes("sjuk"))sum.sjuk+=h;
      if(n.includes("trakt"))sum.trakt+=1;
      sum.kortid+=(parseFloat(r.kortid)||0);
    });
    c.textContent=`Ordinarie ${sum.ord} | Flex ${sum.flex} | ÖT<2 ${sum.ot1} | ÖT>2 ${sum.ot2} | Sem ${sum.sem} | ATF ${sum.atf} | VAB ${sum.vab} | Sjuk ${sum.sjuk} | Trakt ${sum.trakt} | Körtid ${sum.kortid}`;
  }

  // ============ ÅRSÖVERSIKT ============
  function renderYearOverview(){
    const tb=get("yearTableBody");tb.innerHTML="";
    const names=["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
    for(let m=1;m<=12;m++){
      const rows=allData[m]||[];const s={ord:0,flex:0,ot1:0,ot2:0,helg:0,sem:0,atf:0,vab:0,sjuk:0,trakt:0,kortid:0};
      rows.forEach(r=>{
        const n=(r.kategori||"").toLowerCase(),h=parseFloat(r.tid)||0;
        if(n.includes("ordinarie"))s.ord+=h;
        if(n.includes("flex"))s.flex+=h;
        if(n.includes("övertid")&&n.includes("<2"))s.ot1+=h;
        if(n.includes("övertid")&&(n.includes(">2")||n.includes("helg")))s.ot2+=h;
        if(n.includes("semest"))s.sem+=h;
        if(n.includes("atf"))s.atf+=h;
        if(n.includes("vab"))s.vab+=h;
        if(n.includes("sjuk"))s.sjuk+=h;
        if(n.includes("trakt"))s.trakt++;
        s.kortid+=parseFloat(r.kortid)||0;
      });
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${names[m-1]}</td><td>${s.ord.toFixed(1)}</td><td>${s.flex.toFixed(1)}</td><td>${s.ot1.toFixed(1)}</td><td>${s.ot2.toFixed(1)}</td><td>${s.helg}</td><td>${s.sem.toFixed(1)}</td><td>${s.atf.toFixed(1)}</td><td>${s.vab.toFixed(1)}</td><td>${s.sjuk.toFixed(1)}</td><td>${s.trakt}</td><td>${s.kortid.toFixed(1)}</td>`;
      tb.appendChild(tr);
    }
  }

  // ============ LARM ============
  function renderAlarms(){
    const [y,m]=currentYM();const tb=get("alarmTableBody");tb.innerHTML="";
    const rows=allData[m]||[];const map=BalansRegler.buildDayStatusMap(rows,settings,y,m);
    Object.keys(map).forEach(d=>{
      const day=map[d];
      if(["helg","röddag"].includes(day.status))return;
      if(day.status==="grön")return;
      const tr=document.createElement("tr");
      let text="";
      if(day.status==="saknas")text="🔴 Ingen registrering";
      if(day.status==="orange_under")text="⚠️ Under 8h";
      if(day.status==="orange_absence")text="🟡 Frånvaro";
      tr.innerHTML=`<td>${d}</td><td>${day.totalHours.toFixed(1)}</td><td>${text}</td>`;
      tb.appendChild(tr);
    });
  }

  // ============ EXPORT HELP ============
  function flatMonth(){
    const [y,m]=currentYM();return (allData[m]||[]).slice().sort((a,b)=>a.datum.localeCompare(b.datum));
  }
  function flatYear(){
    return Object.values(allData).flat();
  }

  // ============ BACKUP ============
  function importBackupHandler(ev){
    const f=ev.target.files[0];if(!f)return;
    importBackupFile(f,p=>{
      allData=p.data;settings=Object.assign(settings,p.settings);
      localStorage.setItem(DATA_KEY,JSON.stringify(allData));
      localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
      renderMonth();renderYearOverview();renderAlarms();alert("Import klar");
    });
  }

  function clearAll(){
    if(!confirm("Rensa all data?"))return;
    allData={};saveData("clear");renderMonth();renderYearOverview();renderAlarms();
  }

  // ============ SW ============
  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
      .then(()=>console.log("SW OK")).catch(e=>console.warn("SW fel",e));
    }
  }
})();