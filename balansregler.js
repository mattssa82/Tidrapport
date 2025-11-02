// balansregler.js
// Returnerar statusrad per dag i aktuell månad
// status ok/warn/bad + message
// hours = "obalans-tid" eller 0

// Just nu gör vi en enkel modell:
// - Om ingen registrering alls den dagen => status "bad", hours=0, message "Ingen registrering"
// - Om flextid <0 den dagen => "warn" med minusvärde
// - Annars "ok"
// Du kan bygga ut logiken senare.

function calcMonthBalans(monthEntries, year, monthIdx) {
    // Samla per datum
    // { "2025-10-27": {total:.., flex:.., hasAny:true} }
    const map = {};
    // Hämta alla dagar i månaden
    const first = new Date(year, monthIdx, 1);
    const nextm = new Date(year, monthIdx+1, 1);
    const daysInMonth = Math.round((nextm-first)/86400000);

    // init map för alla dagar
    for (let d=1; d<=daysInMonth; d++){
        const ds = year+"-"+pad2(monthIdx+1)+"-"+pad2(d);
        map[ds] = {
            total: 0,
            flex: 0,
            hasAny: false
        };
    }

    // fyll
    for (const ent of monthEntries) {
        const ds = ent.date;
        if (!map[ds]) {
            map[ds] = {total:0, flex:0, hasAny:false};
        }
        // summera kat timmar
        let sumH = 0;
        let flexH = 0;
        for (const it of ent.items) {
            sumH += it.hours;
            if (it.cat==="Flextid") {
                flexH += it.hours;
            }
        }
        map[ds].total += sumH;
        map[ds].flex  += flexH;
        map[ds].hasAny = true;
    }

    // bygg rader sorterat
    const rows = [];
    Object.keys(map).sort().forEach(ds=>{
        const obj = map[ds];
        let status = "ok";
        let msg = "OK";
        let hoursVal = 0;

        if (!obj.hasAny) {
            status = "bad";
            msg = "Ingen registrering";
            hoursVal = 0;
        } else if (obj.flex < 0) {
            status = "warn";
            msg = "Negativ flex";
            hoursVal = obj.flex;
        } else {
            status = "ok";
            msg = "Balans";
            hoursVal = 0;
        }

        rows.push({
            date: ds,
            hours: hoursVal,
            status: status,
            message: msg
        });
    });

    return rows;
}

// pad2 här också (samma som i app.js)
function pad2(n){
    return n<10 ? "0"+n : ""+n;
}