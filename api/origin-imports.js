const db=require('../lib/db');
const { ORIGIN_COUNTRIES, ORIGIN_HTS, ORIGIN_IMPORT_START } = require('../lib/config');

function monthKey(value){
  if(value instanceof Date) return value.toISOString().slice(0,7);
  const s=String(value??'');
  const iso=s.match(/(\d{4}-\d{2})/);
  if(iso) return iso[1];
  const d=new Date(s);
  return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,7);
}
function monthRange(start,end){
  const out=[]; let [y,m]=start.split('-').map(Number); const [ey,em]=end.split('-').map(Number);
  while(y<ey || (y===ey && m<=em)){
    out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;y++;}
  }
  return out;
}
function currentMonth(){const d=new Date();return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
module.exports=async function(req,res){
  try{
    await db.init();
    const sourceRows=await db.originHistory();
    const countries=Object.values(ORIGIN_COUNTRIES).map(c=>c.name);
    const months={};
    for(const key of monthRange(ORIGIN_IMPORT_START,currentMonth())){
      months[key]={month:key,...Object.fromEntries(countries.map(c=>[c,null])),combined:null,by_hts:{},available_records:0};
      for(const c of countries) for(const hts of ORIGIN_HTS) months[key].by_hts[`${c}_${hts}`]=null;
    }
    for(const r of sourceRows){
      const key=monthKey(r.month); if(!key) continue;
      months[key] ||= {month:key,...Object.fromEntries(countries.map(c=>[c,null])),combined:null,by_hts:{},available_records:0};
      const row=months[key], qty=Number(r.quantity_m2);
      const htsKey=`${r.country_name}_${r.hts}`;
      row.by_hts[htsKey]=qty;
      row.available_records++;
    }
    for(const row of Object.values(months)){
      let combined=0, any=false;
      for(const country of countries){
        const values=ORIGIN_HTS.map(hts=>row.by_hts[`${country}_${hts}`]).filter(v=>v!==null && v!==undefined);
        row[country]=values.length?values.reduce((a,b)=>a+b,0):null;
        if(values.length){combined+=row[country];any=true;}
      }
      row.combined=any?combined:null;
      row.status=any?'Available':'Pending';
    }
    const monthly=Object.values(months).sort((a,b)=>a.month.localeCompare(b.month));
    const latestAvailable=[...monthly].reverse().find(r=>r.status==='Available')||null;
    res.json({ok:true,metric:'Imports for Consumption',unit:'M²',start_month:ORIGIN_IMPORT_START,current_month:currentMonth(),countries,hts:ORIGIN_HTS,monthly,latest_available:latestAvailable,record_count:sourceRows.length});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
};
