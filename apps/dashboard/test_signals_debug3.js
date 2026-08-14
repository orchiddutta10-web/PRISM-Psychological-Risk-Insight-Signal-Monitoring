const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  
  // Intercept network requests
  await page.setRequestInterception(true);
  page.on('request', request => {
    console.log('REQUEST:', request.method(), request.url());
    request.continue();
  });
  page.on('response', async response => {
    if (response.url().includes('/api/v1/')) {
      console.log('RESPONSE:', response.url(), response.status());
      try {
        const text = await response.text();
        console.log('RESPONSE BODY:', text.substring(0, 300));
      } catch (e) {}
    }
  });

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
  console.log("PAGE RENDERED. Does it show No Device Telemetry? " + text.includes("No Device Telemetry"));

  await browser.close();
})();
