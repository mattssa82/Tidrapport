// search.js  v10.0
// Global sökning och export av träffar från Tidrapport

"use strict";

(function() {

  const DATA_KEY = "tidrapport_data_v10";
  let allData = [];

  document.addEventListener("DOMContentLoaded", () => {
    loadData();
    fillYearFilter();
    document.getElementById("searchBtn").addEventListener("click", runSearch);
    document.getElementById("exportBtn").addEventListener("click", exportResults);
    if (window.lucide) lucide.createIcons();
  });

  function loadData() {
    try {
      allData = JSON.parse(localStorage.getItem(DATA_KEY) || "[]");
      if (!Array.isArray(allData)) allData = [];
    } catch {
      allData = [];
    }
  }

  function fillYearFilter() {
    const ysel = document.getElementById("yearFilter");
    if (!ysel) return;
    const years = new Set();
    const curY = new Date().getFullYear();
    years.add(curY);
    allData.forEach(r => {
      if (!r.datum) return;
      years.add(new Date(r.datum).getFullYear());
    });
    ysel.innerHTML = [...years]
      .sort((a, b) => a - b)
      .map(y => `<option value="${y}" ${y === curY ? "selected" : ""}>${y}</option>`)
      .join("");
  }

  function runSearch() {
    const year = parseInt(document.getElementById("yearFilter").value, 10);
    const proj = (document.getElementById("projectFilter").value || "").toLowerCase();
    const txt = (document.getElementById("textFilter").value || "").toLowerCase();
    const tbody = document.querySelector("#resultTable tbody");
    tbody.innerHTML = "";

    const res = allData.filter(r => {
      if (!r.datum) return false;
      const d = new Date(r.datum);
      if (d.getFullYear() !== year) return false;
      if (proj && !(r.projekt || "").toLowerCase().includes(proj)) return false;
      const fullTxt = (r.kategori + " " + (r.beskrivning || "")).toLowerCase();
      if (txt && !fullTxt.includes(txt)) return false;
      return true;
    });

    res.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.datum}</td>
        <td>${r.projekt || ""}</td>
        <td>${r.kategori || ""}</td>
        <td>${r.tid || ""}</td>
        <td>${r.kortid || ""}</td>
        <td>${(r.beskrivning || "").replace(/\r?\n/g, " ")}</td>`;
      tbody.appendChild(tr);
    });

    document.getElementById("resultCount").textContent = `${res.length} träffar.`;
    window.searchResults = res;
  }

  function exportResults() {
    const rows = window.searchResults || [];
    if (rows.length === 0) {
      alert("Inga träffar att exportera.");
      return;
    }

    const header = ["Datum", "Projekt", "Kategori(er)", "Tid (h)", "Körtid (h)", "Dagboksanteckning"];
    const csv = [header.join(";")];
    rows.forEach(r => {
      const row = [
        r.datum || "",
        r.projekt || "",
        r.kategori || "",
        r.tid || "",
        r.kortid || "",
        (r.beskrivning || "").replace(/\r?\n/g, " ")
      ];
      csv.push(row.join(";"));
    });

    const csvContent = "\uFEFF" + csv.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-16le;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `Tidrapport_sokresultat_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

})();