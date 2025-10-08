// Export & PDF (använder byggare från app.js)
function buildCombinedCsv(scope){ return window.__buildCombinedCsv(scope); }
function makeBlobCSV(text){ return window.__makeBlobCSV(text); }
function download(name,blob){ return window.__download(name,blob); }

window.exportMonthReport=()=>{ 
  const text=buildCombinedCsv("month"); 
  const y=window.state?.settings?.year ?? JSON.parse(localStorage.getItem("tidrapport_settings_v11")||"{}").year || new Date().getFullYear();
  const mState=window.state?.month || (new Date().getMonth()+1);
  const m=String(mState).padStart(2,"0"); 
  download(`tidrapport_${y}_${m}_manadsrapport.csv`, makeBlobCSV(text)); 
};
window.exportYearReportCombined=()=>{ 
  const text=buildCombinedCsv("year"); 
  const y=window.state?.settings?.year ?? JSON.parse(localStorage.getItem("tidrapport_settings_v11")||"{}").year || new Date().getFullYear();
  download(`tidrapport_${y}_arsrapport.csv`, makeBlobCSV(text)); 
};

// PDF (A4 landscape med monospace)
window.shareMonthPdfEmail=async()=>{
  const blob=makePdf("month"); 
  const y=window.state?.settings?.year ?? new Date().getFullYear();
  const mState=window.state?.month || (new Date().getMonth()+1);
  const m=String(mState).padStart(2,"0");
  await tryShareOrDownload(`Tidrapport_${y}_${m}.pdf`, blob, "Tidrapport – Månadsrapport (PDF)");
};
window.shareYearPdfEmail=async()=>{
  const blob=makePdf("year");
  const y=window.state?.settings?.year ?? new Date().getFullYear();
  await tryShareOrDownload(`Tidrapport_${y}.pdf`, blob, "Tidrapport – Årsrapport (PDF)");
};

function makePdf(scope){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:"landscape", unit:"pt", format:"a4"});
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const lineH = 12;
  const mono = "courier";

  let y = margin + 8;
  const wrap = (txt)=> doc.splitTextToSize(txt, pageW - margin*2);
  const writeLine = (txt, opts={})=>{
    if(y > pageH - margin){ doc.addPage(); y = margin + 8; }
    doc.setFont(mono, opts.bold ? "bold" : "normal");
    doc.text(txt, margin, y);
    y += lineH;
  };

  // header
  const settings = JSON.parse(localStorage.getItem("tidrapport_settings_v11")||"{}");
  const monthsSv=["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"];
  const selMonth = (window.state?.month || (new Date().getMonth()+1)) - 1;

  const title = scope==="year"
    ? `Årsrapport ${settings.year||new Date().getFullYear()}`
    : `Månadsrapport ${monthsSv[selMonth]} ${settings.year||new Date().getFullYear()}`;

  doc.setFont(mono,"bold"); doc.setFontSize(13);
  writeLine(`Tidrapport — ${title}`);
  doc.setFont(mono,"normal"); doc.setFontSize(9);

  // metadata
  const headerInfo = window.__buildCombinedCsv ? window.__buildCombinedCsv("meta_dummy") : "";
  // Vi skriver egna rader med settings
  const meta = [
    `Företag: ${settings.company||""}`,
    `Namn: ${settings.name||""}`,
    `Anst-Nr: ${settings.emp||""}`,
    `Ägar-ID: ${settings.owner||""}`,
    `År: ${settings.year||new Date().getFullYear()}`
  ].join(" | ");
  writeLine(meta); y+=6;

  // RADER
  writeLine(`### RADER (${scope==="year"?"år":"månad"})`,{bold:true});
  const rows = (scope==="year" ? window.__buildRowsSection("year") : window.__buildRowsSection("month")).split("\r\n");
  rows.forEach(row=>{ if(!row) return; wrap(row).forEach(line=>writeLine(line)); });
  y+=10;

  // PER PROJEKT
  writeLine(`### SUMMERING PER PROJEKT (${scope==="year"?"år":"månad"})`,{bold:true});
  const proj = (scope==="year" ? window.__buildProjectSection("year") : window.__buildProjectSection("month")).split("\r\n");
  proj.forEach(row=>{ if(!row) return; wrap(row).forEach(line=>writeLine(line)); });

  return doc.output("blob");
}

// share fallback
async function tryShareOrDownload(filename, blob, title){
  if (navigator.canShare && navigator.canShare({files:[new File([blob], filename, {type: blob.type})]})) {
    try { const file = new File([blob], filename, {type: blob.type}); await navigator.share({title, files:[file]}); return true; } catch (e) {}
  }
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  alert("Delning stöds inte här – filen laddades ner istället.");
  return false;
}