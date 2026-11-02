import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

test('320px reflow, 200% text resizing and WCAG text spacing', async ({ page }) => {
  await page.setViewportSize({width:320,height:900}); await page.goto('/');
  await page.addStyleTag({content:'html{font-size:200%} p,li,dt,dd,label,button,a{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p{margin-bottom:2em!important}'});
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Content studio',exact:true}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('Replacement text')).toBeVisible();
});
test('keyboard-only submission and route heading focus', async ({ page }) => {
  await page.goto('/');
  const studio = page.getByRole('button',{name:'Content studio',exact:true});
  for(let i=0;i<8 && !(await studio.evaluate(el=>el===document.activeElement));i++) await page.keyboard.press('Tab');
  await expect(studio).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{level:1})).toBeFocused();
  await page.getByLabel('Ticket title').focus(); await page.keyboard.type('Keyboard visit update');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(page.getByLabel('Page field')).toBeFocused();
  await page.keyboard.press('End'); await page.keyboard.press('Tab');
  await page.keyboard.type('Saturdays at noon'); await page.keyboard.press('Tab');
  await page.keyboard.type('Confirmed by the demo department owner.'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Draft ticket created');
  await expect(page.getByRole('heading',{name:'Keyboard visit update'})).toBeVisible();
});
test('native errors block incomplete requests and script input remains text', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button',{name:'Content studio',exact:true}).click();
  await page.getByRole('button',{name:'Create draft'}).click();
  expect(await page.getByLabel('Ticket title').evaluate(el=>el.validity.valueMissing)).toBe(true);
  await page.getByLabel('Ticket title').fill('<img src=x onerror=alert(1)>');
  await page.getByLabel('Replacement text').fill('   '); await page.getByLabel('Requested change').fill('Demo');
  await page.getByRole('button',{name:'Create draft'}).click(); await expect(page.getByRole('status')).toContainText('replacement text');
  await page.getByLabel('Replacement text').fill('<script>alert(1)</script>');
  await page.getByRole('button',{name:'Create draft'}).click();
  const ticket=page.locator('article').filter({hasText:'<img src=x onerror=alert(1)>'});
  await expect(ticket.locator('img,script')).toHaveCount(0);
});
test('public content and editor checklist work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({javaScriptEnabled:false}); const page=await context.newPage();
  await page.goto('http://127.0.0.1:4188/'); await expect(page.getByRole('heading',{level:1})).toContainText('Your next chapter');
  await expect(page.getByTestId('content-deadline')).toHaveText('July 1, 2027');
  await page.goto('http://127.0.0.1:4188/alpine.html'); await expect(page.getByText('Use a descriptive page title and one primary heading.')).toBeVisible();
  await context.close();
});
test('forced colors and reduced motion retain usable content', async ({ page }) => {
  await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'}); await page.goto('/');
  await expect(page.getByRole('link',{name:'Find your creative direction'})).toBeVisible();
  await page.getByRole('button',{name:'Content studio',exact:true}).click();
  await expect(page.getByLabel('Ticket title')).toBeVisible();
});
test('all rendered internal links, fragments and images resolve', async ({ page,request }) => {
  const results=[];
  for(const route of ['/','/alpine.html']) {
    await page.goto(route);
    const states=route==='/'?['program','studio']:['guide'];
    for(const state of states) {
      if(state==='studio') await page.getByRole('button',{name:'Content studio',exact:true}).click();
      const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href));
      for(const href of [...new Set(links)]) {
        const url=new URL(href); if(url.origin!=='http://127.0.0.1:4188') continue;
        if(url.hash && url.pathname===new URL(page.url()).pathname) expect(await page.locator(`[id="${decodeURIComponent(url.hash.slice(1))}"]`).count()).toBe(1);
        const response=await request.get(url.origin+url.pathname); expect(response.status(),href).toBe(200); results.push({href,status:response.status()});
      }
      expect(await page.locator('img').evaluateAll(nodes=>nodes.every(n=>n.complete&&n.naturalWidth>0))).toBe(true);
    }
  }
  await mkdir('evidence',{recursive:true}); await writeFile(`evidence/links-${test.info().project.name}.json`,JSON.stringify(results,null,2));
});
test('save raw axe results and accessibility tree for review', async ({ page }) => {
  const scans=[];
  await page.goto('/');
  for(const state of ['program','studio']) {
    if(state==='studio') await page.getByRole('button',{name:'Content studio',exact:true}).click();
    const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    scans.push({state,violations:scan.violations,incomplete:scan.incomplete,passes:scan.passes.map(p=>({id:p.id,description:p.description})),tree:await page.locator('body').ariaSnapshot()});
    expect(scan.violations).toEqual([]);
  }
  await mkdir('evidence',{recursive:true}); await writeFile(`evidence/accessibility-${test.info().project.name}.json`,JSON.stringify(scans,null,2));
});
