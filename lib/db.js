const { Pool } = require('pg');
const { QUOTA_ID } = require('./config');
const { seed } = require('./seed');
let pool;
function getPool(){
  // Deliberately refuse the production-style DATABASE_URL variable.
  // This testing build only connects when explicitly marked as testing and
  // given its own dedicated QUARTZ_TEST_DATABASE_URL.
  if(process.env.APP_ENV !== 'testing' || !process.env.QUARTZ_TEST_DATABASE_URL) return null;
  const testUrl = new URL(process.env.QUARTZ_TEST_DATABASE_URL);
  const databaseName = decodeURIComponent(testUrl.pathname.replace(/^\//, ''));
  if(!/^postgres(?:ql)?:$/.test(testUrl.protocol) || !/(test|testing|sandbox)/i.test(databaseName)) {
    throw new Error('Safety check blocked database connection: QUARTZ_TEST_DATABASE_URL must point to a PostgreSQL database whose name contains test, testing, or sandbox (for example icc_quartz_test).');
  }
  if(!pool) pool = new Pool({ connectionString:process.env.QUARTZ_TEST_DATABASE_URL, ssl:{rejectUnauthorized:false}, max:2 });
  return pool;
}
async function init(){
  const p=getPool();
  if(!p) return false;
  await p.query(`CREATE TABLE IF NOT EXISTS quota_snapshots(
    id BIGSERIAL PRIMARY KEY,
    report_date DATE NOT NULL,
    quota_id TEXT NOT NULL,
    commodity TEXT,
    uom TEXT NOT NULL,
    max_quantity NUMERIC NOT NULL,
    allocated_quantity NUMERIC NOT NULL,
    percent_filled NUMERIC NOT NULL,
    remaining_quantity NUMERIC NOT NULL,
    validation_status TEXT NOT NULL DEFAULT 'VALIDATED',
    status TEXT NOT NULL DEFAULT 'OPEN',
    source_url TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(report_date,quota_id)
  )`);
  await p.query(`CREATE TABLE IF NOT EXISTS origin_imports_monthly(
    id BIGSERIAL PRIMARY KEY,
    month DATE NOT NULL,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    hts TEXT NOT NULL,
    description TEXT,
    quantity_m2 NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    source_url TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(month,country_code,hts)
  )`);
  await p.query(`CREATE TABLE IF NOT EXISTS processing_logs(
    id BIGSERIAL PRIMARY KEY,
    report_date DATE,
    source_url TEXT,
    level TEXT NOT NULL DEFAULT 'INFO',
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  // No historical rows are deleted or rewritten during initialization.

  // If PostgreSQL is newly connected and empty, establish the one source-verified
  // baseline. This is not fabricated history; it is the validated Aug. 31 report
  // bundled for offline/bootstrap continuity.
  const count=(await p.query('SELECT COUNT(*)::int AS n FROM quota_snapshots WHERE quota_id=$1',[QUOTA_ID])).rows[0].n;
  if(count===0){
    const s=seed[0];
    await p.query(`INSERT INTO quota_snapshots(report_date,quota_id,commodity,uom,max_quantity,allocated_quantity,percent_filled,remaining_quantity,validation_status,status,source_url,processed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(report_date,quota_id) DO NOTHING`,
      [s.report_date,s.quota_id,s.commodity,s.uom,s.max_quantity,s.allocated_quantity,s.percent_filled,s.remaining_quantity,s.validation_status,s.status,s.source_url,s.processed_at]);
  }
  return true;
}
function normalizeDate(v){
  if(v instanceof Date) return v.toISOString().slice(0,10);
  const s=String(v??'');
  const m=s.match(/(\d{4}-\d{2}-\d{2})/);
  return m?m[1]:s;
}
function normalize(r){ return {...r, report_date:normalizeDate(r.report_date), max_quantity:Number(r.max_quantity), allocated_quantity:Number(r.allocated_quantity), percent_filled:Number(r.percent_filled), remaining_quantity:Number(r.remaining_quantity)}; }
async function latest(){
  const p=getPool();
  if(!p) return normalize(seed[0]);
  const row=(await p.query('SELECT * FROM quota_snapshots WHERE quota_id=$1 ORDER BY report_date DESC LIMIT 1',[QUOTA_ID])).rows[0];
  return row ? normalize(row) : null;
}
async function history(){
  const p=getPool();
  if(!p) return seed.map(normalize);
  return (await p.query('SELECT * FROM quota_snapshots WHERE quota_id=$1 ORDER BY report_date DESC LIMIT 104',[QUOTA_ID])).rows.map(normalize);
}
async function logs(){
  const p=getPool();
  if(!p) return [{level:'INFO',message:'Test database not connected. Showing the bundled validated snapshot until the isolated test database is configured.',created_at:new Date().toISOString()}];
  return (await p.query('SELECT level,message,created_at,report_date,source_url FROM processing_logs ORDER BY created_at DESC LIMIT 25')).rows;
}
async function getByDate(report_date){
  const p=getPool();
  if(!p) return null;
  const row=(await p.query('SELECT * FROM quota_snapshots WHERE quota_id=$1 AND report_date=$2 LIMIT 1',[QUOTA_ID,report_date])).rows[0];
  return row ? normalize(row) : null;
}

async function hasSnapshot(report_date){
  const p=getPool();
  if(!p) return false;
  const row=(await p.query('SELECT 1 FROM quota_snapshots WHERE quota_id=$1 AND report_date=$2 LIMIT 1',[QUOTA_ID,report_date])).rowCount;
  return row>0;
}
async function save(s){
  const p=getPool();
  if(!p) throw new Error('APP_ENV=testing and QUARTZ_TEST_DATABASE_URL are required');
  await p.query(`INSERT INTO quota_snapshots(report_date,quota_id,commodity,uom,max_quantity,allocated_quantity,percent_filled,remaining_quantity,validation_status,status,source_url)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(report_date,quota_id) DO UPDATE SET commodity=EXCLUDED.commodity,uom=EXCLUDED.uom,max_quantity=EXCLUDED.max_quantity,allocated_quantity=EXCLUDED.allocated_quantity,percent_filled=EXCLUDED.percent_filled,remaining_quantity=EXCLUDED.remaining_quantity,validation_status=EXCLUDED.validation_status,status=EXCLUDED.status,source_url=EXCLUDED.source_url,processed_at=NOW()`,
    [s.report_date,s.quota_id,s.commodity,s.uom,s.max_quantity,s.allocated_quantity,s.percent_filled,s.remaining_quantity,s.validation_status||'VALIDATED',s.status||'OPEN',s.source_url]);
}
async function log(level,message,report_date=null,source_url=null){
  const p=getPool();
  if(!p) return;
  await p.query('INSERT INTO processing_logs(report_date,source_url,level,message) VALUES($1,$2,$3,$4)',[report_date,source_url,level,message]);
}

async function saveOrigin(row){
  const p=getPool();
  if(!p) throw new Error('APP_ENV=testing and QUARTZ_TEST_DATABASE_URL are required');
  await p.query(`INSERT INTO origin_imports_monthly(month,country_code,country_name,hts,description,quantity_m2,unit,source_url)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(month,country_code,hts) DO UPDATE SET country_name=EXCLUDED.country_name,description=EXCLUDED.description,quantity_m2=EXCLUDED.quantity_m2,unit=EXCLUDED.unit,source_url=EXCLUDED.source_url,processed_at=NOW()`,
    [row.month+'-01',row.country_code,row.country_name,row.hts,row.description,row.quantity_m2,row.unit,row.source_url]);
}
async function originHistory(){
  const p=getPool();
  if(!p) return [];
  return (await p.query(`SELECT month,country_code,country_name,hts,description,quantity_m2,unit,source_url,processed_at
    FROM origin_imports_monthly ORDER BY month DESC,country_name,hts`)).rows.map(r=>({...r,quantity_m2:Number(r.quantity_m2)}));
}
async function originLatest(){
  const rows=await originHistory();
  return rows[0]||null;
}
module.exports={getPool,init,latest,history,getByDate,hasSnapshot,logs,save,log,saveOrigin,originHistory,originLatest};
