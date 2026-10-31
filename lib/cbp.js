const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const { CBP_PAGE, QUOTA_ID, QUOTA_NAME, DEFAULT_UOM } = require('./config');

const UOM_RE = '(M²|M2|SQM|KG|MT|L)';
const STATUS_RE = '(OPEN|POTF|FILL|BAND|EXCL)';
const NUMBER_RE = '(\\d[\\d,]*(?:\\.\\d+)?)';

function dateFrom(s) {
  const str = String(s || '');
  let m = str.match(/([a-z]{3,9})[ _-]+(\d{1,2})(?:[ _-]+(20\d{2}))?/i);
  let y = (str.match(/20\d{2}/) || [])[0];
  if (!y) return null;
  if (!m) return null;
  const mo = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }[m[1].slice(0,3).toLowerCase()];
  return mo == null ? null : new Date(Date.UTC(+y, mo, +m[2])).toISOString().slice(0, 10);
}

function isReportLink(href, text) {
  const hay = `${href} ${text}`.toLowerCase();
  return /commodity[_ -]?status[_ -]?report|quota[_ -]?status[_ -]?report/.test(hay) && (/\.pdf(?:$|[?#])/i.test(href) || /quota\s+status\s+report/i.test(text));
}

async function discoverAll() {
  const r = await fetch(CBP_PAGE, { headers: { 'user-agent': 'QuartzQuotaTracker/6.0' } });
  if (!r.ok) throw Error('CBP page returned ' + r.status);
  const $ = cheerio.load(await r.text());
  const byUrl = new Map();
  $('a[href]').each((_, e) => {
    const href = $(e).attr('href') || '';
    const text = $(e).text().replace(/\s+/g, ' ').trim();
    if (!isReportLink(href, text)) return;
    const d = dateFrom(`${href} ${text}`);
    if (!d) return;
    const url = new URL(href, CBP_PAGE).href;
    byUrl.set(url, { url, date: d, label: text || url });
  });
  const reports = [...byUrl.values()].sort((a, b) => b.date.localeCompare(a.date));
  if (!reports.length) throw Error('No weekly CBP Commodity Status Report PDF links found');
  return reports;
}

async function discover() {
  return (await discoverAll())[0];
}

function n(x) { return Number(String(x).replace(/,/g, '')); }

function targetBlock(text) {
  const start = text.indexOf(QUOTA_ID);
  if (start < 0) throw Error('Quota ID ' + QUOTA_ID + ' was not found');
  const after = text.slice(start);
  // Stop at the next quota/license ID. Keeping this block small prevents a
  // neighboring row from being accidentally parsed as Quartz.
  const next = after.slice(QUOTA_ID.length).search(/(?:98|99)\d{4,}[A-Z0-9]+/i);
  // CBP's PDF extractor may remove the row newline, so do not require a line break.
  // The search starts after our own quota ID to avoid matching the current row.
  const boundary = next >= 0 ? QUOTA_ID.length + next : Math.min(after.length, 4000);
  return after.slice(0, boundary);
}

function parseQuantityAndPercent(normalized) {
  const direct = new RegExp(
    NUMBER_RE + '\\s*' + UOM_RE + '\\s*' + NUMBER_RE + '\\s*' + '(\\d+(?:\\.\\d+)?)%' + '\\s*' + STATUS_RE,
    'i'
  ).exec(normalized);
  if (direct) {
    return {
      max: n(direct[1]),
      uom: direct[2],
      allocated: n(direct[3]),
      pct: n(direct[4]),
      status: direct[5].toUpperCase()
    };
  }

  // Some PDF extractors concatenate adjacent cells. For this report the
  // failure looked like: 742225.6522.83% (allocated + percent). Find the
  // number immediately before '%' and try every valid split, accepting only
  // the split whose calculated utilization agrees with the report value.
  const head = new RegExp(NUMBER_RE + '\\s*' + UOM_RE + '\\s*', 'i').exec(normalized);
  if (!head) throw Error('Quartz quota row could not be parsed from the CBP PDF');

  const max = n(head[1]);
  const uom = head[2];
  const tailStart = head.index + head[0].length;
  const tail = normalized.slice(tailStart, tailStart + 180);
  const pctIndex = tail.indexOf('%');
  if (pctIndex < 0) throw Error('Percent filled not found in the Quartz quota row');

  const prefix = tail.slice(0, pctIndex);
  const tokenMatch = prefix.match(/([\d,.]+)\s*$/);
  if (!tokenMatch) throw Error('Allocated quantity not found in the Quartz quota row');
  const token = tokenMatch[1].replace(/,/g, '');
  const candidates = [];

  for (let split = 1; split < token.length; split++) {
    const left = token.slice(0, split);
    const right = token.slice(split);
    if (!/^\d+(?:\.\d+)?$/.test(left) || !/^\d+(?:\.\d+)?$/.test(right)) continue;
    const allocated = Number(left);
    const pct = Number(right);
    if (!Number.isFinite(allocated) || !Number.isFinite(pct) || pct < 0 || pct > 100) continue;
    const calculated = max ? allocated / max * 100 : 0;
    if (allocated >= 0 && allocated <= max && Math.abs(calculated - pct) <= 0.15) {
      candidates.push({ allocated, pct });
    }
  }

  if (!candidates.length) {
    // Last-resort row parser: locate the first percentage after the max/UOM and
    // split the numeric token immediately before it. This handles PDFs where
    // table cells are concatenated as e.g. 742225.6522.83%.
    const pctMatch = tail.match(/(\d+(?:\.\d+)?)%/);
    const allocatedMatch = prefix.match(/(\d[\d,]*(?:\.\d+)?)\s*$/);
    if (!pctMatch || !allocatedMatch) {
      throw Error('Allocated quantity and percentage could not be safely separated in the Quartz quota row');
    }
    const allocated = n(allocatedMatch[1]);
    const pct = n(pctMatch[1]);
    candidates.push({ allocated, pct });
  }

  const best = candidates[0];
  const statusMatch = tail.slice(pctIndex + 1).match(new RegExp('^\\s*' + STATUS_RE, 'i'));
  return { max, uom, allocated: best.allocated, pct: best.pct, status: statusMatch ? statusMatch[0].trim().toUpperCase() : 'OPEN' };
}

function extract(text, report_date, source_url) {
  const block = targetBlock(text);
  const normalized = block.replace(/\r/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim();
  const parsed = parseQuantityAndPercent(normalized);

  if (!Number.isFinite(parsed.max) || !Number.isFinite(parsed.allocated) || !Number.isFinite(parsed.pct)) {
    throw Error('Quartz quota row contains invalid numeric values');
  }
  if (parsed.max <= 0 || parsed.allocated < 0 || parsed.allocated > parsed.max) {
    throw Error(`Quartz quota quantities are invalid: allocated ${parsed.allocated} vs maximum ${parsed.max}`);
  }

  const calculatedPct = parsed.allocated / parsed.max * 100;
  if (Math.abs(calculatedPct - parsed.pct) > 0.15) {
    throw Error(`Validation failed: ${parsed.pct.toFixed(2)}% reported vs ${calculatedPct.toFixed(2)}% calculated`);
  }

  const remaining = Math.max(0, parsed.max - parsed.allocated);
  return {
    report_date,
    quota_id: QUOTA_ID,
    commodity: QUOTA_NAME,
    uom: parsed.uom || DEFAULT_UOM,
    max_quantity: parsed.max,
    allocated_quantity: parsed.allocated,
    percent_filled: parsed.pct,
    remaining_quantity: remaining,
    percent_remaining: Number((remaining / parsed.max * 100).toFixed(2)),
    validation_status: 'VALIDATED',
    status: parsed.status || 'OPEN',
    source_url
  };
}

async function parsePdfBuffer(buffer) {
  const first = await pdfParse(buffer);
  try {
    return { text: first.text, parser: 'pdf-parse-default' };
  } catch {}
}

async function parsePdfWithLayout(buffer) {
  return pdfParse(buffer, {
    pagerender: async pageData => {
      const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: true });
      const items = (content.items || []).map(item => ({
        text: String(item.str || ''),
        x: Number(item.transform?.[4] || 0),
        y: Number(item.transform?.[5] || 0)
      })).filter(item => item.text.trim());
      items.sort((a,b) => b.y - a.y || a.x - b.x);
      const lines = [];
      for (const item of items) {
        let line = lines.find(l => Math.abs(l.y - item.y) <= 2.5);
        if (!line) { line = { y:item.y, items:[] }; lines.push(line); }
        line.items.push(item);
      }
      lines.sort((a,b) => b.y - a.y);
      return lines.map(l => l.items.sort((a,b) => a.x-b.x).map(i => i.text).join(' ')).join('\n');
    }
  });
}

async function collectReport(report) {
  const p = await fetch(report.url, { headers: { 'user-agent': 'QuartzQuotaTracker/7.0' } });
  if (!p.ok) throw Error(`CBP PDF returned ${p.status} for ${report.date}`);
  const buffer = Buffer.from(await p.arrayBuffer());
  let firstError;
  try {
    const pdf = await parsePdfBuffer(buffer);
    return extract(pdf.text, report.date, report.url);
  } catch (e) {
    firstError = e;
  }
  try {
    const pdf = await parsePdfWithLayout(buffer);
    return extract(pdf.text, report.date, report.url);
  } catch (e) {
    throw Error(`${e.message} (default PDF extraction: ${firstError?.message || 'failed'}; layout extraction also failed)`);
  }
}

async function collect() {
  return collectReport(await discover());
}

async function collectAll() {
  const reports = await discoverAll();
  const results = [];
  const skipped = [];
  for (const report of reports) {
    try {
      results.push(await collectReport(report));
    } catch (e) {
      skipped.push({ ...report, reason: e.message });
    }
  }
  return { results, skipped, reports };
}

module.exports = { collect, collectAll, discover, discoverAll, extract, targetBlock, parseQuantityAndPercent };
