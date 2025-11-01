// balansregler.js
// Tidrapport v10.9
// i samarbete med ChatGPT & Martin Mattsson
//
// Bygger status per dag (grön / orange_under / saknas / helg / röddag)
// Används för färgerna i månadslistan och för larm-listan.

(function(){
  // Kategorier som kan motsvara "full dag"
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

  // Frånvaro = ska bli gul/orange_absence istället för grön
  const ABSENCE = [
    "vab",
    "sjuk",
    "sjuk-tim",
    "föräldraledig",
    "föräldraledighet"
  ];

  function getFullDayHoursForDate(dateStr, settings){
    // vardag default 8
    // röd dag: använd inställning redDayHours
    const d = new Date(dateStr);
    if (isNaN(d)) return 8;
    const dow = d.getDay(); //0=sön,6=lör

    const redList = (settings.redDays||"")
      .split(",")
      .map(s=>s.trim())
      .filter(Boolean);

    const isCustomRed = settings.showRedDays && redList.includes(dateStr);

    if (isCustomRed){
      const v = parseFloat(settings.redDayHours);
      if(!isNaN(v) && v>0) return v;
    }

    // helg eller vardag -> helg kan vi markera separat ändå
    return 8;
  }

  function classifyDayType(dateStr, settings){
    const d = new Date(dateStr);
    if (isNaN(d)) return "vardag";

    const dow = d.getDay(); // 0=sön,6=lör
    if (dow === 0 || dow === 6){
      return "helg";
    }

    // röda dagar användar-def
    const redList = (settings.redDays||"")
      .split(",")
      .map(s=>s.trim())
      .filter(Boolean);

    if (settings.showRedDays && redList.includes(dateStr)){
      return "röddag";
    }

    return "vardag";
  }

  function analyzeWorkday(rowsThisDay, settings, dateStr){
    if(!rowsThisDay || !rowsThisDay.length){
      return {
        status:"saknas",
        totalHours:0,
        traktCount:0
      };
    }

    const FULL_DAY_HOURS = getFullDayHoursForDate(dateStr, settings);

    let totalHours=0;
    let ordinarieHours=0;
    let hasFullDayEquiv=false;
    let hasAbsenceOnly=true;
    let traktCount=0;

    rowsThisDay.forEach(r=>{
      const h=parseFloat(r.tid)||0;
      totalHours+=h;
      const cat=(r.kategori||"").toLowerCase();

      if(cat.includes("ordinarie")){
        ordinarieHours+=h;
        hasAbsenceOnly=false;
      }

      if(
        FULL_DAY_EQUIV.some(x=>cat.includes(x)) &&
        h>=FULL_DAY_HOURS
      ){
        hasFullDayEquiv=true;
        hasAbsenceOnly=false;
      }

      if(cat.includes("trakt")){
        traktCount+=1;
      }

      if(
        !ABSENCE.some(a=>cat.includes(a)) &&
        !cat.includes("trakt")
      ){
        hasAbsenceOnly=false;
      }
    });

    // Grön om dag räknas komplett
    if(
      ordinarieHours>=FULL_DAY_HOURS ||
      totalHours>=FULL_DAY_HOURS ||
      hasFullDayEquiv
    ){
      return {
        status:"grön",
        totalHours,
        traktCount
      };
    }

    // Bara frånvaro => orange_absence
    if(hasAbsenceOnly){
      return {
        status:"orange_absence",
        totalHours,
        traktCount
      };
    }

    // Jobbat men inte full dag => orange_under
    return {
        status:"orange_under",
        totalHours,
        traktCount
    };
  }

  // Bygg statusMap för en månad:
  // { "2025-10-01": {status:"grön", totalHours:8, ...}, ... }
  function buildDayStatusMap(monthRows, settings, yearNum, monthNum){
    const byDate={};
    (monthRows||[]).forEach(r=>{
      if(!r.datum) return;
      if(!byDate[r.datum]) byDate[r.datum]=[];
      byDate[r.datum].push(r);
    });

    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const map={};

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${yearNum}-${String(monthNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

      const dayType = classifyDayType(ds, settings);

      if(dayType==="helg"){
        map[ds] = {
          status:"helg",
          totalHours:(byDate[ds]||[]).reduce((a,b)=>a+(parseFloat(b.tid)||0),0)
        };
        continue;
      }
      if(dayType==="röddag"){
        map[ds] = {
          status:"röddag",
          totalHours:(byDate[ds]||[]).reduce((a,b)=>a+(parseFloat(b.tid)||0),0)
        };
        continue;
      }

      // vanlig vardag => analysera
      map[ds] = analyzeWorkday(byDate[ds]||[], settings, ds);
    }

    return map;
  }

  window.BalansRegler = {
    buildDayStatusMap
  };
})();