// app.js
// Tidrapport v10.19
// Bas: v10.15 + överenskomna regler
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const APP_VERSION = "10.19";
  const DATA_KEY = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  let allData = {};    // { "10":[{_id,datum,kategori,tid,projekt,kortid,beskrivning}, ...], ... }
  let settings = {};
  let editBundleId = null;

  const CATS = [
    "Ordinarie tid",
    "Flextid",
    "ATF",
    "Övertid <2",
    "Övertid >2",
    "Övertid-Helg",
    "Semester",
    "Sjuk",
    "VAB",
    "Föräldraledig",
    "Traktamente"
  ];

  document.addEventListener("DOMContentLoaded", ()=>{
    loadSettings();
    loadData();
    initSelectors();
    buildCategoryInputs();
    bindUI();
    renderMonth();
    renderYearOverview();
    registerServiceWorker();
    if(window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" klar.");
  });

  function g(id){ return document.getElementById(id); }

  // SETTINGS

  function loadSettings(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      settings = raw ? JSON.parse(raw) : {};
      if(typeof settings !== "object" || !settings) settings = {};
    }catch{
      settings = {};
    }

    g("companyInput").value = settings.company || "";
    g("nameInput").value = settings.name || "";
    g("anstnrInput").value = settings.emp || "";
    g("autoBackupChk").checked = !!settings.autoBackup;
    g("redDayHoursInput").value = (settings.redDayHours != null ? settings.redDayHours : 8);
  }

  function saveSettingsFromUI(){
    settings.company = g("companyInput").value.trim();
    settings.name = g("nameInput").value.trim();
    settings.emp = g("anstnrInput").value.trim();
    settings.autoBackup = g("autoBackupChk").checked;
    const rdh = parseFloat(g("redDayHoursInput").value);
    settings.redDayHours = !isNaN(rdh) ? rdh : 8;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    autoLocalBackup("settings-change");
    renderMonth();
    renderYearOverview();
    alert("Inställningar sparade.");
  }

  // DATA

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
    autoLocalBackup(reason||"data-change");
  }

  // YEAR/MONTH SELECT

  function initSelectors(){
    const yearSel = g("yearSelect");
    const monthSel = g("monthSelect");
    if(!yearSel || !monthSel) return;

    const years = new Set();
    const now = new Date();
    years.add(now.getFullYear());

    Object.values(allData).forEach(arr=>{
      (arr||[]).forEach(r=>{
        if(!r.datum) return;
        const y = new Date(r.datum).getFullYear();
        if(!isNaN(y)) years.add(y);
      });
    });

    const ys = [...years].sort((a,b)=>a-b);
    yearSel.innerHTML = ys.map(y=>`<option value="${y}" ${y===now.getFullYear()?"selected":""}>${y}</option>`).join("");

    const monthNames = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
    const cm = now.getMonth()+1;
    monthSel.innerHTML = monthNames.map((n,i)=>`<option value="${i+1}" ${i+1===cm?"selected":""}>${n}</option>`).join("");
  }

  function currentYearMonth(){
    const y = parseInt(g("yearSelect").value,10) || (new Date()).getFullYear();
    const m = parseInt(g("monthSelect").value,10) || (new Date()).getMonth()+1;
    return [y,m];
  }

  // MENU TOGGLE

  function bindMenuToggle(){
    const panel = g("sidePanel");
    const btn = g("menuToggleBtn");
    if(!panel || !btn) return;

    function setOpen(open){
      panel.classList.toggle("open",open);
      panel.setAttribute("aria-hidden", open ? "false" : "true");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const willOpen = !panel.classList.contains("open");
      setOpen(willOpen);
    });

    document.addEventListener("click", e=>{
      if(!panel.classList.contains("open")) return;
      if(!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)){
        setOpen(false);
      }
    });
  }

  // CATEGORY INPUTS

  function buildCategoryInputs(){
    const grid = g("catGrid");
    if(!grid) return;
    grid.innerHTML = "";

    for(let i=0;i<3;i++){
      const block = document.createElement("div");
      block.className = "cat-block";
      block.dataset.index = String(i);

      const label = document.createElement("div");
      label.className = "cat-label";
      label.textContent = i===0 ? "Kategori & tid" : `Extra kategori ${i}`;
      block.appendChild(label);

      const row = document.createElement("div");
      row.className = "cat-row";

      const sel = document.createElement("select");
      sel.className = "cat-select";
      sel.dataset.index = String(i);
      sel.innerHTML = `<option value="">(Välj)</option>` +
        CATS.map(c=>`<option value="${c}">${c}</option>`).join("");

      const inp = document.createElement("input");
      inp.className = "cat-hours";
      inp.dataset.index = String(i);
      inp.type = "number";
      inp.step = "0.25"; // tillåt även minus
      // ingen min -> minus tillåtet

      row.appendChild(sel);
      row.appendChild(inp);

      if(i>0){
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "cat-remove-btn";
        rm.innerHTML = `<i data-lucide="x-circle"></i>`;
        rm.addEventListener("click", ()=>{
          sel.value="";
          inp.value="";
        });
        row.appendChild(rm);
      }

      block.appendChild(row);
      grid.appendChild(block);
    }
  }

  // UI BINDINGS

  function bindUI(){
    bindMenuToggle();

    const saveBtn = g("saveEntryBtn");
    const cancelBtn = g("cancelEditBtn");
    if(saveBtn) saveBtn.addEventListener("click", onSaveEntry);
    if(cancelBtn) cancelBtn.addEventListener("click", cancelEdit);

    const mb1 = g("manualBackupBtn");
    const mb2 = g("manualBackupBtn2");
    if(mb1) mb1.addEventListener("click", ()=>manualBackup());
    if(mb2) mb2.addEventListener("click", ()=>manualBackup());

    const importInput = g("importFileInput");
    if(importInput){
      importInput.addEventListener("change", e=>{
        const f = e.target.files[0];
        if(!f) return;
        importBackupFile(f, payload=>{
          if(payload.data && typeof payload.data==="object"){
            allData = payload.data;
          }
          if(payload.settings && typeof payload.settings==="object"){
            settings = Object.assign({}, settings, payload.settings);
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          }
          saveData("import");
          loadSettings();
          initSelectors();
          renderMonth();
          renderYearOverview();
          alert("Import klar.");
        });
      });
    }

    const ecsv = g("exportCsvBtn");
    const epdf = g("exportPdfBtn");
    const eyear = g("exportYearBtn");
    if(ecsv) ecsv.addEventListener("click", ()=>{
      const [y,m] = currentYearMonth();
      exportCSVImpl(flattenMonth(y,m), settings, y, m);
    });
    if(epdf) epdf.addEventListener("click", ()=>{
      const [y,m] = currentYearMonth();
      exportPDFImpl(flattenMonth(y,m), settings, y, m);
    });
    if(eyear) eyear.addEventListener("click", ()=>{
      exportYearImpl(flattenAll(), settings);
    });

    const clearBtn = g("clearAllBtn");
    if(clearBtn){
      clearBtn.addEventListener("click", ()=>{
        if(!confirm("Är du säker? Detta raderar ALL data i appen.")) return;
        allData = {};
        saveData("clear-all");
        renderMonth();
        renderYearOverview();
      });
    }

    const ys = g("yearSelect");
    const ms = g("monthSelect");
    if(ys){
      ys.addEventListener("change", ()=>{
        renderMonth();
        renderYearOverview();
      });
    }
    if(ms){
      ms.addEventListener("change", ()=>{
        renderMonth();
      });
    }

    const sbtn = g("saveSettingsBtn");
    if(sbtn) sbtn.addEventListener("click", saveSettingsFromUI);

    const di = g("dateInput");
    if(di && di.showPicker){
      di.addEventListener("click", e=>{ e.target.showPicker(); });
    }
  }

  // SAVE ENTRY

  function onSaveEntry(){
    const [year, month] = currentYearMonth();
    if(!allData[month]) allData[month]=[];

    const datum = g("dateInput").value;
    if(!datum){
      alert("Datum saknas.");
      return;
    }

    const projekt = (g("projektInput").value||"").trim();
    const drive = parseFloat(g("driveHoursInput").value || "0") || 0;
    const note = (g("noteInput").value||"").trim();

    // samla kategorier
    const cats = [];
    const usedCats = new Set();
    document.querySelectorAll(".cat-select").forEach(sel=>{
      const i = sel.dataset.index;
      const inp = document.querySelector(`.cat-hours[data-index="${i}"]`);
      const cat = sel.value;
      const hRaw = (inp && inp.value!=="") ? inp.value : "";
      if(!cat && !hRaw) return;
      const h = parseFloat(hRaw || "0");
      if(!cat){
        alert("Kategori saknas på en rad.");
        return;
      }
      if(usedCats.has(cat)){
        alert("Samma kategori får inte väljas flera gånger i samma inmatning.");
        return;
      }
      usedCats.add(cat);
      cats.push({ cat, h });
    });

    if(!cats.length){
      alert("Minst en kategori krävs.");
      return;
    }

    // Regler: Ordinarie tid ej i samma inmatning med VAB/Sjuk/FL
    const hasOrd = cats.some(c=>c.cat.toLowerCase().includes("ordinarie"));
    const hasAbs = cats.some(c=>{
      const n=c.cat.toLowerCase();
      return n.includes("vab") || n.includes("sjuk") || n.includes("föräldraledig");
    });
    if(hasOrd && hasAbs){
      alert("Ordinarie tid kan inte kombineras med VAB/Sjuk/Föräldraledig i samma inmatning.\nSkapa dem som separata rader.");
      return;
    }

    const bundleId = editBundleId || (Date.now()+"_"+Math.floor(Math.random()*1e6));

    // vid edit: ta bort gamla med samma bundleId
    if(editBundleId){
      allData[month] = (allData[month]||[]).filter(r=>r._id !== editBundleId);
    }

    // skapa rader: första rad bär körtid + note, övriga bara tid
    cats.forEach((c,idx)=>{
      allData[month].push({
        _id: bundleId,
        datum,
        projekt,
        kategori: c.cat,
        tid: isNaN(c.h) ? 0 : c.h,
        kortid: (idx===0 ? drive : 0),
        beskrivning: (idx===0 ? note : "")
      });
    });

    saveData(editBundleId ? "edit-entry" : "add-entry");
    clearForm();
    renderMonth();
    renderYearOverview();
  }

  function cancelEdit(){
    clearForm();
  }

  function clearForm(){
    editBundleId = null;
    if(g("dateInput")) g("dateInput").value="";
    if(g("projektInput")) g("projektInput").value="";
    if(g("driveHoursInput")) g("driveHoursInput").value="";
    if(g("noteInput")) g("noteInput").value="";
    if(g("saveEntryLabel")) g("saveEntryLabel").textContent="Lägg till";
    if(g("cancelEditBtn")) g("cancelEditBtn").style.display="none";
    // nollställ kategorier
    buildCategoryInputs();
    if(window.lucide) lucide.createIcons();
  }

  // EDIT / DELETE

  function startEdit(bundleId){
    const [y,m] = currentYearMonth();
    const rows = (allData[m]||[]).filter(r=>r._id===bundleId);
    if(!rows.length) return;

    editBundleId = bundleId;

    rows.sort((a,b)=>a.kategori.localeCompare(b.kategori));

    const base = rows[0];
    g("dateInput").value = base.datum || "";
    g("projektInput").value = base.projekt || "";
    g("driveHoursInput").value = base.kortid || "";
    g("noteInput").value = base.beskrivning || "";

    buildCategoryInputs();

    const selEls = document.querySelectorAll(".cat-select");
    const hrEls = document.querySelectorAll(".cat-hours");

    rows.forEach((r,idx)=>{
      if(idx>=selEls.length) return;
      selEls[idx].value = r.kategori || "";
      hrEls[idx].value = (r.tid != null ? r.tid : "");
    });

    if(g("saveEntryLabel")) g("saveEntryLabel").textContent="Spara";
    if(g("cancelEditBtn")) g("cancelEditBtn").style.display="inline-flex";

    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteBundle(bundleId){
    const [y,m] = currentYearMonth();
    if(!confirm("Ta bort raden/raderna för detta tillfälle?")) return;
    allData[m] = (allData[m]||[]).filter(r=>r._id!==bundleId);
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
  }

  // FLATTEN

  function flattenMonth(year,month){
    const arr = allData[month]||[];
    return arr.slice().sort((a,b)=>(a.datum||"").localeCompare(b.datum||""));
  }

  function flattenAll(){
    const out=[];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=>out.push(r));
    });
    return out;
  }

  // RENDER MONTH

  function renderMonth(){
    const [year,month] = currentYearMonth();
    const tbody = g("monthTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const rows = allData[month]||[];
    const sorted = rows.slice().sort((a,b)=>{
      const dcmp = (a.datum||"").localeCompare(b.datum||"");
      if(dcmp!==0) return dcmp;
      if(a._id===b._id) return 0;
      return (a._id||"").localeCompare(b._id||"");
    });

    const statusMap = (window.BalansRegler && BalansRegler.buildDayStatusMap)
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    // vi grupperar per _id för edit/delete
    sorted.forEach(r=>{
      const tr = document.createElement("tr");

      const st = statusMap[r.datum]?.status;
      if(st) tr.classList.add("dagstatus--"+st);

      tr.innerHTML = `
        <td>${r.datum||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${r.tid != null ? r.tid : ""}</td>
        <td>${r.kortid != null && r.kortid !== 0 ? r.kortid : ""}</td>
        <td>${(r.beskrivning||"").replace(/\r?\n/g," ")}</td>
        <td>
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

    tbody.querySelectorAll("button[data-act='edit']").forEach(btn=>{
      btn.addEventListener("click", ()=>startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn=>{
      btn.addEventListener("click", ()=>deleteBundle(btn.dataset.id));
    });

    if(window.lucide) lucide.createIcons();
    renderMonthSummary(rows, statusMap);
    renderAlarms(statusMap);
  }

  function renderMonthSummary(rows, statusMap){
    const cell = g("monthSummaryCell");
    if(!cell) return;

    const sum = {
      ord:0, drive:0, flex:0, ot1:0, ot2:0, oth:0,
      sem:0, atf:0, vab:0, sj:0, fl:0, trakt:0
    };

    (rows||[]).forEach(r=>{
      const cat = (r.kategori||"").toLowerCase();
      const h = parseFloat(r.tid)||0;
      const d = parseFloat(r.kortid)||0;

      if(cat.includes("ordinarie")) sum.ord += h;
      if(cat.includes("flex")) sum.flex += h;
      if(cat.includes("övertid") && cat.includes("<2")) sum.ot1 += h;
      if(cat.includes("övertid") && cat.includes(">2")) sum.ot2 += h;
      if(cat.includes("övertid-helg")||cat.includes("övertid helg")) sum.oth += h;
      if(cat.includes("semest")) sum.sem += h;
      if(cat.includes("atf")) sum.atf += h;
      if(cat.includes("vab")) sum.vab += h;
      if(cat.includes("sjuk")) sum.sj += h;
      if(cat.includes("föräldraled")) sum.fl += h;
      if(cat.includes("trakt")) sum.trakt += 1;

      sum.drive += d;
    });

    cell.textContent =
      `Ordinarie: ${sum.ord.toFixed(2)}h | `+
      `Körtid: ${sum.drive.toFixed(2)}h | `+
      `Flex: ${sum.flex.toFixed(2)}h | `+
      `ÖT<2: ${sum.ot1.toFixed(2)}h | `+
      `ÖT>2: ${sum.ot2.toFixed(2)}h | `+
      `ÖT-Helg: ${sum.oth.toFixed(2)}h | `+
      `Semester: ${sum.sem.toFixed(2)}h | `+
      `ATF: ${sum.atf.toFixed(2)}h | `+
      `VAB: ${sum.vab.toFixed(2)}h | `+
      `Sjuk: ${sum.sj.toFixed(2)}h | `+
      `FL: ${sum.fl.toFixed(2)}h | `+
      `Trakt: ${sum.trakt} st`;
  }

  // LARM / OBALANS PANEL

  function renderAlarms(statusMap){
    const card = g("alarmCard");
    const list = g("alarmList");
    if(!card || !list){
      return;
    }
    list.innerHTML="";
    const [year,month] = currentYearMonth();
    const todayStr = new Date().toISOString().slice(0,10);

    const entries = Object.keys(statusMap||{})
      .sort()
      .filter(ds=>{
        if(ds >= todayStr) return false; // bara dagar som redan passerat
        const st = statusMap[ds].status;
        if(st==="saknas" || st==="orange_under" || st==="orange_absence"){
          const t = BalansRegler.classifyDayType ? BalansRegler.classifyDayType(ds) : "vardag";
          return t==="vardag"; // inga larm för helg/röddag
        }
        return false;
      })
      .map(ds=>{
        const st = statusMap[ds].status;
        let label="", icon="";
        if(st==="saknas"){ label="Ingen registrering"; icon="alert-octagon"; }
        else if(st==="orange_under"){ label="Under 8h"; icon="alert-triangle"; }
        else if(st==="orange_absence"){ label="Frånvaro"; icon="alert-circle"; }
        return { ds, label, icon };
      });

    if(!entries.length){
      card.style.display="none";
      return;
    }

    entries.forEach(e=>{
      const row = document.createElement("div");
      row.className="alarm-row";
      row.innerHTML = `
        <div>${e.ds}</div>
        <div></div>
        <div class="alarm-label">
          <i data-lucide="${e.icon}"></i>
          <span>${e.label}</span>
        </div>
      `;
      list.appendChild(row);
    });

    card.style.display="";
    if(window.lucide) lucide.createIcons();
  }

  // ÅRSÖVERSIKT

  function renderYearOverview(){
    const tbody = g("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML="";

    const monthNames = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];

    for(let m=1;m<=12;m++){
      const rows = allData[m]||[];
      const S = {
        ord:0, drive:0, flex:0, ot1:0, ot2:0, oth:0,
        sem:0, atf:0, vab:0, sj:0, fl:0, trakt:0
      };

      rows.forEach(r=>{
        const cat=(r.kategori||"").toLowerCase();
        const h=parseFloat(r.tid)||0;
        const d=parseFloat(r.kortid)||0;
        if(cat.includes("ordinarie")) S.ord+=h;
        if(cat.includes("flex")) S.flex+=h;
        if(cat.includes("övertid") && cat.includes("<2")) S.ot1+=h;
        if(cat.includes("övertid") && cat.includes(">2")) S.ot2+=h;
        if(cat.includes("övertid-helg")||cat.includes("övertid helg")) S.oth+=h;
        if(cat.includes("semest")) S.sem+=h;
        if(cat.includes("atf")) S.atf+=h;
        if(cat.includes("vab")) S.vab+=h;
        if(cat.includes("sjuk")) S.sj+=h;
        if(cat.includes("föräldraled")) S.fl+=h;
        if(cat.includes("trakt")) S.trakt+=1;
        S.drive += d;
      });

      const tr=document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m-1]}</td>
        <td>${S.ord.toFixed(2)}</td>
        <td>${S.drive.toFixed(2)}</td>
        <td>${S.flex.toFixed(2)}</td>
        <td>${S.ot1.toFixed(2)}</td>
        <td>${S.ot2.toFixed(2)}</td>
        <td>${S.oth.toFixed(2)}</td>
        <td>${S.sem.toFixed(2)}</td>
        <td>${S.atf.toFixed(2)}</td>
        <td>${S.vab.toFixed(2)}</td>
        <td>${S.sj.toFixed(2)}</td>
        <td>${S.fl.toFixed(2)}</td>
        <td>${S.trakt}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // SERVICE WORKER

  function registerServiceWorker(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
        .catch(err=>console.warn("SW registrering misslyckades:",err));
    }
  }

})();