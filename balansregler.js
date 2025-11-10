// balansregler.js  v10.18
// Central logik för balans, dagstatus, larm, årsöversikt.
// I samarbete med ChatGPT & Martin Mattsson.

"use strict";

window.Balans = (function(){

  function isCat(name, arr){
    if(!name) return false;
    const n = String(name).toLowerCase();
    return arr.some(x => n.includes(x));
  }

  const CAT = {
    ORD: ['ordinarie'],
    FLEX: ['flex'],
    ATF: ['atf'],
    OT_LT: ['övertid <2','öt <2'],
    OT_GT: ['övertid >2','öt >2'],
    OT_HELG: ['övertid-helg','övertid helg','öt-helg','öt helg'],
    SEM: ['semester'],
    VAB: ['vab'],
    SJUK: ['sjuk'],
    FL: ['föräldraledig','f-led'],
    TRAKT: ['trakt']
  };

  function parseUserRedDays(str){
    if(!str) return new Set();
    return new Set(
      str.split(/[,\s]+/)
        .map(s=>s.trim())
        .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
    );
  }

  function getStandardRedHours(settings){
    const v = parseFloat(settings?.redDayHours);
    return Number.isFinite(v) && v>0 ? v : 8;
  }

  function isWeekend(dateStr){
    const d = new Date(dateStr+"T00:00");
    const dow = d.getDay();
    return dow===0 || dow===6;
  }

  // Summerar "effektiv dag" enligt överenskomna regler
  function summarizeDay(rows){
    let eff = 0;
    let kortid = 0;
    let trakt = 0;

    rows.forEach(r=>{
      const h = parseFloat(r.tid ?? r.hours) || 0;
      const k = parseFloat(r.kortid) || 0;
      const c = (r.kategori || r.category || "").toLowerCase();

      kortid += k;

      if(isCat(c, CAT.TRAKT)){
        trakt += 1;
        return;
      }

      if(isCat(c, CAT.ORD)){
        if(h>0) eff += h;
        return;
      }

      // Negativa bank-timmar → tas ut som Ordinarie
      if(h<0 && (isCat(c, CAT.FLEX) || isCat(c, CAT.ATF) ||
                 isCat(c, CAT.OT_LT) || isCat(c, CAT.OT_GT) ||
                 isCat(c, CAT.OT_HELG) || isCat(c, CAT.SEM))){
        eff += -h;
        return;
      }

      // Positiva på dessa räknas också som arbetad tid (tillsammans med ordinarie)
      if(h>0 && (isCat(c, CAT.FLEX) || isCat(c, CAT.ATF) ||
                 isCat(c, CAT.OT_LT) || isCat(c, CAT.OT_GT) ||
                 isCat(c, CAT.OT_HELG) || isCat(c, CAT.SEM))){
        eff += h;
        return;
      }

      // VAB/Sjuk/FL → påverkar inte eff (frånvaro)
      if(isCat(c, CAT.VAB) || isCat(c, CAT.SJUK) || isCat(c, CAT.FL)){
        return;
      }

      // Övrigt → lägg till som arbetstid
      eff += h;
    });

    return { eff, kortid, trakt };
  }

  function getDayStatus(dateStr, rows, isRed){
    const { eff } = summarizeDay(rows || []);

    if(!rows || !rows.length){
      if(isWeekend(dateStr) || isRed){
        return { code:"FREE", label:"Ledig", color:"none" };
      }
      return { code:"MISSING", label:"Ingen registrering", color:"red" };
    }

    if(isWeekend(dateStr) || isRed){
      return { code:"OK", label:"Helg/röddag", color:"none" };
    }

    if(eff >= 8){
      return { code:"OK", label:"OK (minst 8h)", color:"green" };
    }

    return { code:"UNDER", label:"Under 8h", color:"orange" };
  }

  // Larm-lista för en månad, bara passerade vardagar utan OK
  function buildLarm(rows, year, month, settings){
    const res = [];
    const reds = parseUserRedDays(settings?.userRedDays);
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    for(let d=1; d<=daysInMonth; d++){
      const ds = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dt = new Date(ds+"T00:00");
      if(dt > today) continue;

      const isRed = settings?.showRedDays && reds.has(ds);
      if(isWeekend(ds) || isRed) continue;

      const r = (rows||[]).filter(x=>x.datum===ds);
      const st = getDayStatus(ds, r, false);

      if(st.code === "MISSING" || st.code === "UNDER"){
        res.push({ date:ds, status:st.label, code:st.code });
      }
    }
    return res;
  }

  // Årsöversiktssummor
  function buildYearSummary(rows, year){
    const out = Array.from({length:12},(_,i)=>({
      month:i+1,
      ord:0,kortid:0,flex:0,ot_lt:0,ot_gt:0,
      sem:0,atf:0,vab:0,sjuk:0,fl:0,trakt:0
    }));

    (rows||[]).forEach(r=>{
      if(!r.datum) return;
      const y = parseInt(r.datum.slice(0,4),10);
      if(y !== Number(year)) return;
      const m = parseInt(r.datum.slice(5,7),10);
      if(m<1 || m>12) return;

      const idx = m-1;
      const h = parseFloat(r.tid) || 0;
      const k = parseFloat(r.kortid) || 0;
      const c = (r.kategori || "").toLowerCase();

      out[idx].kortid += k;

      if(isCat(c, CAT.TRAKT)) out[idx].trakt += 1;
      else if(isCat(c, CAT.ORD)) out[idx].ord += h;
      else if(isCat(c, CAT.FLEX)) out[idx].flex += h;
      else if(isCat(c, CAT.OT_LT)) out[idx].ot_lt += h;
      else if(isCat(c, CAT.OT_GT) || isCat(c, CAT.OT_HELG)) out[idx].ot_gt += h;
      else if(isCat(c, CAT.SEM)) out[idx].sem += h;
      else if(isCat(c, CAT.ATF)) out[idx].atf += h;
      else if(isCat(c, CAT.VAB)) out[idx].vab += h;
      else if(isCat(c, CAT.SJUK)) out[idx].sjuk += h;
      else if(isCat(c, CAT.FL)) out[idx].fl += h;
    });

    return out;
  }

  return {
    parseUserRedDays,
    getStandardRedHours,
    summarizeDay,
    getDayStatus,
    buildLarm,
    buildYearSummary
  };
})();