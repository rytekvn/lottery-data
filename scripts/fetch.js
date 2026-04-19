#!/usr/bin/env node
/**
 * Fetch kết quả xổ số miền Nam từ RSS feed của xskt.com.vn
 * và lưu thành file JSON theo ngày.
 *
 * Usage:
 *   node scripts/fetch.js            # fetch hôm nay
 *   node scripts/fetch.js 2026-04-08 # fetch ngày cụ thể
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const RSS_URL = 'https://xskt.com.vn/rss-feed/mien-nam-xsmn.rss';
const RESULTS_DIR = path.join(__dirname, '..', 'results');

// ----- Helpers -----

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function todayString() {
  // Giờ VN (UTC+7)
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 3600 * 1000);
  const y = vnTime.getUTCFullYear();
  const m = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vnTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ----- RSS Parser -----

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const title = extractTag(content, 'title');
    const description = extractTag(content, 'description');
    const link = extractTag(content, 'link');
    items.push({ title, description, link });
  }
  return items;
}

function extractTag(content, tag) {
  const m = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : '';
}

function extractDate(title, link) {
  // Thử dd/MM/yyyy từ title
  const fullMatch = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fullMatch) {
    const [, d, m, y] = fullMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Thử dd/MM từ title (dùng năm hiện tại)
  const shortMatch = title.match(/(\d{1,2})\/(\d{1,2})/);
  if (shortMatch) {
    const [, d, m] = shortMatch;
    const year = new Date().getFullYear();
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Từ link: /xsmn/ngay-8-4-2026
  const linkMatch = link.match(/ngay-(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (linkMatch) {
    const [, d, m, y] = linkMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

// ----- Prize parser -----

function parseProvinces(description) {
  const results = [];
  const regex = /\[([^\]]+)\]/g;
  const matches = [...description.matchAll(regex)];

  for (let i = 0; i < matches.length; i++) {
    const provinceName = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : description.length;
    const text = description.substring(start, end);

    const prizes = parsePrizes(text);
    results.push({ province: provinceName, prizes });
  }
  return results;
}

function parsePrizes(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const map = {};

  for (const line of lines) {
    if (line.startsWith('ĐB:')) {
      map['ĐB'] = line.slice(3).trim();
    } else {
      const m = line.match(/^(\d+):\s*(.*)$/);
      if (m) {
        const key = m[1];
        if (parseInt(key) >= 1 && parseInt(key) <= 7) {
          map[key] = m[2].trim();
        }
      }
    }
  }

  const getList = (k) => (map[k] || '').split(' - ').map((x) => x.trim()).filter(Boolean);

  // Giải 7 miền Nam format "xxxx: yy" (G7: G8)
  let seventh = [];
  let eighth = [];
  const g7Raw = map['7'] || '';
  const g7Parts = g7Raw.split(': ');
  if (g7Parts.length === 2) {
    seventh = [g7Parts[0].trim()];
    eighth = [g7Parts[1].trim()];
  } else {
    seventh = getList('7');
  }

  return {
    specialPrize: map['ĐB'] || '',
    firstPrize: map['1'] || '',
    secondPrize: getList('2'),
    thirdPrize: getList('3'),
    fourthPrize: getList('4'),
    fifthPrize: getList('5'),
    sixthPrize: getList('6'),
    seventhPrize: seventh,
    eighthPrize: eighth,
  };
}

// ----- Main -----

async function main() {
  const targetDate = process.argv[2] || todayString();
  console.log(`[fetch] Fetching results for ${targetDate}...`);

  const xml = await fetchUrl(RSS_URL);
  const items = parseRSSItems(xml);
  console.log(`[fetch] Found ${items.length} items in RSS`);

  let matchedItem = null;
  for (const item of items) {
    const d = extractDate(item.title, item.link);
    if (d === targetDate) {
      matchedItem = item;
      break;
    }
  }

  if (!matchedItem) {
    console.log(`[fetch] ❌ No RSS item found for ${targetDate}`);
    process.exit(1);
  }

  const provinces = parseProvinces(matchedItem.description);
  if (provinces.length === 0) {
    console.log(`[fetch] ❌ No provinces parsed`);
    process.exit(1);
  }

  const results = provinces.map((p) => ({
    id: `${targetDate}-${p.province}`,
    date: targetDate,
    province: p.province,
    region: 'Miền Nam',
    prizes: p.prizes,
  }));

  const output = {
    date: targetDate,
    fetchedAt: new Date().toISOString(),
    results,
  };

  // Ensure directory exists
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const filePath = path.join(RESULTS_DIR, `${targetDate}.json`);
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[fetch] ✅ Saved ${provinces.length} provinces → ${filePath}`);

  // Update index.json
  const indexPath = path.join(__dirname, '..', 'index.json');
  let index = { dates: [] };
  if (fs.existsSync(indexPath)) {
    try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
  }
  if (!index.dates.includes(targetDate)) {
    index.dates.push(targetDate);
    index.dates.sort().reverse();
  }
  index.updatedAt = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
  console.log(`[fetch] ✅ Index updated (${index.dates.length} dates)`);
}

main().catch((err) => {
  console.error('[fetch] ❌ Error:', err);
  process.exit(1);
});
