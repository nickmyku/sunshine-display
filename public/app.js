// Store forecast data for unit conversion
let forecastData = [];

// Get current temperature unit (default to Celsius)
function getSelectedUnit() {
    const celsiusRadio = document.getElementById('unit-celsius');
    return celsiusRadio && celsiusRadio.checked ? 'C' : 'F';
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
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
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
    const timeDiv = document.createElement('div');
    timeDiv.className = 'time';
    timeDiv.textContent = timeStr;
    
    const iconPhraseDiv = document.createElement('div');
    iconPhraseDiv.className = 'icon-phrase';
    iconPhraseDiv.textContent = sanitizeText(hour.iconPhrase);
    
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
    card.appendChild(timeDiv);
    card.appendChild(iconPhraseDiv);
    card.appendChild(temperatureDiv);
    card.appendChild(precipitationDiv);

    return card;
}

// Get the number of columns in the grid based on viewport width
function getGridColumns() {
    const width = window.innerWidth;
    if (width <= 480) return 2;
    if (width <= 768) return 3;
    if (width <= 1024) return 4;
    return 6;
}

// Render weather cards from stored forecast data (limited to 2 rows)
function renderWeatherCards() {
    const gridEl = document.getElementById('weather-grid');
    gridEl.innerHTML = '';
    
    const columns = getGridColumns();
    const maxCards = columns * 2; // 2 full rows
    const cardsToDisplay = forecastData.slice(0, maxCards);
    
    cardsToDisplay.forEach(hour => {
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

// Handle window resize to update card display
function initResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Debounce resize events
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (forecastData.length > 0) {
                renderWeatherCards();
            }
        }, 150);
    });
}

// Fetch weather on page load and initialize unit toggle
document.addEventListener('DOMContentLoaded', () => {
    initUnitToggle();
    initResizeHandler();
    fetchWeather();
});
