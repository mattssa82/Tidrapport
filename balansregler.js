// balansregler.js
// Tidrapport v10.19
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){
  const FULL_DAY_HOURS = 8;

  // Negativa "bank-kategorier" som får omvandlas till ordinarie i balans
  const BANK_CATS = [
    "flextid",
    "atf",
    "övertid <2",
    "övertid >2",
    "övertid-helg",
    "övertid helg",
    "semester"
  ];

  const ABSENCE = [
    "vab",
    "sjuk",
    "föräldraledig",
    "föräldraledighet"
  ];

  function normalize(str){
    return (str||"").toString().trim().toLowerCase();
  }

  // Svenska röda dagar (förenklad, via standardregler)
  function easterSunday(year){
    // Anonymous Gregorian algorithm
    const f = Math.floor;
    const a = year % 19;
    const b = f(year / 100);
    const c = year % 100;
    const d = f(b / 4);
    const e = b % 4;
    const g = f((8 * b + 13) / 25);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = f(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = f((a + 11 * h + 19 * l) / 433);
    const n = f((h + l - 7 * m + 90) / 25);
    const p = (h + l - 7 * m + 33 * n + 19) % 32;
    return new Date(year, n - 1, p);
  }

  function formatDate(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${dd}`;
  }

  function getSwedishRedDays(year){
    const set = new Set();

    function add(y,m,d){ set.add(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`); }

    // fasta
    add(year,1,1);   // Nyårsdagen
    add(year,1,6);   // Trettondedag jul
    add(year,5,1);   // Första maj
    add(year,6,6);   // Nationaldagen
    add(year,12,25); // Juldagen
    add(year,12,26); // Annandag jul

    // rörliga kring påsk
    const easter = easterSunday(year);
    const goodFri = new Date(easter); goodFri.setDate(easter.getDate()-2);
    const easterMon = new Date(easter); easterMon.setDate(easter.getDate()+1);
    const asc = new Date(easter); asc.setDate(easter.getDate()+39);
    const pentecost = new Date(easter); pentecost.setDate(easter.getDate()+49);

    add(goodFri.getFullYear(), goodFri.getMonth()+1, goodFri.getDate());
    add(easter.getFullYear(), easter.getMonth()+1, easter.getDate());
    add(easterMon.getFullYear(), easterMon.getMonth()+1, easterMon.getDate());
    add(asc.getFullYear(), asc.getMonth()+1, asc.getDate());
    add(pentecost.getFullYear(), pentecost.getMonth()+1, pentecost.getDate());

    // Midsommardagen (lör mellan 20-26 juni)
    for(let d=20; d<=26; d++){
      const dt = new Date(year,5,d);
      if(dt.getDay()===6){ add(year,6,d); break; }
    }
    // Alla helgons dag (lör mellan 31 okt - 6 nov)
    for(let d=31; d<=37; d++){
      const dt = new Date(year,9,d>31?d-31+1:d); // enklare lösning undviker extra komplexitet
    }
    // För enkelhet hoppar vi exakt Alla helgons i detalj (påverkar mest färg, ej logik)

    return set;
  }

  function classifyDayType(dateStr){
    const d = new Date(dateStr);
    if(isNaN(d)) return "vardag";
    const dow = d.getDay(); // 0=Sun,6=Sat
    if(dow===0 || dow===6) return "helg";
    const reds = getSwedishRedDays(d.getFullYear());
    if(reds.has(dateStr)) return "röddag";
    return "vardag";
  }

  function analyzeWorkday(rowsForDay, settings){
    if(!rowsForDay || !rowsForDay.length){
      return { status:"saknas", totalHours:0, traktCount:0 };
    }

    let total=0;
    let ord=0;
    let trakt=0;
    let hasAbsenceOnly=true;

    rowsForDay.forEach(r=>{
      const h = parseFloat(r.tid) || 0;
      const cat = normalize(r.kategori);
      total += h;

      if(cat.includes("trakt")) {
        trakt++;
        return;
      }

      if(cat.includes("ordinarie")){
        ord += h;
        hasAbsenceOnly=false;
        return;
      }

      // bank-kategori med minus → tolkas som plus i ordinarie
      if(h<0 && BANK_CATS.some(b=>cat.includes(b))){
        ord += Math.abs(h);
        hasAbsenceOnly=false;
        return;
      }

      if(ABSENCE.some(a=>cat.includes(a))){
        // ren frånvaro
      }else{
        hasAbsenceOnly=false;
      }
    });

    if(ord >= FULL_DAY_HOURS){
      return { status:"grön", totalHours:ord, traktCount:trakt };
    }

    if(hasAbsenceOnly){
      return { status:"orange_absence", totalHours:total, traktCount:trakt };
    }

    if(ord > 0 && ord < FULL_DAY_HOURS){
      return { status:"orange_under", totalHours:ord, traktCount:trakt };
    }

    return { status:"orange_under", totalHours:total, traktCount:trakt };
  }

  // Bygg karta dag->status för given månad
  function buildDayStatusMap(rowsForMonth, settings, yearNum, monthNum){
    const byDate = {};
    (rowsForMonth||[]).forEach(r=>{
      if(!r.datum) return;
      if(!byDate[r.datum]) byDate[r.datum]=[];
      byDate[r.datum].push(r);
    });

    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const map = {};

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${yearNum}-${String(monthNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dayType = classifyDayType(ds);

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

      map[ds] = analyzeWorkday(byDate[ds]||[], settings);
    }

    return map;
  }

  window.BalansRegler = {
    buildDayStatusMap,
    classifyDayType
  };
})();