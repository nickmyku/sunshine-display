// Store forecast data for unit conversion
let forecastData = [];

const TIME_FORMAT_STORAGE_KEY = 'timeFormat';

// Get current temperature unit (default to Celsius)
function getSelectedUnit() {
    const celsiusRadio = document.getElementById('unit-celsius');
    return celsiusRadio && celsiusRadio.checked ? 'C' : 'F';
}

// Get current time format (default to military/24-hour)
function getSelectedTimeFormat() {
    const regularRadio = document.getElementById('time-regular');
    return regularRadio && regularRadio.checked ? '12' : '24';
}

function loadSavedTimeFormat() {
    try {
        const value = localStorage.getItem(TIME_FORMAT_STORAGE_KEY);
        return value === '12' ? '12' : '24';
    } catch {
        return '24';
    }
}

function saveTimeFormat(format) {
    try {
        localStorage.setItem(TIME_FORMAT_STORAGE_KEY, format === '24' ? '24' : '12');
    } catch {
        // Ignore storage errors (e.g., blocked in private mode)
    }
}

// Convert Fahrenheit to Celsius
function fahrenheitToCelsius(fahrenheit) {
    return Math.round((fahrenheit - 32) * 5 / 9);
}

// Get temperature in selected unit
function getTemperature(fahrenheitTemp) {
    const unit = getSelectedUnit();
    if (unit === 'C') {
        return fahrenheitToCelsius(fahrenheitTemp);
    }
    return fahrenheitTemp;
}

// Format datetime to readable time
function formatTime(datetime) {
    const date = new Date(datetime);
    if (Number.isNaN(date.getTime())) return '';

    const timeFormat = getSelectedTimeFormat();
    if (timeFormat === '12') {
        // Regular time (12-hour): h:MM AM/PM
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    // Military time (24-hour): HH:MM
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Format date for display
function formatDate(datetime) {
    const date = new Date(datetime);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
        return 'Tomorrow';
    } else {
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
}

// Sanitize text to prevent XSS attacks
function sanitizeText(text) {
    if (typeof text !== 'string') return String(text);
    return text;
}

// Create weather card element using safe DOM manipulation (XSS-safe)
function createWeatherCard(hour) {
    const card = document.createElement('div');
    card.className = `weather-card ${hour.isDaylight ? '' : 'night'}`;
    
    const timeStr = formatTime(hour.datetime);
    
    // Get temperature in selected unit
    const displayTemp = getTemperature(hour.temperature);
    const displayUnit = getSelectedUnit();

    // Build DOM structure safely using textContent (prevents XSS)
    const timeIconRow = document.createElement('div');
    timeIconRow.className = 'time-icon-row';
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'time';
    timeDiv.textContent = timeStr;
    
    const iconPhraseDiv = document.createElement('div');
    iconPhraseDiv.className = 'icon-phrase';
    iconPhraseDiv.textContent = sanitizeText(hour.iconPhrase);
    
    timeIconRow.appendChild(timeDiv);
    timeIconRow.appendChild(iconPhraseDiv);
    
    const temperatureDiv = document.createElement('div');
    temperatureDiv.className = 'temperature';
    temperatureDiv.textContent = `${displayTemp}°${displayUnit}`;
    
    const precipitationDiv = document.createElement('div');
    precipitationDiv.className = 'precipitation';
    
    // First precipitation item
    const precipItem1 = document.createElement('div');
    precipItem1.className = 'precipitation-item';
    
    const precipLabel1 = document.createElement('span');
    precipLabel1.className = 'precipitation-label';
    precipLabel1.textContent = 'Precipitation';
    
    const precipValue1 = document.createElement('span');
    precipValue1.className = 'precipitation-value';
    precipValue1.textContent = `${hour.precipitation}%`;
    
    precipItem1.appendChild(precipLabel1);
    precipItem1.appendChild(precipValue1);
    
    // Second precipitation item
    const precipItem2 = document.createElement('div');
    precipItem2.className = 'precipitation-item';
    
    const precipLabel2 = document.createElement('span');
    precipLabel2.className = 'precipitation-label';
    precipLabel2.textContent = 'Amount';
    
    const precipValue2 = document.createElement('span');
    precipValue2.className = 'precipitation-value';
    precipValue2.textContent = `${hour.precipitationAmount.toFixed(1)} ${sanitizeText(hour.precipitationUnit)}`;
    
    precipItem2.appendChild(precipLabel2);
    precipItem2.appendChild(precipValue2);
    
    precipitationDiv.appendChild(precipItem1);
    precipitationDiv.appendChild(precipItem2);
    
    // Assemble the card
    card.appendChild(timeIconRow);
    card.appendChild(temperatureDiv);
    card.appendChild(precipitationDiv);

    return card;
}

// Get the number of cards to display
function getCardsCount() {
    const cardsInput = document.getElementById('cards-count');
    const count = parseInt(cardsInput.value, 10);
    // Ensure we have a valid number between 1 and the available forecast data
    if (isNaN(count) || count < 1) return 1;
    return count;
}

// Render weather cards from stored forecast data
function renderWeatherCards() {
    const gridEl = document.getElementById('weather-grid');
    gridEl.innerHTML = '';
    
    const cardsToShow = getCardsCount();
    const dataToRender = forecastData.slice(0, cardsToShow);
    
    dataToRender.forEach(hour => {
        const card = createWeatherCard(hour);
        gridEl.appendChild(card);
    });
}

// Fetch weather data from API
async function fetchWeather() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const containerEl = document.getElementById('weather-container');
    const gridEl = document.getElementById('weather-grid');
    const locationEl = document.getElementById('location-name');

    // Show loading, hide others
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    containerEl.style.display = 'none';

    try {
        const response = await fetch('/api/hourly-forecast');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch weather data');
        }

        // Update the location name from scraped data
        if (data.location) {
            locationEl.textContent = data.location;
            document.title = `Weather - ${data.location}`;
        }

        // Store forecast data for unit conversion
        forecastData = data.forecast;

        // Render weather cards
        renderWeatherCards();

        // Show container, hide loading
        loadingEl.style.display = 'none';
        containerEl.style.display = 'block';
    } catch (error) {
        console.error('Error:', error);
        loadingEl.style.display = 'none';
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
        locationEl.textContent = 'Location unavailable';
    }
}

// Handle temperature unit toggle
function initUnitToggle() {
    const unitRadios = document.querySelectorAll('input[name="temp-unit"]');
    unitRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (forecastData.length > 0) {
                renderWeatherCards();
            }
        });
    });
}

// Handle time format toggle (regular/military)
function initTimeToggle() {
    const savedFormat = loadSavedTimeFormat();
    const regularRadio = document.getElementById('time-regular');
    const militaryRadio = document.getElementById('time-military');

    if (regularRadio && militaryRadio) {
        if (savedFormat === '24') {
            militaryRadio.checked = true;
        } else {
            regularRadio.checked = true;
        }
    }

    const timeRadios = document.querySelectorAll('input[name="time-format"]');
    timeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            saveTimeFormat(getSelectedTimeFormat());
            if (forecastData.length > 0) {
                renderWeatherCards();
            }
        });
    });
}

// Handle cards count input
function initCardsCountInput() {
    const cardsInput = document.getElementById('cards-count');
    cardsInput.addEventListener('input', () => {
        if (forecastData.length > 0) {
            renderWeatherCards();
        }
    });
}

// Handle refresh button click
function initRefreshButton() {
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.addEventListener('click', () => {
        fetchWeather();
    });
}

// Fetch weather on page load and initialize controls
document.addEventListener('DOMContentLoaded', () => {
    initUnitToggle();
    initTimeToggle();
    initCardsCountInput();
    initRefreshButton();
    fetchWeather();
});
