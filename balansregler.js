// balansregler.js
// Tidrapport v10.4
// i samarbete med ChatGPT & Martin Mattsson
//
// Ger dagstatus (för radfärg + larm)

(function(){

  // Kategorier som räknas som "full dag" själva om de täcker ~8h,
  // eller annan heldagsfrånvaro som vi vill acceptera som OK dag.
  const FULL_DAY_EQUIV = [
    "ordinarie",        // ordinarie tid kan räknas via timmar ändå
    "semester",
    "atf",
    "atf-tim",
    "flextid",
    "övertid <2",
    "övertid >2",
    "övertid-helg",
    "övertid helg"
  ];

  // Frånvaro som ska markeras som frånvaro (gul/orange_absence)
  // och inte bli "grön"
  const ABSENCE = [
    "vab",
    "sjuk",
    "sjuk-tim",
    "föräldraledig",
    "föräldraledighet"
  ];

  // Minsta timmar vi tycker är "en hel dag"
  // OBS: vi tar hänsyn till inställningen holidayHours separat för röd dag
  const FULL_DAY_HOURS_DEFAULT = 8;

  function classifyDayType(dateStr){
    const d = new Date(dateStr);
    if (isNaN(d)) return "vardag";
    const dow = d.getDay(); // 0=sön 6=lör
    if (dow === 0 || dow === 6) return "helg";
    return "vardag";
  }

  // Kollar om datum är röd dag via inställning holidayHours:
  // Vi markerar "röddag" om holidayHours > 0 och användaren vill ge
  // en full dag utan krav på inmatning.
  // (Dina gamla manuella röda dagar med lista togs bort. Nu styr du timmarna.)
  function isCustomRedDay(dateStr, holidayHours){
    // Här kan du själv lägga logik i framtiden (t ex helgdagstabell).
    // Just nu: vi har ingen lista över röda datum automatiskt.
    // Du sa att manuella röda dagar ska bort och ersättas av ett värde i Inställningar.
    // Så: vi returnerar false här. Det gör att allt som inte är helg är vardag.
    // Men vi RESPEKTERAR holidayHours i larm-logiken för dag utan registrering.
    // (Se analyzeWorkday)
    return false;
  }

  function analyzeWorkday(rowsThisDay, holidayHours){
    if(!rowsThisDay || !rowsThisDay.length){
      // ingen rad
      // Kan ändå vara OK om det är "röddag" och holidayHours räknas som full dag?
      // Eftersom vi inte längre har separat lista över röda datum,
      // holidayHours används inte som automatisk "grön dag" här.
      // Dvs tom vardag blir "saknas".
      return {
        status:"saknas",
        totalHours:0,
        traktCount:0
      };
    }

    let totalHours=0;
    let ordinarieHours=0;
    let hasFullDayEquiv=false;
    let hasAbsenceOnly=true;
    let traktCount=0;

    rowsThisDay.forEach(r=>{
      const h = parseFloat(r.tid)||0;
      totalHours += h;

      const cat=(r.kategori||"").toLowerCase();

      if(cat.includes("ordinarie")){
        ordinarieHours+=h;
        hasAbsenceOnly=false;
      }

      // Heldags-ekvivalent kategori
      if(
        FULL_DAY_EQUIV.some(x=>cat.includes(x)) &&
        h >= FULL_DAY_HOURS_DEFAULT
      ){
        hasFullDayEquiv=true;
        hasAbsenceOnly=false;
      }

      if(cat.includes("trakt")){
        traktCount += 1;
      }

      if(
        !ABSENCE.some(a=>cat.includes(a)) &&
        !cat.includes("trakt")
      ){
        hasAbsenceOnly=false;
      }
    });

    // Grön om full dag
    if(
      ordinarieHours >= FULL_DAY_HOURS_DEFAULT ||
      totalHours >= FULL_DAY_HOURS_DEFAULT ||
      hasFullDayEquiv
    ){
      return {
        status:"grön",
        totalHours,
        traktCount
      };
    }

    // Endast frånvaro => orange_absence
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

  // Bygg karta yyyy-mm-dd -> {status,...}
  function buildDayStatusMap(monthRows, settings, yearNum, monthNum){
    const byDate={};
    (monthRows||[]).forEach(r=>{
      if(!r.datum) return;
      if(!byDate[r.datum]) byDate[r.datum]=[];
      byDate[r.datum].push(r);
    });

    const daysInMonth=new Date(yearNum,monthNum,0).getDate();
    const map={};
    const holHours = settings && typeof settings.holidayHours==="number"
      ? settings.holidayHours
      : FULL_DAY_HOURS_DEFAULT;

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${yearNum}-${String(monthNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

      const dayType = classifyDayType(ds);
      const redDay = isCustomRedDay(ds, holHours); // alltid false just nu

      if(dayType==="helg"){
        map[ds]={
          status:"helg",
          totalHours:(byDate[ds]||[]).reduce((a,b)=>a+(parseFloat(b.tid)||0),0)
        };
        continue;
      }
      if(redDay){
        // om vi i framtiden gör röda dagar -> egen klass
        map[ds]={
          status:"röddag",
          totalHours:(byDate[ds]||[]).reduce((a,b)=>a+(parseFloat(b.tid)||0),0)
        };
        continue;
      }

      // vardag
      map[ds]=analyzeWorkday(byDate[ds]||[], holHours);
    }

    return map;
  }

  window.BalansRegler = {
    buildDayStatusMap
  };
})();