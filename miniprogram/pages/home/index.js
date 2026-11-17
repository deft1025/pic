const api = require('../../utils/api');
Page({
 data: { featured: [], recent: [], loading: true, error: '' },
 onShow() { this.load(); },
 async load() {
  const serial = (this.serial || 0) + 1; this.serial = serial;
  const token = api.session()?.token || '';
  this.setData({ loading: true, error: '' });
  try {
   const [f, r] = await Promise.all([api.request('/api/recommendations', 'GET', undefined, { token }), api.request('/api/books?sort=newest&limit=12')]);
   if (serial !== this.serial) return;
   if (token !== (api.session()?.token || '')) return this.load();
   const ids = new Set(f.items.map(x => x.id));
   this.setData({ featured: f.items.map(api.book), recent: r.items.filter(x => !ids.has(x.id)).slice(0, 4).map(api.book) });
  } catch (e) {
   if (serial !== this.serial) return;
   if (e.status === 401 && !api.session() && token) return this.load();
   this.setData({ error: e.message });
  } finally { if (serial === this.serial) this.setData({ loading: false }); }
 },
 library() { wx.switchTab({ url: '/pages/library/index' }); }
});
