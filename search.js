// search.js
// Tidrapport v10.16
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const DATA_KEY = "tidrapport_data_v10";
  let allRowsFlat = [];
  let lastResults = [];

  document.addEventListener("DOMContentLoaded", () => {
    if(!document.getElementById("resultTable")) return; // skydda index.html
    loadDataToFlat();
    fillYearFilter();
    const ysel = get("yearFilter");
    if(ysel && ysel.value){
      runSearch();
    }
    get("searchBtn").addEventListener("click", runSearch);
    get("exportBtn").addEventListener("click", exportResultsCSV);
    if(window.lucide){ lucide.createIcons(); }
  });

  function get(id){ return document.getElementById(id); }

  function loadDataToFlat(){
    let raw = {};
    try{
      raw = JSON.parse(localStorage.getItem(DATA_KEY)||"{}") || {};
    }catch{
      raw = {};
    }
    const flat = [];
    Object.keys(raw).forEach(m=>{
      (raw[m]||[]).forEach(r=>flat.push(r));
    });
    allRowsFlat = flat;
  }

  function fillYearFilter(){
    const ysel = get("yearFilter");
    if(!ysel) return;

    const years = new Set();
    const curY = new Date().getFullYear();
    years.add(curY);

    allRowsFlat.forEach(r=>{
      if(!r.datum) return;
      const y = new Date(r.datum).getFullYear();
      if(!isNaN(y)) years.add(y);
    });

    const sorted = [...years].sort((a,b)=>a-b);
    ysel.innerHTML = sorted.map(y =>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");
  }

  function runSearch(){
    const year = parseInt(get("yearFilter").value,10);
    const proj = (get("projectFilter").value||"").toLowerCase();
    const txt  = (get("textFilter").value||"").toLowerCase();

    const tbody = document.querySelector("#resultTable tbody");
    const info = get("resultCount");
    tbody.innerHTML = "";
    lastResults = [];

    allRowsFlat.forEach(r=>{
      if(!r.datum) return;
      const d = new Date(r.datum);
      if(d.getFullYear() !== year) return;

      if(proj && !(r.projekt||"").toLowerCase().includes(proj)) return;

      const all = [
        r.datum,
        r.projekt,
        r.kategori,
        r.tid,
        r.kortid,
        r.beskrivning
      ].map(v=>String(v||"")).join(" ").toLowerCase();

      if(txt && !all.includes(txt)) return;

      lastResults.push(r);
    });

    if(!lastResults.length){
      tbody.innerHTML = `<tr><td colspan="6"><i>Inga träffar.</i></td></tr>`;
      info.textContent = "0 träffar.";
      return;
    }

    lastResults.sort((a,b)=>a.datum.localeCompare(b.datum));

    const usedFirst = new Set();

    lastResults.forEach(r=>{
      const first = !usedFirst.has(r._id);
      if(first) usedFirst.add(r._id);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.datum||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${r.tid!==undefined?r.tid:""}</td>
        <td>${first ? (r.kortid||"") : ""}</td>
        <td>${first ? (r.beskrivning||"").replace(/\r?\n/g," ") : ""}</td>
      `;
      tbody.appendChild(tr);
    });

    info.textContent = `${lastResults.length} träffar.`;
  }

  function exportResultsCSV(){
    if(!lastResults.length){
      alert("Inga träffar att exportera.");
      return;
    }

    const header = [
      "Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"
    ];
    const csv = [header.join(";")];

    const usedFirst = new Set();

    lastResults.forEach(r=>{
      const first = !usedFirst.has(r._id);
      if(first) usedFirst.add(r._id);

      csv.push([
        r.datum||"",
        r.projekt||"",
        r.kategori||"",
        r.tid!==undefined?r.tid:"",
        first ? (r.kortid||"") : "",
        first ? (r.beskrivning||"").replace(/\r?\n/g," ") : ""
      ].join(";"));
    });

    const blob = new Blob(
      ["\uFEFF"+csv.join("\r\n")],
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