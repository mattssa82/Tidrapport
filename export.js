/* ========= export.js =========
   Hanterar export till CSV (UTF-16 BOM) och PDF (A3)
   Integrerad med Tidrapport v5-A3
================================ */

function exportMonthCSVFile(){
  const month=currentMonth();
  const rows=DATA.filter(r=>r.date.startsWith(month));
  if(rows.length===0){alert("Ingen data denna månad.");return;}
  let csv="Datum\tKategori\tTimmar\tKörtid\tProjekt\tBeskrivning\r\n";
  rows.forEach(r=>{
    csv+=`${r.date}\t${r.category}\t${r.hours}\t${r.drive}\t${r.project}\t${r.desc}\r\n`;
  });
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-16le;"});
  const a=document.createElement("a");
  const fname=`${SETTINGS.username||"tidrapport"}_${month}.csv`;
  a.href=URL.createObjectURL(blob);
  a.download=fname;
  a.click();
}

function exportYearCSVFile(){
  const year=SETTINGS.year||new Date().getFullYear();
  const rows=DATA.filter(r=>r.date.startsWith(year));
  if(rows.length===0){alert("Ingen data för året.");return;}
  let csv="Datum\tKategori\tTimmar\tKörtid\tProjekt\tBeskrivning\r\n";
  rows.forEach(r=>{
    csv+=`${r.date}\t${r.category}\t${r.hours}\t${r.drive}\t${r.project}\t${r.desc}\r\n`;
  });
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-16le;"});
  const a=document.createElement("a");
  const fname=`${SETTINGS.username||"tidrapport"}_${year}_arsrapport.csv`;
  a.href=URL.createObjectURL(blob);
  a.download=fname;
  a.click();
}

/* ========= PDF (A3 liggande) ========= */
function exportMonthPDFFile(){
  const { jsPDF } = window.jspdf;
  const month=currentMonth();
  const rows=DATA.filter(r=>r.date.startsWith(month));
  if(rows.length===0){alert("Ingen data denna månad.");return;}

  const pdf=new jsPDF({orientation:"landscape",format:"a3"});
  pdf.setFont("helvetica","normal");
  pdf.setFontSize(14);
  pdf.text(`Tidrapport - ${month}`, 20, 20);
  pdf.setFontSize(10);

  let y=35;
  pdf.text("Datum",20,y); pdf.text("Kategori",55,y);
  pdf.text("Timmar",110,y); pdf.text("Körtid",140,y);
  pdf.text("Projekt",170,y); pdf.text("Beskrivning",220,y);

  y+=10;
  rows.forEach(r=>{
    if(y>190){ pdf.addPage(); y=30; }
    pdf.text(r.date,20,y);
    pdf.text(r.category,55,y);
    pdf.text(String(r.hours),110,y);
    pdf.text(String(r.drive),140,y);
    pdf.text(r.project||"-",170,y);
    pdf.text(r.desc||"-",220,y);
    y+=8;
  });

  pdf.save(`${SETTINGS.username||"tidrapport"}_${month}.pdf`);
}

function exportYearPDFFile(){
  const { jsPDF } = window.jspdf;
  const year=SETTINGS.year||new Date().getFullYear();
  const rows=DATA.filter(r=>r.date.startsWith(year));
  if(rows.length===0){alert("Ingen data för året.");return;}

  const pdf=new jsPDF({orientation:"landscape",format:"a3"});
  pdf.setFont("helvetica","normal");
  pdf.setFontSize(14);
  pdf.text(`Årsrapport ${year}`,20,20);
  pdf.setFontSize(10);

  let y=35;
  pdf.text("Datum",20,y); pdf.text("Kategori",55,y);
  pdf.text("Timmar",110,y); pdf.text("Körtid",140,y);
  pdf.text("Projekt",170,y); pdf.text("Beskrivning",220,y);

  y+=10;
  rows.forEach(r=>{
    if(y>190){ pdf.addPage(); y=30; }
    pdf.text(r.date,20,y);
    pdf.text(r.category,55,y);
    pdf.text(String(r.hours),110,y);
    pdf.text(String(r.drive),140,y);
    pdf.text(r.project||"-",170,y);
    pdf.text(r.desc||"-",220,y);
    y+=8;
  });

  pdf.save(`${SETTINGS.username||"tidrapport"}_${year}.pdf`);
}