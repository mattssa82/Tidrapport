// ===== backup.js =====
// Hanterar backup (JSON) – auto, manuell, export, import, delning

(() => {
  const STORAGE_KEY = "tidrapport_data_v10";
  const SETTINGS_KEY = "tidrapport_settings_v10";

  const download = (name, blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  const tryShareOrDownload = async (filename, blob, title) => {
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] })) {
      try {
        const file = new File([blob], filename, { type: blob.type });
        await navigator.share({ title, files: [file] });
        return true;
      } catch (e) {}
    }
    download(filename, blob);
    alert("Delning stöds inte här – filen laddades ner istället.");
    return false;
  };

  // === Hjälpmetoder ===
  const load = key => {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch {
      return {};
    }
  };
  const save = (key, data) => localStorage.setItem(key, JSON.stringify(data));

  // === Exportera backup ===
  window.exportJSON = function () {
    const settings = load(SETTINGS_KEY);
    const data = load(STORAGE_KEY);
    const blob = new Blob([JSON.stringify({ settings, data }, null, 2)], {
      type: "application/json",
    });
    const y = settings?.year || new Date().getFullYear();
    download(`tidrapport_backup_${y}.json`, blob);
  };

  // === Snabbbackup (Dela) ===
  window.shareJSON = async function () {
    const settings = load(SETTINGS_KEY);
    const data = load(STORAGE_KEY);
    const blob = new Blob([JSON.stringify({ settings, data }, null, 2)], {
      type: "application/json",
    });
    const y = settings?.year || new Date().getFullYear();
    await tryShareOrDownload(`tidrapport_backup_${y}.json`, blob, "Tidrapport – Backup JSON");
  };

  // === Importera backup ===
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

  // === Automatisk backup (debounce) ===
  let lastBackup = 0;
  const BACKUP_INTERVAL_MS = 60000; // min 60 sek mellan auto-backups

  window.autoLocalBackup = function () {
    const now = Date.now();
    if (now - lastBackup < BACKUP_INTERVAL_MS) return; // förhindrar spam
    lastBackup = now;
    const settings = load(SETTINGS_KEY);
    const data = load(STORAGE_KEY);
    try {
      localStorage.setItem("tidrapport_autobackup", JSON.stringify({ settings, data, t: new Date().toISOString() }));
      console.log("Auto-backup skapad:", new Date().toLocaleTimeString());
    } catch (e) {
      console.warn("Auto-backup misslyckades:", e);
    }
  };

  // Kör auto-backup var 5:e minut om aktivt
  setInterval(() => {
    const settings = load(SETTINGS_KEY);
    if (settings?.autoBackup) window.autoLocalBackup();
  }, 300000); // 5 min

  console.log("%cBackup.js laddad korrekt ✅", "color: green");
})();