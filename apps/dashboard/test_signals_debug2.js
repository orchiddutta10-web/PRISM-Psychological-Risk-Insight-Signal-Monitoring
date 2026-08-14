const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  await page.goto('http://localhost:3000', { waitUntil: 'load' });

  const { execSync } = require('child_process');
  let token = execSync('python -c "from app.utils.auth import create_access_token; print(create_access_token({\\\"sub\\\": \\\"0ad2f62a-e779-41cd-978c-23a0954379a3\\\", \\\"type\\\": \\\"guardian\\\"}))"', { cwd: '../../services/api', encoding: 'utf8' }).trim();

  await page.evaluate((t) => {
    localStorage.setItem('prism_token', t);
    localStorage.setItem('prism_guardian', JSON.stringify({ full_name: "Google User", role: "guardian", id: "0ad2f62a-e779-41cd-978c-23a0954379a3" }));
    localStorage.setItem('prism_selected_device', 'cc571fcd-cb82-4a39-a584-fcafc9de1c00');
  }, token);

  console.log("Navigating to /signals...");
  await page.goto('http://localhost:3000/signals', { waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const text = await page.evaluate(() => document.body.innerText);
  console.log("PAGE TEXT HEAD:", text.substring(0, 300));
  
  if (text.includes("No Device Telemetry")) {
    console.log("FAILED: Still shows 'No Device Telemetry'");
  } else {
    console.log("SUCCESS");
  }

  await browser.close();
})();
