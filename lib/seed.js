const { QUOTA_ID, QUOTA_NAME, DEFAULT_UOM } = require('./config');

// Offline bootstrap only. This is the latest CBP report we have actually
// validated from the source PDF. It is NOT historical seed data.
const seed = [
  {
    report_date:'2026-08-31',
    quota_id:QUOTA_ID,
    commodity:QUOTA_NAME,
    uom:DEFAULT_UOM,
    max_quantity:3251606.00,
    allocated_quantity:742225.65,
    percent_filled:22.83,
    remaining_quantity:2509380.35,
    source_url:'https://www.cbp.gov/document/report/commodity-status-report',
    validation_status:'VALIDATED',
    status:'OPEN',
    processed_at:'2026-08-31T13:30:00.000Z'
  }
];

module.exports = { seed };
