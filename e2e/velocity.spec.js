import { test, expect } from '@playwright/test';
test('structured content renders through real Java Velocity and persists XML', async ({page}) => {
  await page.goto('http://127.0.0.1:4192/');
  await expect(page.getByRole('heading',{name:'Velocity Content Lab'})).toBeVisible();
  await page.getByLabel('Program title').fill('Accessible Media & Design');
  await page.getByLabel('Introduction').fill('Reviewed content for a fictional department.');
  await page.getByLabel('Features (one per line)').fill('Semantic HTML\nKeyboard-first workflows');
  await page.getByRole('button',{name:'Save XML and render Velocity preview'}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Accessible Media & Design');
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.goto('http://127.0.0.1:4192/preview');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Accessible Media & Design');
  await page.screenshot({path:`evidence/velocity-lab-${test.info().project.name}.png`,fullPage:true});
});
