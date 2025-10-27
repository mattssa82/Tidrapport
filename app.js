(()=>{
// ===== Utils & konstanter =====
const monthsSv=["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"];
const CSV_COLS=["Datum","Ordinarie tid","Körtid","Projekt","Semester-tim","ATF-tim","Sjuk-tim","Föräldraledig","VAB","Flextid","Övertid <2","Övertid 2>","Övertid-Helg","Traktamente","Beskrivning"];
const STORAGE="tidrapport_data_v10";
const SETTINGS="tidrapport_settings_v10";
const $=id=>document.getElementById(id);
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);

// Format (UI) — 0 visas tomt, minus bevaras
const fmtBlankZero = n => {
  const v = Number(n) || 0;
  if (v === 0) return "";
  return (Math.round(v*100)/100).toLocaleString("sv-SE",{minimumFractionDigits:0, maximumFractionDigits:2});
};
// Format (CSV) — 0 blir tomt, minus bevaras, punkt→komma
const fmtExport = n => {
  if (n==null || n==="") return "";
  const v = Number(String(n).replace(",", "."));
  if (!Number.isFinite(v) || v===0) return "";
  return v.toString().replace(".", ",");
};
const csvEscape=s=>{s=s==null?"":String(s).replace(/\r?\n/g," "); if(/[";]/.test(s)) s='"'+s.replace(/"/g,'""')+'"'; return s;};
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

// ===== State =====
function defSettings(){
  return{
    company:"",name:"",emp:"",owner:"",
    year:new Date().getFullYear(),
    note:"",
    autoBackup:true,
    holidays:true,
    holidayHours:8 // Röddag standard (h)
  }
}
function load(k,def){ try{const v=JSON.parse(localStorage.getItem(k)); return v??def}catch(_){return def} }
function saveData(){ localStorage.setItem(STORAGE,JSON.stringify(state.data)); if(state.settings.autoBackup) localStorage.setItem("tidrapport_last_update",Date.now()); }
function saveCfg(){ localStorage.setItem(SETTINGS,JSON.stringify(state.settings)); if(state.settings.autoBackup) localStorage.setItem("tidrapport_last_update",Date.now()); }
function ensureMonth(m){ if(!state.data[m]) state.data[m]=[] }

let state={month:(new Date().getMonth()+1), data:load(STORAGE,{}), settings:load(SETTINGS,defSettings())};

// ===== Meny & Hjälp =====
window.toggleMenu=(open)=>{const el=$("menu"); if(!el) return; el.classList.toggle("open",open); if(open) initMenu();}
function initMenu(){
  const sel=$("menuMonth");
  if(sel){
    sel.innerHTML="";
    monthsSv.forEach((n,i)=>{
      const o=document.createElement("option");
      o.value=i+1; o.textContent=cap(n); if(i+1===state.month) o.selected=true;
      sel.appendChild(o);
    });
  }
  // spegla inställningar
  const setVal=(id,v)=>{const el=$(id); if(!el) return; if(el.type==="checkbox") el.checked=!!v; else el.value=(v??"");};
  setVal("cfgCompany",state.settings.company);
  setVal("cfgName",state.settings.name);
  setVal("cfgEmp",state.settings.emp);
  setVal("cfgOwner",state.settings.owner);
  setVal("cfgYear",state.settings.year);
  setVal("cfgNote",state.settings.note);
  setVal("cfgAutoBackup",state.settings.autoBackup!==false);
  setVal("cfgHolidays",state.settings.holidays!==false);
  setVal("cfgHolidayHours",Number(state.settings.holidayHours)||8);
}
window.changeMonth=()=>{ const sel=$("menuMonth"); if(!sel) return; state.month=Number(sel.value)||state.month; renderAll(); toggleMenu(false); }
window.openHelp=()=>{ const el=$("helpOverlay"); if(el) el.classList.add("open"); }
window.closeHelp=()=>{ const el=$("helpOverlay"); if(el) el.classList.remove("open"); }

// ===== Settings =====
window.saveSettings=()=>{
  const getVal=id=>($(id)?.value??"").trim();
  state.settings.company=getVal("cfgCompany");
  state.settings.name=getVal("cfgName");
  state.settings.emp=getVal("cfgEmp");
  state.settings.owner=getVal("cfgOwner");
  state.settings.year=Number($("cfgYear")?.value)||new Date().getFullYear();
  state.settings.note=$("cfgNote")?.value||"";
  state.settings.autoBackup=!!$("cfgAutoBackup")?.checked;
  state.settings.holidays=!!$("cfgHolidays")?.checked;
  const hh=Number($("cfgHolidayHours")?.value); state.settings.holidayHours=Number.isFinite(hh)?hh:8;
  saveCfg(); renderAll();
};
window.resetSettings=()=>{
  if(!confirm("Rensa inställningar?\nDina inmatade rader påverkas inte.")) return;
  state.settings = defSettings(); saveCfg(); initMenu(); renderAll();
  alert("Inställningarna rensade.");
};
window.resetAll=async()=>{
  const input=prompt("⚠️ RADERA ALL DATA.\nSkriv: RADERA ALLT");
  if(input!=="RADERA ALLT") return;
  try{
    const pre=new Blob([JSON.stringify({settings:state.settings,data:state.data},null,2)],{type:"application/json"});
    download(`tidrapport_pre_reset_${Date.now()}.json`, pre);
  }catch(_){}
  state.data={}; for(let m=1;m<=12;m++) ensureMonth(m);
  saveData(); renderAll(); alert("All data rensad.");
};
window.createYear=()=>{ const y=Number(prompt("Skapa nytt år:", (state.settings.year||new Date().getFullYear())+1)); if(!y) return; state.settings.year=y; saveCfg(); renderAll(); };
window.deleteYear=()=>{ if(!confirm("År återställs till innevarande år (data ligger kvar)."))return; state.settings.year=new Date().getFullYear(); saveCfg(); renderAll(); };
window.quickBackup=()=>exportJSON();
window.APP = {
  toggleHolidays:(on)=>{ state.settings.holidays=!!on; saveCfg(); renderAll(); },
  openSearch:()=> openSearchOverlay(),
};

// ===== Input helpers =====
function normMinus(s){return (s||"").replace(/[–—−]/g,"-");}
function toNumRaw(s){ if(s==null) return NaN; s=normMinus((""+s).replace(/\s+/g,"")).replace(",","."); if(!/^[-]?\d*(\.\d+)?$/.test(s)) return NaN; return s===""?NaN:parseFloat(s); }
function roundQuarter(n){return Math.round(n*4)/4;}
function parseHourInput(v,allowEmpty=false){ if(allowEmpty && (v===""||v==null)) return 0; const n=toNumRaw(v); if(isNaN(n)) return NaN; return roundQuarter(n); }
function sanitizeProject(s){ s=(s||"").normalize("NFC").replace(/\s+/g,""); s=s.replace(/[^0-9A-Za-zÅÄÖåäö]/g,""); return s; }

// ===== Add/Edit/Delete =====
const btnAdd=$("btnAdd"); const btnCancel=$("btnCancel"); const btnBackup=$("btnBackup");
if(btnAdd) btnAdd.addEventListener("click", () => {
  const d=$("datum")?.value; if(!d){ alert("Välj datum."); return; }
  const k=$("kategori")?.value||"Ordinarie tid";
  const t=parseHourInput($("tid")?.value); if(isNaN(t)){ alert("Ogiltig Tid."); return; }
  const p=sanitizeProject($("projekt")?.value||"");
  const kt=parseHourInput($("kortid")?.value,true); if(isNaN(kt)){ alert("Ogiltig Körtid."); return; }
  const b=$("beskrivning")?.value||"";
  const m=(new Date(d)).getMonth()+1; ensureMonth(m);

  if (editing){
    const list=state.data[editing.month]||[]; const idx=list.findIndex(r=>r._id===editing.id);
    if(idx!==-1){
      list[idx]={...list[idx], datum:d,kategori:k,tid:t,projekt:p,kortid:kt,beskrivning:b};
      if (editing.month!==m){ const row=list.splice(idx,1)[0]; ensureMonth(m); state.data[m].push(row); state.month=m; }
      saveData();
    }else{
      state.data[m].push({_id:uid(), datum:d,kategori:k,tid:t,projekt:p,kortid:kt,beskrivning:b}); saveData();
    }
    exitEditMode(); renderAll();
  } else {
    state.data[m].push({_id:uid(), datum:d,kategori:k,tid:t,projekt:p,kortid:kt,beskrivning:b});
    saveData(); clearInputs(); state.month=m; renderAll();
  }
});
if(btnCancel) btnCancel.addEventListener("click", ()=>{ exitEditMode(); clearInputs(); });
if(btnBackup) btnBackup.addEventListener("click", ()=>{ quickBackup(); });

function enterEditMode(row, month){ editing={id:row._id, month}; if(btnAdd) btnAdd.textContent="Spara"; if(btnCancel) btnCancel.style.display=""; }
function exitEditMode(){ editing=null; if(btnAdd) btnAdd.textContent="Lägg till"; if(btnCancel) btnCancel.style.display="none"; }
function clearInputs(){["datum","tid","projekt","kortid","beskrivning"].forEach(id=>$(id)&&( $(id).value="")); const kat=$("kategori"); if(kat) kat.selectedIndex=0;}
let editing=null;

// ===== Helg & röda dagar (SE) =====
function easterSunday(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;return new Date(y,Math.floor(n/31)-1,(n%31)+1);}
function addDays(date,days){const d=new Date(date); d.setDate(d.getDate()+days); return d;}
function swedishHolidays(y){
  const H=new Map(); const add=(d, name)=>H.set(d.toISOString().slice(0,10),name);
  add(new Date(y,0,1),"Nyårsdagen"); add(new Date(y,0,6),"Trettondedag jul"); add(new Date(y,4,1),"Första maj");
  add(new Date(y,5,6),"Sveriges nationaldag"); add(new Date(y,11,25),"Juldagen"); add(new Date(y,11,26),"Annandag jul");
  const eas=easterSunday(y); add(addDays(eas,-2),"Långfredagen"); add(addDays(eas,1),"Annandag påsk"); add(addDays(eas,39),"Kristi himmelsfärdsdag");
  let mid=new Date(y,5,20); while(mid.getDay()!=6) mid=addDays(mid,1); add(mid,"Midsommardagen");
  let saints=new Date(y,9,31); while(saints.getDay()!=6) saints=addDays(saints,1); add(saints,"Alla helgons dag");
  return H;
}

// ===== Render =====
function yearFilter(r){ return (new Date(r.datum)).getFullYear() === (Number(state.settings.year)||new Date().getFullYear()); }
function calcMonthTotals(m){
  ensureMonth(m); const res={_kortid:0,"Traktamente":0};
  (state.data[m]||[]).filter(yearFilter).forEach(r=>{
    res[r.kategori]=(res[r.kategori]||0)+Number(r.tid||0);
    res._kortid+=Number(r.kortid||0);
  });
  return res;
}
function escapeHtml(s){return (s||"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);}

function renderTable(){
  const m=state.month; ensureMonth(m); const y=state.settings.year;
  const tb=$("rows"); if(!tb) return; tb.innerHTML="";
  const rows=[...(state.data[m]||[]).filter(yearFilter)].sort((a,b)=>a.datum.localeCompare(b.datum));

  // Endast Ordinarie tid räknas mot miniminivå (8h, men vi visar också helg/röd-dag-info)
  const dayOrdSum={};
  rows.forEach(r=>{
    if(r.kategori==="Ordinarie tid"){
      dayOrdSum[r.datum]=(dayOrdSum[r.datum]||0)+Number(r.tid||0);
    }
  });
  const H= state.settings.holidays!==false ? swedishHolidays(y) : new Map();
  const holidayHours = Number(state.settings.holidayHours)||8;

  rows.forEach((r)=>{
    const tr=document.createElement("tr");
    const d=new Date(r.datum); const dow=d.getDay(); const iso=r.datum;
    const isWeekend=(dow===0||dow===6); const isHoliday= H.has(iso);
    if(isWeekend) tr.classList.add("weekend");
    if(isHoliday) tr.classList.add("holiday");

    // Vardagar utan 8h ordinarie → varning
    if(!isWeekend && !isHoliday && (dayOrdSum[r.datum]||0)<8) tr.classList.add("warn");

    // Badge för helg/röd dag
    let badge="";
    if(isHoliday) badge=` <span class="pill rose"><span class="dot"></span>${H.get(iso)}</span>`;
    else if(isWeekend) badge=` <span class="pill blue"><span class="dot"></span>Helg</span>`;

    tr.innerHTML=`<td>${r.datum}${badge}</td><td>${escapeHtml(r.projekt||"")}</td><td>${r.kategori}</td>
      <td>${fmtBlankZero(r.tid)}</td><td>${fmtBlankZero(r.kortid)}</td><td>${escapeHtml(r.beskrivning||"")}</td>
      <td class="actions">
        <button class="btn ghost" onclick="APP.editRow('${r._id}', ${m})">Ändra</button>
        <button class="btn danger" onclick="APP.delRow('${r._id}', ${m})">Ta bort</button>
      </td>`;
    tb.appendChild(tr);
  });

  const t=calcMonthTotals(m);
  const totals=$("totalsCell"); if(totals){
    totals.textContent =
      `Summering — Ordinarie: ${fmtBlankZero(t["Ordinarie tid"]||0)} | Semester: ${fmtBlankZero(t["Semester-tim"]||0)} | ATF: ${fmtBlankZero(t["ATF-tim"]||0)} | `+
      `Sjuk: ${fmtBlankZero(t["Sjuk-tim"]||0)} | Föräldraledig: ${fmtBlankZero(t["Föräldraledig"]||0)} | VAB: ${fmtBlankZero(t["VAB"]||0)} | Flextid: ${fmtBlankZero(t["Flextid"]||0)} | `+
      `ÖT<2: ${fmtBlankZero(t["Övertid <2"]||0)} | ÖT2>: ${fmtBlankZero(t["Övertid 2>"]||0)} | ÖT-Helg: ${fmtBlankZero(t["Övertid-Helg"]||0)} | Trakt (st): ${fmtBlankZero(t["Traktamente"]||0)} | `+
      `Körtid: ${fmtBlankZero(t._kortid||0)}`;
  }

  renderYear(); renderAlarms(); initMenu();
}
function renderYear(){
  const tb=$("yearBody"); if(!tb) return; tb.innerHTML="";
  for(let m=1;m<=12;m++){
    const t=calcMonthTotals(m);
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${cap(monthsSv[m-1])}</td>
      <td>${fmtBlankZero(t["Ordinarie tid"]||0)}</td><td>${fmtBlankZero(t["Semester-tim"]||0)}</td><td>${fmtBlankZero(t["ATF-tim"]||0)}</td>
      <td>${fmtBlankZero(t["Sjuk-tim"]||0)}</td><td>${fmtBlankZero(t["Föräldraledig"]||0)}</td><td>${fmtBlankZero(t["VAB"]||0)}</td><td>${fmtBlankZero(t["Flextid"]||0)}</td>
      <td>${fmtBlankZero(t["Övertid <2"]||0)}</td><td>${fmtBlankZero(t["Övertid 2>"]||0)}</td><td>${fmtBlankZero(t["Övertid-Helg"]||0)}</td>
      <td>${fmtBlankZero(t["Traktamente"]||0)}</td><td>${fmtBlankZero(t._kortid||0)}</td>`;
    tb.appendChild(tr);
  }
}
function renderAlarms(){
  const m=state.month; ensureMonth(m);
  const y=state.settings.year||new Date().getFullYear();
  const H = state.settings.holidays!==false ? swedishHolidays(y) : new Map();
  const holidayHours = Number(state.settings.holidayHours)||8;

  const mapOrd={}; // endast ordinarie
  (state.data[m]||[]).filter(yearFilter).forEach(r=>{
    if(r.kategori==="Ordinarie tid"){
      const d=r.datum; mapOrd[d]=(mapOrd[d]||0)+Number(r.tid||0);
    }
  });

  const last=new Date(y,m,0).getDate();
  const lines=[];
  for(let d=1; d<=last; d++){
    const iso=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dow=new Date(iso).getDay();
    const isWeekend=(dow===0||dow===6);
    const isHoliday=H.has(iso);
    const sumOrd=mapOrd[iso]||0;

    let cls="", label="";
    if (isHoliday){ 
      // Visning: röd dag – neutral info, inte krav på 8h
      cls="rose"; label=`Röd dag (${H.get(iso)})`; 
      // Om man ändå lagt ordinarie, visa info:
      if(sumOrd>0) label+=` — registrerat Ord: ${fmtBlankZero(sumOrd)}h`;
    }
    else if (isWeekend){ 
      cls="blue"; label="Helg"; 
      if(sumOrd>0) label+=` — registrerat Ord: ${fmtBlankZero(sumOrd)}h`;
    }
    else if(mapOrd[iso]==null){ 
      cls="red"; label="Saknas";
    }
    else if(sumOrd<8){ 
      cls="orange"; label=`Under 8h (Ord: ${fmtBlankZero(sumOrd)}h)`; 
    }
    else {
      cls="green";
      const extra = sumOrd>8 ? ` — +${fmtBlankZero(sumOrd-8)}h` : "";
      label=`OK (8h Ord)${extra}`;
    }

    lines.push(`<div class="pill ${cls}"><span class="dot"></span><span>${iso} — ${label}</span></div>`);
  }
  const el=$("alarms"); if(el) el.innerHTML = lines.length ? `<div class="pills">${lines.join("")}</div>` : "Inga varningar för denna månad.";
}
function renderAll(){renderTable();}

// ===== CSV helpers (RADER + SUMMA + PER PROJEKT + metadata) =====
function sortedRows(months){
  const out=[]; months.forEach(m=>{ensureMonth(m); (state.data[m]||[]).filter(yearFilter).forEach(r=>out.push({...r,_m:m}));});
  out.sort((a,b)=>{const c=a.datum.localeCompare(b.datum); if(c) return c; const p=(a.projekt||"").localeCompare(b.projekt||""); if(p) return p; return (a.kategori||"").localeCompare(b.kategori||"");});
  return out;
}
function groupByProject(months){
  const map={};
  months.forEach(m=>{
    ensureMonth(m);
    (state.data[m]||[]).filter(yearFilter).forEach(r=>{
      const key=(r.projekt||"(TOMT)").trim().toUpperCase();
      const cat=r.kategori||"";
      map[key] ??={_kortid:0};
      map[key]._kortid+=Number(r.kortid||0);
      map[key][cat]=(map[key][cat]||0)+Number(r.tid||0);
    });
  });
  return map;
}
function headerInfo(scope){
  const y=state.settings.year, m=state.month;
  const parts=[
    "sep=;",
    "Tidrapport;;;;",
    `Företag;${state.settings.company||""};;;;`,
    `Namn;${state.settings.name||""};;;;`,
    `Anst-Nr;${state.settings.emp||""};;;;`
  ];
  if(state.settings.owner) parts.push(`Ägar-ID;${state.settings.owner};;;;`);
  parts.push(`År;${y};;;;`);
  if(scope==="month") parts.push(`Månad;${cap(monthsSv[m-1])};;;;`);
  if(state.settings.note && state.settings.note.trim()) parts.push(`Notering;${state.settings.note.replace(/\r?\n/g," ")}`);
  parts.push("");
  return parts.join("\r\n");
}
function buildRowsSection(scope){
  const months = scope==="year" ? Array.from({length:12},(_,i)=>i+1) : [state.month];
  const lines=[`### RADER (${scope==="year"?"år":"månad"})`, CSV_COLS.join(";")];

  sortedRows(months).forEach(r=>{
    const cat=r.kategori||"";
    const V = want => fmtExport(cat===want ? r.tid : "");
    const row=[
      r.datum,
      V("Ordinarie tid"),
      fmtExport(r.kortid),
      csvEscape(r.projekt||""),
      V("Semester-tim"),V("ATF-tim"),V("Sjuk-tim"),V("Föräldraledig"),
      V("VAB"),V("Flextid"),V("Övertid <2"),V("Övertid 2>"),
      V("Övertid-Helg"),V("Traktamente"),
      csvEscape(r.beskrivning||"")
    ];
    lines.push(row.join(";"));
  });

  // SUMMA-rad
  const sum={};
  sortedRows(months).forEach(r=>{
    const add=(k,v)=> sum[k]=(sum[k]||0)+(Number(v)||0);
    if(r.kategori==="Ordinarie tid") add("Ordinarie tid",r.tid);
    if(r.kortid) add("Körtid",r.kortid);
    if(r.kategori==="Semester-tim") add("Semester-tim",r.tid);
    if(r.kategori==="ATF-tim") add("ATF-tim",r.tid);
    if(r.kategori==="Sjuk-tim") add("Sjuk-tim",r.tid);
    if(r.kategori==="Föräldraledig") add("Föräldraledig",r.tid);
    if(r.kategori==="VAB") add("VAB",r.tid);
    if(r.kategori==="Flextid") add("Flextid",r.tid);
    if(r.kategori==="Övertid <2") add("Övertid <2",r.tid);
    if(r.kategori==="Övertid 2>") add("Övertid 2>",r.tid);
    if(r.kategori==="Övertid-Helg") add("Övertid-Helg",r.tid);
    if(r.kategori==="Traktamente") add("Traktamente",r.tid);
  });
  const short=["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
  const label = scope==="year" ? `SUMMA (${state.settings.year})` : `SUMMA (${short[state.month-1]})`;
  lines.push([
    label,
    fmtExport(sum["Ordinarie tid"]), fmtExport(sum["Körtid"]), "",
    fmtExport(sum["Semester-tim"]), fmtExport(sum["ATF-tim"]), fmtExport(sum["Sjuk-tim"]), fmtExport(sum["Föräldraledig"]),
    fmtExport(sum["VAB"]), fmtExport(sum["Flextid"]), fmtExport(sum["Övertid <2"]), fmtExport(sum["Övertid 2>"]),
    fmtExport(sum["Övertid-Helg"]), fmtExport(sum["Traktamente"]), ""
  ].join(";"));

  lines.push("");
  return lines.join("\r\n");
}
function buildProjectSection(scope){
  const months = scope==="year" ? Array.from({length:12},(_,i)=>i+1) : [state.month];
  const y=state.settings.year, m=String(state.month).padStart(2,"0");
  const lines=[`### SUMMERING PER PROJEKT (${scope==="year"?"år":"månad"})`, CSV_COLS.join(";")];
  const g=groupByProject(months);
  Object.keys(g).sort().forEach(p=>{
    const o=g[p]; const datum=scope==="year" ? `${y}-01-01` : `${y}-${m}-01`;
    const row=[datum,
      fmtExport(o["Ordinarie tid"]||0),
      fmtExport(o._kortid||0),
      csvEscape(p),
      fmtExport(o["Semester-tim"]||0),
      fmtExport(o["ATF-tim"]||0),
      fmtExport(o["Sjuk-tim"]||0),
      fmtExport(o["Föräldraledig"]||0),
      fmtExport(o["VAB"]||0),
      fmtExport(o["Flextid"]||0),
      fmtExport(o["Övertid <2"]||0),
      fmtExport(o["Övertid 2>"]||0),
      fmtExport(o["Övertid-Helg"]||0),
      fmtExport(o["Traktamente"]||0),
      "Summerat per projekt"
    ];
    lines.push(row.join(";"));
  });
  return lines.join("\r\n");
}
function buildCombinedCsv(scope){
  return headerInfo(scope) + buildRowsSection(scope) + buildProjectSection(scope);
}
function makeBlobCSV(text){
  // UTF-16LE + BOM (Excel-vänligt)
  const s=(text||"").normalize("NFC");
  const bom=new Uint8Array([0xFF,0xFE]);
  const buf=new Uint8Array(bom.length + s.length*2);
  bom.forEach((b,i)=>buf[i]=b);
  for(let i=0;i<s.length;i++){const code=s.charCodeAt(i); buf[bom.length+i*2]=code&0xFF; buf[bom.length+i*2+1]=(code>>8)&0xFF;}
  return new Blob([buf],{type:"text/csv;charset=utf-16le"});
}
function download(name,blob){const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);}

// ===== Export/Dela knappar (definierar wrappers om export.js ej laddats) =====
window.exportMonthReport = window.exportMonthReport || (()=>{
  return function(){ const text=buildCombinedCsv("month"); const y=state.settings.year, m=String(state.month).padStart(2,"0"); download(`tidrapport_${y}_${m}_manadsrapport.csv`, makeBlobCSV(text)); };
})();
window.exportYearReportCombined = window.exportYearReportCombined || (()=>{
  return function(){ const text=buildCombinedCsv("year"); const y=state.settings.year; download(`tidrapport_${y}_arsrapport.csv`, makeBlobCSV(text)); };
})();
window.shareMonthPdfEmail = window.shareMonthPdfEmail || (()=>{
  return function(){ const blob=makePdf("month"); tryShareOrDownload(`Tidrapport_${state.settings.year}_${String(state.month).padStart(2,"0")}.pdf`, blob, "Tidrapport – Månadsrapport (PDF)"); };
})();
window.shareYearPdfEmail = window.shareYearPdfEmail || (()=>{
  return function(){ const blob=makePdf("year"); tryShareOrDownload(`Tidrapport_${state.settings.year}.pdf`, blob, "Tidrapport – Årsrapport (PDF)"); };
})();

async function tryShareOrDownload(filename, blob, title){
  if (navigator.canShare && navigator.canShare({files:[new File([blob], filename, {type: blob.type})]})) {
    try { const file = new File([blob], filename, {type: blob.type}); await navigator.share({title, files:[file]}); return true; } catch (e) {}
  }
  download(filename, blob);
  alert("Delning stöds inte här – filen laddades ner istället.");
  return false;
}

// ===== PDF (jsPDF) =====
function makePdf(scope){ // -> Blob
  const { jsPDF } = window.jspdf;
  // A3 Landscape (bättre plats, enligt överenskommelse)
  const doc = new jsPDF({unit:"pt", format:"a3", orientation:"landscape"});
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const lineH = 14;
  const mono = "courier";

  let y = margin + 8;
  const wrap = (txt)=> doc.splitTextToSize(txt, pageW - margin*2);
  const writeLine = (txt, opts={})=>{
    if(y > pageH - margin){ doc.addPage(); y = margin + 8; }
    doc.setFont(mono, opts.bold ? "bold" : "normal");
    doc.text(txt, margin, y);
    y += lineH;
  };

  const title = scope==="year"
    ? `Årsrapport ${state.settings.year}`
    : `Månadsrapport ${monthsSv[state.month-1]} ${state.settings.year}`;
  doc.setFont(mono,"bold"); doc.setFontSize(14);
  writeLine(`Tidrapport — ${title}`);
  doc.setFont(mono,"normal"); doc.setFontSize(10);

  headerInfo(scope).split("\r\n").filter(Boolean).forEach(l=>writeLine(l));
  y+=6;

  writeLine(`### RADER (${scope==="year"?"år":"månad"})`,{bold:true});
  buildRowsSection(scope).split("\r\n").forEach(row=>{ if(!row) return; wrap(row).forEach(line=>writeLine(line)); });
  y+=10;

  writeLine(`### SUMMERING PER PROJEKT (${scope==="year"?"år":"månad"})`,{bold:true});
  buildProjectSection(scope).split("\r\n").forEach(row=>{ if(!row) return; wrap(row).forEach(line=>writeLine(line)); });

  return doc.output("blob");
}

// ===== JSON Export/Import =====
window.exportJSON = window.exportJSON || (()=>{
  return function(){ const blob=new Blob([JSON.stringify({settings:state.settings,data:state.data},null,2)],{type:"application/json"}); download(`tidrapport_backup_${state.settings.year}.json`, blob); };
})();
window.shareJSON = window.shareJSON || (()=>{
  return async function(){ const blob=new Blob([JSON.stringify({settings:state.settings,data:state.data},null,2)],{type:"application/json"}); await tryShareOrDownload(`tidrapport_backup_${state.settings.year}.json`, blob, "Tidrapport – Backup JSON"); };
})();
window.importJSON=async(ev)=>{
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  try{
    const txt = await file.text();
    const obj = JSON.parse(txt);
    if(obj.settings) state.settings = {...state.settings, ...obj.settings};
    if(obj.data)     state.data     = obj.data;
    saveCfg(); saveData(); renderAll();
    alert("JSON backup importerad.");
  }catch(e){ alert("Kunde inte importera JSON: "+(e.message||e)); }
  finally{ ev.target.value=""; }
};

// ===== CSV Import =====
window.importCSV=async(ev)=>{
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  try{
    const txt = await file.text();
    const rows = txt.replace(/\r\n/g,"\n").split("\n").filter(l=>l.trim()!=="");
    let idx = rows[0] && rows[0].toLowerCase().startsWith("sep=") ? 1 : 0;
    if(rows[idx] && /datum;.*ordinarie/i.test(rows[idx])) idx++;

    for(; idx<rows.length; idx++){
      const cols = rows[idx].split(";");
      if(cols.length < 5) continue;
      const [datum, ord, kort, projekt, sem, atf, sjuk, forald, vab, flex, otlt2, ot2gt, othel, trakt, bes] = cols;

      const base = {
        datum:(datum||"").trim(),
        projekt:(projekt||"").trim(),
        kortid:Number((kort||"").replace(",", "."))||0,
        beskrivning:(bes||"").trim()
      };
      const month = base.datum && !Number.isNaN(new Date(base.datum).getTime())
        ? (new Date(base.datum).getMonth()+1)
        : state.month;
      ensureMonth(month);

      const pushCat = (kat, val)=>{
        const v = Number((val||"").replace(",", "."));
        if(!Number.isFinite(v) || v===0) return;
        state.data[month].push({_id:uid(), datum:base.datum, kategori:kat, tid:v, projekt:base.projekt, kortid:base.kortid, beskrivning:base.beskrivning});
      };

      pushCat("Ordinarie tid", ord);
      pushCat("Semester-tim", sem);
      pushCat("ATF-tim", atf);
      pushCat("Sjuk-tim", sjuk);
      pushCat("Föräldraledig", forald);
      pushCat("VAB", vab);
      pushCat("Flextid", flex);
      pushCat("Övertid <2", otlt2);
      pushCat("Övertid 2>", ot2gt);
      pushCat("Övertid-Helg", othel);
      pushCat("Traktamente", trakt);
    }
    saveData(); renderAll();
    alert("CSV import klar.");
  }catch(e){
    alert("Kunde inte importera CSV: "+(e.message||e));
  }finally{ ev.target.value=""; }
};

// ===== App-actions för Ändra/Ta bort + Sök-UI =====
window.APP = Object.assign(window.APP||{}, {
  editRow:(id,m)=>{
    const row=(state.data[m]||[]).find(r=>r._id===id); if(!row) return;
    enterEditMode(row,m);
    const set=(id,val)=>{ if($(id)) $(id).value=val; };
    set("datum",row.datum); set("tid",row.tid); set("projekt",row.projekt); set("kortid",row.kortid); set("beskrivning",row.beskrivning);
    const kat=$("kategori"); if(kat) kat.value=row.kategori;
    window.scrollTo({top:0,behavior:"smooth"});
  },
  delRow:(id,m)=>{
    if(!confirm("Radera raden?")) return;
    const list=state.data[m]||[]; const idx=list.findIndex(r=>r._id===id);
    if(idx>-1){ list.splice(idx,1); saveData(); renderAll(); }
  }
});

// ===== Sök-overlay =====
let searchOverlayEl=null;
function openSearchOverlay(){
  if(searchOverlayEl){ searchOverlayEl.remove(); searchOverlayEl=null; }
  const el=document.createElement("div");
  el.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:400;display:flex;align-items:center;justify-content:center;padding:1rem";
  el.innerHTML=`
    <div style="width:min(1100px,96%);max-height:90vh;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1rem;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.75rem">
        <strong style="font-size:1.05rem;display:flex;align-items:center;gap:.5rem">🔍 Sök i alla månader/år</strong>
        <button id="soClose" class="btn ghost" style="margin-left:auto">Stäng</button>
      </div>
      <div class="grid" style="grid-template-columns:1fr auto auto;gap:.5rem">
        <input id="soQuery" placeholder="Sök på datum, projekt, kategori, beskrivning …" />
        <select id="soScope">
          <option value="year">Hela året</option>
          <option value="month">Aktuell månad</option>
        </select>
        <button id="soBtn" class="btn primary">Sök</button>
      </div>
      <div style="margin-top:.75rem;overflow:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="border-bottom:1px solid #e5e7eb;text-align:left;padding:.4rem">Datum</th>
            <th style="border-bottom:1px solid #e5e7eb;text-align:left;padding:.4rem">Projekt</th>
            <th style="border-bottom:1px solid #e5e7eb;text-align:left;padding:.4rem">Kategori</th>
            <th style="border-bottom:1px solid #e5e7eb;text-align:left;padding:.4rem">Tid</th>
            <th style="border-bottom:1px solid #e5e7eb;text-align:left;padding:.4rem">Körtid</th>
            <th style="border-bottom:1px solid #e5e7eb;text-align:left;padding:.4rem">Beskrivning</th>
          </tr></thead>
          <tbody id="soBody"></tbody>
          <tfoot><tr><td id="soMeta" colspan="6" style="padding:.4rem;color:#6b7280"></td></tr></tfoot>
        </table>
      </div>
      <div class="actions" style="margin-top:.6rem">
        <button id="soExportCsv" class="btn ghost">Exportera träffar (CSV)</button>
        <button id="soShareCsv" class="btn ghost">Dela träffar</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  searchOverlayEl=el;

  const close=()=>{ if(searchOverlayEl){ searchOverlayEl.remove(); searchOverlayEl=null; } };
  el.addEventListener("click",(e)=>{ if(e.target===el) close(); });
  el.querySelector("#soClose").addEventListener("click", close);
  const q=el.querySelector("#soQuery"), scope=el.querySelector("#soScope"), btn=el.querySelector("#soBtn");
  const body=el.querySelector("#soBody"), meta=el.querySelector("#soMeta");
  const btnExp=el.querySelector("#soExportCsv"), btnShare=el.querySelector("#soShareCsv");

  function doSearch(){
    const term=(q.value||"").trim().toLowerCase();
    const months = (scope.value==="year") ? Array.from({length:12},(_,i)=>i+1) : [state.month];
    const rows = sortedRows(months).filter(r=>{
      if(!term) return true;
      const hay = [
        r.datum||"", r.projekt||"", r.kategori||"", (r.tid??"")+"", (r.kortid??"")+"", r.beskrivning||""
      ].join(" ").toLowerCase();
      return hay.indexOf(term)>-1;
    });
    body.innerHTML= rows.map(r=>`<tr>
      <td style="border-bottom:1px solid #e5e7eb;padding:.4rem">${r.datum}</td>
      <td style="border-bottom:1px solid #e5e7eb;padding:.4rem">${escapeHtml(r.projekt||"")}</td>
      <td style="border-bottom:1px solid #e5e7eb;padding:.4rem">${r.kategori}</td>
      <td style="border-bottom:1px solid #e5e7eb;padding:.4rem">${fmtBlankZero(r.tid)}</td>
      <td style="border-bottom:1px solid #e5e7eb;padding:.4rem">${fmtBlankZero(r.kortid)}</td>
      <td style="border-bottom:1px solid #e5e7eb;padding:.4rem">${escapeHtml(r.beskrivning||"")}</td>
    </tr>`).join("");
    meta.textContent = `${rows.length} träffar — scope: ${scope.value==="year"?"år":"månad"}`;

    // knappar för export/dela av sökträffar
    const csvText = (()=> {
      const lines = ["sep=;", `Sökresultat;${term};${new Date().toISOString()}`,"", CSV_COLS.join(";")];
      rows.forEach(r=>{
        const V = want => fmtExport((r.kategori||"")===want ? r.tid : "");
        lines.push([
          r.datum,
          V("Ordinarie tid"),
          fmtExport(r.kortid),
          csvEscape(r.projekt||""),
          V("Semester-tim"),V("ATF-tim"),V("Sjuk-tim"),V("Föräldraledig"),
          V("VAB"),V("Flextid"),V("Övertid <2"),V("Övertid 2>"),
          V("Övertid-Helg"),V("Traktamente"),
          csvEscape(r.beskrivning||"")
        ].join(";"));
      });
      return lines.join("\r\n");
    })();
    btnExp.onclick=()=> download(`tidrapport_sok_${state.settings.year}_${scope.value}.csv`, makeBlobCSV(csvText));
    btnShare.onclick=()=> tryShareOrDownload(`tidrapport_sok_${state.settings.year}_${scope.value}.csv`, makeBlobCSV(csvText), "Tidrapport – Sökresultat");
  }
  btn.addEventListener("click", doSearch);
  q.addEventListener("keydown",e=>{ if(e.key==="Enter") doSearch(); });
  doSearch();
}

// ===== Init =====
function onReady(){
  for(let m=1;m<=12;m++) ensureMonth(m);
  renderAll();
}
document.addEventListener("DOMContentLoaded", onReady);
})();