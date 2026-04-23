#!/usr/bin/env node
/**
 * Backfill kết quả xổ số theo miền trong khoảng ngày.
 * Skip ngày đã có file.
 *
 * Usage:
 *   node scripts/backfill.js 2026-01-01 2026-04-19          # south (default)
 *   node scripts/backfill.js 2026-01-01 2026-04-19 central
 *   node scripts/backfill.js 2026-01-01 2026-04-19 north
 *   node scripts/backfill.js 2026-01-01 2026-04-19 all      # cả 3 miền
 *   node scripts/backfill.js 2026-01-01 2026-04-19 all --force  # ghi đè file đã tồn tại
 */

const FORCE = process.argv.includes('--force');

const fs = require('fs');
const path = require('path');
const { fetchDate, saveResults, REGIONS } = require('./fetch');

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

async function backfillOneRegion(start, end, region) {
  const regionCfg = REGIONS[region];
  const RESULTS_DIR = path.join(__dirname, '..', 'results', regionCfg.folder);

  console.log(`\n=== Backfilling [${region}] ${regionCfg.name} ===`);

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const date of dateRange(start, end)) {
    const filePath = path.join(RESULTS_DIR, `${date}.json`);
    if (fs.existsSync(filePath) && !FORCE) {
      console.log(`[${region}] ${date} ⏭️  exists, skip`);
      skipped++;
      continue;
    }

    try {
      const provinces = await fetchDate(date, region);
      if (provinces && provinces.length > 0) {
        saveResults(date, provinces, region);
        console.log(`[${region}] ${date} ✅ (${provinces.length} provinces)`);
        succeeded++;
      } else {
        console.log(`[${region}] ${date} ❌ no data`);
        failed++;
      }
    } catch (err) {
      console.log(`[${region}] ${date} ❌ ${err.message}`);
      failed++;
    }

    await sleep(500);
  }

  console.log(`\n[${region}] Done: ✅ ${succeeded} new, ⏭️ ${skipped} skipped, ❌ ${failed} failed`);
  return { succeeded, skipped, failed };
}

async function main() {
  const start = process.argv[2];
  const end = process.argv[3];
  const region = process.argv[4] || 'south';

  if (!start || !end) {
    console.error('Usage: node scripts/backfill.js YYYY-MM-DD YYYY-MM-DD [south|central|north|all]');
    process.exit(1);
  }

  if (region === 'all') {
    for (const r of ['south', 'central', 'north']) {
      await backfillOneRegion(start, end, r);
    }
  } else {
    if (!REGIONS[region]) {
      console.error(`Unknown region: ${region}`);
      process.exit(1);
    }
    await backfillOneRegion(start, end, region);
  }

  console.log('\n[backfill] All done!');
}

main().catch((err) => {
  console.error('[backfill] ❌', err);
  process.exit(1);
});
