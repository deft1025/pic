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
const localArt = process.env.PIC_MINI_READER_ASSETS === 'local';
const selectedIDs = (process.env.PIC_MINI_READER_BOOK || '').split(',').filter(Boolean);
const selectedBooks = books.filter(b => !selectedIDs.length || selectedIDs.includes(b.id));
const media = localArt ? Object.fromEntries(books.filter(b => selectedBooks.includes(b) || b.id === 'sb-bean-in-a-pot').flatMap(b => b.pages.map(p => [p.image, 'data:image/webp;base64,' + fs.readFileSync(path.join(root, 'web', p.image)).toString('base64')]))) : {};
let browser, checks = 0;
(async () => {
 browser = await chromium.launch({ headless: true, executablePath: process.env.PIC_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
 const p = await browser.newPage();
 await p.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
 await p.evaluate(({ sources, template, styles, books, media }) => {
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
    if (attr.name === 'binderror') {
     out.addEventListener('error', () => window.reader[attr.value]({ currentTarget: { dataset: { ...out.dataset } } })); continue;
    }
    if (attr.name.startsWith('wx:') || attr.name.startsWith('bind') || attr.name.startsWith('catch')) continue;
    const val = value(attr.value, scope);
    if (attr.name === 'disabled') { out.disabled = Boolean(val); continue; }
    if (attr.name === 'src') { const mediaPath = String(val).replace(/^https?:\/\/[^/]+/, ''); out.src = media[mediaPath] || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#e4f1f7"/><circle cx="600" cy="420" r="100" fill="#ffda6e"/></svg>'); continue; }
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
   r.serial = (r.serial || 0) + 1; r.pages = currentBook.pages; r.id = id; r.readingID = load('utils/state.js').id(); r.visited = new Set(); r.dead = false; r.hidden = false; const ratio = r.pages.find(p => p.dialogue)?.dialogue.aspect_ratio; r.ratio = ratio || [4, 3]; r.ratioReady = Boolean(ratio);
   r.setData({ fullscreen: false, controlsVisible: true, book: currentBook, total: r.pages.length, pageNames: r.pages.map((_, i) => '第' + (i + 1) + '页') }); r.frame(); r.show(0, false);
  };
  window.openOrdinaryBook = async id => {
   currentBook = books.find(b => b.id === id);
   const r = window.reader; r.data = structuredClone(def.data); r.dead = false; r.hidden = false; r.finished = false;
   r.onLoad({ id }); await new Promise(resolve => setTimeout(resolve, 0));
  };
  // setData replaces the adapter DOM; decode retained images so a pending
  // render cannot discard the image being checked midway through decode().
  const decodedImages = new Map();
  window.imageReady = async () => {
   const r = window.reader, src = r.data.page.image; let width = r.ratio[0] * 100, height = r.ratio[1] * 100;
   if (media[src]) {
    if (!decodedImages.has(src)) { const img = new Image(); img.src = media[src]; decodedImages.set(src, img); }
    const img = decodedImages.get(src); await img.decode(); width = img.naturalWidth; height = img.naturalHeight;
   }
   r.imageLoaded({ currentTarget: { dataset: { src } }, detail: { width, height } });
  };
 }, { sources, template, styles, books, media });
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
   const frame = art.getBoundingClientRect(), player = document.querySelector('.player, .fullscreen-pages')?.getBoundingClientRect();
   if (player) check(player.top >= frame.bottom - 1 || player.left >= frame.right - 1, 'player overlaps art');
   if (r.data.fullscreen) {
    const reader = document.querySelector('.reader').getBoundingClientRect();
    check(Math.abs(reader.height - innerHeight) < 1 && reader.top === 0, 'fullscreen does not fill window');
    check(Math.abs(frame.left - r.data.safeLeft) < 1 && Math.abs(frame.width - (r.data.landscape ? r.data.frameWidth : innerWidth)) < 1, 'fullscreen art frame dimensions mismatch');
    if (r.data.landscape) check(frame.height >= innerHeight - r.data.safeTop - r.data.safeBottom - 1, 'landscape illustration lost usable height');
    check(Boolean(player) === r.data.controlsVisible, 'fullscreen controls not toggled');
    check(!document.querySelector('.player, .languages, [bindtap="toggleLanguage"]'), 'fullscreen exposes language or audio settings');
    const navigation = document.querySelector('.fullscreen-pages');
    if (navigation) check(navigation.querySelectorAll('button').length === 2, 'fullscreen should only offer previous/next');
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
 const dialogueBooks = selectedBooks.filter(b => selectedIDs.length || b.pages.some(p => p.dialogue));
 assert.ok(dialogueBooks.length, 'no matching dialogue books');
 for (const [width, height] of sizes) {
  await p.setViewportSize({ width, height });
  for (const book of dialogueBooks) {
   await p.evaluate(id => window.openBook(id), book.id);
   await p.evaluate(() => window.imageReady());
   for (const mode of ['normal', 'fullscreen', 'fullscreen-controls']) {
    await p.evaluate(mode => { const r = window.reader; r.setData({ fullscreen: mode !== 'normal', controlsVisible: mode !== 'fullscreen' }); r.frame(); }, mode);
    const originalFrame = await p.locator('.frame').boundingBox();
    for (let i = 0; i < book.pages.length; i++) {
     if (!selectedIDs.length && !book.pages[i].dialogue) continue;
     for (const lang of ['zh', 'en']) {
      await p.evaluate(async ({ i, lang }) => { const r = window.reader; r.setData({ language: lang, showText: true }); r.show(i, false); await window.imageReady(); }, { i, lang });
      await verify(`${book.id}/${i + 1}/${lang}/${width}x${height}/${mode}`);
      const currentFrame = await p.locator('.frame').boundingBox();
      assert.equal(currentFrame.width, originalFrame.width); assert.equal(currentFrame.height, originalFrame.height);
      if (output && width === 568 && mode !== 'normal' && i === book.pages.findIndex(page => page.dialogue) && lang === 'zh') {
       fs.mkdirSync(output, { recursive: true });
       await p.screenshot({ path: path.join(output, book.id + '-568-' + mode + '.png') });
      }
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
 // Exercise an actual orientation transition without reopening the book.
 for (const book of dialogueBooks) {
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(async id => { await window.openBook(id); const r = window.reader; r.setData({ fullscreen: true, controlsVisible: false, language: 'en' }); r.show(1, false); await window.imageReady(); r.setData({ playing: true }); r.frame(); }, book.id);
  for (const [width, height] of [[844, 390], [390, 844]]) {
   await p.setViewportSize({ width, height });
   await p.evaluate(({ width, height }) => window.reader.onResize({ size: { windowWidth: width, windowHeight: height } }), { width, height });
   await verify(book.id + '/rotation/' + width);
   assert.equal(await p.evaluate(() => window.reader.data.landscape), width > height);
   assert.deepEqual(await p.evaluate(() => [window.reader.data.index, window.reader.data.language, window.reader.data.playing]), [1, 'en', true], 'rotation changed reading state');
  }
 }
 // Restore a dialogue page for interaction and image-error checks below.
 await p.evaluate(async id => { await window.openBook(id); const r = window.reader; r.show(r.pages.findIndex(page => page.dialogue), false); await window.imageReady(); }, dialogueBooks.find(b => b.pages.some(page => page.dialogue)).id);
 await p.evaluate(() => { const r = window.reader; r.setData({ fullscreen: true, controlsVisible: false }); r.frame(); r.controls(); r.controls(); }); await verify('fullscreen control toggle');
 await p.locator('.controls-hint').click(); await verify('tap to reveal fullscreen controls');
 assert.equal(await p.locator('.fullscreen-pages').count(), 1);
 await p.locator('.bubble').first().click();
 assert.equal(await p.evaluate(() => window.reader.data.controlsVisible), true, 'speech tap hid controls');
 await p.locator('.frame').click({ position: { x: 1, y: 1 } }); await verify('tap artwork to hide fullscreen controls');
 assert.equal(await p.locator('.fullscreen-pages').count(), 0);
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
    await window.openOrdinaryBook('sb-bean-in-a-pot'); const r = window.reader;
    for (let i = 0; i < r.pages.length; i++) r.show(i, false);
    r.setData({ fullscreen }); r.frame();
   }, fullscreen);
   assert.equal(await p.getByText('我们读完啦', { exact: true }).count(), 0);
   assert.equal(await p.getByText('读完啦', { exact: true }).count(), 0);
   assert.equal(await p.locator('.completion-panel').count(), 0);
   await p.waitForFunction(() => window.reader.data.completed, null, { timeout: 7000 });
   assert.equal(await p.evaluate(() => window.reader.data.celebrationEnabled), true);
   assert.equal(await p.locator('.completion-panel').evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; }), true, 'celebration must be visible immediately without page scrolling');
   assert.equal(await p.locator('.completion-speaker').textContent(), '小川说');
   assert.equal(await p.locator('.completion-panel .actions button').count(), 2);
   assert.equal(await p.locator('.completion-art').evaluate(e => getComputedStyle(e).animationName), 'character-pop');
   assert.equal(await p.locator('.completion-clap').evaluate(e => getComputedStyle(e).animationIterationCount), '6');
   assert.equal(await p.locator('.character-portrait').evaluate(e => e.clientWidth >= 130), true);
   assert.equal(await p.locator('.completion-message').evaluate(e => parseFloat(getComputedStyle(e).fontSize)), 18);
   if (localArt) {
    await p.locator('.character-portrait img').evaluate(async e => { await e.decode(); });
    assert.equal(await p.locator('.character-portrait img').evaluate(e => e.src.startsWith('data:image/webp;base64,')), true);
   }
   await p.locator('.completion-art').click();
   assert.equal(await p.evaluate(() => window.reader.data.characterReply), true);
   assert.ok((await p.locator('.completion-message').textContent()).includes('收到你的击掌啦'));
   assert.equal(await p.locator('.character-portrait').evaluate(e => getComputedStyle(e).animationName), 'character-highfive');
   assert.equal(await p.locator('.completion-panel').evaluate(e => e.scrollWidth <= e.clientWidth + 1), true);
   if (output) {
    fs.mkdirSync(output, { recursive: true });
    await p.locator('.completion-art').evaluate(async e => { await Promise.all(e.getAnimations().map(a => a.finished)); });
    await p.screenshot({ path: path.join(output, 'completion-' + width + 'x' + height + (fullscreen ? '-fullscreen' : '') + '.png') });
   }
   const buttons = await p.locator('.completion-panel .actions button').all();
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
 // Every catalog entry shares the same popup, including books without dialogue.
 // Trigger directly here; fake-clock unit cases cover the real silent/audio triggers.
 for (const [width, height] of [[320, 568], [568, 320], [1366, 768]]) {
  await p.setViewportSize({ width, height });
  for (const book of books) for (const fullscreen of [false, true]) {
   await p.evaluate(async ({ id, fullscreen }) => {
    await window.openOrdinaryBook(id); const r = window.reader;
    r.visited = new Set(r.pages.map((_, i) => i)); r.show(r.pages.length - 1, false);
    r.setData({ fullscreen }); r.frame(); r.finish();
   }, { id: book.id, fullscreen });
   const failures = await p.evaluate(() => {
    const errors = [], panel = document.querySelector('.completion-panel'), rect = panel.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > innerHeight + 1 || panel.scrollWidth > panel.clientWidth + 1) errors.push('popup outside viewport');
    if (!document.querySelector('.completion-art') || document.querySelectorAll('.completion-panel .actions button').length !== 2) errors.push('missing interaction or actions');
    if (document.querySelector('button.finish')) errors.push('manual completion button remains');
    return errors;
   });
   assert.deepEqual(failures, [], book.id + '/' + width + '/' + fullscreen); checks++;
  }
 }
 await p.evaluate(() => { const image = document.querySelector('.character-portrait img'); if (image) image.dispatchEvent(new Event('error')); });
 assert.equal(await p.locator('.completion-book').count(), 1, 'failed portrait must use the generic buddy');
 await p.locator('.completion-art').click(); assert.equal(await p.evaluate(() => window.reader.data.characterReply), true);
 console.log(`PASS: ${checks} mini-program WXML/WXSS browser adapter checks; ${dialogueBooks.length} selected books, ${selectedIDs.length ? 'all pages' : 'configured dialogue pages'}, both languages, five viewports, orientation transitions, stable art, fixed bubble mode, fullscreen with controls hidden/shown, image retry, all-book completion layouts and image-failure fallback. ${localArt ? 'Local illustration files for selected books and the completion demo' : 'Placeholder art'} with fixture API. Not a native device test.`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
