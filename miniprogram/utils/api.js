const config = require('../config');
let onUnauthorized = () => {};
function session() { return wx.getStorageSync('pic-session') || null; }
function request(path, method = 'GET', data, options = {}) {
 const auth = options.token === undefined ? session() : { token: options.token };
 const token = auth && auth.token;
 return new Promise((resolve, reject) => wx.request({
  url: config.apiBase + path, method, data, timeout: 12000,
  header: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  success(res) {
   if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data);
   if (res.statusCode === 401 && token && session()?.token === token) {
    wx.removeStorageSync('pic-session'); onUnauthorized();
   }
   const error = new Error(res.data?.error || '暂时无法连接，请稍后重试'); error.status = res.statusCode; reject(error);
  }, fail() { reject(new Error('网络连接失败，请检查网络后重试')); }
 }));
}
function query(values) { return Object.keys(values).filter(k => values[k] !== '' && values[k] != null).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(values[k])).join('&'); }
function media(path) { return path && path.startsWith('/') ? config.apiBase + path : path; }
function creator(value) { return typeof value === 'string' ? value.replace(/[（(]\s*AI\s*生成(?:原图)?(?:[，,、]\s*项目校对)?\s*[）)]/gi, '').trim() : value; }
function book(b) { return { ...b, author: creator(b.author), illustrator: creator(b.illustrator), cover: media(b.cover) }; }
module.exports = { request, query, media, book, session, onUnauthorized(fn) { onUnauthorized = fn; } };
