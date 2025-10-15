/* ========= Tidrapport v5-A3 =========
   Huvudlogik för registrering, lagring, balans, sök & export
   Byggd av ChatGPT & Martin Mattsson
====================================== */

let DATA = JSON.parse(localStorage.getItem("tidrapport_data") || "[]");
let SETTINGS = JSON.parse(localStorage.getItem("tidrapport_settings") || "{}");

// ==================== INIT ====================
document.addEventListener("DOMContentLoaded", () => {
  renderTable();
  renderYear();
  loadSettings();
});

// ==================== HANTERA MENY ====================
function showSection(id){
  document.querySelectorAll("main section").forEach(s=>s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// ==================== LÄGG TILL RAD ====================
function addRow(){
  const date = document.getElementById("date").value;
  const category = document.getElementById("category").value;
  const hours = parseFloat(document.getElementById("hours").value)||0;
  const drive = parseFloat(document.getElementById("drive").value)||0;
  const project = document.getElementById("project").value.trim();
  const desc = document.getElementById("desc").value.trim();

  if(!date || hours===0){alert("Datum och timmar krävs.");return;}
  DATA.push({id:Date.now(),date,category,hours,drive,project,desc});
  saveData();
  renderTable();
}

// ==================== RENDERA TABELL ====================
function renderTable(){
  const tbody = document.querySelector("#timeTable tbody");
  tbody.innerHTML = "";
  let total = 0;
  DATA.filter(d=>d.date.startsWith(currentMonth())).forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${r.date}</td><td>${r.category}</td><td>${r.hours}</td><td>${r.drive}</td>
                  <td>${r.project}</td><td>${r.desc}</td>
                  <td>${r.hours+r.drive}</td>
                  <td><button onclick="delRow(${r.id})">❌</button></td>`;
    tbody.appendChild(tr);
    total+=r.hours;
  });
}

function delRow(id){
  DATA=DATA.filter(r=>r.id!==id);
  saveData();
  renderTable();
}

// ==================== SPARA / LADDA ====================
function saveData(){
  localStorage.setItem("tidrapport_data",JSON.stringify(DATA));
}

function loadSettings(){
  document.getElementById("company").value = SETTINGS.company||"";
  document.getElementById("username").value = SETTINGS.username||"";
  document.getElementById("empid").value = SETTINGS.empid||"";
  document.getElementById("owner").value = SETTINGS.owner||"";
  document.getElementById("yearInput").value = SETTINGS.year||new Date().getFullYear();
  document.getElementById("notes").value = SETTINGS.notes||"";
  document.getElementById("autoBackup").checked = SETTINGS.autoBackup||false;
}

function saveSettings(){
  SETTINGS={
    company:document.getElementById("company").value,
    username:document.getElementById("username").value,
    empid:document.getElementById("empid").value,
    owner:document.getElementById("owner").value,
    year:document.getElementById("yearInput").value,
    notes:document.getElementById("notes").value,
    autoBackup:document.getElementById("autoBackup").checked
  };
  localStorage.setItem("tidrapport_settings",JSON.stringify(SETTINGS));
  alert("Inställningar sparade!");
}

// ==================== ÅRSÖVERSIKT ====================
function renderYear(){
  const div=document.getElementById("yearSummary");
  if(!div)return;
  let months=[...Array(12)].map((_,i)=>i+1);
  let html="<table><tr><th>Månad</th><th>Timmar</th></tr>";
  months.forEach(m=>{
    const prefix=`${SETTINGS.year||new Date().getFullYear()}-${String(m).padStart(2,"0")}`;
    const sum=DATA.filter(r=>r.date.startsWith(prefix)).reduce((a,b)=>a+b.hours,0);
    html+=`<tr><td>${m}</td><td>${sum}</td></tr>`;
  });
  div.innerHTML=html+"</table>";
}

// ==================== SÖK ====================
function runSearch(){
  const term=document.getElementById("searchInput").value.toLowerCase();
  const results=DATA.filter(r=>
    r.date.includes(term)||r.project.toLowerCase().includes(term)||
    r.category.toLowerCase().includes(term)||r.desc.toLowerCase().includes(term)
  );
  const table=document.getElementById("searchResults");
  const tbody=table.querySelector("tbody");
  tbody.innerHTML="";
  results.forEach(r=>{
    tbody.innerHTML+=`<tr><td>${r.date}</td><td>${r.category}</td><td>${r.hours}</td><td>${r.project}</td><td>${r.desc}</td></tr>`;
  });
  table.classList.remove("hidden");
}

// ==================== BALANS & FÄRGLOGIK ====================
/* Enligt definierade regler:
   - Ordinarie + booster (Flex+, ÖT<2, etc) = OK (grön)
   - Ordinarie + blocker (VAB, Sjuk, etc) = Orange
   - Ingen Ordinarie men -8 Flextid/ATF/Semester = OK (grön)
   - Annars varning (röd)
*/
function evaluateBalance(dayRows){
  let ord=dayRows.filter(r=>r.category==="Ordinarie tid").reduce((a,b)=>a+b.hours,0);
  let flex=dayRows.filter(r=>r.category==="Flextid").reduce((a,b)=>a+b.hours,0);
  let vab=dayRows.filter(r=>r.category==="VAB").reduce((a,b)=>a+b.hours,0);
  let sjuk=dayRows.filter(r=>r.category==="Sjuk").reduce((a,b)=>a+b.hours,0);
  let sum=ord+flex+vab+sjuk;
  if(sum===8)return "ok";
  if(sum<8 && (ord+flex===8))return "ok";
  if(ord<8 && (vab>0||sjuk>0))return "warn";
  return "danger";
}

// ==================== EXPORT ====================
function currentMonth(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

// placeholder-funktioner till export.js
function exportMonthCSV(){ if(window.exportMonthCSVFile) exportMonthCSVFile(); }
function exportYearCSV(){ if(window.exportYearCSVFile) exportYearCSVFile(); }
function exportMonthPDF(){ if(window.exportMonthPDFFile) exportMonthPDFFile(); }
function exportYearPDF(){ if(window.exportYearPDFFile) exportYearPDFFile(); }

// ==================== BACKUP ====================
function importCSV(){alert("Import CSV via export.js ännu ej aktiv.");}
function importBackup(){ if(window.importBackupFile) importBackupFile(); }
function quickBackup(){ if(window.quickBackup) window.quickBackup(); }

// ==================== AUTO BACKUP ====================
if(SETTINGS.autoBackup){ setInterval(()=>{ if(window.quickBackup) quickBackup(); },3600000); }