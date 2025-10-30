// ===== app.js – Tidrapport v9.7 =====
// - Dynamiska kategorirader med (+)
// - Traktamente är en kategori som inte kräver tid
// - Varje kategori kan bara användas en gång per rad
// - All tid summeras till r.tid => export behåller samma utseende
// - Auto-backup körs vid ändring (COV)

const SETTINGS_KEY = "tidrapport:cfg";
const DATA_KEY = "tidrapport:data";

let state = {
  data:{},          // { "2025-10": [ rows... ] }
  currentMonth:[],  // rows i aktiv månad
  currentKey:"",    // "2025-10"
};

let editIndex = null; // index i currentMonth när vi redigerar

// Kategorilista. Endast en gång per rad per kategori.
const CATEGORIES = [
  "Ordinarie tid",
  "Flextid",
  "ATF-tim",
  "Övertid <2",
  "Övertid 2>",
  "Övertid-Helg",
  "Semester",
  "Sjuk",
  "VAB",
  "Traktamente"
];

// ---- Hjälpare ----
function m(id){return document.getElementById(id);}
function uid(){return Math.random().toString(36).slice(2)+Date.now().toString(36);}
function ymKey(d=new Date()){return d.toISOString().slice(0,7);}
function safeParse(k,def={}){try{return JSON.parse(localStorage.getItem(k)||"{}")||def;}catch{return def;}}

// migrera gamla nycklar om dom finns
(function migrateOldKeys(){
  const oldD=localStorage.getItem("tidrapport_data_v10");
  const oldC=localStorage.getItem("tidrapport_settings_v10");
  if(oldD && !localStorage.getItem(DATA_KEY)) localStorage.setItem(DATA_KEY,oldD);
  if(oldC && !localStorage.getItem(SETTINGS_KEY)) localStorage.setItem(SETTINGS_KEY,oldC);
})();

function loadData(){
  state.data=safeParse(DATA_KEY,{});
}
function saveData(){
  localStorage.setItem(DATA_KEY,JSON.stringify(state.data));
}

function loadSettings(){
  const cfg=safeParse(SETTINGS_KEY,{});
  if(m("cfgCompany")) m("cfgCompany").value=cfg.company||"";
  if(m("cfgName"))    m("cfgName").value=cfg.name||"";
  if(m("cfgEmp"))     m("cfgEmp").value=cfg.emp||"";
  if(m("cfgOwner"))   m("cfgOwner").value=cfg.owner||"";
  if(m("cfgYear"))    m("cfgYear").value=cfg.year||new Date().getFullYear();
  if(m("cfgAutoBackup")) m("cfgAutoBackup").checked=!!cfg.autoBackup;
  if(m("cfgHolidays"))   m("cfgHolidays").checked=(cfg.holidays!==false);
}
function saveSettings(){
  const cfg={
    company:m("cfgCompany")?.value||"",
    name:m("cfgName")?.value||"",
    emp:m("cfgEmp")?.value||"",
    owner:m("cfgOwner")?.value||"",
    year:Number(m("cfgYear")?.value)||new Date().getFullYear(),
    autoBackup:!!m("cfgAutoBackup")?.checked,
    holidays:!!m("cfgHolidays")?.checked
  };
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(cfg));
  alert("Inställningar sparade.");
  triggerAutoBackupCOV();
}

// ---- Dynamiska kategori-block UI ----

function getAllCatRows(){
  return Array.from(document.querySelectorAll("#categoryBlocks .catrow"));
}

// samla redan använda kategorier
function getUsedCategories(){
  const used=new Set();
  getAllCatRows().forEach(r=>{
    const v=r.querySelector(".kategoriSelect").value;
    if(v)used.add(v);
  });
  return used;
}

// bygger options i en given select
function updateCategoryOptionsForSelect(sel,currentValue="", usedExternal){
  const used = usedExternal || getUsedCategories();
  const prevVal = currentValue;
  sel.innerHTML="";

  // Blank
  const blankOpt=document.createElement("option");
  blankOpt.value="";
  blankOpt.textContent="Blank";
  sel.appendChild(blankOpt);

  CATEGORIES.forEach(cat=>{
    // Förbjud dubblettkategori:
    if(used.has(cat) && cat!==prevVal) return;
    const opt=document.createElement("option");
    opt.value=cat;
    opt.textContent=cat;
    sel.appendChild(opt);
  });

  sel.value=prevVal;
}

// uppdatera alla selects i alla rader efter att något ändrats
function updateAllCategoryOptions(){
  const used = getUsedCategories();
  getAllCatRows().forEach(row=>{
    const sel=row.querySelector(".kategoriSelect");
    const current=sel.value;
    updateCategoryOptionsForSelect(sel,current,used);
  });
}

// styra visning av tidsfält per rad
function applyTimeVisibility(rowEl){
  const sel=rowEl.querySelector(".kategoriSelect");
  const timeCol=rowEl.querySelector(".timeCol");
  const val=(sel.value||"").toLowerCase();

  // göm tid om Blank eller Traktamente
  if(val==="" || val==="traktamente"){
    timeCol.style.display="none";
    const tidInput=rowEl.querySelector(".tidInput");
    if(tidInput) tidInput.value="";
  } else {
    timeCol.style.display="block";
  }
}

// Bygg en ny catrow DOM-node
function buildCatRow(prefill={}, isLast=true){
  const wrap=document.createElement("div");
  wrap.className="catrow";
  wrap.dataset.rowId = prefill._rowId || uid();

  // kolumn: kategori
  const catCol=document.createElement("div");
  catCol.className="catrow-col";
  const labCat=document.createElement("label");
  labCat.textContent="Kategori";
  const sel=document.createElement("select");
  sel.className="kategoriSelect";
  labCat.appendChild(sel);
  catCol.appendChild(labCat);

  // kolumn: tid
  const timeCol=document.createElement("div");
  timeCol.className="catrow-col timeCol";
  const labTid=document.createElement("label");
  labTid.textContent="Tid";
  const inpTid=document.createElement("input");
  inpTid.className="tidInput";
  inpTid.type="number";
  inpTid.step="0.25";
  inpTid.min="0";
  inpTid.value=(prefill.tid ?? "");
  labTid.appendChild(inpTid);
  timeCol.appendChild(labTid);

  // knappar
  const btnCol=document.createElement("div");
  btnCol.className="catrow-inline";

  const addBtn=document.createElement("button");
  addBtn.className="addBtn";
  addBtn.type="button";
  addBtn.textContent="+";
  addBtn.addEventListener("click",()=>addCategoryBlock());

  const removeBtn=document.createElement("button");
  removeBtn.className="removeBtn";
  removeBtn.type="button";
  removeBtn.textContent="−";
  removeBtn.addEventListener("click",()=>removeCategoryBlock(wrap.dataset.rowId));

  btnCol.appendChild(addBtn);
  btnCol.appendChild(removeBtn);

  // koppla event
  sel.addEventListener("change",()=>{
    applyTimeVisibility(wrap);
    updateAllCategoryOptions();
    triggerAutoBackupCOV();
  });
  inpTid.addEventListener("change",()=>{
    triggerAutoBackupCOV();
  });

  // montera ihop raden
  wrap.appendChild(catCol);
  wrap.appendChild(timeCol);
  wrap.appendChild(btnCol);

  // sätt initiala kategorioptions
  updateCategoryOptionsForSelect(sel, prefill.kategori||"");
  sel.value=prefill.kategori||"";

  // justera tidfältets synlighet
  applyTimeVisibility(wrap);

  // sista raden visar +, övriga gömmer +
  if(!isLast){
    addBtn.style.display="none";
  }

  return wrap;
}

// lägg till ny kategori-rad
function addCategoryBlock(prefill){
  const container=m("categoryBlocks");
  const rows=getAllCatRows();
  // den gamla sista raden tappar sin +
  if(rows.length){
    const last=rows[rows.length-1];
    const lastAdd=last.querySelector(".addBtn");
    if(lastAdd) lastAdd.style.display="none";
  }
  // skapa ny sista rad
  const newRow=buildCatRow(prefill||{},true);
  container.appendChild(newRow);

  // uppdatera options överallt
  updateAllCategoryOptions();
}

// ta bort en kategori-rad
function removeCategoryBlock(rowId){
  const container=m("categoryBlocks");
  const rows=getAllCatRows();
  if(rows.length===1){
    // om det är sista kvar, nollställ bara
    const only=rows[0];
    only.querySelector(".kategoriSelect").value="";
    only.querySelector(".tidInput").value="";
    applyTimeVisibility(only);
    updateAllCategoryOptions();
    return;
  }
  // annars ta bort raden
  const victim=container.querySelector(`.catrow[data-row-id="${rowId}"]`);
  if(victim) victim.remove();

  // gör sista raden till +-rad
  const newRows=getAllCatRows();
  newRows.forEach((r,i)=>{
    const addBtn=r.querySelector(".addBtn");
    if(addBtn) addBtn.style.display=(i===newRows.length-1)?"block":"none";
  });
  updateAllCategoryOptions();
  triggerAutoBackupCOV();
}

// ---- Bygga / läsa formulärrad ----

// skapa radobjekt för att spara
function readFormRow(){
  const datum=m("datum").value;
  if(!datum){
    alert("Datum saknas");return null;
  }
  const projekt=m("projekt").value.trim();
  const kortid=parseFloat(m("kortid").value)||0;
  const beskrivning=m("beskrivning").value.trim();

  // läs alla kategori-block
  const cats=[];
  getAllCatRows().forEach(r=>{
    const cat = r.querySelector(".kategoriSelect").value;
    if(!cat) return;
    const rawTid=r.querySelector(".tidInput").value;
    let tidVal=(rawTid===""||rawTid===null)?0:parseFloat(rawTid)||0;
    // Traktamente ska inte kräva tid
    if(cat.toLowerCase()==="traktamente"){
      tidVal=0;
    }
    cats.push({
      kategori:cat,
      tid:tidVal
    });
  });

  if(!cats.length){
    alert("Minst en kategori behövs");return null;
  }

  // summera total arbetstid = alla tider utom traktamente
  let totalTid=0;
  cats.forEach(c=>{
    totalTid+=Number(c.tid)||0;
  });

  // visa i tabellen: "Ordinarie tid 8h, Flextid 1h, Traktamente"
  const katDisplay = cats.map(c=>{
    if(c.kategori.toLowerCase()==="traktamente"){
      return "Traktamente";
    }
    return `${c.kategori} ${c.tid}h`;
  }).join(", ");

  const id=(editIndex!==null && state.currentMonth[editIndex]?.id)||uid();
  return {
    id,
    datum,
    projekt,
    tid: totalTid,        // <- exporten använder det här fältet oförändrat
    kortid,
    beskrivning,
    kategorier: cats,
    katDisplay
  };
}

// fyll formuläret igen vid redigering
function fillFormFromRow(r){
  m("datum").value=r.datum||"";
  m("projekt").value=r.projekt||"";
  m("kortid").value=r.kortid||"";
  m("beskrivning").value=r.beskrivning||"";

  m("categoryBlocks").innerHTML="";
  if(r.kategorier && r.kategorier.length){
    r.kategorier.forEach(c=>{
      addCategoryBlock({
        kategori:c.kategori,
        tid:c.tid
      });
    });
  } else {
    addCategoryBlock();
  }

  editIndex=state.currentMonth.findIndex(x=>x.id===r.id);

  // Ändra knappen till "Spara" + visa Avbryt
  const icon=m("btnAdd").querySelector("i");
  if(icon) icon.setAttribute("data-lucide","save");
  m("btnAddText").textContent="Spara";
  m("btnCancel").style.display="inline-flex";
  if(window.lucide) lucide.createIcons();
}

// rensa formuläret
function clearForm(){
  m("datum").value="";
  m("projekt").value="";
  m("kortid").value="";
  m("beskrivning").value="";
  m("categoryBlocks").innerHTML="";
  addCategoryBlock();

  editIndex=null;

  const icon=m("btnAdd").querySelector("i");
  if(icon) icon.setAttribute("data-lucide","plus-circle");
  m("btnAddText").textContent="Lägg till";
  m("btnCancel").style.display="none";

  if(window.lucide) lucide.createIcons();
}

// ---- CRUD ----

function onAddOrSave(){
  const rowObj=readFormRow();
  if(!rowObj) return;

  if(editIndex!==null){
    state.currentMonth[editIndex]=rowObj;
    editIndex=null;
  } else {
    state.currentMonth.push(rowObj);
  }

  saveMonth();
  buildMonthOptions();
  renderMonth();
  clearForm();
  triggerAutoBackupCOV();
}

function onEditRow(idx){
  const r=state.currentMonth[idx];
  if(!r) return;
  fillFormFromRow(r);
}

function onCancelEdit(){
  clearForm();
}

function deleteRow(idx){
  if(!confirm("Ta bort raden?")) return;
  state.currentMonth.splice(idx,1);
  saveMonth();
  renderMonth();
  triggerAutoBackupCOV();
}

// ---- Månadshantering ----

function saveMonth(){
  state.data[state.currentKey]=state.currentMonth;
  saveData();
}

function changeMonth(){
  const sel=m("menuMonth");
  state.currentKey=sel.value;
  state.currentMonth=state.data[state.currentKey]||[];
  renderMonth();
}

function buildMonthOptions(){
  const sel=m("menuMonth");
  if(!sel)return;
  const keys=new Set(Object.keys(state.data));
  keys.add(ymKey()); // se till att aktuell månad finns med
  sel.innerHTML="";
  Array.from(keys).sort().forEach(k=>{
    const o=document.createElement("option");
    o.value=k;
    o.textContent=k;
    if(k===state.currentKey) o.selected=true;
    sel.appendChild(o);
  });
}

// ---- Summering & tabell ----

function renderMonth(){
  const tb=m("rows");
  const sum=m("totalsCell");

  tb.innerHTML="";
  let totalTid=0;
  let totalKortid=0;

  if(!state.currentMonth.length){
    tb.innerHTML=`<tr><td colspan="7"><i>Inga rader ännu (${state.currentKey})</i></td></tr>`;
  } else {
    state.currentMonth.forEach((r,i)=>{
      totalTid+=Number(r.tid)||0;
      totalKortid+=Number(r.kortid)||0;

      tb.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${r.datum || ""}</td>
          <td>${r.projekt || ""}</td>
          <td>${r.katDisplay || ""}</td>
          <td>${(r.tid||0).toFixed(2)} h</td>
          <td>${r.kortid||0}</td>
          <td>${r.beskrivning||""}</td>
          <td>
            <button class="btn ghost" onclick="onEditRow(${i})" title="Ändra">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn danger" onclick="deleteRow(${i})" title="Ta bort">
              <i data-lucide="trash-2"></i>
            </button>
          </td>
        </tr>
      `);
    });
  }

  sum.textContent=
    `Total tid: ${totalTid.toFixed(2)} h • Körtid: ${totalKortid.toFixed(2)} h`;

  if(window.lucide) lucide.createIcons();
}

// ---- Auto-backup COV ----

let autoBackupTimer=null;
let lastSnapshot="";

function triggerAutoBackupCOV(){
  const cfg=safeParse(SETTINGS_KEY,{});
  if(!cfg.autoBackup) return;

  const snap=localStorage.getItem(DATA_KEY)||"";
  if(snap===lastSnapshot) return;
  lastSnapshot=snap;

  clearTimeout(autoBackupTimer);
  autoBackupTimer=setTimeout(()=>{
    try{
      if(window.exportJSON) window.exportJSON();
      console.log("Auto-backup (COV) ✅");
    }catch(e){
      console.warn("Auto-backup misslyckades",e);
    }
  },2500);
}

// ---- Init ----

document.addEventListener("DOMContentLoaded",()=>{
  // koppla knappar
  if(m("btnAdd"))     m("btnAdd").onclick=onAddOrSave;
  if(m("btnCancel"))  m("btnCancel").onclick=onCancelEdit;

  loadData();
  loadSettings();

  state.currentKey=ymKey();
  state.currentMonth=state.data[state.currentKey]||[];

  // första raden i formuläret
  addCategoryBlock();

  buildMonthOptions();
  renderMonth();

  if(window.lucide) lucide.createIcons();
});

console.log("%cApp.js laddad ✅ (v9.7 dynamiska kategorier)","color:green");