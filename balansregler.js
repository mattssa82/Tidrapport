// balansregler.js
// Tidrapport v10.16
// i samarbete med ChatGPT & Martin Mattsson
//
// Ansvar: status per dag (grön / orange / saknas / helg / röddag)
// tar hänsyn till minus-timmar (Flex/ATF/ÖT/Helg/Semester) som arbetad tid.

"use strict";

(function(){

  const FULL_DAY_HOURS = 8;

  const ABSENCE = [
    "vab",
    "sjuk",
    "sjuk-tim",
    "föräldraledig",
    "föräldraledighet"
  ];

  // minusbank som ska räknas som arbetad tid när negativ
  function isBankCat(cat){
    const c = cat.toLowerCase();
    return (
      c.includes("flextid") ||
      c.includes("övertid") ||
      c.includes("öt ") ||
      c.includes("öt-") ||
      c.includes("semester") ||
      c.includes("atf")
    );
  }

  function isAbsence(cat){
    const c = cat.toLowerCase();
    return ABSENCE.some(a => c.includes(a));
  }

  function classifyDayType(dateStr){
    const d = new Date(dateStr);
    if(isNaN(d)) return "vardag";
    const dow = d.getDay(); // 0 = sön, 6 = lör
    if(dow === 0 || dow === 6) return "helg";
    return "vardag"; // röda dagar special kan byggas ut här vid behov
  }

  // Bedöm en vardag utifrån alla rader
  function analyzeWorkday(rows){
    if(!rows || !rows.length){
      return { status:"saknas", totalHours:0, traktCount:0 };
    }

    let totalWork = 0;      // arbetstid som räknas mot 8h
    let hasFullDayEquiv = false;
    let hasAbsenceOnly = true;
    let traktCount = 0;

    rows.forEach(r => {
      const cat = (r.kategori||"").toLowerCase();
      const raw = parseFloat(r.tid)||0;

      // Trakt → inte timmar
      if(cat.includes("trakt")){
        traktCount++;
        return;
      }

      // Absence?
      if(isAbsence(cat)){
        // frånvaro räknas inte som arbetstid
      }else{
        hasAbsenceOnly = false;
      }

      // Bank-kategori med minus → arbetad tid
      if(isBankCat(cat) && raw < 0){
        totalWork += Math.abs(raw);
      }
      else if(raw > 0 && !isAbsence(cat)){
        totalWork += raw;
      }

      // Full-dag-ekvivalenter (t.ex. ±8 i bank)
      if(
        isBankCat(cat) &&
        Math.abs(raw) >= FULL_DAY_HOURS
      ){
        hasFullDayEquiv = true;
      }

      // Ordinarie tid
      if(cat.includes("ordinarie") && raw > 0){
        // redan inkluderad i totalWork via raw>0
      }
    });

    // Fullgod dag?
    if(totalWork >= FULL_DAY_HOURS || hasFullDayEquiv){
      return { status:"grön", totalHours:totalWork, traktCount };
    }

    if(hasAbsenceOnly){
      return { status:"orange_absence", totalHours:0, traktCount };
    }

    // Jobbat men under 8h
    return { status:"orange_under", totalHours:totalWork, traktCount };
  }

  // Bygg karta { datum: {status,...} }
  function buildDayStatusMap(monthRows, settings, year, month){
    const byDate = {};
    (monthRows||[]).forEach(r=>{
      if(!r.datum) return;
      if(!byDate[r.datum]) byDate[r.datum] = [];
      byDate[r.datum].push(r);
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    const map = {};

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const type = classifyDayType(ds);

      if(type === "helg"){
        const rows = byDate[ds] || [];
        const total = rows.reduce((s,r)=>{
          const cat = (r.kategori||"").toLowerCase();
          const h = parseFloat(r.tid)||0;
          if(cat.includes("trakt")) return s;
          if(isBankCat(cat) && h<0) return s + Math.abs(h);
          if(h>0 && !isAbsence(cat)) return s + h;
          return s;
        },0);
        map[ds] = { status:"helg", totalHours:total };
        continue;
      }

      // vardag
      map[ds] = analyzeWorkday(byDate[ds] || []);
    }

    return map;
  }

  window.BalansRegler = {
    buildDayStatusMap
  };

})();