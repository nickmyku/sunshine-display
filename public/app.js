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
    const dateStr = formatDate(hour.datetime);

    card.innerHTML = `
        <div class="time">${dateStr} ${timeStr}</div>
        <div class="icon-phrase">${hour.iconPhrase}</div>
        <div class="temperature">${hour.temperature}°${hour.temperatureUnit}</div>
        <div class="precipitation">
            <div class="precipitation-item">
                <span class="precipitation-label">Precipitation Chance</span>
                <span class="precipitation-value">${hour.precipitation}%</span>
            </div>
            <div class="precipitation-item">
                <span class="precipitation-label">Precipitation Amount</span>
                <span class="precipitation-value">${hour.precipitationAmount.toFixed(2)} ${hour.precipitationUnit}</span>
            </div>
        </div>
    `;

    return card;
}

// Fetch weather data from API
async function fetchWeather() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const containerEl = document.getElementById('weather-container');
    const gridEl = document.getElementById('weather-grid');

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

        // Clear previous data
        gridEl.innerHTML = '';

        // Create cards for each hour
        data.forecast.forEach(hour => {
            const card = createWeatherCard(hour);
            gridEl.appendChild(card);
        });

        // Show container, hide loading
        loadingEl.style.display = 'none';
        containerEl.style.display = 'block';
    } catch (error) {
        console.error('Error:', error);
        loadingEl.style.display = 'none';
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
    }
}

// Fetch weather on page load
document.addEventListener('DOMContentLoaded', fetchWeather);
