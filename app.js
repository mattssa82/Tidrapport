// ===== Utils & konstanter =====
const monthsSv=["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"];
const csvCols=["Datum","Ordinarie tid","Körtid","Projekt nr","Semester-tim","ATF-tim","Sjuk-tim","Föräldraledig","VAB","Flextid","Övertid <2","Övertid 2>","Övertid-Helg","Traktamente","Beskrivning"];
const STORAGE="tidrapport_data_v10";
const SETTINGS="tidrapport_settings_v10";
const $=id=>document.getElementById(id);
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const fmt = n => {
  if(n==null||isNaN(n)) return "";
  return (Math.round(n*100)/100).toLocaleString("sv-SE",{minimumFractionDigits:0, maximumFractionDigits:2});
};

// Visa tomt istället för 0
const fmtBlankZero = n => {
  const v = Number(n) || 0;
  return v === 0 ? "" : fmt(v);
};

function ownerPrefix(){ const o=(state.settings.owner||"").trim(); return o? (o.replace(/\s+/g,"_")+"_"):""; }

// ===== State =====
let state={month:(new Date().getMonth()+1), data:load(STORAGE,{}), settings:load(SETTINGS,defSettings())};
function defSettings(){return{company:"",name:"",emp:"",owner:"",year:new Date().getFullYear(),note:"",autoBackup:true,holidays:true}}
function load(k,def){try{const v=JSON.parse(localStorage.getItem(k));return v??def}catch(_){return def}}
function save(){ localStorage.setItem(STORAGE,JSON.stringify(state.data)); }
function saveCfg(){ localStorage.setItem(SETTINGS,JSON.stringify(state.settings)); }
function ensureMonth(m){if(!state.data[m]) state.data[m]=[]}
const escapeHtml=s=>(s||"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

// ===== Meny =====
window.toggleMenu=(open)=>{const el=$("menu");const ov=$("menuOverlay");if(!el) return;el.classList.toggle("open",open);ov.classList.toggle("show",open);if(open) initMenu();}
function initMenu(){
  const sel=$("menuMonth"); 
  if(sel){
    sel.innerHTML=""; 
    monthsSv.forEach((n,i)=>{ 
      const o=document.createElement("option");
      o.value=i+1;
      o.textContent=cap(n); 
      if(i+1===state.month) o.selected=true; 
      sel.appendChild(o);
    });
  }
  $("cfgCompany").value=state.settings.company||"";
  $("cfgName").value=state.settings.name||"";
  $("cfgEmp").value=state.settings.emp||"";
  $("cfgOwner").value=state.settings.owner||"";
  $("cfgYear").value=state.settings.year||"";
  $("cfgNote").value=state.settings.note||"";
  $("cfgAutoBackup").checked=state.settings.autoBackup!==false;
}
window.changeMonth=()=>{state.month=Number($("menuMonth").value); renderAll(); toggleMenu(false)}

// ===== Settings =====
window.saveSettings=()=>{
  state.settings.company=$("cfgCompany").value;
  state.settings.name=$("cfgName").value;
  state.settings.emp=$("cfgEmp").value;
  state.settings.owner=$("cfgOwner").value.trim();
  state.settings.year=Number($("cfgYear").value)||new Date().getFullYear();
  state.settings.note=$("cfgNote").value;
  state.settings.autoBackup=$("cfgAutoBackup").checked;
  saveCfg(); renderAll();
};
window.resetAll=()=>{
  if (!confirm("⚠️ Detta tar bort all data. Fortsätta?")) return;
  state.data={};for(let m=1;m<=12;m++)ensureMonth(m);
  save();renderAll();
};

// ===== Input helpers =====
function normMinus(s){return (s||"").replace(/[–—−]/g,"-")}
function toNumRaw(s){ if(s==null) return NaN; s=normMinus((""+s).replace(/\s+/g,"")).replace(",","."); if(!/^[-]?\d*(\.\d+)?$/.test(s)) return NaN; return s===""?NaN:parseFloat(s); }
function roundQuarter(n){return Math.round(n*4)/4}
function parseHourInput(v,allowEmpty=false){ if(allowEmpty&&(v===""||v==null)) return 0; const n=toNumRaw(v); if(isNaN(n)) return NaN; return roundQuarter(n); }
function sanitizeProject(s){ s=(s||"").normalize("NFC").replace(/\s+/g,""); s=s.replace(/[^0-9A-Za-zÅÄÖåäö]/g,""); return s; }

// ===== Add/Edit/Delete =====
const btnAdd=$("btnAdd");const btnCancel=$("btnCancel");const btnBackup=$("btnBackup");
btnAdd.addEventListener("click", () => {
  const d=$("datum").value;if(!d){alert("Välj datum.");return;}
  const k=$("kategori").value;
  const t=parseHourInput($("tid").value);if(isNaN(t)){alert("Ogiltig Tid.");return;}
  const p=sanitizeProject($("projekt").value);
  const kt=parseHourInput($("kortid").value,true);if(isNaN(kt)){alert("Ogiltig Körtid.");return;}
  const b=$("beskrivning").value||"";
  const m=(new Date(d)).getMonth()+1;ensureMonth(m);

  if(editing){
    const list=state.data[editing.month]||[];const idx=list.findIndex(r=>r._id===editing.id);
    if(idx!==-1){
      list[idx]={...list[idx],datum:d,kategori:k,tid:t,projekt:p,kortid:kt,beskrivning:b};
      if(editing.month!==m){const row=list.splice(idx,1)[0];ensureMonth(m);state.data[m].push(row);state.month=m;}
      save();
    }
    exitEditMode();renderAll();
  }else{
    state.data[m].push({_id:uid(),datum:d,kategori:k,tid:t,projekt:p,kortid:kt,beskrivning:b});
    save();clearInputs();state.month=m;renderAll();
  }
});
btnCancel.addEventListener("click", ()=>{exitEditMode();clearInputs();});
btnBackup.addEventListener("click", ()=>{exportJSON();});

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
let editing=null;
function enterEditMode(row,month){editing={id:row._id,month};btnAdd.textContent="Spara";btnCancel.style.display="";}
function exitEditMode(){editing=null;btnAdd.textContent="Lägg till";btnCancel.style.display="none";}
function clearInputs(){["datum","tid","projekt","kortid","beskrivning"].forEach(id=>$(id).value="");$("kategori").selectedIndex=0;}

// ===== Helg & röda dagar =====
function easterSunday(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;return new Date(y,Math.floor(n/31)-1,(n%31)+1)}
function addDays(date,days){const d=new Date(date);d.setDate(d.getDate()+days);return d}
function swedishHolidays(y){
  const H=new Map();const add=(d,name)=>H.set(d.toISOString().slice(0,10),name);
  add(new Date(y,0,1),"Nyårsdagen");add(new Date(y,0,6),"Trettondedag jul");add(new Date(y,4,1),"Första maj");
  add(new Date(y,5,6),"Sveriges nationaldag");add(new Date(y,11,25),"Juldagen");add(new Date(y,11,26),"Annandag jul");
  const eas=easterSunday(y);add(addDays(eas,-2),"Långfredagen");add(addDays(eas,1),"Annandag påsk");add(addDays(eas,39),"Kristi himmelsfärdsdag");
  let mid=new Date(y,5,20);while(mid.getDay()!=6) mid=addDays(mid,1);add(mid,"Midsommardagen");
  let saints=new Date(y,9,31);while(saints.getDay()!=6) saints=addDays(saints,1);add(saints,"Alla helgons dag");
  return H;
}
// ===== Render =====
function yearFilter(r){return (new Date(r.datum)).getFullYear()===(Number(state.settings.year)||new Date().getFullYear());}
function calcMonthTotals(m){
  ensureMonth(m);const res={_kortid:0,"Traktamente":0};
  (state.data[m]||[]).filter(yearFilter).forEach(r=>{
    res[r.kategori]=(res[r.kategori]||0)+Number(r.tid||0);
    res._kortid+=Number(r.kortid||0);
  });
  return res;
}
function renderTable(){
  const m=state.month;ensureMonth(m);const y=state.settings.year;
  $("monthTitle").textContent=`Tidrapport för ${cap(monthsSv[m-1])} ${y}`;
  const tb=$("rows");tb.innerHTML="";
  const rows=[...(state.data[m]||[]).filter(yearFilter)].sort((a,b)=>a.datum.localeCompare(b.datum));
  const daySum={};rows.forEach(r=>{daySum[r.datum]=(daySum[r.datum]||0)+Number(r.tid||0)});
  const H= state.settings.holidays!==false?swedishHolidays(y):new Map();

  rows.forEach((r)=>{
    const tr=document.createElement("tr");
    const d=new Date(r.datum);const dow=d.getDay();const iso=r.datum;
    const isWeekend=(dow===0||dow===6);const isHoliday=H.has(iso);
    if(isWeekend) tr.classList.add("weekend");
    if(isHoliday) tr.classList.add("holiday");
    if(!isWeekend&&!isHoliday&&(daySum[r.datum]||0)<8) tr.classList.add("warn");
    tr.innerHTML=`<td>${r.datum}</td><td>${escapeHtml(r.projekt||"")}</td><td>${r.kategori}</td>
      <td>${fmt(r.tid)}</td><td>${fmt(r.kortid)}</td><td>${escapeHtml(r.beskrivning||"")}</td>
      <td class="actions">
        <button class="btn ghost" onclick="APP.editRow('${r._id}', ${m})">Ändra</button>
        <button class="btn danger" onclick="APP.delRow('${r._id}', ${m})">Ta bort</button>
      </td>`;
    tb.appendChild(tr);
  });

  const t=calcMonthTotals(m);
  $("totalsCell").textContent=
    `Summering — Ordinarie: ${fmt(t["Ordinarie tid"]||0)} | Semester: ${fmt(t["Semester-tim"]||0)} | ATF: ${fmt(t["ATF-tim"]||0)} | `+
    `Sjuk: ${fmt(t["Sjuk-tim"]||0)} | Föräldraledig: ${fmt(t["Föräldraledig"]||0)} | VAB: ${fmt(t["VAB"]||0)} | Flextid: ${fmt(t["Flextid"]||0)} | `+
    `ÖT<2: ${fmt(t["Övertid <2"]||0)} | ÖT2>: ${fmt(t["Övertid 2>"]||0)} | ÖT-Helg: ${fmt(t["Övertid-Helg"]||0)} | Traktamente: ${fmt(t["Traktamente"]||0)} | `+
    `Körtid: ${fmt(t._kortid||0)}`;

  renderYear();renderAlarms();initMenu();
}
function renderYear(){
  const tb=$("yearBody");tb.innerHTML="";
  for(let m=1;m<=12;m++){
    const t=calcMonthTotals(m);
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${cap(monthsSv[m-1])}</td>
      <td>${fmt(t["Ordinarie tid"]||0)}</td><td>${fmt(t["Semester-tim"]||0)}</td><td>${fmt(t["ATF-tim"]||0)}</td>
      <td>${fmt(t["Sjuk-tim"]||0)}</td><td>${fmt(t["Föräldraledig"]||0)}</td><td>${fmt(t["VAB"]||0)}</td><td>${fmt(t["Flextid"]||0)}</td>
      <td>${fmt(t["Övertid <2"]||0)}</td><td>${fmt(t["Övertid 2>"]||0)}</td><td>${fmt(t["Övertid-Helg"]||0)}</td>
      <td>${fmt(t["Traktamente"]||0)}</td><td>${fmt(t._kortid||0)}</td>`;
    tb.appendChild(tr);
  }
  const yl=$("yearLinks");yl.innerHTML="";
  monthsSv.forEach((n,i)=>{const b=document.createElement("button");b.className="btn ghost";b.textContent=cap(n);b.onclick=()=>{state.month=i+1;renderAll();scrollTo({top:0,behavior:"smooth"});};yl.appendChild(b);});
}
function renderAlarms(){
  const m=state.month;ensureMonth(m);
  const y=state.settings.year||new Date().getFullYear();
  const H= state.settings.holidays!==false?swedishHolidays(y):new Map();
  const map={};
  (state.data[m]||[]).filter(yearFilter).forEach(r=>{const d=r.datum;map[d]=(map[d]||0)+Number(r.tid||0);});
  const last=new Date(y,m,0).getDate();
  const lines=[];
  for(let d=1;d<=last;d++){
    const iso=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dow=new Date(iso).getDay();
    const isWeekend=(dow===0||dow===6);const isHoliday=H.has(iso);
    const sum=map[iso]||0;
    let cls="",label="";
    if(isHoliday){cls="rose";label=`Röd dag (${H.get(iso)})`;}
    else if(isWeekend){cls="blue";label="Helg";}
    else if(map[iso]==null){cls="red";label="Saknas";}
    else if(sum<8){cls="orange";label=`Under 8h (${fmt(sum)}h)`;}
    else {cls="green";label=`OK (${fmt(sum)}h)`;}
    lines.push(`<div class="pill ${cls}"><span class="dot"></span><span>${iso} — ${label}</span></div>`);
  }
  $("alarms").innerHTML=lines.length?`<div class="pills">${lines.join("")}</div>`:"Inga varningar.";
}
function renderAll(){renderTable()}

// ===== CSV/Export/Import helpers =====
const FILL_ZERO=false;
const csvEscape=s=>{s=s==null?"":String(s).replace(/\r?\n/g," ");if(/[";]/.test(s))s='"'+s.replace(/"/g,'""')+'"';return s;}
function csvHeaderRow(){return csvCols.join(";")}
function sortedRows(months){
  const out=[];months.forEach(m=>{ensureMonth(m);(state.data[m]||[]).filter(yearFilter).forEach(r=>out.push({...r,_m:m}))});
  out.sort((a,b)=>a.datum.localeCompare(b.datum));return out;
}
function headerInfo(scope){
  const y=state.settings.year,m=state.month;
  const parts=["sep=;","Tidrapport;;;;",`Företag;${state.settings.company||""};;;;`,`Namn;${state.settings.name||""};;;;`,`Anst-Nr;${state.settings.emp||""};;;;`];
  if(state.settings.owner) parts.push(`Ägar-ID;${state.settings.owner};;;;`);
  parts.push(`År;${y};;;;`);
  if(scope==="month") parts.push(`Månad;${cap(monthsSv[m-1])};;;;`);
  if(state.settings.note&&state.settings.note.trim()) parts.push(`Notering;${state.settings.note.replace(/\r?\n/g," ")}`);
  parts.push("");return parts.join("\r\n");
}
function buildRowsSection(scope){
  const months=scope==="year"?Array.from({length:12},(_,i)=>i+1):[state.month];
  const lines=[`### RADER (${scope==="year"?"år":"månad"})`,csvHeaderRow()];
  sortedRows(months).forEach(r=>{
    const cat=r.kategori||"";const val=want=>(cat===want?fmt(r.tid):(FILL_ZERO?"0":""));
    const row=[r.datum,val("Ordinarie tid"),fmtBlankZero(r.kortid||0),csvEscape(r.projekt||""),val("Semester-tim"),val("ATF-tim"),val("Sjuk-tim"),val("Föräldraledig"),val("VAB"),val("Flextid"),val("Övertid <2"),val("Övertid 2>"),val("Övertid-Helg"),val("Traktamente"),csvEscape(r.beskrivning||"")];
    lines.push(row.join(";"));
  });

  // Summeringsrad för månad
  if(scope==="month"){
    const sum={};
    sortedRows([state.month]).forEach(r=>{
      const cat=r.kategori||"";
      const add=(k,v)=>sum[k]=(sum[k]||0)+(Number(v)||0);
      if(cat==="Ordinarie tid")add("Ordinarie tid",r.tid);
      if(r.kortid)add("Körtid",r.kortid);
      if(cat==="Semester-tim")add("Semester-tim",r.tid);
      if(cat==="ATF-tim")add("ATF-tim",r.tid);
      if(cat==="Sjuk-tim")add("Sjuk-tim",r.tid);
      if(cat==="Föräldraledig")add("Föräldraledig",r.tid);
      if(cat==="VAB")add("VAB",r.tid);
      if(cat==="Flextid")add("Flextid",r.tid);
      if(cat==="Övertid <2")add("Övertid <2",r.tid);
      if(cat==="Övertid 2>")add("Övertid 2>",r.tid);
      if(cat==="Övertid-Helg")add("Övertid-Helg",r.tid);
      if(cat==="Traktamente")add("Traktamente",r.tid);
    });
    const monthName=monthsSv[state.month-1].slice(0,3);
    const sumRow=[
      `SUMMA (${monthName})`,
      fmtBlankZero(sum["Ordinarie tid"]||0),
      fmtBlankZero(sum["Körtid"]||0),
      "",
      fmtBlankZero(sum["Semester-tim"]||0),
      fmtBlankZero(sum["ATF-tim"]||0),
      fmtBlankZero(sum["Sjuk-tim"]||0),
      fmtBlankZero(sum["Föräldraledig"]||0),
      fmtBlankZero(sum["VAB"]||0),
      fmtBlankZero(sum["Flextid"]||0),
      fmtBlankZero(sum["Övertid <2"]||0),
      fmtBlankZero(sum["Övertid 2>"]||0),
      fmtBlankZero(sum["Övertid-Helg"]||0),
      fmtBlankZero(sum["Traktamente"]||0),
      ""
    ];
    lines.push(sumRow.join(";"));
  }

  // Summeringsrad för år
  if(scope==="year"){
    const sum={};
    sortedRows(months).forEach(r=>{
      const cat=r.kategori||"";
      const add=(k,v)=>sum[k]=(sum[k]||0)+(Number(v)||0);
      if(cat==="Ordinarie tid")add("Ordinarie tid",r.tid);
      if(r.kortid)add("Körtid",r.kortid);
      if(cat==="Semester-tim")add("Semester-tim",r.tid);
      if(cat==="ATF-tim")add("ATF-tim",r.tid);
      if(cat==="Sjuk-tim")add("Sjuk-tim",r.tid);
      if(cat==="Föräldraledig")add("Föräldraledig",r.tid);
      if(cat==="VAB")add("VAB",r.tid);
      if(cat==="Flextid")add("Flextid",r.tid);
      if(cat==="Övertid <2")add("Övertid <2",r.tid);
      if(cat==="Övertid 2>")add("Övertid 2>",r.tid);
      if(cat==="Övertid-Helg")add("Övertid-Helg",r.tid);
      if(cat==="Traktamente")add("Traktamente",r.tid);
    });
    const yearNum=state.settings.year;
    const sumRow=[
      `SUMMA (${yearNum})`,
      fmtBlankZero(sum["Ordinarie tid"]||0),
      fmtBlankZero(sum["Körtid"]||0),
      "",
      fmtBlankZero(sum["Semester-tim"]||0),
      fmtBlankZero(sum["ATF-tim"]||0),
      fmtBlankZero(sum["Sjuk-tim"]||0),
      fmtBlankZero(sum["Föräldraledig"]||0),
      fmtBlankZero(sum["VAB"]||0),
      fmtBlankZero(sum["Flextid"]||0),
      fmtBlankZero(sum["Övertid <2"]||0),
      fmtBlankZero(sum["Övertid 2>"]||0),
      fmtBlankZero(sum["Övertid-Helg"]||0),
      fmtBlankZero(sum["Traktamente"]||0),
      ""
    ];
    lines.push(sumRow.join(";"));
  }

  lines.push("");
  return lines.join("\r\n");
}
function buildCombinedCsv(scope){return headerInfo(scope)+buildRowsSection(scope);}

// ----- Blob helpers -----
function makeBlobCSV(text){
  const s=(text||"").normalize("NFC");
  const bom=new Uint8Array([0xFF,0xFE]);
  const buf=new Uint8Array(bom.length+s.length*2);
  bom.forEach((b,i)=>buf[i]=b);
  for(let i=0;i<s.length;i++){const code=s.charCodeAt(i);buf[bom.length+i*2]=code&0xFF;buf[bom.length+i*2+1]=(code>>8)&0xFF;}
  return new Blob([buf],{type:"text/csv;charset=utf-16le"});
}
function dl(name,blob){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}

// ===== Export / Dela (CSV) =====
window.exportMonthReport=()=>{
  const text=buildCombinedCsv("month");
  const y=state.settings.year,m=String(state.month).padStart(2,"0");
  dl(`${ownerPrefix()}tidrapport_${y}_${m}_manadsrapport.csv`,makeBlobCSV(text));
};
window.exportYearReportCombined=()=>{
  const text=buildCombinedCsv("year");
  const y=state.settings.year;
  dl(`${ownerPrefix()}tidrapport_${y}_arsrapport.csv`,makeBlobCSV(text));
};