// app.js
// Tidrapport v10.15
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){
  const APP_VERSION   = "10.15";
  const DATA_KEY      = "tidrapport_data_v10";
  const SETTINGS_KEY  = "tidrapport_settings_v10";

  // Struktur:
  // allData = { "1":[{_id,datum,projekt,kategori,tid,kortid,beskrivning}], "2":[...], ... }
  let allData   = {};
  let settings  = {};
  let editId    = null; // bundle-id för aktuell inmatning

  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadData();
    initCategoryRows();
    populateYearMonthSelectors();
    bindUI();
    renderMonth();
    renderLarm();
    renderYearOverview();
    registerServiceWorker();
    if (window.lucide) lucide.createIcons();
    console.log("Tidrapport v"+APP_VERSION+" redo");
  });

  // -----------------------
  // Helpers
  // -----------------------
  function $(id){ return document.getElementById(id); }

  function genId(){
    return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8);
  }

  function parseNum(v){
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // -----------------------
  // Load / Save
  // -----------------------
  function loadData(){
    try{
      const raw = JSON.parse(localStorage.getItem(DATA_KEY) || "{}");
      if (Array.isArray(raw)) {
        // gammalt platt format -> lägg allt i rätt månad
        allData = {};
        raw.forEach(r => {
          if (!r.datum) return;
          const m = new Date(r.datum).getMonth()+1;
          const k = String(m);
          if (!allData[k]) allData[k] = [];
          allData[k].push(r);
        });
      } else if (raw && typeof raw === "object") {
        allData = raw;
      } else {
        allData = {};
      }
    } catch {
      allData = {};
    }
    normalizeAllData();
  }

  function normalizeAllData(){
    // se till att vi har "1".."12"
    for (let m=1;m<=12;m++){
      const k = String(m);
      if (!Array.isArray(allData[k])) allData[k] = [];
    }
  }

  function saveData(reason){
    normalizeAllData();
    localStorage.setItem(DATA_KEY, JSON.stringify(allData));
    if (window.autoLocalBackup) {
      window.autoLocalBackup(reason || "data-change");
    }
  }

  function loadSettings(){
    try{
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      settings = (raw && typeof raw === "object") ? raw : {};
    }catch{
      settings = {};
    }
    // defaults
    if (typeof settings.redDayHours !== "number") settings.redDayHours = 8;
    if (typeof settings.showRedDays !== "boolean") settings.showRedDays = true;
    if (typeof settings.autoBackup !== "boolean") settings.autoBackup = false;

    // UI sync (om elementen finns)
    if ($("companyInput")) $("companyInput").value = settings.company || "";
    if ($("nameInput")) $("nameInput").value = settings.name || "";
    if ($("anstnrInput")) $("anstnrInput").value = settings.anstnr || settings.emp || "";
    if ($("redDayHoursInput")) $("redDayHoursInput").value = settings.redDayHours;
    if ($("showRedDaysChk")) $("showRedDaysChk").checked = !!settings.showRedDays;
    if ($("autoBackupChk")) $("autoBackupChk").checked = !!settings.autoBackup;
  }

  function saveSettingsFromUI(){
    settings.company      = ($("companyInput")?.value || "").trim();
    settings.name         = ($("nameInput")?.value || "").trim();
    settings.anstnr       = ($("anstnrInput")?.value || "").trim();
    settings.redDayHours  = parseNum($("redDayHoursInput")?.value || settings.redDayHours || 8);
    settings.showRedDays  = !!($("showRedDaysChk")?.checked);
    settings.autoBackup   = !!($("autoBackupChk")?.checked);

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    alert("Inställningar sparade.");
    renderMonth();
    renderLarm();
    renderYearOverview();
    if (window.autoLocalBackup) window.autoLocalBackup("settings-change");
  }

  // -----------------------
  // UI & meny
  // -----------------------
  function bindUI(){
    // meny
    initMenuToggle();

    // knappar
    $("saveEntryBtn").addEventListener("click", onSaveEntry);
    $("cancelEditBtn").addEventListener("click", cancelEdit);

    $("manualBackupBtn").addEventListener("click", () => { if(window.manualBackup) window.manualBackup(); });
    $("manualBackupBtn2").addEventListener("click", () => { if(window.manualBackup) window.manualBackup(); });

    $("exportCsvBtn").addEventListener("click", () => {
      if (window.exportCSVImpl) {
        const [year,month] = getSelectedYearMonth();
        window.exportCSVImpl(flattenMonthRows(year,month), settings, year, month);
      }
    });

    $("exportPdfBtn").addEventListener("click", () => {
      if (window.exportPDFImpl) {
        const [year,month] = getSelectedYearMonth();
        window.exportPDFImpl(flattenMonthRows(year,month), settings, year, month);
      }
    });

    $("exportYearBtn").addEventListener("click", () => {
      if (window.exportYearImpl) {
        window.exportYearImpl(flattenAllRows(), settings);
      }
    });

    $("openSearchBtn").addEventListener("click", () => {
      window.location.href = "search.html";
    });

    $("clearAllBtn").addEventListener("click", clearAllDataConfirm);
    $("saveSettingsBtn").addEventListener("click", saveSettingsFromUI);

    // import
    $("importFileInput").addEventListener("change", onImportFileInputChange);

    // periodval
    $("yearSelect").addEventListener("change", () => {
      renderMonth();
      renderLarm();
      renderYearOverview();
    });
    $("monthSelect").addEventListener("change", () => {
      renderMonth();
      renderLarm();
    });

    // date showPicker (för hela fältet)
    const di = $("dateInput");
    if (di && di.showPicker) {
      di.addEventListener("click", e => e.target.showPicker());
    }
  }

  function initMenuToggle(){
    const panel = $("sidePanel");
    const btn   = $("menuToggleBtn");
    const overlay = $("menuOverlay");
    if (!panel || !btn || !overlay) return;

    function setOpen(open){
      panel.classList.toggle("open", open);
      overlay.classList.toggle("show", open);
      panel.setAttribute("aria-hidden", open ? "false" : "true");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    btn.addEventListener("click", () => {
      const nowOpen = !panel.classList.contains("open");
      setOpen(nowOpen);
    });

    overlay.addEventListener("click", () => setOpen(false));

    document.addEventListener("click", (e) => {
      if (!panel.contains(e.target) && !btn.contains(e.target) && !overlay.contains(e.target)) {
        setOpen(false);
      }
    });
  }

  // -----------------------
  // År / Månad select
  // -----------------------
  function populateYearMonthSelectors(){
    const ySel = $("yearSelect");
    const mSel = $("monthSelect");
    if (!ySel || !mSel) return;

    const years = new Set();
    const curY = new Date().getFullYear();
    years.add(curY);

    for (let m=1; m<=12; m++){
      (allData[String(m)]||[]).forEach(r => {
        if (!r.datum) return;
        const y = new Date(r.datum).getFullYear();
        if (!isNaN(y)) years.add(y);
      });
    }

    const sorted = [...years].sort((a,b)=>a-b);
    ySel.innerHTML = sorted.map(y =>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];
    const curM = new Date().getMonth()+1;
    mSel.innerHTML = monthNames.map((name,idx) =>
      `<option value="${idx+1}" ${idx+1===curM?"selected":""}>${name}</option>`
    ).join("");
  }

  function getSelectedYearMonth(){
    const year = parseInt($("yearSelect").value,10) || new Date().getFullYear();
    const month = parseInt($("monthSelect").value,10) || (new Date().getMonth()+1);
    return [year,month];
  }

  // -----------------------
  // Kategorirader (dynamic)
  // -----------------------
  const CATEGORY_OPTIONS = [
    "Ordinarie tid",
    "Flextid",
    "ATF",
    "ÖT <2",
    "ÖT >2",
    "ÖT Helg",
    "Semester",
    "VAB",
    "Sjuk",
    "Föräldraledig",
    "Traktamente"
  ];

  function initCategoryRows(){
    const wrap = $("categoryRows");
    if (!wrap) return;
    wrap.innerHTML = "";
    addCategoryRow(true); // första, ej borttagningsbar
  }

  function buildCategorySelect(){
    const sel = document.createElement("select");
    sel.className = "cat-select";
    sel.innerHTML = `<option value="">(välj)</option>` +
      CATEGORY_OPTIONS.map(c => `<option value="${c}">${c}</option>`).join("");
    return sel;
  }

  function addCategoryRow(isFirst){
    const wrap = $("categoryRows");
    if (!wrap) return;

    const row = document.createElement("div");
    row.className = "cat-row";

    const sel = buildCategorySelect();
    const hrs = document.createElement("input");
    hrs.type = "number";
    hrs.step = "0.25";
    hrs.className = "cat-hours";

    const btn = document.createElement("button");
    if (isFirst){
      btn.className = "cat-add-btn";
      btn.innerHTML = `<i data-lucide="plus-circle"></i>`;
      btn.addEventListener("click", () => addCategoryRow(false));
    } else {
      btn.className = "remove-btn";
      btn.innerHTML = `<i data-lucide="minus-circle"></i>`;
      btn.addEventListener("click", () => {
        row.remove();
        if (window.lucide) lucide.createIcons();
      });
    }

    row.appendChild(sel);
    row.appendChild(hrs);
    row.appendChild(btn);
    wrap.appendChild(row);

    if (window.lucide) lucide.createIcons();
  }

  function collectCategoriesFromForm(){
    const rows = Array.from(document.querySelectorAll("#categoryRows .cat-row"));
    const out = [];
    const used = new Set();

    rows.forEach((row, idx) => {
      const sel = row.querySelector(".cat-select");
      const hrs = row.querySelector(".cat-hours");
      if (!sel || !hrs) return;
      const cat = (sel.value || "").trim();
      const h = parseNum(hrs.value);
      if (!cat || h === 0) return;

      if (used.has(cat)){
        // ignorera dubbletter i samma inmatning
        return;
      }
      used.add(cat);
      out.push({ kategori: cat, tid: h });
    });

    return out;
  }

  function fillCategoryRowsFromBundle(bundle){
    initCategoryRows();
    const wrap = $("categoryRows");
    if (!wrap) return;
    if (!bundle || !bundle.length) return;

    // första raden
    const first = wrap.querySelector(".cat-row");
    const firstSel = first.querySelector(".cat-select");
    const firstH = first.querySelector(".cat-hours");

    bundle.forEach((r, idx) => {
      if (idx === 0){
        if (firstSel) firstSel.value = r.kategori || "";
        if (firstH) firstH.value = r.tid ?? "";
      } else {
        addCategoryRow(false);
        const rows = Array.from(document.querySelectorAll("#categoryRows .cat-row"));
        const row = rows[rows.length-1];
        const sel = row.querySelector(".cat-select");
        const h   = row.querySelector(".cat-hours");
        if (sel) sel.value = r.kategori || "";
        if (h)   h.value   = r.tid ?? "";
      }
    });
  }

  // -----------------------
  // Spara / Redigera
  // -----------------------
  function onSaveEntry(){
    const datum = ($("dateInput").value || "").trim();
    if (!datum){
      alert("Datum saknas.");
      return;
    }
    const dObj = new Date(datum);
    if (isNaN(dObj)){
      alert("Ogiltigt datum.");
      return;
    }

    const cats = collectCategoriesFromForm();
    if (!cats.length){
      alert("Ange minst en kategori med tid.");
      return;
    }

    const projekt = ($("projektInput").value || "").trim();
    const kortid  = parseNum($("driveHoursInput").value);
    const note    = ($("noteInput").value || "").trim();

    const bundleId = editId || genId();

    // ta bort gamla rader för denna bundleId (om vi redigerar)
    if (editId){
      for (let m=1;m<=12;m++){
        const k = String(m);
        allData[k] = (allData[k]||[]).filter(r => r._id !== editId);
      }
    }

    const monthFromDate = dObj.getMonth()+1;
    const mk = String(monthFromDate);
    if (!allData[mk]) allData[mk] = [];

    cats.forEach((c, idx) => {
      allData[mk].push({
        _id: bundleId,
        datum,
        projekt,
        kategori: c.kategori,
        tid: c.tid,
        kortid: idx === 0 ? kortid : 0,
        beskrivning: idx === 0 ? note : ""
      });
    });

    saveData(editId ? "edit-entry" : "add-entry");
    clearForm();
    // välj månad enligt datum så användaren ser raden direkt
    $("monthSelect").value = String(monthFromDate);
    $("yearSelect").value = String(dObj.getFullYear());
    renderMonth();
    renderLarm();
    renderYearOverview();
  }

  function startEdit(id){
    if (!id) return;
    // hitta alla rader med samma _id
    const bundle = [];
    for (let m=1;m<=12;m++){
      const k = String(m);
      (allData[k]||[]).forEach(r => {
        if (r._id === id) bundle.push(r);
      });
    }
    if (!bundle.length) return;

    editId = id;
    bundle.sort((a,b) => a.kategori.localeCompare(b.kategori));

    const base = bundle[0];
    $("dateInput").value = base.datum || "";
    $("projektInput").value = base.projekt || "";
    const driveRow = bundle.find(r => r.kortid && r.kortid !== 0) || base;
    $("driveHoursInput").value = driveRow.kortid || "";
    $("noteInput").value = base.beskrivning || "";

    fillCategoryRowsFromBundle(bundle);

    $("saveEntryLabel").textContent = "Spara";
    $("cancelEditBtn").style.display = "inline-flex";
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function deleteBundle(id){
    if (!id) return;
    if (!confirm("Ta bort den här inmatningen?")) return;
    for (let m=1;m<=12;m++){
      const k = String(m);
      allData[k] = (allData[k]||[]).filter(r => r._id !== id);
    }
    saveData("delete-entry");
    renderMonth();
    renderLarm();
    renderYearOverview();
  }

  function cancelEdit(){
    clearForm();
  }

  function clearForm(){
    editId = null;
    if ($("dateInput")) $("dateInput").value = "";
    if ($("projektInput")) $("projektInput").value = "";
    if ($("driveHoursInput")) $("driveHoursInput").value = "";
    if ($("noteInput")) $("noteInput").value = "";
    initCategoryRows();
    $("saveEntryLabel").textContent = "Lägg till";
    $("cancelEditBtn").style.display = "none";
  }

  // -----------------------
  // Rensa allt
  // -----------------------
  function clearAllDataConfirm(){
    if (!confirm("Är du säker? Detta raderar ALL din data i appen.")) return;
    allData = {};
    normalizeAllData();
    saveData("clear-all");
    renderMonth();
    renderLarm();
    renderYearOverview();
  }

  // -----------------------
  // Import
  // -----------------------
  function onImportFileInputChange(ev){
    const file = ev.target.files[0];
    if (!file) return;
    if (!window.importBackupFile){
      alert("Importfunktion saknas (backup.js).");
      return;
    }
    window.importBackupFile(file, payload => {
      if (payload.data && typeof payload.data === "object"){
        allData = payload.data;
      } else if (Array.isArray(payload.data)){
        // gammalt platt
        allData = {};
        payload.data.forEach(r => {
          if (!r.datum) return;
          const m = new Date(r.datum).getMonth()+1;
          const k = String(m);
          if (!allData[k]) allData[k] = [];
          allData[k].push(r);
        });
      }
      normalizeAllData();
      if (payload.settings && typeof payload.settings === "object"){
        settings = Object.assign({}, settings, payload.settings);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
      saveData("import");
      loadSettings();
      populateYearMonthSelectors();
      renderMonth();
      renderLarm();
      renderYearOverview();
      alert("Import klar.");
    });
  }

  // -----------------------
  // Render: Månad
  // -----------------------
  function renderMonth(){
    const [year, month] = getSelectedYearMonth();
    const tbody = $("monthTableBody");
    const sumCell = $("monthSummaryCell");
    if (!tbody || !sumCell) return;

    tbody.innerHTML = "";

    const rows = (allData[String(month)] || [])
      .filter(r => r.datum && new Date(r.datum).getFullYear() === year)
      .sort((a,b) => a.datum.localeCompare(b.datum) || (a.projekt||"").localeCompare(b.projekt||""));

    const statusMap = window.BalansRegler
      ? window.BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    rows.forEach(r => {
      const tr = document.createElement("tr");
      const st = statusMap[r.datum]?.status;
      if (st) tr.classList.add("dagstatus--"+st);

      tr.innerHTML = `
        <td>${r.datum || ""}</td>
        <td>${r.projekt || ""}</td>
        <td>${r.kategori || ""}</td>
        <td>${(r.tid ?? "")}</td>
        <td>${(r.kortid ?? "")}</td>
        <td>${(r.beskrivning || "").replace(/\r?\n/g," ")}</td>
        <td style="white-space:nowrap;">
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

    // binda knappar
    tbody.querySelectorAll("button[data-act='edit']").forEach(btn => {
      btn.addEventListener("click", () => startEdit(btn.dataset.id));
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn => {
      btn.addEventListener("click", () => deleteBundle(btn.dataset.id));
    });

    if (window.lucide) lucide.createIcons();

    renderMonthSummary(rows);
  }

  function renderMonthSummary(rows){
    const cell = $("monthSummaryCell");
    if (!cell) return;

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
      fal:0,
      trakt:0
    };

    rows.forEach(r => {
      const k = (r.kategori || "").toLowerCase();
      const h = parseNum(r.tid);
      const kd= parseNum(r.kortid);

      if (k.includes("ordinarie")) sum.ord += h;
      if (k.includes("flex")) sum.flex += h;
      if (k.includes("öT".toLowerCase()) || k.includes("öt")) {
        if (k.includes("<2")) sum.ot1 += h;
        else sum.ot2 += h;
      }
      if (k.includes("helg") && k.includes("öt")) sum.ot2 += h;
      if (k.includes("semest")) sum.sem += h;
      if (k.includes("atf")) sum.atf += h;
      if (k.includes("vab")) sum.vab += h;
      if (k.includes("sjuk")) sum.sjuk += h;
      if (k.includes("föräldra")) sum.fal += h;
      if (k.includes("trakt")) sum.trakt += 1;

      sum.kortid += kd;
    });

    cell.textContent =
      `Ordinarie: ${sum.ord.toFixed(2)}h | ` +
      `Körtid: ${sum.kortid.toFixed(2)}h | ` +
      `Flex: ${sum.flex.toFixed(2)}h | ` +
      `ÖT<2: ${sum.ot1.toFixed(2)}h | ` +
      `ÖT>2/Helg: ${sum.ot2.toFixed(2)}h | ` +
      `Semester: ${sum.sem.toFixed(2)}h | ` +
      `ATF: ${sum.atf.toFixed(2)}h | ` +
      `VAB: ${sum.vab.toFixed(2)}h | ` +
      `Sjuk: ${sum.sjuk.toFixed(2)}h | ` +
      `Föräldraledig: ${sum.fal.toFixed(2)}h | ` +
      `Trakt: ${sum.trakt} st`;
  }

  // -----------------------
  // Larm / Obalans
  // -----------------------
  function renderLarm(){
    const sec = $("larmSection");
    const cont = $("larmContent");
    if (!sec || !cont) return;

    const [year,month] = getSelectedYearMonth();
    const rows = (allData[String(month)]||[])
      .filter(r => r.datum && new Date(r.datum).getFullYear() === year);

    const statusMap = window.BalansRegler
      ? window.BalansRegler.buildDayStatusMap(rows, settings, year, month)
      : {};

    const today = new Date();
    const lastDay = new Date(year, month, 0).getDate();

    const problems = [];

    for (let d=1; d<=lastDay; d++){
      const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dayDate = new Date(dateStr);
      if (isNaN(dayDate)) continue;
      // larma bara för dagar som redan passerat (inte framtid)
      if (dayDate > today) continue;

      const stObj = statusMap[dateStr];
      if (!stObj) continue;
      const st = stObj.status;

      if (st === "saknas"){
        problems.push({ datum:dateStr, status:"🔴 Ingen registrering", hours:0 });
      } else if (st === "orange_under"){
        problems.push({ datum:dateStr, status:"⚠️ Under 8h", hours:stObj.totalHours || 0 });
      } else if (st === "orange_absence"){
        problems.push({ datum:dateStr, status:"⚠️ Frånvaro", hours:stObj.totalHours || 0 });
      }
      // helg / röddag -> inget larm
    }

    if (!problems.length){
      cont.className = "larm-empty";
      cont.textContent = "Inga larm – alla avslutade dagar är i balans. ✅";
      return;
    }

    // bygga tabell
    const table = document.createElement("table");
    table.className = "larm-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Datum</th>
          <th>Tid (h)</th>
          <th>Status (larm)</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tb = table.querySelector("tbody");
    problems.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.datum}</td>
        <td>${p.hours.toFixed(2)}</td>
        <td>${p.status}</td>
      `;
      tb.appendChild(tr);
    });

    cont.className = "";
    cont.innerHTML = "";
    cont.appendChild(table);
  }

  // -----------------------
  // Årsöversikt
  // -----------------------
  function renderYearOverview(){
    const tbody = $("yearTableBody");
    const ySel = $("yearSelect");
    if (!tbody || !ySel) return;
    const year = parseInt(ySel.value,10) || new Date().getFullYear();

    tbody.innerHTML = "";

    const monthNames = [
      "Januari","Februari","Mars","April","Maj","Juni",
      "Juli","Augusti","September","Oktober","November","December"
    ];

    for (let m=1;m<=12;m++){
      const arr = (allData[String(m)]||[])
        .filter(r => r.datum && new Date(r.datum).getFullYear() === year);

      const S = {
        ord:0,
        kortid:0,
        flex:0,
        ot1:0,
        ot2:0,
        sem:0,
        atf:0,
        vab:0,
        sjuk:0,
        fal:0,
        trakt:0
      };

      arr.forEach(r => {
        const k = (r.kategori || "").toLowerCase();
        const h = parseNum(r.tid);
        const kd = parseNum(r.kortid);

        if (k.includes("ordinarie")) S.ord += h;
        if (k.includes("flex")) S.flex += h;
        if ((k.includes("öT".toLowerCase()) || k.includes("öt")) && k.includes("<2")) S.ot1 += h;
        if ((k.includes("öT".toLowerCase()) || k.includes("öt")) && (!k.includes("<2") || k.includes(">2") || k.includes("helg"))) S.ot2 += h;
        if (k.includes("semest")) S.sem += h;
        if (k.includes("atf")) S.atf += h;
        if (k.includes("vab")) S.vab += h;
        if (k.includes("sjuk")) S.sjuk += h;
        if (k.includes("föräldra")) S.fal += h;
        if (k.includes("trakt")) S.trakt += 1;

        S.kortid += kd;
      });

      const hasAny = arr.length>0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${monthNames[m-1]}</td>
        <td>${hasAny ? S.ord.toFixed(2) : ""}</td>
        <td>${hasAny ? S.kortid.toFixed(2) : ""}</td>
        <td>${hasAny ? S.flex.toFixed(2) : ""}</td>
        <td>${hasAny ? S.ot1.toFixed(2) : ""}</td>
        <td>${hasAny ? S.ot2.toFixed(2) : ""}</td>
        <td>${hasAny ? S.sem.toFixed(2) : ""}</td>
        <td>${hasAny ? S.atf.toFixed(2) : ""}</td>
        <td>${hasAny ? S.vab.toFixed(2) : ""}</td>
        <td>${hasAny ? S.sjuk.toFixed(2) : ""}</td>
        <td>${hasAny ? S.fal.toFixed(2) : ""}</td>
        <td>${hasAny ? S.trakt : ""}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // -----------------------
  // Flatten helpers (export)
  // -----------------------
  function flattenMonthRows(year,month){
    return (allData[String(month)]||[])
      .filter(r => r.datum && new Date(r.datum).getFullYear()===year)
      .sort((a,b)=>a.datum.localeCompare(b.datum));
  }

  function flattenAllRows(){
    const out = [];
    for (let m=1;m<=12;m++){
      (allData[String(m)]||[]).forEach(r => out.push(r));
    }
    return out.sort((a,b)=> (a.datum||"").localeCompare(b.datum||""));
  }

  // -----------------------
  // Service Worker
  // -----------------------
  function registerServiceWorker(){
    if ("serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js?v="+APP_VERSION)
        .catch(err => console.warn("SW fel:",err));
    }
  }

})();