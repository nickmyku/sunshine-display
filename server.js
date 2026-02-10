const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const bmp = require('bmp-js');
require('dotenv').config();

// Screenshots directory
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// Debug logging helper - outputs timestamped, categorized messages to terminal
const DEBUG = {
  log: (category, ...args) => {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${category}]`;
    console.log(prefix, ...args);
  },
  warn: (category, ...args) => {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${category}] WARN:`;
    console.warn(prefix, ...args);
  },
  error: (category, ...args) => {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${category}] ERROR:`;
    console.error(prefix, ...args);
  }
};

const app = express();

// Validate and parse PORT
const PORT = (() => {
  const port = parseInt(process.env.PORT, 10) || 3000;
  if (port < 1 || port > 65535) {
    console.error('Invalid PORT configuration. Using default port 3000.');
    return 3000;
  }
  return port;
})();

// ===========================================
// SECURITY MIDDLEWARE
// ===========================================

// Security headers via Helmet with CSP enabled
// Note: upgradeInsecureRequests is omitted for Safari compatibility - Safari has issues
// with this directive when accessing sites over HTTP (e.g., localhost development).
// For production HTTPS deployments, this should be handled at the reverse proxy level.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // Safari 15.4+ supports CSP Level 3 and needs explicit script-src-elem for external scripts.
      // Older Safari versions (<15.4) will ignore this directive and fall back to script-src.
      scriptSrcElem: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for inline style attributes
      // Safari 15.4+ supports CSP Level 3 and needs explicit style-src-elem for external stylesheets.
      // Without this, Safari may block loading of external CSS files.
      // Older Safari versions (<15.4) will ignore this directive and fall back to style-src.
      styleSrcElem: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"], // Restrict base tag to prevent base-uri hijacking
      // Explicitly disable upgrade-insecure-requests for Safari compatibility
      // Safari has issues with this directive when accessing sites over HTTP (e.g., localhost)
      upgradeInsecureRequests: null,
      // Explicitly disable script-src-attr to allow Helmet's default 'none' value
      // (safe since we don't use inline event handlers like onclick)
    },
  },
  // Safari compatibility: Disable Cross-Origin policies that can block CSS/JS loading
  // Safari has known issues with COEP, COOP, and CORP headers causing resource loading failures
  crossOriginEmbedderPolicy: false, // Disable COEP - causes Safari to block subresources
  crossOriginOpenerPolicy: false,   // Disable COOP - can break same-origin resource loading in Safari
  crossOriginResourcePolicy: false, // Disable CORP - Safari may incorrectly block same-origin resources
  // Disable Origin-Agent-Cluster header - can cause issues in Safari with resource loading
  originAgentCluster: false,
  // X-Frame-Options: DENY is set by helmet by default, providing clickjacking protection
  // This is more Safari-compatible than CSP frame-ancestors
}));

// CORS configuration - restrict to configured origins
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [`http://localhost:${PORT}`];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or same-origin)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'OPTIONS'],
  optionsSuccessStatus: 200
}));

// Rate limiting - prevent DoS attacks
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Debug: Request logging middleware for API requests
app.use('/api/', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    DEBUG.log('REQUEST', `${req.method} ${req.path}`, `| IP: ${ip}`, `| Status: ${res.statusCode}`, `| ${duration}ms`);
  });
  next();
});

// Standard middleware
app.use(express.json({ limit: '10kb' })); // Limit body size

// Always serve favicon.ico (some browsers request it unconditionally)
// Use sendFile callback instead of fs.existsSync() to avoid false negatives on edge cases.
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/x-icon');
  res.sendFile('favicon.ico', { root: path.join(__dirname, 'public') }, (err) => {
    if (err) {
      // Express will set appropriate status codes (e.g., 404) on error objects when available.
      res.status(err.statusCode || 404).end();
    }
  });
});

// Serve static files with explicit MIME types for Safari compatibility
// Safari with X-Content-Type-Options: nosniff requires exact MIME types
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Ensure correct MIME types for CSS and JavaScript files
    // Safari may block resources with incorrect or missing Content-Type
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=UTF-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    } else if (filePath.endsWith('.ico')) {
      res.setHeader('Content-Type', 'image/x-icon');
    }
  }
}));

// Serve screenshots directory as static files
app.use('/screenshots', express.static(SCREENSHOTS_DIR));

// AccuWeather URL for Culver City hourly forecast
const ACCUWEATHER_URL = 'https://www.accuweather.com/en/us/culver-city/90232/hourly-weather-forecast/332093';
// AccuWeather URL for tomorrow's hourly forecast
const ACCUWEATHER_TOMORROW_URL = 'https://www.accuweather.com/en/us/culver-city/90232/hourly-weather-forecast/332093?day=2';

// Threshold for fetching tomorrow's data (hours remaining in day)
const TOMORROW_FETCH_THRESHOLD_HOURS = 12;

// Data refresh interval (1 hour in milliseconds)
const DATA_REFRESH_INTERVAL = 60 * 60 * 1000;

// Initialize browser instance (reused for better performance)
let browser = null;

// Cached weather data
let cachedWeatherData = null;
let lastFetchTime = null;
let isFetching = false;

// Ensure screenshots directory exists
function ensureScreenshotsDirExists() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    DEBUG.log('SCREENSHOT', `Created directory: ${SCREENSHOTS_DIR}`);
  }
}

async function initBrowser() {
  if (!browser) {
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--single-process',
        '--no-zygote'
      ]
    };

    DEBUG.log('BROWSER', 'Initializing Puppeteer browser...');

    try {
      browser = await puppeteer.launch(launchOptions);
      DEBUG.log('BROWSER', 'Browser launched successfully (bundled Chrome)');
    } catch (error) {
      DEBUG.error('BROWSER', 'Failed to launch bundled Chrome:', error.message);
      DEBUG.log('BROWSER', 'Attempting fallback to system Chrome/Chromium...');

      const systemChromePaths = [
        '/usr/bin/google-chrome',
        '/usr/local/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
      ];

      let executablePath = null;
      for (const chromePath of systemChromePaths) {
        if (fs.existsSync(chromePath)) {
          executablePath = chromePath;
          break;
        }
      }

      if (executablePath) {
        DEBUG.log('BROWSER', `Using system Chrome at: ${executablePath}`);
        browser = await puppeteer.launch({
          ...launchOptions,
          executablePath
        });
        DEBUG.log('BROWSER', 'Browser launched successfully (system Chrome)');
      } else {
        DEBUG.error('BROWSER', 'No Chrome/Chromium executable found in:', systemChromePaths.join(', '));
        throw new Error('Failed to launch browser: No Chrome/Chromium executable found. Error code 2 typically indicates missing browser binary or dependencies.');
      }
    }
  }
  return browser;
}

// Take a screenshot of the server's own web UI and save as BMP
async function saveScreenshotAsBmp() {
  let screenshotPage = null;
  const startTime = Date.now();
  try {
    DEBUG.log('SCREENSHOT', 'Starting screenshot capture...');
    ensureScreenshotsDirExists();

    const browserInstance = await initBrowser();
    screenshotPage = await browserInstance.newPage();
    DEBUG.log('SCREENSHOT', 'New page opened, setting viewport 960x640');

    await screenshotPage.setViewport({ width: 960, height: 640 });

    DEBUG.log('SCREENSHOT', `Navigating to http://localhost:${PORT}...`);
    await screenshotPage.goto(`http://localhost:${PORT}`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    DEBUG.log('SCREENSHOT', 'Waiting for weather grid to load...');
    await screenshotPage.waitForFunction(() => {
      const grid = document.getElementById('weather-grid');
      return grid && grid.children.length > 0;
    }, { timeout: 15000 });

    await new Promise(resolve => setTimeout(resolve, 500));
    DEBUG.log('SCREENSHOT', 'Capturing PNG screenshot...');

    const pngBuffer = await screenshotPage.screenshot({ fullPage: false });
    
    await screenshotPage.close();
    screenshotPage = null;
    
    // Resize image and get raw RGBA pixel data
    // Use ensureAlpha() to guarantee 4 channels (RGBA) regardless of input format
    const { data, info } = await sharp(pngBuffer)
      .resize(960, 640)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const width = info.width;
    const height = info.height;
    
    // bmp-js expects pixel data in ABGR format, but sharp outputs RGBA
    // We need to convert RGBA to ABGR by swapping channels:
    // RGBA: [R, G, B, A] -> ABGR: [A, B, G, R]
    const abgrData = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i += 4) {
      abgrData[i] = data[i + 3];     // A (from position 3)
      abgrData[i + 1] = data[i + 2]; // B (from position 2)
      abgrData[i + 2] = data[i + 1]; // G (from position 1)
      abgrData[i + 3] = data[i];     // R (from position 0)
    }
    
    // Encode as BMP
    const bmpData = bmp.encode({
      data: abgrData,
      width: width,
      height: height
    });
    
    const bmpPath = path.join(SCREENSHOTS_DIR, 'current.bmp');
    fs.writeFileSync(bmpPath, bmpData.data);
    const duration = Date.now() - startTime;

    DEBUG.log('SCREENSHOT', `Saved to ${bmpPath} | ${width}x${height} | ${(bmpData.data.length / 1024).toFixed(1)} KB | ${duration}ms total`);
  } catch (error) {
    if (screenshotPage) {
      await screenshotPage.close().catch(() => {});
    }
    DEBUG.error('SCREENSHOT', error.message);
    DEBUG.error('SCREENSHOT', 'Stack:', error.stack);
  }
}

// Calculate hours remaining until midnight
function getHoursRemainingInDay() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0); // Set to next midnight
  const msRemaining = midnight.getTime() - now.getTime();
  return msRemaining / (1000 * 60 * 60);
}

// Scrape hourly forecast data from a specific AccuWeather URL
async function scrapeHourlyFromUrl(browserInstance, url, isTomorrow = false) {
  let page = null;
  const pageLabel = isTomorrow ? 'tomorrow' : 'today';
  const startTime = Date.now();
  try {
    DEBUG.log('SCRAPE', `[${pageLabel}] Opening new page...`);
    page = await browserInstance.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    DEBUG.log('SCRAPE', `[${pageLabel}] Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    DEBUG.log('SCRAPE', `[${pageLabel}] Page loaded, waiting 3s for dynamic content...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    DEBUG.log('SCRAPE', `[${pageLabel}] Waiting for hourly forecast selectors (timeout 30s)...`);
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
      DEBUG.warn('SCRAPE', `[${pageLabel}] Selector wait timed out: ${waitError.message}. Attempting extraction anyway...`);
    }

    DEBUG.log('SCRAPE', `[${pageLabel}] Extracting location name and forecast data...`);
    // Extract the city/location name from the page (only for first page)
    let locationName = null;
    if (!isTomorrow) {
      locationName = await page.evaluate(() => {
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
    }

    // Extract hourly forecast data
    const forecastData = await page.evaluate((isTomorrowPage) => {
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
      // For tomorrow's page, set base date to tomorrow
      const baseDate = new Date(now);
      if (isTomorrowPage) {
        baseDate.setDate(baseDate.getDate() + 1);
      }
      
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
        
        // Create datetime using baseDate (today or tomorrow)
        const forecastDate = new Date(baseDate);
        forecastDate.setHours(hour24, 0, 0, 0);
        forecastDate.setMinutes(0);
        forecastDate.setSeconds(0);
        forecastDate.setMilliseconds(0);
        
        // For today's page: if the time is earlier than current time, assume it's tomorrow
        if (!isTomorrowPage && forecastDate < now) {
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
    }, isTomorrow);

    const duration = Date.now() - startTime;
    DEBUG.log('SCRAPE', `[${pageLabel}] Extracted ${forecastData.length} hours | Location: ${locationName || 'N/A'} | ${duration}ms`);

    await page.close();

    return {
      locationName,
      forecastData
    };
  } catch (error) {
    if (page) {
      await page.close().catch(() => {});
    }
    DEBUG.error('SCRAPE', `[${pageLabel}] ${error.message}`);
    DEBUG.error('SCRAPE', 'Stack:', error.stack);
    throw error;
  }
}

// Scrape weather data from AccuWeather
async function scrapeWeatherData() {
  const startTime = Date.now();
  try {
    DEBUG.log('WEATHER', '========== Fetching weather data ==========');
    const browserInstance = await initBrowser();

    const hoursRemaining = getHoursRemainingInDay();
    const shouldFetchTomorrow = hoursRemaining < TOMORROW_FETCH_THRESHOLD_HOURS;

    DEBUG.log('WEATHER', `Hours remaining today: ${hoursRemaining.toFixed(1)} | Fetch tomorrow: ${shouldFetchTomorrow}`);

    DEBUG.log('WEATHER', 'Scraping today\'s hourly forecast...');
    const todayResult = await scrapeHourlyFromUrl(browserInstance, ACCUWEATHER_URL, false);
    
    let allForecastData = todayResult.forecastData;
    const locationName = todayResult.locationName;
    
    if (shouldFetchTomorrow) {
      DEBUG.log('WEATHER', 'Fetching tomorrow\'s hourly forecast...');
      try {
        const tomorrowResult = await scrapeHourlyFromUrl(browserInstance, ACCUWEATHER_TOMORROW_URL, true);

        if (tomorrowResult.forecastData.length > 0) {
          const existingDatetimes = new Set(allForecastData.map(h => h.datetime));
          const newTomorrowData = tomorrowResult.forecastData.filter(h => !existingDatetimes.has(h.datetime));
          allForecastData = [...allForecastData, ...newTomorrowData];

          DEBUG.log('WEATHER', `Merged ${newTomorrowData.length} hours from tomorrow's forecast`);
        } else {
          DEBUG.warn('WEATHER', 'Tomorrow\'s forecast returned 0 hours');
        }
      } catch (tomorrowError) {
        DEBUG.error('WEATHER', 'Tomorrow fetch failed:', tomorrowError.message);
      }
    }
    
    // Validate that data was successfully scraped
    if (allForecastData.length === 0) {
      throw new Error('No forecast data found on page. The page structure may have changed.');
    }
    
    // Sort by datetime to ensure chronological order
    allForecastData.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    
    // Limit to 16 hours total
    allForecastData = allForecastData.slice(0, 16);

    const scrapedLocation = locationName || 'Unknown Location';
    const totalDuration = Date.now() - startTime;

    DEBUG.log('WEATHER', '---------- Scraped temperatures ----------');
    DEBUG.log('WEATHER', `Location: ${scrapedLocation} | ${allForecastData.length} hours | ${totalDuration}ms total`);
    allForecastData.forEach((hour, index) => {
      const date = new Date(hour.datetime);
      const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      DEBUG.log('WEATHER', `  ${index + 1}. ${dateStr} ${timeStr}: ${hour.temperature}°${hour.temperatureUnit} - ${hour.iconPhrase} (Precip: ${hour.precipitation}%)`);
    });
    DEBUG.log('WEATHER', '==========================================');

    return {
      location: scrapedLocation,
      forecast: allForecastData
    };
  } catch (error) {
    throw error;
  }
}

// Fetch and cache weather data
async function updateWeatherData() {
  if (isFetching) {
    DEBUG.log('CACHE', 'Fetch already in progress, skipping duplicate update');
    return;
  }

  isFetching = true;
  const updateStart = Date.now();
  DEBUG.log('CACHE', '---------- Starting weather data update ----------');

  try {
    const data = await scrapeWeatherData();
    cachedWeatherData = data;
    lastFetchTime = new Date();
    const updateDuration = Date.now() - updateStart;

    DEBUG.log('CACHE', `Cache updated | ${data.forecast.length} hours | ${updateDuration}ms`);
    DEBUG.log('CACHE', `Next refresh in ${DATA_REFRESH_INTERVAL / 1000 / 60} minutes`);

    DEBUG.log('CACHE', 'Triggering screenshot capture...');
    await saveScreenshotAsBmp();
    DEBUG.log('CACHE', '---------- Update complete ----------');
  } catch (error) {
    DEBUG.error('CACHE', error.message);
    DEBUG.error('CACHE', 'Stack:', error.stack);
    if (cachedWeatherData) {
      DEBUG.log('CACHE', 'Falling back to previously cached data');
    } else {
      DEBUG.error('CACHE', 'No cached data available');
    }
  } finally {
    isFetching = false;
  }
}

// Start the hourly data refresh interval
function startHourlyDataRefresh() {
  updateWeatherData();

  setInterval(() => {
    updateWeatherData();
  }, DATA_REFRESH_INTERVAL);

  DEBUG.log('REFRESH', `Scheduled every ${DATA_REFRESH_INTERVAL / 1000 / 60} minutes`);
}

// Endpoint to get hourly forecast
app.get('/api/hourly-forecast', async (req, res) => {
  try {
    if (cachedWeatherData) {
      const cacheAge = lastFetchTime ? Math.round((Date.now() - lastFetchTime.getTime()) / 1000 / 60) : 0;
      DEBUG.log('API', `Cache HIT | age: ${cacheAge}m | ${cachedWeatherData.forecast.length} hours`);
      return res.json({
        ...cachedWeatherData,
        cachedAt: lastFetchTime?.toISOString(),
        cacheAgeMinutes: cacheAge
      });
    }

    if (!isFetching) {
      DEBUG.log('API', 'Cache MISS - triggering fetch');
      await updateWeatherData();
    } else {
      DEBUG.log('API', 'Cache MISS - waiting for ongoing fetch...');
      while (isFetching) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (cachedWeatherData) {
      DEBUG.log('API', `Serving freshly fetched data | ${cachedWeatherData.forecast.length} hours`);
      return res.json({
        ...cachedWeatherData,
        cachedAt: lastFetchTime?.toISOString(),
        cacheAgeMinutes: 0
      });
    }

    throw new Error('Failed to fetch weather data. Please try again later.');
  } catch (error) {
    DEBUG.error('API', error.message);
    DEBUG.error('API', 'Stack:', error.stack);

    res.status(500).json({
      error: 'Failed to fetch weather data. Please try again later.'
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Graceful shutdown
process.on('SIGINT', async () => {
  DEBUG.log('SHUTDOWN', 'Received SIGINT, closing browser...');
  if (browser) {
    await browser.close();
    DEBUG.log('SHUTDOWN', 'Browser closed');
  }
  process.exit(0);
});

app.listen(PORT, () => {
  DEBUG.log('STARTUP', '========================================');
  DEBUG.log('STARTUP', `Server running on http://localhost:${PORT}`);
  DEBUG.log('STARTUP', `Node.js version: ${process.version}`);
  DEBUG.log('STARTUP', `PID: ${process.pid}`);
  DEBUG.log('STARTUP', `Environment: ${process.env.NODE_ENV || 'development'}`);
  DEBUG.log('STARTUP', `CORS allowed origins: ${allowedOrigins.join(', ')}`);
  DEBUG.log('STARTUP', 'Rate limit: 100 requests per 900s (15 min)');
  DEBUG.log('STARTUP', `Data refresh interval: ${DATA_REFRESH_INTERVAL / 1000 / 60} minutes`);
  DEBUG.log('STARTUP', `Screenshots directory: ${SCREENSHOTS_DIR}`);
  DEBUG.log('STARTUP', `AccuWeather URL: ${ACCUWEATHER_URL}`);
  DEBUG.log('STARTUP', '========================================');
  DEBUG.log('STARTUP', 'Scraping AccuWeather website for weather data...');

  // Start the hourly data refresh
  startHourlyDataRefresh();
});
