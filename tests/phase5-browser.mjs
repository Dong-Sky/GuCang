import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {startMockSupabase} from './mock-supabase.mjs';
const {chromium}=await import(pathToFileURL(process.env.GUCANG_PLAYWRIGHT_PATH).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.GUCANG_BROWSER_EXECUTABLE});
try{for(const width of [390,1280]){const fixture=await startMockSupabase({count:2});for(const r of fixture.db.item_images){r.file_size_bytes=0;r.thumbnail_size_bytes=0;}
const ctx=await browser.newContext({viewport:{width,height:844},acceptDownloads:true,serviceWorkers:'block'});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
try{await page.goto('http://127.0.0.1:3102');await page.getByLabel('邮箱',{exact:true}).fill('smoke@example.test');await page.getByLabel('密码',{exact:true}).fill('local-test-password');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'账号菜单'}).click();await page.locator('.profile-settings').click();
const baseline=JSON.stringify(fixture.db);const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'生成新的 ZIP 备份'}).click();const file=await downloaded;assert.match(file.suggestedFilename(),/complete/);await page.locator('.backup-panel input[type=file]').setInputFiles(await file.path());await page.getByText('完整性校验通过',{exact:false}).waitFor();assert.equal(JSON.stringify(fixture.db),baseline);assert.deepEqual(errors,[]);console.log('PASS phase5 '+width+': ZIP download, roundtrip verification and diff, no database writes');}
finally{await ctx.close();await fixture.close();}}}finally{await browser.close();}
