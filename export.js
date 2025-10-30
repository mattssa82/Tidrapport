// export.js  v10.0
// Export av CSV, PDF och årsöversikt

"use strict";

(function(){

  // =============================
  //  CSV-export
  // =============================
  window.exportCSVImpl = function(data, settings, year, month) {
    try {
      const rows = data.filter(r => {
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear() === Number(year) && (d.getMonth()+1) === Number(month);
      });

      const header = [
        "Datum","Projekt","Kategori(er)","Tid (h)",
        "Körtid (h)","Dagboksanteckning"
      ];

      const csvRows = [header.join(";")];
      rows.forEach(r=>{
        const row = [
          r.datum || "",
          r.projekt || "",
          r.kategori || "",
          r.tid || "",
          r.kortid || "",
          (r.beskrivning||"").replace(/\r?\n/g," ")
        ];
        csvRows.push(row.join(";"));
      });

      const csvContent = "\uFEFF" + csvRows.join("\r\n");
      const blob = new Blob([csvContent], {type:"text/csv;charset=utf-16le;"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      a.download = `Tidrapport_${year}_${month}_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      alert("CSV-export klar.");
    } catch(err) {
      alert("Fel vid CSV-export: "+err);
    }
  };

  // =============================
  //  PDF-export (A3 liggande)
  // =============================
  window.exportPDFImpl = function(data, settings, year, month) {
    try {
      const rows = data.filter(r=>{
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear() === Number(year) && (d.getMonth()+1) === Number(month);
      });

      if(rows.length === 0) {
        alert("Ingen data att exportera för vald månad.");
        return;
      }

      const { jsPDF } = window.jspdf || {};
      if(!jsPDF) {
        alert("jsPDF saknas – inkludera jsPDF och autoTable.");
        return;
      }

      const doc = new jsPDF({orientation:"landscape",format:"a3"});
      const title = `Tidrapport ${settings.name || ""} – ${year}-${String(month).padStart(2,"0")}`;
      doc.setFontSize(14);
      doc.text(title,14,20);

      const tableData = rows.map(r=>[
        r.datum||"",
        r.projekt||"",
        r.kategori||"",
        r.tid||"",
        r.kortid||"",
        (r.beskrivning||"").replace(/\r?\n/g," ")
      ]);

      doc.autoTable({
        head:[["Datum","Projekt","Kategori(er)","Tid (h)","Körtid (h)","Dagboksanteckning"]],
        body:tableData,
        startY:26,
        styles:{fontSize:9,cellPadding:2},
        headStyles:{fillColor:[14,102,119]}
      });

      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      doc.save(`Tidrapport_${year}_${month}_${stamp}.pdf`);
    } catch(err) {
      alert("Fel vid PDF-export: "+err);
    }
  };

  // =============================
  //  Årsöversikt-export (CSV)
  // =============================
  window.exportYearImpl = function(data, settings) {
    try {
      const header = [
        "Månad","Ordinarie","Flex","ÖT<2","ÖT>2/Helg",
        "Semester","ATF","VAB","Sjuk","Trakt","Körtid"
      ];
      const csvRows = [header.join(";")];
      const year = new Date().getFullYear();

      const sumByMonth = {};
      for(let m=1;m<=12;m++){
        sumByMonth[m] = {
          ordinarie:0, flextid:0, ot1:0, ot2:0,
          semester:0, atf:0, vab:0, sjuk:0, trakt:0, kortid:0
        };
      }

      data.forEach(r=>{
        if(!r.datum) return;
        const d = new Date(r.datum);
        if(d.getFullYear()!==year) return;
        const m = d.getMonth()+1;
        const cats = Array.isArray(r.kategorier)?r.kategorier:[];
        cats.forEach(c=>{
          const name=(c.kategori||"").toLowerCase();
          const h=parseFloat(c.tid)||0;
          if(name.includes("ordinarie")) sumByMonth[m].ordinarie+=h;
          if(name.includes("flex")) sumByMonth[m].flextid+=h;
          if(name.includes("öt")&&name.includes("<2")) sumByMonth[m].ot1+=h;
          if(name.includes("öt")&&(name.includes(">2")||name.includes("helg"))) sumByMonth[m].ot2+=h;
          if(name.includes("semest")) sumByMonth[m].semester+=h;
          if(name.includes("atf")) sumByMonth[m].atf+=h;
          if(name.includes("vab")) sumByMonth[m].vab+=h;
          if(name.includes("sjuk")) sumByMonth[m].sjuk+=h;
          if(name.includes("trakt")) sumByMonth[m].trakt+=1;
        });
        sumByMonth[m].kortid += parseFloat(r.kortid)||0;
      });

      for(let m=1;m<=12;m++){
        const s=sumByMonth[m];
        const row=[
          m,
          s.ordinarie.toFixed(2),
          s.flextid.toFixed(2),
          s.ot1.toFixed(2),
          s.ot2.toFixed(2),
          s.semester.toFixed(2),
          s.atf.toFixed(2),
          s.vab.toFixed(2),
          s.sjuk.toFixed(2),
          s.trakt,
          s.kortid.toFixed(2)
        ];
        csvRows.push(row.join(";"));
      }

      const csvContent="\uFEFF"+csvRows.join("\r\n");
      const blob=new Blob([csvContent],{type:"text/csv;charset=utf-16le;"});
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      a.download=`Tidrapport_Aarsoversikt_${year}_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      alert("Årsöversikt-export klar.");
    }catch(err){
      alert("Fel vid årsöversikt-export: "+err);
    }
  };

})();