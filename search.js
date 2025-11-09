// search.js
// Tidrapport v10.17
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){
  const DATA_KEY = "tidrapport_data_v10";
  let allRowsFlat = [];
  let lastResults = [];

  document.addEventListener("DOMContentLoaded", ()=>{
    loadDataToFlat();
    fillYearFilter();

    const ysel = get("yearFilter");
    if(ysel && ysel.value){
      runSearch();
    }

    const sBtn = get("searchBtn");
    const eBtn = get("exportBtn");
    if(sBtn) sBtn.addEventListener("click", runSearch);
    if(eBtn) eBtn.addEventListener("click", exportResultsCSV);

    if(window.lucide) lucide.createIcons();
  });

  function get(id){ return document.getElementById(id); }

  function loadDataToFlat(){
    try{
      const raw = JSON.parse(localStorage.getItem(DATA_KEY)||"{}") || {};
      const flat = [];
      Object.keys(raw).forEach(mKey=>{
        (raw[mKey]||[]).forEach(r=> flat.push(r));
      });
      allRowsFlat = flat;
    }catch{
      allRowsFlat = [];
    }
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

    const arr = [...years].sort((a,b)=>a-b);
    ysel.innerHTML = arr.map(y=>
      `<option value="${y}" ${y===curY?"selected":""}>${y}</option>`
    ).join("");
  }

  function runSearch(){
    const year = parseInt((get("yearFilter")||{}).value,10) || new Date().getFullYear();
    const proj = (get("projectFilter")?.value || "").toLowerCase();
    const txt = (get("textFilter")?.value || "").toLowerCase();
    const tbody = document.querySelector("#resultTable tbody");
    const info = get("resultCount");
    if(!tbody) return;

    tbody.innerHTML = "";
    lastResults = allRowsFlat.filter(r=>{
      if(!r.datum) return false;
      const d = new Date(r.datum);
      if(d.getFullYear() !== year) return false;

      if(proj && !(r.projekt||"").toLowerCase().includes(proj)) return false;

      if(txt){
        const blob = [
          r.datum,r.projekt,r.kategori,r.tid,r.kortid,r.beskrivning
        ].map(v=>String(v||"").toLowerCase()).join(" ");
        if(!blob.includes(txt)) return false;
      }
      return true;
    });

    if(!lastResults.length){
      tbody.innerHTML = `<tr><td colspan="6"><i>Inga träffar.</i></td></tr>`;
      if(info) info.textContent = "0 träffar.";
      return;
    }

    lastResults.forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.datum||""}</td>
        <td>${r.projekt||""}</td>
        <td>${r.kategori||""}</td>
        <td>${r.tid==null?"":r.tid}</td>
        <td>${r.kortid==null?"":r.kortid}</td>
        <td>${(r.beskrivning||"").replace(/\r?\n/g," ")}</td>
      `;
      tbody.appendChild(tr);
    });

    if(info) info.textContent = `${lastResults.length} träffar.`;
  }

  function exportResultsCSV(){
    if(!lastResults || !lastResults.length){
      alert("Inga träffar att exportera.");
      return;
    }
    const header = [
      "Datum","Projekt","Kategori","Tid (h)","Körtid (h)","Dagboksanteckning"
    ];
    const csv = [header.join(";")];
    lastResults.forEach(r=>{
      csv.push([
        r.datum||"",
        r.projekt||"",
        r.kategori||"",
        r.tid==null?"":r.tid,
        r.kortid==null?"":r.kortid,
        (r.beskrivning||"").replace(/\r?\n/g," ")
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