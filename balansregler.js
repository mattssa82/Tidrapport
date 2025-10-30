// balansregler.js
// v10.0
// Logik för dagsstatus (balansfärger + saknas) i månadslistan

(function () {
  // Kategorier som kan räknas som full dag själva (semester, komp, flex -8, osv)
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

  // Frånvaro som INTE ska bli grön (utan orange_absence)
  const ABSENCE = [
    "vab",
    "sjuk",
    "sjuk-tim",
    "föräldraledig",
    "föräldraledighet"
  ];

  const FULL_DAY_HOURS = 8;

  // avgör helg/röddag
  function classifyDayType(dateStr, settings) {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;

    const dow = d.getDay(); // 0=sön,6=lör
    if (dow === 0 || dow === 6) {
      return "helg";
    }

    // manuella röda dagar från inställningar
    const customRedDays = (settings.redDays || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if (settings.showRedDays && customRedDays.includes(dateStr)) {
      return "röddag"; // röd dag (t.ex. helgdag, nationaldag)
    }

    return "vardag";
  }

  // tar alla rader för ett datum och bedömer status: grön / orange_under / orange_absence
  function analyzeWorkday(rowsThisDay) {
    if (!rowsThisDay || rowsThisDay.length === 0) {
      return {
        status: "saknas",
        totalHours: 0,
        traktCount: 0
      };
    }

    let totalHours = 0;
    let ordinarieHours = 0;
    let hasFullDayEquiv = false;
    let hasAbsenceOnly = true;
    let traktCount = 0;

    rowsThisDay.forEach(row => {
      const t = parseFloat(row.tid) || 0;
      totalHours += t;

      // vi kör defensivt: rad kan ha katDisplay eller kategori
      const catRaw =
        (row.kategori || row.katDisplay || "")
          .toString()
          .toLowerCase();

      // ordinarie tid lyfter dagen mot grön
      if (catRaw.includes("ordinarie")) {
        ordinarieHours += t;
        hasAbsenceOnly = false;
      }

      // full day equiv (semester, flextid -8, komp etc.)
      if (
        FULL_DAY_EQUIV.some(key =>
          catRaw.includes(key)
        ) &&
        t >= FULL_DAY_HOURS
      ) {
        hasFullDayEquiv = true;
        hasAbsenceOnly = false;
      }

      // traktamente -> räknas, men gör inte dagen grön/inte grön
      if (catRaw.includes("trakt")) {
        traktCount += 1;
      }

      // om den inte är ren frånvaro, då är det inte "absence only"
      if (
        !ABSENCE.some(abs =>
          catRaw.includes(abs)
        ) &&
        !catRaw.includes("trakt")
      ) {
        hasAbsenceOnly = false;
      }
    });

    // Regel 1: dagen är "grön" om den anses fullgod
    // - 8h ordinarie
    // - eller total timmar >=8 (t.ex. ordinarie + flex)
    // - eller full-day-ekvivalent (semester etc)
    if (
      ordinarieHours >= FULL_DAY_HOURS ||
      totalHours >= FULL_DAY_HOURS ||
      hasFullDayEquiv
    ) {
      return {
        status: "grön",
        totalHours,
        traktCount
      };
    }

    // Regel 2: om dagen bara är frånvaro (VAB, Sjuk, Föräldraledighet)
    // → markera orange_absence
    if (hasAbsenceOnly) {
      return {
        status: "orange_absence",
        totalHours,
        traktCount
      };
    }

    // Regel 3: jobbat men inte klar dag → orange_under
    return {
      status: "orange_under",
      totalHours,
      traktCount
    };
  }

  // bygger en karta över alla datum i vald månad -> status
  // returnerar t.ex.
  // {
  //   "2025-10-01": { status:"grön", ... },
  //   "2025-10-02": { status:"saknas", ... },
  //   ...
  // }
  function buildDayStatusMap(rowsForMonth, settings, yearNum, monthNum /*1-12*/) {
    const map = {};

    // gruppera rader per datum
    const byDate = {};
    rowsForMonth.forEach(r => {
      if (!r.datum) return;
      if (!byDate[r.datum]) byDate[r.datum] = [];
      byDate[r.datum].push(r);
    });

    // hur många dagar finns i den månaden
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

      // kolla om helg/röd dag
      const dayType = classifyDayType(dateStr, settings);

      if (dayType === "helg") {
        // helg = egen visuell markering, aldrig "saknas"-röd
        map[dateStr] = {
          status: "helg",
          totalHours: (byDate[dateStr] || []).reduce((a, b) => a + (parseFloat(b.tid) || 0), 0)
        };
        continue;
      }

      if (dayType === "röddag") {
        // röd dag = egen markering, ingen varning om tom
        map[dateStr] = {
          status: "röddag",
          totalHours: (byDate[dateStr] || []).reduce((a, b) => a + (parseFloat(b.tid) || 0), 0)
        };
        continue;
      }

      // vanlig vardag → analysera
      const analysis = analyzeWorkday(byDate[dateStr] || []);
      map[dateStr] = analysis;
    }

    return map;
  }

  // Exponera globalt så app.js kan kalla
  window.BalansRegler = {
    buildDayStatusMap
  };
})();