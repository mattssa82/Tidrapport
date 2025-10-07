// ===== Backup.js =====
// Hanterar backup/export/import av JSON-data

(()=>{

const STORAGE = "tidrapport_data_v10";
const SETTINGS = "tidrapport_settings_v10";

// Hämtar och sparar i localStorage
function saveData(){localStorage.setItem(STORAGE,JSON.stringify(state.data));}
function saveCfg(){localStorage.setItem(SETTINGS,JSON.stringify(state.settings));}

// ===== Export (JSON) =====
window.exportJSON=()=>{
  const payload={settings:state.settings,data:state.data};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const y=state.settings.year||new Date().getFullYear();
  const owner=(state.settings.owner||"tidrapport").replace(/\s+/g,"_").toLowerCase();
  const name=`${owner}_${y}_backup_${new Date().toISOString().slice(0,10)}.json`;
  download(name,blob);
};

// ===== Dela (Share API) =====
window.shareJSON=async()=>{
  const payload={settings:state.settings,data:state.data};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const y=state.settings.year||new Date().getFullYear();
  const owner=(state.settings.owner||"tidrapport").replace(/\s+/g,"_").toLowerCase();
  const filename=`${owner}_${y}_backup.json`;

  if(navigator.canShare && navigator.canShare({files:[new File([blob],filename,{type:blob.type})]})){
    try{
      await navigator.share({title:"Tidrapport – Backup",files:[new File([blob],filename,{type:blob.type})]});
      return;
    }catch(e){}
  }
  download(filename,blob);
  alert("Delning stöds inte här – filen laddades ner istället.");
};

// ===== Import =====
window.importJSON=async(ev)=>{
  const file=ev.target.files && ev.target.files[0];
  if(!file)return;
  try{
    const txt=await file.text();
    const obj=JSON.parse(txt);

    if(obj.settings) state.settings={...state.settings,...obj.settings};
    if(obj.data) state.data=obj.data;

    saveCfg(); saveData();
    renderAll();
    alert("✅ JSON-backup importerad.");
  }catch(e){
    alert("❌ Kunde inte importera backup: "+(e.message||e));
  }finally{
    ev.target.value="";
  }
};

// ===== Snabbbackup (i menyn) =====
window.quickBackup=()=>exportJSON();

// ===== AutoBackup (om aktiverat) =====
window.autoLocalBackup=()=>{
  try{
    if(!state.settings.autoBackup)return;
    const key="tidrapport_autobackup_"+(state.settings.year||new Date().getFullYear());
    localStorage.setItem(key,JSON.stringify(state.data));
    localStorage.setItem("tidrapport_last_update",Date.now());
  }catch(e){
    console.warn("AutoBackup misslyckades:",e);
  }
};

// Hjälpfunktion från export.js
function download(name,blob){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}

})();