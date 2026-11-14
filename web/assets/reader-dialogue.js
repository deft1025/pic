// Typography only: all story words, images and recordings come from the book API.
export function mountDialogue(stage) {
 const picture=stage.querySelector('.reader-image-wrap');
 const transcript=stage.querySelector('.reader-text');
 const scene=stage.querySelector('.reader-scene'),copy=stage.querySelector('.reader-copy');
 const overlay=document.createElement('div');
 overlay.className='reader-dialogue';overlay.setAttribute('aria-hidden','true');overlay.hidden=true;
 copy.prepend(overlay);
 let disposed=false;
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
  if(disposed)return;
  const enabled=Boolean(requested);
  // Placement belongs to CSS; never move cards during resize or image loading.
  scene.classList.toggle('reader-dialogue-columns',enabled);
  const active=enabled&&!picture.classList.contains('image-failed')&&validParts(config,text,language);
  picture.classList.toggle('dialogue-canvas',Boolean(active));
  transcript.classList.toggle('dialogue-transcript',Boolean(active));
  overlay.hidden=!active||!visible;overlay.replaceChildren();
  if(!active)return;
  let cursor=0;
  function addNarration(words){
   if(!words.trim())return;
   const narration=document.createElement('div');narration.className='dialogue-narration';narration.hidden=!visible;
   const p=document.createElement('p');p.textContent=words;p.lang=language==='zh'?'zh-CN':'en';narration.append(p);overlay.append(narration);
  }
  config.parts.forEach((part,i)=>{
   addNarration(text.slice(cursor,part.start[language]));cursor=part.end[language];
   const bubble=document.createElement('div');bubble.className='dialogue-bubble';bubble.classList.toggle('dialogue-reply',Boolean(i%2));
   const speaker=document.createElement('span');speaker.className='dialogue-speaker';speaker.textContent=part.speaker[language];
   const words=document.createElement('p');words.lang=language==='zh'?'zh-CN':'en';words.textContent=text.slice(part.start[language],part.end[language]);
   bubble.append(speaker,words);overlay.append(bubble);
  });
  addNarration(text.slice(cursor));
 }
 return {render,dispose(){disposed=true;}};
}
