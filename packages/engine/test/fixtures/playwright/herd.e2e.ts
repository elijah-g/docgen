// Trimmed-down shape of emh-check's tests/animal-ui/herd.e2e.ts, used to test the Playwright
// importer against something close to a real spec: a helper sign-in call, beforeEach, chained
// locators (within/filter/nth), a checkbox, a select, an email fill (masked), a bare `test()`
// with no describe, and a couple of calls the importer can't map (press, toBeChecked).
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function signInAs(context: BrowserContext, person: string): Promise<void> {
  await fetch(`http://x/sign-in?person=${person}`, { method: 'POST' });
}

test.describe('herd list', () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, 'office');
  });

  test('ui: herd list search and filters (examples 10 to 12)', async ({ page, context }) => {
    await page.goto('/livestock/herd');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Herd list');
    const search = page.getByLabel(/^Tag number/);
    await search.fill('10');
    await search.press('Enter');
    await expect(page).toHaveURL(/q=10/);
    const exportDialog = page.getByRole('dialog', { name: 'Export Herd list' });
    await expect(exportDialog.getByRole('checkbox', { name: 'Animal ID' })).toBeChecked();
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('group', { name: 'Class' }).getByLabel('Heifer').check();
    await page.getByLabel(/^Mob/).selectOption({ label: 'Example Mob A' });
    await page.getByLabel('Contact email').fill('jordan@realcompany.com');
    await page.getByRole('row', { name: 'JUDY' }).filter({ hasText: 'active' }).first();
  });
});

test('ui: standalone test with no describe', async ({ page }) => {
  await page.goto('/livestock/mobs');
  await expect(page.getByRole('heading')).toBeVisible();
});
