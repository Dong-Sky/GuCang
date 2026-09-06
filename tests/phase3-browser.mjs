import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
import { mkdir } from 'node:fs/promises';
import { startMockSupabase } from './mock-supabase.mjs';
const browser=await chromium.launch({headless:true,executablePath:process.env.GUCANG_BROWSER_EXECUTABLE});
await mkdir('.local-test/phase3',{recursive:true});
try { for(const width of [390,1280]) {
 const fixture=await startMockSupabase({count:40});
 const ip=fixture.db.ips[0];
 const chars=['角色甲','角色乙'].map((name,i)=>({id:`00000009-0000-0000-0000-00000000000${i}`,name,ip_id:ip.id,household_id:ip.household_id,aliases:[],deleted_at:null}));fixture.db.characters.push(...chars);
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,serviceWorkers:'block'});
 await context.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto('http://127.0.0.1:3102');
  await page.getByLabel('邮箱',{exact:true}).fill('smoke@example.test');await page.getByLabel('密码',{exact:true}).fill('local-test-password');await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('heading',{name:'本地隔离测试谷仓'}).waitFor();
  await page.getByRole('button',{name:'收藏',exact:true}).click();
  await page.getByLabel('搜索收藏').fill(ip.name);
  assert.ok(await page.locator('.item-card').count()>0);
  await page.locator('.collection-filters summary').click();
  await page.getByLabel('筛选状态',{exact:true}).selectOption('temporarily_out');
  await page.getByLabel('收藏排序').selectOption('oldest');
  await page.screenshot({path:`.local-test/phase3/filters-${width}.png`});
  await page.getByRole('button',{name:'首页',exact:true}).click();await page.getByRole('button',{name:'收藏',exact:true}).click();
  assert.equal(await page.getByLabel('收藏排序').inputValue(),'oldest');
  await page.getByRole('button',{name:'添加谷子',exact:true}).click();
  await page.getByPlaceholder('搜索或输入 IP').fill(ip.name);
  assert.equal(await page.locator('.character-picker').count(),0);
  assert.equal(await page.getByPlaceholder('可稍后补充').evaluate(el=>el.tagName),'INPUT');
  await page.getByPlaceholder('可稍后补充').fill('角色甲');
  await page.getByPlaceholder('例如：徽章').fill('徽章');
  await page.locator('.form-grid select').selectOption(fixture.db.locations[0].id);
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.locator('.item-form-sheet').waitFor({state:'hidden'});
  const last=fixture.db.item_instances.at(-1);
  assert.equal(fixture.db.item_style_characters.filter(l=>l.item_style_id===last.item_style_id).length,1);
  await page.getByRole('button',{name:'账号菜单',exact:true}).click();await page.locator('.profile-settings').click();
  assert.equal(await page.locator('.dictionary-manager').count(),0);
  assert.equal(fixture.state().historyHash,fixture.state().initialHistoryHash);
  assert.deepEqual(errors,[]);
 } finally { await context.close();await fixture.close(); }
 console.log(`phase3 ${width} passed`);
}} finally {await browser.close();}
