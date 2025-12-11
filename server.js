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
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('.hourly-forecast .card'));
      }
      if (cards.length === 0) {
        // Try to find any element with "hourly" in class name
        const allElements = document.querySelectorAll('[class*="hourly"], [class*="Hourly"]');
        cards = Array.from(allElements).filter(el => 
          el.textContent && el.textContent.trim().length > 0
        );
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
        // Prioritize finding the primary temperature element, not secondary metrics
        let temperature = null;
        const tempSelectors = [
          '.temp',
          '.temperature',
          '[data-qa="temperature"]',
          '.hourly-temp',
          '.temp-value',
          '[class*="temp"][class*="value"]',
          '[class*="Temp"]',
          'span[class*="temp"]',
          'div[class*="temp"]'
        ];
        
        // First, try to find temperature in specific temperature elements
        for (const selector of tempSelectors) {
          const elem = card.querySelector(selector);
          if (elem) {
            const tempText = elem.textContent.trim();
            // Look for temperature patterns with degree symbol (e.g., "73°" or "47° / 73°")
            const allTempMatches = tempText.match(/(\d+)\s*°[Ff]?/g);
            if (allTempMatches && allTempMatches.length > 0) {
              const temps = allTempMatches.map(match => {
                const numMatch = match.match(/(\d+)/);
                return numMatch ? parseInt(numMatch[1]) : null;
              }).filter(t => t !== null && t >= 20 && t <= 120);
              
              if (temps.length > 0) {
                // If multiple temperatures found, prefer the higher one (usually the actual temp)
                // AccuWeather often shows "feels like" or other metrics as lower values
                temperature = Math.max(...temps);
                break;
              }
            }
            
            // Fallback: if no degree symbol pattern, try to find numbers
            const numbers = tempText.match(/\d+/g);
            if (numbers && numbers.length > 0) {
              const validTemps = numbers.map(n => parseInt(n)).filter(n => n >= 20 && n <= 120);
              if (validTemps.length > 0) {
                temperature = Math.max(...validTemps);
                break;
              }
            }
          }
        }
        
        // If still no temperature found, search the card more carefully
        // Look for the primary temperature (usually the largest number with a degree symbol)
        if (temperature === null) {
          const cardText = card.textContent || card.innerText || '';
          
          // Look for all temperature patterns with degree symbol
          const allTempMatches = cardText.match(/(\d+)\s*°[Ff]?/g);
          if (allTempMatches && allTempMatches.length > 0) {
            const temps = allTempMatches.map(match => {
              const numMatch = match.match(/(\d+)/);
              return numMatch ? parseInt(numMatch[1]) : null;
            }).filter(t => t !== null && t >= 40 && t <= 120); // Narrow range to avoid picking up wrong values like 39
            
            if (temps.length > 0) {
              // Prefer the highest temperature value
              // In AccuWeather, the primary temperature is usually the highest value shown
              temperature = Math.max(...temps);
            }
          }
          
          // Last resort: look for numbers in a reasonable temperature range
          // Use word boundaries to avoid matching parts of larger numbers
          if (temperature === null) {
            const numbers = cardText.match(/\b(\d{2,3})\b/g);
            if (numbers) {
              const validTemps = numbers.map(n => parseInt(n)).filter(n => n >= 40 && n <= 120);
              if (validTemps.length > 0) {
                temperature = Math.max(...validTemps);
              }
            }
          }
        }
        
        // Additional validation: Always check for all temperatures in the card and prefer the highest
        // This helps catch cases where we might have picked up a "feels like" or other secondary metric
        // AccuWeather often shows multiple temperatures, and we want the primary (usually highest) one
        if (temperature !== null) {
          const cardText = card.textContent || card.innerText || '';
          const allTempMatches = cardText.match(/(\d+)\s*°[Ff]?/g);
          if (allTempMatches && allTempMatches.length > 0) {
            const allTemps = allTempMatches.map(match => {
              const numMatch = match.match(/(\d+)/);
              return numMatch ? parseInt(numMatch[1]) : null;
            }).filter(t => t !== null && t >= 20 && t <= 120);
            
            if (allTemps.length > 0) {
              const maxTemp = Math.max(...allTemps);
              // If we found a significantly higher temperature, use that instead
              // This catches cases where we might have picked up a secondary metric like "feels like"
              if (maxTemp > temperature + 5) {
                temperature = maxTemp;
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

    if (forecastData.length === 0) {
      throw new Error('No forecast data found on page. The page structure may have changed.');
    }

    res.json({
      location: 'Culver City, CA',
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
