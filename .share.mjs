import { chromium } from "playwright";
const S="/private/tmp/claude-502/-Users-patrick-Documents-GitHub-simplecity/7b443040-7312-4799-b3f0-c00b668ce286/scratchpad/";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:820}});
await p.emulateMedia({reducedMotion:"reduce"});
await p.goto("http://localhost:3000/cards/b18eea8f-9d48-4015-8607-41f49844f54f",{waitUntil:"domcontentloaded",timeout:60000});
await p.waitForTimeout(2000);
const boxes = await p.$$eval('article button', els =>
  els.filter(e => /interested|copy link|about the interest/i.test((e.textContent||"")+(e.getAttribute("aria-label")||"")))
     .map(e => { const r=e.getBoundingClientRect();
       return { label:(e.textContent.trim()||e.getAttribute("aria-label")).slice(0,22), top:Math.round(r.top), h:Math.round(r.height) }; }));
console.log("share-view action row:");
boxes.forEach(x=>console.log(`   ${x.label.padEnd(24)} top=${x.top} h=${x.h}`));
console.log(boxes.length>1 && new Set(boxes.map(x=>x.top)).size===1 ? "   ALIGNED — identical tops" : "   NOT aligned");
await p.screenshot({path:S+"share-view.png"});
await b.close();
