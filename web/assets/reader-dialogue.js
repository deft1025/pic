// Typography only: all story words, images and recordings come from the book API.
export function mountDialogue(stage) {
 const picture=stage.querySelector('.reader-image-wrap');
 const transcript=stage.querySelector('.reader-text');
 const scene=stage.querySelector('.reader-scene'),copy=stage.querySelector('.reader-copy');
 const overlay=document.createElement('div');
 overlay.className='reader-dialogue';overlay.setAttribute('aria-hidden','true');overlay.hidden=true;
 picture.append(overlay);
 const narration=document.createElement('div');
 narration.className='dialogue-narration';narration.setAttribute('aria-hidden','true');narration.hidden=true;
 transcript.before(narration);
 let state=null,frameRequest=0,disposed=false,enabled=false;
 const intersects=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
 function reflow() {
  if(disposed)return;
  const columns=Boolean(scene&&copy&&enabled&&(window.matchMedia('(min-width: 901px)').matches||window.matchMedia('(orientation: landscape) and (min-width: 568px) and (max-height: 500px)').matches));
  scene?.classList.toggle('reader-dialogue-columns',columns);
  const parent=columns?copy:picture;
  if(overlay.parentElement!==parent)parent.prepend(overlay);
  if(overlay.hidden)return;
  picture.classList.remove('dialogue-flow');
  const svg=overlay.querySelector('svg');svg.replaceChildren();
  if(columns)return;
  if(window.matchMedia('(max-width: 700px)').matches)return;
  const frame=picture.getBoundingClientRect();if(!frame.width)return;
  const boxes=[...overlay.querySelectorAll('.dialogue-bubble')].map(b=>b.getBoundingClientRect());
  // Long translations or tight compositions use readable cards above the intact art.
  const crowded=boxes.some((box,i)=>box.left<frame.left||box.right>frame.right+1||box.top<frame.top||box.bottom>frame.bottom-8||boxes.slice(i+1).some(b=>intersects(box,b))||state.parts.some(p=>{
   if(!p.target)return false;
   const x=frame.left+p.target[0]*frame.width/100,y=frame.top+p.target[1]*frame.height/100;
   return x>box.left-8&&x<box.right+8&&y>box.top-8&&y<box.bottom+8;
  }));
  if(crowded){picture.classList.add('dialogue-flow');return;}
  svg.setAttribute('viewBox',`0 0 ${frame.width} ${frame.height}`);
  boxes.forEach((box,i)=>{
   const part=state.parts[i];if(!part.target)return;
   const tx=part.target[0]*frame.width/100,ty=part.target[1]*frame.height/100;
   const left=box.left-frame.left,right=box.right-frame.left,top=box.top-frame.top,bottom=box.bottom-frame.top;
   let x=Math.max(left+18,Math.min(right-18,tx)),y=ty<top?top+1:bottom-1,horizontal=true;
   if(ty>=top&&ty<=bottom){x=tx<left?left+1:right-1;y=Math.max(top+18,Math.min(bottom-18,ty));horizontal=false;}
   const dx=tx-x,dy=ty-y,distance=Math.hypot(dx,dy);if(!distance)return;
   const reach=Math.min(1,28/distance),tail=document.createElementNS('http://www.w3.org/2000/svg','path');
   const a=horizontal?[x-8,y]:[x,y-8],b=horizontal?[x+8,y]:[x,y+8];
   tail.setAttribute('d',`M ${a[0]} ${a[1]} L ${x+dx*reach} ${y+dy*reach} L ${b[0]} ${b[1]}`);
   if(i%2)tail.classList.add('dialogue-reply');svg.append(tail);
  });
 }
 function validParts(config,text,language){
  if(!config||config.length?.[language]!==text.length||!Array.isArray(config.parts)||!config.parts.length)return false;
  let cursor=0;
  return config.parts.every(p=>{
   if(!p)return false;
   const start=p.start?.[language],end=p.end?.[language];
   const valid=Number.isInteger(start)&&Number.isInteger(end)&&start>=cursor&&end>start&&end<=text.length&&[p.x,p.y,p.width].every(Number.isFinite)&&p.x>=0&&p.y>=0&&p.y<100&&p.width>0&&p.x+p.width<=100&&typeof p.speaker?.[language]==='string';
   cursor=end;return valid;
  });
 }
 function render({config,text,language,visible,enabled:requested}){
  enabled=requested;
  const ratio=config?.aspect_ratio;
  if(Array.isArray(ratio)&&ratio.length===2&&ratio.every(x=>Number.isFinite(x)&&x>0))picture.style.setProperty('--dialogue-ratio',ratio.join(' / '));
  const active=enabled&&!picture.classList.contains('image-failed')&&validParts(config,text,language);
  picture.classList.toggle('dialogue-canvas',Boolean(active));picture.classList.remove('dialogue-flow');
  transcript.classList.toggle('dialogue-transcript',Boolean(active));
  narration.hidden=true;narration.replaceChildren();overlay.hidden=!active||!visible;overlay.replaceChildren();
  if(!active){reflow();return;}
  state=config;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('dialogue-tails');overlay.append(svg);
  let cursor=0;
  function addNarration(words){if(!words.trim())return;const p=document.createElement('p');p.textContent=words;p.lang=language==='zh'?'zh-CN':'en';narration.append(p);}
  config.parts.forEach((part,i)=>{
   addNarration(text.slice(cursor,part.start[language]));cursor=part.end[language];
   const bubble=document.createElement('div');bubble.className='dialogue-bubble';bubble.classList.toggle('dialogue-reply',Boolean(i%2));
   bubble.style.setProperty('--bubble-x',part.x+'%');bubble.style.setProperty('--bubble-y',part.y+'%');bubble.style.setProperty('--bubble-width',part.width+'%');
   const speaker=document.createElement('span');speaker.className='dialogue-speaker';speaker.textContent=part.speaker[language];
   const words=document.createElement('p');words.lang=language==='zh'?'zh-CN':'en';words.textContent=text.slice(part.start[language],part.end[language]);
   bubble.append(speaker,words);overlay.append(bubble);
  });
  addNarration(text.slice(cursor));narration.hidden=!visible||!narration.childElementCount;
  reflow();
 }
 const observer=new ResizeObserver(()=>{cancelAnimationFrame(frameRequest);frameRequest=requestAnimationFrame(reflow);});observer.observe(picture);
 return {render,dispose(){disposed=true;observer.disconnect();cancelAnimationFrame(frameRequest);}};
}
