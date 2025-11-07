// balansregler.js
// Tidrapport v10.15
// i samarbete med ChatGPT & Martin Mattsson
//
// Ansvar: dagstatus för färg + larmlogikbas.

"use strict";

(function(){

  const FULL_DAY_HOURS = 8;

  // kategorier som räknas som bank/komp där negativa timmar betyder att du "tar ut" tid
  const BANK_CATS = ["flextid","atf","öt <2","öt >2","öt helg","övertid","övertid <2","övertid >2","övertid-helg"];
  const FULLDAY_CATS = ["semester"];

  const ABSENCE = ["vab","sjuk","föräldraledig","föräldraledighet"];

  // -----------------------
  // Svenska röda dagar (grunduppsättning)
  // -----------------------
  function getSwedishRedDays(year){
    const list = new Set();

    function fmt(m,d){
      return `${year}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    }

    // fasta
    list.add(fmt(1,1));   // Nyårsdagen
    list.add(fmt(1,6));   // Trettondedag jul
    list.add(fmt(5,1));   // Första maj
    list.add(fmt(6,6));   // Nationaldagen
    list.add(fmt(12,25)); // Juldagen
    list.add(fmt(12,26)); // Annandag jul

    // påskbaserade (enkel approx)
    const easter = calcEaster(year);
    const goodFri = addDays(easter, -2);
    const easterMon = addDays(easter, 1);
    list.add(toStr(goodFri));
    list.add(toStr(easterMon));

    // Kristi himmelsfärd (39 dagar efter påskdagen)
    list.add(toStr(addDays(easter,39)));

    // Pingstdagen (49 dagar efter påsk) brukade vara röd; hoppar.

    // Midsommardagen: lördag i intervallet 20-26 juni
    for (let d=20; d<=26; d++){
      const dt = new Date(year,5,d);
      if (dt.getDay()===6) list.add(toStr(dt));
    }

    // Alla helgons dag: lördag mellan 31 okt - 6 nov
    for (let m=9; m<=10; m++){
      for (let d=31; d<= (m===9?31:6); d++){
        const dt = new Date(year,m,d);
        if (dt.getDay()===6){
          list.add(toStr(dt));
          d = 40; // break
        }
      }
    }

    return list;
  }

  function calcEaster(Y){
    // Meeus/Jones/Butcher
    const a = Y % 19;
    const b = Math.floor(Y/100);
    const c = Y % 100;
    const d = Math.floor(b/4);
    const e = b % 4;
    const f = Math.floor((b+8)/25);
    const g = Math.floor((b-f+1)/3);
    const h = (19*a + b - d - g + 15) % 30;
    const i = Math.floor(c/4);
    const k = c % 4;
    const l = (32 + 2*e + 2*i - h - k) % 7;
    const m = Math.floor((a + 11*h + 22*l)/451);
    const month = Math.floor((h + l - 7*m + 114)/31); // 3=Mar,4=Apr
    const day = ((h + l - 7*m + 114) % 31) + 1;
    return new Date(Y, month-1, day);
  }

  function addDays(d,days){
    const nd = new Date(d);
    nd.setDate(nd.getDate()+days);
    return nd;
  }

  function toStr(d){
    const y = d.getFullYear();
    const m = d.getMonth()+1;
    const day = d.getDate();
    return `${y}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }

  // -----------------------
  // Klassificera dagtyp
  // -----------------------
  function classifyDayType(dateStr, settings){
    const d = new Date(dateStr);
    if (isNaN(d)) return "vardag";

    const dow = d.getDay(); // 0=sön,6=lör
    if (dow === 0 || dow === 6) return "helg";

    const reds = getSwedishRedDays(d.getFullYear());
    if (reds.has(dateStr)) {
      if (settings.showRedDays !== false) return "röddag";
      // även om man inte "visar" röddag -> behandla den som ej larm-pliktig
      return "röddag";
    }

    return "vardag";
  }

  // -----------------------
  // Analys av arbetsdag
  // -----------------------
  function analyzeWorkday(rows){
    if (!rows || !rows.length){
      return { status:"saknas", totalHours:0 };
    }

    let eff = 0;           // effektiva arbetstimmar
    let traktCnt = 0;
    let hasNonAbsence = false;
    let allAbsence = true;

    rows.forEach(r => {
      const cat = (r.kategori || "").toLowerCase();
      const h   = parseFloat(r.tid) || 0;

      if (cat.includes("trakt")) {
        traktCnt++;
        return;
      }

      const isAbs = ABSENCE.some(a => cat.includes(a));
      if (!isAbs) allAbsence = false;

      // bank & komp: både positiva och negativa timmar ger arbetseffekt
      if (BANK_CATS.some(b => cat.includes(b))) {
        eff += Math.abs(h);
        hasNonAbsence = true;
        return;
      }

      // full-day kategorier (semester etc)
      if (FULLDAY_CATS.some(b => cat.includes(b))) {
        eff += Math.abs(h);
        hasNonAbsence = true;
        return;
      }

      // ordinarie
      if (cat.includes("ordinarie")) {
        eff += h;
        if (h !== 0) hasNonAbsence = true;
        return;
      }

      // övrigt: räknas inte som arbetstid här
    });

    if (eff >= FULL_DAY_HOURS){
      return { status:"grön", totalHours:eff, traktCount:traktCnt };
    }

    if (allAbsence && rows.length){
      return { status:"orange_absence", totalHours:eff, traktCount:traktCnt };
    }

    if (hasNonAbsence && eff < FULL_DAY_HOURS){
      return { status:"orange_under", totalHours:eff, traktCount:traktCnt };
    }

    // annars saknas / konstigt
    return { status:"saknas", totalHours:eff, traktCount:traktCnt };
  }

  // -----------------------
  // Karta: datum -> status
  // -----------------------
  function buildDayStatusMap(monthRows, settings, yearNum, monthNum){
    const byDate = {};
    (monthRows || []).forEach(r => {
      if (!r.datum) return;
      if (!byDate[r.datum]) byDate[r.datum] = [];
      byDate[r.datum].push(r);
    });

    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const map = {};

    for (let d=1; d<=daysInMonth; d++){
      const ds = `${yearNum}-${String(monthNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dayType = classifyDayType(ds, settings || {});

      const rows = byDate[ds] || [];

      if (dayType === "helg"){
        map[ds] = {
          status:"helg",
          totalHours:rows.reduce((a,b)=>a+(parseFloat(b.tid)||0),0)
        };
        continue;
      }

      if (dayType === "röddag"){
        // röddagar ger aldrig "saknas"-larm
        map[ds] = {
          status:"röddag",
          totalHours:rows.reduce((a,b)=>a+(parseFloat(b.tid)||0),0)
        };
        continue;
      }

      // vardag
      map[ds] = analyzeWorkday(rows);
    }

    return map;
  }

  window.BalansRegler = {
    buildDayStatusMap
  };

})();