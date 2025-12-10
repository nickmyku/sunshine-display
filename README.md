# AccuWeather Hourly Forecast - Culver City, CA

A web application that displays hourly temperature and precipitation forecasts from AccuWeather for Culver City, California.

## Features

- 🌡️ Hourly temperature forecasts
- 🌧️ Precipitation probability and amount
- 📱 Responsive design
- 🌙 Day/night mode styling
- 🔄 Real-time data refresh

## Setup

1. **Get an AccuWeather API Key**
   - Visit [AccuWeather Developer Portal](https://developer.accuweather.com/)
   - Sign up for a free account
   - Create a new app to get your API key

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your AccuWeather API key:
   ```
   ACCUWEATHER_API_KEY=your_api_key_here
   ```

4. **Start the Server**
   ```bash
   npm start
   ```

5. **Open in Browser**
   Navigate to `http://localhost:3000`

## Project Structure

```
├── server.js          # Express server with AccuWeather API integration
├── public/
│   ├── index.html     # Main HTML page
│   ├── styles.css     # Styling
│   └── app.js         # Frontend JavaScript
├── package.json       # Dependencies
└── .env.example       # Environment variables template
```

## API Endpoints

- `GET /` - Serves the main web page
- `GET /api/hourly-forecast` - Returns hourly forecast data for Culver City, CA

## Notes

- The app uses AccuWeather's free tier which has rate limits
- Location key for Culver City, CA is hardcoded: `331292`
- Forecast shows 12 hours of hourly data
