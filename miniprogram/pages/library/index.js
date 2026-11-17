const api = require('../../utils/api');
Page({
 data: { q: '', age: '', category: '', ages: [{ id: '', name: '全部' }], categories: [{ id: '', name: '全部' }], ageIndex: 0, categoryIndex: 0, filtersLoading: false, filtersReady: false, filterError: '', items: [], total: 0, loading: false, error: '' },
 onLoad() { this.loadFilters(); this.load(true); },
 async loadFilters() {
  if (this.data.filtersLoading) return;
  this.setData({ filtersLoading: true, filterError: '' });
  try {
   const o = await api.request('/api/categories');
   const ages = [{ id: '', name: '全部' }, ...o.ages], categories = [{ id: '', name: '全部' }, ...o.categories];
   this.setData({ ages, categories, ageIndex: Math.max(0, ages.findIndex(a => a.id === this.data.age)), categoryIndex: Math.max(0, categories.findIndex(c => c.id === this.data.category)), filtersReady: true });
  } catch (_) { this.setData({ filterError: '筛选选项暂时没加载出来，请再试试。' }); }
  finally { this.setData({ filtersLoading: false }); }
 },
 input(e) { this.setData({ q: e.detail.value }); },
 search() { this.load(true); },
 age(e) {
  const ageIndex = Number(e.detail.value), selected = this.data.ages[ageIndex];
  if (!selected || selected.id === this.data.age) return;
  this.setData({ age: selected.id, ageIndex }); this.load(true);
 },
 category(e) {
  const categoryIndex = Number(e.detail.value), selected = this.data.categories[categoryIndex];
  if (!selected || selected.id === this.data.category) return;
  this.setData({ category: selected.id, categoryIndex }); this.load(true);
 },
 more() { this.load(false); },
 onReachBottom() { if (!this.data.loading && this.data.items.length < this.data.total) this.more(); },
 async load(reset) {
  const serial = (this.serial || 0) + 1; this.serial = serial;
  const offset = reset ? 0 : this.data.items.length;
  this.setData({ loading: true, error: '', ...(reset ? { items: [], total: 0 } : {}) });
  try {
   const result = await api.request('/api/books?' + api.query({ q: this.data.q, age: this.data.age, category: this.data.category, sort: 'newest', limit: 24, offset }));
   if (serial !== this.serial) return;
   this.setData({ items: (reset ? [] : this.data.items).concat(result.items.map(api.book)), total: result.total });
  } catch (e) { if (serial === this.serial) this.setData({ error: e.message }); }
  finally { if (serial === this.serial) this.setData({ loading: false }); }
 }
});
