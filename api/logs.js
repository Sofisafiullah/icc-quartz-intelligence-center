const db=require('../lib/db');
module.exports=async function(req,res){try{await db.init();res.json(await db.logs())}catch(e){res.status(500).json({error:e.message})}};
