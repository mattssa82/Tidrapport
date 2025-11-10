// balansregler.js
// Tidrapport v10.19
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){
  const FULL_DAY_HOURS = 8;

  // Kategorier där NEGATIVA timmar räknas som Ordinarie (tar från bank)
  const BANK_TO_ORD = [
    "flextid",
    "atf",
    "övertid <2",
    "övertid >2",
    "övertid-helg",
    "övertid helg",
    "semester-tim"
  ];

  // Kategorier som i sig (positiva 8h) kan räknas som full dag
  const FULL_DAY_EQUIV = [
    "semester",
    "atf",
    "flextid",
    "övertid <2",
    "övertid >2",
    "övertid-helg",
    "övertid helg"
  ];

  const ABSENCE = [
    "vab",
    "sjuk",
    "sjukdom",
    "föräldraled",
    "fl "
  ];

  function isAbsence(cat){
    const c = cat.toLowerCase();
    return ABSENCE.some(a => c.includes(a));
  }

  function classifyDayType(dateStr){
    const d = new Date(dateStr);
    if(isNaN(d)) return "vardag";
    const dow = d.getDay();
    if(dow === 0 || dow === 6) return "helg";
    return "vardag";
  }

  // Analys av en vardag
  function analyzeWorkday(rows, redDayHours){
    if(!rows || !rows.length){
      return { status:"saknas", totalHours:0, traktCount:0 };
    }

    let ordinarie = 0;
    let total = 0;
    let trakt = 0;
    let hasFullDayEquiv = false;
    let onlyAbsence = true;

    rows.forEach(r => {
      const h = parseFloat(r.tid) || 0;
      const cat = (r.kategori || "").toLowerCase();

      // Trakt
      if(cat.includes("trakt")){
        trakt += 1;
        return;
      }

      // minusbank -> konvertera till ordinarie
      if(h < 0 && BANK_TO_ORD.some(k => cat.includes(k))){
        const plus = Math.abs(h);
        ordinarie += plus;
        total += plus;
        onlyAbsence = false;
        return;
      }

      // vanliga timmar
      if(h !== 0){
        total += h;
      }

      if(cat.includes("ordinarie")){
        if(h > 0) ordinarie += h;
        onlyAbsence = false;
      }

      // full day equiv positivt
      if(h >= FULL_DAY_HOURS && FULL_DAY_EQUIV.some(k => cat.includes(k))){
        hasFullDayEquiv = true;
        if(!isAbsence(cat)) onlyAbsence = false;
      }

      if(!isAbsence(cat) && !cat.includes("trakt")){
        onlyAbsence = false;
      }
    });

    // Grön logik
    if(
      ordinarie >= FULL_DAY_HOURS ||
      total >= FULL_DAY_HOURS ||
      hasFullDayEquiv
    ){
      return { status:"grön", totalHours:total, traktCount:trakt };
    }

    if(onlyAbsence){
      return { status:"orange_absence", totalHours:total, traktCount:trakt };
    }

    return { status:"orange_under", totalHours:total, traktCount:trakt };
  }

  // Bygg dagstatus-karta för vald månad
  function buildDayStatusMap(monthRows, settings, yearNum, monthNum){
    const map = {};
    const byDate = {};

    (monthRows || []).forEach(r => {
      if(!r.datum) return;
      if(!byDate[r.datum]) byDate[r.datum] = [];
      byDate[r.datum].push(r);
    });

    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const redHours = parseFloat(settings.redDayHours || "8") || 8;

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${yearNum}-${String(monthNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dayType = classifyDayType(ds);
      const rows = byDate[ds] || [];

      if(dayType === "helg"){
        // helg → info, inget krav
        map[ds] = {
          status:"helg",
          totalHours:rows.reduce((a,b)=>a+(parseFloat(b.tid)||0),0)
        };
        continue;
      }

      // Röddag: om någon rad har kategori som innehåller "röddag"
      const hasRed = rows.some(r => (r.kategori||"").toLowerCase().includes("röddag"));
      if(hasRed){
        // tom men röddag -> ingen varning
        const total = rows.reduce((a,b)=>a+(parseFloat(b.tid)||0),0) || redHours;
        const st = total >= FULL_DAY_HOURS ? "grön" : "röddag";
        map[ds] = {
          status:st,
          totalHours:total
        };
        continue;
      }

      // vanlig vardag
      map[ds] = analyzeWorkday(rows, redHours);
    }

    return map;
  }

  window.BalansRegler = {
    buildDayStatusMap
  };
})();