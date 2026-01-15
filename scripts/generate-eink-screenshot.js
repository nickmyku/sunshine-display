const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');
const sharp = require('sharp');

function buildDeterministicDemoData() {
  // Keep this deterministic so screenshots are stable across runs.
  // Use a fixed date close to "now" (project context date: 2026-01-15).
  const base = new Date('2026-01-15T08:00:00.000Z');

  const phrases = [
    'Clear',
    'Partly cloudy',
    'Cloudy',
    'Windy',
    'Light rain',
    'Rain',
    'Showers',
    'Fog',
  ];

  const forecast = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(base);
    d.setHours(d.getHours() + i);

    const temperature = 58 + (i % 6) * 3; // 58..73
    const precipitation = Math.min(100, Math.max(0, (i * 9) % 101));
    const precipitationAmount = precipitation === 0 ? 0 : Math.round(((precipitation / 100) * 3.0) * 10) / 10;
    const hour = d.getUTCHours();
    // Simple, deterministic "daytime" window for preview styling.
    const isDaylight = hour >= 7 && hour < 19;

    return {
      datetime: d.toISOString(),
      temperature,
      temperatureUnit: 'F',
      precipitation,
      precipitationAmount,
      precipitationUnit: 'mm',
      icon: null,
      iconPhrase: phrases[i % phrases.length],
      isDaylight,
    };
  });

  return {
    location: 'Culver City (Demo)',
    forecast,
    cachedAt: base.toISOString(),
    cacheAgeMinutes: 0,
  };
}

async function generate() {
  const app = express();
  const publicDir = path.join(__dirname, '..', 'public');

  app.use(express.static(publicDir));
  app.get('/api/hourly-forecast', (req, res) => {
    res.json(buildDeterministicDemoData());
  });
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  if (!port) {
    server.close();
    throw new Error('Failed to start screenshot server (no port assigned).');
  }

  const outputPath = path.join(publicDir, 'eink-preview.png');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for cards to render.
    await page.waitForFunction(() => {
      const grid = document.getElementById('weather-grid');
      return grid && grid.children && grid.children.length > 0;
    }, { timeout: 15000 });

    // Give layout a moment to settle.
    await new Promise((r) => setTimeout(r, 250));

    const pngBuffer = await page.screenshot({ fullPage: false });

    // Convert to true monochrome (thresholded) PNG for e-ink preview.
    await sharp(pngBuffer)
      .resize(960, 640, { fit: 'fill' })
      .grayscale()
      .threshold(180)
      .png({ compressionLevel: 9 })
      .toFile(outputPath);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(() => resolve()));
  }

  // eslint-disable-next-line no-console
  console.log(`Saved e-ink preview screenshot to: ${outputPath}`);
}

generate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

