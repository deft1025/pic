const api = require('../../utils/api');
const state = require('../../utils/state');
Page({
 data: { featured: [], recent: [], loading: true, error: '' },
 onShow() { this.getTabBar?.()?.sync(); this.load(); },
 async load() {
  const serial = (this.serial || 0) + 1; this.serial = serial;
  const token = api.session()?.token || '';
  this.setData({ loading: true, error: '', featured: state.markCompleted(this.data.featured), recent: state.markCompleted(this.data.recent) });
  try {
   const [f, r] = await Promise.all([api.request('/api/recommendations', 'GET', undefined, { token }), api.request('/api/books?sort=newest&limit=12'), state.syncCompleted().catch(() => {})]);
   if (serial !== this.serial) return;
   if (token !== (api.session()?.token || '')) return this.load();
   const ids = new Set(f.items.map(x => x.id));
   this.setData({ featured: state.markCompleted(f.items.map(api.book)), recent: state.markCompleted(r.items.filter(x => !ids.has(x.id)).slice(0, 4).map(api.book)) });
  } catch (e) {
   if (serial !== this.serial) return;
   if (e.status === 401 && !api.session() && token) return this.load();
   this.setData({ error: e.message });
  } finally { if (serial === this.serial) this.setData({ loading: false }); }
 },
 library() { wx.switchTab({ url: '/pages/library/index' }); }
});
