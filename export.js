// ===== export.js – Export av CSV och PDF (autoTable-version, Q4 2025) =====
(() => {
  const saveFile = (blob, filename) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  const shareOrDownload = async (blob, filename, title) => {
    if (navigator.canShare && navigator.canShare({
      files: [new File([blob], filename, { type: blob.type })]
    })) {
      try {
        await navigator.share({
          title,
          files: [new File([blob], filename, { type: blob.type })]
        });
        return;
      } catch {}
    }
    saveFile(blob, filename);
  };

  // === CSV-export ===
  function exportToCSV(data, filename = "tidrapport.csv") {
    if (!data?.length) return alert("Ingen data att exportera!");
    const headers = Object.keys(data[0]).join(";");
    const rows = data.map(r => Object.values(r).join(";"));
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-16le;"
    });
    shareOrDownload(blob, filename, "Tidrapport – CSV");
  }

  // === PDF-export med autoTable ===
  async function exportToPDF(data, title = "Tidrapport", subtitle = "", owner = "") {
    if (!data?.length) return alert("Ingen data att exportera!");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a3"
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.text(`${title} – ${subtitle}`, 40, 50);
    if (owner) {
      doc.setFontSize(10);
      doc.text(`Skapad av: ${owner}`, 40, 70);
    }

    const body = data.map(r => Object.values(r).map(v => v ?? ""));
    const head = [Object.keys(data[0])];
    if (doc.autoTable) {
      doc.autoTable({
        head,
        body,
        startY: 90,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [14, 102, 119], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 249, 250] }
      });
    }
    const blob = doc.output("blob");
    const filename = `${title.replace(/\s+/g, "_")}_${subtitle || "rapport"}.pdf`;
    shareOrDownload(blob, filename, "Tidrapport – PDF");
  }

  // === Hjälpfunktioner ===
  const getCurrentMonthData = () => window.currentMonthData || [];
  const getFullYearData = () => window.fullYearData || [];
  const getCurrentMonthName = () =>
    new Date().toLocaleString("sv-SE", { month: "long" });
  const getOwnerName = () => (window.settings?.name) || "Okänd";

  // === Exports ===
  window.exportMonthCSV = () => {
    exportToCSV(
      getCurrentMonthData(),
      `Tidrapport_${new Date().getFullYear()}_${getCurrentMonthName()}.csv`
    );
  };
  window.exportYearCSV = () => {
    exportToCSV(
      getFullYearData(),
      `Tidrapport_${new Date().getFullYear()}.csv`
    );
  };
  window.exportMonthPDF = () => {
    exportToPDF(
      getCurrentMonthData(),
      "Tidrapport",
      getCurrentMonthName(),
      getOwnerName()
    );
  };
  window.exportYearPDF = () => {
    exportToPDF(
      getFullYearData(),
      "Tidrapport – Årsrapport",
      "Hela året",
      getOwnerName()
    );
  };

  console.log("%cExport.js laddad ✅ (autoTable Q4 2025)", "color:green");
})();