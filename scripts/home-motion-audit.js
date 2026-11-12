/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI consumes this function expression. */
async page => {
 const errors=[],outbound=[],results=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(url.hostname)){outbound.push(url.origin);return route.abort('blockedbyclient')}return route.continue()});
 const pixels=()=>page.locator('.home-grass-canvas').evaluate(canvas=>{const ctx=canvas.getContext('2d');const values=ctx.getImageData(0,0,canvas.width,canvas.height).data;let hash=0,painted=0;for(let i=0;i<values.length;i+=16){hash=(hash*31+values[i]+values[i+1]*3+values[i+3])|0;if(values[i+3])painted++}return{hash,painted,width:canvas.width,height:canvas.height}});
 for(const width of [320,390,768,1440]){
   await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width,height:900});await page.goto('http://localhost:3000/',{waitUntil:'domcontentloaded'});
   await page.locator('.home-title-word').first().waitFor();await page.waitForTimeout(1800);
   await page.locator('.home-category-grid').scrollIntoViewIfNeeded();await page.waitForTimeout(1300);
   if(await page.locator('.home-category-card').first().evaluate(el=>Number(getComputedStyle(el).opacity))<.95)throw new Error('Category reveal remains hidden at '+width);
   await page.locator('.home-motion-ribbon').scrollIntoViewIfNeeded();await page.waitForTimeout(150);const track=await page.locator('.home-motion-track').evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(180);if(track===await page.locator('.home-motion-track').evaluate(el=>getComputedStyle(el).transform))throw new Error('Motion ribbon is static at '+width);
   await page.locator('footer').scrollIntoViewIfNeeded();await page.waitForTimeout(350);const first=await pixels();if(!first.painted)throw new Error('Grass not drawn at '+width);
   const box=await page.locator('footer').boundingBox();await page.mouse.move(box.x+width*.2,box.y+Math.min(box.height-40,180));await page.mouse.move(box.x+width*.8,box.y+Math.min(box.height-40,180),{steps:12});await page.waitForTimeout(150);const after=await pixels();if(first.hash===after.hash)throw new Error('Grass does not animate at '+width);
   await page.getByRole('button',{name:'Pause homepage animations',exact:true}).click();await page.waitForTimeout(120);const paused=await pixels();await page.mouse.move(box.x+20,box.y+150,{steps:10});await page.waitForTimeout(200);if(paused.hash!==(await pixels()).hash)throw new Error('Paused grass keeps moving at '+width);
   if(await page.locator('footer a[href="/privacy"]').count()!==1)throw new Error('Footer privacy link missing');
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('Horizontal overflow at '+width);
   const clipped=await page.locator('footer a,footer button').evaluateAll(elements=>elements.filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&(rect.right>innerWidth+1||rect.left< -1)}).map(element=>element.textContent));if(clipped.length)throw new Error('Footer controls clipped at '+width+': '+clipped.join(','));
   await page.screenshot({path:'output/playwright/home-grass-'+width+'.png'});
   await page.getByRole('button',{name:'Resume homepage animations',exact:true}).click();await page.waitForTimeout(250);if(paused.hash===(await pixels()).hash)throw new Error('Grass does not resume at '+width);
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(180);const reduced=await pixels();await page.waitForTimeout(200);if(reduced.hash!==(await pixels()).hash)throw new Error('Reduced motion animates at '+width);
   if(!await page.getByRole('button',{name:'Reduced motion is enabled'}).isDisabled())throw new Error('Reduced motion preference not respected');
   await page.locator('footer a[href="/privacy"]').focus();if(!await page.locator('footer a[href="/privacy"]').evaluate(el=>el===document.activeElement))throw new Error('Footer links cannot receive focus');
   results.push({width,checks:9,grassPixels:first.painted});
 }
 if(errors.length||outbound.length)throw new Error(JSON.stringify({errors,outbound}));return{results,totalChecks:results.length*9,errors,outbound};
}
