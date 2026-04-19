#!/usr/bin/env node
/**
 * Backfill kết quả xổ số miền Nam trong khoảng thời gian.
 * Skip ngày đã có file.
 *
 * Usage:
 *   node scripts/backfill.js 2026-01-01 2026-04-19
 */

const fs = require('fs');
const path = require('path');
const { fetchDate, saveResults } = require('./fetch');

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function* dateRange(start, end) {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    yield `${y}-${m}-${day}`;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const start = process.argv[2];
  const end = process.argv[3];
  if (!start || !end) {
    console.error('Usage: node scripts/backfill.js YYYY-MM-DD YYYY-MM-DD');
    process.exit(1);
  }

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const date of dateRange(start, end)) {
    const filePath = path.join(RESULTS_DIR, `${date}.json`);
    if (fs.existsSync(filePath)) {
      console.log(`[backfill] ${date} ⏭️  already exists, skip`);
      skipped++;
      continue;
    }

    try {
      const provinces = await fetchDate(date);
      if (provinces && provinces.length > 0) {
        saveResults(date, provinces);
        console.log(`[backfill] ${date} ✅ saved (${provinces.length} provinces)`);
        succeeded++;
      } else {
        console.log(`[backfill] ${date} ❌ no data`);
        failed++;
      }
    } catch (err) {
      console.log(`[backfill] ${date} ❌ error: ${err.message}`);
      failed++;
    }

    // Throttle để tránh bị block
    await sleep(500);
  }

  console.log('');
  console.log(`[backfill] Done: ✅ ${succeeded} new, ⏭️ ${skipped} skipped, ❌ ${failed} failed`);
}

main().catch((err) => {
  console.error('[backfill] ❌', err);
  process.exit(1);
});
