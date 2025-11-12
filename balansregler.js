// balansregler.js
// Samlar alla regler för färg, larm och årsöversikt.
// Används av app.js och export.js.

const Balansregler = (() => {
  const WORKDAY_HOURS = 8;

  // Kategorier
  const CAT_ORD = "Ordinarie tid";
  const CAT_FLEX = "Flextid";
  const CAT_OT_LT2 = "Övertid <2";
  const CAT_OT_GT2 = "Övertid >2";
  const CAT_OT_HELG = "ÖT Helg";
  const CAT_SEM = "Semester";
  const CAT_SEM_TIM = "Semester-tim";
  const CAT_ATF = "ATF";
  const CAT_VAB = "VAB";
  const CAT_FL = "Föräldraledig";
  const CAT_SJUK = "Sjuk";
  const CAT_TRAKT = "Traktamente";

  const ABSENCE = [CAT_VAB, CAT_FL, CAT_SJUK];
  const NEG_BANK = [CAT_FLEX, CAT_OT_LT2, CAT_OT_GT2, CAT_OT_HELG, CAT_ATF, CAT_SEM_TIM];

  const monthNames = [
    "Januari","Februari","Mars","April","Maj","Juni",
    "Juli","Augusti","September","Oktober","November","December"
  ];

  function parseDate(str) {
    const [y,m,d] = str.split("-").map(Number);
    return new Date(y, m-1, d);
  }

  function isWeekend(str) {
    const d = parseDate(str).getDay();
    return d === 0 || d === 6;
  }

  function isRedDay(str, settings) {
    // Egna röda dagar (lista i localStorage som ISO)
    const extra = (settings.extraRedDays || []);
    if (extra.includes(str)) return true;
    // Här kan man lägga in fasta röda dagar om man vill.
    return false;
  }

  // Räknar ihop kategorier för en dag
  function summarizeDay(entries) {
    const sum = {};
    let drive = 0;
    for (const e of entries) {
      sum[e.category] = (sum[e.category] || 0) + e.hours;
      drive += (e.drive || 0);
    }
    return {sum, drive};
  }

  // Effektiv arbetstid enligt reglerna
  function effectiveOrdinary(sum) {
    let eff = sum[CAT_ORD] || 0;

    // Minusvärden i bank-kategorier räknas som plus Ordinarie.
    for (const cat of NEG_BANK) {
      const v = sum[cat] || 0;
      if (v < 0) eff += -v;
    }

    // Hela dagar med Semester / ATF etc ( -8 ) hanteras av reglerna ovan.

    return eff;
  }

  // Klassificera dag för larm och färg
  function classifyDay(dateStr, entries, settings, todayStr) {
    const date = parseDate(dateStr);
    const today = todayStr ? parseDate(todayStr) : new Date();
    const passed = date <= today;

    const weekend = isWeekend(dateStr);
    const red = isRedDay(dateStr, settings);

    if (weekend || red) {
      // Helg / röddag: inget larm.
      return {
        status: "ok",
        label: red ? "Röddag" : "Helg",
        color: "neutral",
        showAlarm: false
      };
    }

    if (!entries || entries.length === 0) {
      return {
        status: "missing",
        label: "Ingen registrering (vardag).",
        color: "warn",
        showAlarm: passed
      };
    }

    const {sum} = summarizeDay(entries);
    const eff = effectiveOrdinary(sum);

    if (eff >= WORKDAY_HOURS - 0.01) {
      return {
        status: "ok",
        label: "OK",
        color: "ok",
        showAlarm: false
      };
    }

    return {
      status: "under",
      label: "Under 8h registrerad tid.",
      color: "warn",
      showAlarm: passed
    };
  }

  // Årsöversikt
  function computeYearTotals(entries) {
    const result = {};
    for (let i=0;i<12;i++) {
      result[i+1] = {
        ord:0, drive:0, flex:0, otlt2:0, otgt2:0, othel:0,
        sem:0, atf:0, vab:0, fl:0, sjuk:0, trakt:0
      };
    }
    for (const e of entries) {
      const m = parseDate(e.date).getMonth()+1;
      const r = result[m];
      if (!r) continue;
      switch (e.category) {
        case CAT_ORD: r.ord += e.hours; break;
        case CAT_FLEX: r.flex += e.hours; break;
        case CAT_OT_LT2: r.otlt2 += e.hours; break;
        case CAT_OT_GT2: r.otgt2 += e.hours; break;
        case CAT_OT_HELG: r.othel += e.hours; break;
        case CAT_SEM:
        case CAT_SEM_TIM: r.sem += e.hours; break;
        case CAT_ATF: r.atf += e.hours; break;
        case CAT_VAB: r.vab += e.hours; break;
        case CAT_FL: r.fl += e.hours; break;
        case CAT_SJUK: r.sjuk += e.hours; break;
        case CAT_TRAKT: r.trakt += e.hours; break;
      }
      r.drive += (e.drive || 0);
    }
    return {monthNames, result};
  }

  return {
    WORKDAY_HOURS,
    CAT_ORD,
    ABSENCE,
    NEG_BANK,
    monthNames,
    summarizeDay,
    effectiveOrdinary,
    classifyDay,
    computeYearTotals,
    isWeekend,
    isRedDay
  };
})();