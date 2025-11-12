// export.js
// Tidrapport v10.22
// i samarbete med ChatGPT & Martin Mattsson
//
// CSV (månad) + per-projekt-summering (i samma fil)
// PDF (månad, A3 landscape)
// Årsöversikt CSV

"use strict";

(function(){

  function fmt(n){ const v=parseFloat(n)||0; return (Math.round(v*100)/100).toString().replace(".",","); }

  // =========================
  // CSV-export (per vald månad) + per-projekt
  // =========================
  window.exportCSVImpl = function(rows, settings, year, month){
    try{
      const yNum = Number(year);
      const mNum = Number(month);

      const useRows = rows.filter(r=>{
        if(!r.datum) return false;
        const d=new Date(r.datum);
        return d.getFullYear()===yNum && (d.getMonth()+1)===mNum;
      }).sort((a,b)=>a.datum.localeCompare(b.datum));

      const header = ["Datum","Projekt","Kategori(er)","Tid (h)","Körtid (h)","Dagboksanteckning"];
      const csv = [header.join(";")];

      // raddel
      useRows.forEach(r=>{
        csv.push([
          r.datum||"",
          r.projekt||"",
          r.kategori||"",
          r.tid==null?"":r.tid,
          r.kortid==null?"":r.kortid,
          (r.beskrivning||"").replace(/\r?\n/g," ")
        ].join(";"));
      });

      // Tom rad
      csv.push("");
      // Summering per projekt
      csv.push("Summering per projekt;");
      const perProj = {};
      useRows.forEach(r=>{
        const p = r.projekt||"(okänt)";
        const h = parseFloat(r.tid)||0;
        perProj[p] = (perProj[p]||0) + h;
      });
      Object.keys(perProj).sort().forEach(p=>{
        csv.push(`${p};${fmt(perProj[p])}h`);
      });

      const blob=new Blob(["\uFEFF"+csv.join("\r\n")],{type:"text/csv;charset=utf-16le;"});
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

  // =========================
  // PDF-export (månad, A3 landscape)
  // =========================
  window.exportPDFImpl = function(rows, settings, year, month){
    try{
      const yNum = Number(year);
      const mNum = Number(month);
      const useRows = rows.filter(r=>{
        if(!r.datum) return false;
        const d=new Date(r.datum);
        return d.getFullYear()===yNum && (d.getMonth()+1)===mNum;
      }).sort((a,b)=>a.datum.localeCompare(b.datum));

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
        r.tid==null?"":r.tid,
        r.kortid==null?"":r.kortid,
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

  // =========================
  // Årsöversikt-export (CSV)
  // =========================
  window.exportYearImpl = function(rows, settings){
    try{
      const header=["Månad","Ordinarie","Körtid","Flex","ÖT<2","ÖT>2","ÖT-Helg","Semester","ATF","VAB","Sjuk","FL","Trakt"];
      const csv=[header.join(";")];

      const sumByMonth = {};
      for(let m=1;m<=12;m++){
        sumByMonth[m]={ord:0,kd:0,fx:0,ot1:0,ot2:0,oth:0,sem:0,atf:0,vab:0,sjuk:0,fl:0,tr:0};
      }

      rows.forEach(r=>{
        if(!r.datum) return;
        const d=new Date(r.datum); const m=d.getMonth()+1;
        const n=(r.kategori||"").toLowerCase();
        const h=parseFloat(r.tid)||0;

        if(n.includes("ordinarie")) sumByMonth[m].ord+=h;
        if(n.includes("flex")) sumByMonth[m].fx+=h;
        if(n.includes("övertid") && n.includes("<2")) sumByMonth[m].ot1+=h;
        if(n.includes("övertid") && n.includes(">2")) sumByMonth[m].ot2+=h;
        if(n.includes("helg")) sumByMonth[m].oth+=h;
        if(n.includes("semest")) sumByMonth[m].sem+=h;
        if(n.includes("atf")) sumByMonth[m].atf+=h;
        if(n.includes("vab")) sumByMonth[m].vab+=h;
        if(n.includes("sjuk")) sumByMonth[m].sjuk+=h;
        if(n.includes("föräldra")) sumByMonth[m].fl+=h;
        if(n.includes("trakt")) sumByMonth[m].tr+=1;

        sumByMonth[m].kd += parseFloat(r.kortid)||0;
      });

      const monthNames={1:"Januari",2:"Februari",3:"Mars",4:"April",5:"Maj",6:"Juni",7:"Juli",8:"Augusti",9:"September",10:"Oktober",11:"November",12:"December"};

      for(let m=1;m<=12;m++){
        const S=sumByMonth[m];
        csv.push([monthNames[m],fmt(S.ord),fmt(S.kd),fmt(S.fx),fmt(S.ot1),fmt(S.ot2),fmt(S.oth),fmt(S.sem),fmt(S.atf),fmt(S.vab),fmt(S.sjuk),fmt(S.fl),S.tr].join(";"));
      }

      const blob=new Blob(["\uFEFF"+csv.join("\r\n")],{type:"text/csv;charset=utf-16le;"});
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