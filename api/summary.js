const db=require('../lib/db');
module.exports=async function(req,res){
  try{
    await db.init();
    const h=await db.history();
    const latest=h[0]||null, previous=h[1]||null;
    if(!latest) return res.json({latest:null,previous:null,weekly_change:0,pct_change:0,report_count:0,history:[],status:'NO_DATA',database_connected:!!db.getPool()});
    const used=Number(latest.allocated_quantity), total=Number(latest.max_quantity), pct=Number(latest.percent_filled);
    const remaining=Number(latest.remaining_quantity ?? Math.max(0,total-used));
    latest.percent_remaining=100-pct; latest.status=latest.status||'OPEN'; latest.validation_status=latest.validation_status||'VALIDATED'; latest.remaining_quantity=remaining;
    const weekly_change=previous?used-Number(previous.allocated_quantity):null;
    const pct_change=previous?pct-Number(previous.percent_filled):null;
    res.json({latest,previous,weekly_change,pct_change,report_count:h.length,history:h,status:'OK',database_connected:!!db.getPool()});
  }catch(e){res.status(500).json({error:e.message})}
}
