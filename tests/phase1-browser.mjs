// Isolated browser regression: all non-local requests are blocked.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { startMockSupabase } from './mock-supabase.mjs';
const { chromium } = await import(pathToFileURL(process.env.GUCANG_PLAYWRIGHT_PATH).href);
const fixture = await startMockSupabase();
const deletedLocation = {...fixture.db.locations[0],id:'50000000-0000-4000-8000-000000000002',name:'恢复测试位置',deleted_at:new Date().toISOString()};
fixture.db.locations.push(deletedLocation);
fixture.db.item_styles.at(-1).notes='第一阶段备注：保留换行\n第二行';
for(let i=0;i<12;i++) fixture.db.movement_events.push({id:`history-${i}`,household_id:fixture.db.households[0].id,item_instance_id:fixture.db.item_instances.at(-1).id,actor_id:fixture.db.profiles[0].id,created_at:new Date(Date.UTC(2026,8,1,0,i)).toISOString(),from_location_id:null,to_location_id:fixture.db.locations[0].id,from_status:'unknown',to_status:'stored',action_type:'move',note:null,reverses_event_id:null});
const browser = await chromium.launch({headless:true, executablePath:process.env.GUCANG_BROWSER_EXECUTABLE});
await mkdir('.local-test/phase1', {recursive:true});
try {
  for (const width of [390,1280]) {
    const context = await browser.newContext({viewport:{width,height:844},hasTouch:true,serviceWorkers:'block'});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return ['127.0.0.1','localhost'].includes(url.hostname)||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();
    });
    const page = await context.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:3102');
    await page.getByLabel('邮箱',{exact:true}).fill('smoke@example.test');
    await page.getByLabel('密码',{exact:true}).fill('local-test-password');
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.getByRole('heading',{name:'本地隔离测试谷仓'}).waitFor();
    if(width===390) {
      await page.locator('.item-card').first().click();
      await page.getByText('第一阶段备注：保留换行\n第二行',{exact:true}).waitFor();
      await page.getByRole('button',{name:'更早记录',exact:true}).click();
      await page.getByRole('button',{name:'较新记录',exact:true}).waitFor();
      await page.screenshot({path:'.local-test/phase1/history-390.png'});
      await page.getByRole('button',{name:'关闭',exact:true}).click();
    }
    await page.getByRole('button',{name:'添加谷子',exact:true}).click();
    await page.getByPlaceholder('搜索或输入 IP').fill('草稿回归作品');
    const photo = await page.evaluate(()=>{
      const c=document.createElement('canvas'); c.width=300;c.height=400;
      c.getContext('2d').fillRect(0,0,300,400);return c.toDataURL().split(',')[1];
    });
    await page.locator('#item-photo-gallery').setInputFiles({name:'draft.png',mimeType:'image/png',buffer:Buffer.from(photo,'base64')});
    await page.locator('.photo-preview').first().waitFor();
    await page.getByText('草稿已保留在本机',{exact:true}).waitFor();
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('button',{name:'添加谷子',exact:true}).click();
    await page.getByRole('button',{name:'继续草稿',exact:true}).waitFor();
    const continueBox=await page.getByRole('button',{name:'继续草稿',exact:true}).boundingBox();
    const discardBox=await page.getByRole('button',{name:'放弃草稿，重新填写',exact:true}).boundingBox();
    assert.ok(continueBox.height>=48 && discardBox.height>=48,'draft touch targets');
    if(width<700) {
      assert.ok(discardBox.y-(continueBox.y+continueBox.height)>=11,'mobile draft action gap');
      assert.ok(Math.abs(continueBox.width-discardBox.width)<1,'equal mobile widths');
    } else assert.ok(discardBox.x-(continueBox.x+continueBox.width)>=11,'desktop draft action gap');
    await page.screenshot({path:`.local-test/phase1/draft-choice-${width}.png`});
    await page.getByRole('button',{name:'继续草稿',exact:true}).click();
    assert.equal(await page.getByPlaceholder('搜索或输入 IP').inputValue(),'草稿回归作品');
    assert.equal(await page.locator('.photo-preview').count(),1);
    await page.screenshot({path:`.local-test/phase1/draft-${width}.png`});
    await page.reload();
    await page.getByRole('heading',{name:'本地隔离测试谷仓'}).waitFor();
    await page.getByRole('button',{name:'添加谷子',exact:true}).click();
    await page.getByRole('button',{name:'继续草稿',exact:true}).click();
    assert.equal(await page.getByPlaceholder('搜索或输入 IP').inputValue(),'草稿回归作品');
    assert.equal(await page.locator('.photo-preview').count(),1);
    const countBefore=fixture.db.item_instances.length;
    await fetch('http://127.0.0.1:54339/__test/fail-next-upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({count:1})});
    await page.getByRole('button',{name:'保存为待完善',exact:true}).click();
    await page.locator('.save-error').waitFor();
    assert.equal(fixture.db.item_instances.length,countBefore+1);
    await page.reload();
    await page.getByRole('heading',{name:'本地隔离测试谷仓'}).waitFor();
    await page.getByRole('button',{name:'添加谷子',exact:true}).click();
    await page.getByRole('button',{name:'继续草稿',exact:true}).click();
    await page.getByRole('button',{name:'保存为待完善',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(fixture.db.item_instances.length,countBefore+1,'refresh/retry must reuse the existing instance');
    await page.getByRole('button',{name:'添加谷子',exact:true}).click();
    await page.getByPlaceholder('搜索或输入 IP').waitFor();
    assert.equal(await page.getByPlaceholder('搜索或输入 IP').inputValue(),'');
    await page.getByRole('button',{name:'取消',exact:true}).click();
    const nav=width<600?page.getByRole('navigation',{name:'移动端主导航'}):page.getByRole('navigation',{name:'主导航',exact:true});
    await nav.getByRole('button',{name:'收藏',exact:true}).click();
    await page.getByRole('button',{name:'列表',exact:true}).click();
    await page.getByRole('button',{name:'下一页',exact:true}).click();
    await nav.getByRole('button',{name:'首页',exact:true}).click();
    await nav.getByRole('button',{name:'收藏',exact:true}).click();
    assert.match(await page.locator('.pagination-controls').innerText(),/2\s*\//);
    await page.screenshot({path:`.local-test/phase1/browse-${width}.png`});
    await nav.getByRole('button',{name:/^待办/}).click();
    await page.getByRole('tab',{name:/回收站/}).click();
    await page.getByRole('heading',{name:'已删除位置',exact:true}).waitFor();
    if(width===390) {
      await page.getByRole('button',{name:'恢复位置',exact:true}).click();
      await page.getByText('位置已恢复，原层级保持不变',{exact:true}).waitFor();
      assert.equal(fixture.db.locations.find(row=>row.id===deletedLocation.id).deleted_at,null);
    }
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`PASS phase1 ${width}: persisted photo draft, cancel/reopen, reload, save clears, list/page memory, recovery UI, no runtime errors`);
  }
} finally {await browser.close(); await fixture.close();}
