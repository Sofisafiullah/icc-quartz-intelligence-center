const { ORIGIN_IMPORT_START, ORIGIN_COUNTRIES, ORIGIN_HTS } = require('./config');

const API_BASE = 'https://api.census.gov/data/timeseries/intltrade/imports/hs';
const SOURCE_PAGE = 'https://api.census.gov/data/timeseries/intltrade/imports/hs.html';

function monthsFrom(start, end) {
  const out = [];
  let [y,m] = start.split('-').map(Number);
  const [ey,em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2,'0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}

async function fetchMonth(month, countryCode, hts) {
  const params = new URLSearchParams({
    get: 'I_COMMODITY_SDESC,CON_QY1_MO,CON_QY1_YR,UNIT_QY1,CTY_NAME,CTY_CODE,YEAR,MONTH,I_COMMODITY',
    time: month,
    CTY_CODE: countryCode,
    I_COMMODITY: hts
  });
  if (process.env.CENSUS_API_KEY) params.set('key', process.env.CENSUS_API_KEY);
  const url = `${API_BASE}?${params.toString()}`;
  const r = await fetch(url, { headers: { 'user-agent': 'ICCQuartzCommandCenter/1.0' }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`Census API returned ${r.status} for ${countryCode}/${hts}/${month}`);
  const json = await r.json();
  if (!Array.isArray(json) || json.length < 2) return null;
  const headers = json[0];
  const row = json[1];
  const obj = Object.fromEntries(headers.map((h,i)=>[h,row[i]]));
  const qty = Number(String(obj.CON_QY1_MO ?? '').replace(/,/g,''));
  if (!Number.isFinite(qty)) return null;
  return {
    month,
    country_code: countryCode,
    country_name: ORIGIN_COUNTRIES[countryCode]?.name || obj.CTY_NAME,
    hts: hts,
    description: obj.I_COMMODITY_SDESC || '',
    quantity_m2: qty,
    unit: obj.UNIT_QY1 || '',
    source_url: url.replace(/([?&])key=[^&]+/, '$1')
  };
}

async function collectOriginImports(start=ORIGIN_IMPORT_START, end=currentMonth()) {
  const months = monthsFrom(start, end);
  const results = [];
  const skipped = [];
  const tasks=[];
  for (const month of months) for (const countryCode of Object.keys(ORIGIN_COUNTRIES)) for (const hts of ORIGIN_HTS) tasks.push({month,countryCode,hts});
  // This collector is called one month at a time by the refresh endpoint.
  // Six requests cover the 3 countries x 2 HTS codes and run concurrently.
  // Each request has a short timeout so a slow upstream response cannot hold
  // a Vercel function open indefinitely.
  let cursor=0;
  const workers=Array.from({length:3},async()=>{
    while(true){
      const index=cursor++;
      if(index>=tasks.length) return;
      const {month,countryCode,hts}=tasks[index];
      try{
        const row=await fetchMonth(month,countryCode,hts);
        if(!row){skipped.push({month,countryCode,hts,reason:'No monthly quantity returned'});continue;}
        if(!/^M2$/i.test(row.unit)){skipped.push({month,countryCode,hts,reason:`Unexpected Census unit: ${row.unit}`});continue;}
        results.push(row);
      }catch(e){skipped.push({month,countryCode,hts,reason:e.message});}
    }
  });
  await Promise.all(workers);
  results.sort((a,b)=>a.month.localeCompare(b.month)||a.country_name.localeCompare(b.country_name)||a.hts.localeCompare(b.hts));
  return {results, skipped, months};
}

module.exports = { collectOriginImports, fetchMonth, monthsFrom, currentMonth, SOURCE_PAGE };
