// search.js - Tidrapport v10.18
// Global sök i localStorage (tidrapport_data_v10)

"use strict";

(function(){

  const DATA_KEY = "tidrapport_data_v10";
  let allRows = [];
  let lastResults = [];

  document.addEventListener("DOMContentLoaded", ()=>{
    const yearFilter = document.getElementById("yearFilter");
    const searchBtn  = document.getElementById("searchBtn");
    const exportBtn  = document.getElementById("exportBtn");

    loadAllRows();
    fillYearFilter();

    if(yearFilter && yearFilter.value){
      runSearch();
    }

    if(searchBtn) searchBtn.addEventListener("click", runSearch);
    if(exportBtn) exportBtn.addEventListener("click", exportResultsCSV);

    if(window.lucide) lucide.createIcons();
  });

  function loadAllRows(){
    try{
      const raw = JSON.parse(localStorage.getItem(DATA_KEY) || "{}") || {};
      const flat = [];
      Object.keys(raw).forEach(m=>{
        (raw[m]||[]).forEach(r=>flat.push(r));
      });
      allRows = flat;
    }catch{
      allRows = [];
    }
  }

  function fillYearFilter(){
    const sel = document.getElementById("yearFilter");
    if(!sel) return;
    const years = new Set();
    const curY = new Date().getFullYear();
    years.add(curY);

    allRows.forEach(r=>{
      if(!r.datum) return;
      const y = new Date(r.datum).getFullYear();
      if(!isNaN(y)) years.add(y);
    });

    const sorted = [...years].sort((a,b)=>a-b);
    sel.innerHTML = sorted.map(y =>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");
  }

  function runSearch(){
    const ySel = document.getElementById("yearFilter");
    const pInp = document.getElementById("projectFilter");
    const tInp = document.getElementById("textFilter");
    const tbody = document.querySelector("#resultTable tbody");
    const countEl = document.getElementById("resultCount");
    if(!ySel || !tbody || !countEl) return;

    const year = parseInt(ySel.value,10);
    const proj = (pInp?.value || "").toLowerCase();
    const txt  = (tInp?.value || "").toLowerCase();

    lastResults = allRows.filter(r=>{
      if(!r.datum) return false;
      const d = new Date(r.datum);
      if(d.getFullYear() !== year) return false;

      if(proj && !(r.projekt||"").toLowerCase().includes(proj)) return false;

      if(txt){
        const blob = [
          r.datum, r.projekt, r.kategori,
          r.tid, r.kortid, r.beskrivning
        ].map(v=>String(v||"").toLowerCase()).join(" ");
        if(!blob.includes(txt)) return false;
      }
      return true;
    });

    tbody.innerHTML = "";
    if(!lastResults.length){
      tbody.innerHTML = `<tr><td colspan="6"><i>Inga träffar.</i></td></tr>`;
      countEl.textContent = "0 träffar.";
      return;
    }

    lastResults.forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.datum||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${r.tid ?? ""}</td>
        <td>${r.kortid ?? ""}</td>
        <td>${(r.beskrivning||"").replace(/\r?\n/g," ")}</td>
      `;
      tbody.appendChild(tr);
    });

    countEl.textContent = `${lastResults.length} träffar.`;
  }

  function exportResultsCSV(){
    if(!lastResults.length){
      alert("Inga träffar att exportera.");
      return;
    }
    const header = [
      "Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"
    ];
    const lines = [header.join(";")];
    lastResults.forEach(r=>{
      lines.push([
        r.datum||"",
        r.projekt||"",
        r.kategori||"",
        r.tid ?? "",
        r.kortid ?? "",
        (r.beskrivning||"").replace(/\r?\n/g," ")
      ].join(";"));
    });
    const blob = new Blob(
      ["\uFEFF"+lines.join("\r\n")],
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