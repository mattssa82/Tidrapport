// backup.js  v10.0
// Hanterar auto- och manuell backup av tidrapportData och settings

"use strict";

(function() {

  const DATA_KEY = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  // Skapar en snapshot i localStorage vid COV (Change Of Value)
  window.autoLocalBackup = function(reason) {
    try {
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (!settings.autoBackup) return; // bara om autoBackup är aktiverat
      const payload = {
        ts: new Date().toISOString(),
        data: JSON.parse(localStorage.getItem(DATA_KEY) || "[]"),
        settings
      };
      localStorage.setItem(`tidrapport_autobackup_${payload.ts}`, JSON.stringify(payload));
      console.log("Auto-backup skapad:", reason || "");
    } catch (err) {
      console.warn("autoLocalBackup fel:", err);
    }
  };

  // Manuell backup (nedladdning av JSON-fil)
  window.manualBackup = function() {
    try {
      const data = JSON.parse(localStorage.getItem(DATA_KEY) || "[]");
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      const payload = { ts: new Date().toISOString(), data, settings };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const stamp = payload.ts.replace(/[:.]/g, "-");
      a.download = `tidrapport_backup_${stamp}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      console.log("Manuell backup nedladdad.");
    } catch (err) {
      alert("Kunde inte skapa backup: " + err);
    }
  };

  // Återställning (läs in JSON-backup)
  window.importBackupFile = function(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed.data) throw new Error("Ingen data i filen.");
        localStorage.setItem(DATA_KEY, JSON.stringify(parsed.data));
        if (parsed.settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed.settings));
        alert("Backup återställd.\nLadda om sidan för att visa data.");
      } catch (err) {
        alert("Fel vid import: " + err);
      }
    };
    reader.readAsText(file);
  };

})();