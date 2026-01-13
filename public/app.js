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

// Create weather card element
function createWeatherCard(hour) {
    const card = document.createElement('div');
    card.className = `weather-card ${hour.isDaylight ? '' : 'night'}`;
    
    const date = new Date(hour.datetime);
    const timeStr = formatTime(hour.datetime);
    
    // Get temperature in selected unit
    const displayTemp = getTemperature(hour.temperature);
    const displayUnit = getSelectedUnit();

    card.innerHTML = `
        <div class="time">${timeStr}</div>
        <div class="icon-phrase">${hour.iconPhrase}</div>
        <div class="temperature">${displayTemp}°${displayUnit}</div>
        <div class="precipitation">
            <div class="precipitation-item">
                <span class="precipitation-label">Precipitation</span>
                <span class="precipitation-value">${hour.precipitation}%</span>
            </div>
            <div class="precipitation-item">
                <span class="precipitation-label">Amount</span>
                <span class="precipitation-value">${hour.precipitationAmount.toFixed(1)} ${hour.precipitationUnit}</span>
            </div>
        </div>
    `;

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

// Handle cards count input
function initCardsCountInput() {
    const cardsInput = document.getElementById('cards-count');
    cardsInput.addEventListener('input', () => {
        if (forecastData.length > 0) {
            renderWeatherCards();
        }
    });
}

// Fetch weather on page load and initialize controls
document.addEventListener('DOMContentLoaded', () => {
    initUnitToggle();
    initCardsCountInput();
    fetchWeather();
});
