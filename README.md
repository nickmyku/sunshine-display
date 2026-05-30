# AccuWeather Hourly Forecast

A web application that displays hourly temperature and precipitation forecasts from AccuWeather. The app scrapes data directly from AccuWeather's website using Puppeteer instead of using their API. It supports multiple cities, an e-ink-friendly display mode, and automatic BMP screenshot capture for external displays.

## Features

- 🌡️ Hourly temperature forecasts (up to 16 hours per city)
- 🌧️ Precipitation probability and amount
- 🏙️ Multi-city support with a dropdown selector (Scottsdale, AZ and Culver City, CA)
- 📱 Responsive design
- 🖥️ E-ink (B/W) and color display modes
- 🌙 Day/night card styling based on daylight hours
- 🔄 Automatic hourly data refresh with per-city caching
- 🕷️ Web scraping (no API key required)
- 🌡️ Temperature unit toggle (Fahrenheit/Celsius; defaults to Celsius)
- 📊 Adjustable number of forecast cards (1–24)
- 📅 Automatic tomorrow's forecast fetching (when fewer than 12 hours remain in the current day)
- 📸 Automatic BMP screenshot capture of the default city UI
- 🛡️ Security hardened (Helmet, rate limiting, CORS, CSP, XSS protection)
- 🍎 Safari browser compatibility
- 🕒 Time format toggle (regular/military; defaults to military/24-hour)
- 💾 User preferences saved in localStorage (city, time format, display mode)

## Supported Cities

| City ID | Location | ZIP |
|---------|----------|-----|
| `scottsdale` (default) | Scottsdale, AZ | 85251 |
| `culver-city` | Culver City, CA | 90232 |

The default city is used for server-side BMP screenshots. Select a city in the UI, pass `?city=<city-id>` in the URL, or use the `city` query parameter on the API.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables (Optional)**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to customize settings:
   ```
   # Server port (defaults to 3000)
   PORT=3000

   # Allowed CORS origins (comma-separated)
   # Defaults to localhost only if not set
   ALLOWED_ORIGINS=http://localhost:3000
   ```

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Open in Browser**
   Navigate to `http://localhost:3000` (optionally with `?city=scottsdale` or `?city=culver-city`).

## Project Structure

```
├── server.js                        # Express server with AccuWeather web scraping
├── public/
│   ├── index.html                   # Main HTML page
│   ├── styles.css                   # Styling with e-ink and color themes
│   └── app.js                       # Frontend JavaScript
├── scripts/
│   ├── start.sh                     # Raspberry Pi / autostart helper
│   └── generate-eink-screenshot.js  # Standalone e-ink UI screenshot generator
├── screenshots/                     # Auto-generated UI screenshots (BMP format)
├── package.json                   # Dependencies and scripts
├── .env.example                   # Environment variables template
├── SECURITY_AUDIT.md              # Security audit documentation
└── README.md                      # This file
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves the main web page |
| `/api/cities` | GET | Returns available cities and the default city ID |
| `/api/hourly-forecast` | GET | Returns hourly forecast data (JSON). Optional query: `?city=<city-id>` |
| `/screenshots/current.bmp` | GET | Latest BMP screenshot of the default city UI |

### Cities Response

```json
{
  "defaultCityId": "scottsdale",
  "cities": [
    { "id": "scottsdale", "name": "Scottsdale, AZ" },
    { "id": "culver-city", "name": "Culver City, CA" }
  ]
}
```

### Hourly Forecast Response

```json
{
  "cityId": "scottsdale",
  "location": "Scottsdale",
  "forecast": [
    {
      "datetime": "2026-01-14T15:00:00.000Z",
      "temperature": 68,
      "temperatureUnit": "F",
      "precipitation": 10,
      "precipitationAmount": 0,
      "precipitationUnit": "mm",
      "iconPhrase": "Partly sunny",
      "isDaylight": true
    }
  ],
  "cachedAt": "2026-01-14T14:30:00.000Z",
  "cacheAgeMinutes": 30
}
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.2 | Web server framework |
| puppeteer | ^24.33.0 | Headless browser for web scraping |
| cors | ^2.8.5 | Cross-origin resource sharing |
| helmet | ^8.1.0 | Security headers middleware |
| express-rate-limit | ^8.2.1 | API rate limiting |
| dotenv | ^16.3.1 | Environment variable management |
| sharp | ^0.34.5 | Image processing for screenshots |
| bmp-js | ^0.1.0 | BMP image encoding |

## Security Features

This application includes comprehensive security measures:

- **Helmet.js**: Security headers including CSP, X-Frame-Options, X-Content-Type-Options
- **Rate Limiting**: 100 requests per 15 minutes per IP on API endpoints
- **CORS**: Configurable allowed origins (defaults to localhost)
- **XSS Protection**: DOM-based rendering with textContent (no innerHTML)
- **Input Validation**: PORT environment variable validation
- **Error Handling**: Generic error messages to clients (detailed logs server-side)

See [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) for the full security audit report.

## Browser Compatibility

The application is optimized for cross-browser compatibility:

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support with specific optimizations:
  - Explicit MIME types for static files
  - Disabled Cross-Origin policies that cause Safari loading issues
  - CSP Level 3 directives for Safari 15.4+

## How It Works

1. **Data Scraping**: On startup and every hour, the server uses Puppeteer to scrape AccuWeather's hourly forecast page for each supported city.

2. **Per-City Caching**: Scraped data is cached separately per city to minimize requests to AccuWeather. The cache refreshes automatically every hour.

3. **Tomorrow's Data**: When fewer than 12 hours remain in the current day, the server automatically fetches the next day's forecast to provide continuous coverage.

4. **Screenshot Capture**: After each refresh of the default city (Scottsdale), the server captures a 960×640 BMP screenshot of its own UI for external display purposes (e.g., e-ink panels).

5. **Frontend**: The web interface displays forecast cards with temperature, precipitation, and weather conditions. Users can switch cities, toggle Fahrenheit/Celsius, choose regular or military time, and switch between e-ink (B/W) and color display modes.

## Raspberry Pi

To run the server on a Raspberry Pi (assumes project is already installed):

```bash
./scripts/start.sh
```

To run on startup, add to crontab: `crontab -e` then add:
```
@reboot sleep 30 && /home/pi-server/sunshine-display/scripts/start.sh > /dev/tty1 2>&1
```
(Adjust path if your project lives elsewhere.)

(to determine the correct terminal to stream the output to run the "tty" command, in this case it returned "/dev/tty1")

## Utility Scripts

**Generate an e-ink screenshot locally** (uses mock forecast data, no AccuWeather scrape):

```bash
node scripts/generate-eink-screenshot.js
```

Output is saved to `screenshots/eink-ui.png`.

## Notes

- The app scrapes data directly from AccuWeather's website using Puppeteer
- No API key required
- Supported cities are configured in `server.js` under the `CITIES` object
- Forecast shows up to 16 hours of hourly data per city
- Data is cached per city and refreshed every hour
- Scraping may be slower than API calls but does not require authentication
- Chrome/Chromium must be installed (bundled with Puppeteer or system-installed)
- Invalid or missing `city` query parameters fall back to the default city (`scottsdale`)

## License

MIT
