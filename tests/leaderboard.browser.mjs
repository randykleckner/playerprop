// Run with PLAYWRIGHT_MODULE pointing to a locally installed Playwright ESM entry.
// All statistics here are UI fixtures, never production data.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve('public');
const server=createServer(async(req,res)=>{
 try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error();const data=await readFile(file);res.writeHead(200,{'content-type':{'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',route=>route.abort());
 const leaders=['QB','RB','WR','TE','DST'].map((position,i)=>({position,playerId:position==='DST'?null:`fixture-${i}`,gameId:'fixture-game',teamId:'CHI',team:'CHI',name:['Fixture Quarterback','Fixture Running Back','Fixture Receiver','Fixture Tight End','Chicago Bears'][i],fantasyPoints:37.26-i*3,playerImage:null,teamLogo:null}));
 let fail=false;
 await page.route('**/api/leaderboard?*',async route=>{const url=new URL(route.request().url()),season=Number(url.searchParams.get('season')||2026),week=Number(url.searchParams.get('week')||1);await route.fulfill({status:fail?503:200,json:{season,week,status:week===1?'ready':'pending',available:[{season:2026,week:1},{season:2025,week:1}],dataSource:'database',scoringComplete:false,missingPositions:['DST'],leaders:leaders.slice(0,4),hero:{...leaders[0],image:{url:null,kind:'team',focalX:25,focalY:40}}}});});
 await page.goto(`http://127.0.0.1:${server.address().port}/leaderboard/`);
 await page.locator('#workspace[aria-busy="false"]').waitFor();
 assert.equal(await page.locator('.leader-row').count(),5);assert.match(await page.locator('#leaderboard-basis').innerText(),/TURNOVER DATA MISSING/);assert.equal(await page.locator('.leader-missing').count(),1);assert.equal(await page.locator('nav a[aria-current="page"]').innerText(),'Leaderboard\nWeekly fantasy finishes');
 assert.equal(await page.locator('#results-title').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
 assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(8, 24, 43)');
 await page.screenshot({path:'/tmp/leaderboard-desktop.png',fullPage:true});
 await page.selectOption('#leaderboard-week','2');await page.locator('#workspace[aria-busy="false"]').waitFor();assert.match(await page.locator('#results-title').innerText(),/RESULTS\s+PENDING/);assert.match(page.url(),/week=2/);
 await page.goBack();await page.locator('#workspace[aria-busy="false"]').waitFor();assert.equal(await page.locator('.leader-row').count(),5);
 await page.selectOption('#leaderboard-season','2025');await page.locator('#workspace[aria-busy="false"]').waitFor();assert.match(page.url(),/season=2025/);
 for(const width of [768,390,320]){
  await page.setViewportSize({width,height:900});await page.screenshot({path:`/tmp/leaderboard-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow at ${width}`);
  const hero=await page.locator('#weekly-hero').boundingBox(),rows=await page.locator('.weekly-results').boundingBox();assert.ok(rows.y>=hero.y+hero.height,'hero precedes results');
 }
 fail=true;await page.selectOption('#leaderboard-week','3');await page.locator('#leaderboard-retry').waitFor();assert.equal(await page.locator('.leader-row').count(),0);
 fail=false;await page.click('#leaderboard-retry');await page.locator('#workspace[aria-busy="false"]').waitFor();assert.match(await page.locator('#results-title').innerText(),/PENDING/);
 assert.deepEqual(errors,[]);console.log('Browser checks passed: desktop, 768/390/320px, navigation, selectors, history, pending, errors, retry; screenshots in /tmp/leaderboard-*.png');
}finally{await browser.close();server.close();}
