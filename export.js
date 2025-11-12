// export.js
// Export av månad (CSV/PDF), årsöversikt (CSV) och sökresultat.

const Exporter = (() => {

  function download(filename, content, type = "text/csv;charset=utf-8") {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportMonthCsv(year, month, entries) {
    const ymEntries = entries.filter(e => {
      const [y,m] = e.date.split("-").map(Number);
      return y === year && m === month;
    }).sort((a,b) => (a.date+a.id).localeCompare(b.date+b.id));

    if (ymEntries.length === 0) {
      alert("Inga rader denna månad.");
      return;
    }

    const header = ["Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"];
    const rows = [header.join(";")];

    const grouped = groupBy(ymEntries, e => e.id);
    Object.keys(grouped).forEach(id => {
      const list = grouped[id];
      list.forEach((e, idx) => {
        rows.push([
          idx===0 ? e.date : "",
          idx===0 ? clean(e.project) : "",
          clean(e.category),
          num(e.hours),
          idx===0 ? num(e.drive || 0) : "",
          idx===0 ? clean(e.note || "") : ""
        ].join(";"));
      });
    });

    // Summering nederst (enkelt)
    const sums = {};
    let totalDrive = 0;
    ymEntries.forEach(e => {
      sums[e.category] = (sums[e.category] || 0) + e.hours;
      totalDrive += (e.drive || 0);
    });

    rows.push("");
    rows.push(["SUMMERING"].join(";"));
    Object.keys(sums).forEach(cat=>{
      rows.push([cat, "", "", num(sums[cat])].join(";"));
    });
    rows.push(["Körtid totalt", "", "", num(totalDrive)].join(";"));

    const csv = rows.join("\r\n");
    const filename = `Tidrapport_${year}-${String(month).padStart(2,"0")}.csv`;
    download(filename, csv);
  }

  function exportMonthPdf(year, month, entries, settings={}) {
    const ymEntries = entries.filter(e => {
      const [y,m] = e.date.split("-").map(Number);
      return y === year && m === month;
    }).sort((a,b) => (a.date+a.id).localeCompare(b.date+b.id));

    if (ymEntries.length === 0) {
      alert("Inga rader denna månad.");
      return;
    }

    if (!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable)) {
      alert("jsPDF/autoTable saknas. Kontrollera script-taggarna.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "mm", "a3");

    const title = `Tidrapport ${year}-${String(month).padStart(2,"0")} (${settings.name || ""})`;
    doc.setFontSize(14);
    doc.text(title, 14, 14);

    const body = [];
    const grouped = groupBy(ymEntries, e => e.id);

    Object.keys(grouped).forEach(id => {
      const list = grouped[id];
      list.forEach((e, idx) => {
        body.push([
          idx===0 ? e.date : "",
          idx===0 ? (e.project || "") : "",
          e.category,
          num(e.hours),
          idx===0 ? num(e.drive || 0) : "",
          idx===0 ? (e.note || "") : ""
        ]);
      });
    });

    doc.autoTable({
      startY: 20,
      head: [["Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"]],
      body,
      styles: { fontSize: 9 }
    });

    const filename = `Tidrapport_${year}-${String(month).padStart(2,"0")}.pdf`;
    doc.save(filename);
  }

  function exportYearCsv(entries) {
    const {monthNames, result} = Balansregler.computeYearTotals(entries);
    const header = ["Månad","Ordinarie","Körtid","Flex","ÖT<2","ÖT>2","ÖT Helg","Semester","ATF","VAB","FL","Sjuk","Trakt"];
    const rows = [header.join(";")];

    for (let m = 1; m <= 12; m++) {
      const r = result[m];
      rows.push([
        monthNames[m-1],
        num(r.ord), num(r.drive), num(r.flex),
        num(r.otlt2), num(r.otgt2), num(r.othel),
        num(r.sem), num(r.atf),
        num(r.vab), num(r.fl), num(r.sjuk),
        r.trakt || 0
      ].join(";"));
    }

    const csv = rows.join("\r\n");
    const filename = `Tidrapport_Årsöversikt_${new Date().toISOString().slice(0,10)}.csv`;
    download(filename, csv);
  }

  // Sök-export (används i search.js)
  function exportRowsCsv(label, rows) {
    if (!rows || rows.length === 0) {
      alert("Inga rader att exportera.");
      return;
    }
    const header = ["Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"];
    const out = [header.join(";")];
    rows.forEach(r => {
      out.push([
        r.date,
        clean(r.project || ""),
        clean(r.category || ""),
        num(r.hours || 0),
        num(r.drive || 0),
        clean(r.note || "")
      ].join(";"));
    });
    const csv = out.join("\r\n");
    const filename = `Tidrapport_${label}_${new Date().toISOString()}.csv`;
    download(filename, csv);
  }

  // Helpers
  function groupBy(arr, fn) {
    const m = {};
    arr.forEach(e=>{
      const k = fn(e);
      (m[k] = m[k] || []).push(e);
    });
    return m;
  }
  function clean(s) {
    return String(s).replace(/[\r\n]+/g, " ").replace(/;/g, ",");
  }
  function num(v) {
    return (Math.round((v||0)*100)/100).toString().replace(".", ",");
  }

  return {
    exportMonthCsv,
    exportMonthPdf,
    exportYearCsv,
    exportRowsCsv
  };
})();