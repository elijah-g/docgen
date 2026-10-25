import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<div id="x">hi</div>`);
const loc = page.locator("#x");
console.log(await loc.evaluate("(el) => el.id"));
console.log(await loc.evaluate("el => el.id"));
console.log(await loc.evaluate((el) => el.id));
