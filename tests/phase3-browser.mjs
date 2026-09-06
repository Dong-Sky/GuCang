import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { startMockSupabase } from './mock-supabase.mjs';
const { chromium } = await import(pathToFileURL(process.env.GUCANG_PLAYWRIGHT_PATH).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.GUCANG_BROWSER_EXECUTABLE});
await mkdir('.local-test/phase3',{recursive:true});
try { for(const width of [390,1280]) {
 const fixture=await startMockSupabase({count:40});
 const ip=fixture.db.ips[0]; ip.aliases=['作品简称'];
 const chars=['角色甲','角色乙'].map((name,i)=>({id:`00000009-0000-0000-0000-00000000000${i}`,name,ip_id:ip.id,household_id:ip.household_id,aliases:[],deleted_at:null}));fixture.db.characters.push(...chars);
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,serviceWorkers:'block'});
 await context.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto('http://127.0.0.1:3102');
  await page.getByLabel('邮箱',{exact:true}).fill('smoke@example.test');await page.getByLabel('密码',{exact:true}).fill('local-test-password');await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('heading',{name:'本地隔离测试谷仓'}).waitFor();
  await page.getByRole('button',{name:'收藏',exact:true}).click();
  await page.getByLabel('搜索收藏').fill('作品简称');
  assert.ok(await page.locator('.item-card').count()>0);
  await page.locator('.collection-filters summary').click();
  await page.getByLabel('筛选状态',{exact:true}).selectOption('temporarily_out');
  await page.getByLabel('收藏排序').selectOption('oldest');
  await page.screenshot({path:`.local-test/phase3/filters-${width}.png`});
  await page.getByRole('button',{name:'首页',exact:true}).click();await page.getByRole('button',{name:'收藏',exact:true}).click();
  assert.equal(await page.getByLabel('收藏排序').inputValue(),'oldest');
  await page.getByRole('button',{name:'添加谷子',exact:true}).click();
  await page.getByPlaceholder('搜索或输入 IP').fill(ip.name);
  await page.getByLabel('选择已有角色',{exact:true}).selectOption('角色甲');
  await page.getByLabel('选择已有角色',{exact:true}).selectOption('角色乙');
  assert.equal(await page.getByPlaceholder('可稍后补充').inputValue(),'角色甲\n角色乙');
  await page.getByPlaceholder('例如：徽章').fill('徽章');
  await page.locator('.form-grid > label select').selectOption(fixture.db.locations[0].id);
  await page.screenshot({path:`.local-test/phase3/characters-${width}.png`});
  await page.getByRole('button',{name:'保存',exact:true}).click();await page.locator('.item-form-sheet').waitFor({state:'hidden'});
  const last=fixture.db.item_instances.at(-1);assert.equal(fixture.db.item_style_characters.filter(l=>l.item_style_id===last.item_style_id).length,2);
  await page.getByRole('button',{name:'账号菜单',exact:true}).click();await page.locator('.profile-settings').click();
  const manager=page.locator('.dictionary-manager');await manager.locator('summary').click();
  let confirmations=0;
  await page.route('**/rest/v1/rpc/manage_dictionary',async route=>{
    const body=route.request().postDataJSON();
    assert.equal(body.p_household,ip.household_id);assert.equal(body.p_source,ip.id);
    const plan={token:'local-preview-token',source:ip.name,target:body.p_name,instances:41,active:40,styles:41,children:2,series:0};
    if(!body.p_preview){assert.equal(body.p_expected,plan.token);confirmations++;ip.aliases=[ip.name,...body.p_aliases];ip.name=body.p_name;}
    await route.fulfill({contentType:'application/json',body:JSON.stringify(plan)});
  });
  await page.getByLabel('要整理的资料',{exact:true}).selectOption(ip.id);
  await page.getByLabel('统一名称',{exact:true}).fill('统一作品名');
  await page.getByRole('button',{name:'预览影响范围',exact:true}).click();
  await page.getByRole('region',{name:'资料整理确认'}).waitFor();assert.equal(confirmations,0);
  await page.getByLabel('统一名称',{exact:true}).fill('最终作品名');
  assert.equal(await page.getByRole('button',{name:'确认更新资料'}).count(),0);
  await page.getByRole('button',{name:'预览影响范围',exact:true}).click();
  await page.getByRole('region',{name:'资料整理确认'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`.local-test/phase3/dictionary-${width}.png`});
  await page.getByRole('button',{name:'确认更新资料',exact:true}).click();
  await page.getByText('资料已更新，收藏和编号保持不变。',{exact:true}).waitFor();assert.equal(confirmations,1);
  assert.equal(fixture.state().historyHash,fixture.state().initialHistoryHash);
  assert.deepEqual(errors,[]);
 } finally { await context.close();await fixture.close(); }
 console.log(`phase3 ${width} passed`);
}} finally {await browser.close();}
