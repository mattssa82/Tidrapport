(()=>{
// ===== Utils & konstanter =====
const monthsSv=["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"];
const CSV_COLS=["Datum","Ordinarie tid","Körtid","Projekt","Semester-tim","ATF-tim","Sjuk-tim","Föräldraledig","VAB","Flextid","Övertid <2","Övertid 2>","Övertid-Helg","Traktamente","Beskrivning"];
const STORAGE="tidrapport_data_v10";
const SETTINGS="tidrapport_settings_v10";
const $=id=>document.getElementById(id);
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);

// Formatfunktioner
const fmtBlankZero = n => { const v=Number(n)||0; return v===0?"":(Math.round(v*100)/100).toLocaleString("sv-SE",{minimumFractionDigits:0, maximumFractionDigits:2}); };
const fmtExport = n => { if(n==null||n==="")return""; const v=Number(String(n).replace(",", ".")); if(!Number.isFinite(v)||v===0)return""; return v.toString().replace(".", ","); };
const csvEscape=s=>{s=s==null?"":String(s).replace(/\r?\n/g," "); if(/[";]/.test(s)) s='"'+s.replace(/"/g,'""')+'"'; return s;};
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}

// ===== State =====
let state={month:(new Date().getMonth()+1), data:load(STORAGE,{}), settings:load(SETTINGS,defSettings())};
function defSettings(){return{company:"",name:"",emp:"",owner:"",year:new Date().getFullYear(),note:"",autoBackup:true,holidays:true}}
function load(k,def){try{const v=JSON.parse(localStorage.getItem(k));return v??def}catch(_){return def}}
function saveData(){ localStorage.setItem(STORAGE,JSON.stringify(state.data)); if(state.settings.autoBackup) localStorage.setItem("tidrapport_last_update",Date.now()); }
function saveCfg(){ localStorage.setItem(SETTINGS,JSON.stringify(state.settings)); if(state.settings.autoBackup) localStorage.setItem("tidrapport_last_update",Date.now()); }
function ensureMonth(m){ if(!state.data[m]) state.data[m]=[] }

// ===== Meny & Hjälp =====
window.toggleMenu=(open)=>{const el=$("menu"); if(!el)return; el.classList.toggle("open",open); if(open) initMenu();}
function initMenu(){
  const sel=$("menuMonth");
  if(sel){ sel.innerHTML=""; monthsSv.forEach((n,i)=>{const o=document.createElement("option");o.value=i+1;o.textContent=cap(n);if(i+1===state.month)o.selected=true;sel.appendChild(o);});}
  ["cfgCompany","cfgName","cfgEmp","cfgOwner","cfgYear","cfgNote"].forEach(id=>{const el=$(id);if(el&&state.settings[id.replace("cfg","").toLowerCase()])el.value=state.settings[id.replace("cfg","").toLowerCase()]||"";});
  const cb=$("cfgAutoBackup"); if(cb) cb.checked=state.settings.autoBackup!==false;
}
window.changeMonth=()=>{const sel=$("menuMonth");if(sel){state.month=Number(sel.value)||state.month;renderAll();toggleMenu(false);}};

// ===== Inställningar =====
window.saveSettings=()=>{["company","name","emp","owner","note"].forEach(k=>state.settings[k]=$("cfg"+cap(k))?.value||"");state.settings.year=Number($("cfgYear")?.value)||new Date().getFullYear();state.settings.autoBackup=!!$("cfgAutoBackup")?.checked;saveCfg();renderAll();};
window.resetSettings=()=>{if(confirm("Rensa inställningar?")){state.settings=defSettings();saveCfg();initMenu();renderAll();alert("Inställningarna rensade.");}};
window.resetAll=()=>{if(prompt("⚠️ RADERA ALL DATA. Skriv: RADERA ALLT")!=="RADERA ALLT")return;state.data={};for(let m=1;m<=12;m++)ensureMonth(m);saveData();renderAll();alert("All data rensad.");};
window.createYear=()=>{const y=Number(prompt("Skapa nytt år:",(state.settings.year||new Date().getFullYear())+1));if(y){state.settings.year=y;saveCfg();renderAll();}};
window.deleteYear=()=>{if(confirm("År återställs till innevarande år.")){state.settings.year=new Date().getFullYear();saveCfg();renderAll();}};
window.quickBackup=()=>exportJSON();

// ===== Input helpers =====
function normMinus(s){return(s||"").replace(/[–—−]/g,"-");}
function toNumRaw(s){if(s==null)return NaN;s=normMinus((""+s).replace(/\s+/g,"")).replace(",",".");if(!/^[-]?\d*(\.\d+)?$/.test(s))return NaN;return s===""?NaN:parseFloat(s);}
function roundQuarter(n){return Math.round(n*4)/4;}
function parseHourInput(v,allowEmpty=false){if(allowEmpty&&(v===""||v==null))return 0;const n=toNumRaw(v);return isNaN(n)?NaN:roundQuarter(n);}
function sanitizeProject(s){s=(s||"").normalize("NFC").replace(/\s+/g,"");return s.replace(/[^0-9A-Za-zÅÄÖåäö]/g,"");}

// ===== Lägg till / ändra / ta bort =====
const btnAdd=$("btnAdd"),btnCancel=$("btnCancel"),btnBackup=$("btnBackup");
if(btnAdd) btnAdd.onclick=()=>{
  const d=$("datum")?.value;if(!d)return alert("Välj datum.");
  const k=$("kategori")?.value||"Ordinarie tid",t=parseHourInput($("tid")?.value);
  if(isNaN(t))return alert("Ogiltig tid.");
  const p=sanitizeProject($("projekt")?.value||""),kt=parseHourInput($("kortid")?.value,true);
  if(isNaN(kt))return alert("Ogiltig körtid.");const b=$("beskrivning")?.value||"";
  const m=new Date(d).getMonth()+1;ensureMonth(m);
  const row={_id:uid(),datum:d,kategori:k,tid:t,projekt:p,kortid:kt,beskrivning:b};
  if(editing){const list=state.data[editing.month]||[],idx=list.findIndex(r=>r._id===editing.id);
    if(idx>-1){list[idx]={...list[idx],...row};if(editing.month!==m){const move=list.splice(idx,1)[0];ensureMonth(m);state.data[m].push(move);state.month=m;}saveData();}
    exitEditMode();renderAll();
  }else{state.data[m].push(row);saveData();clearInputs();state.month=m;renderAll();}
};
if(btnCancel) btnCancel.onclick=()=>{exitEditMode();clearInputs();};
if(btnBackup) btnBackup.onclick=()=>quickBackup();

function enterEditMode(row,month){editing={id:row._id,month};btnAdd.textContent="Spara";btnCancel.style.display="";}
function exitEditMode(){editing=null;btnAdd.textContent="Lägg till";btnCancel.style.display="none";}
function clearInputs(){["datum","tid","projekt","kortid","beskrivning"].forEach(id=>$(id)&&( $(id).value=""));const kat=$("kategori");if(kat)kat.selectedIndex=0;}
let editing=null;

// ===== Helgdagar och kontroller =====
function easterSunday(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;return new Date(y,Math.floor(n/31)-1,(n%31)+1);}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function swedishHolidays(y){const H=new Map();const add=(d,n)=>H.set(d.toISOString().slice(0,10),n);
add(new Date(y,0,1),"Nyårsdagen");add(new Date(y,0,6),"Trettondedag jul");add(new Date(y,4,1),"Första maj");
add(new Date(y,5,6),"Sveriges nationaldag");add(new Date(y,11,25),"Juldagen");add(new Date(y,11,26),"Annandag jul");
const e=easterSunday(y);add(addDays(e,-2),"Långfredagen");add(addDays(e,1),"Annandag påsk");add(addDays(e,39),"Kristi himmelsfärdsdag");
let mid=new Date(y,5,20);while(mid.getDay()!=6)mid=addDays(mid,1);add(mid,"Midsommardagen");
let s=new Date(y,9,31);while(s.getDay()!=6)s=addDays(s,1);add(s,"Alla helgons dag");return H;}

// ===== Balansregler =====
function effectiveOrdinarie(row){
  const cat=row.kategori,v=Number(row.tid)||0;
  switch(cat){
    case"Ordinarie tid":return v;
    case"Semester-tim":case"ATF-tim":case"Flextid":case"Övertid <2":case"Övertid 2>":case"Övertid-Helg":return v<0?-v:0;
    case"VAB":case"Sjuk-tim":case"Föräldraledig":return 0;
    default:return 0;
  }
}
function colorByBalance(sumOrd){
  if(sumOrd>=8)return"green";
  if(sumOrd>0&&sumOrd<8)return"orange";
  return"red";
}

// ===== Render =====
function yearFilter(r){return new Date(r.datum).getFullYear()===(state.settings.year||new Date().getFullYear());}
function calcMonthTotals(m){
  ensureMonth(m);const res={_kortid:0};
  (state.data[m]||[]).filter(yearFilter).forEach(r=>{
    res[r.kategori]=(res[r.kategori]||0)+Number(r.tid||0);
    res._kortid+=Number(r.kortid||0);
  });
  return res;
}
function renderTable(){
  const m=state.month;ensureMonth(m);const y=state.settings.year;const tb=$("rows");if(!tb)return;tb.innerHTML="";
  const rows=[...(state.data[m]||[]).filter(yearFilter)].sort((a,b)=>a.datum.localeCompare(b.datum));
  const H=state.settings.holidays!==false?swedishHolidays(y):new Map();
  const dayOrd={};
  rows.forEach(r=>{dayOrd[r.datum]=(dayOrd[r.datum]||0)+effectiveOrdinarie(r);});
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    const iso=r.datum;const d=new Date(iso),dow=d.getDay(),isWeekend=dow===0||dow===6,isHoliday=H.has(iso);
    let sum=dayOrd[iso]||0;const color=colorByBalance(sum);
    if(isWeekend)tr.classList.add("weekend");
    if(isHoliday)tr.classList.add("holiday");
    if(color==="orange")tr.classList.add("warn");
    tr.innerHTML=`<td>${r.datum}${isHoliday?` <span class="pill rose"><span class="dot"></span>${H.get(iso)}</span>`:""}</td>
    <td>${r.projekt||""}</td><td>${r.kategori}</td><td>${fmtBlankZero(r.tid)}</td>
    <td>${fmtBlankZero(r.kortid)}</td><td>${r.beskrivning||""}</td>
    <td class="actions"><button class="btn ghost" onclick="APP.editRow('${r._id}',${m})">Ändra</button>
    <button class="btn danger" onclick="APP.delRow('${r._id}',${m})">Ta bort</button></td>`;
    tb.appendChild(tr);
  });
  const t=calcMonthTotals(m);
  $("totalsCell").textContent=`Ordinarie: ${fmtBlankZero(t["Ordinarie tid"]||0)} | Flex: ${fmtBlankZero(t["Flextid"]||0)} | Semester: ${fmtBlankZero(t["Semester-tim"]||0)} | ATF: ${fmtBlankZero(t["ATF-tim"]||0)} | Körtid: ${fmtBlankZero(t._kortid||0)}`;
  renderYear();renderAlarms();initMenu();
}
function renderYear(){
  const tb=$("yearBody");if(!tb)return;tb.innerHTML="";
  for(let m=1;m<=12;m++){const t=calcMonthTotals(m);const tr=document.createElement("tr");
    tr.innerHTML=`<td>${cap(monthsSv[m-1])}</td><td>${fmtBlankZero(t["Ordinarie tid"]||0)}</td><td>${fmtBlankZero(t["Semester-tim"]||0)}</td>
    <td>${fmtBlankZero(t["ATF-tim"]||0)}</td><td>${fmtBlankZero(t["Sjuk-tim"]||0)}</td><td>${fmtBlankZero(t["Föräldraledig"]||0)}</td>
    <td>${fmtBlankZero(t["VAB"]||0)}</td><td>${fmtBlankZero(t["Flextid"]||0)}</td><td>${fmtBlankZero(t["Övertid <2"]||0)}</td>
    <td>${fmtBlankZero(t["Övertid 2>"]||0)}</td><td>${fmtBlankZero(t["Övertid-Helg"]||0)}</td><td>${fmtBlankZero(t["Traktamente"]||0)}</td><td>${fmtBlankZero(t._kortid||0)}</td>`;
    tb.appendChild(tr);}
}
function renderAlarms(){
  const m=state.month,y=state.settings.year,H=swedishHolidays(y);
  const mapOrd={};(state.data[m]||[]).filter(yearFilter).forEach(r=>{mapOrd[r.datum]=(mapOrd[r.datum]||0)+effectiveOrdinarie(r);});
  const days=new Date(y,m,0).getDate(),out=[];
  for(let d=1;d<=days;d++){const iso=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;const dow=new Date(iso).getDay();
    const wk=dow===0||dow===6,holiday=H.has(iso);const val=mapOrd[iso]||0;let c=colorByBalance(val);if(wk)c="blue";if(holiday)c="rose";
    out.push(`<div class="pill ${c}"><span class="dot"></span>${iso} — ${val>=8?"OK":val>0?`Under 8h (${fmtBlankZero(val)}h)`:"Saknas"}</div>`);}
  $("alarms").innerHTML=out.join("");
}
function renderAll(){renderTable();}

// ===== APP-actions =====
window.APP={
  editRow:(id,m)=>{const r=(state.data[m]||[]).find(x=>x._id===id);if(!r)return;enterEditMode(r,m);
    ["datum","tid","projekt","kortid","beskrivning"].forEach(k=>$(k).value=r[k]||"");$("kategori").value=r.kategori;},
  delRow:(id,m)=>{if(!confirm("Radera raden?"))return;const list=state.data[m]||[],idx=list.findIndex(r=>r._id===id);if(idx>-1){list.splice(idx,1);saveData();renderAll();}}
};

// ===== Init =====
document.addEventListener("DOMContentLoaded",()=>{for(let m=1;m<=12;m++)ensureMonth(m);renderAll();});
})();