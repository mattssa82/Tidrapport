// ===== backup.js – Backup & återställning =====
// Hanterar export, import och auto-backup.  Endast händelsestyrd.

(() => {
  const STORAGE_KEY = "tidrapport:data";
  const SETTINGS_KEY = "tidrapport:cfg";
  let lastBackupAt = 0;
  const BACKUP_INTERVAL_MS = 60000; // debounce 60s

  const saveToFile = (blob, filename) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  const tryShare = async (blob, filename, title) => {
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] })) {
      try {
        await navigator.share({
          title,
          files: [new File([blob], filename, { type: blob.type })]
        });
        return true;
      } catch { /* användaren avbröt */ }
    }
    saveToFile(blob, filename);
    alert("Delning stöds inte här – filen laddades ner istället.");
    return false;
  };

  const load = key => {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
  };
  const save = (key, data) => localStorage.setItem(key, JSON.stringify(data));

  // --- Exportera JSON-backup ---
  window.exportJSON = function () {
    const settings = load(SETTINGS_KEY);
    const data = load(STORAGE_KEY);
    const blob = new Blob([JSON.stringify({ settings, data }, null, 2)], { type: "application/json" });
    const y = settings?.year || new Date().getFullYear();
    saveToFile(blob, `tidrapport_backup_${y}.json`);
  };

  // --- Snabbdelning ---
  window.shareJSON = async function () {
    const settings = load(SETTINGS_KEY);
    const data = load(STORAGE_KEY);
    const blob = new Blob([JSON.stringify({ settings, data }, null, 2)], { type: "application/json" });
    const y = settings?.year || new Date().getFullYear();
    await tryShare(blob, `tidrapport_backup_${y}.json`, "Tidrapport – Backup JSON");
  };

  // --- Importera JSON-backup ---
  window.importJSON = async function (ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const obj = JSON.parse(txt);
      if (obj.settings) save(SETTINGS_KEY, obj.settings);
      if (obj.data) save(STORAGE_KEY, obj.data);
      alert("Backup importerad – ladda om sidan för att se ändringar.");
    } catch (e) {
      alert("Kunde inte importera JSON: " + (e.message || e));
    } finally {
      ev.target.value = "";
    }
  };

  // --- Auto-backup (endast vid sparande/inmatning) ---
  window.autoLocalBackup = function () {
    const now = Date.now();
    if (now - lastBackupAt < BACKUP_INTERVAL_MS) return; // debounce
    lastBackupAt = now;
    const settings = load(SETTINGS_KEY);
    const data = load(STORAGE_KEY);
    try {
      localStorage.setItem(
        "tidrapport:autobackup",
        JSON.stringify({ settings, data, timestamp: new Date().toISOString() })
      );
      console.log("Auto-backup skapad", new Date().toLocaleTimeString());
    } catch (e) {
      console.warn("Auto-backup misslyckades:", e);
    }
  };

  console.log("%cBackup.js laddad ✅", "color:green");
})();