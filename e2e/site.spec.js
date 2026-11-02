import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
for (const width of [390, 1440]) {
  test(`program and studio accessibility at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Your next chapter');
    await expect(page.locator('.hero-photo img')).toBeVisible();
    await expect.poll(() => page.locator('.hero-photo img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    expect(JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())['@type']).toBe('CreativeWork');
    // WebKit on Windows does not include links in its default Tab cycle.
    // Explicitly focus there, then verify keyboard activation; Chromium/Firefox verify Tab discovery.
    if (browserName === 'webkit') await page.getByRole('link', { name: 'Skip to main content' }).focus();
    else await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.locator('#main')).toBeFocused();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `work/program-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Content studio', exact: true }).click();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()).violations).toEqual([]);
  });
}
test('create, review, approve, publish and reload a ticket', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Content studio', exact: true }).click();
  await page.getByLabel('Ticket title').fill('Correct library opening hours');
  await page.getByLabel('Requested change').fill('Use the approved winter schedule.');
  await page.getByLabel('Page field').selectOption('visit');
  await page.getByLabel('Replacement text').fill('Saturdays at 11 a.m.');
  await page.getByRole('button', { name: 'Create draft' }).click();
  let ticket = page.locator('article').filter({ hasText: 'Correct library opening hours' });
  for (const status of ['In review','Approved','Published']) await ticket.getByRole('button', { name: `Move to ${status}`, exact: true }).click();
  await expect(ticket.getByText('Published', { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Content studio', exact: true }).click();
  await expect(ticket.getByText('Published', { exact: true })).toBeVisible();
  await ticket.getByText('Audit history (3)').click(); await expect(ticket.getByRole('listitem')).toHaveCount(3);
  await ticket.getByRole('button', { name: 'View updated program' }).click();
  await expect(page.getByTestId('content-visit')).toHaveText('Saturdays at 11 a.m.');
});
test('unpublished deadline stays private until approval and publication', async ({ page }) => {
  await page.goto('/'); await expect(page.getByTestId('content-deadline')).toHaveText('July 1, 2027');
  await page.getByRole('button', { name: 'Content studio', exact: true }).click();
  const ticket = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Update application deadline', exact: true }) });
  await ticket.getByRole('button', { name: 'Move to In review', exact: true }).click();
  await ticket.getByRole('button', { name: 'Request changes' }).click();
  await page.getByRole('button', { name: 'Explore the program', exact: true }).click();
  await expect(page.getByTestId('content-deadline')).toHaveText('July 1, 2027');
  await page.getByRole('button', { name: 'Content studio', exact: true }).click();
  for (const status of ['In review','Approved','Published']) await ticket.getByRole('button', { name: `Move to ${status}`, exact: true }).click();
  await ticket.getByRole('button', { name: 'View updated program' }).click();
  await expect(page.getByTestId('content-deadline')).toHaveText('August 15, 2027');
  await page.reload(); await expect(page.getByTestId('content-deadline')).toHaveText('August 15, 2027');
  await page.getByRole('button', { name: 'Content studio', exact: true }).click();
  await page.screenshot({ path: 'work/studio-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset demo tickets' }).click();
  await page.getByRole('button', { name: 'Explore the program', exact: true }).click();
  await expect(page.getByTestId('content-deadline')).toHaveText('July 1, 2027');
});
test('Alpine disclosure works with keyboard and passes automated checks', async ({ page }) => {
  await page.goto('/alpine.html'); const toggle = page.getByRole('button', { name: 'Publishing checklist' });
  await expect(toggle).toHaveAttribute('aria-expanded','false'); await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded','true'); await expect(page.locator('#checklist')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()).violations).toEqual([]);
});
