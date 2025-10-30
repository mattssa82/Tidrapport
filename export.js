// ===== export.js – Tidrapport v9.7 =====
// Viktigt: Samma exportlayout som tidigare.
// Kolumner: MÅNAD;DATUM;PROJEKT;TID;KÖRTID;BESKRIVNING
// PDF använder samma rubriker i samma ordning.
// Nya fält som 'kategorier', 'katDisplay' tas inte med här.

(()=>{
  function rowsFromLS() {
    const data = JSON.parse(localStorage.getItem("tidrapport:data") || "{}");
    const rows = [];
    for (const m in data) {
      (data[m] || []).forEach(r => {
        rows.push([
          m,
          r.datum || "",
          r.projekt || "",
          r.tid || 0,
          r.kortid || 0,
          r.beskrivning || ""
        ]);
      });
    }
    return rows;
  }

  // CSV-export, med BOM (samma sätt som innan).
  window.exportCSV = () => {
    try {
      const rows = rowsFromLS();
      const csv = ["MÅNAD;DATUM;PROJEKT;TID;KÖRTID;BESKRIVNING"];
      rows.forEach(r => {
        csv.push(r.join(";"));
      });

      const blob = new Blob(["\uFEFF" + csv.join("\n")], {
        type: "text/csv;charset=utf-16le"
      });

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "tidrapport.csv";
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    } catch (e) {
      alert("Fel vid export till CSV: " + e.message);
    }
  };

  // PDF-export (liggande) samma rubriker
  window.exportPDF = () => {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "landscape" });
      const body = rowsFromLS();

      doc.setFontSize(11);
      doc.text("Tidrapport – Samlad export",14,12);

      doc.autoTable({
        startY:16,
        head:[["Månad","Datum","Projekt","Tid (h)","Körtid (h)","Beskrivning"]],
        body,
        theme:"grid",
        styles:{fontSize:8,cellPadding:2},
        headStyles:{fillColor:[14,102,119],textColor:255}
      });

      doc.save("tidrapport.pdf");
    } catch (e) {
      alert("Fel vid export till PDF: " + e.message);
    }
  };

  console.log("%cExport.js laddad ✅ (v9.7, oförändrat utseende)","color:green");
})();