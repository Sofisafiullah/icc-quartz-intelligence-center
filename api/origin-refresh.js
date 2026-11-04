const db=require('../lib/db');
const {collectOriginImports}=require('../lib/census');
const {ORIGIN_IMPORT_START}=require('../lib/config');

module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST required'});
  if(!db.getPool()) return res.status(503).json({ok:false,error:'APP_ENV=testing and QUARTZ_TEST_DATABASE_URL are required for this isolated test project.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const month=String(body.month||'');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ok:false,error:'Provide one month in YYYY-MM format.'});
    if(month<ORIGIN_IMPORT_START) return res.status(400).json({ok:false,error:'Requested month is before the configured history start.'});
    const now=new Date();
    const currentMonth=`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`;
    if(month>=currentMonth) return res.status(400).json({ok:false,error:'The current month is still in progress; only completed months can be synchronized.'});

    await db.init();
    const batch=await collectOriginImports(month,month);
    for(const row of batch.results) await db.saveOrigin(row);
    const failures=batch.skipped.filter(x=>!x.reason.includes('No monthly quantity returned'));
    await db.log('SUCCESS',`Census origin imports checked for ${month}: ${batch.results.length} records saved; ${batch.skipped.length} skipped.`);
    res.json({ok:true,month,records_saved:batch.results.length,skipped:batch.skipped,errors:failures.length});
  }catch(e){
    try{await db.log('ERROR',`Census origin import refresh failed: ${e.message}`)}catch{}
    res.status(500).json({ok:false,error:e.message});
  }
};
