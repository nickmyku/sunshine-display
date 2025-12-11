const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import the scraping logic from server.js
// We'll test the actual endpoint by starting a test server
const http = require('http');

const ACCUWEATHER_URL = 'https://www.accuweather.com/en/us/culver-city/90230/hourly-weather-forecast/331292';

// Test configuration
const TEST_TIMEOUT = 90000; // 90 seconds for scraping
const REASONABLE_TEMP_MIN = 20; // Minimum reasonable temperature for Culver City (°F)
const REASONABLE_TEMP_MAX = 120; // Maximum reasonable temperature for Culver City (°F)

// Test results tracking
let testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

function logTest(name, passed, message) {
    testResults.tests.push({ name, passed, message });
    if (passed) {
        testResults.passed++;
        console.log(`✅ PASS: ${name} - ${message}`);
    } else {
        testResults.failed++;
        console.error(`❌ FAIL: ${name} - ${message}`);
    }
}

// Test 1: Verify API endpoint returns data
async function testApiEndpoint() {
    console.log('\n🧪 Test 1: Testing API endpoint...');
    
    try {
        const response = await fetch('http://localhost:3000/api/hourly-forecast');
        const data = await response.json();
        
        if (!response.ok) {
            logTest('API Endpoint', false, `API returned error: ${data.error || response.statusText}`);
            return false;
        }
        
        if (!data || !data.forecast || !Array.isArray(data.forecast)) {
            logTest('API Endpoint', false, 'API response missing forecast array');
            return false;
        }
        
        if (data.forecast.length === 0) {
            logTest('API Endpoint', false, 'API returned empty forecast array');
            return false;
        }
        
        logTest('API Endpoint', true, `Successfully retrieved ${data.forecast.length} hourly forecasts`);
        return data;
    } catch (error) {
        logTest('API Endpoint', false, `Error calling API: ${error.message}`);
        return false;
    }
}

// Test 2: Verify temperature extraction
async function testTemperatureExtraction(forecastData) {
    console.log('\n🧪 Test 2: Testing temperature extraction...');
    
    if (!forecastData || !forecastData.forecast) {
        logTest('Temperature Extraction', false, 'No forecast data provided');
        return false;
    }
    
    const forecast = forecastData.forecast;
    let allTempsValid = true;
    let tempDetails = [];
    
    forecast.forEach((hour, index) => {
        const temp = hour.temperature;
        
        // Check if temperature exists
        if (temp === null || temp === undefined) {
            logTest(`Temperature Extraction (Hour ${index + 1})`, false, 'Temperature is null or undefined');
            allTempsValid = false;
            return;
        }
        
        // Check if temperature is a number
        if (typeof temp !== 'number' || isNaN(temp)) {
            logTest(`Temperature Extraction (Hour ${index + 1})`, false, `Temperature is not a valid number: ${temp}`);
            allTempsValid = false;
            return;
        }
        
        // Check if temperature is in reasonable range
        if (temp < REASONABLE_TEMP_MIN || temp > REASONABLE_TEMP_MAX) {
            logTest(`Temperature Extraction (Hour ${index + 1})`, false, `Temperature ${temp}°F is outside reasonable range (${REASONABLE_TEMP_MIN}-${REASONABLE_TEMP_MAX}°F)`);
            allTempsValid = false;
            return;
        }
        
        tempDetails.push({
            hour: index + 1,
            temperature: temp,
            datetime: hour.datetime
        });
    });
    
    if (allTempsValid) {
        const temps = forecast.map(h => h.temperature);
        const minTemp = Math.min(...temps);
        const maxTemp = Math.max(...temps);
        const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
        
        logTest('Temperature Extraction', true, 
            `All ${forecast.length} temperatures valid. Range: ${minTemp}°F - ${maxTemp}°F, Average: ${avgTemp.toFixed(1)}°F`);
        
        // Log first few temperatures for verification
        console.log('   Sample temperatures:');
        tempDetails.slice(0, 5).forEach(detail => {
            console.log(`   Hour ${detail.hour}: ${detail.temperature}°F (${new Date(detail.datetime).toLocaleTimeString()})`);
        });
        
        return true;
    }
    
    return false;
}

// Test 3: Verify temperature consistency
async function testTemperatureConsistency(forecastData) {
    console.log('\n🧪 Test 3: Testing temperature consistency...');
    
    if (!forecastData || !forecastData.forecast) {
        logTest('Temperature Consistency', false, 'No forecast data provided');
        return false;
    }
    
    const forecast = forecastData.forecast;
    const temps = forecast.map(h => h.temperature).filter(t => t !== null);
    
    if (temps.length < 2) {
        logTest('Temperature Consistency', false, 'Not enough temperatures to check consistency');
        return false;
    }
    
    // Check for extreme jumps (more than 30°F difference between consecutive hours)
    let hasExtremeJumps = false;
    for (let i = 1; i < temps.length; i++) {
        const diff = Math.abs(temps[i] - temps[i - 1]);
        if (diff > 30) {
            logTest('Temperature Consistency', false, 
                `Extreme temperature jump detected: ${temps[i - 1]}°F to ${temps[i]}°F (${diff}°F difference)`);
            hasExtremeJumps = true;
        }
    }
    
    if (!hasExtremeJumps) {
        const maxDiff = Math.max(...temps.map((t, i) => i > 0 ? Math.abs(t - temps[i - 1]) : 0));
        logTest('Temperature Consistency', true, 
            `Temperatures are consistent. Maximum hourly change: ${maxDiff}°F`);
        return true;
    }
    
    return false;
}

// Test 4: Verify data structure
async function testDataStructure(forecastData) {
    console.log('\n🧪 Test 4: Testing data structure...');
    
    if (!forecastData) {
        logTest('Data Structure', false, 'No data provided');
        return false;
    }
    
    // Check location
    if (!forecastData.location || forecastData.location !== 'Culver City, CA') {
        logTest('Data Structure - Location', false, `Expected location 'Culver City, CA', got '${forecastData.location}'`);
        return false;
    }
    logTest('Data Structure - Location', true, `Location correct: ${forecastData.location}`);
    
    // Check forecast array
    if (!Array.isArray(forecastData.forecast)) {
        logTest('Data Structure - Forecast Array', false, 'Forecast is not an array');
        return false;
    }
    
    // Check required fields in each forecast item
    const requiredFields = ['datetime', 'temperature', 'temperatureUnit', 'precipitation', 'precipitationAmount', 'precipitationUnit', 'iconPhrase', 'isDaylight'];
    let allFieldsPresent = true;
    
    forecastData.forecast.forEach((hour, index) => {
        requiredFields.forEach(field => {
            if (!(field in hour)) {
                logTest(`Data Structure - Hour ${index + 1}`, false, `Missing required field: ${field}`);
                allFieldsPresent = false;
            }
        });
    });
    
    if (allFieldsPresent) {
        logTest('Data Structure', true, `All required fields present in ${forecastData.forecast.length} forecast items`);
        return true;
    }
    
    return false;
}

// Test 5: Direct scraping test (bypassing API)
async function testDirectScraping() {
    console.log('\n🧪 Test 5: Testing direct scraping (bypassing API)...');
    
    let browser = null;
    let page = null;
    
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage'
            ]
        });
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('   Navigating to AccuWeather...');
        await page.goto(ACCUWEATHER_URL, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Extract temperature directly from page
        const pageContent = await page.evaluate(() => {
            const cardText = document.body.textContent || '';
            const tempMatches = cardText.match(/(\d+)\s*°[Ff]?/g);
            return tempMatches ? tempMatches.slice(0, 20) : [];
        });
        
        if (pageContent.length === 0) {
            logTest('Direct Scraping', false, 'No temperature patterns found on page');
            return false;
        }
        
        const temps = pageContent.map(match => {
            const numMatch = match.match(/(\d+)/);
            return numMatch ? parseInt(numMatch[1]) : null;
        }).filter(t => t !== null && t >= REASONABLE_TEMP_MIN && t <= REASONABLE_TEMP_MAX);
        
        if (temps.length === 0) {
            logTest('Direct Scraping', false, 'No valid temperatures found in reasonable range');
            return false;
        }
        
        logTest('Direct Scraping', true, `Found ${temps.length} valid temperatures on page. Sample: ${temps.slice(0, 5).join('°F, ')}°F`);
        return true;
        
    } catch (error) {
        logTest('Direct Scraping', false, `Error during direct scraping: ${error.message}`);
        return false;
    } finally {
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
    }
}

// Main test runner
async function runTests() {
    console.log('🚀 Starting Temperature Scraping Tests\n');
    console.log('=' .repeat(60));
    
    // Check if server is running
    try {
        const healthCheck = await fetch('http://localhost:3000/api/hourly-forecast');
        console.log('✓ Server is running\n');
    } catch (error) {
        console.error('❌ ERROR: Server is not running!');
        console.error('Please start the server first with: npm start');
        console.error('Then run this test in another terminal.');
        process.exit(1);
    }
    
    // Run tests
    const forecastData = await testApiEndpoint();
    
    if (forecastData) {
        await testTemperatureExtraction(forecastData);
        await testTemperatureConsistency(forecastData);
        await testDataStructure(forecastData);
    }
    
    await testDirectScraping();
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
        console.log('\nFailed Tests:');
        testResults.tests.filter(t => !t.passed).forEach(test => {
            console.log(`  - ${test.name}: ${test.message}`);
        });
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
