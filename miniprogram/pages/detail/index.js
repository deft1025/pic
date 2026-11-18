const api = require('../../utils/api');
const state = require('../../utils/state');
Page({
 data: { book: null, favorite: false, loggedIn: false, needsProfile: false, busy: false, error: '' },
 onLoad(query) { this.id = query.id; this.readingID = state.id(); this.load(); },
 onShow() { if (this.id) this.refresh(); },
 refresh() { this.setData({ loggedIn: state.loggedIn(), needsProfile: state.needsProfile(), favorite: state.favorites().includes(this.id) }); },
 async load() {
  this.setData({ error: '' });
  try { const book = api.book(await api.request('/api/books/' + encodeURIComponent(this.id))); this.setData({ book }); this.refresh(); if (!this.recorded) { this.recorded = true; state.event(this.id, 'open', this.readingID); } }
  catch (e) { this.setData({ error: e.message }); }
 },
 async favorite() {
  if (this.data.busy) return;
  if (!state.loggedIn()) { wx.switchTab({ url: '/pages/shelf/index' }); return; }
  if (state.needsProfile()) { wx.navigateTo({ url: '/pages/profile/index' }); return; }
  this.setData({ busy: true });
  try { await state.toggleFavorite(this.id); this.refresh(); }
  catch (e) { this.refresh(); if (e.code === 'PROFILE_REQUIRED') { wx.navigateTo({ url: '/pages/profile/index' }); return; } wx.showToast({ title: e.message, icon: 'none' }); } finally { this.setData({ busy: false }); }
 },
 read() { wx.navigateTo({ url: '/pages/reader/index?id=' + encodeURIComponent(this.id) }); }
});
