// DOM regression checks for the optional text layer; no database or assets needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {parseHTML} = require(process.env.PIC_DOM_MODULE || 'linkedom');
const root = path.resolve(__dirname, '..');
const {window, document} = parseHTML('<main><div class="reader-scene"><div class="reader-image-wrap"></div><div class="reader-copy"><p class="reader-text"></p></div></div></main>');
let sample;
const context = vm.createContext({
 document
});
vm.runInContext(fs.readFileSync(path.join(root, 'web/assets/reader-dialogue.js'), 'utf8').replaceAll('export function', 'function')+'\nglobalThis.mount = mountDialogue;globalThis.merge = canMergeSpeech;globalThis.attribution = isSpeechAttribution;', context);
// Editorial boundaries: a repeated speaker alone does not imply one speech turn.
const mum={speaker:{zh:'妈妈',en:'Mum'},target:[20,50]};
const child={speaker:{zh:'孩子',en:'Child'},target:[70,50]};
assert.equal(context.merge(mum,mum,'妈妈说，','zh'),true);
assert.equal(context.merge(mum,mum,' says Mum. ','en'),true);
assert.equal(context.merge(mum,mum,'妈妈走进厨房。过了一会儿，','zh'),false);
assert.equal(context.merge(mum,mum,' Mum walked away. Later, ','en'),false);
assert.equal(context.merge(mum,mum,'\n\n','zh'),false);
assert.equal(context.merge(mum,{...mum,target:[60,50]},'妈妈说，','zh'),false);
assert.equal(context.merge({...mum,target:null},{...mum,target:null},'妈妈说，','zh'),false);
for(const [before,after,gap] of [[mum,child,'妈妈问。'],[child,mum,'孩子回答。']])assert.equal(context.merge(before,after,gap,'zh'),false,'question/answer turns remain separate, including a returning speaker');
const stage = document.querySelector('main'), picture = stage.querySelector('.reader-image-wrap');
const transcript = stage.querySelector('.reader-text'), view = context.mount(stage);
// Attribution is redundant with speaker labels, but actions and uncertain text
// must survive. Cover leading, middle and trailing gaps in both languages.
for(const [language,prefix,gap,suffix,expected] of [
 ['zh','妈妈说，','妈妈说，','妈妈说。',''],
 ['en','Mum says, ',' says Mum. ',' Mum said.',''],
 ['zh','天黑了。','妈妈牵起孩子的手，说，','他们走回家。','天黑了。妈妈牵起孩子的手，说，他们走回家。'],
 ['en','It was dark. ',' Mom took her hand and said, ',' They went home.','It was dark.  Mom took her hand and said,  They went home.'],
 ['zh','','爸爸说，','','爸爸说，'],
 ['zh','','妈妈说，\n过了一会儿，','','妈妈说，\n过了一会儿，']
]){
 const first=language==='zh'?'“回家吧。”':'“Let’s go home.”',second=language==='zh'?'“说再见吧。”':'“Say goodbye.”';
 const text=prefix+first+gap+second+suffix;
 const part=(start,words)=>({...mum,x:3,y:3,width:44,start:{[language]:start},end:{[language]:start+words.length}});
 const config={length:{[language]:text.length},parts:[part(prefix.length,first),part(prefix.length+first.length+gap.length,second)]};
 transcript.textContent=text;view.render({config,text,language,visible:true,enabled:true});
 assert.equal([...stage.querySelectorAll('.dialogue-narration p')].map(p=>p.textContent).join(''),expected);
 assert.equal(stage.querySelector('.dialogue-panel').hidden,!expected);
 assert.equal(stage.querySelector('.dialogue-full-text'),null,'dialogue does not duplicate the full story below artwork');
 view.render({config,text,language,visible:true,enabled:false});
 assert.equal(transcript.classList.contains('dialogue-transcript'),false,'standard mode displays the complete original');
 assert.equal(transcript.textContent,text);
}
let checked = 0;
for (const book of JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/library.json'), 'utf8')).books) {
 for (const page of book.pages) for (const language of book.languages) {
  const text = page[language === 'zh' ? 'text_zh' : 'text_original'];
  transcript.textContent = text;
  const params = {config: page.dialogue, text, language, visible: true, enabled: true};
  view.render(params);
  assert.equal(picture.classList.contains('dialogue-canvas'), Boolean(page.dialogue));
  if (!page.dialogue) continue;
  sample = params;
  assert.equal(stage.querySelector('.dialogue-navigation'),null,'no hidden speech turns');
  const expectedNarration = []; let cursor = 0;
  const bubbles = [...stage.querySelectorAll('.dialogue-bubble')];
  page.dialogue.parts.forEach((part, i) => {
   const before = text.slice(cursor, part.start[language]);
   if (before.trim()&&!context.attribution(before,[page.dialogue.parts[i-1]?.speaker[language],part.speaker[language]],language)) expectedNarration.push(before);
   assert.equal(bubbles[i].querySelector('p').textContent, text.slice(part.start[language], part.end[language]));
   assert.equal(bubbles[i].querySelector('span').textContent, part.speaker[language]);
   cursor = part.end[language];
  });
  if (text.slice(cursor).trim()&&!context.attribution(text.slice(cursor),[page.dialogue.parts.at(-1).speaker[language]],language)) expectedNarration.push(text.slice(cursor));
  assert.equal([...stage.querySelectorAll('.dialogue-narration p')].map(p => p.textContent).join('').replace(/\s/g,''), expectedNarration.join('').replace(/\s/g,''));
  assert.equal(stage.querySelector('.dialogue-full-text'),null,'no visible duplicate transcript in dialogue mode');
  assert.equal(transcript.textContent, text, 'accessible full transcript stays intact');
  assert.equal(stage.querySelector('.reader-dialogue').getAttribute('aria-hidden'), 'true');
  view.render({...params, visible: false});
  assert.equal(stage.querySelector('.reader-dialogue').hidden, true);
  assert.equal(stage.querySelector('.dialogue-panel').hidden, true);
  for (const fallback of [
   {...params, enabled: false},
   {...params, text: text + 'changed'},
   {...params, config: {}},
   {...params, config: {...page.dialogue, parts: [null]}},
   {...params, config: {...page.dialogue, parts: [{...page.dialogue.parts[0], target: [NaN, 10]}]}}
  ]) {
   view.render(fallback);
   assert.equal(picture.classList.contains('dialogue-canvas'), false);
   assert.equal(transcript.classList.contains('dialogue-transcript'), false);
   assert.equal(stage.querySelector('.reader-dialogue').hidden, true);
  }
  picture.classList.add('image-failed'); view.render(params);
  assert.equal(picture.classList.contains('dialogue-canvas'), false, 'missing art retains ordinary text');
  picture.classList.remove('image-failed'); view.render(params);
  assert.equal(picture.classList.contains('dialogue-canvas'), true, 'retry restores dialogue');
  checked++;
 }
}
assert.ok(checked > 0);
assert.equal(context.attribution('图米问。妈妈说：', ['图米', '妈妈'], 'zh'), true);
assert.equal(context.attribution('asked Tumi. Mama replies,', ['Tumi', 'Mama'], 'en'), true);
assert.equal(context.attribution('兰加老师回答：', ['兰加老师'], 'zh'), true);
assert.equal(context.attribution('图米问。妈妈跑过来。', ['图米', '妈妈'], 'zh'), false);
assert.equal(context.attribution('asked Tumi. Mama leaves.', ['Tumi', 'Mama'], 'en'), false);
assert.equal(context.attribution('图米问。扎凯说：', ['图米', '妈妈'], 'zh'), false);
view.render(sample);
assert.ok(stage.querySelector('.reader-scene').classList.contains('reader-dialogue-mode'));
assert.equal(stage.querySelector('.reader-dialogue').parentElement, picture, 'overlay has one stable parent on every viewport');
assert.equal(stage.querySelector('.dialogue-panel').parentElement,stage.querySelector('.reader-copy'),'narration stays outside artwork');
view.render({...sample, config: null});
assert.ok(stage.querySelector('.reader-scene').classList.contains('reader-dialogue-mode'), 'pages without dialogue keep the selected composition');
view.render({...sample, enabled: false});
assert.equal(stage.querySelector('.reader-scene').classList.contains('reader-dialogue-mode'), false, 'standard layout keeps text below the art');
view.dispose(); view.render(sample);
assert.equal(stage.querySelector('.reader-scene').classList.contains('reader-dialogue-mode'), false, 'disposed views cannot update the page');
console.log(`PASS: ${checked} bilingual dialogue pages preserve speech, narration, accessible text and a stable DOM; invalid data/image failure fallbacks and disposal.`);
