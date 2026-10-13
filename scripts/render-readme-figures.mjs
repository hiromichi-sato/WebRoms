import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [name, height] of [['readme-workflow', 500], ['readme-architecture', 470], ['readme-files', 390]]) {
    const page = await browser.newPage({ viewport: { width: 1200, height }, deviceScaleFactor: 1 });
    await page.goto(new URL(`../docs/images/${name}.svg`, import.meta.url).href); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: fileURLToPath(new URL(`../docs/images/${name}.png`, import.meta.url)) }); await page.close();
    console.log(`Rendered ${name}`);
  }
} finally { await browser.close(); }
