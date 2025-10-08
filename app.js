(()=>{
// ===== Utils & konstanter =====
const monthsSv=["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"];
const CSV_COLS=["Datum","Ordinarie tid","Körtid","Projekt","Semester-tim","ATF-tim","Sjuk-tim","Föräldraledig","VAB","Flextid","Övertid <2","Övertid 2>","Övertid-Helg","Traktamente","Beskrivning"];
const STORAGE="tidrapport_data_v11";
const SETTINGS="tidrapport_settings_v11";
const $=id=>document.getElementById(id);
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);

// Format (UI) — 0 visas tomt
const fmtBlankZero=n=>{
  const v=Number(n)||0; if(v===0) return "";
  return (Math.round(v*100)/100).toLocaleString("sv-SE",{minimumFractionDigits:0,maximumFractionDigits:2});
};
// Format (CSV) — 0 blir tomt, minus bevaras, punkt→komma
const fmtExport=n=>{
  if(n==null||n==="") return "";
  const v=Number(String(n).replace(",","."));
  if(!Number.isFinite(v)||v===0) return "";
  return v.toString().replace(".",",");
};
const csvEscape=s=>{s=s==null?"":String(s).replace(/\r?\n/g," "); if(/[";]/.test(s)) s='"'+s.replace(/"/g,'""')+'"'; return s;};
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

// ===== State =====
let state={month:(new Date().getMonth()+1), data:load(STORAGE,{}), settings:load(SETTINGS,defSettings())};
function defSettings(){return{company:"",name:"",emp:"",owner:"",year:new Date().getFullYear(),note:"",autoBackup:true,holidays:true}}
function load(k,def){try{const v=JSON.parse(localStorage.getItem(k));return v??def}catch(_){return def}}
function saveData(){ localStorage.setItem(STORAGE,JSON.stringify(state.data)); if(state.settings.autoBackup) localStorage.setItem("tidrapport_last_update",Date.now()); }
function saveCfg(){ localStorage.setItem(SETTINGS,JSON.stringify(state.settings)); if(state.settings.autoBackup) localStorage.setItem("tidrapport_last_update",Date.now()); }
function ensureMonth(m){ if(!state.data[m]) state.data[m]=[] }

// ===== Meny =====
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
  // init settings inputs
  const ids=["cfgCompany","cfgName","cfgEmp","cfgOwner","cfgYear","cfgNote"];
  const st=state.settings;
  if($("cfgCompany")) $("cfgCompany").value=st.company||"";
  if($("cfgName")) $("cfgName").value=st.name||"";
  if($("cfgEmp")) $("cfgEmp").value=st.emp||"";
  if($("cfgOwner")) $("cfgOwner").value=st.owner||"";
  if($("cfgYear")) $("cfgYear").value=st.year||new Date().getFullYear();
  if($("cfgNote")) $("cfgNote").value=st.note||"";
  if($("cfgAutoBackup")) $("cfgAutoBackup").checked = st.autoBackup!==false;
}
window.changeMonth=()=>{ const sel=$("menuMonth"); if(!sel) return; state.month=Number(sel.value)||state.month; renderAll(); toggleMenu(false); }
window.openSearch=()=>{ $("searchView").style.display=""; $("mainView").scrollIntoView({behavior:"smooth"}); toggleMenu(false); }
window.closeSearch=()=>{ $("searchView").style.display="none"; }

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
  saveCfg(); renderAll();
};
window.resetSettings=()=>{
  if(!confirm("Rensa inställningar?\nDina inmatade rader påverkas inte.")) return;
  state.settings = defSettings(); saveCfg(); initMenu(); renderAll();
  alert("Inställningarna rensade.");
};
window.createYear=()=>{ const y=Number(prompt("Skapa nytt år:", (state.settings.year||new Date().getFullYear())+1)); if(!y) return; state.settings.year=y; saveCfg(); renderAll(); };
window.deleteYear=()=>{ if(!confirm("År återställs till innevarande år (data ligger kvar)."))return; state.settings.year=new Date().getFullYear(); saveCfg(); renderAll(); };
window.quickBackup=()=>exportJSON();

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
  const H=new Map(); const add=(d,name)=>H.set(d.toISOString().slice(0,10),name);
  add(new Date(y,0,1),"Nyårsdagen"); add(new Date(y,0,6),"Trettondedag jul"); add(new Date(y,4,1),"Första maj");
  add(new Date(y,5,6),"Sveriges nationaldag"); add(new Date(y,11,25),"Juldagen"); add(new Date(y,11,26),"Annandag jul");
  const eas=easterSunday(y); add(addDays(eas,-2),"Långfredagen"); add(addDays(eas,1),"Annandag påsk"); add(addDays(eas,39),"Kristi himmelsfärdsdag");
  let mid=new Date(y,5,20); while(mid.getDay()!=6) mid=addDays(mid,1); add(mid,"Midsommardagen");
  let saints=new Date(y,9,31); while(saints.getDay()!=6) saints=addDays(saints,1); add(saints,"Alla helgons dag");
  return H;
}

// ===== Balansregler (effektiv 8h) =====
// Positiva timmar i frånvaro (VAB/Sjuk/Föräldraledig) räknas INTE mot 8h.
// Negativa timmar i flextid/semester/ATF/övertid räknas SOM ordinarie.
// Övertid positiva är extra, påverkar ej 8h-OK.
const contributesAsOrdNegative = (cat) => (
  cat==="Flextid" || cat==="Semester-tim" || cat==="ATF-tim" ||
  cat==="Övertid <2" || cat==="Övertid 2>" || cat==="Övertid-Helg"
);
function effectiveOrdinaryForDay(rows){
  let ord=0, notes=[];
  for(const r of rows){
    const v=Number(r.tid)||0;
    if(r.kategori==="Ordinarie tid"){
      ord+=v; if(v) notes.push(`${fmtBlankZero(v)}h Ord`);
    }else if(contributesAsOrdNegative(r.kategori) && v<0){
      ord+=(-v); notes.push(`${fmtBlankZero(v)}h ${r.kategori}`);
    }else if(["VAB","Sjuk-tim","Föräldraledig"].includes(r.kategori) && v<0){
      // Negativa korr på frånvaro (= plus mot ord)
      ord+=(-v); notes.push(`${fmtBlankZero(v)}h ${r.kategori}`);
    }else{
      // övrigt: bara för notering
      if(v && r.kategori!=="Traktamente") notes.push(`${fmtBlankZero(v)}h ${r.kategori}`);
    }
  }
  return {ord, notes};
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

  // samla per dag
  const byDay=new Map();
  for(const r of rows){ const k=r.datum; if(!byDay.has(k)) byDay.set(k,[]); byDay.get(k).push(r); }

  const H= state.settings.holidays!==false ? swedishHolidays(y) : new Map();

  rows.forEach((r)=>{
    const tr=document.createElement("tr");
    const d=new Date(r.datum); const dow=d.getDay(); const iso=r.datum;
    const isWeekend=(dow===0||dow===6); const isHoliday= H.has(iso);
    if(isWeekend) tr.classList.add("weekend");
    if(isHoliday) tr.classList.add("holiday");

    // balansfärg vid vardag
    if(!isWeekend && !isHoliday){
      const group=byDay.get(iso)||[];
      const {ord} = effectiveOrdinaryForDay(group);
      if(ord<8) tr.classList.add("warn");
    }

    const hname=isHoliday?` <span class="pill rose"><span class="dot"></span>${H.get(iso)}</span>`:"";
    tr.innerHTML=`<td>${r.datum}${hname}</td><td>${escapeHtml(r.projekt||"")}</td><td>${r.kategori}</td>
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

  // gruppera dag
  const byDay=new Map();
  (state.data[m]||[]).filter(yearFilter).forEach(r=>{
    const k=r.datum; if(!byDay.has(k)) byDay.set(k,[]); byDay.get(k).push(r);
  });

  const last=new Date(y,m,0).getDate();
  const lines=[];
  for(let d=1; d<=last; d++){
    const iso=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dow=new Date(iso).getDay();
    const isWeekend=(dow===0||dow===6);
    const isHoliday=H.has(iso);
    const rows=byDay.get(iso)||[];

    let cls="", label="";
    if (isHoliday){ cls="rose"; label=`Röd dag (${H.get(iso)})`; }
    else if (isWeekend){ cls="blue"; label="Helg"; }
    else if(rows.length===0){ cls="red"; label="Saknas"; }
    else {
      const {ord, notes} = effectiveOrdinaryForDay(rows);
      if(ord<8){ cls="orange"; label=`Under 8h (Eff: ${fmtBlankZero(ord)}h) — ${notes.join(", ")}`; }
      else { cls="green"; label=`OK (8h Ord) — ${notes.join(", ")}`; }
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

// till export.js använder
window.__buildRowsSection=(scope)=>{
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
};
window.__buildProjectSection=(scope)=>{
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
};
window.__buildCombinedCsv=(scope)=> headerInfo(scope) + window.__buildRowsSection(scope) + window.__buildProjectSection(scope);
window.__makeBlobCSV=(text)=>{
  const s=(text||"").normalize("NFC"); const bom=new Uint8Array([0xFF,0xFE]); const buf=new Uint8Array(bom.length + s.length*2);
  bom.forEach((b,i)=>buf[i]=b);
  for(let i=0;i<s.length;i++){const code=s.charCodeAt(i); buf[bom.length+i*2]=code&0xFF; buf[bom.length+i*2+1]=(code>>8)&0xFF;}
  return new Blob([buf],{type:"text/csv;charset=utf-16le"});
};
window.__download=(name,blob)=>{const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);};

// ===== Export/Dela knappar (anropas från index via export.js) =====
// (finns i export.js)

// ===== JSON/CSV Import/Export (finns i backup.js) =====

// ===== Sök =====
function allRowsAllMonths(){
  const y=state.settings.year;
  const out=[];
  for(let m=1;m<=12;m++){
    ensureMonth(m);
    (state.data[m]||[]).forEach(r=>{ if(yearFilter(r)) out.push({...r,_m:m}); });
  }
  return out.sort((a,b)=>a.datum.localeCompare(b.datum));
}
window.performSearch=()=>{
  const q=($("searchQuery")?.value||"").trim().toLowerCase();
  const rows=allRowsAllMonths().filter(r=>{
    if(!q) return true;
    const hay=[r.datum||"", r.projekt||"", r.kategori||"", r.beskrivning||""].join(" ").toLowerCase();
    return hay.includes(q);
  });
  const tb=$("searchRows"); const tf=$("searchTotals");
  tb.innerHTML="";
  let sumTid=0,sumKort=0;
  rows.forEach(r=>{
    sumTid+=Number(r.tid)||0; sumKort+=Number(r.kortid)||0;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${r.datum}</td><td>${escapeHtml(r.projekt||"")}</td><td>${r.kategori}</td><td>${fmtBlankZero(r.tid)}</td><td>${fmtBlankZero(r.kortid)}</td><td>${escapeHtml(r.beskrivning||"")}</td>`;
    tb.appendChild(tr);
  });
  if(tf) tf.textContent = `${rows.length} rader — Tid: ${fmtBlankZero(sumTid)} | Körtid: ${fmtBlankZero(sumKort)}`;
  window.__lastSearchResults = rows;
};
window.exportSearchCsv=()=>{
  const rows = window.__lastSearchResults || [];
  const header = "sep=;\r\nSökresultat;;;;\r\n\r\n";
  const cols = CSV_COLS.join(";")+"\r\n";
  const lines = rows.map(r=>{
    const cat=r.kategori||"";
    const V=want=>fmtExport(cat===want ? r.tid : "");
    return [
      r.datum,
      V("Ordinarie tid"),
      fmtExport(r.kortid),
      csvEscape(r.projekt||""),
      V("Semester-tim"),V("ATF-tim"),V("Sjuk-tim"),V("Föräldraledig"),
      V("VAB"),V("Flextid"),V("Övertid <2"),V("Övertid 2>"),
      V("Övertid-Helg"),V("Traktamente"),
      csvEscape(r.beskrivning||"")
    ].join(";");
  }).join("\r\n");
  const blob = window.__makeBlobCSV(header+cols+lines+"\r\n");
  window.__download(`tidrapport_sok_${state.settings.year}.csv`, blob);
};
async function tryShareOrDownload(filename, blob, title){
  if (navigator.canShare && navigator.canShare({files:[new File([blob], filename, {type: blob.type})]})) {
    try { const file = new File([blob], filename, {type: blob.type}); await navigator.share({title, files:[file]}); return true; } catch (e) {}
  }
  window.__download(filename, blob);
  alert("Delning stöds inte här – filen laddades ner istället.");
  return false;
}
window.shareSearchCsv=async()=>{
  const rows = window.__lastSearchResults || [];
  const header = "sep=;\r\nSökresultat;;;;\r\n\r\n";
  const cols = CSV_COLS.join(";")+"\r\n";
  const lines = rows.map(r=>{
    const cat=r.kategori||"";
    const V=want=>fmtExport(cat===want ? r.tid : "");
    return [
      r.datum,
      V("Ordinarie tid"),
      fmtExport(r.kortid),
      csvEscape(r.projekt||""),
      V("Semester-tim"),V("ATF-tim"),V("Sjuk-tim"),V("Föräldraledig"),
      V("VAB"),V("Flextid"),V("Övertid <2"),V("Övertid 2>"),
      V("Övertid-Helg"),V("Traktamente"),
      csvEscape(r.beskrivning||"")
    ].join(";");
  }).join("\r\n");
  const blob = window.__makeBlobCSV(header+cols+lines+"\r\n");
  await tryShareOrDownload(`tidrapport_sok_${state.settings.year}.csv`, blob, "Tidrapport – Sökresultat");
};

// ===== App-actions för Ändra/Ta bort =====
window.APP={
  editRow:(id,m)=>{
    const row=(state.data[m]||[]).find(r=>r._id===id); if(!row) return;
    enterEditMode(row,m);
    const set=(id,val)=>{ if($(id)) $(id).value=val; };
    set("datum",row.datum); set("tid",row.tid); set("projekt",row.projekt); set("kortid",row.kortid); set("beskrivning",row.beskrivning);
    const kat=$("kategori"); if(kat) kat.value=row.kategori;
  },
  delRow:(id,m)=>{
    if(!confirm("Radera raden?")) return;
    const list=state.data[m]||[]; const idx=list.findIndex(r=>r._id===id);
    if(idx>-1){ list.splice(idx,1); saveData(); renderAll(); }
  }
};

// ===== Init =====
function onReady(){
  for(let m=1;m<=12;m++) ensureMonth(m);
  renderAll();
  performSearch(); // init tom lista
  initMenu();
}
document.addEventListener("DOMContentLoaded", onReady);

})();