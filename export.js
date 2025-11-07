// export.js
// Tidrapport v10.15
// CSV/PDF export för månad + årsöversikt

"use strict";

(function(){

  // CSV (månad)
  window.exportCSVImpl = function(rows, settings, year, month){
    try{
      const y = Number(year);
      const m = Number(month);

      const use = rows.filter(r => {
        if (!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear()===y && (d.getMonth()+1)===m;
      });

      if (!use.length){
        alert("Ingen data för vald månad.");
        return;
      }

      const header = [
        "Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"
      ];
      const csv = [header.join(";")];

      use.forEach(r => {
        csv.push([
          r.datum || "",
          r.projekt || "",
          r.kategori || "",
          r.tid ?? "",
          r.kortid ?? "",
          (r.beskrivning || "").replace(/\r?\n/g," ")
        ].join(";"));
      });

      const blob = new Blob(
        ["\uFEFF" + csv.join("\r\n")],
        {type:"text/csv;charset=utf-16le;"}
      );
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      a.href = URL.createObjectURL(blob);
      a.download = `Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }catch(err){
      alert("Fel vid CSV-export: " + err);
    }
  };

  // PDF (månad, A3 landscape) om jsPDF finns
  window.exportPDFImpl = function(rows, settings, year, month){
    try{
      const y = Number(year);
      const m = Number(month);
      const use = rows.filter(r => {
        if (!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear()===y && (d.getMonth()+1)===m;
      });

      if (!use.length){
        alert("Ingen data att exportera för vald månad.");
        return;
      }

      const jsPDF = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDF || !window.jspdf || !window.jspdf.jsPDF || !window.jspdf.jsPDF.prototype.autoTable){
        alert("jsPDF + autoTable krävs för PDF-export.");
        return;
      }

      const doc = new jsPDF({orientation:"landscape", format:"a3"});
      const title = `Tidrapport ${settings.name||""} – ${year}-${String(month).padStart(2,"0")}`;
      doc.setFontSize(14);
      doc.text(title, 14, 20);

      const body = use.map(r => [
        r.datum || "",
        r.projekt || "",
        r.kategori || "",
        r.tid ?? "",
        r.kortid ?? "",
        (r.beskrivning || "").replace(/\r?\n/g," ")
      ]);

      doc.autoTable({
        head:[["Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"]],
        body,
        startY:26,
        styles:{fontSize:9, cellPadding:2},
        headStyles:{fillColor:[14,102,119]}
      });

      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      doc.save(`Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.pdf`);
    }catch(err){
      alert("Fel vid PDF-export: " + err);
    }
  };

  // Årsöversikt CSV (sammanfattning)
  window.exportYearImpl = function(rows, settings){
    try{
      const header = [
        "Månad","Ordinarie","Körtid","Flex","ÖT<2","ÖT>2/Helg",
        "Semester","ATF","VAB","Sjuk","Föräldraledig","Trakt"
      ];
      const csv = [header.join(";")];

      const monthNames = {
        1:"Januari",2:"Februari",3:"Mars",4:"April",5:"Maj",6:"Juni",
        7:"Juli",8:"Augusti",9:"September",10:"Oktober",11:"November",12:"December"
      };

      const sum = {};
      for (let m=1;m<=12;m++){
        sum[m] = {
          ord:0,
          kortid:0,
          flex:0,
          ot1:0,
          ot2:0,
          sem:0,
          atf:0,
          vab:0,
          sjuk:0,
          fal:0,
          trakt:0
        };
      }

      rows.forEach(r => {
        if (!r.datum) return;
        const d = new Date(r.datum);
        const m = d.getMonth()+1;
        const k = (r.kategori || "").toLowerCase();
        const h = parseFloat(r.tid) || 0;
        const kd = parseFloat(r.kortid) || 0;

        if (k.includes("ordinarie")) sum[m].ord += h;
        if (k.includes("flex")) sum[m].flex += h;
        if ((k.includes("öT".toLowerCase()) || k.includes("öt")) && k.includes("<2")) sum[m].ot1 += h;
        if ((k.includes("öT".toLowerCase()) || k.includes("öt")) && (!k.includes("<2") || k.includes(">2") || k.includes("helg"))) sum[m].ot2 += h;
        if (k.includes("semest")) sum[m].sem += h;
        if (k.includes("atf")) sum[m].atf += h;
        if (k.includes("vab")) sum[m].vab += h;
        if (k.includes("sjuk")) sum[m].sjuk += h;
        if (k.includes("föräldra")) sum[m].fal += h;
        if (k.includes("trakt")) sum[m].trakt += 1;

        sum[m].kortid += kd;
      });

      for (let m=1;m<=12;m++){
        const S = sum[m];
        const hasAny =
          S.ord || S.kortid || S.flex || S.ot1 || S.ot2 ||
          S.sem || S.atf || S.vab || S.sjuk || S.fal || S.trakt;

        csv.push([
          monthNames[m],
          hasAny ? S.ord.toFixed(2) : "",
          hasAny ? S.kortid.toFixed(2) : "",
          hasAny ? S.flex.toFixed(2) : "",
          hasAny ? S.ot1.toFixed(2) : "",
          hasAny ? S.ot2.toFixed(2) : "",
          hasAny ? S.sem.toFixed(2) : "",
          hasAny ? S.atf.toFixed(2) : "",
          hasAny ? S.vab.toFixed(2) : "",
          hasAny ? S.sjuk.toFixed(2) : "",
          hasAny ? S.fal.toFixed(2) : "",
          hasAny ? S.trakt : ""
        ].join(";"));
      }

      const blob = new Blob(
        ["\uFEFF" + csv.join("\r\n")],
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