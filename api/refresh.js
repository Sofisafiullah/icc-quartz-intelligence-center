const db=require('../lib/db');
const {collectAll}=require('../lib/cbp');

module.exports=async function(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  if(!db.getPool()) return res.status(503).json({ok:false,error:'APP_ENV=testing and QUARTZ_TEST_DATABASE_URL are required for this isolated test project.'});
  try{
    await db.init();
    const batch=await collectAll();
    const inserted=[];
    const unchanged=[];
    for(const s of batch.results){
      const existing=await db.getByDate(s.report_date);
      if(existing){
        const sameData=Number(existing.allocated_quantity)===Number(s.allocated_quantity)
          && Number(existing.max_quantity)===Number(s.max_quantity)
          && Math.abs(Number(existing.percent_filled)-Number(s.percent_filled))<0.001;
        if(!sameData) throw Error(`CBP returned changed values for ${s.report_date}. Existing archived values were not overwritten.`);
        unchanged.push(s.report_date);
      }else{
        await db.save(s); inserted.push(s.report_date);
        await db.log('SUCCESS',`CBP report archived: ${s.report_date}: ${s.allocated_quantity} ${s.uom}, ${s.percent_filled}%`,s.report_date,s.source_url);
      }
    }
    for(const x of batch.skipped) await db.log('INFO',`CBP report skipped for ${x.date}: ${x.reason}`,x.date,x.url);
    const latest=await db.latest();
    res.json({ok:true,inserted:inserted.length>0,new_report:inserted.length>0,inserted_dates:inserted,unchanged_dates:unchanged,skipped:batch.skipped.map(x=>({date:x.date,reason:x.reason})),reports_seen:batch.reports.length,snapshot:latest,message:inserted.length?`Archived ${inserted.length} new CBP report(s).`:`No new CBP reports. Existing CBP history is up to date.`});
  }catch(e){
    try{await db.log('ERROR',e.message)}catch{}
    res.status(500).json({ok:false,error:e.message});
  }
};
