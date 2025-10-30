"use strict";

/*
  Tidrapport v10.0
  - Hanterar inmatning av rader
  - Redigering / radering
  - Rendering av månadstabell och årsöversikt
  - Backup/restore/import/export
  - Inställningar
  - Meny/overlay
  - Balansregler (färgmarkering + saknas-rader)
*/

// =========================
// 0. State / constants
// =========================

const STORAGE_DATA_KEY = "tidrapport_data_v10";
const STORAGE_SETTINGS_KEY = "tidrapport_settings_v10";

// tidrapportData = [{ id, datum, kategori, tid, kortid, projekt, beskrivning, ... }]
let tidrapportData = [];
// settings = { company, name, anstnr, redDays, showRedDays, autoBackup, ... }
let settings = {};

let editId = null; // id för raden vi redigerar just nu, annars null

// =========================
// 1. Init
// =========================

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  loadData();
  initUIBindings();
  initMenuToggle();
  populateYearMonthSelectors();
  renderMonth();
  renderYearOverview();
  lucide?.createIcons();
});

// =========================
// 2. Load / Save data
// =========================

function loadData() {
  try {
    tidrapportData = JSON.parse(localStorage.getItem(STORAGE_DATA_KEY) || "[]");
    if (!Array.isArray(tidrapportData)) tidrapportData = [];
  } catch {
    tidrapportData = [];
  }
}

function saveData() {
  localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(tidrapportData));
}

function loadSettings() {
  try {
    settings = JSON.parse(localStorage.getItem(STORAGE_SETTINGS_KEY) || "{}");
    if (typeof settings !== "object" || settings === null) settings = {};
  } catch {
    settings = {};
  }
}

// =========================
// 3. UI-bindningar / init
// =========================

function initUIBindings() {
  // huvudknappar
  const saveBtn = document.getElementById("saveEntryBtn");
  const cancelBtn = document.getElementById("cancelEditBtn");
  const backupBtn1 = document.getElementById("manualBackupBtn");
  const backupBtn2 = document.getElementById("manualBackupBtn2");
  const csvBtn = document.getElementById("exportCsvBtn");
  const pdfBtn = document.getElementById("exportPdfBtn");
  const yearBtn = document.getElementById("exportYearBtn");
  const searchBtn = document.getElementById("openSearchBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const importFile = document.getElementById("importFileInput");
  const saveSetBtn = document.getElementById("saveSettingsBtn");

  const dateInput = document.getElementById("dateInput");
  if (dateInput) {
    dateInput.addEventListener("click", e => {
      // gör så att man kan trycka var som helst i fältet och få upp datumväljaren
      if (e.target && e.target.showPicker) {
        e.target.showPicker();
      }
    });
  }

  if (saveBtn) saveBtn.addEventListener("click", saveEntry);
  if (cancelBtn) cancelBtn.addEventListener("click", cancelEdit);

  if (backupBtn1) backupBtn1.addEventListener("click", manualBackup);
  if (backupBtn2) backupBtn2.addEventListener("click", manualBackup);

  if (csvBtn) csvBtn.addEventListener("click", exportCSV);
  if (pdfBtn) pdfBtn.addEventListener("click", exportPDF);
  if (yearBtn) yearBtn.addEventListener("click", exportYearOverview);

  if (searchBtn) searchBtn.addEventListener("click", openSearchWindow);

  if (clearAllBtn) clearAllBtn.addEventListener("click", clearAllDataConfirm);

  if (importFile) importFile.addEventListener("change", importJSONFile);

  if (saveSetBtn) saveSetBtn.addEventListener("click", saveSettingsFromUI);

  // år/månad
  const ysel = document.getElementById("yearSelect");
  const msel = document.getElementById("monthSelect");
  if (ysel) ysel.addEventListener("change", () => { renderMonth(); renderYearOverview(); });
  if (msel) msel.addEventListener("change", () => { renderMonth(); });

  // återställ settings till UI
  restoreSettingsToUI();
}

// =========================
// 4. Settings (inställningar)
// =========================

function restoreSettingsToUI() {
  document.getElementById("companyInput").value = settings.company || "";
  document.getElementById("nameInput").value = settings.name || "";
  document.getElementById("anstnrInput").value = settings.anstnr || "";

  document.getElementById("redDaysInput").value = settings.redDays || "";
  document.getElementById("showRedDaysChk").checked = !!settings.showRedDays;
  document.getElementById("autoBackupChk").checked = !!settings.autoBackup;
}

function saveSettingsFromUI() {
  settings.company = document.getElementById("companyInput").value || "";
  settings.name = document.getElementById("nameInput").value || "";
  settings.anstnr = document.getElementById("anstnrInput").value || "";
  settings.redDays = document.getElementById("redDaysInput").value || "";
  settings.showRedDays = document.getElementById("showRedDaysChk").checked;
  settings.autoBackup = document.getElementById("autoBackupChk").checked;

  localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));

  // efter ändrad inställning som påverkar vy (t.ex. röda dagar) -> rendera om
  renderMonth();
  renderYearOverview();
  autoBackup("settings-change");
}

// =========================
// 5. År/Månad dropdowns
// =========================

function populateYearMonthSelectors() {
  const ysel = document.getElementById("yearSelect");
  const msel = document.getElementById("monthSelect");
  if (!ysel || !msel) return;

  // år -> samlingsår i datat + aktuellt år
  const yearsSeen = new Set();
  const curY = new Date().getFullYear();
  yearsSeen.add(curY);
  tidrapportData.forEach(r => {
    if (!r.datum) return;
    const y = (new Date(r.datum)).getFullYear();
    yearsSeen.add(y);
  });
  const yearsSorted = [...yearsSeen].sort((a,b)=>a-b);
  ysel.innerHTML = yearsSorted.map(y => `<option value="${y}" ${y===curY ? "selected":""}>${y}</option>`).join("");

  // månader 1-12
  const curM = (new Date().getMonth() + 1);
  msel.innerHTML = Array.from({length:12},(_,i)=>i+1).map(m=>{
    return `<option value="${m}" ${m===curM?"selected":""}>${m}</option>`;
  }).join("");
}

// =========================
// 6. Spara / Redigera / Ta bort rad
// =========================

function collectEntryFromForm() {
  const dateVal = (document.getElementById("dateInput").value || "").trim();
  const catMain = document.getElementById("catMainSelect").value || "";
  const catMainHours = parseFloat(document.getElementById("catMainHours").value || "0") || 0;

  const extra1Sel = document.querySelector('.catExtraSelect[data-extra-index="1"]');
  const extra1Hrs = document.querySelector('.catExtraHours[data-extra-index="1"]');
  const extra2Sel = document.querySelector('.catExtraSelect[data-extra-index="2"]');
  const extra2Hrs = document.querySelector('.catExtraHours[data-extra-index="2"]');

  const catExtras = [];

  // huvudkategori
  if (catMain && catMainHours > 0) {
    catExtras.push({
      kategori: catMain,
      tid: catMainHours
    });
  }

  // extra1
  if (extra1Sel && extra1Hrs) {
    const c = extra1Sel.value || "";
    const h = parseFloat(extra1Hrs.value || "0") || 0;
    if (c && h > 0) {
      catExtras.push({ kategori: c, tid: h });
    }
  }

  // extra2
  if (extra2Sel && extra2Hrs) {
    const c = extra2Sel.value || "";
    const h = parseFloat(extra2Hrs.value || "0") || 0;
    if (c && h > 0) {
      catExtras.push({ kategori: c, tid: h });
    }
  }

  // traktamente checkbox
  const trakt = document.getElementById("traktChk").checked;
  if (trakt) {
    // traktamente räknas som kategori, men utan krav på timmar
    catExtras.push({ kategori: "Traktamente", tid: 0 });
  }

  // summera total arbetstid = alla categories med timmar
  let totalTid = 0;
  catExtras.forEach(c => {
    totalTid += parseFloat(c.tid) || 0;
  });

  // projekt
  const projektVal = (document.getElementById("projektInput").value || "").trim(); // <-- ingen default som "Y2506"
  const driveHrsVal = parseFloat(document.getElementById("driveHoursInput").value || "0") || 0;
  const noteVal = (document.getElementById("noteInput").value || "").trim();

  // spara en "platt" displayString också för bakåtkompatibilitet / export
  // tex "Ordinarie tid 6h, Flextid 2h, Traktamente"
  const kategoriText = catExtras.map(obj => {
    if (obj.kategori === "Traktamente") return "Traktamente";
    const h = (parseFloat(obj.tid)||0);
    return `${obj.kategori} ${h}h`;
  }).join(", ");

  const rowObj = {
    id: editId ?? genRowId(),
    datum: dateVal,
    kategori: kategoriText,     // display
    kategorier: catExtras,      // strukturerad lista
    tid: totalTid,              // totaltid
    kortid: driveHrsVal,        // kör-tid
    projekt: projektVal,
    beskrivning: noteVal
  };

  return rowObj;
}

function genRowId() {
  // enkel unik ID generator
  return Date.now() + "_" + Math.floor(Math.random()*999999);
}

function saveEntry() {
  const rowObj = collectEntryFromForm();
  if (!rowObj.datum) {
    alert("Datum saknas.");
    return;
  }

  if (editId) {
    // uppdatera befintlig rad
    const idx = tidrapportData.findIndex(r => r.id === editId);
    if (idx !== -1) {
      tidrapportData[idx] = rowObj;
    }
  } else {
    // ny rad
    tidrapportData.push(rowObj);
  }

  saveData();
  autoBackup("saveEntry");
  clearForm();
  editId = null;
  updateSaveButtonLabel();
  renderMonth();
  renderYearOverview();
}

function editRow(id) {
  const row = tidrapportData.find(r => r.id === id);
  if (!row) return;
  editId = id;

  // fyll form
  document.getElementById("dateInput").value = row.datum || "";

  // försök splitta till catMain / extras
  // vi tar första 3 kategorier, resten ignoreras just nu.
  const cats = Array.isArray(row.kategorier) ? row.kategorier : [];
  const mainCat = cats[0] || {};
  const extra1 = cats[1] || {};
  const extra2 = cats[2] || {};

  document.getElementById("catMainSelect").value = mainCat.kategori || "";
  document.getElementById("catMainHours").value = mainCat.tid || "";

  const ex1Sel = document.querySelector('.catExtraSelect[data-extra-index="1"]');
  const ex1Hrs = document.querySelector('.catExtraHours[data-extra-index="1"]');
  if (ex1Sel && ex1Hrs) {
    ex1Sel.value = extra1.kategori || "";
    ex1Hrs.value = extra1.tid || "";
  }

  const ex2Sel = document.querySelector('.catExtraSelect[data-extra-index="2"]');
  const ex2Hrs = document.querySelector('.catExtraHours[data-extra-index="2"]');
  if (ex2Sel && ex2Hrs) {
    ex2Sel.value = extra2.kategori || "";
    ex2Hrs.value = extra2.tid || "";
  }

  // trakt
  const traktBox = document.getElementById("traktChk");
  if (traktBox) {
    traktBox.checked = !!cats.find(c => (c.kategori || "").toLowerCase().includes("trakt"));
  }

  document.getElementById("projektInput").value = row.projekt || "";
  document.getElementById("driveHoursInput").value = row.kortid || "";
  document.getElementById("noteInput").value = row.beskrivning || "";

  updateSaveButtonLabel();
  document.getElementById("cancelEditBtn").style.display = "";
  // scrolla upp till formuläret vid redigering (mobilvänligt)
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteRow(id) {
  if (!confirm("Ta bort raden?")) return;
  tidrapportData = tidrapportData.filter(r => r.id !== id);
  saveData();
  autoBackup("deleteRow");
  renderMonth();
  renderYearOverview();
}

function cancelEdit() {
  editId = null;
  clearForm();
  updateSaveButtonLabel();
  document.getElementById("cancelEditBtn").style.display = "none";
}

function clearForm() {
  document.getElementById("dateInput").value = "";
  document.getElementById("catMainSelect").value = "";
  document.getElementById("catMainHours").value = "";
  const ex1Sel = document.querySelector('.catExtraSelect[data-extra-index="1"]');
  const ex1Hrs = document.querySelector('.catExtraHours[data-extra-index="1"]');
  if (ex1Sel) ex1Sel.value = "";
  if (ex1Hrs) ex1Hrs.value = "";

  const ex2Sel = document.querySelector('.catExtraSelect[data-extra-index="2"]');
  const ex2Hrs = document.querySelector('.catExtraHours[data-extra-index="2"]');
  if (ex2Sel) ex2Sel.value = "";
  if (ex2Hrs) ex2Hrs.value = "";

  document.getElementById("traktChk").checked = false;
  document.getElementById("projektInput").value = "";
  document.getElementById("driveHoursInput").value = "";
  document.getElementById("noteInput").value = "";
}

function updateSaveButtonLabel() {
  const lbl = document.getElementById("saveEntryLabel");
  if (!lbl) return;
  if (editId) {
    lbl.textContent = "Spara";
  } else {
    lbl.textContent = "Lägg till";
  }
}

// =========================
// 7. Auto-backup (COV-style)
// =========================

function autoBackup(reason) {
  // kör bara om setting är på
  if (!settings.autoBackup) return;
  // reason är typ "saveEntry", "deleteRow", "settings-change"
  // Vi kan spara en timestamp-namnad fil i localStorage backup-lista eller ladda ned .json direkt
  // Just nu: vi skapar en snapshot i localStorage
  try {
    const stamp = new Date().toISOString();
    const backupObj = {
      ts: stamp,
      data: tidrapportData,
      settings
    };
    localStorage.setItem(`tidrapport_autobackup_${stamp}`, JSON.stringify(backupObj));
  } catch (err) {
    console.warn("autoBackup fail:", err);
  }
}

function manualBackup() {
  // ladda ned en .json-fil med allt
  const payload = {
    data: tidrapportData,
    settings
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g,"-");
  a.download = `tidrapport_backup_${stamp}.json`;
  a.click();
}

// =========================
// 8. Import / Export
// =========================

function importJSONFile(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (Array.isArray(parsed)) {
        // gammalt format: bara array av rader
        tidrapportData = parsed;
      } else if (parsed && parsed.data) {
        tidrapportData = Array.isArray(parsed.data) ? parsed.data : [];
        if (parsed.settings && typeof parsed.settings === "object") {
          // slå inte sönder dina nuvarande settings om du inte vill - men vi tar in redDays m.m.
          settings = Object.assign({}, settings, parsed.settings);
        }
      }
      saveData();
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
      restoreSettingsToUI();
      populateYearMonthSelectors();
      renderMonth();
      renderYearOverview();
      alert("Import klar.");
    } catch (err) {
      alert("Import misslyckades: " + err);
    }
  };
  reader.readAsText(file);
}

// CSV (månad/projekt etc.) — du sa: funkar redan. Vi låter din befintliga exportCSV() köra.
function exportCSV() {
  // här ska ligga din befintliga CSV-exportlogik (oförändrad struktur)
  // vi utgår från att export.js ev. tar hand om mer detaljer. Om du har den där, kalla den:
  if (window.exportCSVImpl) {
    window.exportCSVImpl(tidrapportData, settings,
      document.getElementById("yearSelect").value,
      document.getElementById("monthSelect").value
    );
  } else {
    console.warn("exportCSVImpl saknas - kontrollera export.js");
  }
}

// PDF A3 liggande
function exportPDF() {
  if (window.exportPDFImpl) {
    window.exportPDFImpl(tidrapportData, settings,
      document.getElementById("yearSelect").value,
      document.getElementById("monthSelect").value
    );
  } else {
    console.warn("exportPDFImpl saknas - kontrollera export.js");
  }
}

// Årsöversikt-export (CSV/PDF/whatever du hade)
function exportYearOverview() {
  if (window.exportYearImpl) {
    window.exportYearImpl(tidrapportData, settings);
  } else {
    console.warn("exportYearImpl saknas - kontrollera export.js");
  }
}

// =========================
// 9. Rensa all data
// =========================

function clearAllDataConfirm() {
  const yes = confirm("Är du säker? Detta raderar ALL din data i appen.");
  if (!yes) return;
  tidrapportData = [];
  saveData();
  autoBackup("clearAll");
  renderMonth();
  renderYearOverview();
}

// =========================
// 10. Sök
// =========================

function openSearchWindow() {
  // öppnar söksidan (search.html) i ny tabb
  window.open("search.html", "_blank", "noopener");
}

// =========================
// 11. Render: Månad
// =========================

function renderMonth() {
  const tbody = document.getElementById("monthTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const ysel = document.getElementById("yearSelect");
  const msel = document.getElementById("monthSelect");
  const year = parseInt(ysel.value, 10);
  const month = parseInt(msel.value, 10);

  // plocka rader som tillhör vald månad
  const monthRows = tidrapportData.filter(r => {
    if (!r.datum) return false;
    const d = new Date(r.datum);
    return d.getFullYear() === year && (d.getMonth()+1) === month;
  });

  // bygg statuskarta med balansregler
  const statusMap = window.BalansRegler
    ? BalansRegler.buildDayStatusMap(monthRows, settings, year, month)
    : {};

  // gruppera per datum
  const byDate = {};
  monthRows.forEach(r => {
    if (!byDate[r.datum]) byDate[r.datum] = [];
    byDate[r.datum].push(r);
  });

  const daysInMonth = new Date(year, month, 0).getDate();

  for (let d=1; d<=daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const rows = byDate[dateStr] || [];
    const st = statusMap[dateStr]?.status || "";

    if (rows.length === 0) {
      // visa "saknas" om vardag utan rader
      // helg/röddag markeras men utan "saknas"-varning
      const tr = document.createElement("tr");
      tr.classList.add(`dagstatus--${st || "saknas"}`);
      tr.innerHTML = `
        <td>${dateStr}</td>
        <td colspan="6">
          ${ (st === "helg") ? "Helg" :
             (st === "röddag") ? "Röd dag" :
             "Saknas" }
        </td>`;
      tbody.appendChild(tr);
      continue;
    }

    // annars: skriv ut alla rader för det datumet
    rows.forEach(r => {
      const tr = document.createElement("tr");
      if (st) tr.classList.add(`dagstatus--${st}`);

      tr.innerHTML = `
        <td>${r.datum || ""}</td>
        <td>${r.projekt || ""}</td>
        <td>${r.kategori || ""}</td>
        <td>${(r.tid ?? "")}</td>
        <td>${(r.kortid ?? "")}</td>
        <td>${r.beskrivning || ""}</td>
        <td style="white-space:nowrap;">
          <button class="icon-btn" title="Ändra" onclick="editRow('${r.id}')">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="icon-btn" title="Ta bort" onclick="deleteRow('${r.id}')">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // rita om ikoner
  lucide?.createIcons();

  // summering längst ner
  renderMonthSummary(monthRows);
}

// =========================
// 12. Render: Månadssummering
// =========================

function renderMonthSummary(monthRows) {
  const cell = document.getElementById("monthSummaryCell");
  if (!cell) return;

  // summera timmar per "typ" (ordinarie, flex, övertid, sjuk, vab, osv)
  const sum = {
    ordinarie: 0,
    flextid: 0,
    ot_lt2: 0,
    ot_gt2: 0,
    semester: 0,
    atf: 0,
    vab: 0,
    sjuk: 0,
    trakt: 0,
    kortid: 0
  };

  monthRows.forEach(r => {
    const cats = Array.isArray(r.kategorier) ? r.kategorier : [];
    cats.forEach(c => {
      const name = (c.kategori||"").toLowerCase();
      const h = parseFloat(c.tid)||0;

      if (name.includes("ordinarie")) sum.ordinarie += h;
      if (name.includes("flex")) sum.flextid += h;
      if (name.includes("öt") && name.includes("<2")) sum.ot_lt2 += h;
      if (name.includes("öt") && (name.includes(">2") || name.includes("helg"))) sum.ot_gt2 += h;
      if (name.includes("semest")) sum.semester += h;
      if (name.includes("atf")) sum.atf += h;
      if (name.includes("vab")) sum.vab += h;
      if (name.includes("sjuk")) sum.sjuk += h;
      if (name.includes("trakt")) sum.trakt += 1; // antal trakt
    });

    const k = parseFloat(r.kortid)||0;
    sum.kortid += k;
  });

  cell.innerHTML = `
    Ordinarie: ${sum.ordinarie.toFixed(2)}h |
    Flex: ${sum.flextid.toFixed(2)}h |
    ÖT&lt;2: ${sum.ot_lt2.toFixed(2)}h |
    ÖT&gt;2/Helg: ${sum.ot_gt2.toFixed(2)}h |
    Semester: ${sum.semester.toFixed(2)}h |
    ATF: ${sum.atf.toFixed(2)}h |
    VAB: ${sum.vab.toFixed(2)}h |
    Sjuk: ${sum.sjuk.toFixed(2)}h |
    Trakt: ${sum.trakt} st |
    Körtid: ${sum.kortid.toFixed(2)}h
  `;
}

// =========================
// 13. Render: Årsöversikt
// =========================

function renderYearOverview() {
  const ysel = document.getElementById("yearSelect");
  const tbody = document.getElementById("yearTableBody");
  if (!ysel || !tbody) return;

  const year = parseInt(ysel.value,10);

  // summera per månad
  // Struktur: {1:{ordinarie:..., flextid:...,...,kortid:...}, 2:{...}, ...}
  const sumByMonth = {};
  for (let m=1; m<=12; m++) {
    sumByMonth[m] = {
      ordinarie:0,
      flextid:0,
      ot_lt2:0,
      ot_gt2:0,
      semester:0,
      atf:0,
      vab:0,
      sjuk:0,
      trakt:0,
      kortid:0
    };
  }

  tidrapportData.forEach(r => {
    if (!r.datum) return;
    const d = new Date(r.datum);
    const y = d.getFullYear();
    const m = d.getMonth()+1;
    if (y !== year) return;

    const cats = Array.isArray(r.kategorier) ? r.kategorier : [];
    cats.forEach(c => {
      const name = (c.kategori||"").toLowerCase();
      const h = parseFloat(c.tid)||0;

      if (name.includes("ordinarie")) sumByMonth[m].ordinarie += h;
      if (name.includes("flex")) sumByMonth[m].flextid += h;
      if (name.includes("öt") && name.includes("<2")) sumByMonth[m].ot_lt2 += h;
      if (name.includes("öt") && (name.includes(">2") || name.includes("helg"))) sumByMonth[m].ot_gt2 += h;
      if (name.includes("semest")) sumByMonth[m].semester += h;
      if (name.includes("atf")) sumByMonth[m].atf += h;
      if (name.includes("vab")) sumByMonth[m].vab += h;
      if (name.includes("sjuk")) sumByMonth[m].sjuk += h;
      if (name.includes("trakt")) sumByMonth[m].trakt += 1;
    });

    sumByMonth[m].kortid += (parseFloat(r.kortid)||0);
  });

  tbody.innerHTML = "";

  for (let m=1; m<=12; m++) {
    const S = sumByMonth[m];
    // skriv en rad per månad
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m}</td>
      <td>${S.ordinarie.toFixed(2)}</td>
      <td>${S.flextid.toFixed(2)}</td>
      <td>${S.ot_lt2.toFixed(2)}</td>
      <td>${S.ot_gt2.toFixed(2)}</td>
      <td>${S.semester.toFixed(2)}</td>
      <td>${S.atf.toFixed(2)}</td>
      <td>${S.vab.toFixed(2)}</td>
      <td>${S.sjuk.toFixed(2)}</td>
      <td>${S.trakt}</td>
      <td>${S.kortid.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  }
}

// =========================
// 14. Meny / sidopanel toggle (mobil m.m.)
// =========================

function initMenuToggle() {
  const panel = document.getElementById("sidePanel");
  const btn = document.getElementById("menuToggleBtn");
  if (!panel || !btn) return;

  btn.addEventListener("click", () => {
    const nowOpen = !panel.classList.contains("open");
    panel.classList.toggle("open", nowOpen);
    panel.setAttribute("aria-hidden", nowOpen ? "false" : "true");
    btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");
  });

  document.addEventListener("click", e => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      // klick utanför -> stäng
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
      btn.setAttribute("aria-expanded", "false");
    }
  });
}

// expose några funktioner globalt (för onclick i tabellen)
window.editRow = editRow;
window.deleteRow = deleteRow;