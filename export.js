// export.js
// Tidrapport v10.16
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  function isBankCat(name){
    const c = name.toLowerCase();
    return (
      c.includes("flextid") ||
      c.includes("övertid") ||
      c.includes("öt ") ||
      c.includes("öt-") ||
      c.includes("semester") ||
      c.includes("atf")
    );
  }

  // MÅNAD CSV
  window.exportCSVImpl = function(rows, settings, year, month){
    try{
      const yNum = Number(year);
      const mNum = Number(month);

      const useRows = rows.filter(r=>{
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear()===yNum && (d.getMonth()+1)===mNum;
      });

      const header = [
        "Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"
      ];
      const csv = [header.join(";")];

      const usedFirst = new Set();

      useRows.forEach(r=>{
        const first = !usedFirst.has(r._id);
        if(first) usedFirst.add(r._id);

        csv.push([
          r.datum||"",
          r.projekt||"",
          r.kategori||"",
          r.tid!==undefined?r.tid:"",
          first ? (r.kortid||"") : "",
          first ? (r.beskrivning||"").replace(/\r?\n/g," ") : ""
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

  // MÅNAD PDF (layout samma data)
  window.exportPDFImpl = function(rows, settings, year, month){
    try{
      const yNum = Number(year);
      const mNum = Number(month);

      const useRows = rows.filter(r=>{
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear()===yNum && (d.getMonth()+1)===mNum;
      });

      if(!useRows.length){
        alert("Ingen data att exportera för vald månad.");
        return;
      }

      const { jsPDF } = window.jspdf || {};
      if(!jsPDF || !window.jspdf || !window.jspdf.autoTable){
        alert("jsPDF/autoTable saknas. Lägg till dessa bibliotek för PDF-export.");
        return;
      }

      const doc = new jsPDF({orientation:"landscape",format:"a3"});
      const title = `Tidrapport ${settings.name||""} – ${year}-${String(month).padStart(2,"0")}`;
      doc.setFontSize(14);
      doc.text(title,14,20);

      const usedFirst = new Set();
      const body = [];

      useRows.forEach(r=>{
        const first = !usedFirst.has(r._id);
        if(first) usedFirst.add(r._id);
        body.push([
          r.datum||"",
          r.projekt||"",
          r.kategori||"",
          r.tid!==undefined?r.tid:"",
          first ? (r.kortid||"") : "",
          first ? (r.beskrivning||"").replace(/\r?\n/g," ") : ""
        ]);
      });

      doc.autoTable({
        head:[["Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"]],
        body,
        startY:26,
        styles:{fontSize:9,cellPadding:2},
        headStyles:{fillColor:[14,102,119]}
      });

      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      doc.save(`Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.pdf`);
    }catch(err){
      alert("Fel vid PDF-export: "+err);
    }
  };

  // ÅRSÖVERSIKT CSV
  window.exportYearImpl = function(rows, settings){
    try{
      const header = [
        "Månad","Ordinarie","Körtid","Flex","ÖT<2","ÖT>2","ÖT Helg",
        "Semester","ATF","VAB","Sjuk","FL","Trakt"
      ];
      const csv = [header.join(";")];

      const monthNames = [
        "Januari","Februari","Mars","April","Maj","Juni",
        "Juli","Augusti","September","Oktober","November","December"
      ];

      const sumByMonth = {};
      for(let m=1;m<=12;m++){
        sumByMonth[m] = {
          ord:0,
          kort:0,
          flex:0,
          ot1:0,
          ot2:0,
          otHelg:0,
          sem:0,
          atf:0,
          vab:0,
          sjuk:0,
          fl:0,
          trakt:0
        };
      }

      rows.forEach(r=>{
        if(!r.datum) return;
        const d = new Date(r.datum);
        if(isNaN(d)) return;
        const m = d.getMonth()+1;
        const name = (r.kategori||"").toLowerCase();
        const h = parseFloat(r.tid)||0;
        const kort = parseFloat(r.kortid)||0;
        const S = sumByMonth[m];

        if(name.includes("ordinarie")) S.ord += h;

        if(name.includes("flex")){
          S.flex += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("övertid") && name.includes("<2")){
          S.ot1 += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("övertid") && name.includes(">2")){
          S.ot2 += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("övertid") && name.includes("helg")){
          S.otHelg += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("semester")){
          S.sem += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("atf")){
          S.atf += h;
          if(h<0) S.ord += Math.abs(h);
        }
        if(name.includes("vab")) S.vab += h;
        if(name.includes("sjuk")) S.sjuk += h;
        if(name.includes("föräldra")) S.fl += h;
        if(name.includes("trakt")) S.trakt += 1;

        S.kort += kort;
      });

      for(let m=1;m<=12;m++){
        const S = sumByMonth[m];
        csv.push([
          monthNames[m-1],
          S.ord.toFixed(2),
          S.kort.toFixed(2),
          S.flex.toFixed(2),
          S.ot1.toFixed(2),
          S.ot2.toFixed(2),
          S.otHelg.toFixed(2),
          S.sem.toFixed(2),
          S.atf.toFixed(2),
          S.vab.toFixed(2),
          S.sjuk.toFixed(2),
          S.fl.toFixed(2),
          S.trakt
        ].join(";"));
      }

      const blob = new Blob(
        ["\uFEFF"+csv.join("\r\n")],
        {type:"text/csv;charset=utf-16le;"}
      );
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      a.href=URL.createObjectURL(blob);
      a.download=`Tidrapport_Aarsoversikt_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }catch(err){
      alert("Fel vid årsöversikt-export: "+err);
    }
  };

})();