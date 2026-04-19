# Lottery Data

Kết quả xổ số miền Nam được fetch tự động hàng ngày qua GitHub Actions.

## Cấu trúc

```
lottery-data/
├── .github/workflows/
│   └── fetch-lottery.yml     # Cron workflow (18:45 giờ VN mỗi ngày)
├── scripts/
│   └── fetch.js              # Script fetch RSS → JSON
├── results/
│   ├── 2026-04-08.json       # Kết quả theo ngày
│   ├── 2026-04-07.json
│   └── ...
├── index.json                # Danh sách tất cả ngày đã có
└── README.md
```

## URL cho iOS app

App iOS có thể fetch kết quả theo ngày qua:

```
https://raw.githubusercontent.com/<USER>/lottery-data/main/results/YYYY-MM-DD.json
```

Danh sách tất cả ngày đã có:

```
https://raw.githubusercontent.com/<USER>/lottery-data/main/index.json
```

## Chạy thủ công

```bash
# Fetch hôm nay
node scripts/fetch.js

# Fetch ngày cụ thể
node scripts/fetch.js 2026-04-08
```

## Setup trên GitHub

1. Tạo repo public mới tên `lottery-data`
2. Push toàn bộ folder này lên repo
3. Vào Settings → Actions → General → Workflow permissions → "Read and write permissions"
4. Workflow sẽ tự chạy mỗi ngày 18:45 giờ VN
5. Cũng có thể chạy thủ công từ tab Actions → "Fetch Lottery Results Daily" → Run workflow

## JSON format

```json
{
  "date": "2026-04-08",
  "fetchedAt": "2026-04-08T11:45:00.000Z",
  "results": [
    {
      "id": "2026-04-08-Cần Thơ",
      "date": "2026-04-08",
      "province": "Cần Thơ",
      "region": "Miền Nam",
      "prizes": {
        "specialPrize": "203649",
        "firstPrize": "12347",
        "secondPrize": ["67603"],
        "thirdPrize": ["49345", "27373"],
        "fourthPrize": ["85644", "68894", "..."],
        "fifthPrize": ["3576"],
        "sixthPrize": ["1636", "4610", "8977"],
        "seventhPrize": ["9228"],
        "eighthPrize": ["91"]
      }
    }
  ]
}
```
