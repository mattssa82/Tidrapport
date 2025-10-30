// ===== backup.js – Tidrapport v9.7 =====
// - Exporterar/Importerar JSON-backup
// - Gör bakåtkomp: gamla rader -> nya rader

(()=>{
  const STORAGE_KEY="tidrapport:data";
  const SETTINGS_KEY="tidrapport:cfg";

  function saveFile(blob,name){
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=name;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  // Skapa backup (JSON)
  window.exportJSON=()=>{
    const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}");
    const d=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
    const json=JSON.stringify({settings:s,data:d},null,2);
    const yr=s.year||new Date().getFullYear();
    const blob=new Blob([json],{type:"application/json"});
    saveFile(blob,`tidrapport_backup_${yr}.json`);
  };

  // Importera backup (stöd för gammalt format)
  window.importJSON=async(ev)=>{
    const f=ev.target.files?.[0];
    if(!f) return;
    try{
      const txt=await f.text();
      const obj=JSON.parse(txt);

      const settings=obj.settings||obj.cfg||obj.tidrapport_settings_v10||obj.tidrapport_cfg||{};
      const data=obj.data||obj.tidrapport_data_v10||obj.tidrapport||obj["tidrapport:data"]||{};

      // migrera varje rad till nya strukturen:
      for(const m in data){
        data[m]=(data[m]||[]).map(old=>{
          if(old.kategorier && old.katDisplay){
            // redan nytt format
            return old;
          }

          // Gammalt format antag:
          // { datum, kategori, tid, kortid, beskrivning, projekt, ... }
          const cats=[];
          if(old.kategori){
            cats.push({
              kategori: old.kategori,
              tid: old.tid||0
            });
          }

          const katDisplay = cats.map(c=>{
            if((c.kategori||"").toLowerCase()==="traktamente"){
              return "Traktamente";
            } else {
              return `${c.kategori||""} ${c.tid||0}h`;
            }
          }).join(", ");

          return {
            id: old.id || ("import_"+Math.random().toString(36).slice(2)),
            datum: old.datum || old.date || "",
            projekt: old.projekt || "",
            tid: old.tid || 0,
            kortid: old.kortid || 0,
            beskrivning: old.beskrivning || old.desc || "",
            kategorier: cats,
            katDisplay
          };
        });
      }

      localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
      localStorage.setItem(STORAGE_KEY,JSON.stringify(data));

      alert("Backup importerad ✅ – sidan laddas om.");
      location.reload();
    }catch(e){
      alert("Fel vid import: "+e.message);
    }finally{
      ev.target.value="";
    }
  };

  window.resetAll=()=>{
    if(!confirm("Vill du verkligen rensa ALLT?")) return;
    localStorage.clear();
    alert("All data rensad.");
    location.reload();
  };

  console.log("%cBackup.js laddad ✅ (v9.7 komp)","color:green");
})();