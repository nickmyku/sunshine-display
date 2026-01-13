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

// Calculate number of cards per row based on container width
function getCardsPerRow() {
    const gridEl = document.getElementById('weather-grid');
    const containerWidth = gridEl.offsetWidth;
    const minCardWidth = 140; // matches CSS minmax(140px, 1fr)
    const gap = 10; // matches CSS gap: 10px
    
    // Calculate how many cards fit in a row
    // Each card needs minCardWidth + gap (except the last card in row)
    const cardsPerRow = Math.floor((containerWidth + gap) / (minCardWidth + gap));
    return Math.max(1, cardsPerRow); // At least 1 card per row
}

// Render weather cards from stored forecast data (limited to 2 rows)
function renderWeatherCards() {
    const gridEl = document.getElementById('weather-grid');
    gridEl.innerHTML = '';
    
    // Calculate how many cards to display (2 full rows)
    const cardsPerRow = getCardsPerRow();
    const maxCards = cardsPerRow * 2; // 2 rows
    
    // Limit the data to 2 rows worth of cards
    const displayData = forecastData.slice(0, maxCards);
    
    displayData.forEach(hour => {
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

// Handle window resize to recalculate card display
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
