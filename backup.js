// backup.js
// Enkel JSON-backup/import

const Backup = (() => {

  function exportJson(entries, silent) {
    const filename = "Tidrapport_backup_" + new Date().toISOString() + ".json";
    const blob = new Blob([JSON.stringify(entries, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (!silent) alert("Backup skapad.");
  }

  return { exportJson };
})();