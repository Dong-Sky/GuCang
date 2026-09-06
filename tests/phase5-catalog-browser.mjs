import assert from 'node:assert/strict';
import {chromium} from './browser-runtime.mjs';
import {startMockSupabase} from './mock-supabase.mjs';
const browser=await chromium.launch({headless:true,executablePath:process.env.GUCANG_BROWSER_EXECUTABLE});
try { for(const width of [390,1280]) {
 const fixture=await startMockSupabase({count:2505});
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
 try {
  const started=performance.now();
  await page.goto('http://127.0.0.1:3102');await page.getByLabel('邮箱',{exact:true}).fill('smoke@example.test');await page.getByLabel('密码',{exact:true}).fill('local-test-password');await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.locator('.home-page .item-card').first().waitFor();
  assert.equal(await page.locator('.home-page .item-card').count(),2);
  assert.match(await page.locator('.home-page').innerText(),/2504/);
  assert.ok(!fixture.metrics.requests.some(r=>r.path==='/rest/v1/item_instances'));
  const homeMs=Math.round(performance.now()-started);
  await page.getByRole('button',{name:'浏览收藏',exact:true}).click();await page.locator('.collection-page .item-card').nth(23).waitFor();
  const first=await page.locator('.collection-page .item-card').first().innerText();
  await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByText('第 25–48 项，共 2504 项',{exact:true}).waitFor();
  assert.notEqual(await page.locator('.collection-page .item-card').first().innerText(),first);
  await page.getByRole('searchbox',{name:'搜索收藏'}).fill('GC-001005');await page.getByText('GC-001005',{exact:true}).first().waitFor();
  assert.equal(await page.locator('.collection-page .item-card').count(),1);
  assert.ok(!fixture.metrics.requests.some(r=>r.path==='/rest/v1/item_instances'),'browse and search must not fetch full catalog');
  await page.locator('.collection-page .item-card').first().click();await page.getByRole('dialog',{name:'谷子详情'}).waitFor();
  assert.ok(fixture.metrics.requests.some(r=>r.path==='/rest/v1/item_instances'),'advanced detail uses complete index safely');
  assert.deepEqual(errors,[]);
  console.log(`PASS catalog ${width}: 2505 records, two recent items, remote page/search, detail handoff; local login-to-home ${homeMs}ms`);
 } finally {await context.close();await fixture.close();}
}} finally {await browser.close();}
