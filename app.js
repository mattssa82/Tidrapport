// app.js
// Tidrapport v10.17
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){
  const APP_VERSION = "10.17";
  const DATA_KEY = "tidrapport_data_v10";          // behåll för kompatibilitet
  const SETTINGS_KEY = "tidrapport_settings_v10";  // behåll för kompatibilitet

  let allData = {};   // { "1":[rows], "2":[rows], ... }
  let settings = {};
  let editId = null;

  const CATEGORIES = [
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

  const NEG_TO_ORD = [
    "flextid",
    "atf",
    "övertid <2",
    "övertid >2",
    "övertid-helg",
    "övertid helg",
    "semester"
  ];

  const ABSENCE_ONLY = [
    "vab",
    "sjuk",
    "föräldraledig"
  ];

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    initCategoryRows();
    populateYearMonthSelectors();
    bindUI();
    renderMonth();
    renderYearOverview();
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
        .catch(()=>{});
    }
    if(window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" klar");
  });

  // ------------- LOAD / SAVE -----------------

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
      settings = raw ? JSON.parse(raw) : {};
      if(!settings || typeof settings!=="object") settings = {};
    }catch{
      settings = {};
    }

    setVal("companyInput", settings.company || "");
    setVal("nameInput", settings.name || "");
    setVal("anstnrInput", settings.emp || "");
    setVal("redDaysInput", settings.redDays || "");
    get("showRedDaysChk").checked = !!settings.showRedDays;
    get("autoBackupChk").checked = !!settings.autoBackup;
  }

  function saveSettingsFromUI(){
    settings.company = get("companyInput").value.trim();
    settings.name = get("nameInput").value.trim();
    settings.emp = get("anstnrInput").value.trim();
    settings.redDays = get("redDaysInput").value.trim();
    settings.showRedDays = get("showRedDaysChk").checked;
    settings.autoBackup = get("autoBackupChk").checked;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    autoLocalBackup("settings-change");
    alert("Inställningar sparade.");
    renderMonth();
    renderYearOverview();
  }

  // ------------- HELPERS -----------------

  function get(id){ return document.getElementById(id); }
  function setVal(id,v){ const el=get(id); if(el) el.value=v; }

  function genRowId(){
    return Date.now().toString(36) + "_" + Math.floor(Math.random()*1e6).toString(36);
  }

  function monthFromDateStr(dateStr){
    const d = new Date(dateStr);
    if(isNaN(d)) return null;
    return d.getMonth()+1;
  }

  // bygg år/månad dropdowns baserat på data + idag
  function populateYearMonthSelectors(){
    const ySel = get("yearSelect");
    const mSel = get("monthSelect");
    if(!ySel || !mSel) return;

    const years = new Set();
    const curY = new Date().getFullYear();
    years.add(curY);

    Object.keys(allData).forEach(mKey=>{
      (allData[mKey]||[]).forEach(r=>{
        if(!r.datum) return;
        const y = new Date(r.datum).getFullYear();
        if(!isNaN(y)) years.add(y);
      });
    });

    const sortedYears = [...years].sort((a,b)=>a-b);
    ySel.innerHTML = sortedYears.map(y =>
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

  function currentYearMonth(){
    const y = parseInt(get("yearSelect").value,10) || new Date().getFullYear();
    const m = parseInt(get("monthSelect").value,10) || (new Date().getMonth()+1);
    return [y,m];
  }

  // ------------- UI BINDINGS -----------------

  function bindUI(){
    // meny toggle (mobilt)
    initMenuToggle();

    // datum -> öppna picker vid klick om stöd
    const di = get("dateInput");
    if(di && di.showPicker){
      di.addEventListener("click", e=>{ e.target.showPicker(); });
    }

    get("saveEntryBtn").addEventListener("click", onSaveEntry);
    get("cancelEditBtn").addEventListener("click", cancelEdit);

    get("manualBackupBtn").addEventListener("click", manualBackupNow);
    get("manualBackupBtn2").addEventListener("click", manualBackupNow);

    get("importFileInput").addEventListener("change", onImportFileInputChange);

    get("exportCsvBtn").addEventListener("click", ()=> {
      const [y,m] = currentYearMonth();
      exportCSVImpl(flattenDataForExportMonth(y,m), settings, y, m);
    });
    get("exportPdfBtn").addEventListener("click", ()=> {
      const [y,m] = currentYearMonth();
      exportPDFImpl(flattenDataForExportMonth(y,m), settings, y, m);
    });
    get("exportYearBtn").addEventListener("click", ()=> {
      exportYearImpl(flattenDataFullYear(), settings);
    });

    get("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);
    get("clearAllBtn").addEventListener("click", clearAllDataConfirm);

    get("yearSelect").addEventListener("change", ()=>{
      renderMonth();
      renderYearOverview();
    });
    get("monthSelect").addEventListener("change", renderMonth);

    get("addCatRowBtn").addEventListener("click", addCategoryRow);
  }

  function initMenuToggle(){
    const panel = get("sidePanel");
    const btn = get("menuToggleBtn");
    if(!panel || !btn) return;

    function setOpen(open){
      if(window.innerWidth <= 800){
        panel.classList.toggle("open", open);
        panel.setAttribute("aria-hidden", open?"false":"true");
        btn.setAttribute("aria-expanded", open?"true":"false");
      }else{
        // desktop: alltid synlig, ingen offcanvas
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden","false");
        btn.setAttribute("aria-expanded","false");
      }
    }

    btn.addEventListener("click", ()=>{
      if(window.innerWidth <= 800){
        const willOpen = !panel.classList.contains("open");
        setOpen(willOpen);
      }else{
        // desktop: gör inget, meny är bara där
      }
    });

    document.addEventListener("click", e=>{
      if(window.innerWidth > 800) return;
      if(!panel.contains(e.target) && !btn.contains(e.target)){
        setOpen(false);
      }
    });

    window.addEventListener("resize", ()=>setOpen(false));
    setOpen(false);
  }

  // ------------- KATEGORI-RADER -----------------

  function initCategoryRows(){
    const wrap = get("catRowsContainer");
    if(!wrap) return;
    wrap.innerHTML = "";
    // en huvudrad alltid
    addCategoryRow(true);
  }

  function buildCategorySelectHTML(selected){
    return `
      <select class="entry-select cat-select">
        <option value="">Välj kategori…</option>
        ${CATEGORIES.map(c => `<option value="${c}" ${c===selected?"selected":""}>${c}</option>`).join("")}
      </select>
    `;
  }

  function addCategoryRow(isMain){
    const wrap = get("catRowsContainer");
    if(!wrap) return;

    // hindra fler rader än antal kategorier (ingen dubblett nödvändig)
    const existing = wrap.querySelectorAll(".cat-row").length;
    if(existing >= CATEGORIES.length) return;

    const row = document.createElement("div");
    row.className = "cat-row";

    row.innerHTML = `
      ${buildCategorySelectHTML("")}
      <input type="number" step="0.25" class="entry-input cat-hours" placeholder="h" />
      ${isMain ? "" : `
        <button type="button" class="cat-extra-remove" title="Ta bort rad">
          <i data-lucide="x-circle"></i>
        </button>
      `}
    `;

    if(!isMain){
      row.querySelector(".cat-extra-remove").addEventListener("click", ()=>{
        row.remove();
      });
    }else{
      row.dataset.main = "1";
    }

    wrap.appendChild(row);
    if(window.lucide) lucide.createIcons();
  }

  function collectCategoriesFromForm(){
    const rows = [...get("catRowsContainer").querySelectorAll(".cat-row")];
    const usedCats = new Set();
    const out = [];

    for(const row of rows){
      const sel = row.querySelector(".cat-select");
      const hrs = row.querySelector(".cat-hours");
      if(!sel) continue;
      const cat = (sel.value || "").trim();
      const hRaw = (hrs.value || "").replace(",",".");
      const tid = hRaw === "" ? NaN : Number(hRaw);
      if(!cat) continue;
      if(isNaN(tid)) continue;

      // förhindra dubbletter av exakt samma kategori i samma inmatning
      const key = cat.toLowerCase();
      if(usedCats.has(key)) continue;
      usedCats.add(key);

      out.push({ kategori:cat, tid });
    }
    return out;
  }

  // ------------- VALIDERINGSREGLER -----------------

  function hasForbiddenMix(cats){
    const hasOrd = cats.some(c => c.kategori.toLowerCase().includes("ordinarie"));
    const hasAbs = cats.some(c => ABSENCE_ONLY.some(a => c.kategori.toLowerCase().includes(a)));
    // Ordinarie + VAB/Sjuk/FL i samma inmatning är inte tillåtet
    if(hasOrd && hasAbs) return true;
    return false;
  }

  function hasInvalidNegativeMix(cats){
    const hasOrd = cats.some(c => c.kategori.toLowerCase().includes("ordinarie"));
    if(!hasOrd) return false;
    // minus-timmar i kategorier som INTE är "uttagskategorier" är inte ok ihop med ordinarie
    return cats.some(c => c.tid < 0 && !NEG_TO_ORD.some(k => c.kategori.toLowerCase().includes(k)));
  }

  // ------------- SPARA / EDIT / DELETE -----------------

  function onSaveEntry(){
    const datum = get("dateInput").value;
    if(!datum){
      alert("Datum saknas.");
      return;
    }
    const d = new Date(datum);
    if(isNaN(d)){
      alert("Ogiltigt datum.");
      return;
    }
    const month = d.getMonth()+1;
    if(!allData[month]) allData[month] = [];

    const projekt = get("projektInput").value.trim();
    const driveRaw = (get("driveHoursInput").value || "").replace(",",".");
    const driveHours = driveRaw === "" ? 0 : Number(driveRaw);
    const note = get("noteInput").value.trim();

    const cats = collectCategoriesFromForm();
    if(!cats.length){
      alert("Minst en kategori + tid krävs.");
      return;
    }

    if(hasForbiddenMix(cats)){
      alert("Ordinarie tid kan inte kombineras i samma inmatning med VAB, Sjuk eller Föräldraledig.\nRegistrera dem som separata rader.");
      return;
    }

    if(hasInvalidNegativeMix(cats)){
      alert("Minus-tid i denna kombination är inte tillåten med Ordinarie tid i samma inmatning.\nAnvänd separata rader eller godkända uttagskategorier (Flex, ATF, ÖT, Semester).");
      return;
    }

    const rowId = editId || genRowId();

    // rensa gamla bundeln vid redigering
    if(editId){
      for(const mKey of Object.keys(allData)){
        allData[mKey] = (allData[mKey]||[]).filter(r => r._id !== editId);
      }
    }

    // skapa rader: första raden får körtid + dagbok, övriga bara tid/kategori
    let first = true;
    cats.forEach(c => {
      allData[month].push({
        _id: rowId,
        datum,
        projekt,
        kategori: c.kategori,
        tid: Number(c.tid) || 0,
        kortid: first ? (driveHours || 0) : 0,
        beskrivning: first ? note : ""
      });
      first = false;
    });

    saveData(editId ? "edit-entry" : "add-entry");
    clearForm();
    renderMonth();
    renderYearOverview();
  }

  function clearForm(){
    editId = null;
    setVal("dateInput","");
    setVal("projektInput","");
    setVal("driveHoursInput","");
    setVal("noteInput","");
    get("saveEntryLabel").textContent = "Lägg till";
    get("cancelEditBtn").style.display = "none";
    initCategoryRows();
  }

  function cancelEdit(){
    clearForm();
  }

  function startEdit(rowId){
    // hitta alla rader med detta id
    let bundle = [];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=>{
        if(r._id === rowId) bundle.push(r);
      });
    });
    if(!bundle.length) return;

    // sortera så rad med beskrivning/kortid kommer först
    bundle.sort((a,b)=>{
      const ascore = (a.beskrivning?1:0) + (a.kortid?1:0);
      const bscore = (b.beskrivning?1:0) + (b.kortid?1:0);
      return bscore - ascore;
    });

    const base = bundle[0];
    editId = rowId;

    setVal("dateInput", base.datum || "");
    setVal("projektInput", base.projekt || "");
    setVal("driveHoursInput", base.kortid || "");
    setVal("noteInput", base.beskrivning || "");

    // återskapa kategorirader
    const wrap = get("catRowsContainer");
    wrap.innerHTML = "";
    bundle.forEach((r,idx)=>{
      const isMain = (idx===0);
      const row = document.createElement("div");
      row.className = "cat-row";
      if(isMain) row.dataset.main="1";
      row.innerHTML = `
        ${buildCategorySelectHTML(r.kategori || "")}
        <input type="number" step="0.25" class="entry-input cat-hours" value="${r.tid || 0}"/>
        ${isMain ? "" : `
        <button type="button" class="cat-extra-remove" title="Ta bort rad">
          <i data-lucide="x-circle"></i>
        </button>`}
      `;
      if(!isMain){
        row.querySelector(".cat-extra-remove").addEventListener("click", ()=>row.remove());
      }
      wrap.appendChild(row);
    });
    if(window.lucide) lucide.createIcons();

    get("saveEntryLabel").textContent = "Spara";
    get("cancelEditBtn").style.display = "inline-flex";
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function deleteRow(rowId){
    if(!confirm("Ta bort denna inmatning (alla rader som hör ihop)?")) return;
    Object.keys(allData).forEach(m=>{
      allData[m] = (allData[m]||[]).filter(r => r._id !== rowId);
    });
    saveData("delete-entry");
    renderMonth();
    renderYearOverview();
  }

  // ------------- RENDER MÅNAD -----------------

  function renderMonth(){
    const [year, month] = currentYearMonth();
    const tbody = get("monthTableBody");
    const alarmBody = get("alarmBody");
    if(!tbody || !alarmBody) return;

    tbody.innerHTML = "";
    alarmBody.innerHTML = "";

    const rows = (allData[month]||[]).slice().sort((a,b)=>{
      if(a.datum === b.datum) return (a.projekt||"").localeCompare(b.projekt||"");
      return (a.datum||"").localeCompare(b.datum||"");
    });

    const statusMap = window.BalansRegler
      ? BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    const usedFirstForId = new Set();

    rows.forEach(r => {
      const tr = document.createElement("tr");
      const st = statusMap[r.datum]?.status || "";
      if(st) tr.classList.add("dagstatus--"+st);

      // visa kortid + beskrivning bara på första rad per bundle
      let showKortid = "";
      let showNote = "";
      if(!usedFirstForId.has(r._id)){
        if(r.kortid) showKortid = (Number(r.kortid)||0);
        if(r.beskrivning) showNote = (r.beskrivning||"").replace(/\r?\n/g," ");
        usedFirstForId.add(r._id);
      }

      tr.innerHTML = `
        <td>${r.datum || ""}</td>
        <td>${r.projekt || ""}</td>
        <td>${r.kategori || ""}</td>
        <td>${(Number(r.tid)||0).toFixed(2)}</td>
        <td>${showKortid !== "" ? Number(showKortid).toFixed(2) : ""}</td>
        <td>${showNote}</td>
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

    // knappar
    tbody.querySelectorAll("button[data-act='edit']").forEach(btn=>{
      btn.addEventListener("click", ()=>startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn=>{
      btn.addEventListener("click", ()=>deleteRow(btn.dataset.id));
    });

    if(window.lucide) lucide.createIcons();

    renderMonthSummary(rows);
    renderAlarms(statusMap, year, month);
  }

  function renderMonthSummary(rows){
    const cell = get("monthSummaryCell");
    if(!cell) return;

    const sum = {
      ord:0,
      kortid:0,
      flex:0,
      ot1:0,
      ot2:0,
      sem:0,
      atf:0,
      vab:0,
      sjuk:0,
      fl:0,
      trakt:0
    };

    rows.forEach(r=>{
      const cat = (r.kategori||"").toLowerCase();
      let h = Number(r.tid)||0;

      // uttagskategorier: minus -> ordinarie
      if(h < 0 && NEG_TO_ORD.some(k=>cat.includes(k))){
        sum.ord += Math.abs(h);
        h = 0;
      }

      if(cat.includes("ordinarie")) sum.ord += h;
      if(cat.includes("flex")) sum.flex += h;
      if(cat.includes("övertid") && cat.includes("<2")) sum.ot1 += h;
      if(cat.includes("övertid") && (!cat.includes("<2"))) sum.ot2 += h;
      if(cat.includes("semest")) sum.sem += h;
      if(cat.includes("atf")) sum.atf += h;
      if(cat.includes("vab")) sum.vab += h;
      if(cat.includes("sjuk")) sum.sjuk += h;
      if(cat.includes("föräldraledig")) sum.fl += h;
      if(cat.includes("trakt")) sum.trakt += 1;

      if(r.kortid) sum.kortid += Number(r.kortid)||0;
    });

    cell.textContent =
      `Ordinarie: ${sum.ord.toFixed(2)}h | `+
      `Körtid: ${sum.kortid.toFixed(2)}h | `+
      `Flex: ${sum.flex.toFixed(2)}h | `+
      `ÖT<2: ${sum.ot1.toFixed(2)}h | `+
      `ÖT>2/Helg: ${sum.ot2.toFixed(2)}h | `+
      `Semester: ${sum.sem.toFixed(2)}h | `+
      `ATF: ${sum.atf.toFixed(2)}h | `+
      `VAB: ${sum.vab.toFixed(2)}h | `+
      `Sjuk: ${sum.sjuk.toFixed(2)}h | `+
      `FL: ${sum.fl.toFixed(2)}h | `+
      `Trakt: ${sum.trakt} st`;
  }

  // ------------- LARM / OBALANS -----------------

  function renderAlarms(statusMap, year, month){
    const body = get("alarmBody");
    if(!body || !statusMap) return;
    body.innerHTML = "";

    const today = new Date();
    const rows = [];

    Object.keys(statusMap).sort().forEach(ds=>{
      const st = statusMap[ds];
      const d = new Date(ds+"T00:00:00");
      if(isNaN(d)) return;
      // endast passerade vardagar (inkl röd dag) i samma månad
      if(d.getFullYear() !== year || (d.getMonth()+1)!==month) return;
      if(d > today) return;

      if(st.status === "saknas"){
        rows.push({
          date: ds,
          text: "Ingen registrering",
          icon: "x-octagon",
          cls: "alarm-icon-err"
        });
      } else if(st.status === "orange_under"){
        rows.push({
          date: ds,
          text: "Under 8h",
          icon: "alert-triangle",
          cls: "alarm-icon-warn"
        });
      } else if(st.status === "orange_absence"){
        rows.push({
          date: ds,
          text: "Frånvaro (VAB/Sjuk/FL)",
          icon: "alert-circle",
          cls: "alarm-icon-warn"
        });
      }
    });

    if(!rows.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="2">Inga obalanser för passerade vardagar.</td>`;
      body.appendChild(tr);
      return;
    }

    rows.forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.date}</td>
        <td><span class="${r.cls}"><i data-lucide="${r.icon}"></i></span> ${r.text}</td>
      `;
      body.appendChild(tr);
    });

    if(window.lucide) lucide.createIcons();
  }

  // ------------- ÅRSÖVERSIKT -----------------

  function renderYearOverview(){
    const tbody = get("yearTableBody");
    if(!tbody) return;
    tbody.innerHTML = "";

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];

    for(let m=1;m<=12;m++){
      const arr = allData[m] || [];
      const S = {
        ord:0, kortid:0, flex:0, ot1:0, ot2:0,
        sem:0, atf:0, vab:0, sjuk:0, fl:0, trakt:0
      };

      arr.forEach(r=>{
        const cat = (r.kategori||"").toLowerCase();
        let h = Number(r.tid)||0;

        if(h < 0 && NEG_TO_ORD.some(k=>cat.includes(k))){
          S.ord += Math.abs(h);
          h = 0;
        }

        if(cat.includes("ordinarie")) S.ord += h;
        if(cat.includes("flex")) S.flex += h;
        if(cat.includes("övertid") && cat.includes("<2")) S.ot1 += h;
        if(cat.includes("övertid") && !cat.includes("<2")) S.ot2 += h;
        if(cat.includes("semest")) S.sem += h;
        if(cat.includes("atf")) S.atf += h;
        if(cat.includes("vab")) S.vab += h;
        if(cat.includes("sjuk")) S.sjuk += h;
        if(cat.includes("föräldraledig")) S.fl += h;
        if(cat.includes("trakt")) S.trakt += 1;

        if(r.kortid) S.kortid += Number(r.kortid)||0;
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m-1]}</td>
        <td>${S.ord.toFixed(2)}</td>
        <td>${S.kortid.toFixed(2)}</td>
        <td>${S.flex.toFixed(2)}</td>
        <td>${S.ot1.toFixed(2)}</td>
        <td>${S.ot2.toFixed(2)}</td>
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

  // ------------- BACKUP / IMPORT -----------------

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
        loadSettings();
      }
      saveData("import");
      populateYearMonthSelectors();
      renderMonth();
      renderYearOverview();
      alert("Import klar.");
    });
  }

  function clearAllDataConfirm(){
    if(!confirm("Är du säker? Detta raderar ALL din data i denna webbläsare.")) return;
    allData = {};
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    autoLocalBackup("clearAll");
    renderMonth();
    renderYearOverview();
  }

  // ------------- FLATTEN EXPORT -----------------

  function flattenDataForExportMonth(year,month){
    const arr = (allData[month]||[]).slice().sort((a,b)=> (a.datum||"").localeCompare(b.datum||""));
    return arr;
  }

  function flattenDataFullYear(){
    const out = [];
    Object.keys(allData).forEach(m=>{
      (allData[m]||[]).forEach(r=> out.push(r));
    });
    return out;
  }

})();