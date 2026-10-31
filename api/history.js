const db=require('../lib/db');
module.exports=async function(req,res){try{await db.init();const h=await db.history();res.json(h.map(x=>({...x,percent_remaining:100-Number(x.percent_filled),validation_status:x.validation_status||'VALIDATED',status:x.status||'OPEN'})))}catch(e){res.status(500).json({error:e.message})}};
