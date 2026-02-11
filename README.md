# AccuWeather Hourly Forecast (Culver City, CA)

This project is an Express + Puppeteer web app that scrapes AccuWeather hourly data for Culver City and serves it through a lightweight UI and JSON API.

## Current project state

- Scrapes AccuWeather hourly forecast pages (today, and optionally tomorrow)
- Returns and displays up to **16 hourly entries**
- Includes temperature, precipitation probability, precipitation amount, and condition phrase
- Caches forecast data in memory and refreshes automatically every hour
- Fetches tomorrow's page when fewer than 12 hours remain in the current day
- Captures a **BMP screenshot** of the live UI after each cache refresh
- Frontend controls:
  - Temperature unit toggle (C/F), default = Celsius
  - Time format toggle (24h/12h), default = 24h
  - Display mode toggle (B/W e-ink or color), default = B/W e-ink
  - Adjustable number of rendered cards (based on available data)
  - Manual refresh button
- Security hardening with Helmet, CORS allowlist, API rate limiting, and safer DOM rendering

## Tech stack

- Node.js / Express
- Puppeteer (browser automation for scraping + screenshots)
- Sharp + bmp-js (image conversion to BMP)
- Helmet, CORS, express-rate-limit, dotenv
- Vanilla HTML/CSS/JS frontend

## Requirements

- Node.js 18+ (required by current dependency set, including Sharp)
- npm
- Internet access to `accuweather.com`
- Chromium/Chrome:
  - Puppeteer bundled browser is used first
  - Falls back to common system Chrome/Chromium paths if needed

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Optional environment file:

   ```bash
   cp .env.example .env
   ```

3. Start server:

   ```bash
   npm start
   ```

4. Open:

   - `http://localhost:3000` (or your configured port)

## Configuration

Environment variables (from `.env.example`):

```bash
# Optional: server port (default 3000)
PORT=3000

# Optional: comma-separated CORS allowlist
# default: http://localhost:<PORT>
ALLOWED_ORIGINS=http://localhost:3000
```

## API endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/` | GET | Main UI |
| `/api/hourly-forecast` | GET | Cached hourly weather payload |
| `/screenshots/current.bmp` | GET | Latest generated BMP screenshot |

Example `/api/hourly-forecast` response:

```json
{
  "location": "Culver City",
  "forecast": [
    {
      "datetime": "2026-01-14T15:00:00.000Z",
      "temperature": 68,
      "temperatureUnit": "F",
      "precipitation": 10,
      "precipitationAmount": 0.0,
      "precipitationUnit": "mm",
      "icon": null,
      "iconPhrase": "Partly sunny",
      "isDaylight": true
    }
  ],
  "cachedAt": "2026-01-14T14:30:00.000Z",
  "cacheAgeMinutes": 30
}
```

## Runtime behavior

1. Server starts and immediately triggers a weather refresh.
2. Scraper loads today's hourly page and extracts up to 16 cards.
3. If fewer than 12 hours remain in the day, scraper also fetches tomorrow and merges unique hours.
4. Data is sorted chronologically and cached in memory.
5. API serves cached data with cache metadata.
6. Server refreshes every 60 minutes.
7. After each refresh, server captures the app UI and saves `screenshots/current.bmp`.

## Scripts

`package.json` scripts:

- `npm start` -> `node server.js`
- `npm run dev` -> `node server.js`

Helper scripts:

- `./scripts/start.sh`  
  Starts the server from any current directory.
- `node scripts/generate-eink-screenshot.js`  
  Spins up a temporary local server with mock data and generates `screenshots/eink-ui.png`.

## Project structure

```text
.
├── .env.example
├── .gitignore
├── README.md
├── SECURITY_AUDIT.md
├── package.json
├── package-lock.json
├── server.js
├── public/
│   ├── app.js
│   ├── favicon.ico
│   ├── index.html
│   └── styles.css
├── scripts/
│   ├── generate-eink-screenshot.js
│   └── start.sh
└── screenshots/
    └── eink-ui.png
```

Note: `screenshots/current.bmp` is generated at runtime and ignored by git.

## Security notes

- Helmet with CSP and Safari-oriented compatibility adjustments
- CORS restricted to configured origins (or localhost by default)
- API rate limiting: 100 requests per 15 minutes per IP on `/api/*`
- Frontend rendering uses DOM APIs + `textContent` to reduce XSS risk
- Generic client error responses with detailed server-side logs

See `SECURITY_AUDIT.md` for the detailed audit record.

## Raspberry Pi / kiosk usage

Start with:

```bash
./scripts/start.sh
```

Example crontab entry for auto-start on boot (adjust path as needed):

```bash
@reboot sleep 30 && /path/to/project/scripts/start.sh > /dev/tty1 2>&1
```

## Limitations

- Scraping depends on AccuWeather HTML structure and may break if selectors change.
- Data availability and accuracy depend on the source page.
- Uses `--no-sandbox` Chromium flags for compatibility in constrained/containerized environments.

## License

MIT
