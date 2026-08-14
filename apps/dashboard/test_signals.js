const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 1. Visit the home page (login)
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 2. Set LocalStorage tokens manually
  // We need to fetch a valid token first
  const { execSync } = require('child_process');
  let token = '';
  try {
    token = execSync('python -c "from app.utils.auth import create_access_token; print(create_access_token({\\\"sub\\\": \\\"0ad2f62a-e779-41cd-978c-23a0954379a3\\\", \\\"type\\\": \\\"guardian\\\"}))"', { cwd: '../../services/api', encoding: 'utf8' }).trim();
  } catch (e) {
    console.error("Failed to generate token");
    process.exit(1);
  }

  await page.evaluate((t) => {
    localStorage.setItem('prism_token', t);
    localStorage.setItem('prism_guardian', JSON.stringify({ full_name: "Google User", role: "guardian", id: "0ad2f62a-e779-41cd-978c-23a0954379a3" }));
    // 'cc571fcd-cb82-4a39-a584-fcafc9de1c00' is the Demo Teen (Simulator)
    localStorage.setItem('prism_selected_device', 'cc571fcd-cb82-4a39-a584-fcafc9de1c00');
  }, token);

  // 3. Navigate to /signals
  await page.goto('http://localhost:3000/signals', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(2000); // wait for fetch/render

  // 4. Look for "No Device Telemetry" or the cards
  const text = await page.evaluate(() => document.body.innerText);
  
  if (text.includes("No Device Telemetry")) {
    console.log("FAILED: Still shows 'No Device Telemetry'");
  } else if (text.includes("Active Node: Demo Teen (Simulator)")) {
    console.log("SUCCESS: Active Node is rendered!");
    // check if it has the actual signal analysis cards
    if (text.includes("Mobility / Location") && text.includes("Typing Dynamics")) {
       console.log("SUCCESS: Telemetry Cards are visible.");
    } else {
       console.log("FAILED: Cards missing.");
    }
  } else {
    console.log("FAILED: Unexpected UI state:", text.substring(0, 500));
  }

  await page.screenshot({ path: 'signals.png' });
  await browser.close();
})();
