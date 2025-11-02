// export.js
// Tre exports:
// 1) exportMonthCSV
// 2) exportMonthPDF
// 3) exportYearCSV

// Hjälpare för CSV
function csvEscape(value) {
    if (value===null || value===undefined) value="";
    const str = String(value).replace(/"/g,'""');
    return `"${str}"`;
}

// MÅNAD CSV
// entriesMonth: de filtrerade posterna för månaden
function exportMonthCSV(entriesMonth, year, monthIdx) {
    // Kolumner vi skickar ut (håll samma struktur som du använt tidigare)
    // Datum; Projekt; Kategori; Tid (h); Körtid (h); Dagbok
    const header = [
        "Datum",
        "Projekt",
        "Kategori",
        "Tid (h)",
        "Körtid (h)",
        "Dagboksanteckning"
    ];

    const rows = [header];

    entriesMonth.forEach(ent=>{
        const cat = ent.items.map(it=>it.cat).join(", ");
        const tid = ent.items.reduce((s,it)=>s+it.hours,0);
        rows.push([
            ent.date,
            ent.project||"",
            cat,
            tid.toFixed(2),
            Number(ent.drive||0).toFixed(2),
            ent.note||""
        ]);
    });

    const csvLines = rows.map(r=>r.map(csvEscape).join(";")).join("\r\n");
    const blob = new Blob([csvLines], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const mm = (monthIdx+1).toString().padStart(2,"0");
    a.download = `tidrapport-${year}-${mm}.csv`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

// MÅNAD PDF
// Enkel jsPDF-export (landscape) med de viktigaste fälten.
// OBS: jsPDF måste redan vara inkluderad i din sida om du använder detta live.
// Här gör vi minimal boilerplate. Anpassa med din befintliga fungerande pdf-kod.
// Vi försöker undvika åäö-problem genom att bara använda text() i kortare rader,
// resten får du fortsätta utveckla om du har egen fungerande kod.
function exportMonthPDF(entriesMonth, year, monthIdx, settings) {
    if (typeof window.jsPDF==="undefined") {
        alert("PDF-export saknar jsPDF i denna build.");
        return;
    }
    const doc = new window.jsPDF({
        orientation:'landscape',
        unit:'pt',
        format:'a4'
    });

    const mm = (monthIdx+1).toString().padStart(2,"0");
    const title = `Tidrapport ${year}-${mm}`;

    doc.setFont("helvetica","normal");
    doc.setFontSize(14);
    doc.text(title,40,40);

    // Lite metadata
    doc.setFontSize(10);
    doc.text(`Företag: ${settings.company||""}`,40,60);
    doc.text(`Namn: ${settings.name||""}`,40,75);
    doc.text(`Anst.nr: ${settings.empNo||""}`,40,90);

    // tabellhuvud
    let y = 120;
    doc.setFontSize(10);
    doc.text("Datum",40,y);
    doc.text("Projekt",110,y);
    doc.text("Kategori",180,y);
    doc.text("Tid (h)",320,y);
    doc.text("Körtid (h)",380,y);
    doc.text("Anteckning",460,y);

    y += 15;
    entriesMonth.forEach(ent=>{
        const cat = ent.items.map(it=>it.cat).join(", ");
        const tid = ent.items.reduce((s,it)=>s+it.hours,0).toFixed(2);
        const drive = Number(ent.drive||0).toFixed(2);

        doc.text(ent.date||"",40,y);
        doc.text((ent.project||""),110,y);
        doc.text(cat,180,y);
        doc.text(tid,320,y);
        doc.text(drive,380,y);

        // anteckning kan vara lång, kapa
        const note = (ent.note||"").substring(0,60);
        doc.text(note,460,y);

        y+=15;
        // page break om y > ~500
        if (y>500){
            doc.addPage();
            y=60;
        }
    });

    doc.save(`tidrapport-${year}-${mm}.pdf`);
}

// ÅRSÖVERSIKT CSV
// yearAgg = buildYearAgg(currentYear) från app.js
// Kolumnordning enligt krav:
// Månad | Ordinarie | Körtid | Flex | ÖT<2 | ÖT>2 | Helg | Semester | ATF | VAB | Sjuk | Trakt | FL
function exportYearCSV(yearAgg, year) {
    const header = [
        "Månad",
        "Ordinarie",
        "Körtid",
        "Flex",
        "ÖT<2",
        "ÖT>2",
        "Helg",
        "Semester",
        "ATF",
        "VAB",
        "Sjuk",
        "Trakt",
        "FL"
    ];

    const MONTH_NAMES_SV = [
        "Januari","Februari","Mars","April","Maj","Juni",
        "Juli","Augusti","September","Oktober","November","December"
    ];

    const rows = [header];

    for (let m=0;m<12;m++){
        const rowAgg = yearAgg[m] || {cats:{},driveDates:{}};
        const cats = rowAgg.cats || {};
        let driveSum = 0;
        if (rowAgg.driveDates) {
            Object.values(rowAgg.driveDates).forEach(v=>driveSum+=v);
        }

        function cv(cat){
            return (cats[cat]||0).toFixed(2);
        }

        rows.push([
            MONTH_NAMES_SV[m],
            cv("Ordinarie tid"),
            driveSum.toFixed(2),
            cv("Flextid"),
            cv("ÖT<2"),
            cv("ÖT>2"),
            cv("ÖT-Helg"),
            cv("Semester"),
            cv("ATF"),
            cv("VAB"),
            cv("Sjuk"),
            cv("Trakt"),
            cv("FL")
        ]);
    }

    const csvLines = rows.map(r=>r.map(csvEscape).join(";")).join("\r\n");
    const blob = new Blob([csvLines], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `tidrapport-år-${year}.csv`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

// Exponera funktioner globalt så app.js kan anropa dem
window.exportMonthCSV = exportMonthCSV;
window.exportMonthPDF = exportMonthPDF;
window.exportYearCSV  = exportYearCSV;