/* ========= backup.js =========
   Hanterar backup till JSON och återläsning
   Integrerad med Tidrapport v5-A3
================================ */

function quickBackup(){
  try {
    const payload = {
      version: "5-A3",
      timestamp: new Date().toISOString(),
      settings: SETTINGS,
      data: DATA
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type: "application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const fname = `${SETTINGS.username||"tidrapport"}_${SETTINGS.year||new Date().getFullYear()}_backup.json`;
    a.download = fname;
    a.click();
    console.log("✅ Backup skapad:", fname);
  } catch(e){
    alert("Fel vid backup: " + e.message);
  }
}

function importBackupFile(){
  const inp=document.createElement("input");
  inp.type="file";
  inp.accept=".json";
  inp.onchange=e=>{
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const parsed=JSON.parse(reader.result);
        if(!parsed.data||!parsed.settings){throw new Error("Felaktig backupfil");}
        localStorage.setItem("tidrapport_data",JSON.stringify(parsed.data));
        localStorage.setItem("tidrapport_settings",JSON.stringify(parsed.settings));
        DATA=parsed.data;
        SETTINGS=parsed.settings;
        alert("Backup återläst! Ladda om sidan.");
        location.reload();
      }catch(err){
        alert("Kunde inte läsa backupfil: "+err.message);
      }
    };
    reader.readAsText(file);
  };
  inp.click();
}

/* ========= Automatisk backup =========
   Körs om autoBackup = true (hanteras även i app.js)
======================================= */
function autoBackup(){
  if(!SETTINGS.autoBackup)return;
  quickBackup();
  console.log("🔁 Automatisk backup körd " + new Date().toLocaleString());
}