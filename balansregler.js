// balansregler.js
// Tidrapport v10.22
// i samarbete med ChatGPT & Martin Mattsson

(function(){

  const FULL_DAY_HOURS = 8;

  // Negativa (Flex/ATF/ÖT/Helg/Semester) räknas som plus Ordinarie vid bedömning
  const NEG_TO_ORD = ["flextid","atf","övertid <2","övertid >2","övertid-helg","öt-helg","semester"];

  // Frånvaro
  const ABSENCE = ["vab","sjuk","föräldraledig","föräldraledighet"];

  function isNegCat(cat){
    const c = (cat||"").toLowerCase();
    return NEG_TO_ORD.some(x => c.includes(x));
  }
  function isAbsence(cat){
    const c = (cat||"").toLowerCase();
    return ABSENCE.some(x => c.includes(x));
  }

  function swedishRedDays(year){
    // Lätt version: fasta + rörliga viktigaste (tillräckligt för vår markering)
    // Rörliga: Påsk, Annandag Påsk, Kristi Himmelsfärd
    const d = (y,m,day)=>`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const list = new Set([
      d(year,1,1),   // Nyårsdagen
      d(year,1,6),   // Trettondedag jul
      d(year,5,1),   // Första maj
      d(year,6,6),   // Nationaldagen
      d(year,12,25), // Juldagen
      d(year,12,26), // Annandag jul
    ]);

    // Påskberäkning (Anonymous Gregorian algorithm)
    const a = year % 19;
    const b = Math.floor(year/100);
    const c = year % 100;
    const d0 = Math.floor(b/4);
    const e = b % 4;
    const f = Math.floor((b+8)/25);
    const g = Math.floor((b - f + 1)/3);
    const h = (19*a + b - d0 - g + 15) % 30;
    const i = Math.floor(c/4);
    const k = c % 4;
    const l = (32 + 2*e + 2*i - h - k) % 7;
    const m0 = Math.floor((a + 11*h + 22*l)/451);
    const month = Math.floor((h + l - 7*m0 + 114)/31); // 3=March, 4=April
    const day = ((h + l - 7*m0 + 114) % 31) + 1;
    const easter = new Date(Date.UTC(year, month-1, day));
    const goodFriday = new Date(easter); goodFriday.setUTCDate(easter.getUTCDate()-2);
    const easterMon  = new Date(easter); easterMon.setUTCDate(easter.getUTCDate()+1);
    const ascension  = new Date(easter); ascension.setUTCDate(easter.getUTCDate()+39);

    const toIso = (dt)=>`${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
    list.add(toIso(goodFriday));   // Långfredag
    list.add(toIso(easterMon));    // Annandag påsk
    list.add(toIso(ascension));    // Kristi Himmelsfärd

    // Midsommardagen: lördag mellan 20–26 juni -> markeras som röd dag
    let mid = new Date(Date.UTC(year,5,20));
    while(mid.getUTCDay() !== 6){ mid.setUTCDate(mid.getUTCDate()+1); }
    list.add(toIso(mid));

    // Alla helgons dag: lördag mellan 31 okt–6 nov
    let allh = new Date(Date.UTC(year,9,31));
    while(allh.getUTCDay() !== 6 || allh.getUTCMonth()>9){ allh.setUTCDate(allh.getUTCDate()+1); }
    list.add(toIso(allh));

    return list;
  }

  function classifyDayType(dateStr, settings){
    const d = new Date(dateStr);
    if (isNaN(d)) return "vardag";
    const dow = d.getDay(); // 0=sön,6=lör
    if (dow===0 || dow===6) return "helg";

    const y = d.getFullYear();
    const redSet = swedishRedDays(y);
    if (settings.showRedDays && redSet.has(dateStr)){
      return "röddag";
    }
    return "vardag";
  }

  function analyzeWorkday(rowsThisDay, settings){
    if(!rowsThisDay || !rowsThisDay.length){
      return { status:"saknas", totalHours:0, traktCount:0 };
    }

    let ord=0, negToOrd=0, trakt=0, total=0;
    let onlyAbsence=true;

    rowsThisDay.forEach(r=>{
      const h = parseFloat(r.tid)||0;
      const cat = (r.kategori||"").toLowerCase();

      total += h;
      if (cat.includes("trakt")) trakt += 1;

      if (cat.includes("ordinarie")) { ord+=h; onlyAbsence=false; }

      if (isNegCat(cat) && h<0){ negToOrd += Math.abs(h); onlyAbsence=false; }

      if (!isAbsence(cat) && !cat.includes("trakt")) onlyAbsence=false;
    });

    const effective = ord + negToOrd;

    if (effective >= (settings.redDayStdHours||FULL_DAY_HOURS)){
      return { status:"grön", totalHours:effective, traktCount:trakt };
    }
    if (onlyAbsence){
      return { status:"orange_absence", totalHours:effective, traktCount:trakt };
    }
    return { status:"orange_under", totalHours:effective, traktCount:trakt };
  }

  function buildDayStatusMap(monthRows, settings, yearNum, monthNum){
    const byDate={};
    (monthRows||[]).forEach(r=>{
      if(!r.datum) return;
      if(!byDate[r.datum]) byDate[r.datum]=[];
      byDate[r.datum].push(r);
    });

    const daysInMonth=new Date(yearNum,monthNum,0).getDate();
    const map={};

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${yearNum}-${String(monthNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dayType = classifyDayType(ds, settings);

      if(dayType==="helg"){
        map[ds]={ status:"helg", totalHours:(byDate[ds]||[]).reduce((a,b)=>a+(parseFloat(b.tid)||0),0) };
        continue;
      }
      if(dayType==="röddag"){
        // Röddag: visas som röd men larmar ej
        map[ds]={ status:"röddag", totalHours:(byDate[ds]||[]).reduce((a,b)=>a+(parseFloat(b.tid)||0),0) };
        continue;
      }

      map[ds] = analyzeWorkday(byDate[ds]||[], settings);
    }
    return map;
  }

  window.BalansRegler = { buildDayStatusMap };

})();