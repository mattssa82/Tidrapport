// backup.js
// Tidrapport v10.16
// i samarbete med ChatGPT & Martin Mattsson

"use strict";

(function(){

  const DATA_KEY = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  // Auto-backup (COV-style: endast vid ändring)
  window.autoLocalBackup = function(reason){
    try{
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}") || {};
      if(!settings.autoBackup) return;

      const snapshot = {
        ts: new Date().toISOString(),
        data: JSON.parse(localStorage.getItem(DATA_KEY)||"{}") || {},
        settings
      };
      const key = "tidrapport_autobackup_"+snapshot.ts;
      localStorage.setItem(key, JSON.stringify(snapshot));
      console.log("Auto-backup:", reason||"", key);
    }catch(err){
      console.warn("autoLocalBackup fel:", err);
    }
  };

  // Manuell backup
  window.manualBackup = function(){
    try{
      const data = JSON.parse(localStorage.getItem(DATA_KEY)||"{}") || {};
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}") || {};
      const payload = {
        ts: new Date().toISOString(),
        data,
        settings
      };
      const blob = new Blob(
        [JSON.stringify(payload,null,2)],
        {type:"application/json"}
      );
      const a = document.createElement("a");
      const stamp = payload.ts.replace(/[:.]/g,"-");
      a.href = URL.createObjectURL(blob);
      a.download = `tidrapport_backup_${stamp}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }catch(err){
      alert("Kunde inte skapa backup: "+err);
    }
  };

  // Import
  window.importBackupFile = function(file, cb){
    const reader = new FileReader();
    reader.onload = e => {
      try{
        const parsed = JSON.parse(e.target.result);

        let payload = { data:{}, settings:{} };

        if(parsed && parsed.data){
          payload.data = parsed.data;
          payload.settings = parsed.settings || {};
        }else{
          payload.data = parsed || {};
          payload.settings = {};
        }

        if(typeof cb === "function") cb(payload);
      }catch(err){
        alert("Fel vid import: "+err);
      }
    };
    reader.readAsText(file);
  };

})();