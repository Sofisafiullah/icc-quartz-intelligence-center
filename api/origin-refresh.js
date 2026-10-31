const db=require('../lib/db');
const {collectOriginImports}=require('../lib/census');
module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST required'});
  if(!db.getPool()) return res.status(503).json({ok:false,error:'APP_ENV=testing and QUARTZ_TEST_DATABASE_URL are required for this isolated test project.'});
  try{
    await db.init();
    const batch=await collectOriginImports();
    for(const row of batch.results) await db.saveOrigin(row);
    await db.log('SUCCESS',`Census origin imports synchronized: ${batch.results.length} HTS/country/month records.`);
    res.json({ok:true,records_saved:batch.results.length,skipped:batch.skipped,months:batch.months});
  }catch(e){
    try{await db.log('ERROR',`Census origin import refresh failed: ${e.message}`)}catch{}
    res.status(500).json({ok:false,error:e.message});
  }
};
