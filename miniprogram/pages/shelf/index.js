const api = require('../../utils/api');
const state = require('../../utils/state');
const avatar = require('../../utils/avatar');
const PAGE_SIZE = 8;
Page({
 data: { loggedIn: false, profile: null, avatar: '', avatarError: false, ageLabel: '未选择年龄段', needsProfile: false, busy: false, loading: false, items: [], page: 1, pageCount: 0, total: 0, error: '', loginError: '', syncError: '', ageDialog: false, firstAges: [], firstAge: '', ageSaving: false },
 onShow() { this.getTabBar?.()?.sync(); this.load(); },
 async load() {
  const serial = (this.serial || 0) + 1; this.serial = serial;
  const token = api.session()?.token, previousPage = this.data.page;
  this.books = [];
  this.updateAvatar();
  this.setData({ loggedIn: state.loggedIn(), profile: state.user(), needsProfile: state.needsProfile(), loading: true, items: [], total: 0, pageCount: 0, error: '', syncError: '', ...(!state.loggedIn() ? { ageDialog: false, page: 1 } : {}) });
  try {
   if (state.loggedIn()) { try { await state.synchronize(); await state.syncCompleted(); } catch (e) { if (serial === this.serial) this.setData({ syncError: e.message }); } }
   if (serial !== this.serial || token !== api.session()?.token) return;
   const ids = state.favorites(), books = [];
   for (let i = 0; i < ids.length; i += 100) {
    const result = await api.request('/api/books?' + api.query({ ids: ids.slice(i, i + 100).join(','), limit: 100 }));
    books.push(...result.items.map(api.book));
   }
   if (serial !== this.serial || token !== api.session()?.token) return;
   this.books = ids.map(id => books.find(b => b.id === id)).filter(Boolean);
   this.setPage(previousPage);
  } catch (e) { if (serial === this.serial) this.setData({ error: e.message }); }
  finally { if (serial === this.serial) { this.updateAvatar(); this.setData({ loading: false, loggedIn: state.loggedIn(), profile: state.user(), needsProfile: state.needsProfile(), ...(!state.loggedIn() ? { ageDialog: false, page: 1 } : {}) }); } }
 },
 updateAvatar() { const age = state.user()?.age, source = avatar.forAge(age); this.setData({ ageLabel: age ? age.replace('-', '–') + ' 岁' : '未选择年龄段', ...(source !== this.data.avatar ? { avatar: source, avatarError: false } : {}) }); },
 avatarFailed() { this.setData({ avatarError: true }); },
 setPage(requested) {
  const books = this.books || [], pageCount = Math.ceil(books.length / PAGE_SIZE);
  const page = Math.max(1, Math.min(requested, pageCount || 1));
  this.setData({ page, pageCount, total: books.length, items: state.markCompleted(books.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)) });
 },
 previous() { if (!this.data.loading && this.data.page > 1) this.setPage(this.data.page - 1); },
 next() { if (!this.data.loading && this.data.page < this.data.pageCount) this.setPage(this.data.page + 1); },
 openBook(e) {
  const id = e.currentTarget.dataset.id;
  if (this.data.items.some(book => book.id === id)) wx.navigateTo({ url: '/pages/detail/index?id=' + encodeURIComponent(id) });
 },
 async login() {
  if (this.data.busy) return;
  this.setData({ busy: true, loginError: '' });
  try {
   const consent = await new Promise((resolve, reject) => wx.showModal({ title: '登录保存书架', content: '登录后建立账号，选择适合的阅读年龄段，保存收藏和阅读统计。用户名可自行填写，无需手机号或微信头像昵称。是否继续？', confirmText: '同意登录', success: r => resolve(r.confirm), fail: () => reject(new Error('登录确认暂时无法打开，请重试')) }));
   if (!consent) return;
   await state.login(); await this.load(); if (state.needsProfile()) await this.openAgeChoice();
  }
  catch (e) { this.setData({ loginError: e.message }); }
  finally { this.setData({ busy: false }); }
 },
 async logout() { this.setData({ busy: true }); try { await state.logout(); await this.load(); } catch (e) { wx.showToast({ title: e.message, icon: 'none' }); } finally { this.setData({ busy: false }); } },
 async openAgeChoice() {
  if (!state.loggedIn() || !state.needsProfile()) return;
  const options = await api.request('/api/categories');
  if (!options.ages.length) throw new Error('年龄选项暂时不可用，请稍后重试');
  this.setData({ firstAges: options.ages, firstAge: '', ageDialog: true, error: '' });
 },
 selectFirstAge(e) { this.setData({ firstAge: e.currentTarget.dataset.age }); },
 async saveFirstAge() {
  if (!this.data.firstAge || this.data.ageSaving) return;
  this.setData({ ageSaving: true });
  try {
   await state.saveProfile(state.user()?.name || '', this.data.firstAge);
   this.setData({ ageDialog: false }); await this.load();
  } catch (e) { if (!state.loggedIn()) { this.setData({ ageDialog: false }); await this.load(); } wx.showToast({ title: e.message, icon: 'none' }); }
  finally { this.setData({ ageSaving: false }); }
 },
 keepDialog() {},
 profile() { wx.navigateTo({ url: '/pages/profile/index' }); },
 about() { wx.navigateTo({ url: '/pages/about/index' }); }
});
