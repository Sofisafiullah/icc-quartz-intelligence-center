let data=[], mode='pct';
const $=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const dateFmt=d=>{const s=String(d||''); const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m)return '—'; return new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});};
const setText=(id,v)=>{const el=$(id);if(el)el.textContent=v};
const QUARTERS=[
  {id:'Q1',start:'2026-08-15',end:'2026-11-14',avoid:'Oct 15 – Nov 14',label:'Aug 15 – Nov 14, 2026'},
  {id:'Q2',start:'2026-11-15',end:'2027-02-13',avoid:'Jan 13 – Feb 13',label:'Nov 15, 2026 – Feb 13, 2027'},
  {id:'Q3',start:'2027-02-14',end:'2027-05-15',avoid:'Apr 15 – May 15',label:'Feb 14 – May 15, 2027'},
  {id:'Q4',start:'2027-05-16',end:'2027-08-14',avoid:'Jul 14 – Aug 14',label:'May 16 – Aug 14, 2027'}
];
function quarterForDate(date){const s=String(date||'').slice(0,10); return QUARTERS.find(q=>s>=q.start&&s<=q.end)||null}
function daysLeft(q){const now=new Date(); const end=new Date(q.end+'T23:59:59Z'); return Math.max(0,Math.ceil((end-now)/86400000));}
function renderQuarters(){
  const el=$('quarterGrid'); if(!el)return;
  const currentDate=new Date().toISOString().slice(0,10);
  el.innerHTML=QUARTERS.map(q=>{
    const active=currentDate>=q.start&&currentDate<=q.end;
    const rows=data.filter(x=>quarterForDate(x.report_date)?.id===q.id);
    const latest=rows[0];
    const used=latest?fmt(latest.allocated_quantity)+' M²':'—';
    const pct=latest?Number(latest.percent_filled).toFixed(2)+'%':'—';
    const remaining=latest?fmt(latest.remaining_quantity)+' M²':'—';
    return `<article class="quarter-card ${active?'active':''}">
      <div class="quarter-card-head"><span class="q-chip">${q.id}</span><span class="q-status ${active?'active':''}">${active?'ACTIVE':'UPCOMING'}</span></div>
      <div class="q-period">${q.label}</div>
      <div class="q-avoid"><span>FINAL MONTH / ARRIVAL WINDOW</span><b>Avoid arrivals ${q.avoid}</b></div>
      <div class="q-stats"><div><span>USED</span><b>${used}</b></div><div><span>UTILIZATION</span><b>${pct}</b></div><div><span>REMAINING</span><b>${remaining}</b></div></div>
      <div class="q-foot">${latest?`Latest CBP snapshot · ${dateFmt(latest.report_date)}`:'No CBP snapshot yet'}</div>
    </article>`;
  }).join('');
}
async function api(path,opts){const r=await fetch(path,opts);if(!r.ok)throw new Error(await r.text());return r.json()}
function renderChart(){const svg=$('chart'),rows=[...data].reverse();if(!rows.length){svg.innerHTML='';return}const W=1000,H=360,p={l:64,r:24,t:24,b:44};let vals=rows.map(r=>mode==='pct'?Number(r.percent_filled):mode==='used'?Number(r.allocated_quantity):Number(r.remaining_quantity));let min=Math.min(...vals),max=Math.max(...vals);if(mode==='pct'){min=0;max=Math.max(100,max)}else{const range=Math.max(max-min,1);min=Math.max(0,min-range*.18);max=max+range*.18}const x=i=>p.l+i*((W-p.l-p.r)/Math.max(rows.length-1,1));const y=v=>p.t+(max-v)*(H-p.t-p.b)/(max-min||1);let out='<defs><linearGradient id="gradArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#67e8f9"/><stop offset="100%" stop-color="#67e8f9" stop-opacity="0"/></linearGradient></defs>';for(let i=0;i<5;i++){const yy=p.t+i*(H-p.t-p.b)/4,val=max-i*(max-min)/4;out+=`<line class="gridline" x1="${p.l}" x2="${W-p.r}" y1="${yy}" y2="${yy}"/><text class="axis" x="8" y="${yy+4}">${mode==='pct'?val.toFixed(0)+'%':(val/1000000).toFixed(2)+'M'}</text>`}const pts=rows.map((r,i)=>`${x(i)},${y(vals[i])}`).join(' ');out+=`<polygon class="area" points="${p.l},${H-p.b} ${pts} ${x(rows.length-1)},${H-p.b}"/><polyline class="line" points="${pts}"/>`;rows.forEach((r,i)=>{out+=`<circle class="dotc" cx="${x(i)}" cy="${y(vals[i])}" r="5"/><text class="axis" text-anchor="middle" x="${x(i)}" y="${H-14}">${dateFmt(r.report_date).replace(', 2026','').replace(', 2027','')}</text>`});svg.innerHTML=out}
function render(summary){const r=summary.latest;if(!r)return;const rem=100-Number(r.percent_filled);setText('usedPct',Number(r.percent_filled).toFixed(2)+'%');setText('remainingPct',rem.toFixed(2)+'%');setText('usedQty',fmt(r.allocated_quantity));setText('remainingQty',fmt(r.remaining_quantity));setText('totalQty',fmt(r.max_quantity));setText('weeklyChange',summary.weekly_change==null?'—':(summary.weekly_change>=0?'+':'')+fmt(summary.weekly_change));setText('pctChange',summary.pct_change==null?'—':(summary.pct_change>=0?'+':'')+Number(summary.pct_change).toFixed(2));setText('quotaStatus',r.status||'OPEN');setText('reportDate',dateFmt(r.report_date));setText('reportCount',summary.report_count);setText('tableCount',summary.report_count+' REPORT'+(summary.report_count===1?'':'S'));setText('lastSync',r.processed_at?new Date(r.processed_at).toLocaleString():'—');$('barFill').style.width=r.percent_filled+'%';document.querySelector('.orb').style.background=`conic-gradient(var(--cyan) ${r.percent_filled}%, rgba(255,255,255,.07) 0)`;setText('validationBadge',r.validation_status||'VALIDATED');setText('dbStatus',summary.database_connected?'POSTGRESQL ONLINE':'DEMO SNAPSHOT');setText('automationStatus',summary.database_connected?'CBP parser + validator':'DB pending · seed snapshot active');const tbody=$('historyBody');tbody.innerHTML=data.map((x,i)=>{const q=quarterForDate(x.report_date);const delta=i===data.length-1?null:Number(x.allocated_quantity)-Number(data[i+1].allocated_quantity);return `<tr><td><b>${dateFmt(x.report_date)}</b></td><td><span class="quarter-mini">${q?.id||'—'}</span></td><td>${fmt(x.allocated_quantity)} M²</td><td>${fmt(x.remaining_quantity)} M²</td><td>${Number(x.percent_filled).toFixed(2)}%</td><td>${delta==null?'—':(delta>=0?'+':'')+fmt(delta)+' M²'}</td><td class="${x.validation_status==='VALIDATED'?'ok':'seed'}">● ${x.validation_status||'VALIDATED'}</td><td>${x.source_type==='SCREENSHOT'?'Recovered from screenshot':(x.source_url?`<a class="source-link" href="${x.source_url}" target="_blank" rel="noreferrer">View PDF ↗</a>`:'—')}</td></tr>`}).join('');renderChart();renderQuarters();}

function renderOrigin(payload){
  const rows=payload.monthly||[];
  const countries=payload.countries||['Philippines','Cambodia','South Korea'];
  const hts=payload.hts||['6810990020','6810990040'];
  const fmtM2=n=>n===null||n===undefined?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const latest=payload.latest_available||rows.find(r=>r.status==='Available');
  const cards=$('originCards');
  if(cards){
    cards.innerHTML=countries.map(country=>`<div class="origin-card"><span>${country.toUpperCase()}</span><strong>${latest?fmtM2(latest[country]):'—'}</strong><small>M² · ${latest?latest.month:'no data yet'}</small></div>`).join('')+
      `<div class="origin-card"><span>COMBINED</span><strong>${latest?fmtM2(latest.combined):'—'}</strong><small>M² · ${latest?latest.month:'no data yet'}</small></div>`;
  }
  const host=$('originCountryTables');
  if(!host)return;
  if(!rows.length){host.innerHTML='<p>No monthly Census history returned yet.</p>';return;}
  host.innerHTML=countries.map(country=>{
    const body=rows.map(r=>{
      const by=r.by_hts||{};
      const a=by[`${country}_${hts[0]}`], b=by[`${country}_${hts[1]}`];
      const total=(a!==null&&a!==undefined)||(b!==null&&b!==undefined)?Number(a||0)+Number(b||0):null;
      const status=total===null?'Pending':'Available';
      return `<tr><td><b>${r.month}</b></td><td>${fmtM2(a)}</td><td>${fmtM2(b)}</td><td><b>${fmtM2(total)}</b></td><td><span class="origin-status ${status==='Available'?'available':'pending'}">${status}</span></td></tr>`;
    }).join('');
    return `<section class="origin-country-block"><h3>${country}<span>Monthly imports · M²</span></h3><div class="table-wrap"><table class="origin-table"><thead><tr><th>Month</th><th>HTS ${hts[0]}</th><th>HTS ${hts[1]}</th><th>Country monthly total</th><th>Data status</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
  }).join('');
}
async function loadOrigin(){
  try{const o=await api('/api/origin-imports');renderOrigin(o)}
  catch(e){console.error(e);const b=$('originBody');if(b)b.innerHTML='<p>Origin import data unavailable. Check the API logs.</p>'}
}
async function refreshOrigin(){
  const b=$('originRefreshBtn'); if(!b)return;
  b.disabled=true;
  let totalSaved=0, checked=0, skipped=0, failures=0;
  try{
    const overview=await api('/api/origin-imports');
    const [year,month]=overview.current_month.split('-').map(Number);
    const lastCompleteDate=new Date(Date.UTC(year,month-2,1));
    const lastComplete=`${lastCompleteDate.getUTCFullYear()}-${String(lastCompleteDate.getUTCMonth()+1).padStart(2,'0')}`;
    const months=(overview.monthly||[]).filter(row=>row.month<=lastComplete && Number(row.available_records||0)<6).map(row=>row.month);
    const latestAvailable=overview.latest_available?.month;
    if(latestAvailable && latestAvailable<=lastComplete) months.push(latestAvailable);
    const uniqueMonths=[...new Set(months)].sort();
    if(!uniqueMonths.length){b.textContent='✓ Census history is up to date';await loadOrigin();alert('No missing completed months were found.');return;}
    for(let i=0;i<uniqueMonths.length;i++){
      const monthKey=uniqueMonths[i];
      b.textContent=`↻ Syncing Census imports · ${i+1}/${uniqueMonths.length} (${monthKey})`;
      const r=await api('/api/origin-refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({month:monthKey}),signal:AbortSignal.timeout(20000)});
      totalSaved+=Number(r.records_saved||0); checked++;
      skipped+=Array.isArray(r.skipped)?r.skipped.length:0;
      failures+=Number(r.errors||0);
    }
    await loadOrigin();
    const message=`Census sync finished.\nMonths checked: ${checked}\nRecords saved or updated: ${totalSaved}\nNo-data / skipped rows: ${skipped}\nRequest errors: ${failures}`;
    alert(message);
  }catch(e){
    await loadOrigin();
    alert('Census sync stopped before all months were checked. Any successful monthly results were saved; existing history was not deleted.\n\n'+e.message);
  }finally{b.disabled=false;b.innerHTML='↻ <span>Sync Origin Imports</span>'}
}

async function load(){try{const [s,h,l]=await Promise.all([api('/api/summary'),api('/api/history'),api('/api/logs')]);data=h;render(s);$('logsList').innerHTML=l.map(x=>`<div class="log"><div class="log-head"><span>${x.level||'INFO'}</span><span>${x.created_at?new Date(x.created_at).toLocaleString():'—'}</span></div><p>${x.message}</p></div>`).join('')}catch(e){console.error(e);$('liveText').textContent='OFFLINE';document.querySelector('.live-chip').style.color='#fda4af'}}
async function refresh(){const buttons=[$('refreshBtn'),$('refreshBtn2')].filter(Boolean);buttons.forEach((b,i)=>{b.disabled=true;b.textContent=i?'Scanning all CBP reports…':'↻ Scanning all CBP reports…'});try{const r=await api('/api/refresh',{method:'POST'});$('liveText').textContent=r.inserted?'UPDATED':'SYNCED';$('automationStatus').textContent=r.new_report?'CBP history synchronized':`CBP scan complete · ${r.reports_seen||0} reports checked`;await load();loadOrigin();alert(r.message||'CBP history scan complete.');}catch(e){alert('CBP refresh failed — no dashboard data was changed.\n\n'+e.message)}finally{buttons.forEach((b,i)=>{b.disabled=false;b.innerHTML=i?'Sync All CBP Reports':'↻ <span>Sync CBP Reports</span>'})}}
$('refreshBtn').onclick=refresh;$('refreshBtn2').onclick=refresh;$('originRefreshBtn').onclick=refreshOrigin;document.querySelectorAll('.seg').forEach(b=>b.onclick=()=>{document.querySelectorAll('.seg').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.mode;renderChart()});
(function stars(){const c=$('stars'),ctx=c.getContext('2d');let w,h,pts=[];function resize(){w=c.width=innerWidth;h=c.height=innerHeight;pts=Array.from({length:120},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.5+.2,s:Math.random()*.25+.05}))}function draw(){ctx.clearRect(0,0,w,h);for(const p of pts){p.y+=p.s;if(p.y>h){p.y=0;p.x=Math.random()*w}ctx.beginPath();ctx.fillStyle='rgba(180,220,255,.45)';ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}requestAnimationFrame(draw)}addEventListener('resize',resize);resize();draw()})();load();loadOrigin();
