const db=require('../lib/db');
const {collectAll}=require('../lib/cbp');
const {collectOriginImports}=require('../lib/census');

module.exports=async function(req,res){
  const a=req.headers.authorization||'';
  if(process.env.CRON_SECRET&&a!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({error:'Unauthorized'});
  if(!db.getPool()) return res.status(503).json({ok:false,error:'APP_ENV=testing and QUARTZ_TEST_DATABASE_URL are required for this isolated test project.'});
  try{
    await db.init();
    const batch=await collectAll();
    let inserted=0;
    for(const s of batch.results){
      const existing=await db.getByDate(s.report_date);
      if(existing){
        const sameData=Number(existing.allocated_quantity)===Number(s.allocated_quantity)
          && Number(existing.max_quantity)===Number(s.max_quantity)
          && Math.abs(Number(existing.percent_filled)-Number(s.percent_filled))<0.001;
        if(!sameData) throw Error(`CBP returned changed values for ${s.report_date}. Existing archived values were not overwritten.`);
      }else{
        await db.save(s); inserted++;
        await db.log('SUCCESS',`Scheduled CBP report archived: ${s.report_date}`,s.report_date,s.source_url);
      }
    }
    for(const x of batch.skipped) await db.log('INFO',`Scheduled CBP report skipped for ${x.date}: ${x.reason}`,x.date,x.url);
    const origin=await collectOriginImports();
    for(const row of origin.results) await db.saveOrigin(row);
    await db.log('SUCCESS',`Scheduled Census origin imports synchronized: ${origin.results.length} records.`);
    res.json({ok:true,inserted,new_reports:inserted,skipped:batch.skipped.map(x=>({date:x.date,reason:x.reason})),origin_records:origin.results.length,origin_skipped:origin.skipped.length});
  }catch(e){
    try{await db.log('ERROR',e.message)}catch{}
    res.status(500).json({ok:false,error:e.message});
  }
};
