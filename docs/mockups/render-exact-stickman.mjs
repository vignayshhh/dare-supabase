import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = new URL('./', import.meta.url);
let svg = fs.readFileSync(new URL('prediction-stickman-integrated.svg', root), 'utf8');
svg = svg.replace(/ <text x="47" y="484"[^\n]+\n/, '');
svg = svg.replace(/ <g transform="translate\((72|114|156|278) 520\)">[^\n]+\n/g, '');
svg = svg.replace(/ <text x="(189|312)" y="558"[^\n]+\n/g, '');
const css = fs.readFileSync('src/components/circles/stickman.css', 'utf8');
// Match StickmanBody's non-compact markup and Tailwind utilities, without
// importing or modifying the app. Scale the complete 48/56px figure uniformly.
const figures = [
  {x:55, name:'MI',color:'#4ade80',flip:false},
  {x:97, name:'YO',color:'#f5f5f5',flip:false},
  {x:139,name:'KA',color:'#38bdf8',flip:false},
  {x:277,name:'PR',color:'#fb7185',flip:true},
  {x:319,name:'RA',color:'#facc15',flip:true},
].map(f => `<div style="position:absolute;left:${f.x-11.76}px;top:548px;width:56px;transform:scale(.42);transform-origin:top left">
 <div class="chat-stickman-motion" data-animated="false" style="display:flex;flex-direction:column;align-items:center">
  <div class="chat-stickman-head" style="display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:50%;border:2px solid ${f.color};background:#101611;font-weight:900;color:white">${f.name}</div>
  <div class="chat-stickman-body" style="position:relative;margin-top:-1px;${f.flip?'transform:scaleX(-1);':''}">
   <span class="chat-stickman-spine" style="position:absolute;left:50%;top:0;transform:translateX(-50%);border-radius:999px;background:rgba(255,255,255,.8)"></span>
   <span class="chat-presence-arm chat-presence-arm-left" style="position:absolute;transform-origin:right;border-radius:999px;background:rgba(255,255,255,.75);transform:rotate(170deg)"></span>
   <span class="chat-presence-arm chat-presence-arm-right" style="position:absolute;transform-origin:left;border-radius:999px;background:rgba(255,255,255,.75);transform:rotate(4deg)"></span>
   <span class="chat-presence-leg chat-presence-leg-left" style="position:absolute;transform-origin:left;border-radius:999px;background:rgba(255,255,255,.75)"></span>
   <span class="chat-presence-leg chat-presence-leg-right" style="position:absolute;transform-origin:right;border-radius:999px;background:rgba(255,255,255,.75)"></span>
  </div>
 </div></div>`).join('');
svg = svg.replace('</svg>', `<foreignObject width="390" height="740" x="0" y="0"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:390px;height:740px;font-family:Arial,sans-serif"><style>*{box-sizing:border-box}${css}</style>${figures}</div></foreignObject></svg>`);
fs.writeFileSync(new URL('prediction-exact-chatlist.svg', root), svg);
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:740},deviceScaleFactor:2});
await page.setContent(`<style>body{margin:0}svg{width:390px;height:740px;display:block}</style>${svg}`);
await page.screenshot({path:fileURLToPath(new URL('prediction-exact-chatlist.png',root))});
await browser.close();
