const channels = ['11', '12', '13', '14'];
let scheduleData = [];
let currentTime = new Date();

// Initialize
async function init() {
    try {
        // Clear cache to force fresh load
        localStorage.removeItem('tvSchedule');

        // Fetch fresh data
        const response = await fetch('schedule.json');
        if (response.ok) {
            const data = await response.json();
            scheduleData = data;
            localStorage.setItem('tvSchedule', JSON.stringify(data));
            console.log(`Loaded ${scheduleData.length} programs`);
        }
    } catch (e) {
        console.error('Failed to load schedule', e);
    }

    renderChannels();
    updateTimeDisplay();

    // Setup event listeners
    document.getElementById('time-slider').addEventListener('input', handleSliderChange);
    document.getElementById('prev-hour').addEventListener('click', () => shiftTime(-60));
    document.getElementById('next-hour').addEventListener('click', () => shiftTime(60));
}

function handleSliderChange(e) {
    const minutes = parseInt(e.target.value);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    // Create a fresh Date object for today with the selected time
    const today = new Date();
    currentTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, mins, 0, 0);

    updateTimeDisplay();
    renderChannels();
}

function shiftTime(deltaMinutes) {
    currentTime = new Date(currentTime.getTime() + deltaMinutes * 60 * 1000);
    updateSliderFromTime();
    updateTimeDisplay();
    renderChannels();
}

function updateSliderFromTime() {
    const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    document.getElementById('time-slider').value = minutes;
}

function updateTimeDisplay() {
    const hours = currentTime.getHours().toString().padStart(2, '0');
    const minutes = currentTime.getMinutes().toString().padStart(2, '0');
    document.getElementById('current-time-display').textContent = `${hours}:${minutes}`;
}

function renderChannels() {
    const container = document.getElementById('channels-container');
    container.innerHTML = '';

    channels.forEach(channelId => {
        const row = document.createElement('div');
        row.className = 'channel-row';

        const logo = document.createElement('div');
        logo.className = `channel-logo ch-${channelId}`;
        logo.textContent = channelId;

        const info = document.createElement('div');
        info.className = 'program-info';

        const currentProgram = findProgramForTime(channelId, currentTime);

        if (currentProgram) {
            const start = new Date(currentProgram.startTime);
            const end = new Date(currentProgram.endTime);
            const timeStr = `${formatTime(start)} - ${formatTime(end)}`;

            info.innerHTML = `
                <div class="program-title">${currentProgram.title}</div>
                <div class="program-time">${timeStr}</div>
            `;
        } else {
            info.innerHTML = `<div class="no-program">אין שידורים זמינים לשעה זו</div>`;
        }

        row.appendChild(logo);
        row.appendChild(info);
        container.appendChild(row);
    });
}

function findProgramForTime(channelId, time) {
    const result = scheduleData.find(p => {
        if (p.channel !== channelId) return false;
        const start = new Date(p.startTime);
        const end = new Date(p.endTime);

        return time >= start && time < end;
    });
    return result;
}

function formatTime(date) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// Set initial slider value to current time
const now = new Date();
const initialMinutes = now.getHours() * 60 + now.getMinutes();
document.getElementById('time-slider').value = initialMinutes;
currentTime = now;

init();
