// Speech ranges and illustration anchors come only from the book API.
// Only attribution-only gaps can continue a speech turn. Actions, scene changes,
// unknown anchors, and intervening speakers retain separate bubbles.
export function canMergeSpeech(previous,current,gap,language) {
 const name=previous?.speaker?.[language];
 if(!name||name!==current?.speaker?.[language]||!previous.target||JSON.stringify(previous.target)!==JSON.stringify(current.target)||gap.length>80||/[\r\n]/.test(gap))return false;
 const phrase=gap.trim().replace(/^[，,。.!?！？:：;；“”‘’"'…\s]+|[，,。.!?！？:：;；“”‘’"'…\s]+$/g,'');
 if(!phrase)return true;
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 if(language==='zh')return new RegExp('^'+escaped+'(?:轻声|小声|大声|笑着)?(?:说|问|喊|叫)(?:道)?$').test(phrase);
 const verb='(?:says?|said|asks?|asked|calls?|called|shouts?|shouted|replies|replied|answers?|answered|whispers?|whispered)';
 return new RegExp('^(?:'+verb+'[ \t]+(?:the[ \t]+)?'+escaped+'|'+escaped+'[ \t]+'+verb+')$','i').test(phrase);
}
export function mountDialogue(stage) {
 const picture=stage.querySelector('.reader-image-wrap'),image=picture.querySelector('.reader-image');
 const transcript=stage.querySelector('.reader-text'),scene=stage.querySelector('.reader-scene'),copy=stage.querySelector('.reader-copy');
 const overlay=document.createElement('div'),panel=document.createElement('div');
 overlay.className='reader-dialogue';overlay.setAttribute('aria-hidden','true');overlay.hidden=true;picture.append(overlay);
 panel.className='dialogue-panel';panel.hidden=true;copy.prepend(panel);
 let disposed=false,state=null,frame=0,entries=[];
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 function validParts(config,text,language){
  if(!config||config.length?.[language]!==text.length||!Array.isArray(config.parts)||!config.parts.length)return false;
  let cursor=0;
  return config.parts.every(p=>{
   if(!p)return false;
   const start=p.start?.[language],end=p.end?.[language];
   const valid=Number.isInteger(start)&&Number.isInteger(end)&&start>=cursor&&end>start&&end<=text.length&&[p.x,p.y,p.width].every(Number.isFinite)&&p.x>=0&&p.y>=0&&p.y<100&&p.width>0&&p.x+p.width<=100&&typeof p.speaker?.[language]==='string'&&(p.target==null||(Array.isArray(p.target)&&p.target.length===2&&p.target.every(n=>Number.isFinite(n)&&n>=0&&n<=100)));
   cursor=end;return valid;
  });
 }
 function schedule(){
  if(disposed||frame||!state?.active)return;
  if(typeof requestAnimationFrame==='function')frame=requestAnimationFrame(()=>{frame=0;layout();});
 }
 function intersects(a,b,gap=0){return a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;}
 function distance(r,t){return Math.hypot(t[0]-clamp(t[0],r.x,r.x+r.w),t[1]-clamp(t[1],r.y,r.y+r.h));}
 function layout(){
  if(disposed||!state?.active)return;
  const W=picture.clientWidth,H=picture.clientHeight;if(!W||!H)return;
  // Account for contain letterboxing: percentages are relative to the actual artwork.
  const ratio=image?.naturalWidth/image?.naturalHeight||state.config.aspect_ratio?.[0]/state.config.aspect_ratio?.[1]||W/H;
  const w=Math.min(W,H*ratio),h=w/ratio,ox=(W-w)/2,oy=(H-h)/2;
  Object.assign(overlay.style,{left:ox+'px',top:oy+'px',width:w+'px',height:h+'px'});
  const targets=entries.filter(e=>e.part.target).map(e=>[e.part.target[0]*w/100,e.part.target[1]*h/100]);
  const obstacles=[...picture.querySelectorAll('.page-arrow')].filter(el=>el.offsetWidth&&el.offsetHeight).map(el=>({x:el.offsetLeft-ox,y:el.offsetTop-el.offsetHeight/2-oy,w:el.offsetWidth,h:el.offsetHeight}));
  const guard=clamp(w*.025,16,30),pad=7;
  function place(entry,placed,scroll=false,protectAll=true){
   if(!entry.part.target)return null;
   const t=entry.part.target.map((n,i)=>n*(i?h:w)/100),el=entry.bubble;
   el.hidden=false;el.style.visibility='hidden';el.style.maxHeight=scroll?Math.min(h-pad*2,Math.max(78,h*.5))+'px':'';el.classList.toggle('dialogue-scroll',scroll);
   const maxWidth=Math.min(w-pad*2,340),minWidth=Math.min(maxWidth,scroll?Math.max(64,w*.28):150);
   const preferred=clamp(entry.part.width*w/100,minWidth,maxWidth);
   const widths=[preferred,clamp(w*.45,minWidth,maxWidth),maxWidth,minWidth];let best=null;
   for(const width of new Set(widths.map(Math.round))){
    el.style.width=width+'px';const bh=el.offsetHeight;
    if(bh>h-pad*2)continue;
    const xs=[t[0]-width/2,t[0]+guard,t[0]-guard-width,entry.part.x*w/100,pad,w-width-pad];
    const ys=[t[1]-guard-bh,t[1]+guard,t[1]-bh/2,entry.part.y*h/100,pad,h-bh-pad];
    for(const x0 of xs)for(const y0 of ys){
     const r={x:clamp(x0,pad,w-width-pad),y:clamp(y0,pad,h-bh-pad),w:width,h:bh};
     if((protectAll?targets:[t]).some(p=>distance(r,p)<guard)||obstacles.some(o=>intersects(r,o,4))||placed.some(o=>intersects(r,o,8)))continue;
     const end=[clamp(t[0],r.x+8,r.x+r.w-8),clamp(t[1],r.y+8,r.y+r.h-8)];
     // Do not send another character's tail through an existing bubble.
     const blocked=placed.some(o=>Array.from({length:9},(_,i)=>({x:t[0]+(end[0]-t[0])*(i+1)/10,y:t[1]+(end[1]-t[1])*(i+1)/10,w:1,h:1})).some(p=>intersects(p,o,3)));
     if(blocked)continue;
     const score=distance(r,t)+Math.hypot(r.x-entry.part.x*w/100,r.y-entry.part.y*h/100)*.12+Math.abs(width-preferred)*.06;
     if(!best||score<best.score)best={...r,end,target:t,score};
    }
   }
   el.style.visibility='';return best;
  }
  overlay.classList.remove('dialogue-overflow');
  entries.forEach((e,i)=>{e.bubble.classList.remove('dialogue-compact');e.bubble.hidden=false;e.bubble.querySelector('p').textContent=e.words;e.bubble.dataset.parts=String(i);});
  function attempt(list){
   const placed=[];
   for(const entry of list){const r=place(entry,placed);if(!r)return null;placed.push(r);}
   return placed;
  }
  let shown=entries,placements=attempt(shown),mode='all';
  if(!placements){
   // Merge only adjacent speech by the same character at the same anchor.
   // The original ranges/narration remain intact; no turn is hidden behind a pager.
   shown=[];
   entries.forEach((entry,i)=>{
    const previous=shown.at(-1),before=entries[i-1];
    const gap=before?state.text.slice(before.part.end[state.language],entry.part.start[state.language]):'';
    if(previous&&canMergeSpeech(before.part,entry.part,gap,state.language)){previous.words+=' '+entry.words;previous.indices.push(i);}
    else shown.push({...entry,indices:[i]});
   });
   shown.forEach(e=>{e.bubble.querySelector('p').textContent=e.words;e.bubble.dataset.parts=e.indices.join(',');});
   placements=attempt(shown);mode='grouped';
  }
  if(!placements){
   // A bounded packing fallback keeps every speaker visible in the fixed artwork.
   // Long text scrolls in its own bubble rather than disappearing into a speech turn.
   let best=null;const n=shown.length,gap=6;
   function permutations(items){if(items.length<2)return [items];return items.flatMap((item,i)=>permutations(items.filter((_,j)=>j!==i)).map(rest=>[item,...rest]));}
   const orders=n<=4?permutations(shown.map((_,i)=>i)):[shown.map((_,i)=>i)];
   for(let cols=1;cols<=n;cols++){
    const rows=Math.ceil(n/cols),cw=(w-pad*2-gap*(cols-1))/cols,ch=(h-pad*2-gap*(rows-1))/rows;
    if(cw<46||ch<58)continue;
    for(const order of orders){
     let score=0;const placed=[];
     for(let slot=0;slot<n;slot++){
      const entry=shown[order[slot]],el=entry.bubble;
      const cell={x:pad+(slot%cols)*(cw+gap),y:pad+Math.floor(slot/cols)*(ch+gap),w:cw,h:ch};
      const width=Math.min(cw,340,Math.max(Math.min(150,cw),entry.part.width*w/100));
      el.hidden=false;el.classList.add('dialogue-scroll','dialogue-compact');el.style.width=width+'px';el.style.maxHeight=ch+'px';
      const bh=el.offsetHeight,t=entry.part.target?.map((v,i)=>v*(i?h:w)/100)||null;
      let candidate=null;
      for(const x of [cell.x,cell.x+cw-width])for(const y of [cell.y,cell.y+ch-bh]){
       const r={x,y,w:width,h:bh,target:t};
       const covered=targets.reduce((sum,p)=>sum+Math.max(0,guard-distance(r,p)),0);
       const cost=covered*30+(t?distance(r,t):0)+Math.hypot(x-entry.part.x*w/100,y-entry.part.y*h/100)*.1;
       if(!candidate||cost<candidate.cost)candidate={...r,cost,end:t?[clamp(t[0],x+8,x+width-8),clamp(t[1],y+8,y+bh-8)]:null};
      }
      score+=candidate.cost+Math.max(0,el.querySelector('p').scrollHeight-el.querySelector('p').clientHeight)*(w+h);
      placed[order[slot]]=candidate;
     }
     if(!best||score<best.score)best={score,placed};
    }
   }
   if(best){placements=best.placed;mode='packed';}
   else {
    // If the viewport cannot hold even one readable line per bubble, scroll all
    // dialogue inside the fixed image region; never hide turns or shrink the art.
    overlay.classList.add('dialogue-overflow');
    placements=shown.map(()=>null);mode='overflow';
   }
  }
  entries.forEach(e=>{e.bubble.hidden=true;});overlay.querySelectorAll('svg').forEach(e=>e.remove());
  shown.forEach((entry,i)=>{
   const r=placements[i],bubble=entry.bubble;bubble.hidden=false;
   if(!r){bubble.classList.add('dialogue-scroll','dialogue-compact');Object.assign(bubble.style,{left:'',top:'',width:'',maxHeight:'120px',visibility:''});return;}
   Object.assign(bubble.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',maxHeight:r.h+'px',visibility:''});
   const words=bubble.querySelector('p');bubble.dataset.overflow=String(words.scrollHeight>words.clientHeight+1);
   if(!r.target)return;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('preserveAspectRatio','none');svg.classList.add('dialogue-tail');
   const line=document.createElementNS('http://www.w3.org/2000/svg','path');
   // Shorten the tip slightly so the tail points to, rather than covers, the mouth.
   const d=Math.hypot(r.target[0]-r.end[0],r.target[1]-r.end[1])||1;
   const tx=r.target[0]+(r.end[0]-r.target[0])*5/d,ty=r.target[1]+(r.end[1]-r.target[1])*5/d;
   const nx=-(r.target[1]-r.end[1])/d*4,ny=(r.target[0]-r.end[0])/d*4;
   line.setAttribute('d',`M${r.end[0]+nx} ${r.end[1]+ny} L${tx} ${ty} L${r.end[0]-nx} ${r.end[1]-ny} Z`);svg.append(line);overlay.prepend(svg);
  });
  overlay.dataset.mode=mode;

 }
 function render({config,text,language,visible,enabled}){
  if(disposed)return;
  const active=Boolean(enabled&&!picture.classList.contains('image-failed')&&validParts(config,text,language));
  state={config,text,language,active:active&&visible};
  scene.classList.toggle('reader-dialogue-mode',Boolean(enabled));
  picture.classList.toggle('dialogue-canvas',active);
  transcript.classList.toggle('dialogue-transcript',active);
  overlay.hidden=!active||!visible;panel.hidden=!active||!visible;
  overlay.replaceChildren();panel.replaceChildren();entries=[];
  if(!active)return;
  let cursor=0;
  config.parts.forEach((part,i)=>{
   const words=text.slice(part.start[language],part.end[language]);
   const bubble=document.createElement('div');bubble.className='dialogue-bubble';bubble.dataset.anchored=String(Boolean(part.target));bubble.hidden=true;
   const speaker=document.createElement('span');speaker.className='dialogue-speaker';speaker.textContent=part.speaker[language];
   const p=document.createElement('p');p.lang=language==='zh'?'zh-CN':'en';p.textContent=words;bubble.append(speaker,p);overlay.append(bubble);
   const narration=document.createElement('div');narration.className='dialogue-narration';narration.setAttribute('aria-hidden','true');
   const n=document.createElement('p');n.textContent=text.slice(cursor,part.start[language])+(i===config.parts.length-1?text.slice(part.end[language]):text.slice(part.end[language],config.parts[i+1].start[language]));n.lang=p.lang;if(n.textContent.trim()){narration.append(n);panel.append(narration);}
   cursor=i===config.parts.length-1?text.length:config.parts[i+1].start[language];
   entries.push({part,bubble,words});
  });
  const full=document.createElement('details');full.className='dialogue-full-text';const summary=document.createElement('summary'),p=document.createElement('p');summary.textContent='完整文字';p.textContent=text;p.lang=language==='zh'?'zh-CN':'en';full.append(summary,p);panel.append(full);
  // Page/image/language changes commit visible speech together; resize remains batched.
  layout();
 }
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;observer?.observe(picture);
 globalThis.addEventListener?.('resize',schedule);
 document.fonts?.ready.then(()=>{if(!disposed)schedule();});
 return {render,dispose(){disposed=true;observer?.disconnect();globalThis.removeEventListener?.('resize',schedule);if(frame)cancelAnimationFrame(frame);}};
}
