// Tidrapport v10.11
// Detta är "hjärnan": state, render, meny, inmatning, export-hookar

// *** KONFIG ***
const APP_VERSION = "v10.11";

// Kategorier i appen (visas i dropdown)
const CATEGORY_OPTIONS = [
    "Ordinarie tid",
    "Flextid",
    "ÖT<2",
    "ÖT>2",
    "ÖT-Helg",
    "Semester",
    "ATF",
    "VAB",
    "Sjuk",
    "Trakt",
    "FL" // Föräldraledig
];

// Keys i localStorage
const LS_ENTRIES_KEY = "tidrapport_entries";
const LS_SETTINGS_KEY = "tidrapport_settings";

// State i minnet
let entries = []; // [{date, project, drive, note, items:[{cat,hours}]}]
let settings = {
    company: "",
    name: "",
    empNo: "",
    autoBackup: false
};

// Aktuell period
let currentYear;
let currentMonth; // 0-11 internt

// DOM refs
const menuOverlay   = document.getElementById("menuOverlay");
const sideMenu      = document.getElementById("sideMenu");
const menuToggleBtn = document.getElementById("menuToggle");

const menuYearSel   = document.getElementById("menuYear");
const menuMonthSel  = document.getElementById("menuMonth");

const inputDateSel  = document.getElementById("inputDate");
const inputProject  = document.getElementById("inputProject");
const inputDrive    = document.getElementById("inputDrive");
const inputNote     = document.getElementById("inputNote");

const categoryRowsContainer = document.getElementById("categoryRows");
const addCategoryBtn        = document.getElementById("addCategoryBtn");
const saveEntriesBtn        = document.getElementById("saveEntriesBtn");

const monthTableBody        = document.getElementById("monthTableBody");
const monthSummaryMain      = document.getElementById("monthSummaryMain");
const monthSummaryProjects  = document.getElementById("monthSummaryProjects");

const larmTableBody         = document.getElementById("larmTableBody");

const yearTableBody         = document.getElementById("yearTableBody");

const importFileInput       = document.getElementById("importFileInput");
const backupNowBtn          = document.getElementById("backupNowBtn");
const exportCsvBtn          = document.getElementById("exportCsvBtn");
const exportPdfBtn          = document.getElementById("exportPdfBtn");
const exportYearBtn         = document.getElementById("exportYearBtn");
const clearAllBtn           = document.getElementById("clearAllBtn");

const settingCompany        = document.getElementById("settingCompany");
const settingName           = document.getElementById("settingName");
const settingEmpNo          = document.getElementById("settingEmpNo");
const settingAutoBackup     = document.getElementById("settingAutoBackup");
const saveSettingsBtn       = document.getElementById("saveSettingsBtn");

const searchBtn             = document.getElementById("searchBtn");
const helpBtn               = document.getElementById("helpBtn");

// --------------------------------------------------
// INIT / STORAGE
// --------------------------------------------------

function loadFromStorage() {
    try {
        const rawE = localStorage.getItem(LS_ENTRIES_KEY);
        if (rawE) entries = JSON.parse(rawE);
    } catch(e){ entries = []; }

    try {
        const rawS = localStorage.getItem(LS_SETTINGS_KEY);
        if (rawS) settings = JSON.parse(rawS);
    } catch(e){ /* keep defaults */ }

    if (!Array.isArray(entries)) entries = [];
    if (!settings || typeof settings!=="object") {
        settings = {
            company:"",
            name:"",
            empNo:"",
            autoBackup:false
        };
    }
}

function saveToStorage() {
    localStorage.setItem(LS_ENTRIES_KEY, JSON.stringify(entries));
}

function saveSettingsToStorage() {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
}

// --------------------------------------------------
// MENY ÖPPNA/STÄNG
// --------------------------------------------------

function openMenu() {
    document.body.classList.add("menu-open");
    menuOverlay.classList.add("open");
    sideMenu.classList.add("open");
}

function closeMenu() {
    document.body.classList.remove("menu-open");
    menuOverlay.classList.remove("open");
    sideMenu.classList.remove("open");
}

// --------------------------------------------------
// PERIODVAL (ÅR/MÅNAD)
// --------------------------------------------------

function getAllYearsFromEntries() {
    const years = new Set();
    const nowY  = new Date().getFullYear();
    years.add(nowY);
    for (const e of entries) {
        const y = new Date(e.date).getFullYear();
        years.add(y);
    }
    return Array.from(years).sort((a,b)=>a-b);
}

function initPeriodSelectors() {
    // year
    const years = getAllYearsFromEntries();
    menuYearSel.innerHTML = "";
    years.forEach(y=>{
        const opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = y;
        menuYearSel.appendChild(opt);
    });

    // default currentYear
    if (!currentYear) {
        currentYear = new Date().getFullYear();
    }
    if (!years.includes(currentYear)) {
        years.push(currentYear);
        years.sort((a,b)=>a-b);
        menuYearSel.innerHTML="";
        years.forEach(y=>{
            const opt = document.createElement("option");
            opt.value=String(y);
            opt.textContent=y;
            menuYearSel.appendChild(opt);
        });
    }
    menuYearSel.value = String(currentYear);

    // month
    const monthsSv = [
        "Januari","Februari","Mars","April","Maj","Juni",
        "Juli","Augusti","September","Oktober","November","December"
    ];
    menuMonthSel.innerHTML = "";
    monthsSv.forEach((m,i)=>{
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = m;
        menuMonthSel.appendChild(opt);
    });

    if (currentMonth===undefined || currentMonth===null) {
        currentMonth = (new Date()).getMonth();
    }
    menuMonthSel.value = String(currentMonth);
}

function updateCurrentPeriodFromMenu() {
    currentYear  = parseInt(menuYearSel.value,10);
    currentMonth = parseInt(menuMonthSel.value,10);
    renderAll();
}

// --------------------------------------------------
// DATUM-DROPDOWN (inputDateSel) baserat på vald månad/år
// --------------------------------------------------
function buildDateOptions() {
    // alla dagar i currentMonth/currentYear
    const year = currentYear;
    const month = currentMonth;
    if (year===undefined || month===undefined) return;

    const first = new Date(year, month, 1);
    const nextm = new Date(year, month+1, 1);
    const daysInMonth = Math.round((nextm - first)/86400000);

    inputDateSel.innerHTML = "";
    for (let d=1; d<=daysInMonth; d++){
        const dateStr = formatDateYYYYMMDD(year, month, d);
        const opt = document.createElement("option");
        opt.value = dateStr;
        opt.textContent = dateStr;
        inputDateSel.appendChild(opt);
    }
}

// --------------------------------------------------
// HJÄLPFUNKTIONER FÖR FORMAT
// --------------------------------------------------
function pad2(n){
    return n<10 ? "0"+n : ""+n;
}
function formatDateYYYYMMDD(y,m,d){
    return y+"-"+pad2(m+1)+"-"+pad2(d);
}

// månadens namn på svenska
const MONTH_NAMES_SV = [
    "Januari","Februari","Mars","April","Maj","Juni",
    "Juli","Augusti","September","Oktober","November","December"
];

// --------------------------------------------------
// KATEGORI-RADER I FORMULÄRET
// --------------------------------------------------

// vi håller en lista av row-obj i minnet innan save
// men enklare är att läsa DOM vid save.
// categoryRowsContainer innehåller flera .category-row-wrapper

function createCategoryRow(isFirst=false) {
    const wrap = document.createElement("div");
    wrap.className = "category-row-wrapper";

    const fieldCat = document.createElement("div");
    fieldCat.className = "field";
    const labCat = document.createElement("label");
    labCat.textContent = isFirst? "Kategori" : "Kategori";
    labCat.style.fontSize="0.8rem";
    const sel = document.createElement("select");
    sel.className = "cat-select";
    sel.innerHTML = ""; // fyll senare
    fieldCat.appendChild(labCat);
    fieldCat.appendChild(sel);

    const fieldHours = document.createElement("div");
    fieldHours.className = "field";
    const labH = document.createElement("label");
    labH.textContent = "Tid (h, +/-)";
    labH.style.fontSize="0.8rem";
    const inp = document.createElement("input");
    inp.type = "text"; // tillåt minus
    inp.className = "cat-hours";
    inp.placeholder = "t.ex. 8 eller -2";
    fieldHours.appendChild(labH);
    fieldHours.appendChild(inp);

    const remBtn = document.createElement("button");
    remBtn.type = "button";
    remBtn.className = "remove-cat-btn";
    remBtn.innerHTML = '<i data-lucide="minus-circle"></i>';
    if (isFirst) {
        remBtn.setAttribute("data-first","true");
    }
    remBtn.addEventListener("click", ()=>{
        if (isFirst) return;
        wrap.remove();
        refreshCategorySelectOptions();
    });

    wrap.appendChild(fieldCat);
    wrap.appendChild(fieldHours);
    wrap.appendChild(remBtn);

    categoryRowsContainer.appendChild(wrap);

    // fyll kategori-dropdown efter att vi appendat
    refreshCategorySelectOptions();
    lucide.createIcons();
}

function getChosenCategoriesInForm() {
    const cats = [];
    const rows = categoryRowsContainer.querySelectorAll(".category-row-wrapper");
    rows.forEach(row=>{
        const sel = row.querySelector(".cat-select");
        if (sel && sel.value) cats.push(sel.value);
    });
    return cats;
}

function refreshCategorySelectOptions() {
    // för varje rad, fyll droppdown med alla CATEGORY_OPTIONS
    // men disable dem som redan är valda i andra rader (ingen dubblett)
    const chosen = getChosenCategoriesInForm();

    const rows = categoryRowsContainer.querySelectorAll(".category-row-wrapper");
    rows.forEach(row=>{
        const sel = row.querySelector(".cat-select");
        const prevVal = sel.value;
        sel.innerHTML = "";
        CATEGORY_OPTIONS.forEach(optVal=>{
            const o = document.createElement("option");
            o.value = optVal;
            o.textContent = optVal;
            // disable om redan valt i annan rad och inte samma rad
            if (chosen.includes(optVal) && optVal!==prevVal) {
                o.disabled = true;
            }
            sel.appendChild(o);
        });
        // försök återställa prevVal
        if (prevVal) sel.value = prevVal;
        if (!sel.value) {
            // ta första icke-disabled
            const firstOk = Array.from(sel.options).find(op=>!op.disabled);
            if (firstOk) sel.value = firstOk.value;
        }
    });
}

// --------------------------------------------------
// SPARA RAD(ER)
// --------------------------------------------------

function parseFloatOrZero(x){
    const v = parseFloat((x+"").replace(",","."));
    if (isNaN(v)) return 0;
    return v;
}

function saveCurrentFormEntries() {
    const dateVal = inputDateSel.value;
    const projVal = inputProject.value.trim();
    const driveVal = parseFloatOrZero(inputDrive.value); // kan vara negativ
    const noteVal = inputNote.value.trim();

    // plocka rader
    const catRows = [];
    categoryRowsContainer.querySelectorAll(".category-row-wrapper").forEach(row=>{
        const cat = row.querySelector(".cat-select")?.value || "";
        const hrs = parseFloatOrZero(row.querySelector(".cat-hours")?.value || "0");
        if (cat && hrs !== 0) {
            catRows.push({cat, hours: hrs});
        }
    });

    if (!dateVal || catRows.length===0) {
        // inget att spara? Vi kräver minst en rad med timmar
        return;
    }

    // Spara som en post per kategori (så vi kan lista dem separat i tabellen)
    // MEN: vi behöver veta gemensam körtid. Vi lägger drive på varje post,
    // men summeringskod får se till att inte dubbelräkna.
    for (const r of catRows) {
        entries.push({
            date: dateVal,
            project: projVal,
            drive: driveVal,
            note: noteVal,
            items: [ {cat: r.cat, hours: r.hours} ] // varje entry håller EN kategori
        });
    }

    saveToStorage();

    if (settings.autoBackup) {
        doBackupNowSilent();
    }

    // rensa inputs (men lämna år/månad)
    inputProject.value = "";
    inputDrive.value   = "";
    inputNote.value    = "";
    categoryRowsContainer.innerHTML = "";
    createCategoryRow(true);

    renderAll();
}

// --------------------------------------------------
// RITA MÅNADS-TABELL
// --------------------------------------------------

function getEntriesForCurrentMonth() {
    return entries.filter(e=>{
        const d = new Date(e.date);
        return d.getFullYear()===currentYear && d.getMonth()===currentMonth;
    }).sort((a,b)=>{
        // sort by date asc maybe
        if (a.date<b.date) return -1;
        if (a.date>b.date) return 1;
        // tie-break project maybe
        return 0;
    });
}

function renderMonthTable() {
    const monthEntries = getEntriesForCurrentMonth();
    monthTableBody.innerHTML = "";

    monthEntries.forEach((ent, idx)=>{
        const tr = document.createElement("tr");

        // kolumner:
        const tdDate = document.createElement("td");
        tdDate.textContent = ent.date;

        const tdProj = document.createElement("td");
        tdProj.textContent = ent.project || "";

        const tdCats = document.createElement("td");
        tdCats.textContent = ent.items.map(it=>it.cat).join(", ");

        const tdTot = document.createElement("td");
        tdTot.textContent = ent.items.reduce((sum,it)=>sum+it.hours,0).toFixed(2);

        const tdDrive = document.createElement("td");
        tdDrive.textContent = Number(ent.drive||0).toFixed(2);

        const tdNote = document.createElement("td");
        tdNote.textContent = ent.note || "";

        const tdAct = document.createElement("td");
        tdAct.className = "actions-cell";

        const editBtn = document.createElement("button");
        editBtn.innerHTML = '<i data-lucide="edit-3"></i>';
        editBtn.title = "Redigera (inte klar än)";
        editBtn.disabled = true; // placeholder tills redigering är fullt klar
        tdAct.appendChild(editBtn);

        const delBtn = document.createElement("button");
        delBtn.className = "delete-btn";
        delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        delBtn.title = "Ta bort raden";
        delBtn.addEventListener("click", ()=>{
            // ta bort denna entry
            const realIndex = entries.indexOf(ent);
            if (realIndex>=0) {
                entries.splice(realIndex,1);
                saveToStorage();
                renderAll();
            }
        });
        tdAct.appendChild(delBtn);

        tr.appendChild(tdDate);
        tr.appendChild(tdProj);
        tr.appendChild(tdCats);
        tr.appendChild(tdTot);
        tr.appendChild(tdDrive);
        tr.appendChild(tdNote);
        tr.appendChild(tdAct);

        monthTableBody.appendChild(tr);
    });

    lucide.createIcons();
}

// --------------------------------------------------
// MÅNADSSUMMERING (Ordinarie xh | Flex xh | … | Körtid yh | Projekt: ...)
// --------------------------------------------------

function renderMonthSummary() {
    const monthEntries = getEntriesForCurrentMonth();

    // summera per kategori
    const catTotals = {};
    // summera körtid per datum (för att inte dubbelräkna samma dag)
    // Vi räknar körtid per datum = max( drive i poster samma datum ) ?
    // Du har krav: "körtid ska inte dubblas när man har flera kategorier samma dag".
    // Vi löser: per (date) tar vi första drive-värdet (eller max abs?). Vi tar summa unika datum drive.
    const drivePerDate = {};

    // projekt-summering
    const projectTotals = {};

    for (const ent of monthEntries) {
        // kategori/hours
        for (const it of ent.items) {
            catTotals[it.cat] = (catTotals[it.cat]||0)+it.hours;
        }
        // drive unique
        const k = ent.date;
        if (drivePerDate[k]===undefined) {
            drivePerDate[k] = Number(ent.drive||0);
        } else {
            // vi tar max av absolutvärdet? egentligen: samma dag ska bara räknas EN gång.
            // Vi låter drivePerDate[k] vara första inskrivna och ignorerar resten.
        }
        // projekt
        const p = ent.project||"";
        const hrs = ent.items.reduce((sum,x)=>sum+x.hours,0);
        if (p) {
            projectTotals[p] = (projectTotals[p]||0)+hrs;
        }
    }

    // summera körtid:
    let totalDrive = 0;
    Object.values(drivePerDate).forEach(v=>{
        totalDrive += v;
    });

    // Bygg text
    // ordning i den här raden: Ordinarie, Flex, ÖT<2, ÖT>2, ÖT-Helg, Semester, ATF, VAB, Sjuk, Trakt, Körtid
    const parts = [];
    function pushCat(labelKey,labelTxt){
        const v = catTotals[labelKey]||0;
        parts.push(labelTxt+": "+v.toFixed(2)+"h");
    }

    pushCat("Ordinarie tid","Ordinarie");
    pushCat("Flextid","Flex");
    pushCat("ÖT<2","ÖT<2");
    pushCat("ÖT>2","ÖT>2");
    pushCat("ÖT-Helg","ÖT-Helg");
    pushCat("Semester","Semester");
    pushCat("ATF","ATF");
    pushCat("VAB","VAB");
    pushCat("Sjuk","Sjuk");
    pushCat("Trakt","Trakt");
    // Föräldraledig (FL) 
    pushCat("FL","FL");

    parts.push("Körtid: "+totalDrive.toFixed(2)+"h");

    monthSummaryMain.textContent = parts.join(" | ");

    // Project-rad
    // "Projekt: Firman 10.00h; Trello 11.50h; ..."
    const projParts = [];
    for (const [proj,hrs] of Object.entries(projectTotals)) {
        projParts.push(proj+" "+hrs.toFixed(2)+"h");
    }
    monthSummaryProjects.textContent = projParts.length>0
        ? "Projekt: "+projParts.join("; ")
        : "";
}

// --------------------------------------------------
// LARM / OBALANS DENNA MÅNAD
// --------------------------------------------------

function renderLarmTable() {
    const monthEntries = getEntriesForCurrentMonth();
    const year = currentYear;
    const month = currentMonth;

    const larmRows = calcMonthBalans(monthEntries, year, month); 
    // balansregler.js -> retur: [{date, hours, status}] 
    // status: "ok"|"warn"|"bad", hours = avvikelse/fyllnad

    larmTableBody.innerHTML = "";
    larmRows.forEach(row=>{
        const tr = document.createElement("tr");

        const tdD = document.createElement("td");
        tdD.textContent = row.date;

        const tdH = document.createElement("td");
        tdH.textContent = row.hours.toFixed(2);

        const tdS = document.createElement("td");
        const statusDiv = document.createElement("div");
        statusDiv.classList.add("status-pill");
        let iconName = "circle";
        if (row.status==="ok") {
            statusDiv.classList.add("status-ok");
            iconName = "check-circle";
        } else if (row.status==="warn") {
            statusDiv.classList.add("status-warn");
            iconName = "alert-triangle";
        } else {
            statusDiv.classList.add("status-bad");
            iconName = "alert-octagon";
        }
        statusDiv.innerHTML = `<i data-lucide="${iconName}"></i><span>${row.message||""}</span>`;
        tdS.appendChild(statusDiv);

        tr.appendChild(tdD);
        tr.appendChild(tdH);
        tr.appendChild(tdS);
        larmTableBody.appendChild(tr);
    });

    lucide.createIcons();
}

// --------------------------------------------------
// ÅRSÖVERSIKT
// --------------------------------------------------

function getEntriesForYear(y) {
    return entries.filter(e=>{
        const d = new Date(e.date);
        return d.getFullYear()===y;
    });
}

// return { monthIndex: {catTotals..., driveTotal} }
// catTotals ska inkludera alla kategorier, och vi gör drive per dag ej dubletter samma dag
function buildYearAgg(y) {
    const agg = {};
    for (let m=0;m<12;m++){
        agg[m] = {
            cats:{}, // cat -> hours
            driveDates:{} // date -> drive
        };
    }
    const yearEntries = getEntriesForYear(y);
    for (const ent of yearEntries) {
        const d = new Date(ent.date);
        const m = d.getMonth();
        if (!agg[m]) continue;
        for (const it of ent.items) {
            agg[m].cats[it.cat] = (agg[m].cats[it.cat]||0)+it.hours;
        }
        if (agg[m].driveDates[ent.date]===undefined) {
            agg[m].driveDates[ent.date] = Number(ent.drive||0);
        }
    }
    return agg;
}

function renderYearTable() {
    yearTableBody.innerHTML = "";

    const agg = buildYearAgg(currentYear);

    for (let m=0;m<12;m++){
        const rowAgg = agg[m];
        const cats = rowAgg.cats;
        // summera drive unika datum
        let driveSum = 0;
        Object.values(rowAgg.driveDates).forEach(v=>driveSum+=v);

        const tr = document.createElement("tr");

        function td(val){
            const c = document.createElement("td");
            c.textContent = (typeof val==="number") ? val.toFixed(2) : val;
            return c;
        }

        tr.appendChild(td(MONTH_NAMES_SV[m]));
        tr.appendChild(td(cats["Ordinarie tid"]||0));
        tr.appendChild(td(driveSum));
        tr.appendChild(td(cats["Flextid"]||0));
        tr.appendChild(td(cats["ÖT<2"]||0));
        tr.appendChild(td(cats["ÖT>2"]||0));
        tr.appendChild(td(cats["ÖT-Helg"]||0));
        tr.appendChild(td(cats["Semester"]||0));
        tr.appendChild(td(cats["ATF"]||0));
        tr.appendChild(td(cats["VAB"]||0));
        tr.appendChild(td(cats["Sjuk"]||0));
        tr.appendChild(td(cats["Trakt"]||0));
        tr.appendChild(td(cats["FL"]||0));

        yearTableBody.appendChild(tr);
    }
}

// --------------------------------------------------
// IMPORT / EXPORT / BACKUP / RADERA
// --------------------------------------------------

function doBackupNow() {
    // exportera ALLT som JSON och ladda ner
    const data = {
        version: APP_VERSION,
        settings,
        entries
    };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `tidrapport-backup-${Date.now()}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

function doBackupNowSilent() {
    // kan användas för auto-backup (om du vill utveckla att den sparar i IndexedDB eller så).
    // just nu gör vi ingenting här så att det inte spammar.
}

function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (data && Array.isArray(data.entries)) {
                entries = data.entries;
                saveToStorage();
            }
            if (data && data.settings) {
                settings = data.settings;
                saveSettingsToStorage();
            }
            // uppdatera UI
            applySettingsToUI();
            renderAll();
        } catch(err){
            console.error("Fel vid import:",err);
        }
    };
    reader.readAsText(file);
}

// rensa ALL data
function clearAllData() {
    if (!confirm("Vill du rensa ALL data?")) return;
    entries = [];
    saveToStorage();
    renderAll();
}

// --------------------------------------------------
// INSTÄLLNINGAR
// --------------------------------------------------

function applySettingsToUI() {
    settingCompany.value = settings.company || "";
    settingName.value    = settings.name || "";
    settingEmpNo.value   = settings.empNo || "";
    settingAutoBackup.checked = !!settings.autoBackup;
}

function readSettingsFromUI() {
    settings.company    = settingCompany.value.trim();
    settings.name       = settingName.value.trim();
    settings.empNo      = settingEmpNo.value.trim();
    settings.autoBackup = settingAutoBackup.checked;
}

// --------------------------------------------------
// RENDER ALL
// --------------------------------------------------

function renderAll() {
    buildDateOptions();
    renderMonthTable();
    renderMonthSummary();
    renderLarmTable();
    renderYearTable();
    lucide.createIcons();
}

// --------------------------------------------------
// EVENT BINDINGS
// --------------------------------------------------

menuToggleBtn.addEventListener("click", ()=>{
    if (sideMenu.classList.contains("open")) {
        closeMenu();
    } else {
        openMenu();
    }
});
menuOverlay.addEventListener("click", closeMenu);

// ändring av period
menuYearSel.addEventListener("change", ()=>{
    updateCurrentPeriodFromMenu();
});
menuMonthSel.addEventListener("change", ()=>{
    updateCurrentPeriodFromMenu();
});

// ny kategori-rad
addCategoryBtn.addEventListener("click", ()=>{
    createCategoryRow(false);
});

// spara rad(er)
saveEntriesBtn.addEventListener("click", ()=>{
    saveCurrentFormEntries();
});

// import
importFileInput.addEventListener("change", (e)=>{
    const file = e.target.files[0];
    handleImportFile(file);
    // nollställ så vi kan importera samma fil igen om vi vill
    importFileInput.value="";
});

// backup
backupNowBtn.addEventListener("click", ()=>{
    doBackupNow();
});

// export knappar
exportCsvBtn.addEventListener("click", ()=>{
    exportMonthCSV(getEntriesForCurrentMonth(), currentYear, currentMonth);
});
exportPdfBtn.addEventListener("click", ()=>{
    exportMonthPDF(getEntriesForCurrentMonth(), currentYear, currentMonth, settings);
});
exportYearBtn.addEventListener("click", ()=>{
    exportYearCSV(buildYearAgg(currentYear), currentYear);
});

// clear all
clearAllBtn.addEventListener("click", ()=>{
    clearAllData();
});

// spara inställningar
saveSettingsBtn.addEventListener("click", ()=>{
    readSettingsFromUI();
    saveSettingsToStorage();
    if (settings.autoBackup) {
        doBackupNowSilent();
    }
    alert("Inställningar sparade.");
});

// sök / hjälp
searchBtn.addEventListener("click", ()=>{
    window.open("search.html","_blank");
});
helpBtn.addEventListener("click", ()=>{
    window.open("help.html","_blank");
});

// --------------------------------------------------
// STARTUP
// --------------------------------------------------

function init() {
    loadFromStorage();

    // sätt currentYear/currentMonth default
    currentYear  = (new Date()).getFullYear();
    currentMonth = (new Date()).getMonth();

    initPeriodSelectors();
    applySettingsToUI();

    // bygg första kategori-raden
    categoryRowsContainer.innerHTML = "";
    createCategoryRow(true);

    updateCurrentPeriodFromMenu(); // detta kommer kalla renderAll() via render
    lucide.createIcons();

    // sätt version i footer (säkerhet om html ej uppdaterad)
    const versionFooter = document.getElementById("versionFooter");
    if (versionFooter) {
        versionFooter.innerHTML = `Tidrapport <strong>${APP_VERSION}</strong><br/>i samarbete med ChatGPT &amp; Martin Mattsson`;
    }
}

init();