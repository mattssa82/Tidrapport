// ===== Export.js =====
// Hanterar CSV, PDF, och Dela-funktioner
(()=>{

const monthsSv=["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"];
const CSV_COLS=["Datum","Ordinarie tid","Körtid","Projekt","Semester-tim","ATF-tim","Sjuk-tim","Föräldraledig","VAB","Flextid","Övertid <2","Övertid 2>","Övertid-Helg","Traktamente","Beskrivning"];

function fmtExport(n){if(n==null||n==="")return"";const v=Number(String(n).replace(",", "."));if(!Number.isFinite(v)||v===0)return"";return v.toString().replace(".", ",");}
function csvEscape(s){s=s==null?"":String(s).replace(/\r?\n/g," ");if(/[";]/.test(s))s='"'+s.replace(/"/g,'""')+'"';return s;}
function download(name,blob){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);}
function makeBlobCSV(text){const s=(text||"").normalize("NFC");const bom=new Uint8Array([0xFF,0xFE]);const buf=new Uint8Array(bom.length+s.length*2);
  bom.forEach((b,i)=>buf[i]=b);for(let i=0;i<s.length;i++){const code=s.charCodeAt(i);buf[bom.length+i*2]=code&0xFF;buf[bom.length+i*2+1]=(code>>8)&0xFF;}
  return new Blob([buf],{type:"text/csv;charset=utf-16le"});
}

// ===== CSV BYGGARE =====
window.buildCombinedCsv=(scope)=>{
  const months = scope==="year" ? Array.from({length:12},(_,i)=>i+1) : [state.month];
  const header=`sep=;\r\nTidrapport;;;;\r\nFöretag;${state.settings.company}\r\nNamn;${state.settings.name}\r\nAnst-nr;${state.settings.emp}\r\nÅr;${state.settings.year}\r\n`+
               (scope==="month"?`Månad;${monthsSv[state.month-1]}\r\n`:"")+"\r\n";

  const lines=[header,`### RADER (${scope==="year"?"år":"månad"})\r\n`,CSV_COLS.join(";")];
  const sorted=[];
  months.forEach(m=>{(state.data[m]||[]).filter(r=>new Date(r.datum).getFullYear()==state.settings.year)
    .forEach(r=>sorted.push({...r,_m:m}));});
  sorted.sort((a,b)=>a.datum.localeCompare(b.datum));
  sorted.forEach(r=>{
    const cat=r.kategori||"";
    const V=w=>fmtExport(cat===w?r.tid:"");
    const row=[r.datum,V("Ordinarie tid"),fmtExport(r.kortid),csvEscape(r.projekt),
      V("Semester-tim"),V("ATF-tim"),V("Sjuk-tim"),V("Föräldraledig"),
      V("VAB"),V("Flextid"),V("Övertid <2"),V("Övertid 2>"),V("Övertid-Helg"),V("Traktamente"),csvEscape(r.beskrivning)];
    lines.push(row.join(";"));
  });

  lines.push("");return lines.join("\r\n");
};

// ===== Exportfunktioner =====
window.exportMonthReport=()=>{const text=buildCombinedCsv("month");download(`tidrapport_${state.settings.year}_${String(state.month).padStart(2,"0")}_manadsrapport.csv`,makeBlobCSV(text));};
window.exportYearReportCombined=()=>{const text=buildCombinedCsv("year");download(`tidrapport_${state.settings.year}_arsrapport.csv`,makeBlobCSV(text));};

async function tryShareOrDownload(filename,blob,title){
  if(navigator.canShare&&navigator.canShare({files:[new File([blob],filename,{type:blob.type})]})){
    try{await navigator.share({title,files:[new File([blob],filename,{type:blob.type})]});return true;}catch(e){}
  }
  download(filename,blob);
  alert("Delning stöds inte här – filen laddades ner istället.");return false;
}

// ===== PDF Export =====
window.makePdf=(scope)=>{
  const { jsPDF } = window.jspdf;
  const doc=new jsPDF({orientation:"landscape",unit:"pt",format:"a3"});
  const pageW=doc.internal.pageSize.getWidth(),margin=40,lineH=16;
  let y=margin;
  const wrap=t=>doc.splitTextToSize(t,pageW-margin*2);
  const write=t=>{if(y>800){doc.addPage();y=margin;}wrap(t).forEach(l=>{doc.text(l,margin,y);y+=lineH;});};
  const title=scope==="year"?`Årsrapport ${state.settings.year}`:`Månadsrapport ${monthsSv[state.month-1]} ${state.settings.year}`;
  doc.setFont("helvetica","bold");doc.setFontSize(14);write(`Tidrapport — ${title}`);doc.setFont("helvetica","normal");doc.setFontSize(10);y+=10;
  buildCombinedCsv(scope).split("\r\n").forEach(l=>write(l));
  return doc.output("blob");
};

window.shareMonthPdfEmail=async()=>{const blob=makePdf("month");await tryShareOrDownload(`Tidrapport_${state.settings.year}_${String(state.month).padStart(2,"0")}.pdf`,blob,"Tidrapport – Månadsrapport (PDF)");};
window.shareYearPdfEmail=async()=>{const blob=makePdf("year");await tryShareOrDownload(`Tidrapport_${state.settings.year}.pdf`,blob,"Tidrapport – Årsrapport (PDF)");};

// ===== Export av sökresultat =====
window.exportSearchResults=(results)=>{
  if(!results||!results.length)return alert("Inga träffar.");
  const lines=[`sep=;\r\nTidrapport – Sökresultat;;;;\r\n${CSV_COLS.join(";")}`];
  results.forEach(r=>{
    const row=[r.datum,fmtExport(r.tid),fmtExport(r.kortid),csvEscape(r.projekt||""),csvEscape(r.beskrivning||"")];
    lines.push(row.join(";"));
  });
  const text=lines.join("\r\n");
  download(`tidrapport_search_${Date.now()}.csv`,makeBlobCSV(text));
};

})();