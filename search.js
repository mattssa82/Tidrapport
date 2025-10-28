// ===== search.js – Sök- och filterlogik (Tidrapport Next Q4 2025) =====
const Search = (() => {

  const tbody = document.getElementById("resultBody");
  const fromEl = document.getElementById("fromDate");
  const toEl = document.getElementById("toDate");
  const typeEl = document.getElementById("filterType");
  const textEl = document.getElementById("filterText");

  // === Ladda alla rader från localStorage ===
  function loadAll() {
    try {
      const data = JSON.parse(localStorage.getItem("tidrapport:data") || "{}");
      return Object.values(data).flat();
    } catch {
      return [];
    }
  }

  // === Kör filter ===
  function runFilter() {
    const all = loadAll();
    const from = fromEl.value ? new Date(fromEl.value) : null;
    const to = toEl.value ? new Date(toEl.value) : null;
    const type = typeEl.value;
    const text = textEl.value.toLowerCase();

    const filtered = all.filter(r => {
      const d = new Date(r.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (type && r.type !== type) return false;
      if (text && !(`${r.project} ${r.desc}`.toLowerCase().includes(text))) return false;
      return true;
    });

    render(filtered);
  }

  // === Visa resultat ===
  function render(list) {
    tbody.innerHTML = "";
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6">Inga träffar.</td></tr>`;
      return;
    }
    list.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.date||""}</td>
        <td>${r.project||""}</td>
        <td>${r.type||""}</td>
        <td>${r.hours||""}</td>
        <td>${r.kortid||""}</td>
        <td>${r.desc||""}</td>`;
      tbody.appendChild(tr);
    });
    if(window.lucide) lucide.createIcons();
  }

  // === Rensa filter ===
  function clearFilter() {
    fromEl.value = toEl.value = textEl.value = "";
    typeEl.value = "";
    runFilter();
  }

  // === Exportera till CSV ===
  function exportCSV() {
    const rows = Array.from(tbody.querySelectorAll("tr")).map(tr =>
      Array.from(tr.cells).map(td => td.textContent)
    );
    if (rows.length <= 1) return alert("Inga rader att exportera!");
    const headers = ["Datum", "Projekt", "Kategori", "Tid", "Körtid", "Beskrivning"];
    const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-16le;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sökresultat.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  // === Exportera till PDF (autoTable) ===
  function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
    const rows = Array.from(tbody.querySelectorAll("tr")).map(tr =>
      Array.from(tr.cells).map(td => td.textContent)
    );
    if (rows.length <= 1) return alert("Inga rader att exportera!");
    doc.setFont("helvetica", "normal");
    doc.text("Sökresultat – Tidrapport", 40, 50);
    if (doc.autoTable) {
      doc.autoTable({
        head: [["Datum", "Projekt", "Kategori", "Tid", "Körtid", "Beskrivning"]],
        body: rows,
        startY: 70,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [14, 102, 119], textColor: 255 }
      });
    }
    doc.save("sökresultat.pdf");
  }

  return { runFilter, clearFilter, exportCSV, exportPDF };
})();

// === Init ===
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  Search.runFilter();
});

console.log("%cSearch.js laddad ✅ (Tidrapport Next Q4 2025)", "color:green");