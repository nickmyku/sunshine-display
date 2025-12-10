const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// AccuWeather API configuration
const ACCUWEATHER_API_KEY = process.env.ACCUWEATHER_API_KEY;
const CULVER_CITY_LOCATION_KEY = '331292'; // Location key for Culver City, CA

// Endpoint to get hourly forecast
app.get('/api/hourly-forecast', async (req, res) => {
  try {
    if (!ACCUWEATHER_API_KEY) {
      return res.status(500).json({ 
        error: 'AccuWeather API key not configured. Please set ACCUWEATHER_API_KEY in your .env file.' 
      });
    }

    // Fetch hourly forecast (12 hours)
    const hourlyUrl = `http://dataservice.accuweather.com/forecasts/v1/hourly/12hour/${CULVER_CITY_LOCATION_KEY}`;
    const response = await axios.get(hourlyUrl, {
      params: {
        apikey: ACCUWEATHER_API_KEY,
        details: true,
        metric: false
      }
    });

    // Format the data to include temperature and precipitation
    const formattedData = response.data.map(hour => ({
      datetime: hour.DateTime,
      temperature: hour.Temperature.Value,
      temperatureUnit: hour.Temperature.Unit,
      precipitation: hour.PrecipitationProbability || 0,
      precipitationAmount: hour.TotalLiquid?.Value || 0,
      precipitationUnit: hour.TotalLiquid?.Unit || 'in',
      icon: hour.WeatherIcon,
      iconPhrase: hour.IconPhrase,
      isDaylight: hour.IsDaylight
    }));

    res.json({
      location: 'Culver City, CA',
      forecast: formattedData
    });
  } catch (error) {
    console.error('Error fetching AccuWeather data:', error.message);
    if (error.response) {
      res.status(error.response.status).json({ 
        error: `AccuWeather API error: ${error.response.data.Message || error.message}` 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to fetch weather data. Please check your API key and try again.' 
      });
    }
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Make sure to set ACCUWEATHER_API_KEY in your .env file');
});
