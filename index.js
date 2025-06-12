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
  // console.log(message);
  logs.push(`${new Date().toISOString()} - ${message}`);
  if (logs.length > 1000) logs.shift(); // prevent memory overflow
}

// Main automation function
async function startAutomation(username, password) {
  isRunning = true;
  log("Automation started");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    log("Starting login process");
    await page.goto('https://dteworks.com/xml/index.html#/login');
    log("Navigated to DTEWorks");

    await page.fill('input[type="tel"][placeholder="Please enter your phone number"]', username);
    await page.fill('input[type="password"][placeholder="Please enter login password"]', password);

    await page.click('button.van-button--danger');
    log("Login submitted");
    await page.waitForTimeout(2000);  // wait for login success
    await page.screenshot({ path: 'afterLogin.png', fullPage: true });

    // TODO: Check login success, navigate to ads page
    for (let i = 0; i < 5; i++) {
      if (!isRunning) break;

      log(`Viewing ad ${i + 1}`);
      // TODO: implement ad click logic
      await page.waitForTimeout(5000); // simulate viewing
    }

    log("Automation finished");
  } catch (err) {
    log(`Error: ${err.message}`);
  } finally {
    await browser.close();
    isRunning = false;
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
