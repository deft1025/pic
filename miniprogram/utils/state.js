const api = require('./api');
const read = (k, fallback) => wx.getStorageSync('pic-' + k) || fallback;
const write = (k, value) => wx.setStorageSync('pic-' + k, value);
// Retry identifiers only. Authentication tokens are generated on the server.
function id() { return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''); }
let epoch = 0, profileRevision = 0, syncTask = null, completedTask = null, flushing = false;
api.onUnauthorized(() => { epoch++; syncTask = null; completedTask = null; write('account-favorites', []); write('account-completed', null); });
function loggedIn() { return Boolean(api.session()); }
function user() { return api.session()?.user || null; }
function needsProfile() { return loggedIn() && !user()?.age; }
function favorites() { return loggedIn() ? read('account-favorites', []) : []; }
function completedBooks() {
 if (!loggedIn()) return [];
 const owner = user().id, saved = read('account-completed', {});
 const confirmed = saved.user_id === owner && Array.isArray(saved.items) ? saved.items : [];
 const pending = read('events-' + owner, []).filter(e => e.kind === 'complete').map(e => e.book_id);
 return [...new Set([...confirmed, ...pending])];
}
function markCompleted(books) { const ids = new Set(completedBooks()); return books.map(book => ({ ...book, completed: ids.has(book.id) })); }
async function syncCompleted() {
 if (!loggedIn()) return;
 if (completedTask) return completedTask;
 const generation = epoch, session = api.session();
 const task = (async () => {
  let result;
  try { result = await api.request('/api/me/completed-books', 'GET', undefined, { token: session.token }); }
  catch (e) { if ([404, 405].includes(e.status)) return; throw e; }
  if (generation !== epoch || api.session()?.token !== session.token) return;
  if (!Array.isArray(result.items)) throw new Error('已读状态响应无效');
  write('account-completed', { user_id: session.user.id, items: [...new Set([...completedBooks(), ...result.items])] });
 })();
 completedTask = task;
 try { await task; } finally { if (completedTask === task) completedTask = null; }
}
function requireLogin() { if (!loggedIn()) { const error = new Error('请先登录'); error.status = 401; throw error; } }
async function synchronize() {
 if (!loggedIn()) return;
 if (syncTask) return syncTask;
 const generation = epoch, revision = profileRevision, session = api.session();
 const task = (async () => {
  const [profile, favorite] = await Promise.all([
   api.request('/api/me/profile', 'GET', undefined, { token: session.token }),
   api.request('/api/me/favorites', 'GET', undefined, { token: session.token })
  ]);
  if (epoch !== generation || api.session()?.token !== session.token) return;
  if (revision === profileRevision) write('session', { ...session, user: profile });
  write('account-favorites', favorite.items);
 })();
 syncTask = task;
 try { await task; } finally { if (syncTask === task) syncTask = null; }
}
async function login() {
 const result = await new Promise((resolve, reject) => wx.login({ timeout: 10000, success: resolve, fail: () => reject(new Error('微信登录失败，请重试')) }));
 if (!result.code) throw new Error('未取得微信登录凭证');
 const generation = epoch;
 const account = await api.request('/api/auth/wechat', 'POST', { code: result.code }, { token: '' }).catch(e => {
  if ([404, 405].includes(e.status)) e.message = '登录服务暂未上线，请稍后再试';
  throw e;
 });
 if (generation !== epoch) return;
 epoch++; completedTask = null; write('session', account); write('account-favorites', []); write('account-completed', null);
 if (!needsProfile()) await synchronize();
 flushEvents(); return user();
}
async function saveProfile(name, age) {
 requireLogin();
 const generation = epoch, session = api.session();
 const profile = await api.request('/api/me/profile', 'PUT', { name, age }, { token: session.token });
 if (epoch !== generation || api.session()?.token !== session.token) throw new Error('登录状态已改变，请重试');
 profileRevision++; write('session', { ...session, user: profile }); return profile;
}
async function logout() {
 const session = api.session();
 if (session) {
  try { await api.request('/api/auth/logout', 'POST', {}, { token: session.token }); }
  catch (e) { if (e.status !== 401) throw e; }
  wx.removeStorageSync('pic-events-' + session.user.id);
 }
 epoch++; syncTask = null; completedTask = null; wx.removeStorageSync('pic-session'); write('account-favorites', []); write('account-completed', null);
}
async function toggleFavorite(bookID) {
 requireLogin();
 const generation = epoch;
 await synchronize();
 if (epoch !== generation || !loggedIn()) throw new Error('登录状态已改变，请重试');
 if (needsProfile()) { const error = new Error('请先选择年龄段'); error.code = 'PROFILE_REQUIRED'; throw error; }
 const active = !favorites().includes(bookID);
 await api.request('/api/me/favorites', 'PUT', { book_ids: [bookID], active });
 if (epoch !== generation) throw new Error('登录状态已改变，请重试');
 const items = read('account-favorites', []).filter(x => x !== bookID);
 if (active) items.unshift(bookID);
 write('account-favorites', items); return active;
}
function event(bookID, kind, readingID) {
 if (!loggedIn()) return;
 const key = 'events-' + user().id, queue = read(key, []);
 if (!queue.some(x => x.reading_id === readingID && x.kind === kind)) queue.push({ event_id: id(), book_id: bookID, kind, reading_id: readingID });
 write(key, queue.slice(-100)); flushEvents();
}
async function flushEvents() {
 if (flushing || !loggedIn()) return;
 flushing = true;
 const session = api.session(), key = 'events-' + session.user.id;
 try {
  while (api.session()?.token === session.token && read(key, []).length) {
   const item = read(key, [])[0];
   let accepted = false;
   try { await api.request('/api/events', 'POST', item, { token: session.token }); accepted = true; }
   catch (e) { if (![400, 404].includes(e.status)) break; }
   if (api.session()?.token !== session.token) break;
   if (accepted && item.kind === 'complete') write('account-completed', { user_id: session.user.id, items: completedBooks() });
   write(key, read(key, []).filter(x => x.event_id !== item.event_id));
  }
 } finally { flushing = false; }
}
module.exports = { id, loggedIn, user, needsProfile, favorites, completedBooks, markCompleted, syncCompleted, synchronize, login, saveProfile, logout, toggleFavorite, event, flushEvents };
