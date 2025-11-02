// export.js
// Tidrapport v10.11
// i samarbete med ChatGPT & Martin Mattsson
//
// - exportCSVImpl (månad)
// - exportPDFImpl (månad, landscape A3 via jsPDF+autoTable om finns)
// - exportYearImpl (årsöversikt CSV)

"use strict";

(function(){

  // CSV-export (per vald månad)
  window.exportCSVImpl = function(rows, settings, year, month){
    try{
      const yNum = Number(year);
      const mNum = Number(month);

      const useRows = rows.filter(r=>{
        if(!r.datum) return false;
        const d=new Date(r.datum);
        return d.getFullYear()===yNum && (d.getMonth()+1)===mNum;
      });

      const header=[
        "Datum",
        "Projekt",
        "Kategori(er)",
        "Tid (h)",
        "Körtid (h)",
        "Dagboksanteckning"
      ];

      const csvLines=[header.join(";")];

      useRows.forEach(r=>{
        csvLines.push([
          r.datum||"",
          r.projekt||"",
          r.kategori||"",
          r.tid||"",
          r.kortid||"",
          (r.beskrivning||"").replace(/\r?\n/g," ")
        ].join(";"));
      });

      const blob=new Blob(
        ["\uFEFF"+csvLines.join("\r\n")],
        {type:"text/csv;charset=utf-16le;"}
      );

      const a=document.createElement("a");
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      a.href=URL.createObjectURL(blob);
      a.download=`Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);

      alert("CSV-export klar.");
    }catch(err){
      alert("Fel vid CSV-export: "+err);
    }
  };

  // PDF-export (månad, A3 liggande)
  window.exportPDFImpl = function(rows, settings, year, month){
    try{
      const yNum = Number(year);
      const mNum = Number(month);

      const useRows = rows.filter(r=>{
        if(!r.datum) return false;
        const d=new Date(r.datum);
        return d.getFullYear()===yNum && (d.getMonth()+1)===mNum;
      });

      if(!useRows.length){
        alert("Ingen data att exportera för vald månad.");
        return;
      }

      const { jsPDF } = window.jspdf || {};
      if(!jsPDF){
        alert("jsPDF saknas – lägg till jsPDF och autoTable i sidan om du vill exportera PDF.");
        return;
      }

      const doc=new jsPDF({orientation:"landscape",format:"a3"});
      const title=`Tidrapport ${settings.name||""} – ${year}-${String(month).padStart(2,"0")}`;
      doc.setFontSize(14);
      doc.text(title,14,20);

      const tableBody = useRows.map(r=>[
        r.datum||"",
        r.projekt||"",
        r.kategori||"",
        r.tid||"",
        r.kortid||"",
        (r.beskrivning||"").replace(/\r?\n/g," ")
      ]);

      doc.autoTable({
        head:[["Datum","Projekt","Kategori(er)","Tid (h)","Körtid (h)","Dagboksanteckning"]],
        body:tableBody,
        startY:26,
        styles:{fontSize:9,cellPadding:2},
        headStyles:{fillColor:[14,102,119]}
      });

      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      doc.save(`Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.pdf`);
    }catch(err){
      alert("Fel vid PDF-export: "+err);
    }
  };

  // Årsöversikt CSV (hela året)
  window.exportYearImpl = function(rows, settings){
    try{
      const header=[
        "Månad","Ordinarie","Körtid","Flex","ÖT<2","ÖT>2","ÖT-Helg",
        "Semester","ATF","VAB","Sjuk","F-ledig","Trakt"
      ];
      const csvLines=[header.join(";")];

      // summera per månad
      const sumByMonth = {};
      for(let m=1;m<=12;m++){
        sumByMonth[m]={
          ordinarie:0,
          kortid:0,
          flex:0,
          ot_lt2:0,
          ot_gt2:0,
          ot_helg:0,
          semester:0,
          atf:0,
          vab:0,
          sjuk:0,
          fledig:0,
          trakt:0
        };
      }

      const seenPerMonth = {}; // m -> Set(_id) för körtid
      rows.forEach(r=>{
        if(!r.datum) return;
        const d=new Date(r.datum);
        const m=d.getMonth()+1;
        if(!sumByMonth[m]) return;

        const n=(r.kategori||"").toLowerCase();
        const h=parseFloat(r.tid)||0;
        if(n.includes("ordinarie")) sumByMonth[m].ordinarie+=h;
        if(n.includes("flex"))     sumByMonth[m].flex+=h;
        if(n.includes("övertid") && n.includes("<2")) sumByMonth[m].ot_lt2+=h;
        if(n.includes("övertid") && n.includes(">2") && !n.includes("helg")) sumByMonth[m].ot_gt2+=h;
        if(n.includes("övertid") && n.includes("helg")) sumByMonth[m].ot_helg+=h;
        if(n.includes("semest"))  sumByMonth[m].semester+=h;
        if(n.includes("atf"))     sumByMonth[m].atf+=h;
        if(n.includes("vab"))     sumByMonth[m].vab+=h;
        if(n.includes("sjuk"))    sumByMonth[m].sjuk+=h;
        if(n.includes("föräldra"))sumByMonth[m].fledig+=h;
        if(n.includes("trakt"))   sumByMonth[m].trakt+=1;

        if(!seenPerMonth[m]) seenPerMonth[m]=new Set();
        if(!seenPerMonth[m].has(r._id)){
          seenPerMonth[m].add(r._id);
          sumByMonth[m].kortid += parseFloat(r.kortid)||0;
        }
      });

      const monthNames={
        1:"Januari",2:"Februari",3:"Mars",4:"April",5:"Maj",6:"Juni",
        7:"Juli",8:"Augusti",9:"September",10:"Oktober",11:"November",12:"December"
      };

      for(let m=1;m<=12;m++){
        const S=sumByMonth[m];
        function fmt(v){
          if(!v || v===0) return "";
          if(typeof v==="number") return v.toFixed(2).replace(/\.00$/,"");
          return v;
        }
        csvLines.push([
          monthNames[m],
          fmt(S.ordinarie),
          fmt(S.kortid),
          fmt(S.flex),
          fmt(S.ot_lt2),
          fmt(S.ot_gt2),
          fmt(S.ot_helg),
          fmt(S.semester),
          fmt(S.atf),
          fmt(S.vab),
          fmt(S.sjuk),
          fmt(S.fledig),
          fmt(S.trakt)
        ].join(";"));
      }

      const blob=new Blob(
        ["\uFEFF"+csvLines.join("\r\n")],
        {type:"text/csv;charset=utf-16le;"}
      );
      const a=document.createElement("a");
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      a.href=URL.createObjectURL(blob);
      a.download=`Tidrapport_Aarsoversikt_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);

      alert("Årsöversikt-export klar.");
    }catch(err){
      alert("Fel vid årsöversikt-export: "+err);
    }
  };

})();