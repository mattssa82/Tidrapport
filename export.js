// export.js
// Tidrapport v10.17
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const NEG_TO_ORD = [
    "flextid",
    "atf",
    "övertid <2",
    "övertid >2",
    "övertid-helg",
    "övertid helg",
    "semester"
  ];

  // ---- MÅNAD CSV ----
  window.exportCSVImpl = function(rows, settings, year, month){
    try{
      const y = Number(year);
      const m = Number(month);

      const use = (rows||[]).filter(r=>{
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear()===y && (d.getMonth()+1)===m;
      });

      const header = [
        "Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"
      ];
      const csv = [header.join(";")];

      use.forEach(r=>{
        csv.push([
          r.datum||"",
          r.projekt||"",
          r.kategori||"",
          r.tid==null ? "" : r.tid,
          r.kortid==null ? "" : r.kortid,
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

  // ---- MÅNAD PDF ----
  window.exportPDFImpl = function(rows, settings, year, month){
    try{
      const y = Number(year);
      const m = Number(month);

      const use = (rows||[]).filter(r=>{
        if(!r.datum) return false;
        const d = new Date(r.datum);
        return d.getFullYear()===y && (d.getMonth()+1)===m;
      });
      if(!use.length){
        alert("Ingen data för vald månad.");
        return;
      }

      const { jsPDF } = window.jspdf || {};
      if(!jsPDF || !window.jspdf?.autoTable){
        alert("jsPDF eller autoTable saknas. Lägg till dessa bibliotek för PDF-export.");
        return;
      }

      const doc = new jsPDF({orientation:"landscape",format:"a3"});
      const title = `Tidrapport ${settings.name||""} – ${year}-${String(month).padStart(2,"0")}`;
      doc.setFontSize(14);
      doc.text(title,14,18);

      const body = use.map(r=>[
        r.datum||"",
        r.projekt||"",
        r.kategori||"",
        r.tid==null?"":r.tid,
        r.kortid==null?"":r.kortid,
        (r.beskrivning||"").replace(/\r?\n/g," ")
      ]);

      doc.autoTable({
        head:[["Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"]],
        body,
        startY:24,
        styles:{fontSize:8,cellPadding:2},
        headStyles:{fillColor:[14,102,119]}
      });

      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      doc.save(`Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.pdf`);
    }catch(e){
      alert("Fel vid PDF-export: "+e);
    }
  };

  // ---- ÅRSÖVERSIKT CSV ----
  window.exportYearImpl = function(rows, settings){
    try{
      const header = [
        "Månad","Ordinarie","Körtid","Flex","ÖT<2","ÖT>2/Helg",
        "Semester","ATF","VAB","Sjuk","FL","Trakt"
      ];
      const csv = [header.join(";")];

      const monthNames = [
        "Januari","Februari","Mars","April","Maj","Juni",
        "Juli","Augusti","September","Oktober","November","December"
      ];

      const sumByM = {};
      for(let m=1;m<=12;m++){
        sumByM[m] = {
          ord:0,kortid:0,flex:0,ot1:0,ot2:0,
          sem:0,atf:0,vab:0,sjuk:0,fl:0,trakt:0
        };
      }

      (rows||[]).forEach(r=>{
        if(!r.datum) return;
        const d = new Date(r.datum);
        if(isNaN(d)) return;
        const m = d.getMonth()+1;
        const cat = (r.kategori||"").toLowerCase();
        let h = Number(r.tid)||0;

        if(h < 0 && NEG_TO_ORD.some(k=>cat.includes(k))){
          sumByM[m].ord += Math.abs(h);
          h = 0;
        }

        if(cat.includes("ordinarie")) sumByM[m].ord += h;
        if(cat.includes("flex")) sumByM[m].flex += h;
        if(cat.includes("övertid") && cat.includes("<2")) sumByM[m].ot1 += h;
        if(cat.includes("övertid") && !cat.includes("<2")) sumByM[m].ot2 += h;
        if(cat.includes("semest")) sumByM[m].sem += h;
        if(cat.includes("atf")) sumByM[m].atf += h;
        if(cat.includes("vab")) sumByM[m].vab += h;
        if(cat.includes("sjuk")) sumByM[m].sjuk += h;
        if(cat.includes("föräldraledig")) sumByM[m].fl += h;
        if(cat.includes("trakt")) sumByM[m].trakt += 1;

        if(r.kortid) sumByM[m].kortid += Number(r.kortid)||0;
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
      a.href = URL.createObjectURL(blob);
      a.download = `Tidrapport_Aarsoversikt_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }catch(e){
      alert("Fel vid årsöversikt-export: "+e);
    }
  };

})();