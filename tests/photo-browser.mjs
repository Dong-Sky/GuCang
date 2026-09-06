// Local mock only. No production credentials or data are used.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { startMockSupabase } from './mock-supabase.mjs';
const { chromium } = await import(pathToFileURL(process.env.GUCANG_PLAYWRIGHT_PATH).href);
const fixture = await startMockSupabase();
const browser = await chromium.launch({headless:true, executablePath:process.env.GUCANG_BROWSER_EXECUTABLE});
await mkdir('.local-test', {recursive:true});
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({viewport:{width,height:900},hasTouch:true,serviceWorkers:'block'});
    await context.route('**/*', route => {
      const u=new URL(route.request().url());
      return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();
    });
    const page = await context.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.goto(process.env.GUCANG_TEST_URL ?? 'http://127.0.0.1:3100');
    await page.getByLabel('邮箱',{exact:true}).fill('smoke@example.test');
    await page.getByLabel('密码',{exact:true}).fill('local-test-password');
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.getByRole('heading',{name:'本地隔离测试谷仓'}).waitFor();
    await page.getByRole('button',{name:'添加谷子',exact:true}).click();
    const photos=await page.evaluate(()=>['red','green','blue','orange'].map((color,i)=>{
      const c=document.createElement('canvas');c.width=300;c.height=400;
      const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,300,400);
      return {name:`photo-${i}.png`,data:c.toDataURL('image/png').split(',')[1]};
    }));
    const files=photos.map(p=>({name:p.name,mimeType:'image/png',buffer:Buffer.from(p.data,'base64')}));
    const input=page.locator('#item-photo-gallery');
    await input.setInputFiles(files);
    await page.getByText('最多3张，超出的照片未添加').waitFor();
    assert.equal(await page.locator('.photo-preview').count(),3);
    for(let i=1;i<=3;i++) {
      const box=await page.getByRole('button',{name:`移除新照片 ${i}`}).boundingBox();
      assert.ok(box.width>=44&&box.height>=44);
    }
    await page.getByRole('button',{name:'移除新照片 2'}).click();
    await page.locator('.photo-preview').nth(2).waitFor({state:'hidden'});
    assert.equal(await page.locator('.photo-preview').count(),2);
    await input.setInputFiles(files[0]);
    await page.getByText(/已选择，未重复添加/).waitFor();
    assert.equal(await page.locator('.photo-preview').count(),2);
    await input.setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('broken')});
    await page.getByText(/broken.jpg 无法读取/).waitFor();
    assert.equal(await page.locator('.photo-preview').count(),2);
    await input.setInputFiles(files[1]);
    await page.getByText('已选满3张；可移除新选照片后重新添加。').waitFor();
    const names = () => page.locator('.photo-open img').evaluateAll(nodes => nodes.map(node => node.alt));
    const source = await page.getByRole('button',{name:'拖动照片 3 排序'}).boundingBox();
    const destination = await page.locator('.photo-preview').first().boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(destination.x + destination.width / 2, destination.y + 30, {steps:12});
    await page.mouse.up();
    await page.getByText('照片已移到第 1 位',{exact:true}).waitFor();
    assert.deepEqual(await names(), ['photo-1.png','photo-0.png','photo-2.png']);
    await page.getByRole('button',{name:'照片 1 向右移动'}).click();
    await page.getByText('照片已移到第 2 位',{exact:true}).waitFor();
    assert.deepEqual(await names(), ['photo-0.png','photo-1.png','photo-2.png']);
    const touch = await context.newCDPSession(page);
    const grip = await page.getByRole('button',{name:'拖动照片 2 排序'}).boundingBox();
    const drop = await page.locator('.photo-preview').first().boundingBox();
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:grip.x+grip.width/2,y:grip.y+22}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:drop.x+drop.width/2,y:drop.y+30}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.getByText('照片已移到第 1 位',{exact:true}).waitFor();
    assert.deepEqual(await names(), ['photo-1.png','photo-0.png','photo-2.png']);
    await touch.detach();
    await page.getByRole('button',{name:'预览新照片 3'}).click();
    await page.getByRole('button',{name:'关闭预览'}).click();
    await page.screenshot({path:`.local-test/photos-add-${width}.png`});
    await page.locator('.optional-name summary').click();
    const title=`多图测试-${width}`;
    await page.getByLabel(/款式名称/).fill(title);
    await page.getByLabel(/^IP/).fill('测试作品');
    await page.getByLabel(/^品类/).fill('徽章');
    await page.getByLabel(/当前位置/).selectOption({label:'测试收纳盒'});
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.add-sheet').waitFor({state:'hidden'});
    const style = fixture.db.item_styles.find(row => row.name === title);
    assert.ok(style);
    const saved = fixture.db.item_images.filter(row => row.item_style_id === style.id).sort((a,b)=>a.sort_order-b.sort_order);
    assert.equal(saved.length,3);
    const channels = [];
    for (const row of saved) {
      const stored = fixture.files.get(row.detail_path);
      const rgb = await page.evaluate(async data => {
        const img = new Image(); img.src=data; await img.decode();
        const c=document.createElement('canvas');c.width=1;c.height=1;
        const ctx=c.getContext('2d');ctx.drawImage(img,0,0,1,1);
        return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3);
      }, `data:${stored.type};base64,${stored.bytes.toString('base64')}`);
      channels.push(rgb.indexOf(Math.max(...rgb)));
    }
    assert.deepEqual(channels,[1,0,2], 'saved order must be green, red, blue after sorting');
    await page.locator('.item-card').filter({hasText:title}).first().click();
    await page.getByRole('button',{name:'查看照片 3',exact:true}).click();
    await page.getByText('3 / 3',{exact:true}).waitFor();
    await page.getByRole('button',{name:'下一张照片',exact:true}).click();
    await page.getByText('1 / 3',{exact:true}).waitFor();
    const main=page.locator('.gallery-main');
    await main.dispatchEvent('pointerdown',{clientX:200,clientY:200,pointerId:1});
    await main.dispatchEvent('pointerup',{clientX:100,clientY:203,pointerId:1});
    await page.getByText('2 / 3',{exact:true}).waitFor();
    await main.dispatchEvent('pointerdown',{clientX:20,clientY:200,pointerId:1});
    await main.dispatchEvent('pointerup',{clientX:160,clientY:203,pointerId:1});
    await page.getByText('2 / 3',{exact:true}).waitFor();
    await page.getByRole('button',{name:'放大照片',exact:true}).click();
    await page.getByRole('dialog',{name:'查看大图',exact:true}).waitFor();
    await page.getByRole('button',{name:'查看照片 3',exact:true}).click();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog',{name:'查看大图',exact:true}).waitFor({state:'hidden'});
    await page.getByRole('dialog',{name:'谷子详情',exact:true}).waitFor();
    await page.screenshot({path:`.local-test/photos-detail-${width}.png`});
    await page.getByRole('button',{name:'编辑',exact:true}).click();
    await page.locator('.gallery-thumbnails button').nth(2).waitFor();
    assert.equal(await page.locator('.gallery-thumbnails button').count(),3);
    await page.getByRole('button',{name:'查看照片 2',exact:true}).click();
    await page.getByText('2 / 3',{exact:true}).waitFor();
    await page.getByRole('button',{name:'取消',exact:true}).click();
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`PASS ${width}px: 3 photos, remove/re-add, duplicate, invalid, overflow, save, gallery, swipe, edge exclusion, enlarge, edit`);
  }
} finally {await browser.close();await fixture.close();}
