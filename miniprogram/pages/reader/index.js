const api = require('../../utils/api');
const state = require('../../utils/state');
const dialogue = require('../../utils/dialogue');
Page({
 data: { book: null, page: null, index: 0, total: 0, pageNames: [], language: 'zh', showText: true, night: false, fullscreen: false, bubbles: [], measurements: [], overflow: false, narration: '', bubbleReady: false, packed: false, playing: false, auto: false, rate: 1, rates: ['0.75倍', '1倍', '1.25倍'], error: '', audioError: '', imageError: false, imageReady: false, completed: false, safeTop: 24, frameHeight: 300, imageStyle: '', overlayStyle: '' },
 onLoad(query) { const saved = wx.getStorageSync('pic-reader-settings'); if (saved) { const clean = {}; for (const k of ['showText', 'night', 'auto']) if (typeof saved[k] === 'boolean') clean[k] = saved[k]; if (['zh', 'en'].includes(saved.language)) clean.language = saved.language; if ([.75, 1, 1.25].includes(saved.rate)) clean.rate = saved.rate; this.setData(clean); } this.id = query.id; this.readingID = state.id(); this.visited = new Set(); this.serial = 0; this.load(); },
 onShow() { this.hidden = false; },
 onHide() { this.hidden = true; this.destroyAudio(); },
 onUnload() { this.dead = true; this.serial++; this.destroyAudio(); },
 onResize() { this.frame(); },
 async load() {
  this.setData({ error: '' });
  try {
   const [book, result] = await Promise.all([api.request('/api/books/' + encodeURIComponent(this.id)), api.request('/api/books/' + encodeURIComponent(this.id) + '/pages')]);
   if (this.dead) return;
   if (!result.items.length) throw new Error('绘本页面暂时不可用');
   this.pages = result.items.map(p => ({ ...p, image: api.media(p.image), audio_zh: api.media(p.audio_zh), audio_original: api.media(p.audio_original) }));
   const index = 0;
   const configuredRatio = this.pages.find(p => p.dialogue)?.dialogue.aspect_ratio;
   this.ratio = configuredRatio || [4, 3]; this.ratioReady = Boolean(configuredRatio);
   this.setData({ book, total: this.pages.length, pageNames: this.pages.map((_, i) => '第' + (i + 1) + '页'), language: this.data.language });
   wx.setNavigationBarTitle({ title: book.title_zh }); this.frame(); this.show(index, false);
  } catch (e) { if (!this.dead) this.setData({ error: e.message }); }
 },
 frame() {
  if (!this.pages) return;
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const width = Math.min(info.windowWidth, 1100) - 16;
  const height = Math.max(130, Math.min(info.windowHeight * (info.windowWidth > info.windowHeight ? .62 : .7), width * this.ratio[1] / this.ratio[0]));
  this.frameWidth = width; this.frameH = height; this.setData({ frameHeight: height, safeTop: info.statusBarHeight || 0 });
  this.artwork();
 },
 artwork() {
  const ratio = this.imageRatio || this.ratio?.[0] / this.ratio?.[1] || 4 / 3;
  const w = Math.min(this.frameWidth, this.frameH * ratio), h = w / ratio;
  this.artWidth = w; this.artHeight = h;
  this.setData({ overlayStyle: 'left:' + (this.frameWidth - w) / 2 + 'px;top:' + (this.frameH - h) / 2 + 'px;width:' + w + 'px;height:' + h + 'px' }, () => this.layout());
 },
 imageLoaded(e) { if (e.currentTarget.dataset.src !== this.data.page.image) return; this.imageRatio = e.detail.width / e.detail.height; if (!this.ratioReady) { this.ratio = [e.detail.width, e.detail.height]; this.ratioReady = true; this.frame(); } this.setData({ imageReady: true, imageError: false }); this.artwork(); },
 imageFailed(e) { if (e.currentTarget.dataset.src !== this.data.page.image) return; this.setData({ imageReady: false, imageError: true }); this.renderText(); },
 retryImage() { const page = this.data.page; this.setData({ page: null, imageError: false, imageReady: false }, () => this.setData({ page }, () => this.renderText())); },
 show(index, autoplay) {
  if (!this.pages || index < 0 || index >= this.pages.length) return;
  this.serial++; this.destroyAudio(); this.imageRatio = null;
  this.visited.add(index);
  this.setData({ index, page: this.pages[index], imageError: false, imageReady: false, audioError: '', completed: false });
  this.renderText(); this.artwork();
  if (autoplay && !this.hidden) this.play();
 },
 renderText() {
  if (!this.data.page) return;
  const result = dialogue.split(this.data.page, this.data.language, !this.data.imageError);
  this.setData({ bubbles: result.bubbles, narration: result.narration, bubbleReady: false, packed: false, overflow: false }, () => this.layout());
 },
 layout(grouped = false) {
  if (!this.data.bubbles.length || !this.artWidth || !this.data.imageReady || !this.data.showText || this.data.imageError) return;
  const serial = this.serial, language = this.data.language, width = this.artWidth, height = this.artHeight;
  const layoutID = (this.layoutID || 0) + 1; this.layoutID = layoutID;
  // Native scroll-view fills its parent, so measure text nodes independently.
  // Try authored, narrow and wide widths before deciding where each bubble fits.
  const bubbles = this.data.bubbles, measurements = dialogue.measurements(bubbles, width);
  this.setData({ measurements, bubbleReady: false, packed: false, overflow: false }, () => {
   const query = wx.createSelectorQuery().in(this);
   query.selectAll('.bubble-measure').boundingClientRect();
   query.selectAll('.measure-words').boundingClientRect();
   query.selectAll('.measure-speaker').boundingClientRect();
   query.exec(results => {
    if (this.dead || serial !== this.serial || layoutID !== this.layoutID || language !== this.data.language || !this.data.imageReady || this.data.imageError || !this.data.showText) return;
    const choices = bubbles.map(() => []);
    measurements.forEach((m, i) => {
     const outer = results[0]?.[i], words = results[1]?.[i], speaker = results[2]?.[i];
     if (!outer || !words || !speaker) return;
     choices[m.index].push({ w: Math.min(m.width, Math.ceil(Math.max(words.width, speaker.width)) + 17), h: Math.ceil(outer.height), header: Math.ceil(outer.height - words.height) });
    });
    if (choices.some(options => !options.length)) return;
    let placements = dialogue.positions(bubbles, choices, width, height), packed = false, overflow = false;
    if (!placements) {
     if (!grouped) {
      const merged = dialogue.merge(bubbles, this.data.page, language);
      if (merged.length < bubbles.length) { this.setData({ bubbles: merged }, () => this.layout(true)); return; }
     }
     const result = dialogue.pack(bubbles, choices, width, height);
     placements = result.placements; packed = true; overflow = result.overflow;
    }
    this.setData({ measurements: [], bubbles: bubbles.map((b, i) => {
     const r = placements[i], bodyHeight = Math.max(24, r.h - r.header);
     return { ...b, style: 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;', scroll: r.scroll, scrollStyle: 'height:' + bodyHeight + 'px;', tailStyle: overflow ? '' : this.tail(b, r, width, height) };
    }), bubbleReady: true, packed, overflow });
   });
  });
 },
 tail(b, r, w, h) {
  if (!b.part.target) return '';
  const tx = b.part.target[0] * w / 100, ty = b.part.target[1] * h / 100;
  const x = Math.max(r.x + 5, Math.min(r.x + r.w - 5, tx)), y = Math.max(r.y + 5, Math.min(r.y + r.h - 5, ty));
  const length = Math.hypot(tx - x, ty - y), angle = Math.atan2(ty - y, tx - x) * 180 / Math.PI;
  return 'left:' + x + 'px;top:' + y + 'px;width:' + length + 'px;transform:rotate(' + angle + 'deg);';
 },
 destroyAudio() { if (this.audio) { const old = this.audio; this.audio = null; old.stop(); old.destroy(); } this.setData({ playing: false }); },
 play() {
  if (!this.data.page || this.hidden || this.dead) return;
  if (this.data.playing) { this.audio.pause(); this.setData({ playing: false }); return; }
  if (this.audio) { this.audio.play(); return; }
  const source = this.data.language === 'zh' ? this.data.page.audio_zh : this.data.page.audio_original;
  if (!source) { this.setData({ audioError: '本页暂时没有这一语言的配音，可以先读文字。' }); return; }
  this.setData({ audioError: '' });
  const audio = wx.createInnerAudioContext(); this.audio = audio; audio.obeyMuteSwitch = false; audio.playbackRate = this.data.rate;
  const current = () => this.audio === audio && !this.hidden && !this.dead;
  audio.onPlay(() => { if (current()) this.setData({ playing: true }); });
  audio.onPause(() => { if (current()) this.setData({ playing: false }); });
  audio.onError(() => { if (current()) { this.destroyAudio(); this.setData({ audioError: '配音加载失败，点播放重试。' }); } });
  audio.onEnded(() => {
   if (!current()) return; this.destroyAudio();
   if (this.data.index === this.data.total - 1) { if (this.visited.size === this.data.total) this.finish(); }
   else if (this.data.auto) this.show(this.data.index + 1, true);
  });
  audio.src = source; audio.play();
 },
 previous() { this.show(this.data.index - 1, this.data.playing); },
 next() { this.show(this.data.index + 1, this.data.playing); },
 pickPage(e) { this.show(Number(e.detail.value), this.data.playing); },
 settings() { const { language, showText, night, auto, rate } = this.data; wx.setStorageSync('pic-reader-settings', { language, showText, night, auto, rate }); },
 language(e) { const language = e.currentTarget.dataset.language; if (language === this.data.language) return; const playing = this.data.playing; this.serial++; this.destroyAudio(); this.setData({ language }); this.settings(); this.renderText(); if (playing) this.play(); },
 text() { this.setData({ showText: !this.data.showText }); this.settings(); if (this.data.showText) this.layout(); },
 auto() { this.setData({ auto: !this.data.auto }); this.settings(); },
 rate(e) { const rate = [.75, 1, 1.25][Number(e.detail.value)]; this.setData({ rate }); this.settings(); if (this.audio) this.audio.playbackRate = rate; },
 night() { this.setData({ night: !this.data.night }); this.settings(); },
 fullscreen() { this.setData({ fullscreen: !this.data.fullscreen }, () => this.frame()); },
 finish() {
  this.destroyAudio();
  if (this.visited.size < this.data.total) { wx.showToast({ title: '还有页面没读，先一起读完吧', icon: 'none' }); return; }
  if (!this.finished) { this.finished = true; state.event(this.id, 'complete', this.readingID); }
  this.setData({ completed: true });
 },
 again() { this.finished = false; this.readingID = state.id(); this.visited = new Set(); this.show(0, false); },
 back() { if (getCurrentPages().length > 1) wx.navigateBack(); else this.shelf(); },
 shelf() { wx.switchTab({ url: '/pages/shelf/index' }); }
});
