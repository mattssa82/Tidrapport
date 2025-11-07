// backup.js
// Tidrapport v10.15
// Auto-backup (COV-style), manuell backup, import

"use strict";

(function(){

  const DATA_KEY      = "tidrapport_data_v10";
  const SETTINGS_KEY  = "tidrapport_settings_v10";
  const LAST_AUTO_KEY = "tidrapport_last_autobackup_ts";
  const AUTO_DELAY_MS = 60000; // minst 60s mellan två auto-backup

  // Auto-backup vid ändring
  window.autoLocalBackup = function(reason){
    try{
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
      if (!settings.autoBackup) return;

      const now = Date.now();
      const last = parseInt(localStorage.getItem(LAST_AUTO_KEY) || "0",10) || 0;
      if (now - last < AUTO_DELAY_MS) return;

      const data = JSON.parse(localStorage.getItem(DATA_KEY) || "{}") || {};
      const snapshot = {
        ts: new Date().toISOString(),
        reason: reason || "change",
        data,
        settings
      };
      const key = "tidrapport_autobackup_" + snapshot.ts.replace(/[:.]/g,"-");
      localStorage.setItem(key, JSON.stringify(snapshot));
      localStorage.setItem(LAST_AUTO_KEY, String(now));
      console.log("Auto-backup skapad:", reason || "", key);
    }catch(err){
      console.warn("autoLocalBackup fel:", err);
    }
  };

  // Manuell backup -> ladda ner JSON
  window.manualBackup = function(){
    try{
      const data = JSON.parse(localStorage.getItem(DATA_KEY) || "{}") || {};
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
      const payload = {
        ts: new Date().toISOString(),
        data,
        settings
      };
      const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
      const a = document.createElement("a");
      const stamp = payload.ts.replace(/[:.]/g,"-");
      a.href = URL.createObjectURL(blob);
      a.download = `tidrapport_backup_${stamp}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }catch(err){
      alert("Kunde inte skapa backup: " + err);
    }
  };

  // Import av backupfil
  // callback(payload) -> {data,settings}
  window.importBackupFile = function(file, callback){
    const reader = new FileReader();
    reader.onload = e => {
      try{
        const parsed = JSON.parse(e.target.result);

        let data = {};
        let settings = {};

        if (parsed && parsed.data){
          data = parsed.data;
          settings = parsed.settings || {};
        } else if (parsed && typeof parsed === "object"){
          data = parsed;
        } else if (Array.isArray(parsed)){
          // gammalt platt
          data = {};
          parsed.forEach(r => {
            if (!r.datum) return;
            const m = new Date(r.datum).getMonth()+1;
            const k = String(m);
            if (!data[k]) data[k] = [];
            data[k].push(r);
          });
        }

        if (typeof callback === "function"){
          callback({ data, settings });
        }
      }catch(err){
        alert("Fel vid import: " + err);
      }
    };
    reader.readAsText(file);
  };

})();