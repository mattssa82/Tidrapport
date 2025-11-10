// export.js - Tidrapport v10.18
// Exporterar månad (CSV/PDF) och årsöversikt (CSV).

"use strict";

(function(){

  window.exportCSVImpl = function(rows, settings, year, month){
    try{
      const y = Number(year), m = Number(month);
      const useRows = rows.filter(r=>{
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear()===y && (d.getMonth()+1)===m;
      });

      const header = [
        "Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"
      ];
      const csv = [header.join(";")];

      useRows.forEach(r=>{
        csv.push([
          r.datum||"",
          r.projekt||"",
          r.kategori||"",
          r.tid ?? "",
          r.kortid ?? "",
          (r.beskrivning||"").replace(/\r?\n/g," ")
        ].join(";"));
      });

      const blob = new Blob(
        ["\uFEFF"+csv.join("\r\n")],
        {type:"text/csv;charset=utf-16le;"}
      );
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      a.href = URL.createObjectURL(blob);
      a.download = `Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }catch(e){
      alert("Fel vid CSV-export: "+e);
    }
  };

  window.exportPDFImpl = function(rows, settings, year, month){
    try{
      const y = Number(year), m = Number(month);
      const useRows = rows.filter(r=>{
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear()===y && (d.getMonth()+1)===m;
      });
      if(!useRows.length){
        alert("Ingen data för vald månad.");
        return;
      }

      const { jsPDF } = window.jspdf || {};
      if(!jsPDF || !window.jspdf?.autoTable){
        alert("jsPDF eller autoTable saknas. Lägg till dem om du vill använda PDF-export.");
        return;
      }

      const doc = new jsPDF({orientation:"landscape",format:"a3"});
      const title = `Tidrapport ${settings.name||""} – ${year}-${String(month).padStart(2,"0")}`;
      doc.setFontSize(14);
      doc.text(title,14,18);

      const body = useRows.map(r=>[
        r.datum||"",
        r.projekt||"",
        r.kategori||"",
        r.tid ?? "",
        r.kortid ?? "",
        (r.beskrivning||"").replace(/\r?\n/g," ")
      ]);

      doc.autoTable({
        head:[["Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"]],
        body,
        startY:24,
        styles:{fontSize:9,cellPadding:2},
        headStyles:{fillColor:[14,102,119]}
      });

      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      doc.save(`Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.pdf`);
    }catch(e){
      alert("Fel vid PDF-export: "+e);
    }
  };

  window.exportYearImpl = function(rows, settings){
    try{
      const header = [
        "Månad","Ordinarie","Körtid","Flex","ÖT<2","ÖT>2/Helg",
        "Semester","ATF","VAB","Sjuk","FL","Trakt"
      ];
      const csv = [header.join(";")];

      // Använd Balans.buildYearSummary per faktisk år i datat
      const years = new Set();
      (rows||[]).forEach(r=>{
        if(!r.datum) return;
        const y = parseInt(r.datum.slice(0,4),10);
        if(!isNaN(y)) years.add(y);
      });

      const monthNames = [
        "Januari","Februari","Mars","April","Maj","Juni",
        "Juli","Augusti","September","Oktober","November","December"
      ];

      years.forEach(y=>{
        const sum = window.Balans.buildYearSummary(rows, y);
        sum.forEach((S,idx)=>{
          csv.push([
            `${y}-${monthNames[idx]}`,
            S.ord.toFixed(2),
            S.kortid.toFixed(2),
            S.flex.toFixed(2),
            S.ot_lt.toFixed(2),
            S.ot_gt.toFixed(2),
            S.sem.toFixed(2),
            S.atf.toFixed(2),
            S.vab.toFixed(2),
            S.sjuk.toFixed(2),
            S.fl.toFixed(2),
            S.trakt
          ].join(";"));
        });
      });

      const blob = new Blob(
        ["\uFEFF"+csv.join("\r\n")],
        {type:"text/csv;charset=utf-16le;"}
      );
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      a.href = URL.createObjectURL(blob);
      a.download = `Tidrapport_Aarsoversikt_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }catch(e){
      alert("Fel vid årsöversikt-export: "+e);
    }
  };

})();