// ===== export.js – hanterar CSV & PDF-exporter i Tidrapport =====

// CSV-export (UTF-16LE + BOM – Excel-kompatibel)
function exportToCSV(data, filename = "tidrapport.csv") {
  if (!data?.length) return alert("Ingen data att exportera!");
  const headers = Object.keys(data[0]).join(";");
  const rows = data.map((r) => Object.values(r).join(";"));
  const csv = [headers, ...rows].join("\n");

  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], {
    type: "text/csv;charset=utf-16le;",
  });

  if (navigator.share) {
    const file = new File([blob], filename, { type: "text/csv" });
    navigator.share({
      title: "Tidrapport",
      text: "CSV-export från Tidrapport",
      files: [file],
    }).catch(() => saveBlob(blob, filename));
  } else saveBlob(blob, filename);
}

// Hjälpmetod för nedladdning
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- PDF-export med jsPDF (A3-landskap) ---
async function exportToPDF(data, title = "Tidrapport", month = "", owner = "") {
  if (!data?.length) return alert("Ingen data att exportera!");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "landscape",
    format: "a3",
    unit: "pt",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  doc.text(`${title} – ${month}`, 40, 50);
  doc.setFontSize(10);
  if (owner) doc.text(`Rapport skapad av: ${owner}`, 40, 70);
  doc.setLineWidth(0.5);
  doc.line(40, 80, 1120, 80);

  const keys = Object.keys(data[0]);
  const headerY = 100;
  const rowHeight = 20;
  const colWidth = 90;

  // Rubriker
  keys.forEach((k, i) => {
    doc.text(k, 40 + i * colWidth, headerY);
  });

  // Rader
  data.forEach((r, rowIndex) => {
    const y = headerY + 15 + rowIndex * rowHeight;
    keys.forEach((k, i) => {
      const text = (r[k] ?? "").toString();
      doc.text(text, 40 + i * colWidth, y);
    });
  });

  const pdf = doc.output("blob");
  const filename = `${title.replace(/\s+/g, "_")}_${month}.pdf`;

  if (navigator.share) {
    const file = new File([pdf], filename, { type: "application/pdf" });
    navigator.share({
      title: "Tidrapport (PDF)",
      text: "PDF-export från Tidrapport",
      files: [file],
    }).catch(() => saveBlob(pdf, filename));
  } else saveBlob(pdf, filename);
}

// --- Gemensam funktion: dela JSON/CSV/PDF ---
function shareBackupJSON(jsonObj, filename = "tidrapport_backup.json") {
  const blob = new Blob([JSON.stringify(jsonObj, null, 2)], {
    type: "application/json",
  });
  if (navigator.share) {
    const file = new File([blob], filename, { type: "application/json" });
    navigator.share({
      title: "Tidrapport Backup",
      text: "Backup-fil från Tidrapport",
      files: [file],
    }).catch(() => saveBlob(blob, filename));
  } else saveBlob(blob, filename);
}

// --- Hjälpfunktion för månadsexport ---
function exportMonthCSV() {
  const data = getCurrentMonthData();
  const year = new Date().getFullYear();
  exportToCSV(data, `Tidrapport_${year}_${getCurrentMonthName()}.csv`);
}

function exportMonthPDF() {
  const data = getCurrentMonthData();
  const year = new Date().getFullYear();
  exportToPDF(data, "Tidrapport", getCurrentMonthName(), getOwnerName());
}

function exportYearCSV() {
  const data = getFullYearData();
  exportToCSV(data, `Tidrapport_${new Date().getFullYear()}.csv`);
}

function exportYearPDF() {
  const data = getFullYearData();
  exportToPDF(data, "Tidrapport – Årsrapport", "Hela året", getOwnerName());
}

// --- Mockup-funktioner (ska finnas i app.js) ---
function getCurrentMonthData() {
  return window.currentMonthData || [];
}
function getFullYearData() {
  return window.fullYearData || [];
}
function getCurrentMonthName() {
  return new Date().toLocaleString("sv-SE", { month: "long" });
}
function getOwnerName() {
  return window.settings?.name || "Okänd";
}

window.exportToCSV = exportToCSV;
window.exportToPDF = exportToPDF;
window.shareBackupJSON = shareBackupJSON;
window.exportMonthCSV = exportMonthCSV;
window.exportMonthPDF = exportMonthPDF;
window.exportYearCSV = exportYearCSV;
window.exportYearPDF = exportYearPDF;