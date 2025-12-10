const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// AccuWeather URL for Culver City hourly forecast
const ACCUWEATHER_URL = 'https://www.accuweather.com/en/us/culver-city/90230/hourly-weather-forecast/331292';

// Initialize browser instance (reused for better performance)
let browser = null;

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

// Endpoint to get hourly forecast
app.get('/api/hourly-forecast', async (req, res) => {
  let page = null;
  try {
    const browserInstance = await initBrowser();
    page = await browserInstance.newPage();
    
    // Set user agent to avoid blocking
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to AccuWeather page
    await page.goto(ACCUWEATHER_URL, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Wait for the hourly forecast data to load - try multiple selectors
    await page.waitForFunction(() => {
      return document.querySelector('.hourly-card') || 
             document.querySelector('[data-qa="hourlyCard"]') ||
             document.querySelector('.hourly-list-item') ||
             document.querySelector('.hourly-wrapper .card');
    }, { timeout: 15000 });

    // Extract hourly forecast data
    const forecastData = await page.evaluate(() => {
      // Try multiple selectors to find hourly cards
      let cards = Array.from(document.querySelectorAll('.hourly-card'));
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('[data-qa="hourlyCard"]'));
      }
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('.hourly-list-item'));
      }
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('.hourly-wrapper .card'));
      }
      
      // Limit to 12 hours
      cards = cards.slice(0, 12);
      
      const now = new Date();
      
      return cards.map((card, index) => {
        // Extract time - try multiple selectors
        let timeText = '';
        const timeSelectors = [
          '.hourly-card-header .time',
          '.time',
          '[data-qa="time"]',
          '.hourly-time',
          'h3'
        ];
        for (const selector of timeSelectors) {
          const elem = card.querySelector(selector);
          if (elem) {
            timeText = elem.textContent.trim();
            break;
          }
        }
        
        // Extract temperature - try multiple selectors
        let temperature = null;
        const tempSelectors = [
          '.temp',
          '.temperature',
          '[data-qa="temperature"]',
          '.hourly-temp',
          '.temp-value'
        ];
        for (const selector of tempSelectors) {
          const elem = card.querySelector(selector);
          if (elem) {
            const tempText = elem.textContent.trim();
            const tempMatch = tempText.match(/(\d+)/);
            if (tempMatch) {
              temperature = parseInt(tempMatch[1]);
              break;
            }
          }
        }
        
        // Extract precipitation probability
        let precipitation = 0;
        const precipSelectors = [
          '.precip',
          '.precipitation',
          '[data-qa="precipitation"]',
          '.precip-prob',
          '.precipitation-probability'
        ];
        for (const selector of precipSelectors) {
          const elem = card.querySelector(selector);
          if (elem) {
            const precipText = elem.textContent.trim();
            const precipMatch = precipText.match(/(\d+)%/);
            if (precipMatch) {
              precipitation = parseInt(precipMatch[1]);
              break;
            }
          }
        }
        
        // Extract precipitation amount
        let precipitationAmount = 0;
        let precipitationUnit = 'in';
        const precipAmountSelectors = [
          '.precip-amount',
          '.precipitation-amount',
          '[data-qa="precipitationAmount"]'
        ];
        for (const selector of precipAmountSelectors) {
          const elem = card.querySelector(selector);
          if (elem) {
            const precipAmountText = elem.textContent.trim();
            const precipAmountMatch = precipAmountText.match(/([\d.]+)\s*(in|mm|inch|inches)/i);
            if (precipAmountMatch) {
              precipitationAmount = parseFloat(precipAmountMatch[1]);
              const unit = precipAmountMatch[2].toLowerCase();
              precipitationUnit = (unit === 'mm') ? 'mm' : 'in';
              break;
            }
          }
        }
        
        // Extract icon phrase
        let iconPhrase = '';
        const phraseSelectors = [
          '.phrase',
          '.icon-phrase',
          '[data-qa="phrase"]',
          '.condition',
          '.weather-phrase'
        ];
        for (const selector of phraseSelectors) {
          const elem = card.querySelector(selector);
          if (elem) {
            iconPhrase = elem.textContent.trim();
            break;
          }
        }
        
        // Parse time to determine hour
        let hour24 = now.getHours() + index;
        if (timeText) {
          const hourMatch = timeText.match(/(\d+):/);
          if (hourMatch) {
            let hour = parseInt(hourMatch[1]);
            const isPM = timeText.toUpperCase().includes('PM');
            hour24 = isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour);
          }
        }
        
        const isDaylight = hour24 >= 6 && hour24 < 20;
        
        // Create datetime
        const forecastDate = new Date(now);
        forecastDate.setHours(hour24, 0, 0, 0);
        forecastDate.setMinutes(0);
        forecastDate.setSeconds(0);
        forecastDate.setMilliseconds(0);
        
        // If the time is earlier than current time, assume it's tomorrow
        if (forecastDate < now) {
          forecastDate.setDate(forecastDate.getDate() + 1);
        }
        
        return {
          datetime: forecastDate.toISOString(),
          temperature: temperature,
          temperatureUnit: 'F',
          precipitation: precipitation,
          precipitationAmount: precipitationAmount,
          precipitationUnit: precipitationUnit,
          icon: null,
          iconPhrase: iconPhrase || 'Clear',
          isDaylight: isDaylight
        };
      }).filter(hour => hour.temperature !== null);
    });

    await page.close();

    res.json({
      location: 'Culver City, CA',
      forecast: forecastData
    });
  } catch (error) {
    if (page) {
      await page.close().catch(() => {});
    }
    console.error('Error scraping AccuWeather data:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch weather data from AccuWeather. Please try again later.' 
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Graceful shutdown
process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Scraping AccuWeather website for weather data...');
});
