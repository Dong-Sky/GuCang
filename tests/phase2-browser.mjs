import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { startMockSupabase } from './mock-supabase.mjs';
const { chromium } = await import(pathToFileURL(process.env.GUCANG_PLAYWRIGHT_PATH).href);
const fixture = await startMockSupabase();
const browser = await chromium.launch({headless:true,executablePath:process.env.GUCANG_BROWSER_EXECUTABLE});
await mkdir('.local-test/phase2',{recursive:true});
try {
  for (const width of [390,1280]) {
    const context = await browser.newContext({viewport:{width,height:844},hasTouch:true,serviceWorkers:'block'});
    await context.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:3102');
    await page.getByLabel('邮箱',{exact:true}).fill('smoke@example.test');
    await page.getByLabel('密码',{exact:true}).fill('local-test-password');
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.getByRole('heading',{name:'本地隔离测试谷仓'}).waitFor();
    await page.getByRole('button',{name:'位置',exact:true}).click();
    await page.getByRole('button',{name:/测试收纳盒/}).click();
    await page.getByRole('button',{name:'添加谷子到这里'}).click();
    const form=page.locator('.item-form-sheet');
    assert.equal(await form.locator('.form-grid > label select').inputValue(),fixture.db.locations[0].id);
    await page.getByPlaceholder('搜索或输入 IP').fill('连续测试IP');
    await page.getByPlaceholder('例如：徽章').fill('连续测试品类');
    const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=200;c.getContext('2d').fillRect(0,0,200,200);return c.toDataURL().split(',')[1];});
    await page.locator('#item-photo-gallery').setInputFiles({name:'entry.png',mimeType:'image/png',buffer:Buffer.from(photo,'base64')});
    await page.locator('.photo-preview').first().waitFor();
    const count=fixture.db.item_instances.length;
    await page.getByRole('button',{name:'保存并继续',exact:true}).click();
    await page.getByText('上一件已保存，现在录入新的一件。照片和编号已重置。',{exact:true}).waitFor();
    assert.equal(fixture.db.item_instances.length,count+1);
    assert.equal(await page.getByPlaceholder('搜索或输入 IP').inputValue(),'连续测试IP');
    assert.equal(await page.locator('.photo-preview').count(),0);
    const newFirst=fixture.db.item_instances.at(-1);
    await page.screenshot({path:`.local-test/phase2/entry-${width}.png`});
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await form.waitFor({state:'hidden'});
    assert.equal(fixture.db.item_instances.length,count+2);
    assert.notEqual(fixture.db.item_instances.at(-1).id,newFirst.id);
    assert.notEqual(fixture.db.item_instances.at(-1).inventory_code,newFirst.inventory_code);
    assert.equal(fixture.db.item_images.filter(i=>i.item_style_id===fixture.db.item_instances.at(-1).item_style_id).length,0);
    await page.getByRole('button',{name:'收藏',exact:true}).click();
    await page.getByRole('button',{name:'批量整理',exact:true}).click();
    const batch=page.locator('.batch-sheet');
    await batch.getByLabel('搜索批量收藏').fill('GC-000003');
    await batch.getByRole('button',{name:'选择本页',exact:true}).click();
    await batch.locator('.batch-action-fields select').first().selectOption('location');
    await batch.getByLabel('批量填入内容').selectOption(fixture.db.locations[0].id);
    await batch.getByRole('button',{name:'预览修改',exact:true}).click();
    await page.screenshot({path:`.local-test/phase2/batch-${width}.png`});
    if(width===390){
      await batch.getByRole('button',{name:'确认执行',exact:true}).click();
      await batch.getByRole('button',{name:'完成',exact:true}).waitFor();
      assert.equal(fixture.db.item_instances[2].current_location_id,fixture.db.locations[0].id);
      await batch.getByRole('button',{name:'完成',exact:true}).click();
    } else {assert.equal(await batch.getByRole('button',{name:'确认执行',exact:true}).isDisabled(),true);await batch.getByRole('button',{name:'关闭',exact:true}).click();}
    await batch.waitFor({state:'hidden'});
    // Start at a destination, select existing items from the entire household.
    await page.getByRole('button',{name:'位置',exact:true}).click();
    await page.getByRole('button',{name:/测试收纳盒/}).click();
    await page.getByRole('button',{name:'已有谷子移到这里',exact:true}).click();
    assert.equal(await batch.getByLabel('批量填入内容').inputValue(),fixture.db.locations[0].id);
    assert.equal(await batch.getByLabel('批量填入内容').isDisabled(),true);
    await batch.getByLabel('搜索批量收藏').fill('GC-000010');
    await batch.getByRole('button',{name:'选择本页',exact:true}).click();
    await batch.getByRole('button',{name:'预览修改',exact:true}).click();
    assert.match(await batch.locator('.batch-result').innerText(),/→/);
    await page.screenshot({path:`.local-test/phase2/move-${width}.png`});
    if(width===390){
      const oldHome=fixture.db.item_instances[9].home_location_id;
      await batch.getByRole('button',{name:'确认执行',exact:true}).click();
      await batch.getByRole('button',{name:'完成',exact:true}).waitFor();
      assert.equal(fixture.db.item_instances[9].current_location_id,fixture.db.locations[0].id);
      assert.equal(fixture.db.item_instances[9].physical_status,'stored');
      assert.equal(fixture.db.item_instances[9].home_location_id,oldHome);
      await batch.getByRole('button',{name:'完成',exact:true}).click();
    } else {assert.equal(await batch.getByRole('button',{name:'确认执行',exact:true}).isDisabled(),true);await batch.getByRole('button',{name:'关闭',exact:true}).click();}
    await batch.waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await context.close();
    console.log(`PASS phase2 ${width}: from-location, continue/new identity/no copied photos, batch selection/preview/fill/no overwrite`);
  }
} finally {await browser.close();await fixture.close();}
