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
const ACCUWEATHER_URL = 'https://www.accuweather.com/en/us/culver-city/90232/hourly-weather-forecast/332093';

// Initialize browser instance (reused for better performance)
let browser = null;

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
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
    
    // Set user agent and viewport to avoid blocking
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set extra headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Navigate to AccuWeather page
    await page.goto(ACCUWEATHER_URL, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    // Wait a bit for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Wait for the hourly forecast data to load - try multiple selectors with longer timeout
    try {
      await page.waitForFunction(() => {
        return document.querySelector('.hourly-card') || 
               document.querySelector('[data-qa="hourlyCard"]') ||
               document.querySelector('.hourly-list-item') ||
               document.querySelector('.hourly-wrapper .card') ||
               document.querySelector('.hourly-forecast') ||
               document.querySelector('[class*="hourly"]') ||
               document.querySelector('[class*="Hourly"]');
      }, { timeout: 30000 });
    } catch (waitError) {
      // If waiting fails, try to continue anyway - maybe the data is already there
      console.warn('Wait for selectors timed out, attempting to extract data anyway...');
    }

    // Extract the city/location name from the page
    const locationName = await page.evaluate(() => {
      // Try multiple selectors to find the location name
      const locationSelectors = [
        '.subnav-title',
        '.header-city-link',
        '.current-city',
        '[data-qa="headerLocation"]',
        '.location-name',
        '.header-loc',
        'h1.location',
        '.subnav .title',
        '.header .location'
      ];
      
      let rawLocation = null;
      
      for (const selector of locationSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim()) {
          rawLocation = elem.textContent.trim();
          break;
        }
      }
      
      // Try to find location in the page title or meta tags
      if (!rawLocation) {
        const pageTitle = document.title;
        if (pageTitle) {
          // AccuWeather titles are typically like "City Name Weather - AccuWeather"
          const titleMatch = pageTitle.match(/^(.+?)\s*(?:Weather|Hourly|Daily|Forecast)/i);
          if (titleMatch) {
            rawLocation = titleMatch[1].trim();
          }
        }
      }
      
      // Fallback: look for any header element with location-like content
      if (!rawLocation) {
        const headers = document.querySelectorAll('h1, h2, .header-title');
        for (const header of headers) {
          const text = header.textContent.trim();
          // Check if it looks like a location (contains city-like patterns)
          if (text && text.length < 100 && !text.toLowerCase().includes('hourly') && !text.toLowerCase().includes('forecast')) {
            rawLocation = text;
            break;
          }
        }
      }
      
      // Remove temperature from the location name (e.g., "Culver City 72°" -> "Culver City")
      if (rawLocation) {
        // Remove temperature patterns like "72°", "72°F", "72 °F", "-5°C", etc.
        rawLocation = rawLocation.replace(/\s*-?\d+\s*°[FCfc]?\s*$/g, '').trim();
      }
      
      return rawLocation;
    });

    // Extract hourly forecast data
    const forecastData = await page.evaluate(() => {
      // AccuWeather uses .accordion-item.hour for each hourly forecast card
      let cards = Array.from(document.querySelectorAll('.accordion-item.hour'));
      
      // Fallback selectors if the primary one doesn't work
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('[data-qa].hour'));
      }
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('.hourly-card'));
      }
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('[data-qa="hourlyCard"]'));
      }
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('.hourly-list-item'));
      }
      
      // Limit to 16 hours
      cards = cards.slice(0, 16);
      
      const now = new Date();
      
      return cards.map((card, index) => {
        // Extract time from h2.date or other time elements
        let timeText = '';
        const timeSelectors = [
          'h2.date',
          'h2.date > div',
          '.date',
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
        
        // Extract actual temperature - specifically from .temp element that's NOT inside .real-feel
        let temperature = null;
        
        // First, try to get the direct .temp element that's not inside .real-feel
        const tempElem = card.querySelector('.hourly-card-subcontaint > .temp, .hourly-card-top .temp:not(.real-feel .temp)');
        if (tempElem) {
          const tempText = tempElem.textContent.trim();
          const tempMatch = tempText.match(/(\d+)\s*°/);
          if (tempMatch) {
            temperature = parseInt(tempMatch[1]);
          }
        }
        
        // If not found, try other selectors but exclude .real-feel elements
        if (temperature === null) {
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
              // Make sure this element is not inside a .real-feel container
              const isInsideRealFeel = elem.closest('.real-feel') !== null;
              if (isInsideRealFeel) continue;
              
              const tempText = elem.textContent.trim();
              const tempMatch = tempText.match(/(\d+)\s*°/);
              if (tempMatch) {
                const temp = parseInt(tempMatch[1]);
                if (temp >= 0 && temp <= 150) {
                  temperature = temp;
                  break;
                }
              }
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
        let precipitationUnit = 'mm';
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
              // Convert inches to mm (1 inch = 25.4 mm)
              if (unit !== 'mm') {
                precipitationAmount = precipitationAmount * 25.4;
              }
              precipitationUnit = 'mm';
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
          // AccuWeather uses format like "3 PM" or "3:00 PM"
          const hourMatch = timeText.match(/(\d+)(?::\d+)?\s*(AM|PM)?/i);
          if (hourMatch) {
            let hour = parseInt(hourMatch[1]);
            const period = hourMatch[2] ? hourMatch[2].toUpperCase() : null;
            if (period === 'PM' && hour !== 12) {
              hour24 = hour + 12;
            } else if (period === 'AM' && hour === 12) {
              hour24 = 0;
            } else if (period) {
              hour24 = hour;
            }
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

    if (forecastData.length === 0) {
      throw new Error('No forecast data found on page. The page structure may have changed.');
    }

    // Use scraped location or fallback to URL-based name
    const scrapedLocation = locationName || 'Unknown Location';

    // Debug: Display scraped temperatures in command line
    console.log('\n========== SCRAPED TEMPERATURES ==========');
    console.log(`Location: ${scrapedLocation}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Found ${forecastData.length} hourly forecasts:\n`);
    forecastData.forEach((hour, index) => {
      const date = new Date(hour.datetime);
      const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      console.log(`  ${index + 1}. ${dateStr} ${timeStr}: ${hour.temperature}°${hour.temperatureUnit} - ${hour.iconPhrase} (Precip: ${hour.precipitation}%)`);
    });
    console.log('===========================================\n');

    res.json({
      location: scrapedLocation,
      forecast: forecastData
    });
  } catch (error) {
    if (page) {
      await page.close().catch(() => {});
    }
    console.error('Error scraping AccuWeather data:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ 
      error: `Failed to fetch weather data from AccuWeather: ${error.message}. Please try again later.` 
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
