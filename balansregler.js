// balansregler.js
// Tidrapport v10.17
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const FULL_DAY_EQUIV = [
    "semester",
    "atf",
    "atf-tim",
    "flextid",
    "övertid <2",
    "övertid >2",
    "övertid-helg",
    "övertid helg"
  ];

  const ABSENCE = [
    "vab",
    "sjuk",
    "sjuk-tim",
    "föräldraledig",
    "föräldraledighet"
  ];

  const NEG_TO_ORD = [
    "flextid",
    "atf",
    "övertid <2",
    "övertid >2",
    "övertid-helg",
    "övertid helg",
    "semester"
  ];

  const FULL_DAY_HOURS = 8;

  function classifyDayType(dateStr, settings){
    const d = new Date(dateStr);
    if(isNaN(d)) return "vardag";
    const dow = d.getDay(); // 0 sön, 6 lör
    if(dow===0 || dow===6) return "helg";

    const list = (settings.redDays||"")
      .split(",")
      .map(s=>s.trim())
      .filter(Boolean);

    if(settings.showRedDays && list.includes(dateStr)){
      return "röddag";
    }
    return "vardag";
  }

  function analyzeWorkday(rowsThisDay){
    if(!rowsThisDay || !rowsThisDay.length){
      return { status:"saknas", totalHours:0, traktCount:0 };
    }

    let ordinarieHours = 0;
    let totalHours = 0;
    let hasFullDayEquiv = false;
    let hasAbsenceOnly = true;
    let traktCount = 0;

    rowsThisDay.forEach(r=>{
      let h = Number(r.tid)||0;
      const cat = (r.kategori||"").toLowerCase();

      // uttag: minus i vissa kategorier räknas som ordinarie
      if(h < 0 && NEG_TO_ORD.some(k=>cat.includes(k))){
        ordinarieHours += Math.abs(h);
        totalHours += Math.abs(h);
        hasAbsenceOnly = false;
        return;
      }

      if(cat.includes("trakt")){
        traktCount += 1;
        // påverkar inte timmar
        return;
      }

      if(cat.includes("ordinarie")){
        ordinarieHours += h;
        totalHours += h;
        hasAbsenceOnly = false;
        return;
      }

      // full day equiv
      if(FULL_DAY_EQUIV.some(k=>cat.includes(k)) && Math.abs(h) >= FULL_DAY_HOURS){
        hasFullDayEquiv = true;
        hasAbsenceOnly = false;
      }

      if(ABSENCE.some(a=>cat.includes(a))){
        // frånvaro, räknas ej som arbetad tid
      }else{
        // annan betalbar tid
        totalHours += h;
        hasAbsenceOnly = false;
      }
    });

    if(
      ordinarieHours >= FULL_DAY_HOURS ||
      totalHours >= FULL_DAY_HOURS ||
      hasFullDayEquiv
    ){
      return { status:"grön", totalHours, traktCount };
    }

    if(hasAbsenceOnly){
      return { status:"orange_absence", totalHours, traktCount };
    }

    return { status:"orange_under", totalHours, traktCount };
  }

  function buildDayStatusMap(monthRows, settings, yearNum, monthNum){
    const byDate = {};
    (monthRows||[]).forEach(r=>{
      if(!r.datum) return;
      if(!byDate[r.datum]) byDate[r.datum] = [];
      byDate[r.datum].push(r);
    });

    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const map = {};

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${yearNum}-${String(monthNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dayType = classifyDayType(ds, settings);

      if(dayType === "helg"){
        map[ds] = {
          status:"helg",
          totalHours: sumHours(byDate[ds]||[])
        };
        continue;
      }
      if(dayType === "röddag"){
        map[ds] = {
          status:"röddag",
          totalHours: sumHours(byDate[ds]||[])
        };
        continue;
      }

      map[ds] = analyzeWorkday(byDate[ds]||[]);
    }

    return map;
  }

  function sumHours(rows){
    return rows.reduce((acc,r)=>{
      const h = Number(r.tid)||0;
      return acc + (h>0 ? h : 0);
    },0);
  }

  window.BalansRegler = {
    buildDayStatusMap
  };

})();