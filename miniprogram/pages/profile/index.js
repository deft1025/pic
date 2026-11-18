const api = require('../../utils/api');
const state = require('../../utils/state');
const avatar = require('../../utils/avatar');
Page({
 data: { name: '', age: '', avatar: '', avatarError: false, ages: [], ageNames: ['请选择年龄段'], ageIndex: 0, first: true, loading: true, saving: false, error: '' },
 onLoad() { this.load(); },
 async load() {
  if (!state.loggedIn()) { wx.switchTab({ url: '/pages/shelf/index' }); return; }
  this.setData({ loading: true, error: '' });
  try {
   const [profile, options] = await Promise.all([api.request('/api/me/profile'), api.request('/api/categories')]);
   if (!state.loggedIn()) return;
   this.setData({ name: profile.name, age: profile.age, avatar: avatar.forAge(profile.age), avatarError: false, first: !profile.age, ages: options.ages, ageNames: ['请选择年龄段', ...options.ages.map(a => a.name)], ageIndex: options.ages.findIndex(a => a.id === profile.age) + 1 });
  } catch (e) { this.setData({ error: e.message }); }
  finally { this.setData({ loading: false }); }
 },
 name(e) { this.setData({ name: e.detail.value }); },
 age(e) { const index = Number(e.detail.value), age = this.data.ages[index - 1]?.id || ''; this.setData({ ageIndex: index, age, avatar: avatar.forAge(age), avatarError: false }); },
 avatarFailed() { this.setData({ avatarError: true }); },
 async save() {
  if (this.data.saving || !this.data.age) return;
  this.setData({ saving: true, error: '' });
  try {
   await state.saveProfile(this.data.name, this.data.age);
   if (getCurrentPages().length > 1) wx.navigateBack(); else wx.switchTab({ url: '/pages/shelf/index' });
  } catch (e) { this.setData({ error: e.message }); }
  finally { this.setData({ saving: false }); }
 }
});
