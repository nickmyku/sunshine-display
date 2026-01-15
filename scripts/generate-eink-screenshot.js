const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'eink-ui.png');

function buildMockForecast(hours = 12) {
  const now = new Date();
  const forecast = [];

  for (let i = 0; i < hours; i += 1) {
    const dt = new Date(now);
    dt.setHours(now.getHours() + i, 0, 0, 0);
    const hour = dt.getHours();
    const isDaylight = hour >= 6 && hour < 20;

    forecast.push({
      datetime: dt.toISOString(),
      temperature: 58 + i,
      temperatureUnit: 'F',
      precipitation: (i * 7) % 100,
      precipitationAmount: Math.max(0, (i * 0.2) % 6),
      precipitationUnit: 'mm',
      iconPhrase: isDaylight ? 'Clear' : 'Cloudy',
      isDaylight
    });
  }

  return forecast;
}

function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function generateScreenshot() {
  const app = express();
  app.use(express.static(PUBLIC_DIR));

  app.get('/api/hourly-forecast', (req, res) => {
    res.json({
      location: 'Culver City, CA',
      forecast: buildMockForecast(),
      cachedAt: new Date().toISOString(),
      cacheAgeMinutes: 0
    });
  });

  const server = app.listen(0);
  const port = server.address().port;

  let browser = null;

  try {
    ensureScreenshotDir();

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 640 });

    await page.goto(`http://localhost:${port}`, {
      waitUntil: 'networkidle2',
      timeout: 15000
    });

    await page.waitForFunction(() => {
      const grid = document.getElementById('weather-grid');
      return grid && grid.children.length > 0;
    }, { timeout: 10000 });

    await new Promise(resolve => setTimeout(resolve, 500));
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });

    await page.close();
  } finally {
    if (browser) {
      await browser.close();
    }
    server.close();
  }
}

generateScreenshot()
  .then(() => {
    console.log(`Screenshot saved to ${SCREENSHOT_PATH}`);
  })
  .catch((error) => {
    console.error('Failed to generate screenshot:', error.message);
    process.exitCode = 1;
  });
