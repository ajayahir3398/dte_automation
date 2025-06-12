const express = require('express');
const cors = require('cors');
const path = require('path');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;


// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

let logs = [];
let isRunning = false;

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Optional: serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Utility to log and store logs
function log(message) {
  console.log(message);
  logs.push(`${new Date().toISOString()} - ${message}`);
  if (logs.length > 1000) logs.shift(); // prevent memory overflow
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main automation function
async function startAutomation(username, password) {
  isRunning = true;
  log("Automation started");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://dteworks.com/xml/index.html#/login');
    log("Navigated to DTEWorks");
    log("Starting login process");

    await page.fill('input[type="tel"][placeholder="Please enter your phone number"]', username);
    log(`Filled phone number`);
    await page.fill('input[type="password"][placeholder="Please enter login password"]', password);
    log(`Filled password`);

    await page.click('button.van-button--danger');
    log("Clicked login button");
    await page.waitForLoadState('networkidle');  // wait for login success
    await page.screenshot({ path: 'afterLogin.png', fullPage: true });

    // Navigate to task tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.van-tabbar-item'));
      const taskTab = tabs.find(tab => tab.textContent.includes('Task'));
      if (taskTab) {
        taskTab.click();
      }
    });

    log('Waiting 2 seconds for task page to load');
    await wait(2000);
    await page.screenshot({ path: 'afterTaskTab.png', fullPage: true });
    log('Navigated to Task page');

    let remainingTasksCount = await getRemainingTasksCount(page);
    log(`Remaining tasks count: ${remainingTasksCount}`);

    while (remainingTasksCount > 0) {
      const result = await handleSingleTask(page);
      if (!result.success) {
        throw new Error(result.message);
      }
      // Update the count after each task
      remainingTasksCount = await getRemainingTasksCount(page);
      log(`Remaining tasks count: ${remainingTasksCount}`);
    }

    log('All today\'s tasks completed successfully');
    await browser.close();
    return { success: true, message: 'All today\'s tasks completed successfully' };
  } catch (err) {
    log(`Error: ${err.message}`);
  } finally {
    await browser.close();
    isRunning = false;
  }
}

// Helper function to get remaining tasks count
async function getRemainingTasksCount(page) {
  try {
    const remainingTasksText = await page.evaluate(() => {
      const taskElement = Array.from(document.querySelectorAll('div[data-v-02e24912]'))
        .find(el => el.textContent.includes('Tasks remaining today:'));
      return taskElement ? taskElement.textContent.trim() : '';
    });

    // Extract the number using a more precise regex
    const match = remainingTasksText.match(/Tasks remaining today:\s*(\d+)/);
    const count = match ? parseInt(match[1]) : 0;
    return count;
  } catch (error) {
    log(`Error getting remaining tasks count: ${error.message}`);
    return 0;
  }
}

// Helper function to handle a single task
async function handleSingleTask(page) {
  try {
    // Click first task
    const taskClicked = await page.evaluate(() => {
      const taskItems = document.querySelectorAll('div[data-v-02e24912].div');
      if (taskItems.length > 0) {
        taskItems[0].click();
        return true;
      }
      return false;
    });

    if (!taskClicked) {
      throw new Error('No task items found to click');
    }
    log('Selected first task item');

    // Wait for task details page to load and take screenshot
    log('Waiting 2 seconds for task details page to load');
    await wait(2000);
    await page.screenshot({ path: 'afterTaskDetails.png', fullPage: true });
    log('Navigated to task details page');

    // Get advertisement text
    log('Extracting advertisement text');
    const adText = await page.evaluate(() => {
      const introDiv = Array.from(document.querySelectorAll('div[data-v-1d18d737]'))
        .find(el => el.textContent.trim() === 'Advertising Introduction');
      if (introDiv) {
        const adTextDiv = introDiv.nextElementSibling;
        return adTextDiv ? adTextDiv.textContent.trim() : '';
      }
      return '';
    });
    log(`Advertisement text: ${adText}`);

    // Handle video playback with retry
    let videoSuccess = false;
    let videoRetryCount = 0;
    const maxVideoRetries = 3;

    while (!videoSuccess && videoRetryCount < maxVideoRetries) {
      try {
        await page.evaluate(() => {
          const playButton = document.querySelector('.vjs-big-play-button');
          if (playButton) {
            playButton.click();
          }
        });

        await page.waitForFunction(() => {
          const video = document.querySelector('video');
          return video && !video.paused;
        });

        log('Video started playing');
        await takeScreenshot(page, CONSTANTS.SCREENSHOTS.VIDEO_PLAYING);

        videoSuccess = await handleVideoWatching(page);

        if (!videoSuccess) {
          videoRetryCount++;
          log(`Video watching failed, attempt ${videoRetryCount}/${maxVideoRetries}`);
          if (videoRetryCount < maxVideoRetries) {
            await wait(1000);
          }
        }
      } catch (error) {
        log(`Error during video playback: ${error.message}`);
        videoRetryCount++;
        if (videoRetryCount < maxVideoRetries) {
          await wait(1000);
        }
      }
    }

    if (!videoSuccess) {
      throw new Error('Failed to watch video after multiple attempts');
    }

    // Handle answer submission
    await handleAnswerSubmission(page, adText);

    log('Waiting 2 seconds for page to load');
    await wait(CONSTANTS.WAIT_TIMES.PAGE_LOAD);
    await takeScreenshot(page, CONSTANTS.SCREENSHOTS.TASK_TAB);

    // Check remaining tasks
    const remainingTasksCount = await getRemainingTasksCount(page);
    log(`Remaining tasks count: ${remainingTasksCount}`);

    if (remainingTasksCount > 0) {
      // Instead of recursive call, return to performTasks
      return { success: true, message: 'Task completed, more tasks available' };
    } else {
      log('No remaining tasks for today');
      return { success: true, message: 'All tasks completed successfully' };
    }

  } catch (error) {
    log(`Error in handleSingleTask: ${error.message}`);
    throw error;
  }
}

async function waitForElement(page, selector, timeout = 30000) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout });
    return true;
  } catch (error) {
    log(`Element not found: ${selector} ${error.message}`);
    return false;
  }
}

// API endpoints
app.post('/start', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }

  if (isRunning) {
    return res.status(400).json({ message: 'Automation already running' });
  }
  logs = [];
  startAutomation(username, password);
  res.json({ message: 'Automation started' });
});

app.get('/logs', (req, res) => {
  res.json({ logs });
});

app.post('/stop', (req, res) => {
  isRunning = false;
  log('Stop command received');
  res.json({ message: 'Stopping automation' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
