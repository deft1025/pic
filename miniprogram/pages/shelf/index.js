const api = require('../../utils/api');
const state = require('../../utils/state');
Page({
 data: { loggedIn: false, profile: null, needsProfile: false, busy: false, loading: false, items: [], error: '', loginError: '', syncError: '', ageDialog: false, firstAges: [], firstAge: '', ageSaving: false },
 onShow() { this.load(); },
 async load() {
  const serial = (this.serial || 0) + 1; this.serial = serial;
  this.setData({ loggedIn: state.loggedIn(), profile: state.user(), needsProfile: state.needsProfile(), loading: true, error: '', syncError: '', ...(!state.loggedIn() ? { ageDialog: false } : {}) });
  try {
   if (state.loggedIn()) { try { await state.synchronize(); } catch (e) { this.setData({ syncError: e.message }); } }
   const ids = state.favorites(), books = [];
   for (let i = 0; i < ids.length; i += 100) {
    const result = await api.request('/api/books?' + api.query({ ids: ids.slice(i, i + 100).join(','), limit: 100 }));
    books.push(...result.items.map(api.book));
   }
   if (serial !== this.serial) return;
   this.setData({ items: ids.map(id => books.find(b => b.id === id)).filter(Boolean), loggedIn: state.loggedIn(), profile: state.user(), needsProfile: state.needsProfile() });
  } catch (e) { if (serial === this.serial) this.setData({ error: e.message }); }
  finally { if (serial === this.serial) this.setData({ loading: false }); }
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
