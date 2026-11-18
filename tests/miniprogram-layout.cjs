// Browser rendering adapter for native WXML + WXSS. This is a layout regression,
// not WeChat simulator/device acceptance and not an illustration audit.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PIC_BROWSER_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'miniprogram');
const books = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/library.json'))).books;
const moduleNames = ['config.js', 'utils/api.js', 'utils/state.js', 'utils/dialogue.js', 'pages/reader/index.js'];
const sources = Object.fromEntries(moduleNames.map(n => [n, fs.readFileSync(path.join(mini, n), 'utf8')]));
const template = fs.readFileSync(path.join(mini, 'pages/reader/index.wxml'), 'utf8');
const styles = fs.readFileSync(path.join(mini, 'app.wxss'), 'utf8').replace(/\bpage\{/g, 'body{') + fs.readFileSync(path.join(mini, 'pages/reader/index.wxss'), 'utf8');
const output = process.env.PIC_MINI_READER_OUTPUT;
let browser, checks = 0;
(async () => {
 browser = await chromium.launch({ headless: true, executablePath: process.env.PIC_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
 const p = await browser.newPage();
 await p.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
 await p.evaluate(({ sources, template, styles, books }) => {
  const css = document.createElement('style'); document.head.append(css);
  const cache = new Map(), storage = new Map();
  let def, currentBook = books[0];
  function expression(value, scope) { return new Function('s', 'with(s){return (' + value + ')}')(scope); }
  function value(raw, scope) {
   if (raw == null) return '';
   const exact = raw.match(/^{{([\s\S]+)}}$/);
   if (exact) return expression(exact[1], scope);
   return raw.replace(/{{([\s\S]+?)}}/g, (_, e) => expression(e, scope) ?? '');
  }
  const htmlTemplate = template.replace(/<([\w-]+)([^>]*?)\/>/g, (_, tag, attrs) => tag === 'image' ? '<img' + attrs + '>' : '<' + tag + attrs + '></' + tag + '>');
  const fragment = new DOMParser().parseFromString(htmlTemplate, 'text/html').body;
  function children(parent, target, scope) {
   let matched = false;
   for (const node of parent.childNodes) {
    if (node.nodeType === 3) { target.append(document.createTextNode(String(value(node.textContent, scope)))); continue; }
    if (node.nodeType !== 1) continue;
    if (node.hasAttribute('wx:if')) { matched = Boolean(value(node.getAttribute('wx:if'), scope)); if (!matched) continue; }
    else if (node.hasAttribute('wx:elif')) { if (matched) continue; matched = Boolean(value(node.getAttribute('wx:elif'), scope)); if (!matched) continue; }
    else if (node.hasAttribute('wx:else')) { if (matched) continue; matched = true; }
    else matched = false;
    if (node.hasAttribute('wx:for')) {
     const items = value(node.getAttribute('wx:for'), scope) || [];
     items.forEach((item, index) => element(node, target, { ...scope, item, index }));
    } else element(node, target, scope);
   }
  }
  function element(node, target, scope) {
   if (node.localName === 'block') { children(node, target, scope); return; }
   const tag = ['image', 'img'].includes(node.localName) ? 'img' : node.localName === 'text' ? 'span' : node.localName === 'button' ? 'button' : 'div';
   const out = document.createElement(tag);
   for (const attr of node.attributes) {
    if (attr.name === 'bindtap' || attr.name === 'catchtap') {
     out.addEventListener('click', event => { if (attr.name === 'catchtap') event.stopPropagation(); window.reader[attr.value]({ currentTarget: { dataset: { ...out.dataset } }, detail: {} }); });
     continue;
    }
    if (attr.name.startsWith('wx:') || attr.name.startsWith('bind') || attr.name.startsWith('catch')) continue;
    const val = value(attr.value, scope);
    if (attr.name === 'disabled') { out.disabled = Boolean(val); continue; }
    if (attr.name === 'src') { out.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#e4f1f7"/><circle cx="600" cy="420" r="100" fill="#ffda6e"/></svg>'); continue; }
    out.setAttribute(attr.name, String(val));
   }
   if (node.localName === 'scroll-view' && value(node.getAttribute('scroll-y'), scope)) out.style.overflowY = 'auto';
   if (tag === 'img') { out.style.objectFit = 'contain'; if (node.getAttribute('mode') === 'widthFix') out.style.height = 'auto'; }
   target.append(out); children(node, out, scope);
  }
  function render() {
   css.textContent = 'body{margin:0}button{cursor:pointer;border:0;font-family:inherit}*{box-sizing:border-box}' + styles.replace(/\bimage(?=[{\s])/g, 'img').replace(/([\d.]+)rpx/g, (_, n) => (Number(n) * innerWidth / 750) + 'px');
   const output = document.createDocumentFragment(); children(fragment, output, window.reader.data); document.body.replaceChildren(output);
  }
  const wx = {
   getStorageSync: k => storage.get(k), setStorageSync: (k, v) => storage.set(k, structuredClone(v)), removeStorageSync: k => storage.delete(k),
   getWindowInfo: () => ({ windowWidth: innerWidth, windowHeight: innerHeight, screenHeight: innerHeight, statusBarHeight: 0, safeArea: { bottom: innerHeight } }), setNavigationBarTitle() {}, showToast() {},
   request(o) { const data = o.url.endsWith('/pages') ? { items: currentBook.pages } : o.url.includes('/api/books/') ? currentBook : {}; queueMicrotask(() => o.success({ statusCode: 200, data })); },
   createSelectorQuery() { const selectors = []; return { in() { return this; }, selectAll(s) { selectors.push(s); return this; }, boundingClientRect() { return this; }, exec(fn) { fn(selectors.map(selector => [...document.querySelectorAll(selector)].map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; }))); } }; }
  };
  function load(name) {
   if (cache.has(name)) return cache.get(name).exports;
   const module = { exports: {} }; cache.set(name, module);
   const require = relative => { const stack = name.split('/'); stack.pop(); for (const part of relative.split('/')) { if (part === '..') stack.pop(); else if (part !== '.') stack.push(part); } let resolved = stack.join('/'); if (!resolved.endsWith('.js')) resolved += '.js'; return load(resolved); };
   new Function('module', 'require', 'wx', 'Page', sources[name])(module, require, wx, p => def = p); return module.exports;
  }
  load('pages/reader/index.js');
  window.reader = { ...def, data: structuredClone(def.data), setData(patch, fn) { Object.assign(this.data, patch); render(); if (fn) queueMicrotask(fn); } };
  window.openBook = async id => {
   currentBook = books.find(b => b.id === id); const r = window.reader;
   r.serial = (r.serial || 0) + 1; r.pages = currentBook.pages; r.id = id; r.readingID = load('utils/state.js').id(); r.visited = new Set(); r.dead = false; r.hidden = false; r.ratio = r.pages.find(p => p.dialogue)?.dialogue.aspect_ratio || [4, 3]; r.ratioReady = true;
   r.setData({ fullscreen: false, controlsVisible: true, book: currentBook, total: r.pages.length, pageNames: r.pages.map((_, i) => '第' + (i + 1) + '页') }); r.frame(); r.show(0, false);
  };
  window.imageReady = () => { const r = window.reader; r.imageLoaded({ currentTarget: { dataset: { src: r.data.page.image } }, detail: { width: r.ratio[0] * 100, height: r.ratio[1] * 100 } }); };
 }, { sources, template, styles, books });
 const settle = async () => { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); };
 async function verify(label) {
  await settle();
  const errors = await p.evaluate(() => {
   const failures = [], r = window.reader, art = document.querySelector('.frame'), overlay = document.querySelector('.overlay');
   const check = (ok, msg) => { if (!ok) failures.push(msg); };
   check(document.documentElement.scrollWidth <= innerWidth + 2, 'horizontal page overflow');
   if (overlay && r.data.bubbles.length) {
    check(r.data.bubbleReady, 'bubbles not measured');
    check(document.querySelectorAll('.bubble').length === r.data.bubbles.length, 'missing speech');
    const o = overlay.getBoundingClientRect();
    const boxes = [...document.querySelectorAll('.bubble')].map(e => e.getBoundingClientRect());
    [...document.querySelectorAll('.bubble')].forEach((b, i) => {
     const rect = boxes[i], words = b.querySelector('.words');
     check(rect.left >= o.left - 1 && rect.right <= o.right + 1, 'speech outside artwork horizontally');
     check(rect.top >= o.top - 1 && (r.data.packed || rect.bottom <= o.bottom + 1), 'speech outside artwork vertically');
     check(parseFloat(getComputedStyle(words).fontSize) >= 16, 'unreadable speech');
     check(b.scrollWidth <= b.clientWidth + 1, 'speech horizontal overflow');
     const scroller = words.parentElement;
     check(scroller.clientHeight >= 24, 'speech viewport too short');
     check(words.scrollHeight <= scroller.clientHeight + 1 || getComputedStyle(scroller).overflowY === 'auto', 'long speech not scrollable');
     for (const next of boxes.slice(i + 1)) check(!(rect.left < next.right && rect.right > next.left && rect.top < next.bottom && rect.bottom > next.top), 'speech overlaps');
    });
   }
   const frame = art.getBoundingClientRect(), player = document.querySelector('.player')?.getBoundingClientRect();
   if (player) check(player.top >= frame.bottom, 'player overlaps art');
   if (r.data.fullscreen) {
    const reader = document.querySelector('.reader').getBoundingClientRect();
    check(Math.abs(reader.height - innerHeight) < 1 && reader.top === 0, 'fullscreen does not fill window');
    check(frame.left === 0 && frame.width === innerWidth, 'fullscreen art has side margins');
    check(Boolean(player) === r.data.controlsVisible, 'fullscreen controls not toggled');
    if (player) check(player.bottom <= innerHeight + 1, 'fullscreen controls below window');
    const hint = document.querySelector('.controls-hint')?.getBoundingClientRect();
    if (hint) check(hint.bottom <= innerHeight + 1, 'fullscreen hint below window');
   }
   for (const row of document.querySelectorAll('.player-row')) check(row.scrollWidth <= row.clientWidth + 1, 'player horizontal overflow');
   const narration = document.querySelector('.narration');
   if (narration) check(narration.textContent === r.data.narration, 'narration lost');
   if (r.data.narration) check(Boolean(narration), 'missing narration');
   return failures;
  });
  if (errors.length) console.error(await p.evaluate(() => ({ layout: window.reader.data.bubbles.map(b => ({ words: b.words, style: b.style })), html: document.querySelector('.overlay')?.outerHTML })));
  assert.deepEqual(errors, [], label + ': ' + errors.join('; ')); checks++;
 }
 const sizes = [[320, 568], [390, 844], [600, 800], [1366, 768], [568, 320]];
 const dialogueBooks = books.filter(b => b.pages.some(p => p.dialogue) && (!process.env.PIC_MINI_READER_BOOK || b.id === process.env.PIC_MINI_READER_BOOK));
 assert.ok(dialogueBooks.length, 'no matching dialogue books');
 for (const [width, height] of sizes) {
  await p.setViewportSize({ width, height });
  for (const book of dialogueBooks) {
   await p.evaluate(id => window.openBook(id), book.id);
   for (const mode of ['normal', 'fullscreen', 'fullscreen-controls']) {
    await p.evaluate(mode => { const r = window.reader; r.setData({ fullscreen: mode !== 'normal', controlsVisible: mode !== 'fullscreen' }); r.frame(); }, mode);
    const originalFrame = await p.locator('.frame').boundingBox();
    for (let i = 0; i < book.pages.length; i++) {
     if (!book.pages[i].dialogue) continue;
     for (const lang of ['zh', 'en']) {
      await p.evaluate(({ i, lang }) => { const r = window.reader; r.setData({ language: lang, showText: true }); r.show(i, false); window.imageReady(); }, { i, lang });
      await verify(`${book.id}/${i + 1}/${lang}/${width}x${height}/${mode}`);
      const currentFrame = await p.locator('.frame').boundingBox();
      assert.equal(currentFrame.width, originalFrame.width); assert.equal(currentFrame.height, originalFrame.height);
      if (book.id === 'bd-a-beautiful-day' && i === 0 && lang === 'zh' && width === 390) {
       const coverage = await p.evaluate(() => {
        const overlay = document.querySelector('.overlay').getBoundingClientRect();
        return [...document.querySelectorAll('.bubble')].reduce((area, b) => { const r = b.getBoundingClientRect(); return area + r.width * r.height; }, 0) / (overlay.width * overlay.height);
       });
       assert.ok(coverage < .6, 'short speech covers too much of the illustration: ' + coverage);
       assert.equal(await p.evaluate(() => window.reader.data.bubbles.some(b => b.scroll)), false, 'short speech needs scrolling');
       if (output) {
        fs.mkdirSync(output, { recursive: true });
        await p.screenshot({ path: path.join(output, 'reader-390-' + mode + '.png'), fullPage: true });
       }
      }
     }
    }
  }
  }
 }
 await p.evaluate(() => { const r = window.reader; r.setData({ fullscreen: true, controlsVisible: false }); r.frame(); r.controls(); r.controls(); }); await verify('fullscreen control toggle');
 await p.locator('.controls-hint').click(); await verify('tap to reveal fullscreen controls');
 assert.equal(await p.locator('.player').count(), 1);
 await p.locator('.bubble').first().click();
 assert.equal(await p.evaluate(() => window.reader.data.controlsVisible), true, 'speech tap hid controls');
 await p.locator('.frame').click({ position: { x: 1, y: 1 } }); await verify('tap artwork to hide fullscreen controls');
 assert.equal(await p.locator('.player').count(), 0);
 await p.evaluate(() => { const r = window.reader; r.imageFailed({ currentTarget: { dataset: { src: r.data.page.image } } }); });
 assert.equal(await p.locator('.bubble').count(), 0);
 assert.equal(await p.locator('.narration').textContent(), await p.evaluate(() => window.reader.data.language === 'zh' ? window.reader.data.page.text_zh : window.reader.data.page.text_original));
 await p.evaluate(() => window.reader.retryImage()); await p.evaluate(() => window.imageReady()); await verify('image retry');
 assert.equal(await p.getByText('隐藏文字', { exact: true }).count(), 0);
 assert.equal(await p.getByText('夜间', { exact: true }).count(), 0);
 assert.equal(await p.evaluate(() => typeof window.reader.mode), 'undefined');
 for (const [width, height] of [[390, 844], [568, 320], [1366, 768]]) {
  await p.setViewportSize({ width, height });
  for (const fullscreen of [false, true]) {
   await p.evaluate(async fullscreen => {
    await window.openBook('sb-bean-in-a-pot'); const r = window.reader;
    for (let i = 0; i < r.pages.length; i++) r.show(i, false);
    r.setData({ celebrationEnabled: true, fullscreen }); r.frame(); r.finish();
   }, fullscreen);
   assert.equal(await p.locator('.completion-speaker').textContent(), '小川说');
   assert.equal(await p.locator('.completion-panel button').count(), 2);
   assert.equal(await p.locator('.completion-art').evaluate(e => getComputedStyle(e).animationName), 'character-pop');
   assert.equal(await p.locator('.completion-clap').evaluate(e => getComputedStyle(e).animationIterationCount), '4');
   assert.equal(await p.locator('.completion-panel').evaluate(e => e.scrollWidth <= e.clientWidth + 1), true);
   const buttons = await p.locator('.completion-panel button').all();
   const boxes = await Promise.all(buttons.map(e => e.boundingBox()));
   assert.ok(Math.abs(boxes[0].width - boxes[1].width) < 1 && Math.abs(boxes[0].height - boxes[1].height) < 1);
   for (const button of buttons) {
    await button.scrollIntoViewIfNeeded();
    assert.equal(await button.evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; }), true);
   }
   await buttons[0].click();
   assert.equal(await p.locator('.completion-panel').count(), 0);
   assert.equal(await p.evaluate(() => window.reader.data.index), 0); checks++;
  }
 }
 console.log(`PASS: ${checks} mini-program WXML/WXSS browser adapter checks; ${dialogueBooks.length} selected books with configured dialogue pages, both languages, five viewports, stable art, fixed bubble mode, fullscreen with controls hidden/shown and image retry. Not a native device test.`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
