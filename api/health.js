const db=require('../lib/db');
module.exports=async function(req,res){res.json({ok:true,service:'quartz-command-center',quota_id:'99034530QTZ01',database_configured:!!db.getPool(),time:new Date().toISOString()})};
