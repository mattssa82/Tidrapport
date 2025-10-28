// ===== export.js – Export av CSV och PDF =====

(() => {
  // --- Hjälpfunktioner ---
  const saveFile = (blob, filename) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  const shareOrDownload = async (blob, filename, title) => {
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] })) {
      try {
        await navigator.share({
          title,
          files: [new File([blob], filename, { type: blob.type })]
        });
        return;
      } catch {/* användaren avbröt */}
    }
    saveFile(blob, filename);
  };

  // --- CSV-export (UTF-16 + BOM, Excel-kompatibel) ---
  function exportToCSV(data, filename = "tidrapport.csv") {
    if (!data?.length) return alert("Ingen data att exportera!");
    const headers = Object.keys(data[0]).join(";");
    const rows = data.map(r => Object.values(r).join(";"));
    const csv = [headers, ...rows].join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-16le;" });
    shareOrDownload(blob, filename, "Tidrapport – CSV");
  }

  // --- PDF-export (A3 landskap, Helvetica) ---
  async function exportToPDF(data, title = "Tidrapport", subtitle = "", owner = "") {
    if (!data?.length) return alert("Ingen data att exportera!");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.text(`${title} – ${subtitle}`, 40, 50);
    if (owner) {
      doc.setFontSize(10);
      doc.text(`Skapad av: ${owner}`, 40, 70);
    }

    // Rita tabell manuellt
    const keys = Object.keys(data[0]);
    const colWidth = 90;
    const startY = 100;
    const rowHeight = 20;
    doc.setFontSize(10);

    keys.forEach((k, i) => doc.text(k, 40 + i * colWidth, startY));
    data.forEach((r, ri) => {
      const y = startY + 15 + ri * rowHeight;
      keys.forEach((k, i) => {
        const txt = (r[k] ?? "").toString();
        doc.text(txt, 40 + i * colWidth, y);
      });
    });

    const blob = doc.output("blob");
    const filename = `${title.replace(/\s+/g, "_")}_${subtitle || "rapport"}.pdf`;
    shareOrDownload(blob, filename, "Tidrapport – PDF");
  }

  // --- Hjälpfunktioner för att hämta data ---
  const getCurrentMonthData = () => window.currentMonthData || [];
  const getFullYearData = () => window.fullYearData || [];
  const getCurrentMonthName = () => new Date().toLocaleString("sv-SE", { month: "long" });
  const getOwnerName = () => window.settings?.name || "Okänd";

  // --- Export-wrappers ---
  window.exportMonthCSV = () => {
    const data = getCurrentMonthData();
    exportToCSV(data, `Tidrapport_${new Date().getFullYear()}_${getCurrentMonthName()}.csv`);
  };
  window.exportYearCSV = () => {
    const data = getFullYearData();
    exportToCSV(data, `Tidrapport_${new Date().getFullYear()}.csv`);
  };
  window.exportMonthPDF = () => {
    const data = getCurrentMonthData();
    exportToPDF(data, "Tidrapport", getCurrentMonthName(), getOwnerName());
  };
  window.exportYearPDF = () => {
    const data = getFullYearData();
    exportToPDF(data, "Tidrapport – Årsrapport", "Hela året", getOwnerName());
  };

  console.log("%cExport.js laddad ✅", "color:green");
})();