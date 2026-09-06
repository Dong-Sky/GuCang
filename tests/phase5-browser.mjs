import assert from 'node:assert/strict';
import {chromium} from './browser-runtime.mjs';
import {startMockSupabase} from './mock-supabase.mjs';
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
const browser=await chromium.launch({headless:true,executablePath:process.env.GUCANG_BROWSER_EXECUTABLE});
try{for(const width of [390,1280]){const fixture=await startMockSupabase({count:2});for(const r of fixture.db.item_images){r.file_size_bytes=0;r.thumbnail_size_bytes=0;}
const ctx=await browser.newContext({viewport:{width,height:844},acceptDownloads:true,serviceWorkers:'block'});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
try{await page.goto('http://127.0.0.1:3102');await page.getByLabel('邮箱',{exact:true}).fill('smoke@example.test');await page.getByLabel('密码',{exact:true}).fill('local-test-password');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'账号菜单'}).click();await page.locator('.profile-settings').click();
const baseline=JSON.stringify(fixture.db);const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'生成新的 ZIP 备份'}).click();const file=await downloaded;assert.match(file.suggestedFilename(),/complete/);const input=page.locator('.backup-panel input[type=file]');await input.setInputFiles(await file.path());await page.getByText('完整性校验通过',{exact:false}).waitFor();
const householdId=fixture.db.households[0].id,data=JSON.stringify({version:2,householdId,capturedAt:'2026-09-06',tables:{}}),bad=new JSZip();bad.file('data.json',data);bad.file('backup_manifest.json',JSON.stringify({version:2,householdId,complete:true,missing:[],checksums:{'data.json':createHash('sha256').update(data).digest('hex')}}));
await input.setInputFiles({name:'incomplete.zip',mimeType:'application/zip',buffer:await bad.generateAsync({type:'nodebuffer'})});await page.getByRole('alert').filter({hasText:'必需数据表'}).waitFor();assert.equal(await page.getByText('完整性校验通过',{exact:false}).count(),0);
await input.setInputFiles(await file.path());await page.getByText('完整性校验通过',{exact:false}).waitFor();assert.equal(await page.locator('.backup-panel').getByRole('alert').count(),0);
assert.equal(JSON.stringify(fixture.db),baseline);assert.deepEqual(errors,[]);console.log('PASS phase5 '+width+': ZIP download, roundtrip, malformed ZIP rejection, recovery, no database writes');}
finally{await ctx.close();await fixture.close();}}}finally{await browser.close();}
