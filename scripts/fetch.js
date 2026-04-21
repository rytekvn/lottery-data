#!/usr/bin/env node
/**
 * Fetch kết quả xổ số và lưu thành JSON theo ngày.
 * Strategy:
 *   1. Thử RSS feed (chỉ có 5 ngày gần nhất, nhanh)
 *   2. Fallback: parse HTML từ URL theo ngày cụ thể
 *
 * Usage:
 *   node scripts/fetch.js                       # fetch hôm nay cho south (mặc định)
 *   node scripts/fetch.js 2026-04-08            # fetch ngày cụ thể cho south
 *   node scripts/fetch.js 2026-04-08 central    # fetch ngày cụ thể cho central
 *   node scripts/fetch.js today central         # fetch hôm nay cho central
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const REGIONS = {
  south: {
    name: 'Miền Nam',
    rss: 'https://xskt.com.vn/rss-feed/mien-nam-xsmn.rss',
    htmlBase: 'https://xskt.com.vn/xsmn',
    folder: 'south',
  },
  central: {
    name: 'Miền Trung',
    rss: 'https://xskt.com.vn/rss-feed/mien-trung-xsmt.rss',
    htmlBase: 'https://xskt.com.vn/xsmt',
    folder: 'central',
  },
  north: {
    name: 'Miền Bắc',
    rss: 'https://xskt.com.vn/rss-feed/mien-bac-xsmb.rss',
    htmlBase: 'https://xskt.com.vn/xsmb',
    folder: 'north',
  },
};

// ---------- HTTP ----------

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

// ---------- Date helpers ----------

function todayString() {
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 3600 * 1000);
  const y = vnTime.getUTCFullYear();
  const m = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vnTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toUrlFormat(dateString) {
  const [y, m, d] = dateString.split('-');
  return `${parseInt(d)}-${parseInt(m)}-${y}`;
}

// ---------- RSS Parser ----------

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const content = m[1];
    items.push({
      title: extractTag(content, 'title'),
      description: extractTag(content, 'description'),
      link: extractTag(content, 'link'),
    });
  }
  return items;
}

function extractTag(content, tag) {
  const m = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : '';
}

function extractDate(title, link) {
  const full = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (full) return `${full[3]}-${full[2].padStart(2, '0')}-${full[1].padStart(2, '0')}`;
  const short = title.match(/(\d{1,2})\/(\d{1,2})/);
  if (short) {
    const year = new Date().getFullYear();
    return `${year}-${short[2].padStart(2, '0')}-${short[1].padStart(2, '0')}`;
  }
  const fromLink = link.match(/ngay-(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (fromLink) return `${fromLink[3]}-${fromLink[2].padStart(2, '0')}-${fromLink[1].padStart(2, '0')}`;
  return null;
}

function parseRSSDescription(description) {
  const results = [];
  const regex = /\[([^\]]+)\]/g;
  const matches = [...description.matchAll(regex)];
  for (let i = 0; i < matches.length; i++) {
    const provinceName = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : description.length;
    const text = description.substring(start, end);
    const prizes = parseTextPrizes(text);
    results.push({ province: provinceName, prizes });
  }
  return results;
}

function parseTextPrizes(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const map = {};
  for (const line of lines) {
    if (line.startsWith('ĐB:')) {
      map['ĐB'] = line.slice(3).trim();
    } else {
      const m = line.match(/^(\d+):\s*(.*)$/);
      if (m && parseInt(m[1]) >= 1 && parseInt(m[1]) <= 7) {
        map[m[1]] = m[2].trim();
      }
    }
  }
  const getList = (k) => (map[k] || '').split(' - ').map((x) => x.trim()).filter(Boolean);

  let seventh = [];
  let eighth = [];
  const g7Parts = (map['7'] || '').split(': ');
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

// ---------- HTML Parser ----------

function parseHTMLResults(html, dateString, region) {
  // South: tbl-xsmn id MN0 | Central: tbl-xsmn id MT0 | North: tbl-xsmn id MB0
  const idPrefix = region === 'south' ? 'MN' : region === 'central' ? 'MT' : 'MB';
  // Tìm bảng đầu tiên có id bắt đầu với prefix
  const re = new RegExp(`<table[^>]*id=\"${idPrefix}0\"[^>]*>([\\s\\S]*?)</table>`);
  let tableMatch = html.match(re);
  if (!tableMatch) {
    // Fallback: tìm bảng đầu tiên có class tbl-xsmn
    tableMatch = html.match(/<table[^>]*tbl-xsmn[^>]*>([\s\S]*?)<\/table>/);
  }
  if (!tableMatch) return null;
  const tableHTML = tableMatch[0];

  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRegex.exec(tableHTML)) !== null) {
    rows.push(m[1]);
  }
  if (rows.length < 2) return null;

  const headerRow = rows[0];
  const provinces = [];
  const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/g;
  let thMatch;
  while ((thMatch = thRegex.exec(headerRow)) !== null) {
    const text = stripHTML(thMatch[1]);
    if (!/^Thứ|Chủ|CN|^\d/.test(text) && text.length > 0) {
      provinces.push(text);
    }
  }
  if (provinces.length === 0) return null;

  const prizeMap = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const tds = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(row)) !== null) {
      tds.push(tdMatch[1]);
    }
    if (tds.length === 0) continue;

    const prizeLabel = stripHTML(tds[0]).trim();
    for (let p = 0; p < provinces.length; p++) {
      const cellHTML = tds[p + 1];
      if (!cellHTML) continue;
      const numbers = cellHTML
        .split(/<br\s*\/?>/i)
        .map((s) => stripHTML(s).trim())
        .filter(Boolean);

      if (!prizeMap[provinces[p]]) prizeMap[provinces[p]] = {};
      prizeMap[provinces[p]][prizeLabel] = numbers;
    }
  }

  const results = [];
  for (const province of provinces) {
    const raw = prizeMap[province] || {};
    const getFirst = (key) => (raw[key] || [])[0] || '';
    const getList = (key) => raw[key] || [];

    results.push({
      province: province,
      prizes: {
        specialPrize: getFirst('ĐB'),
        firstPrize: getFirst('G.1'),
        secondPrize: getList('G.2'),
        thirdPrize: getList('G.3'),
        fourthPrize: getList('G.4'),
        fifthPrize: getList('G.5'),
        sixthPrize: getList('G.6'),
        seventhPrize: getList('G.7'),
        eighthPrize: getList('G.8'),
      },
    });
  }

  return results;
}

function stripHTML(s) {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Main fetch logic ----------

async function fetchFromRSS(targetDate, region) {
  const regionCfg = REGIONS[region];
  const xml = await fetchUrl(regionCfg.rss);
  const items = parseRSSItems(xml);
  for (const item of items) {
    const d = extractDate(item.title, item.link);
    if (d === targetDate) {
      return parseRSSDescription(item.description);
    }
  }
  return null;
}

async function fetchFromHTML(targetDate, region) {
  const regionCfg = REGIONS[region];
  const urlDate = toUrlFormat(targetDate);
  const url = `${regionCfg.htmlBase}/ngay-${urlDate}`;
  const html = await fetchUrl(url);
  return parseHTMLResults(html, targetDate, region);
}

async function fetchDate(targetDate, region = 'south') {
  if (!REGIONS[region]) {
    throw new Error(`Unknown region: ${region}`);
  }

  console.log(`[fetch] ${targetDate} [${region}] - trying RSS...`);
  let provinces = await fetchFromRSS(targetDate, region);
  if (provinces && provinces.length > 0) {
    console.log(`[fetch] ${targetDate} [${region}] ✅ RSS returned ${provinces.length} provinces`);
    return provinces;
  }

  console.log(`[fetch] ${targetDate} [${region}] - fallback to HTML...`);
  provinces = await fetchFromHTML(targetDate, region);
  if (provinces && provinces.length > 0) {
    console.log(`[fetch] ${targetDate} [${region}] ✅ HTML returned ${provinces.length} provinces`);
    return provinces;
  }

  return null;
}

function saveResults(targetDate, provinces, region = 'south') {
  const regionCfg = REGIONS[region];
  const RESULTS_DIR = path.join(__dirname, '..', 'results', regionCfg.folder);
  const INDEX_PATH = path.join(__dirname, '..', 'results', regionCfg.folder, 'index.json');

  const results = provinces.map((p) => ({
    id: `${targetDate}-${p.province}`,
    date: targetDate,
    province: p.province,
    region: regionCfg.name,
    prizes: p.prizes,
  }));

  const output = {
    date: targetDate,
    fetchedAt: new Date().toISOString(),
    region: regionCfg.name,
    results,
  };

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const filePath = path.join(RESULTS_DIR, `${targetDate}.json`);
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf8');

  // Update region index
  let index = { dates: [] };
  if (fs.existsSync(INDEX_PATH)) {
    try { index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); } catch {}
  }
  if (!index.dates.includes(targetDate)) {
    index.dates.push(targetDate);
    index.dates.sort().reverse();
  }
  index.region = regionCfg.name;
  index.updatedAt = new Date().toISOString();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
}

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  const targetDate = !arg1 || arg1 === 'today' ? todayString() : arg1;
  const region = arg2 || 'south';

  const provinces = await fetchDate(targetDate, region);
  if (!provinces || provinces.length === 0) {
    console.log(`[fetch] ❌ No data for ${targetDate} [${region}]`);
    process.exit(1);
  }
  saveResults(targetDate, provinces, region);
  console.log(`[fetch] ✅ Saved ${provinces.length} provinces → results/${REGIONS[region].folder}/${targetDate}.json`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[fetch] ❌', err);
    process.exit(1);
  });
}

module.exports = { fetchDate, saveResults, REGIONS };
