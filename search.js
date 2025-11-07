// search.js
// Tidrapport v10.15
// Global sök i localStorage (tidrapport_data_v10)

"use strict";

(function(){

  const DATA_KEY = "tidrapport_data_v10";
  let allRowsFlat = [];
  let lastResults = [];

  document.addEventListener("DOMContentLoaded", () => {
    const ysel = document.getElementById("yearFilter");
    if (!ysel) {
      // search.js är inkluderad även på index.html för kompatibilitet – gör inget där.
      return;
    }

    loadDataToFlat();
    fillYearFilter();
    runSearch();

    document.getElementById("searchBtn").addEventListener("click", runSearch);
    document.getElementById("exportBtn").addEventListener("click", exportResultsCSV);

    if (window.lucide) lucide.createIcons();
  });

  function loadDataToFlat(){
    let raw = {};
    try{
      raw = JSON.parse(localStorage.getItem(DATA_KEY) || "{}") || {};
    }catch{
      raw = {};
    }

    const flat = [];
    if (Array.isArray(raw)){
      raw.forEach(r => flat.push(r));
    } else {
      Object.keys(raw).forEach(k => {
        (raw[k] || []).forEach(r => flat.push(r));
      });
    }
    allRowsFlat = flat;
  }

  function fillYearFilter(){
    const ysel = document.getElementById("yearFilter");
    if (!ysel) return;

    const years = new Set();
    const curY = new Date().getFullYear();
    years.add(curY);

    allRowsFlat.forEach(r => {
      if (!r.datum) return;
      const y = new Date(r.datum).getFullYear();
      if (!isNaN(y)) years.add(y);
    });

    const sorted = [...years].sort((a,b)=>a-b);
    ysel.innerHTML = sorted.map(y =>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");
  }

  function runSearch(){
    const ysel = document.getElementById("yearFilter");
    if (!ysel) return;

    const year = parseInt(ysel.value,10);
    const proj = (document.getElementById("projectFilter").value || "").toLowerCase();
    const txt  = (document.getElementById("textFilter").value || "").toLowerCase();

    const tbody = document.querySelector("#resultTable tbody");
    const counter = document.getElementById("resultCount");
    tbody.innerHTML = "";

    lastResults = allRowsFlat.filter(r => {
      if (!r.datum) return false;
      const d = new Date(r.datum);
      if (d.getFullYear() !== year) return false;

      if (proj && !(r.projekt || "").toLowerCase().includes(proj)) return false;

      if (txt){
        const hay = [
          r.datum,
          r.projekt,
          r.kategori,
          r.tid,
          r.kortid,
          r.beskrivning
        ].map(v => String(v || "")).join(" ").toLowerCase();
        if (!hay.includes(txt)) return false;
      }

      return true;
    });

    if (!lastResults.length){
      tbody.innerHTML = `<tr><td colspan="6"><i>Inga träffar.</i></td></tr>`;
      counter.textContent = "0 träffar.";
      return;
    }

    lastResults
      .sort((a,b)=>a.datum.localeCompare(b.datum))
      .forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.datum || ""}</td>
          <td>${r.projekt || ""}</td>
          <td>${r.kategori || ""}</td>
          <td>${r.tid ?? ""}</td>
          <td>${r.kortid ?? ""}</td>
          <td>${(r.beskrivning || "").replace(/\r?\n/g," ")}</td>
        `;
        tbody.appendChild(tr);
      });

    counter.textContent = `${lastResults.length} träffar.`;
  }

  function exportResultsCSV(){
    if (!lastResults || !lastResults.length){
      alert("Inga träffar att exportera.");
      return;
    }

    const header = [
      "Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"
    ];
    const csv = [header.join(";")];

    lastResults.forEach(r => {
      csv.push([
        r.datum || "",
        r.projekt || "",
        r.kategori || "",
        r.tid ?? "",
        r.kortid ?? "",
        (r.beskrivning || "").replace(/\r?\n/g," ")
      ].join(";"));
    });

    const blob = new Blob(
      ["\uFEFF" + csv.join("\r\n")],
      {type:"text/csv;charset=utf-16le;"}
    );
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g,"-");
    a.href = URL.createObjectURL(blob);
    a.download = `Tidrapport_sokresultat_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

})();