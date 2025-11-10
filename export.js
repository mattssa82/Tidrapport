// export.js
// Tidrapport v10.19
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  function parseFloatSafe(v){
    if(v === undefined || v === null) return 0;
    const s = String(v).replace(",", ".").trim();
    if(s === "") return 0;
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  }

  // CSV per månad
  window.exportCSVImpl = function(rows, settings, year, month){
    try{
      const yNum = Number(year);
      const mNum = Number(month);

      const use = rows.filter(r => {
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear() === yNum && (d.getMonth()+1) === mNum;
      });

      const header = [
        "Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"
      ];
      const csv = [header.join(";")];

      use.forEach(r => {
        csv.push([
          r.datum || "",
          r.projekt || "",
          r.kategori || "",
          (r.tid ?? ""),
          (r.kortid ?? ""),
          (r.beskrivning || "").replace(/\r?\n/g," ")
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
    }catch(err){
      alert("Fel vid CSV-export: "+err);
    }
  };

  // PDF per månad (om jsPDF+autoTable finns)
  window.exportPDFImpl = function(rows, settings, year, month){
    try{
      const yNum = Number(year);
      const mNum = Number(month);

      const use = rows.filter(r => {
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear() === yNum && (d.getMonth()+1) === mNum;
      });

      if(!use.length){
        alert("Ingen data att exportera för vald månad.");
        return;
      }

      const { jsPDF } = window.jspdf || {};
      if(!jsPDF || !window.jspdf || !window.jspdf.AutoTable && !window.jspdf.autoTable){
        alert("jsPDF/autoTable saknas. Lägg till dessa scriptfiler för PDF-export.");
        return;
      }

      const doc = new jsPDF({orientation:"landscape",format:"a3"});
      const title = `Tidrapport ${settings.name||""} – ${year}-${String(month).padStart(2,"0")}`;
      doc.setFontSize(14);
      doc.text(title,14,18);

      const body = use.map(r => [
        r.datum || "",
        r.projekt || "",
        r.kategori || "",
        (r.tid ?? ""),
        (r.kortid ?? ""),
        (r.beskrivning || "").replace(/\r?\n/g," ")
      ]);

      (doc.autoTable || doc.autoTable)({
        head:[["Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"]],
        body,
        startY:24,
        styles:{fontSize:9,cellPadding:2},
        headStyles:{fillColor:[14,102,119]}
      });

      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      doc.save(`Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.pdf`);
    }catch(err){
      alert("Fel vid PDF-export: "+err);
    }
  };

  // Årsöversikt CSV
  window.exportYearImpl = function(rows, settings){
    try{
      const header = [
        "Månad","Ordinarie","Körtid","Flex","ÖT<2","ÖT>2","ÖT Helg",
        "Semester","ATF","VAB","FL","Sjuk","Trakt"
      ];
      const csv = [header.join(";")];

      const monthNames = [
        "Januari","Februari","Mars","April","Maj","Juni",
        "Juli","Augusti","September","Oktober","November","December"
      ];

      const sumByM = {};
      for(let m=1;m<=12;m++){
        sumByM[m] = {
          ord:0,kortid:0,flex:0,ot1:0,ot2:0,oth:0,
          sem:0,atf:0,vab:0,fl:0,sjuk:0,trakt:0
        };
      }

      rows.forEach(r => {
        if(!r.datum) return;
        const d = new Date(r.datum);
        if(isNaN(d)) return;
        const m = d.getMonth()+1;
        const cat = (r.kategori || "").toLowerCase();
        const h = parseFloatSafe(r.tid);
        const k = parseFloatSafe(r.kortid);

        if(cat.includes("trakt")) sumByM[m].trakt += 1;
        if(cat.includes("ordinarie")) sumByM[m].ord += h;
        if(cat.includes("flex")) sumByM[m].flex += h;
        if(cat === "atf") sumByM[m].atf += h;
        if(cat.includes("övertid") && cat.includes("<2")) sumByM[m].ot1 += h;
        if(cat.includes("övertid") && cat.includes(">2")) sumByM[m].ot2 += h;
        if(cat.includes("övertid") && cat.includes("helg")) sumByM[m].oth += h;
        if(cat.includes("semest") && !cat.includes("tim")) sumByM[m].sem += h;
        if(cat.includes("vab")) sumByM[m].vab += h;
        if(cat === "fl") sumByM[m].fl += h;
        if(cat.includes("sjuk")) sumByM[m].sjuk += h;

        sumByM[m].kortid += k;
      });

      for(let m=1;m<=12;m++){
        const S = sumByM[m];
        csv.push([
          monthNames[m-1],
          S.ord.toFixed(2),
          S.kortid.toFixed(2),
          S.flex.toFixed(2),
          S.ot1.toFixed(2),
          S.ot2.toFixed(2),
          S.oth.toFixed(2),
          S.sem.toFixed(2),
          S.atf.toFixed(2),
          S.vab.toFixed(2),
          S.fl.toFixed(2),
          S.sjuk.toFixed(2),
          S.trakt
        ].join(";"));
      }

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
    }catch(err){
      alert("Fel vid årsöversikt-export: "+err);
    }
  };

})();