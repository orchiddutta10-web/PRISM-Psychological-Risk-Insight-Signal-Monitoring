const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' }).catch(console.error);
  const text = await page.evaluate(() => document.body.innerText).catch(() => 'err');
  console.log('HOME:', text.substring(0, 50));
  await browser.close();
})();
