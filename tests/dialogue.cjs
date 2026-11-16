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
vm.runInContext(fs.readFileSync(path.join(root, 'web/assets/reader-dialogue.js'), 'utf8').replaceAll('export function', 'function')+'\nglobalThis.mount = mountDialogue;globalThis.merge = canMergeSpeech;', context);
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
   if (before.trim()) expectedNarration.push(before);
   assert.equal(bubbles[i].querySelector('p').textContent, text.slice(part.start[language], part.end[language]));
   assert.equal(bubbles[i].querySelector('span').textContent, part.speaker[language]);
   cursor = part.end[language];
  });
  if (text.slice(cursor).trim()) expectedNarration.push(text.slice(cursor));
  assert.equal([...stage.querySelectorAll('.dialogue-narration p')].map(p => p.textContent).join('').replace(/\s/g,''), expectedNarration.join('').replace(/\s/g,''));
  assert.equal(stage.querySelector('.dialogue-full-text p').textContent, text, 'complete original sequence remains available');
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
