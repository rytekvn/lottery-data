#!/usr/bin/env node
/**
 * Sửa tại chỗ data G7 sai (4 chữ số kết thúc "8") → 3 chữ số đầu.
 * Áp dụng cho miền Nam/Trung. Bỏ qua nếu G7 đã đúng 3 chữ số.
 *
 * Usage:
 *   node scripts/fix-g7.js              # dry-run, chỉ report
 *   node scripts/fix-g7.js --apply      # ghi đè file
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

function fixRegion(region) {
  const dir = path.join(__dirname, '..', 'results', region);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  let scanned = 0;
  let fixed = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let modified = false;

    for (const result of data.results || []) {
      const g7 = result.prizes && result.prizes.seventhPrize;
      if (Array.isArray(g7) && g7.length === 1 && /^\d{4}$/.test(g7[0]) && g7[0].endsWith('8')) {
        const oldVal = g7[0];
        const newVal = oldVal.substring(0, 3);
        result.prizes.seventhPrize = [newVal];
        modified = true;
        console.log(`  ${file} [${result.province}] G7: ${oldVal} → ${newVal}`);
      }
    }

    scanned++;
    if (modified) {
      fixed++;
      if (APPLY) fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
  }

  console.log(`[${region}] scanned ${scanned}, ${APPLY ? 'fixed' : 'would fix'} ${fixed} files\n`);
}

console.log(APPLY ? '🔧 APPLYING fixes...\n' : '🔍 DRY RUN (use --apply to write)\n');
for (const region of ['south', 'central']) {
  fixRegion(region);
}
