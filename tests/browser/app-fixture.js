import { test as base, expect } from '@playwright/test';

export async function installSavePicker(page) {
  await page.addInitScript(() => {
    window.__fileWrites = [];
    window.showSaveFilePicker = async ({ suggestedName }) => ({ name: suggestedName, createWritable: async () => {
      const chunks = [];
      return { write: async data => { chunks.push(data); }, abort: async () => { chunks.length = 0; }, close: async () => {
        const blob = new Blob(chunks);
        window.__fileWrites.push({ name: suggestedName, blob });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = suggestedName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      } };
    } });
  });
}

export const test = base.extend({ page: async ({ page }, use) => { await installSavePicker(page); await use(page); } });
export { expect };
export async function loadSettings(page, config) {
  await page.locator('#importFile').setInputFiles({ name: 'test-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
  await expect(page.locator('#toast')).toContainText('設定を読み込みました');
}
export async function readSettings(page) {
  const count = await page.evaluate(() => window.__fileWrites.length);
  await page.locator('#saveButton').click();
  await expect.poll(() => page.evaluate(() => window.__fileWrites.length)).toBeGreaterThan(count);
  return page.evaluate(async () => JSON.parse(await window.__fileWrites.at(-1).blob.text()));
}
