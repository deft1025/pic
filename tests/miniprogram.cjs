const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram');
function client(responder = () => ({ ok: true })) {
 const storage = new Map(), requests = [], audios = [], modules = new Map();
 let definition;
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
  const sandbox = { module, exports: module.exports, wx, Page: p => definition = p, App() {}, getCurrentPages: () => [{}, {}], console, setTimeout, clearTimeout, require: name => load(path.resolve(path.dirname(filename), name)) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename }); return module.exports;
 }
 function page(name) {
  load(path.join(root, 'pages', name, 'index.js'));
  const p = { ...definition, data: structuredClone(definition.data) };
  p.setData = (patch, cb) => { for (const [key, value] of Object.entries(patch)) { const parts = key.split('.'); let o = p.data; while (parts.length > 1) o = o[parts.shift()]; o[parts[0]] = value; } cb?.(); };
  return p;
 }
 return { wx, storage, requests, audios, state: load(path.join(root, 'utils/state.js')), page };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
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
 const c = client(); c.storage.set('pic-reader-settings', { night: true, auto: true, rate: 999, language: 'en', dialogueMode: false });
 const p = c.page('reader'); p.load = () => {}; p.onLoad({ id: 'book' });
 assert.equal(p.data.night, true); assert.equal(p.data.language, 'en'); assert.equal('dialogueMode' in p.data, false); assert.equal(p.data.rate, 1);
 p.rate({ detail: { value: 2 } }); assert.equal(c.storage.get('pic-reader-settings').rate, 1.25);
 assert.equal('dialogueMode' in c.storage.get('pic-reader-settings'), false);
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
