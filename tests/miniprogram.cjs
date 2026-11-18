const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram');
function client(responder = () => ({ ok: true }), timers = manualClock()) {
 const storage = new Map(), requests = [], audios = [], modules = new Map();
 let definition; const currentPages = [{}, {}];
 const wx = {
  getStorageSync: k => storage.get(k), setStorageSync: (k, v) => storage.set(k, structuredClone(v)), removeStorageSync: k => storage.delete(k),
  login: o => o.success({ code: 'one-use-code' }),
  request(o) { requests.push(o); Promise.resolve().then(() => responder(o)).then(data => { if (data?.networkError) o.fail(); else o.success({ statusCode: data?.status || 200, data: data?.body || data }); }).catch(o.fail); },
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 740, statusBarHeight: 24 }),
  setNavigationBarTitle() {}, showToast() {}, showModal(o) { if (Array.from(o.confirmText || '确定').length > 4) { o.fail?.({ errMsg: 'showModal:fail confirmText length should not larger than 4' }); return; } o.success({ confirm: true }); }, switchTab() {}, navigateTo() {}, navigateBack() {},
  createSelectorQuery() { return { in() { return this; }, selectAll() { return this; }, boundingClientRect() { return this; }, exec(fn) { fn([[]]); } }; },
  createInnerAudioContext() {
   const events = {}; const a = { destroyed: false, onPlay: f => events.play = f, onPause: f => events.pause = f, onError: f => events.error = f, onEnded: f => events.ended = f, play() { events.play?.(); }, pause() { events.pause?.(); }, stop() {}, destroy() { this.destroyed = true; }, emit: event => events[event]?.() }; audios.push(a); return a;
  }
 };
 function load(name) {
  const filename = name.endsWith('.js') ? name : name + '.js';
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const sandbox = { module, exports: module.exports, wx, Page: p => definition = p, Component: p => definition = p, App() {}, getCurrentPages: () => currentPages, console, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, require: name => load(path.resolve(path.dirname(filename), name)) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename }); return module.exports;
 }
 function page(name) {
  load(path.join(root, 'pages', name, 'index.js'));
  const p = { ...definition, data: structuredClone(definition.data) };
  p.setData = (patch, cb) => { for (const [key, value] of Object.entries(patch)) { const parts = key.split('.'); let o = p.data; while (parts.length > 1) o = o[parts.shift()]; o[parts[0]] = value; } cb?.(); };
  return p;
 }
 function component(name) {
  load(path.join(root, name, 'index.js'));
  return { ...definition.methods, ...definition, data: structuredClone(definition.data), setData(patch) { Object.assign(this.data, patch); } };
 }
 return { wx, storage, requests, audios, currentPages, component, load: name => load(path.join(root, name)), state: load(path.join(root, 'utils/state.js')), page };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function manualClock() {
 let now = 0, next = 0; const tasks = new Map();
 return {
  setTimeout(fn, delay) { const id = ++next; tasks.set(id, { fn, due: now + delay }); return id; },
  clearTimeout(id) { tasks.delete(id); },
  advance(ms) { now += ms; for (const [id, task] of [...tasks]) if (task.due <= now) { tasks.delete(id); task.fn(); } }
 };
}
const profile = { id: '10000', name: '小小读者', age: '3-4', needs_profile: false };
const session = { token: 'a'.repeat(64), user: profile, expires_at: '2099-01-01' };
test('guest reading stays available but favorites require login and ignore old guest cache', async () => {
 const c = client();
 c.storage.set('pic-guest-favorites', ['old-guest-book']);
 c.storage.set('pic-account-favorites', ['old-private-book']);
 await assert.rejects(c.state.toggleFavorite('book'), e => e.status === 401);
 assert.equal(c.state.favorites().length, 0); assert.equal(c.requests.length, 0);
 let target;
 c.wx.switchTab = options => target = options.url;
 const detail = c.page('detail'); detail.id = 'book'; await detail.favorite();
 assert.equal(target, '/pages/shelf/index'); assert.equal(c.requests.length, 0);
});
test('login loads only account favorites, retries failed reads, and never merges old guest cache', async () => {
 let fail = true;
 const c = client(o => {
  if (o.url.endsWith('/auth/wechat')) return session;
  if (o.url.endsWith('/favorites')) return fail ? { status: 503, body: { error: 'retry' } } : { items: ['account-only'] };
  if (o.url.endsWith('/profile')) return profile;
 });
 c.storage.set('pic-guest-favorites', ['guest', 'missing']);
 await assert.rejects(c.state.login()); assert.equal(c.state.favorites().length, 0);
 fail = false; await c.state.synchronize(); assert.deepEqual([...c.state.favorites()], ['account-only']);
 assert.equal(c.requests.some(r => r.method === 'PUT' || r.url.includes('/api/books?')), false);
 await c.state.logout(); assert.equal(c.state.favorites().length, 0); assert.equal(c.storage.get('pic-account-favorites').length, 0);
});
test('favorite toggles use the latest account state after synchronization', async () => {
 let active;
 const c = client(o => {
  if (o.url.endsWith('/favorites') && o.method === 'GET') return { items: ['book'] };
  if (o.url.endsWith('/favorites')) { active = o.data.active; return { ok: true }; }
  if (o.url.endsWith('/profile')) return profile;
 });
 c.storage.set('pic-session', session); c.storage.set('pic-account-favorites', []);
 await c.state.toggleFavorite('book'); assert.equal(active, false); assert.equal(c.state.favorites().length, 0);
});
test('expired token clears account state without copying private favorites to the guest', async () => {
 const c = client(() => ({ status: 401, body: { error: 'expired' } }));
 c.storage.set('pic-session', session); c.storage.set('pic-account-favorites', ['private']); c.storage.set('pic-guest-favorites', ['guest']);
 await assert.rejects(c.state.synchronize()); assert.equal(c.state.loggedIn(), false); assert.equal(c.state.favorites().length, 0);
});
test('a logout during synchronization cannot restore the previous account cache', async () => {
 let release; const pending = new Promise(r => release = r);
 const c = client(o => o.url.endsWith('/favorites') ? pending : o.url.endsWith('/profile') ? profile : { ok: true });
 c.storage.set('pic-session', session); const sync = c.state.synchronize(); await tick(); await c.state.logout(); release({ items: ['private'] }); await sync;
 assert.equal(c.state.loggedIn(), false); assert.equal(c.storage.get('pic-account-favorites').length, 0);
});
test('failed reading events retry the same ID and retain events added while sending', async () => {
 let fail = true, release;
 const c = client(() => fail ? { networkError: true } : new Promise(r => release = r));
 c.storage.set('pic-session', session);
 c.state.event('book', 'open', 'b'.repeat(32)); await tick(); const first = c.storage.get('pic-events-10000')[0];
 fail = false; const flush = c.state.flushEvents(); await tick(); c.state.event('other', 'open', 'c'.repeat(32));
 release({ ok: true }); await tick(); assert.equal(c.storage.get('pic-events-10000').length, 1); release({ ok: true }); await flush;
 assert.equal(c.storage.get('pic-events-10000').length, 0); assert.equal(c.requests[0].data.event_id, c.requests[1].data.event_id); assert.equal(c.requests[1].data.event_id, first.event_id);
});
test('first login requires an explicit age selection, then saves name and profile', async () => {
 let current = { id: '10000', name: '', age: '', needs_profile: true }, saved = 0;
 const c = client(o => {
  if (o.url.endsWith('/auth/wechat')) return { ...session, user: current };
  if (o.url.endsWith('/categories')) return { ages: [{ id: '0-2', name: '0–2岁' }, { id: '3-4', name: '3–4岁' }] };
  if (o.url.endsWith('/profile') && o.method === 'PUT') { saved++; current = { ...current, name: o.data.name || '小小读者', age: o.data.age, needs_profile: false }; return current; }
  if (o.url.endsWith('/profile')) return current;
  return { items: [] };
 });
 await c.state.login(); assert.equal(c.state.needsProfile(), true);
 await assert.rejects(c.state.toggleFavorite('book'), e => e.code === 'PROFILE_REQUIRED');
 const p = c.page('profile'); p.onLoad(); await tick(); assert.equal(p.data.ageIndex, 0); assert.equal(p.data.age, '');
 await p.save(); assert.equal(saved, 0);
 p.age({ detail: { value: 2 } }); await p.save();
 assert.equal(saved, 1); assert.equal(c.state.user().age, '3-4'); assert.equal(c.state.user().name, '小小读者'); assert.equal(c.state.needsProfile(), false);
});
test('reader stops stale audio on page/language change, error, hide and unload', async () => {
 const c = client(o => o.url.endsWith('/pages') ? { items: [{ page_number: 1, image: '/1.jpg', text_zh: '一', text_original: 'one', audio_zh: '/1.mp3', audio_original: '/1-en.mp3' }, { page_number: 2, image: '/2.jpg', text_zh: '二', text_original: 'two', audio_zh: '/2.mp3', audio_original: '/2-en.mp3' }] } : { id: 'book', title_zh: '故事', content_version: 'v1' });
 const p = c.page('reader'); p.onLoad({ id: 'book' }); await tick(); p.play(); const first = c.audios.at(-1); assert.equal(first.playbackRate, 1); assert.equal(p.data.playing, true);
 p.next(); assert.equal(first.destroyed, true); const second = c.audios.at(-1); first.emit('ended'); assert.equal(p.data.index, 1); assert.equal(p.data.completed, false);
 p.language({ currentTarget: { dataset: { language: 'en' } } }); assert.equal(second.destroyed, true); const third = c.audios.at(-1); assert.equal(third.src.endsWith('/2-en.mp3'), true);
 third.emit('error'); assert.equal(third.destroyed, true); assert.ok(p.data.audioError); p.play(); const retry = c.audios.at(-1); assert.equal(p.data.audioError, '');
 p.onHide(); assert.equal(retry.destroyed, true); p.onShow(); p.play(); const final = c.audios.at(-1); p.onUnload(); assert.equal(final.destroyed, true);
});
test('manual page skipping does not count a completion; all pages plus finish counts once per read', async () => {
 const c = client(); c.storage.set('pic-session', session); const p = c.page('reader'); p.id = 'book'; p.readingID = c.state.id(); p.visited = new Set(); p.serial = 0;
 p.pages = Array.from({ length: 3 }, (_, i) => ({ image: i + '.jpg', text_zh: '页', text_original: 'page' }));
 p.setData({ book: { content_version: 'v1' }, total: 3 }); p.show(0, false); p.show(2, false); p.finish(); assert.equal(p.data.completed, false);
 p.show(1, false); p.show(2, false); p.finish(); p.finish(); await tick(); assert.equal(c.requests.filter(r => r.url.endsWith('/events')).length, 1);
 p.again(); assert.equal(p.data.index, 0); assert.equal(p.visited.size, 1);
});

test('mobile playback expands on actual play, keeps pause stable, and restores at the session end', async () => {
 const c = client(o => o.url.endsWith('/pages') ? { items: [1,2].map(i => ({ image:i+'.jpg', text_zh:'页', audio_zh:'/'+i+'.mp3', audio_original:'/'+i+'-en.mp3' })) } : { id:'book', title_zh:'故事' });
 const p=c.page('reader');p.onLoad({id:'book'});await tick();
 p.play();assert.equal(p.data.fullscreen,true);
 p.play();assert.equal(p.data.playing,false);assert.equal(p.data.fullscreen,true);
 p.play();assert.equal(p.data.fullscreen,true);
 c.audios.at(-1).emit('ended');assert.equal(p.data.fullscreen,false);assert.equal(p.data.index,0);
 p.auto();p.play();const first=c.audios.at(-1);first.emit('ended');
 assert.equal(p.data.index,1);assert.equal(p.data.playing,true);assert.equal(p.data.fullscreen,true);
 first.emit('ended');assert.equal(p.data.index,1);assert.equal(p.data.fullscreen,true);
 c.audios.at(-1).emit('ended');assert.equal(p.data.completed,true);assert.equal(p.data.fullscreen,false);
 p.again();p.play();p.fullscreen();assert.equal(p.data.fullscreen,false);
 p.play();p.play();assert.equal(p.data.fullscreen,false,'resume overrode manual collapse');
 c.audios.at(-1).emit('error');assert.equal(p.data.fullscreen,false);
 p.play();assert.equal(p.data.fullscreen,true);p.onHide();assert.equal(p.data.fullscreen,false);
 p.onShow();p.fullscreen();p.play();c.audios.at(-1).emit('error');assert.equal(p.data.fullscreen,true,'error collapsed manual fullscreen');
 p.fullscreen();p.data.page.audio_zh='';p.play();assert.equal(p.data.fullscreen,false);
 c.wx.getWindowInfo=()=>({windowWidth:1366,windowHeight:768});p.data.page.audio_zh='/audio.mp3';p.play();assert.equal(p.data.fullscreen,false,'desktop auto expanded');
});
test('every fixture dialogue page preserves all speech in both languages and falls back on invalid ranges', () => {
 const dialogue = require('../miniprogram/utils/dialogue'); const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json')));
 let total = 0;
 for (const book of fixture.books) for (const page of book.pages) for (const lang of ['zh', 'en']) {
  const full = lang === 'zh' ? page.text_zh : page.text_original;
  assert.equal(dialogue.split(page, lang, false).narration, full);
  const result = dialogue.split(page, lang, true);
  if (!page.dialogue) { assert.equal(result.narration, full); continue; }
  assert.equal(result.bubbles.length, page.dialogue.parts.length);
  for (let i = 0; i < result.bubbles.length; i++) assert.equal(result.bubbles[i].words, full.slice(page.dialogue.parts[i].start[lang], page.dialogue.parts[i].end[lang]));
  total++;
 }
 assert.ok(total > 200);
});
test('dialogue only merges adjacent turns at the same known mouth anchor', () => {
 const d = require('../miniprogram/utils/dialogue');
 const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json')));
 const page = fixture.books.find(b => b.id === 'bd-a-beautiful-day').pages[0];
 for (const language of ['zh', 'en']) {
  const original = d.split(page, language, true).bubbles, grouped = d.merge(original, page, language);
  assert.equal(grouped.length, 2);
  for (const bubble of original) assert.ok(grouped.some(g => g.words.includes(bubble.words)));
  const changed = structuredClone(original); changed[1].part.target = [99, 99];
  assert.equal(d.merge(changed, page, language).length, 3);
 }
 const invalid = structuredClone(page); invalid.dialogue.parts[0].end.zh = 99999;
 assert.equal(d.split(invalid, 'zh', true).narration, page.text_zh);
 assert.equal(d.split(invalid, 'zh', true).bubbles.length, 0);
});
test('reader settings are validated and restored without changing the approved default rate', () => {
 const c = client(); c.storage.set('pic-reader-settings', { night: true, showText: false, auto: true, rate: 999, language: 'en', dialogueMode: false });
 const p = c.page('reader'); p.load = () => {}; p.onLoad({ id: 'book' });
 assert.equal(p.data.night, undefined); assert.equal(p.data.showText, true); assert.equal(p.data.language, 'en'); assert.equal('dialogueMode' in p.data, false); assert.equal(p.data.rate, 1);
 p.rate({ detail: { value: 2 } }); assert.equal(c.storage.get('pic-reader-settings').rate, 1.25);
 assert.equal('dialogueMode' in c.storage.get('pic-reader-settings'), false);
 assert.equal('night' in c.storage.get('pic-reader-settings'), false); assert.equal('showText' in c.storage.get('pic-reader-settings'), false);
});

test('reader always shows configured speech as bubbles and leaves narration below the picture', async () => {
 const page = { image: '/1.jpg', text_zh: '小猫跑过来。你好！', text_original: 'Cat runs over. Hello!', dialogue: { length: { zh: 10, en: 21 }, parts: [{ start: { zh: 7, en: 15 }, end: { zh: 10, en: 21 }, speaker: { zh: '小猫', en: 'Cat' }, x: 10, y: 10, target: [50, 50] }] } };
 // Derive UTF-16 ranges from this test's actual text.
 for (const [lang, full, speech] of [['zh', page.text_zh, '你好！'], ['en', page.text_original, 'Hello!']]) {
  page.dialogue.length[lang] = full.length; page.dialogue.parts[0].start[lang] = full.indexOf(speech); page.dialogue.parts[0].end[lang] = full.length;
 }
 const c = client(o => o.url.endsWith('/pages') ? { items: [page] } : { title_zh: '故事' });
 c.storage.set('pic-reader-settings', { dialogueMode: false });
 const p = c.page('reader'); p.onLoad({ id: 'book' }); await tick();
 assert.equal(p.data.bubbles[0].words, '你好！'); assert.equal(p.data.narration, '小猫跑过来。');
 p.language({ currentTarget: { dataset: { language: 'en' } } });
 assert.equal(p.data.bubbles[0].words, 'Hello!'); assert.equal(p.data.narration.trim(), 'Cat runs over.');
 p.show(0, false); assert.equal(p.data.bubbles[0].words, 'Hello!');
});

test('library pickers use API IDs, preserve the other filters and reset pagination', async () => {
 const c = client(o => o.url.endsWith('/categories') ? { ages: [{ id: '3-4', name: '3–4 岁' }], categories: [{ id: 'animals', name: '动物朋友' }] } : { items: [], total: 0 });
 const p = c.page('library'); p.options = {}; p.onLoad(); await tick();
 assert.deepEqual(Array.from(p.data.ages, a => a.name), ['全部', '3–4 岁']);
 assert.deepEqual(Array.from(p.data.categories, a => a.name), ['全部', '动物朋友']);
 p.setData({ q: '猫', items: [{ id: 'old' }], total: 25 }); p.age({ detail: { value: '1' } }); await tick();
 let url = new URL(c.requests.at(-1).url);
 assert.equal(url.searchParams.get('age'), '3-4'); assert.equal(url.searchParams.get('offset'), '0'); assert.equal(url.searchParams.get('q'), '猫');
 p.category({ detail: { value: '1' } }); await tick(); url = new URL(c.requests.at(-1).url);
 assert.equal(url.searchParams.get('age'), '3-4'); assert.equal(url.searchParams.get('category'), 'animals');
 p.age({ detail: { value: '0' } }); await tick(); url = new URL(c.requests.at(-1).url);
 assert.equal(url.searchParams.has('age'), false); assert.equal(url.searchParams.get('category'), 'animals');
 p.category({ detail: { value: '0' } }); await tick(); url = new URL(c.requests.at(-1).url);
 assert.equal(url.searchParams.has('category'), false);
 const count = c.requests.length; p.age({ detail: { value: '99' } }); assert.equal(c.requests.length, count);
});

test('failed library filter loading can retry without losing the book list', async () => {
 let fail = true;
 const c = client(o => o.url.endsWith('/categories') ? (fail ? { networkError: true } : { ages: [{ id: '0-2', name: '0–2 岁' }], categories: [] }) : { items: [{ id: 'book' }], total: 1 });
 const p = c.page('library'); p.onLoad(); await tick();
 assert.ok(p.data.filterError); assert.equal(p.data.filtersReady, false); assert.equal(p.data.items.length, 1);
 fail = false; await p.loadFilters();
 assert.equal(p.data.filterError, ''); assert.equal(p.data.filtersReady, true); assert.equal(p.data.ages.length, 2); assert.equal(p.data.items.length, 1);
});

test('failed account favorite changes preserve the server-confirmed state', async () => {
 const c = client(o => {
  if (o.url.endsWith('/favorites') && o.method === 'GET') return { items: ['book'] };
  if (o.url.endsWith('/favorites')) return { status: 503, body: { error: 'retry' } };
  return { items: [] };
 });
 c.storage.set('pic-session', session);
 await assert.rejects(c.state.toggleFavorite('book'));
 assert.deepEqual([...c.state.favorites()], ['book']);
});

test('guests never send or queue reading statistics, and account queues remain isolated', async () => {
 const c = client(); c.state.event('book', 'open', c.state.id()); await c.state.flushEvents();
 assert.equal(c.requests.length, 0); assert.equal(c.storage.size, 0);
 c.storage.set('pic-events-10001', [{ event_id: 'b'.repeat(32), book_id: 'private-other', kind: 'open', reading_id: 'c'.repeat(32) }]);
 c.storage.set('pic-session', session); c.state.event('book', 'open', c.state.id()); await tick();
 assert.equal(c.requests.length, 1); assert.equal(c.requests[0].data.book_id, 'book'); assert.equal('visitor_id' in c.requests[0].data, false);
 assert.equal(c.storage.get('pic-events-10001').length, 1);
});
test('books always open at page one and ignore legacy reading progress', async () => {
 const c = client(o => o.url.endsWith('/pages') ? { items: Array.from({ length: 3 }, (_, i) => ({ image: i + '.jpg', text_zh: '页', text_original: 'page' })) } : { id: 'book', content_version: 'v1', title_zh: '故事' });
 c.storage.set('pic-guest-progress', { book: { page: 3, language: 'en', content_version: 'v1' } });
 const p = c.page('reader'); p.onLoad({ id: 'book' }); await tick(); assert.equal(p.data.index, 0);
 assert.equal(c.requests.some(o => o.url.endsWith('/progress') || o.url.endsWith('/events')), false);
});

test('first successful login opens age choices once, and later logins preserve the saved age', async () => {
 let current = { id: '10000', name: '', age: '', needs_profile: true }, ageLoads = 0;
 const c = client(o => {
  if (o.url.endsWith('/auth/wechat')) return { ...session, user: current };
  if (o.url.endsWith('/categories')) { ageLoads++; return { ages: [{ id: '0-2', name: '0–2岁' }, { id: '3-4', name: '3–4岁' }] }; }
  if (o.url.endsWith('/profile') && o.method === 'PUT') { current = { ...current, name: '小小读者', age: o.data.age, needs_profile: false }; return current; }
  if (o.url.endsWith('/profile')) return current;
  return { items: [] };
 });
 const shelf = c.page('shelf'); await shelf.login();
 assert.equal(shelf.data.ageDialog, true); assert.equal(shelf.data.firstAge, '');
 await shelf.saveFirstAge(); assert.equal(current.age, '');
 shelf.selectFirstAge({ currentTarget: { dataset: { age: '3-4' } } }); await shelf.saveFirstAge();
 assert.equal(shelf.data.ageDialog, false); assert.equal(current.age, '3-4');
 await shelf.logout(); await shelf.login();
 assert.equal(shelf.data.ageDialog, false); assert.equal(ageLoads, 1);
 const personal = c.page('profile'); personal.onLoad(); await tick(); assert.equal(personal.data.age, '3-4');
 personal.age({ detail: { value: 1 } }); await personal.save(); assert.equal(current.age, '0-2');
});

test('an expired session while choosing age closes the dialog and restores the guest shelf', async () => {
 const c = client(() => ({ status: 401, body: { error: 'expired' } }));
 c.storage.set('pic-session', { ...session, user: { ...profile, age: '' } });
 const shelf = c.page('shelf'); shelf.setData({ ageDialog: true, firstAge: '3-4' });
 await shelf.saveFirstAge();
 assert.equal(c.state.loggedIn(), false); assert.equal(shelf.data.ageDialog, false); assert.equal(shelf.data.loggedIn, false);
});

test('login confirmation failure is visible, cancellation makes no request, and repeated taps are ignored', async () => {
 const c = client(); const shelf = c.page('shelf');
 let modal;
 c.wx.showModal = options => modal = options;
 const first = shelf.login(); await shelf.login();
 assert.equal(shelf.data.busy, true); assert.equal(modal.confirmText, '同意登录');
 modal.success({ confirm: false }); await first;
 assert.equal(c.requests.length, 0); assert.equal(shelf.data.busy, false); assert.equal(shelf.data.loginError, '');
 const retry = shelf.login(); modal.fail(); await retry;
 assert.ok(shelf.data.loginError.includes('确认')); assert.equal(shelf.data.busy, false); assert.equal(c.requests.length, 0);
});

test('unavailable online login service shows a persistent error and allows retry', async () => {
 const c = client(() => ({ status: 405, body: 'Method Not Allowed' }));
 const shelf = c.page('shelf'); await shelf.login();
 assert.equal(shelf.data.loginError, '登录服务暂未上线，请稍后再试');
 assert.equal(shelf.data.busy, false); assert.equal(c.state.loggedIn(), false);
 await shelf.load(); assert.ok(shelf.data.loginError); await shelf.login(); assert.equal(c.requests.length, 2);
});

test('shelf paginates favorites in saved order, clamps after removal, and opens the selected book', async () => {
 let ids = Array.from({ length: 18 }, (_, i) => 'book-' + i);
 const c = client(o => {
  if (o.url.endsWith('/profile')) return profile;
  if (o.url.endsWith('/favorites')) return { items: ids };
  const requested = new URL(o.url).searchParams.get('ids').split(',');
  return { items: requested.filter(id => id !== 'book-3').reverse().map(id => ({ id, title_zh: id, cover: '/cover.jpg' })) };
 });
 c.storage.set('pic-session', session);
 const shelf = c.page('shelf'); await shelf.load();
 assert.equal(shelf.data.total, 17); assert.equal(shelf.data.pageCount, 3);
 assert.deepEqual([...shelf.data.items.map(b => b.id)], ids.filter(id => id !== 'book-3').slice(0, 8));
 shelf.previous(); assert.equal(shelf.data.page, 1);
 shelf.next(); assert.equal(shelf.data.page, 2); assert.equal(shelf.data.items.length, 8);
 shelf.next(); assert.equal(shelf.data.page, 3); assert.equal(shelf.data.items.length, 1);
 shelf.next(); assert.equal(shelf.data.page, 3);
 let target; c.wx.navigateTo = o => target = o.url;
 shelf.openBook({ currentTarget: { dataset: { id: 'book-17' } } });
 assert.equal(target, '/pages/detail/index?id=book-17');
 target = null; shelf.openBook({ currentTarget: { dataset: { id: 'not-listed' } } }); assert.equal(target, null);
 ids = ids.slice(0, 10); await shelf.load();
 assert.equal(shelf.data.page, 2); assert.equal(shelf.data.pageCount, 2); assert.equal(shelf.data.items.length, 1);
 ids = []; await shelf.load();
 assert.equal(shelf.data.page, 1); assert.equal(shelf.data.pageCount, 0); assert.equal(shelf.data.total, 0);
 assert.equal(shelf.data.items.length, 0);
});

test('shelf drops delayed private books when the account logs out during loading', async () => {
 let release;
 const c = client(o => {
  if (o.url.endsWith('/profile')) return profile;
  if (o.url.endsWith('/favorites')) return { items: ['private-book'] };
  if (o.url.includes('/api/books?')) return new Promise(resolve => release = resolve);
  return { ok: true };
 });
 c.storage.set('pic-session', session);
 const shelf = c.page('shelf'), pending = shelf.load(); await tick();
 await c.state.logout(); release({ items: [{ id: 'private-book' }] }); await pending;
 assert.equal(shelf.data.loggedIn, false); assert.equal(shelf.data.items.length, 0); assert.equal(shelf.data.total, 0);
 shelf.next(); assert.equal(shelf.data.items.length, 0);
});

test('compact packing uses measured content height instead of stretching short speech into cells', () => {
 const d = require('../miniprogram/utils/dialogue');
 const bubbles = [20, 80].map(x => ({ part: { x, y: 10, width: 44, target: [x, 60] } }));
 const choices = bubbles.map(() => [{ w: 96, h: 52, header: 28 }]);
 const result = d.pack(bubbles, choices, 374, 187);
 assert.equal(result.overflow, false); assert.equal(result.placements.length, 2);
 for (const r of result.placements) { assert.equal(r.h, 52); assert.equal(r.w, 96); assert.equal(r.scroll, false); }
 const tiny = d.pack(bubbles.slice(0, 1), [[{ w: 64, h: 196, header: 100 }]], 80, 130);
 assert.equal(tiny.overflow, true); assert.ok(tiny.placements[0].h >= 124); assert.equal(tiny.placements[0].scroll, true);
});

test('home reloads recommendations with account changes and removes duplicates from new books', async () => {
 const c = client(o => o.url.endsWith('/recommendations') ? { items: [{ id: o.header.Authorization ? 'age-unread' : 'popular' }] } : { items: [{ id: 'popular' }, { id: 'age-unread' }, { id: 'new' }] });
 const p = c.page('home'); p.onShow(); await tick();
 assert.equal(p.data.featured[0].id, 'popular'); assert.deepEqual(Array.from(p.data.recent, b => b.id), ['age-unread', 'new']);
 c.storage.set('pic-session', session); p.onShow(); await tick();
 assert.equal(p.data.featured[0].id, 'age-unread'); assert.equal(c.requests.at(-2).header.Authorization, 'Bearer '+session.token);
 c.storage.delete('pic-session'); p.onShow(); await tick(); assert.equal(p.data.featured[0].id, 'popular');
});

test('expired recommendation session becomes a guest and stale personal responses cannot replace guest results', async () => {
 let release;
 const c = client(o => o.url.endsWith('/recommendations') ? (o.header.Authorization ? { status:401, body:{error:'expired'} } : {items:[{id:'guest'}]}) : {items:[]});
 c.storage.set('pic-session', session);
 const p = c.page('home'); p.onShow(); await tick();
 assert.equal(p.data.featured[0].id,'guest'); assert.equal(c.state.loggedIn(),false); assert.equal(p.data.error,'');
 const delayed = client(o => o.url.endsWith('/recommendations') ? (o.header.Authorization ? new Promise(r=>release=r) : {items:[{id:'guest'}]}) : {items:[]});
 delayed.storage.set('pic-session',session); const other=delayed.page('home'); other.onShow(); await tick();
 delayed.storage.delete('pic-session'); other.onShow(); await tick(); release({items:[{id:'private'}]}); await tick();
 assert.equal(other.data.featured[0].id,'guest');
});


test('fullscreen uses the window and safe areas, reveals controls on demand and keeps art stable between pages', async () => {
 const c = client(o => o.url.endsWith('/pages') ? { items: [1, 2].map(i => ({ image: '/' + i + '.jpg', text_zh: '旁白', text_original: 'Narration' })) } : { title_zh: '故事' });
 c.wx.getWindowInfo = () => ({ windowWidth: 390, windowHeight: 844, screenHeight: 844, statusBarHeight: 24, safeArea: { bottom: 810 } });
 c.wx.getMenuButtonBoundingClientRect = () => ({ bottom: 56 });
 const p = c.page('reader'); p.onLoad({ id: 'book' }); await tick();
 p.fullscreen();
 assert.equal(p.data.controlsVisible, false); assert.equal(p.frameWidth, 390); assert.equal(p.data.safeTop, 64); assert.equal(p.data.safeBottom, 34);
 const height = p.frameH;
 assert.equal(p.frameH + p.data.safeTop + 44 + p.data.narrationHeight + 36 + p.data.safeBottom, 844);
 p.next(); p.toggleLanguage(); assert.equal(p.frameH, height);
 p.controls(); assert.equal(p.data.controlsVisible, true); assert.ok(p.frameH < height);
 p.controls(); assert.equal(p.frameH, height);
 c.wx.getWindowInfo = () => ({ windowWidth: 844, windowHeight: 390, statusBarHeight: 0 });
 c.wx.getMenuButtonBoundingClientRect = () => ({ bottom: 32 }); p.onResize();
 assert.equal(p.data.landscape, true); assert.ok(p.frameWidth > 400 && p.frameWidth < 844); assert.equal(p.frameH, 342);
 const landscapeHeight = p.frameH; p.controls(); assert.equal(p.frameH, landscapeHeight, 'landscape controls shrank the art');
 p.fullscreen(); assert.equal(p.data.fullscreen, false); assert.equal(p.data.controlsVisible, true);
});

test('completed markers use only the current account and complete events, never opens or guest state', async () => {
 const c = client(o => o.url.endsWith('/completed-books') ? { items: ['server-finished'] } : { ok: true });
 c.storage.set('pic-account-completed', { user_id: 'other', items: ['private'] });
 assert.equal(c.state.completedBooks().length, 0);
 await c.state.syncCompleted(); assert.equal(c.requests.length, 0);
 c.storage.set('pic-session', session);
 c.state.event('opened', 'open', 'a'.repeat(32)); await tick();
 assert.equal(c.state.markCompleted([{ id: 'opened' }])[0].completed, false);
 await c.state.syncCompleted();
 assert.equal(c.state.markCompleted([{ id: 'server-finished' }])[0].completed, true);
 assert.equal(c.state.markCompleted([{ id: 'private' }])[0].completed, false);
 c.state.event('just-finished', 'complete', 'b'.repeat(32));
 assert.equal(c.state.markCompleted([{ id: 'just-finished' }])[0].completed, true);
 await tick(); assert.ok(c.state.completedBooks().includes('just-finished'));
 await c.state.logout(); assert.equal(c.state.completedBooks().length, 0);
});

test('late completion responses cannot restore a logged-out account or erase a newer completion', async () => {
 let release;
 const c = client(o => o.url.endsWith('/completed-books') ? new Promise(r => release = r) : { ok: true });
 c.storage.set('pic-session', session);
 const stale = c.state.syncCompleted(); await tick();
 c.state.event('new-finish', 'complete', 'b'.repeat(32)); await tick();
 release({ items: ['earlier-finish'] }); await stale;
 assert.deepEqual([...c.state.completedBooks()].sort(), ['earlier-finish', 'new-finish']);
 const late = c.state.syncCompleted(); await tick(); await c.state.logout();
 release({ items: ['private'] }); await late;
 assert.equal(c.state.completedBooks().length, 0);
 assert.equal(c.storage.get('pic-account-completed'), null);
});

test('returning to the library refreshes completed marks without resetting filters or loaded books', async () => {
 let fail = false;
 const c = client(() => fail ? { networkError: true } : { items: ['finished'] });
 c.storage.set('pic-session', session);
 const library = c.page('library'); library.setData({ q: '故事', age: '3-4', items: [{ id: 'finished' }, { id: 'unread' }] });
 await library.onShow();
 assert.equal(library.data.items[0].completed, true); assert.equal(library.data.items[1].completed, false);
 assert.equal(library.data.q, '故事'); assert.equal(library.data.age, '3-4');
 fail = true; await library.onShow(); assert.equal(library.data.items[0].completed, true);
 c.storage.delete('pic-session'); await library.onShow(); assert.equal(library.data.items[0].completed, false);
});

test('explicit end-of-book preview still works without a server rollout flag', async () => {
 const book = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json'))).books.find(b => b.id === 'sb-bean-in-a-pot');
 assert.ok(book);
 const c = client(o => o.url.endsWith('/pages') ? { items: book.pages } : book);
 const p = c.page('reader'); p.onLoad({ id: book.id, celebrate: '1' }); await tick();
 for (let i = 0; i < book.pages.length; i++) p.show(i, false);
 p.finish();
 assert.equal(p.data.completed, true); assert.equal(p.data.completionCharacter.name, '小川');
 assert.ok(p.data.completionCharacter.image.endsWith('/page-001.webp'));
 assert.match(p.data.completionCharacter.portraitStyle, /left:-90%/);
 p.again(); assert.equal(p.data.completed, false); assert.equal(p.data.completionCharacter, null);
 const normal = c.page('reader'); normal.onLoad({ id: book.id }); await tick();
 for (let i = 0; i < book.pages.length; i++) normal.show(i, false);
 normal.finish(); assert.equal(normal.data.celebrationEnabled, true); assert.equal(normal.data.completionCharacter.name, '小川');
});

test('ordinary detail entry celebrates without a server rollout field after completing every page', async () => {
 const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json'))).books.find(b => b.id === 'sb-bean-in-a-pot');
 const book = fixture;
 const c = client(o => o.url.endsWith('/pages') ? { items: book.pages } : book);
 const detail = c.page('detail'); detail.onLoad({ id: book.id }); await tick();
 let destination; c.wx.navigateTo = o => destination = o.url; detail.read();
 assert.equal(destination, '/pages/reader/index?id=' + book.id);
 const reader = c.page('reader'); reader.onLoad({ id: book.id }); await tick();
 assert.equal(reader.data.celebrationEnabled, true);
 reader.show(book.pages.length - 1, false); reader.finish(); assert.equal(reader.data.completed, false);
 for (let i = 0; i < book.pages.length; i++) reader.show(i, false);
 reader.finish(); assert.equal(reader.data.completed, true); assert.equal(reader.data.completionCharacter.name, '小川');
 reader.again(); assert.equal(reader.data.completed, false); assert.equal(reader.data.index, 0);
 assert.equal(reader.data.celebrationEnabled, true);
});

test('ordinary entry celebrates after the final audio of continuous playback, including manual fullscreen', async () => {
 const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json'))).books.find(b => b.id === 'sb-bean-in-a-pot');
 for (const fullscreen of [false, true]) {
  const c = client(o => o.url.endsWith('/pages') ? { items: fixture.pages } : fixture);
  const reader = c.page('reader'); reader.onLoad({ id: fixture.id }); await tick();
  reader.setData({ auto: true }); if (fullscreen) reader.fullscreen(); reader.play();
  for (let i = 0; i < fixture.pages.length; i++) {
   assert.equal(reader.data.index, i); assert.equal(reader.data.completed, false);
   c.audios.at(-1).emit('ended');
  }
  assert.equal(reader.data.completed, true); assert.equal(reader.data.completionCharacter.name, '小川');
  assert.equal(reader.data.playing, false); assert.equal(reader.data.fullscreen, fullscreen);
 }
});


test('silent final-page celebration waits four seconds and cancels on navigation, background and unload', async () => {
 const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json'))).books.find(b => b.id === 'sb-bean-in-a-pot');
 for (const action of ['previous', 'onHide', 'onUnload']) {
  const clock = manualClock(), c = client(o => o.url.endsWith('/pages') ? { items: fixture.pages } : fixture, clock);
  const reader = c.page('reader'); reader.onLoad({ id: fixture.id }); await tick();
  reader.show(fixture.pages.length - 1, false); clock.advance(10000); assert.equal(reader.data.completed, false, 'skipping pages completed the book');
  for (let i = 0; i < fixture.pages.length; i++) reader.show(i, false);
  clock.advance(3999); assert.equal(reader.data.completed, false);
  reader[action](); clock.advance(10000); assert.equal(reader.data.completed, false);
  if (action === 'onUnload') continue;
  if (action === 'previous') reader.next(); else reader.onShow();
  clock.advance(3999); assert.equal(reader.data.completed, false);
  clock.advance(1); assert.equal(reader.data.completed, true); assert.equal(reader.data.completionCharacter.name, '小川');
  reader.again(); clock.advance(10000); assert.equal(reader.data.completed, false);
 }
});

test('starting final-page audio cancels silent completion and waits for its natural end, never pause or error', async () => {
 const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json'))).books.find(b => b.id === 'sb-bean-in-a-pot');
 const clock = manualClock(), c = client(o => o.url.endsWith('/pages') ? { items: fixture.pages } : fixture, clock);
 const reader = c.page('reader'); reader.onLoad({ id: fixture.id }); await tick();
 for (let i = 0; i < fixture.pages.length; i++) reader.show(i, false);
 clock.advance(3000); reader.play(); clock.advance(10000); assert.equal(reader.data.completed, false);
 reader.play(); clock.advance(10000); assert.equal(reader.data.completed, false, 'paused audio triggered completion');
 reader.play(); c.audios.at(-1).emit('error'); clock.advance(10000); assert.equal(reader.data.completed, false, 'audio error triggered completion');
 reader.play(); c.audios.at(-1).emit('ended'); assert.equal(reader.data.completed, true);
 assert.equal(reader.data.completionCharacter.name, '小川'); assert.equal(reader.data.playing, false);
});

test('completion recording runs once after presentation, and stale presentation callbacks cannot finish a new read', async () => {
 const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json'))).books.find(b => b.id === 'sb-bean-in-a-pot');
 const clock = manualClock(), c = client(o => o.url.endsWith('/pages') ? { items: fixture.pages } : fixture, clock);
 c.storage.set('pic-session', session);
 const reader = c.page('reader'); reader.onLoad({ id: fixture.id }); await tick();
 for (let i = 0; i < fixture.pages.length; i++) reader.show(i, false);
 const callbacks = [], setData = reader.setData;
 reader.setData = (patch, cb) => { setData(patch, patch.completed ? undefined : cb); if (patch.completed && cb) callbacks.push(cb); };
 clock.advance(4000); assert.equal(reader.data.completed, true);
 assert.equal(c.state.completedBooks().includes(fixture.id), false);
 assert.equal(c.requests.filter(r => r.url.endsWith('/events')).length, 0);
 reader.finish(); callbacks[0](); callbacks[1]();
 assert.equal(c.requests.filter(r => r.url.endsWith('/events')).length, 1);
 assert.equal(c.state.completedBooks().includes(fixture.id), true);
 reader.again(); for (let i = 0; i < fixture.pages.length; i++) reader.show(i, false);
 clock.advance(4000); const stale = callbacks.at(-1); reader.again(); stale();
 assert.equal(reader.data.completed, false); assert.equal(reader.finished, false);
 assert.equal(c.requests.filter(r => r.url.endsWith('/events')).length, 1);
});

test('the completion character responds to a tap without recording another completion and resets on restart', async () => {
 const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json'))).books.find(b => b.id === 'sb-bean-in-a-pot');
 const clock = manualClock(), c = client(o => o.url.endsWith('/pages') ? { items: fixture.pages } : fixture, clock);
 c.storage.set('pic-session', session);
 const reader = c.page('reader'); reader.onLoad({ id: fixture.id }); await tick();
 for (let i = 0; i < fixture.pages.length; i++) reader.show(i, false);
 clock.advance(4000); assert.equal(reader.data.completed, true);
 reader.greet(); assert.equal(reader.data.characterReply, true);
 reader.greet(); clock.advance(1800); assert.equal(reader.data.characterReply, false);
 assert.equal(c.requests.filter(r => r.url.endsWith('/events')).length, 1);
 reader.greet(); reader.onHide(); assert.equal(reader.data.characterReply, false);
 reader.onShow(); reader.greet(); reader.again(); clock.advance(10000);
 assert.equal(reader.data.completed, false); assert.equal(reader.data.characterReply, false);
});

test('configured age avatars follow saved profiles and logout, with a default and image failure fallback', async () => {
 let current = { ...profile };
 const c = client(o => {
  if (o.url.endsWith('/profile') && o.method === 'PUT') { current = { ...current, ...o.data }; return current; }
  if (o.url.endsWith('/profile')) return current;
  if (o.url.endsWith('/categories')) return { ages: [{ id: '0-2', name: '0–2 岁' }, { id: '3-4', name: '3–4 岁' }, { id: '5-6', name: '5–6 岁' }] };
  return { items: [] };
 });
 const config = c.load('config/avatars.js');
 Object.assign(config, { defaultAvatar: '/assets/default.png', byAge: { '0-2': '/assets/baby.png', '3-4': '/assets/young.png', '5-6': '/assets/older.png' } });
 c.storage.set('pic-session', session);
 const shelf = c.page('shelf'); await shelf.load();
 assert.equal(shelf.data.avatar, '/assets/young.png'); assert.equal(shelf.data.ageLabel, '3–4 岁');
 const editor = c.page('profile'); await editor.load();
 editor.age({ detail: { value: '3' } }); assert.equal(editor.data.avatar, '/assets/older.png');
 await editor.save(); await shelf.load(); assert.equal(shelf.data.avatar, '/assets/older.png');
 shelf.avatarFailed(); assert.equal(shelf.data.avatarError, true);
 editor.age({ detail: { value: '1' } }); await editor.save(); await shelf.load();
 assert.equal(shelf.data.avatar, '/assets/baby.png'); assert.equal(shelf.data.avatarError, false);
 await c.state.logout(); await shelf.load(); assert.equal(shelf.data.avatar, '/assets/default.png');
 config.defaultAvatar = ''; assert.equal(c.load('utils/avatar.js').forAge('unknown'), '');
});

test('older backends without completed-books keep account synchronization and local completions working', async () => {
 let status = 404;
 const c = client(o => o.url.endsWith('/completed-books') ? { status, body: { error: '接口不存在' } } : o.url.endsWith('/profile') ? profile : { items: [] });
 c.storage.set('pic-session', session);
 c.storage.set('pic-account-completed', { user_id: profile.id, items: ['finished'] });
 const shelf = c.page('shelf'); await shelf.load();
 assert.equal(shelf.data.syncError, ''); assert.deepEqual([...c.state.completedBooks()], ['finished']);
 status = 503; await shelf.load(); assert.ok(shelf.data.syncError);
});


test('every catalog book automatically celebrates after silent reading or final audio, without per-book flags', async () => {
 const books = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json'))).books;
 let portraits = 0, buddies = 0;
 for (const book of books) for (const audio of [false, true]) {
  const clock = manualClock(), c = client(o => o.url.endsWith('/pages') ? { items: book.pages } : book, clock);
  const reader = c.page('reader'), events = [];
  c.state.event = (id, type) => { assert.equal(reader.data.completed, true); events.push({ id, type }); };
  reader.onLoad({ id: book.id }); await tick();
  for (let i = 0; i < book.pages.length; i++) reader.show(i, false);
  assert.equal(reader.data.completed, false, book.id);
  if (audio) { reader.play(); clock.advance(5000); assert.equal(reader.data.completed, false); c.audios.at(-1).emit('ended'); }
  else { clock.advance(3999); assert.equal(reader.data.completed, false); clock.advance(1); }
  assert.equal(reader.data.completed, true, book.id); assert.equal(events.length, 1);
  if (reader.data.completionCharacter) {
   portraits++; assert.equal(book.pages.some(p => reader.data.completionCharacter.image.endsWith(p.image)), true);
   assert.equal(/NaN|Infinity/.test(reader.data.completionCharacter.portraitStyle), false);
  } else buddies++;
  reader.greet(); assert.equal(reader.data.characterReply, true);
  reader.finish(); clock.advance(10000); assert.equal(events.length, 1);
  reader.again(); assert.equal(reader.data.completed, false); assert.equal(reader.data.characterReply, false);
  reader.onUnload();
 }
 assert.ok(portraits > 0 && buddies > 0);
});

test('completion portraits reject invalid anchors, ratios, speech and images and recover from image failures', async () => {
 const book = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json'))).books.find(b => b.id === 'sb-bean-in-a-pot');
 const c = client(), reader = c.page('reader'), valid = structuredClone(book.pages[0]);
 for (const change of [p => p.image = '', p => p.dialogue.aspect_ratio = null, p => p.dialogue.aspect_ratio = [1, 0], p => p.dialogue.aspect_ratio = [NaN, 1], p => p.dialogue.parts.forEach(part => part.target = [Infinity, 50]), p => p.dialogue.parts.forEach(part => part.target = [-1, 50]), p => p.dialogue.parts.forEach(part => part.speaker.zh = ' '), p => p.dialogue.parts[0].end.zh = 99999]) {
  const page = structuredClone(valid); change(page); reader.pages = [page]; assert.equal(reader.completionPortrait(), null);
 }
 reader.pages = [valid]; const portrait = reader.completionPortrait(); assert.ok(portrait);
 reader.setData({ completed: true, completionCharacter: portrait });
 reader.portraitFailed({ currentTarget: { dataset: { src: 'previous-image' } } }); assert.ok(reader.data.completionCharacter);
 reader.portraitFailed({ currentTarget: { dataset: { src: portrait.image } } }); assert.equal(reader.data.completionCharacter, null);
 reader.greet(); assert.equal(reader.data.characterReply, true, 'generic buddy must still respond');
});

test('custom tab selection follows the visible route and handles rapid taps, failures and programmatic returns', async () => {
 const c = client(), bar = c.component('custom-tab-bar');
 c.currentPages[1].route = 'pages/library/index'; bar.lifetimes.attached.call(bar); assert.equal(bar.data.selected, 1);
 const calls = []; c.wx.switchTab = o => calls.push(o);
 bar.switchTab({ currentTarget: { dataset: { index: 1 } } }); assert.equal(calls.length, 0);
 bar.switchTab({ currentTarget: { dataset: { index: 2 } } }); bar.switchTab({ currentTarget: { dataset: { index: 0 } } });
 assert.equal(calls.length, 1); assert.equal(calls[0].url, '/pages/shelf/index'); assert.equal(bar.data.selected, 1);
 calls[0].fail(); calls[0].complete(); assert.equal(bar.data.selected, 1);
 bar.switchTab({ currentTarget: { dataset: { index: 2 } } });
 c.currentPages[1].route = 'pages/shelf/index'; calls[1].success(); calls[1].complete(); assert.equal(bar.data.selected, 2);
 c.currentPages[1].route = 'pages/home/index'; bar.pageLifetimes.show.call(bar); assert.equal(bar.data.selected, 0);
 for (const name of ['home', 'library', 'shelf']) {
  const page = c.page(name); let synced = false; page.getTabBar = () => ({ sync() { synced = true; } }); page.load = async () => {};
  await page.onShow(); assert.equal(synced, true, name);
 }
});


test('switching language after paused audio restarts the silent final-page wait', async () => {
 const book = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/library.json'))).books.find(b => b.id === 'sb-bean-in-a-pot');
 const clock = manualClock(), c = client(o => o.url.endsWith('/pages') ? { items: book.pages } : book, clock);
 const reader = c.page('reader'); reader.onLoad({ id: book.id }); await tick();
 for (let i = 0; i < book.pages.length; i++) reader.show(i, false);
 reader.play(); reader.play(); clock.advance(5000); assert.equal(reader.data.completed, false);
 reader.language({ currentTarget: { dataset: { language: 'en' } } });
 clock.advance(3999); assert.equal(reader.data.completed, false); clock.advance(1); assert.equal(reader.data.completed, true);
});


test('fullscreen rotation uses resize-event dimensions while window metrics catch up, and restores portrait', async () => {
 const c = client(o => o.url.endsWith('/pages') ? { items: [{ image: '/image.webp', text_zh: '旁白', text_original: 'Story', audio_zh: '/audio.mp3' }] } : { title_zh: '故事' });
 let info = { windowWidth: 390, windowHeight: 844, screenHeight: 844, statusBarHeight: 24, safeArea: { left: 0, right: 390, bottom: 810 } };
 c.wx.getWindowInfo = () => info; c.wx.getMenuButtonBoundingClientRect = () => ({ bottom: info.windowWidth === 390 ? 56 : 32 });
 const reader = c.page('reader'); reader.onLoad({ id: 'book' }); await tick(); reader.fullscreen();
 reader.play(); const audio = c.audios.at(-1);
 reader.onResize({ size: { windowWidth: 844, windowHeight: 390 } });
 assert.equal(reader.data.landscape, true); assert.equal(reader.data.viewportHeight, 390); assert.ok(reader.frameWidth > 400 && reader.frameWidth < 600);
 assert.equal(reader.data.safeLeft, 8, 'stale portrait safe area was reused');
 info = { windowWidth: 844, windowHeight: 390, screenHeight: 390, statusBarHeight: 0, safeArea: { left: 44, right: 800, bottom: 369 } };
 reader.frame(); assert.equal(reader.data.safeLeft, 44); assert.equal(reader.data.safeRight, 44); assert.equal(reader.data.safeBottom, 21);
 const height = reader.frameH; reader.controls(); assert.equal(reader.frameH, height); assert.ok(reader.data.narrationHeight > 24);
 reader.onResize({ size: { windowWidth: 390, windowHeight: 844 } }); assert.equal(reader.data.landscape, false); assert.equal(reader.frameWidth, 390);
 assert.equal(reader.audio, audio); assert.equal(audio.destroyed, false); assert.equal(c.audios.length, 1); assert.equal(reader.data.playing, true);
 reader.onUnload();
});

test('detail credits show creator names while retaining original source records', async () => {
 const source = { id: 'book', title_zh: '故事', author: 'StoryBloom（AI生成，项目校对）', illustrator: 'StoryBloom（AI生成原图）', license: { attribution: '完整来源记录' } };
 const c = client(() => source), detail = c.page('detail'); detail.onLoad({ id: 'book' }); await tick();
 assert.equal(detail.data.book.author, 'StoryBloom'); assert.equal(detail.data.book.illustrator, 'StoryBloom');
 assert.equal(source.author, 'StoryBloom（AI生成，项目校对）'); assert.equal(detail.data.book.license.attribution, '完整来源记录');
 const book = c.load('utils/api.js').book({ author: '杜甫 / StoryBloom', illustrator: '真实插画师（翻译版）' });
 assert.equal(book.author, '杜甫 / StoryBloom'); assert.equal(book.illustrator, '真实插画师（翻译版）');
});
