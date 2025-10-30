// ===== search.js – Tidrapport v9.7 =====
// Söker i alla månader/rader
// Sök i datum, projekt, beskrivning, tid, körtid, kategorier

function runSearch(){
  const q=document.getElementById("search").value.toLowerCase().trim();
  const res=document.getElementById("results");
  const data=JSON.parse(localStorage.getItem("tidrapport:data")||"{}");

  res.innerHTML="";
  if(!q) return;

  const hits=[];
  for(const m in data){
    (data[m]||[]).forEach(r=>{
      // bygg söktext
      const cats=(r.kategorier||[])
        .map(c=>`${c.kategori} ${c.tid}h`)
        .join(" ");

      const text = [
        r.datum,
        r.projekt,
        r.beskrivning,
        r.tid,
        r.kortid,
        cats,
        m
      ].map(v=>String(v||"")).join(" ").toLowerCase();

      if(text.includes(q)){
        hits.push({month:m,...r});
      }
    });
  }

  if(!hits.length){
    res.innerHTML="<li><i>Inga träffar hittades.</i></li>";
    return;
  }

  hits.forEach(r=>{
    const li=document.createElement("li");
    li.innerHTML=`
      <b>${r.datum || "(inget datum)"}</b> – ${r.projekt||"(proj saknas)"}<br>
      ${r.katDisplay||""} | Totaltid: ${(r.tid||0)}h | Körtid: ${r.kortid||0}h<br>
      <small>${r.beskrivning||""}</small><br>
      <small>Månad: ${r.month}</small>`;
    res.appendChild(li);
  });
}

console.log("%cSearch.js laddad ✅ (Tidrapport v9.7)","color:green");