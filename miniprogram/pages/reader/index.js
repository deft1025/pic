const api = require('../../utils/api');
const state = require('../../utils/state');
const dialogue = require('../../utils/dialogue');
Page({
 data: { book: null, page: null, index: 0, total: 0, pageNames: [], language: 'zh', showText: true, fullscreen: false, controlsVisible: true, celebrationEnabled: true, completionCharacter: null, characterReply: false, viewportHeight: 0, frameWidth: 0, landscape: false, safeLeft: 0, safeRight: 0, safeBottom: 0, narrationHeight: 0, bubbles: [], measurements: [], overflow: false, narration: '', bubbleReady: false, packed: false, playing: false, auto: false, rate: 1, rates: ['0.75倍', '1倍', '1.25倍'], error: '', audioError: '', imageError: false, imageReady: false, completed: false, safeTop: 24, frameHeight: 300, imageStyle: '', overlayStyle: '' },
 onLoad(query) { const saved = wx.getStorageSync('pic-reader-settings'); if (saved) { const clean = {}; for (const k of ['auto']) if (typeof saved[k] === 'boolean') clean[k] = saved[k]; if (['zh', 'en'].includes(saved.language)) clean.language = saved.language; if ([.75, 1, 1.25].includes(saved.rate)) clean.rate = saved.rate; this.setData(clean); } this.id = query.id; this.readingID = state.id(); this.visited = new Set(); this.serial = 0; this.load(); },
 onShow() { this.hidden = false; this.scheduleCompletion(); },
 onHide() { this.hidden = true; this.cancelCompletion(); this.cancelGreeting(); this.destroyAudio(true); },
 onUnload() { this.dead = true; this.serial++; this.cancelCompletion(); this.cancelGreeting(); this.destroyAudio(true); },
 onResize(e) {
  const size = e?.size;
  if (size?.windowWidth > 0 && size?.windowHeight > 0) this.windowSize = { windowWidth: size.windowWidth, windowHeight: size.windowHeight };
  this.frame();
  wx.nextTick?.(() => { if (!this.dead) this.frame(); });
 },
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
   this.setData({ book: api.book(book), total: this.pages.length, pageNames: this.pages.map((_, i) => '第' + (i + 1) + '页'), language: this.data.language });
   wx.setNavigationBarTitle({ title: book.title_zh }); this.frame(); this.show(index, false);
  } catch (e) { if (!this.dead) this.setData({ error: e.message }); }
 },
 frame() {
  if (!this.pages) return;
  const measured = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const info = { ...measured, ...this.windowSize };
  // Resize events can arrive before getWindowInfo has the rotated dimensions.
  const fresh = measured.windowWidth === info.windowWidth && measured.windowHeight === info.windowHeight;
  const capsule = fresh && wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
  const landscape = this.data.fullscreen && info.windowWidth > info.windowHeight && info.windowHeight <= 600;
  const safeTop = Math.max(fresh ? info.statusBarHeight || 0 : 32, capsule?.bottom || 0) + 8;
  const safe = fresh ? info.safeArea : null;
  const safeBottom = Math.max(8, info.screenHeight && safe ? info.screenHeight - safe.bottom : 0);
  const safeLeft = landscape ? Math.max(8, safe?.left || 0) : 0;
  const safeRight = landscape ? Math.max(8, safe?.right ? info.windowWidth - safe.right : 0) : 0;
  // Keep a stable art frame across pages/languages. In short landscape, narration
  // and controls share the side column instead of subtracting from image height.
  const hasNarration = this.data.imageError || this.pages.some(p => ['zh', 'en'].some(lang => dialogue.split(p, lang, true).narration.trim()));
  const availableHeight = Math.max(1, info.windowHeight - safeTop - safeBottom);
  const sidebar = Math.max(144, Math.min(190, Math.round(info.windowWidth * .2)));
  const availableWidth = Math.max(1, info.windowWidth - safeLeft - safeRight);
  const aspect = (this.ratio?.[0] || 4) / (this.ratio?.[1] || 3);
  const width = landscape ? Math.max(1, Math.min(availableWidth - 12 - sidebar, availableHeight * aspect)) : this.data.fullscreen ? info.windowWidth : Math.min(info.windowWidth, 1100) - 16;
  const narrationHeight = hasNarration ? landscape ? Math.max(24, availableHeight - 44 - 48) : Math.min(112, Math.floor(info.windowHeight * .18)) : 0;
  const height = landscape ? availableHeight : this.data.fullscreen
   ? Math.max(1, availableHeight - 44 - narrationHeight - 48)
   : Math.max(130, Math.min(info.windowHeight * (info.windowWidth > info.windowHeight ? .62 : .7), width * (this.ratio?.[1] || 3) / (this.ratio?.[0] || 4)));
  this.frameWidth = width; this.frameH = height;
  this.setData({ frameHeight: height, frameWidth: width, landscape, safeTop, safeBottom, safeLeft, safeRight, viewportHeight: info.windowHeight, narrationHeight });
  this.artwork();
 },
 artwork() {
  const ratio = this.imageRatio || this.ratio?.[0] / this.ratio?.[1] || 4 / 3;
  const w = Math.min(this.frameWidth, this.frameH * ratio), h = w / ratio;
  this.artWidth = w; this.artHeight = h;
  this.setData({ overlayStyle: 'left:' + (this.frameWidth - w) / 2 + 'px;top:' + (this.frameH - h) / 2 + 'px;width:' + w + 'px;height:' + h + 'px' }, () => this.layout());
 },
 imageLoaded(e) { if (e.currentTarget.dataset.src !== this.data.page.image) return; this.imageRatio = e.detail.width / e.detail.height; if (!this.ratioReady) { this.ratio = [e.detail.width, e.detail.height]; this.ratioReady = true; this.frame(); } this.setData({ imageReady: true, imageError: false }); this.artwork(); },
 imageFailed(e) { if (e.currentTarget.dataset.src !== this.data.page.image) return; this.setData({ imageReady: false, imageError: true }); this.renderText(); this.frame(); },
 retryImage() { const page = this.data.page; this.setData({ page: null, imageError: false, imageReady: false }, () => this.setData({ page }, () => { this.renderText(); this.frame(); })); },
 show(index, autoplay) {
  if (!this.pages || index < 0 || index >= this.pages.length) return;
  this.cancelCompletion(); this.cancelGreeting(); this.lastPageAudioStarted = false;
  this.serial++; this.destroyAudio(); this.imageRatio = null;
  if (!autoplay) this.restorePlaybackView();
  this.visited.add(index);
  this.setData({ index, page: this.pages[index], imageError: false, imageReady: false, audioError: '', completed: false, completionCharacter: null, characterReply: false }, () => this.scheduleCompletion());
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
 startPlaybackView() {
  if (this.data.fullscreen || this.playbackViewDismissed) return;
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  if (Math.min(info.windowWidth, info.windowHeight) > 600) return;
  this.autoExpanded = true;
  this.setData({ fullscreen: true, controlsVisible: false }, () => this.frame());
 },
 restorePlaybackView() {
  const restore = this.autoExpanded;
  this.autoExpanded = false; this.playbackViewDismissed = false;
  if (restore) this.setData({ fullscreen: false, controlsVisible: true }, () => this.frame());
 },
 destroyAudio(restoreView = false) { if (this.audio) { const old = this.audio; this.audio = null; old.stop(); old.destroy(); } this.setData({ playing: false }); if (restoreView) this.restorePlaybackView(); },
 play() {
  if (!this.data.page || this.hidden || this.dead) return;
  this.cancelCompletion();
  if (this.data.playing) { this.audio.pause(); this.setData({ playing: false }); return; }
  if (this.audio) { this.audio.play(); return; }
  const source = this.data.language === 'zh' ? this.data.page.audio_zh : this.data.page.audio_original;
  if (!source) { this.restorePlaybackView(); this.setData({ audioError: '本页暂时没有这一语言的配音，可以先读文字。' }); this.scheduleCompletion(); return; }
  this.lastPageAudioStarted = true;
  this.setData({ audioError: '' });
  const audio = wx.createInnerAudioContext(); this.audio = audio; audio.obeyMuteSwitch = false; audio.playbackRate = this.data.rate;
  const current = () => this.audio === audio && !this.hidden && !this.dead;
  audio.onPlay(() => { if (current()) { this.setData({ playing: true }); this.startPlaybackView(); } });
  audio.onPause(() => { if (current()) this.setData({ playing: false }); });
  audio.onError(() => { if (current()) { this.destroyAudio(true); this.setData({ audioError: '配音加载失败，点播放重试。' }); } });
  audio.onEnded(() => {
   if (!current()) return;
   const continuing = this.data.auto && this.data.index < this.data.total - 1;
   this.destroyAudio(!continuing);
   if (this.data.index === this.data.total - 1) { if (this.visited.size === this.data.total) this.finish(); }
   else if (this.data.auto) this.show(this.data.index + 1, true);
  });
  audio.src = source; audio.play();
 },
 previous() { this.show(this.data.index - 1, this.data.playing); },
 next() { this.show(this.data.index + 1, this.data.playing); },
 pickPage(e) { this.show(Number(e.detail.value), this.data.playing); },
 settings() { const { language, auto, rate } = this.data; wx.setStorageSync('pic-reader-settings', { language, auto, rate }); },
 language(e) { if (this.data.fullscreen) return; const language = e.currentTarget.dataset.language; if (language === this.data.language) return; const playing = this.data.playing; this.cancelCompletion(); this.lastPageAudioStarted = false; this.serial++; this.destroyAudio(); this.setData({ language }); this.settings(); this.renderText(); if (playing) this.play(); else this.scheduleCompletion(); },
 toggleLanguage() { this.language({ currentTarget: { dataset: { language: this.data.language === 'zh' ? 'en' : 'zh' } } }); },
 controls() { if (this.data.fullscreen) this.setData({ controlsVisible: !this.data.controlsVisible }, () => this.frame()); },
 keepControls() {},
 auto() { if (this.data.fullscreen) return; this.setData({ auto: !this.data.auto }); this.settings(); },
 rate(e) { if (this.data.fullscreen) return; const rate = [.75, 1, 1.25][Number(e.detail.value)]; this.setData({ rate }); this.settings(); if (this.audio) this.audio.playbackRate = rate; },
 fullscreen() { this.autoExpanded = false; this.playbackViewDismissed = Boolean(this.audio); const fullscreen = !this.data.fullscreen; this.setData({ fullscreen, controlsVisible: !fullscreen }, () => this.frame()); },
 cancelCompletion() { clearTimeout(this.completionTimer); this.completionTimer = null; },
 cancelGreeting() { clearTimeout(this.replyTimer); this.replyTimer = null; if (!this.dead && this.data.characterReply) this.setData({ characterReply: false }); },
 greet() {
  if (!this.data.completed || !this.data.celebrationEnabled || this.data.characterReply || this.hidden || this.dead) return;
  this.setData({ characterReply: true });
  this.replyTimer = setTimeout(() => { this.replyTimer = null; if (!this.dead) this.setData({ characterReply: false }); }, 1800);
 },
 scheduleCompletion() {
  this.cancelCompletion();
  if (!this.data.celebrationEnabled || !this.data.total || this.data.index !== this.data.total - 1 || this.visited?.size !== this.data.total || this.data.completed || this.hidden || this.dead || this.audio || this.lastPageAudioStarted) return;
  const serial = this.serial;
  this.completionTimer = setTimeout(() => {
   this.completionTimer = null;
   if (serial !== this.serial || this.hidden || this.dead || this.audio || this.lastPageAudioStarted || this.data.completed) return;
   this.finish();
  }, 4000);
 },
 completionPortrait() {
  // All books share this greeting; valid dialogue supplies the actual character.
  for (const page of this.pages || []) {
   const ratio = page.dialogue?.aspect_ratio;
   if (!page.image || !Array.isArray(ratio) || ratio.length !== 2 || !ratio.every(n => Number.isFinite(n) && n > 0) || typeof page.text_zh !== 'string') continue;
   const bubble = dialogue.split(page, 'zh', true).bubbles.find(b => typeof b.speaker === 'string' && b.speaker.trim() && Array.isArray(b.part.target) && b.part.target.length === 2 && b.part.target.every(n => Number.isFinite(n) && n >= 0 && n <= 100));
   if (!bubble) continue;
   const height = 200 * ratio[1] / ratio[0], [x, y] = bubble.part.target;
   const left = Math.max(-100, Math.min(0, 50 - x * 2));
   const top = height < 100 ? (100 - height) / 2 : Math.max(100 - height, Math.min(0, 50 - y * height / 100));
   return { name: bubble.speaker.trim(), image: page.image, portraitStyle: 'left:' + left + '%;top:' + top + '%;' };
  }
  return null;
 },
 portraitFailed(e) { if (e.currentTarget.dataset.src === this.data.completionCharacter?.image) this.setData({ completionCharacter: null }); },
 finish() {
  this.cancelCompletion();
  this.destroyAudio(true);
  if (this.visited.size < this.data.total) { wx.showToast({ title: '还有页面没读，先一起读完吧', icon: 'none' }); return; }
  const completionCharacter = this.completionPortrait();
  const readingID = this.readingID, serial = this.serial;
  this.setData({ completed: true, completionCharacter }, () => {
   if (this.dead || serial !== this.serial || readingID !== this.readingID || !this.data.completed || this.finished) return;
   this.finished = true; state.event(this.id, 'complete', readingID);
  });
 },
 again() { this.finished = false; this.readingID = state.id(); this.visited = new Set(); this.show(0, false); },
 back() { if (getCurrentPages().length > 1) wx.navigateBack(); else this.shelf(); },
 shelf() { wx.switchTab({ url: '/pages/shelf/index' }); }
});
