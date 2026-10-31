const db=require('../lib/db');
const { ORIGIN_COUNTRIES, ORIGIN_HTS } = require('../lib/config');
module.exports=async function(req,res){
  try{
    await db.init();
    const rows=await db.originHistory();
    const months={};
    for(const r of rows){
      const month=String(r.month).slice(0,7);
      months[month] ||= {month,...Object.fromEntries(Object.values(ORIGIN_COUNTRIES).map(c=>[c.name,0])),combined:0,by_hts:{}};
      months[month][r.country_name]=(months[month][r.country_name]||0)+Number(r.quantity_m2);
      months[month].combined += Number(r.quantity_m2);
      months[month].by_hts[`${r.country_name}_${r.hts}`]=Number(r.quantity_m2);
    }
    const quarterly={};
    for(const r of Object.values(months)) {
      const [year,monthNo]=r.month.split('-').map(Number);
      const q=Math.floor((monthNo-1)/3)+1;
      const key=`${year}-Q${q}`;
      quarterly[key] ||= {quarter:key,...Object.fromEntries(Object.values(ORIGIN_COUNTRIES).map(c=>[c.name,0])),combined:0};
      for(const country of Object.values(ORIGIN_COUNTRIES).map(c=>c.name)) quarterly[key][country]+=Number(r[country]||0);
      quarterly[key].combined+=Number(r.combined||0);
    }
    res.json({
      ok:true,
      metric:'Imports for Consumption',
      unit:'M²',
      countries:Object.values(ORIGIN_COUNTRIES).map(c=>c.name),
      hts:ORIGIN_HTS,
      rows,
      monthly:Object.values(months).sort((a,b)=>b.month.localeCompare(a.month)),
      quarterly:Object.values(quarterly).sort((a,b)=>b.quarter.localeCompare(a.quarter))
    });
  }catch(e){res.status(500).json({ok:false,error:e.message})}
};
