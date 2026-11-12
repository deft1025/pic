// DOM regression checks for the optional text layer; no database or assets needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {parseHTML} = require(process.env.PIC_DOM_MODULE || 'linkedom');
const root = path.resolve(__dirname, '..');
const {window, document} = parseHTML('<main><div class="reader-image-wrap"></div><p class="reader-text"></p></main>');
let disconnected = false;
const context = vm.createContext({
 document, window: {matchMedia: () => ({matches: true})},
 ResizeObserver: class { observe() {} disconnect() { disconnected = true; } },
 requestAnimationFrame: callback => {callback(); return 1;}, cancelAnimationFrame() {}
});
vm.runInContext(fs.readFileSync(path.join(root, 'web/assets/reader-dialogue.js'), 'utf8').replace('export function', 'function')+'\nglobalThis.mount = mountDialogue;', context);
const stage = document.querySelector('main'), picture = stage.querySelector('.reader-image-wrap');
const transcript = stage.querySelector('.reader-text'), view = context.mount(stage);
let checked = 0;
for (const name of fs.readdirSync(path.join(root, 'content/books')).filter(x => x.endsWith('.json'))) {
 const book = JSON.parse(fs.readFileSync(path.join(root, 'content/books', name), 'utf8'));
 for (const page of book.pages) for (const language of book.languages) {
  const text = page[language === 'zh' ? 'text_zh' : 'text_original'];
  transcript.textContent = text;
  const params = {config: page.dialogue, text, language, visible: true, enabled: true};
  view.render(params);
  assert.equal(picture.classList.contains('dialogue-canvas'), Boolean(page.dialogue));
  if (!page.dialogue) continue;
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
  assert.deepEqual([...stage.querySelectorAll('.dialogue-narration p')].map(p => p.textContent), expectedNarration);
  assert.equal(transcript.textContent, text, 'accessible full transcript stays intact');
  assert.equal(stage.querySelector('.reader-dialogue').getAttribute('aria-hidden'), 'true');
  view.render({...params, visible: false});
  assert.equal(stage.querySelector('.reader-dialogue').hidden, true);
  assert.equal(stage.querySelector('.dialogue-narration').hidden, true);
  for (const fallback of [
   {...params, enabled: false},
   {...params, text: text + 'changed'},
   {...params, config: {}},
   {...params, config: {...page.dialogue, parts: [null]}}
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
view.dispose(); assert.equal(disconnected, true);
console.log(`PASS: ${checked} bilingual dialogue pages preserve speech, intervening narration and accessible text; optional layout/invalid data/image failure fallbacks and observer disposal.`);
