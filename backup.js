// JSON Export/Import
window.exportJSON=()=>{ 
  const settings=JSON.parse(localStorage.getItem("tidrapport_settings_v11")||"{}");
  const data=JSON.parse(localStorage.getItem("tidrapport_data_v11")||"{}");
  const blob=new Blob([JSON.stringify({settings,data},null,2)],{type:"application/json"});
  const y=settings.year||new Date().getFullYear();
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`tidrapport_backup_${y}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);
};
window.shareJSON=async()=>{ 
  const settings=JSON.parse(localStorage.getItem("tidrapport_settings_v11")||"{}");
  const data=JSON.parse(localStorage.getItem("tidrapport_data_v11")||"{}");
  const blob=new Blob([JSON.stringify({settings,data},null,2)],{type:"application/json"});
  const y=settings.year||new Date().getFullYear();
  const filename=`tidrapport_backup_${y}.json`;
  if (navigator.canShare && navigator.canShare({files:[new File([blob], filename, {type: blob.type})]})) {
    try { const file = new File([blob], filename, {type: blob.type}); await navigator.share({title:"Tidrapport – Backup JSON", files:[file]}); return; } catch (e) {}
  }
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  alert("Delning stöds inte här – filen laddades ner istället.");
};

window.importJSON=async(ev)=>{
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  try{
    const txt = await file.text();
    const obj = JSON.parse(txt);
    if(obj.settings) localStorage.setItem("tidrapport_settings_v11", JSON.stringify(obj.settings));
    if(obj.data)     localStorage.setItem("tidrapport_data_v11", JSON.stringify(obj.data));
    alert("JSON backup importerad.");
    location.reload();
  }catch(e){ alert("Kunde inte importera JSON: "+(e.message||e)); }
  finally{ ev.target.value=""; }
};

// CSV Import
window.importCSV=async(ev)=>{
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  try{
    const txt = await file.text();
    const rows = txt.replace(/\r\n/g,"\n").split("\n").filter(l=>l.trim()!=="");
    let idx = rows[0] && rows[0].toLowerCase().startsWith("sep=") ? 1 : 0;
    if(rows[idx] && /datum;.*ordinarie/i.test(rows[idx])) idx++;

    const settings = JSON.parse(localStorage.getItem("tidrapport_settings_v11")||"{}");
    const data = JSON.parse(localStorage.getItem("tidrapport_data_v11")||"{}");
    const ensureMonth=(m)=>{ if(!data[m]) data[m]=[]; };

    for(; idx<rows.length; idx++){
      const cols = rows[idx].split(";");
      if(cols.length < 5) continue;
      const [datum, ord, kort, projekt, sem, atf, sjuk, forald, vab, flex, otlt2, ot2gt, othel, trakt, bes] = cols;

      const base = {
        _id: (Date.now().toString(36)+Math.random().toString(36).slice(2,8)),
        datum:(datum||"").trim(),
        projekt:(projekt||"").trim(),
        kortid:Number((kort||"").replace(",", "."))||0,
        beskrivning:(bes||"").trim()
      };
      const month = base.datum && !Number.isNaN(new Date(base.datum).getTime())
        ? (new Date(base.datum).getMonth()+1)
        : (new Date().getMonth()+1);
      ensureMonth(month);

      const pushCat = (kat, val)=>{
        const v = Number((val||"").replace(",", "."));
        if(!Number.isFinite(v) || v===0) return;
        data[month].push({...base, _id:(Date.now().toString(36)+Math.random().toString(36).slice(2,8)), kategori:kat, tid:v});
      };

      pushCat("Ordinarie tid", ord);
      pushCat("Semester-tim", sem);
      pushCat("ATF-tim", atf);
      pushCat("Sjuk-tim", sjuk);
      pushCat("Föräldraledig", forald);
      pushCat("VAB", vab);
      pushCat("Flextid", flex);
      pushCat("Övertid <2", otlt2);
      pushCat("Övertid 2>", ot2gt);
      pushCat("Övertid-Helg", othel);
      pushCat("Traktamente", trakt);
    }
    localStorage.setItem("tidrapport_data_v11", JSON.stringify(data));
    alert("CSV import klar.");
    location.reload();
  }catch(e){
    alert("Kunde inte importera CSV: "+(e.message||e));
  }finally{ ev.target.value=""; }
};