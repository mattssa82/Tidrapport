// export.js
// Tidrapport v10.3
// i samarbete med ChatGPT & Martin Mattsson
"use strict";

(function(){
  // =========================
  // CSV-export (per vald månad)
  // =========================
  window.exportCSVImpl=function(rows,settings,year,month){
    try{
      const yNum=Number(year);const mNum=Number(month);
      const useRows=rows.filter(r=>{
        if(!r.datum)return false;
        const d=new Date(r.datum);
        return d.getFullYear()===yNum&&(d.getMonth()+1)===mNum;
      });
      const header=["Datum","Projekt","Kategori(er)","Tid (h)","Körtid (h)","Dagboksanteckning"];
      const csv=[header.join(";")];
      useRows.forEach(r=>{
        csv.push([r.datum||"",r.projekt||"",r.kategori||"",r.tid||"",r.kortid||"", (r.beskrivning||"").replace(/\r?\n/g," ")].join(";"));
      });
      const blob=new Blob(["\uFEFF"+csv.join("\r\n")],{type:"text/csv;charset=utf-16le;"});
      const a=document.createElement("a");
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      a.href=URL.createObjectURL(blob);
      a.download=`Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.csv`;
      a.click();URL.revokeObjectURL(a.href);
      alert("CSV-export klar.");
    }catch(err){alert("Fel vid CSV-export: "+err);}
  };

  // =========================
  // PDF-export (A3 landscape)
  // =========================
  window.exportPDFImpl=function(rows,settings,year,month){
    try{
      const yNum=Number(year);const mNum=Number(month);
      const useRows=rows.filter(r=>{
        if(!r.datum)return false;
        const d=new Date(r.datum);
        return d.getFullYear()===yNum&&(d.getMonth()+1)===mNum;
      });
      if(!useRows.length){alert("Ingen data att exportera.");return;}
      const {jsPDF}=window.jspdf||{};
      if(!jsPDF){alert("jsPDF saknas.");return;}
      const doc=new jsPDF({orientation:"landscape",format:"a3"});
      doc.setFontSize(14);
      doc.text(`Tidrapport ${settings.name||""} – ${year}-${String(month).padStart(2,"0")}`,14,20);
      const body=useRows.map(r=>[r.datum||"",r.projekt||"",r.kategori||"",r.tid||"",r.kortid||"", (r.beskrivning||"").replace(/\r?\n/g," ")]);
      doc.autoTable({
        head:[["Datum","Projekt","Kategori(er)","Tid (h)","Körtid (h)","Dagboksanteckning"]],
        body,startY:26,styles:{fontSize:9,cellPadding:2},headStyles:{fillColor:[14,102,119]}
      });
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      doc.save(`Tidrapport_${year}_${String(month).padStart(2,"0")}_${stamp}.pdf`);
    }catch(err){alert("Fel vid PDF-export: "+err);}
  };

  // =========================
  // Årsöversikt-export (CSV)
  // =========================
  window.exportYearImpl=function(rows,settings){
    try{
      const header=["Månad","Ordinarie","Flex","ÖT<2","ÖT>2/Helg","Semester","ATF","VAB","Sjuk","Trakt","Körtid"];
      const csv=[header.join(";")];
      const sumByMonth={};for(let m=1;m<=12;m++){
        sumByMonth[m]={ordinarie:0,flextid:0,ot1:0,ot2:0,semester:0,atf:0,vab:0,sjuk:0,trakt:0,kortid:0};
      }
      rows.forEach(r=>{
        if(!r.datum)return;const d=new Date(r.datum);const m=d.getMonth()+1;
        const n=(r.kategori||"").toLowerCase();const h=parseFloat(r.tid)||0;
        if(n.includes("ordinarie"))sumByMonth[m].ordinarie+=h;
        if(n.includes("flex"))sumByMonth[m].flextid+=h;
        if(n.includes("övertid")&&n.includes("<2"))sumByMonth[m].ot1+=h;
        if(n.includes("övertid")&&(n.includes(">2")||n.includes("helg")))sumByMonth[m].ot2+=h;
        if(n.includes("semest"))sumByMonth[m].semester+=h;
        if(n.includes("atf"))sumByMonth[m].atf+=h;
        if(n.includes("vab"))sumByMonth[m].vab+=h;
        if(n.includes("sjuk"))sumByMonth[m].sjuk+=h;
        if(n.includes("trakt"))sumByMonth[m].trakt+=1;
        sumByMonth[m].kortid+=parseFloat(r.kortid)||0;
      });
      const names={1:"Januari",2:"Februari",3:"Mars",4:"April",5:"Maj",6:"Juni",7:"Juli",8:"Augusti",9:"September",10:"Oktober",11:"November",12:"December"};
      const fmt=v=>Math.abs(v)<0.001?"–":v.toFixed(2).replace(/\.00$/,"");
      for(let m=1;m<=12;m++){
        const S=sumByMonth[m];
        csv.push([names[m],fmt(S.ordinarie),fmt(S.flextid),fmt(S.ot1),fmt(S.ot2),fmt(S.semester),fmt(S.atf),fmt(S.vab),fmt(S.sjuk),S.trakt===0?"–":S.trakt,fmt(S.kortid)].join(";"));
      }
      const blob=new Blob(["\uFEFF"+csv.join("\r\n")],{type:"text/csv;charset=utf-16le;"});
      const a=document.createElement("a");const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      a.href=URL.createObjectURL(blob);a.download=`Tidrapport_Aarsoversikt_${stamp}.csv`;a.click();URL.revokeObjectURL(a.href);
      alert("Årsöversikt-export klar.");
    }catch(err){alert("Fel vid årsöversikt-export: "+err);}
  };
})();