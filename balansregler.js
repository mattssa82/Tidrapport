// balansregler.js
// Tidrapport v10.26
// i samarbete med ChatGPT & Martin Mattsson

(function(){

  // Kategorier som kan motsvara en “full dag” själva (negativa eller positiva)
  const FULL_EQUIV = [
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
    "föräldraledighet",
    "tjänstledig"
  ];

  const FULL_DAY_HOURS = 8;

  function classifyDayType(dateStr, settings){
    const d = new Date(dateStr);
    if(isNaN(d)) return "vardag";

    const dow = d.getDay(); // 0= söndag, 6= lördag
    if(dow===0 || dow===6) return "helg";

    const redList = (settings.redDays||"")
      .split(",")
      .map(s=>s.trim())
      .filter(Boolean);
    if(settings.showRedDays && redList.includes(dateStr)){
      return "röddag";
    }
    return "vardag";
  }

  function analyzeWorkday(rowsThisDay){
    if(!rowsThisDay || !rowsThisDay.length){
      return {
        status:"saknas",
        totalHours:0,
        traktCount:0
      };
    }

    let totalHours = 0;
    let ordinarieHours = 0;
    let hasFullEquiv = false;
    let hasAbsenceOnly = true;
    let traktCount = 0;

    rowsThisDay.forEach(r=>{
      const h = parseFloat(r.tid)||0;
      totalHours += h;

      const cat = (r.kategori||"").toLowerCase();

      if(cat.includes("ordinarie")){
        ordinarieHours += h;
        hasAbsenceOnly = false;
      }

      if(FULL_EQUIV.some(x=>cat.includes(x)) && Math.abs(h)>=FULL_DAY_HOURS){
        hasFullEquiv = true;
        hasAbsenceOnly = false;
      }

      if(cat.includes("trakt")){
        traktCount += 1;
      }

      if(!ABSENCE.some(a=>cat.includes(a)) && !cat.includes("trakt")){
        hasAbsenceOnly = false;
      }
    });

    // Grön om full dag
    if(
      Math.abs(ordinarieHours)>=FULL_DAY_HOURS ||
      Math.abs(totalHours)>=FULL_DAY_HOURS ||
      hasFullEquiv
    ){
      return {
        status:"grön",
        totalHours,
        traktCount
      };
    }

    if(hasAbsenceOnly){
      return {
        status:"orange_absence",
        totalHours,
        traktCount
      };
    }

    return {
      status:"orange_under",
      totalHours,
      traktCount
    };
  }

  function buildDayStatusMap(monthRows, settings, yearNum, monthNum){
    const byDate = {};
    (monthRows||[]).forEach(r=>{
      if(!r.datum) return;
      if(!byDate[r.datum]) byDate[r.datum]=[];
      byDate[r.datum].push(r);
    });

    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const map = {};

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${yearNum}-${String(monthNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dayType = classifyDayType(ds, settings);
      const list = byDate[ds] || [];
      const total = list.reduce((a,b)=>a+(parseFloat(b.tid)||0),0);

      if(dayType==="helg"){
        map[ds] = {
          status:"helg",
          totalHours:total
        };
        continue;
      }
      if(dayType==="röddag"){
        map[ds] = {
          status:"röddag",
          totalHours:total
        };
        continue;
      }

      // vardag
      map[ds] = analyzeWorkday(list);
    }
    return map;
  }

  window.BalansRegler = {
    buildDayStatusMap
  };

})();