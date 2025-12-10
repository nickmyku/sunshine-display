# AccuWeather Hourly Forecast - Culver City, CA

A web application that displays hourly temperature and precipitation forecasts from AccuWeather for Culver City, California. The app scrapes data directly from AccuWeather's website instead of using their API.

## Features

- 🌡️ Hourly temperature forecasts
- 🌧️ Precipitation probability and amount
- 📱 Responsive design
- 🌙 Day/night mode styling
- 🔄 Real-time data refresh
- 🕷️ Web scraping (no API key required)

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables (Optional)**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to set a custom port if needed:
   ```
   PORT=3000
   ```

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Open in Browser**
   Navigate to `http://localhost:3000`

## Project Structure

```
├── server.js          # Express server with AccuWeather web scraping
├── public/
│   ├── index.html     # Main HTML page
│   ├── styles.css     # Styling
│   └── app.js         # Frontend JavaScript
├── package.json       # Dependencies
└── .env.example       # Environment variables template
```

## API Endpoints

- `GET /` - Serves the main web page
- `GET /api/hourly-forecast` - Returns hourly forecast data for Culver City, CA (scraped from AccuWeather)

## Notes

- The app scrapes data directly from AccuWeather's website using Puppeteer
- No API key required
- Location for Culver City, CA is hardcoded
- Forecast shows up to 12 hours of hourly data
- The scraping may be slower than API calls but doesn't require authentication
