const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Go to home page
  await page.goto('http://127.0.0.1:3000');
  
  // Click Google login
  console.log("Clicking Google login...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const googleBtn = btns.find(b => b.innerText.includes('Google'));
    if(googleBtn) googleBtn.click();
  });
  
  // Wait for redirect to overview
  console.log("Waiting for /overview...");
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(e => console.log("Timeout waiting for nav"));
  
  console.log("Current URL:", page.url());
  
  // Go to signals
  console.log("Going to /signals...");
  await page.goto('http://127.0.0.1:3000/signals', { waitUntil: 'networkidle0' });
  
  console.log("Current URL:", page.url());
  
  // Get text
  const text = await page.evaluate(() => document.body.innerText);
  console.log("SIGNALS TEXT:", text);
  
  const token = await page.evaluate(() => localStorage.getItem('prism_token'));
  console.log("TOKEN:", token);
  
  await browser.close();
})();
