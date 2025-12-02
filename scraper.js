const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;

// Add stealth plugin and use defaults (all evasion techniques)
puppeteer.use(StealthPlugin());

const BASE_URL = 'https://www.hot.net.il/';
const TARGET_URL = 'https://www.hot.net.il/heb/tv/tvguide/';
const CHANNELS_TO_SCRAPE = ['11', '12', '13', '14'];

async function scrapeChannels() {
    console.log('Starting scraper with Stealth Mode...');

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--lang=he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7'
        ],
        ignoreHTTPSErrors: true
    });

    try {
        const page = await browser.newPage();

        // Set a modern, realistic User Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Referer': 'https://www.google.com/',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1'
        });

        await page.setViewport({ width: 1920, height: 1080 });

        // 1. Visit Homepage first to establish session/cookies
        console.log(`Navigating to Homepage (${BASE_URL}) to establish session...`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // 2. Wait a bit to simulate human behavior
        console.log('Waiting 5 seconds...');
        await new Promise(r => setTimeout(r, 5000));

        // 3. Navigate to TV Guide
        console.log(`Navigating to TV Guide (${TARGET_URL})...`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 90000 });

        try {
            await page.waitForSelector('.scheduleTable', { timeout: 30000 });
        } catch (e) {
            console.log('Timeout waiting for .scheduleTable. Proceeding with scroll...');
        }

        console.log('Page loaded. Scrolling to load all channels...');
        await autoScroll(page);
        console.log('Finished scrolling. Extracting data...');

        const scheduleData = await page.evaluate((channelsToScrape) => {
            const results = [];
            const channelContainers = document.querySelectorAll('.scheduleChannel');

            channelContainers.forEach(container => {
                const numEl = container.querySelector('.scheduleChannel_num b');
                if (!numEl) return;

                const channelNum = numEl.textContent.trim();
                if (!channelsToScrape.includes(channelNum)) return;

                const items = container.querySelectorAll('.scheduleChannel_item');
                items.forEach(item => {
                    const titleEl = item.querySelector('span');
                    const timeEl = item.querySelector('strong');

                    if (titleEl && timeEl) {
                        const title = titleEl.textContent.trim();
                        const timeRange = timeEl.textContent.trim();
                        const times = timeRange.split('-').map(t => t.trim());
                        if (times.length === 2) {
                            results.push({
                                channel: channelNum,
                                title: title,
                                rawTime: times[0],
                                rawEndTime: times[1]
                            });
                        }
                    }
                });
            });
            return results;
        }, CHANNELS_TO_SCRAPE);

        console.log(`Extracted ${scheduleData.length} raw programs.`);

        if (scheduleData.length === 0) {
            throw new Error('No data extracted! The page might not have loaded correctly.');
        }

        const normalizedData = normalizeSchedule(scheduleData);
        console.log(`Normalized ${normalizedData.length} programs.`);

        await fs.writeFile('schedule.json', JSON.stringify(normalizedData, null, 2));
        console.log('Successfully saved to schedule.json');

    } catch (error) {
        console.error('Error during scraping:', error);
        process.exit(1);
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
    await new Promise(r => setTimeout(r, 2000));
}

scrapeChannels();
