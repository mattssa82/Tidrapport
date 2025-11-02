// app.js
// Tidrapport v10.10
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION = "10.10";
  const DATA_KEY = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  let allData = {};     
  let settings = {};
  let editId = null;

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    populateYearMonthSelectors();
    bindUI();
    initCategoryBlock();
    renderMonth();
    renderYearOverview();
    renderAlarmList();
    registerServiceWorker();
    if (window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" laddad ✅");
  });

  // ---------- Load / Save ----------
  function loadData(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      allData = raw ? JSON.parse(raw) : {};
      if(typeof allData!=="object"||allData===null) allData={};
    }catch{ allData={}; }
  }
  function saveData(reason){
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup(reason||"data-change");
  }
  function loadSettings(){
    try{
      const raw=localStorage.getItem(SETTINGS_KEY);
      settings=raw?JSON.parse(raw):{};
      if(typeof settings!=="object"||settings===null) settings={};
    }catch{settings={};}

    get("companyInput").value=settings.company||"";
    get("nameInput").value=settings.name||"";
    get("anstnrInput").value=settings.emp||"";
    get("autoBackupChk").checked=!!settings.autoBackup;
  }
  function saveSettingsFromUI(){
    settings.company=get("companyInput").value.trim();
    settings.name=get("nameInput").value.trim();
    settings.emp=get("anstnrInput").value.trim();
    settings.autoBackup=get("autoBackupChk").checked;
    localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
    alert("Inställningar sparade.");
  }

  // ---------- Helpers ----------
  const get=id=>document.getElementById(id);
  const genRowId=()=>Date.now()+"_"+Math.floor(Math.random()*1e6);
  const currentYearMonth=()=>[parseInt(get("yearSelect").value,10),parseInt(get("monthSelect").value,10)];

  // ---------- UI ----------
  function bindUI(){
    get("menuToggleBtn").addEventListener("click",toggleMenu);
    get("saveSettingsBtn").addEventListener("click",saveSettingsFromUI);
    get("manualBackupBtn").addEventListener("click",manualBackupNow);
    get("importFileInput").addEventListener("change",onImportFileInputChange);
    get("exportCsvBtn").addEventListener("click",()=>exportCSVImpl(flattenDataForExportMonth(),settings,get("yearSelect").value,get("monthSelect").value));
    get("exportPdfBtn").addEventListener("click",()=>exportPDFImpl(flattenDataForExportMonth(),settings,get("yearSelect").value,get("monthSelect").value));
    get("exportYearBtn").addEventListener("click",()=>exportYearImpl(flattenDataFullYear(),settings));
    get("clearAllBtn").addEventListener("click",clearAllDataConfirm);
    get("saveEntryBtn").addEventListener("click",onSaveEntry);
    get("cancelEditBtn").addEventListener("click",clearForm);
    get("addCategoryRowBtn").addEventListener("click",()=>addCategoryLine());
    get("yearSelect").addEventListener("change",()=>{renderMonth();renderYearOverview();renderAlarmList();});
    get("monthSelect").addEventListener("change",()=>{renderMonth();renderAlarmList();});
  }

  function toggleMenu(){
    const panel=get("sidePanel");
    panel.classList.toggle("open");
    const open=panel.classList.contains("open");
    panel.setAttribute("aria-hidden",open?"false":"true");
    get("menuToggleBtn").setAttribute("aria-expanded",open?"true":"false");
  }

  // ---------- Kategori-block ----------
  const CATS=[
    "Ordinarie tid","Flextid","ATF-tim",
    "Övertid <2","Övertid >2","Övertid-Helg",
    "Semester","Sjuk","VAB","Föräldraledig","Traktamente"
  ];
  function initCategoryBlock(){
    const block=get("catBlock");
    block.innerHTML="";
    addCategoryLine(true); 
  }
  function addCategoryLine(isFirst){
    const block=get("catBlock");
    const div=document.createElement("div");
    div.className="cat-line";
    const sel=document.createElement("select");
    sel.innerHTML=`<option value="">(välj kategori)</option>`+
      CATS.map(c=>`<option value="${c}">${c}</option>`).join("");
    const inp=document.createElement("input");
    inp.type="number";
    inp.step="0.25";
    inp.placeholder="h (+/-)";
    const rem=document.createElement("button");
    rem.className="remove-btn";
    rem.innerHTML=`<i data-lucide="minus-circle"></i>`;
    rem.addEventListener("click",()=>{if(block.children.length>1) div.remove();if(window.lucide) lucide.createIcons();});
    if(isFirst) rem.style.display="none";
    div.append(sel,inp,rem);
    block.appendChild(div);
    if(window.lucide) lucide.createIcons();
  }

  // ---------- År/Månad ----------
  function populateYearMonthSelectors(){
    const ySel=get("yearSelect"),mSel=get("monthSelect");
    const yearsSeen=new Set(),curY=new Date().getFullYear();
    yearsSeen.add(curY);
    Object.keys(allData).forEach(mKey=>{
      (allData[mKey]||[]).forEach(r=>{
        if(r.datum){const y=(new Date(r.datum)).getFullYear();if(!isNaN(y)) yearsSeen.add(y);}
      });
    });
    const yearsSorted=[...yearsSeen].sort((a,b)=>a-b);
    ySel.innerHTML=yearsSorted.map(y=>`<option value="${y}" ${y===curY?"selected":""}>${y}</option>`).join("");
    const monthNames=["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
    const curM=new Date().getMonth()+1;
    mSel.innerHTML=monthNames.map((n,i)=>`<option value="${i+1}" ${i+1===curM?"selected":""}>${n}</option>`).join("");
  }

  // ---------- Spara ----------
  function onSaveEntry(){
    const [year,month]=currentYearMonth();
    if(!allData[month]) allData[month]=[];
    const datum=get("dateInput").value;
    if(!datum){alert("Datum saknas.");return;}
    const projekt=get("projektInput").value.trim();
    const kortid=parseFloat(get("driveHoursInput").value||"0")||0;
    const note=get("noteInput").value.trim();
    const block=get("catBlock");
    const cats=[], usedCats=new Set();
    block.querySelectorAll(".cat-line").forEach(line=>{
      const sel=line.querySelector("select");
      const inp=line.querySelector("input");
      const cat=sel.value;
      const h=parseFloat(inp.value)||0;
      if(cat && !usedCats.has(cat)){
        usedCats.add(cat);
        cats.push({kategori:cat,tid:h});
      }
    });
    if(!cats.length){alert("Ingen kategori vald.");return;}
    const rowId=editId||genRowId();
    if(editId){allData[month]=allData[month].filter(r=>r._id!==editId);}
    cats.forEach((c,i)=>{
      allData[month].push({
        _id:rowId, datum,
        kategori:c.kategori,
        tid:c.tid,
        projekt,
        kortid:i===0?kortid:0,
        beskrivning:note
      });
    });
    saveData(editId?"edit-entry":"add-entry");
    clearForm();
    renderMonth();
    renderYearOverview();
    renderAlarmList();
  }

  function clearForm(){
    editId=null;
    get("dateInput").value="";
    get("projektInput").value="";
    get("driveHoursInput").value="";
    get("noteInput").value="";
    initCategoryBlock();
    get("saveEntryLabel").textContent="Spara rad(er)";
    get("cancelEditBtn").style.display="none";
  }

  function clearAllDataConfirm(){
    if(!confirm("RENSA ALLT?"))return;
    allData={};
    localStorage.setItem(DATA_KEY,JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();renderYearOverview();renderAlarmList();
  }

  // ---------- Import / Backup ----------
  function manualBackupNow(){ manualBackup(); }
  function onImportFileInputChange(ev){
    const f=ev.target.files[0];if(!f)return;
    importBackupFile(f,payload=>{
      if(payload.data&&typeof payload.data==="object") allData=payload.data;
      if(payload.settings&&typeof payload.settings==="object"){
        settings=Object.assign({},settings,payload.settings);
        localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
      }
      saveData("import");
      loadSettings();populateYearMonthSelectors();
      renderMonth();renderYearOverview();renderAlarmList();
      alert("Import klar.");
    });
  }

  // ---------- Redigera / Ta bort ----------
  function startEdit(rowId){
    const [y,m]=currentYearMonth();
    const arr=allData[m]||[];
    const bundle=arr.filter(r=>r._id===rowId);
    if(!bundle.length)return;
    editId=rowId;
    const base=bundle[0];
    get("dateInput").value=base.datum||"";
    get("projektInput").value=base.projekt||"";
    get("driveHoursInput").value=base.kortid||"";
    get("noteInput").value=base.beskrivning||"";
    const block=get("catBlock");block.innerHTML="";
    bundle.forEach((r,i)=>{
      addCategoryLine(i===0);
      const line=block.children[i];
      line.querySelector("select").value=r.kategori||"";
      line.querySelector("input").value=r.tid||"";
    });
    get("saveEntryLabel").textContent="Spara ändring";
    get("cancelEditBtn").style.display="inline-flex";
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    const [y,m]=currentYearMonth();
    if(!confirm("Ta bort raden?"))return;
    allData[m]=(allData[m]||[]).filter(r=>r._id!==rowId);
    saveData("delete-entry");
    renderMonth();renderYearOverview();renderAlarmList();
  }

  // ---------- Rendering (tabeller & larm) ----------
  function renderMonth(){ /* – samma som tidigare del – */ }
  // (den versionen jag skickade i förra meddelandet är oförändrad)
  // renderMonthSummary(), renderYearOverview(), renderAlarmList() är redan komplett där.

  // ---------- Flatten-helpers ----------
  const flattenDataForExportMonth=()=>{
    const [year,month]=currentYearMonth();
    return (allData[month]||[]).slice().sort((a,b)=>a.datum.localeCompare(b.datum));
  };
  const flattenDataFullYear=()=>{
    const out=[];
    Object.keys(allData).forEach(m=>(allData[m]||[]).forEach(r=>out.push(r)));
    return out;
  };

  // ---------- Service Worker ----------
  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
        .then(()=>console.log("Service Worker registrerad (v"+APP_VERSION+")"))
        .catch(e=>console.warn("SW fel:",e));
    }
  }

})();