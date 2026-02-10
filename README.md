# AccuWeather Hourly Forecast - Culver City, CA

A web application that displays hourly temperature and precipitation forecasts from AccuWeather for Culver City, California. The app scrapes data directly from AccuWeather's website using Puppeteer instead of using their API.

## Features

- 🌡️ Hourly temperature forecasts (up to 16 hours)
- 🌧️ Precipitation probability and amount
- 📱 Responsive design
- 🌙 Day/night mode styling
- 🔄 Automatic hourly data refresh with caching
- 🕷️ Web scraping (no API key required)
- 🌡️ Temperature unit toggle (Fahrenheit/Celsius)
- 📊 Adjustable number of forecast cards (1-24)
- 📅 Automatic tomorrow's forecast fetching (when < 12 hours remain in today)
- 📸 Automatic BMP screenshot capture of the UI
- 🛡️ Security hardened (Helmet, rate limiting, CORS, CSP, XSS protection)
- 🍎 Safari browser compatibility
- 🕒 Time format toggle (regular/military)

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
   Navigate to `http://localhost:3000`

## Project Structure

```
├── server.js              # Express server with AccuWeather web scraping
├── public/
│   ├── index.html         # Main HTML page
│   ├── styles.css         # Styling with day/night themes
│   ├── app.js             # Frontend JavaScript
│   └── favicon.ico        # Site icon
├── screenshots/           # Auto-generated UI screenshots (BMP format)
├── package.json           # Dependencies and scripts
├── .env.example           # Environment variables template
├── SECURITY_AUDIT.md      # Security audit documentation
└── README.md              # This file
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves the main web page |
| `/api/hourly-forecast` | GET | Returns hourly forecast data (JSON) |
| `/screenshots/current.bmp` | GET | Latest screenshot of the UI |

### Hourly Forecast Response

```json
{
  "location": "Culver City",
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

1. **Data Scraping**: On startup and every hour, the server uses Puppeteer to scrape AccuWeather's hourly forecast page for Culver City, CA.

2. **Caching**: Scraped data is cached server-side to minimize requests to AccuWeather. The cache refreshes automatically every hour.

3. **Tomorrow's Data**: When less than 12 hours remain in the current day, the server automatically fetches tomorrow's forecast to provide continuous coverage.

4. **Screenshot Capture**: After each data refresh, the server captures a BMP screenshot of its own UI for external display purposes.

5. **Frontend**: The web interface displays forecast cards with temperature, precipitation, and weather conditions. Users can toggle between Fahrenheit and Celsius.

## Raspberry Pi

To run the server on a Raspberry Pi (assumes project is already installed):

```bash
./scripts/raspberry-pi/start.sh
```

To run on startup, add to crontab: `crontab -e` then add:
```
@reboot sleep 30 && /home/pi/accuweather-culver-city/scripts/raspberry-pi/start.sh
```
(Adjust path if your project lives elsewhere.)

## Notes

- The app scrapes data directly from AccuWeather's website using Puppeteer
- No API key required
- Location for Culver City, CA is hardcoded (ZIP: 90232)
- Forecast shows up to 16 hours of hourly data
- Data is cached and refreshed every hour for performance
- Scraping may be slower than API calls but doesn't require authentication
- Chrome/Chromium must be installed (bundled with Puppeteer or system-installed)

## License

MIT
