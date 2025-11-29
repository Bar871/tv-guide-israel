const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs').promises;

const TARGET_URL = 'https://www.hot.net.il/heb/tv/tvguide/';
const CHANNELS_TO_SCRAPE = ['11', '12', '13', '14'];

async function scrapeChannels() {
    console.log('Starting scraper...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Set a desktop user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Set a reasonable viewport
        await page.setViewport({ width: 1920, height: 1080 });

        console.log(`Navigating to ${TARGET_URL}...`);
        // Add extra headers to avoid blocking
        await page.setExtraHTTPHeaders({
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7'
    });
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for the schedule table to load
        try {
            await page.waitForSelector('.scheduleTable', { timeout: 30000 });
        } catch (e) {
            console.log('Timeout waiting for .scheduleTable. Proceeding with scroll...');
        }

        console.log('Page loaded. Scrolling to load all channels...');

        // Scroll down to trigger lazy loading
        await autoScroll(page);

        console.log('Finished scrolling. Extracting data...');

        const scheduleData = await page.evaluate((channelsToScrape) => {
            const results = [];
            const channelContainers = document.querySelectorAll('.scheduleChannel');

            channelContainers.forEach(container => {
                // Find channel number
                const numEl = container.querySelector('.scheduleChannel_num b');
                if (!numEl) return;

                const channelNum = numEl.textContent.trim();

                // Check if this is one of the channels we want
                if (!channelsToScrape.includes(channelNum)) return;

                // Find all program items
                const items = container.querySelectorAll('.scheduleChannel_item');

                items.forEach(item => {
                    const titleEl = item.querySelector('span');
                    const timeEl = item.querySelector('strong');

                    if (titleEl && timeEl) {
                        const title = titleEl.textContent.trim();
                        const timeRange = timeEl.textContent.trim(); // Format: "HH:MM - HH:MM"

                        // Parse time range
                        const times = timeRange.split('-').map(t => t.trim());
                        if (times.length === 2) {
                            results.push({
                                channel: channelNum,
                                title: title,
                                rawTime: times[0], // Start time HH:MM
                                rawEndTime: times[1] // End time HH:MM
                            });
                        }
                    }
                });
            });

            return results;
        }, CHANNELS_TO_SCRAPE);

        console.log(`Extracted ${scheduleData.length} raw programs.`);

        // Normalize data (convert to ISO dates, handle day crossovers)
        const normalizedData = normalizeSchedule(scheduleData);

        console.log(`Normalized ${normalizedData.length} programs.`);

        // Save to file
        await fs.writeFile('schedule.json', JSON.stringify(normalizedData, null, 2));
        console.log('Successfully saved to schedule.json');

    } catch (error) {
        console.error('Error during scraping:', error);
    } finally {
        await browser.close();
    }
}

function normalizeSchedule(rawItems) {
    const normalized = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    rawItems.forEach(item => {
        try {
            const [startHours, startMinutes] = item.rawTime.split(':').map(Number);
            const [endHours, endMinutes] = item.rawEndTime.split(':').map(Number);

            // Create Date objects
            const startTime = new Date(today);
            startTime.setHours(startHours, startMinutes, 0, 0);

            const endTime = new Date(today);
            endTime.setHours(endHours, endMinutes, 0, 0);

            if (endTime < startTime) {
                endTime.setDate(endTime.getDate() + 1);
            }

            if (startHours < 6) {
                startTime.setDate(startTime.getDate() + 1);
                endTime.setDate(endTime.getDate() + 1);
            }

            normalized.push({
                channel: item.channel,
                title: item.title,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString()
            });
        } catch (e) {
            console.warn('Skipping invalid item:', item, e);
        }
    });

    return normalized;
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight || totalHeight > 10000) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
    // Wait a bit more for final renders
    await new Promise(r => setTimeout(r, 2000));
}

scrapeChannels();


