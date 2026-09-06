import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {startMockSupabase} from './mock-supabase.mjs';
const {chromium}=await import(pathToFileURL(process.env.GUCANG_PLAYWRIGHT_PATH).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.GUCANG_BROWSER_EXECUTABLE});
try{for(const width of [390,1280]){
 const fixture=await startMockSupabase({count:2}),context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();let prepareCalls=0,removes=0,fail=true;const jobs=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(!['localhost','127.0.0.1'].includes(url.hostname)&&!['data:','blob:'].includes(url.protocol))return route.abort();
  if(url.pathname.includes('/rpc/')&&url.pathname.includes('maintenance')){const name=url.pathname.split('/').at(-1),args=request.postDataJSON();if(name==='prepare_maintenance'){prepareCalls++;jobs.push({id:'job',household_id:args.target_household,paths:[`households/${args.target_household}/expired.webp`],removed_instances:1,status:'pending',attempts:0,last_error:null});}if(name==='record_maintenance_attempt'){jobs[0].status=args.succeeded?'done':'failed';jobs[0].last_error=args.error_text;jobs[0].attempts++;}return route.fulfill({json:name==='list_maintenance'?jobs:null});}
  if(request.method()==='DELETE'&&url.pathname.startsWith('/storage/')){removes++;return route.fulfill({status:fail?503:200,json:fail?{message:'模拟断网'}:[]});}return route.continue();
 });
 try{
  await page.goto('http://127.0.0.1:3102');await page.getByLabel('邮箱',{exact:true}).fill('smoke@example.test');await page.getByLabel('密码',{exact:true}).fill('local-test-password');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'账号菜单'}).click();await page.locator('.profile-settings').click();assert.equal(prepareCalls,0);assert.equal(removes,0);
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'清理到期回收站',exact:true}).click();assert.equal(prepareCalls,0);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'清理到期回收站',exact:true}).click();await page.getByText('失败，可重试',{exact:false}).waitFor();assert.equal(removes,1);
  fail=false;await page.getByRole('button',{name:'重试未完成图片',exact:true}).click();await page.getByText('已完成 · 1 件',{exact:false}).waitFor();assert.equal(removes,2);assert.equal(prepareCalls,1);assert.deepEqual(errors,[]);console.log('PASS maintenance '+width+': no startup deletion, cancel, failure, retry');
 }finally{await context.close();await fixture.close();}
}}finally{await browser.close();}
