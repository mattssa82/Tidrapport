// search.js
// Enkel filtrering + CSV-export av träffar.

(function(){
  const STORAGE_KEY = "tidrapport_v10_21_entries";

  const yearSelect = document.getElementById("yearSelect");
  const projectInput = document.getElementById("projectInput");
  const textInput = document.getElementById("textInput");
  const searchBtn = document.getElementById("searchBtn");
  const exportBtn = document.getElementById("exportSearchCsvBtn");
  const resultsBody = document.getElementById("resultsBody");
  const resultCount = document.getElementById("resultCount");
  const backBtn = document.getElementById("backBtn");
  const helpBtn = document.getElementById("helpBtn");

  const entries = loadEntries();
  let currentResults = [];

  init();

  function init() {
    initYearSelect();
    bindEvents();
    runSearch();
  }

  function bindEvents() {
    searchBtn.addEventListener("click", runSearch);
    exportBtn.addEventListener("click", () => {
      Exporter.exportRowsCsv("Sokresultat", currentResults);
    });
    backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
    helpBtn.addEventListener("click", () => {
      window.location.href = "help.html";
    });
  }

  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function initYearSelect() {
    const years = new Set();
    const today = new Date().getFullYear();
    years.add(today);
    entries.forEach(e => {
      const y = Number(e.date.split("-")[0]);
      if (y) years.add(y);
    });
    const sorted = Array.from(years).sort((a,b)=>a-b);
    yearSelect.innerHTML = "";
    sorted.forEach(y=>{
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      yearSelect.appendChild(o);
    });
  }

  function runSearch() {
    const year = Number(yearSelect.value);
    const proj = projectInput.value.trim().toLowerCase();
    const text = textInput.value.trim().toLowerCase();

    currentResults = entries.filter(e => {
      const [y] = e.date.split("-").map(Number);
      if (year && y !== year) return false;
      if (proj && !(e.project || "").toLowerCase().includes(proj)) return false;
      if (text) {
        const hay = [
          e.project || "",
          e.category || "",
          e.note || ""
        ].join(" ").toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    }).sort((a,b)=> (a.date+a.project).localeCompare(b.date+b.project));

    renderResults();
  }

  function renderResults() {
    resultsBody.innerHTML = "";
    resultCount.textContent = currentResults.length + " träffar.";
    currentResults.forEach(e => {
      const tr = document.createElement("tr");
      const tds = [
        e.date,
        e.project || "",
        e.category || "",
        num(e.hours || 0),
        num(e.drive || 0),
        e.note || ""
      ];
      tds.forEach((v,i)=>{
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      resultsBody.appendChild(tr);
    });
  }

  function num(v){
    return (Math.round(v*100)/100).toString().replace(".", ",");
  }

})();