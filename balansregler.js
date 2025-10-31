// balansregler.js
// Tidrapport v10.3
// i samarbete med ChatGPT & Martin Mattsson

(function(){
  const FULL_DAY_EQUIV = [
    "semester","atf","atf-tim","flextid",
    "övertid <2","övertid >2","övertid-helg","övertid helg"
  ];

  const ABSENCE = [
    "vab","sjuk","sjuk-tim","föräldraledig","föräldraledighet"
  ];

  const FULL_DAY_HOURS = 8;

  function classifyDayType(dateStr, settings){
    const d = new Date(dateStr);
    if (isNaN(d)) return "vardag";
    const dow = d.getDay(); // 0=sön,6=lör
    if (dow === 0 || dow === 6) return "helg";

    const redList = (settings.redDays||"")
      .split(",").map(s=>s.trim()).filter(Boolean);

    if (settings.showRedDays && redList.includes(dateStr)){
      return "röddag";
    }
    return "vardag";
  }

  function analyzeWorkday(rowsThisDay){
    if(!rowsThisDay || !rowsThisDay.length){
      return {status:"saknas", totalHours:0};
    }

    let totalHours=0, ordinarie=0, hasFull=false, hasAbsOnly=true;
    rowsThisDay.forEach(r=>{
      const h=parseFloat(r.tid)||0;
      totalHours+=h;
      const cat=(r.kategori||"").toLowerCase();

      if(cat.includes("ordinarie")) {ordinarie+=h;hasAbsOnly=false;}
      if(FULL_DAY_EQUIV.some(x=>cat.includes(x)) && h>=FULL_DAY_HOURS){hasFull=true;hasAbsOnly=false;}
      if(!ABSENCE.some(a=>cat.includes(a)) && !cat.includes("trakt")) hasAbsOnly=false;
    });

    if(ordinarie>=FULL_DAY_HOURS || totalHours>=FULL_DAY_HOURS || hasFull)
      return {status:"grön", totalHours};

    if(hasAbsOnly)
      return {status:"orange_absence", totalHours};

    return {status:"orange_under", totalHours};
  }

  function buildDayStatusMap(monthRows, settings, yearNum, monthNum){
    const byDate={};
    (monthRows||[]).forEach(r=>{
      if(!r.datum)return;
      if(!byDate[r.datum])byDate[r.datum]=[];
      byDate[r.datum].push(r);
    });

    const daysInMonth=new Date(yearNum,monthNum,0).getDate();
    const map={};
    for(let d=1;d<=daysInMonth;d++){
      const ds=`${yearNum}-${String(monthNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const type=classifyDayType(ds,settings);
      if(type==="helg"){map[ds]={status:"helg",totalHours:0};continue;}
      if(type==="röddag"){map[ds]={status:"röddag",totalHours:0};continue;}
      map[ds]=analyzeWorkday(byDate[ds]||[]);
    }
    return map;
  }

  window.BalansRegler={buildDayStatusMap};
})();