// Render the real WXML/WXSS in a browser adapter. Not a native WeChat device test.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PIC_BROWSER_MODULE || 'playwright');
const root = path.resolve(__dirname, '../miniprogram');
const output = process.env.PIC_MINI_PROFILE_OUTPUT;
let browser;
(async () => {
 browser = await chromium.launch({ headless: true, executablePath: process.env.PIC_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
 const p = await browser.newPage(); let checks = 0;
 const ages = [{ id: '0-2', name: '0–2 岁', description: '看图认知 · 亲子陪伴' }, { id: '3-4', name: '3–4 岁', description: '发现世界 · 快乐成长' }, { id: '5-6', name: '5–6 岁', description: '独立思考 · 自主阅读' }];
 for (const [width, height] of [[320, 568], [390, 844], [568, 320], [1366, 768]]) {
  await p.setViewportSize({ width, height });
  for (const [scenario, selected] of [['home', false], ['shelf', false], ['shelf', true], ['shelfFavorites', true], ['shelfAccount', false], ['shelfAccount', true], ['profile', true], ['library', false], ['library', true], ['bookCard', false], ['bookCard', true]]) {
   const page = ['shelfFavorites', 'shelfAccount'].includes(scenario) ? 'shelf' : scenario;
   const data = page === 'home' ? { featured: [], recent: [], loading: false, error: '' } : page === 'bookCard' ? { book: { id: 'book', title_zh: '很长的绘本名字也能完整显示，方便找到喜欢的故事', cover: '', reading_value: '在故事里学会等待与陪伴', page_count: 18, reading_minutes: 5, completed: selected } } : page === 'shelf' ? { loggedIn: true, profile: { id: '10000', name: '' }, needsProfile: true, busy: false, loading: false, items: [], total: 0, page: 1, pageCount: 0, error: '', loginError: '', syncError: '', ageDialog: true, firstAges: ages, firstAge: selected ? '3-4' : '', ageSaving: false } : page === 'library' ? { q: '', ages: [{ id: '', name: '全部' }, ...ages], categories: [{ id: '', name: '全部' }, { id: 'animals', name: '动物朋友' }], ageIndex: selected ? 2 : 0, categoryIndex: selected ? 1 : 0, filtersReady: true, filtersLoading: false, filterError: '', error: '', loading: false, total: 0, items: [] } : { name: '小小读者', age: '3-4', ages, ageNames: ['请选择年龄段', ...ages.map(a => a.name)], ageIndex: 2, first: false, loading: false, saving: false, error: '' };
   Object.assign(data, { avatar: selected ? 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23fff8e4"/><text x="50" y="70" text-anchor="middle" font-size="55">📖</text></svg>'.replace('%23', '#')) : '', avatarError: false, ageLabel: '3–4 岁' });
   if (scenario === 'shelfAccount') Object.assign(data, { ageDialog: false, needsProfile: false, loggedIn: selected, profile: selected ? { name: 'yiyi', age: '3-4' } : null });
   if (scenario === 'shelfFavorites') Object.assign(data, { ageDialog: false, needsProfile: false, total: 17, page: 2, pageCount: 3, items: Array.from({ length: 8 }, (_, i) => ({ id: 'book-' + i, completed: i % 2 === 0, title_zh: i === 0 ? '很长的绘本名字也能完整显示，方便找到喜欢的故事' : '美好的一天', cover: '' })) });
   let template = page === 'bookCard' ? '<view class="page"><view class="grid">' + fs.readFileSync(path.join(root, 'components/book-card/index.wxml'), 'utf8').repeat(2) + '</view></view>' : fs.readFileSync(path.join(root, 'pages', page, 'index.wxml'), 'utf8');
   let styles = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8').replace(/^page\{/, 'body{') + fs.readFileSync(path.join(root, page === 'bookCard' ? 'components/book-card/index.wxss' : 'pages/' + page + '/index.wxss'), 'utf8');
   const hasTabBar = ['home', 'library', 'shelf'].includes(page), safeBottom = width === 390 ? 34 : 0;
   if (hasTabBar) {
    const bar = require('../miniprogram/app.json').tabBar;
    Object.assign(data, { tabs: bar.list.map((tab, i) => ({ path: tab.pagePath, label: tab.text, icon: ['discover', 'library', 'shelf'][i] })), navSelected: ['home', 'library', 'shelf'].indexOf(page) });
    template += fs.readFileSync(path.join(root, 'custom-tab-bar/index.wxml'), 'utf8').replace(/\bselected\b(?= === index)/g, 'navSelected');
    styles += fs.readFileSync(path.join(root, 'custom-tab-bar/index.wxss'), 'utf8');
   }
   styles = styles.replace(/env\(safe-area-inset-bottom\)/g, safeBottom + 'px');
   await p.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
   await p.evaluate(({ template, styles, data }) => {
    const css = document.createElement('style'); css.textContent = 'body{margin:0}*{box-sizing:border-box}button{border:0;font-family:inherit}input{font-family:inherit}img{object-fit:cover}' + styles.replace(/([\d.]+)rpx/g, (_, n) => Number(n) * innerWidth / 750 + 'px'); document.head.append(css);
    const tree = new DOMParser().parseFromString(template.replace(/<([\w-]+)([^>]*?)\/>/g, (_, t, a) => t === 'br' ? '<br>' : '<' + t + a + '></' + t + '>'), 'text/html').body;
    const expr = (e, s) => new Function('s', 'with(s){return (' + e + ')}')(s);
    const val = (v, s) => /^{{([^{}]+)}}$/.test(v) ? expr(v.slice(2, -2), s) : v.replace(/{{([\s\S]+?)}}/g, (_, e) => expr(e, s) ?? '');
    function children(parent, out, scope) {
     let matched = false;
     for (const n of parent.childNodes) {
      if (n.nodeType === 3) { out.append(document.createTextNode(String(val(n.textContent, scope)))); continue; }
      if (n.nodeType !== 1) continue;
      if (n.hasAttribute('wx:if')) { matched = Boolean(val(n.getAttribute('wx:if'), scope)); if (!matched) continue; }
      else if (n.hasAttribute('wx:elif')) { if (matched) continue; matched = Boolean(val(n.getAttribute('wx:elif'), scope)); if (!matched) continue; }
      else if (n.hasAttribute('wx:else')) { if (matched) continue; matched = true; }
      else matched = false;
      if (n.hasAttribute('wx:for')) val(n.getAttribute('wx:for'), scope).forEach((item, index) => element(n, out, { ...scope, item, index }));
      else element(n, out, scope);
     }
    }
    function element(n, out, scope) {
     if (n.localName === 'block') { children(n, out, scope); return; }
     const tag = ['image', 'img'].includes(n.localName) ? 'img' : ['input', 'button', 'br'].includes(n.localName) ? n.localName : n.localName === 'text' ? 'span' : 'div';
     const e = document.createElement(tag);
     for (const a of n.attributes) {
      if (/^(wx:|bind|catch)/.test(a.name)) continue;
      const v = val(a.value, scope);
      if (a.name === 'placeholder-class') {
       const placeholder = document.createElement('style');
       placeholder.textContent = v.split(/\s+/).filter(Boolean).map(name => {
        const rule = [...css.sheet.cssRules].find(rule => rule.selectorText === '.' + name);
        return rule ? 'input::placeholder{' + rule.style.cssText + '}' : '';
       }).join('');
       document.head.append(placeholder);
      }
      if (a.name === 'disabled') e.disabled = Boolean(v); else e.setAttribute(a.name, String(v));
     }
     if (n.localName === 'scroll-view' && n.hasAttribute('scroll-y')) e.style.overflowY = 'auto';
     out.append(e); children(n, e, scope);
    }
    children(tree, document.body, data);
   }, { template, styles, data });
   for (const avatar of await p.locator('img.account-avatar').all()) await avatar.evaluate(async e => { await e.decode(); });
   const errors = await p.evaluate(({ page, selected, scenario, hasTabBar, safeBottom }) => {
    const failures = [], check = (v, m) => { if (!v) failures.push(m); };
    check(document.documentElement.scrollWidth <= innerWidth + 1, 'page horizontal overflow');
    if (hasTabBar) {
     const bar = document.querySelector('.tab-bar'), items = [...bar.querySelectorAll('.tab-item')], r = bar.getBoundingClientRect();
     check(items.length === 3 && bar.querySelectorAll('.selected').length === 1, 'tab selection missing');
     check(bar.querySelector('.selected .tab-label').textContent === ({ home: '发现', library: '书库', shelf: '我的书架' })[page], 'wrong selected label');
     check(Math.abs(r.bottom - innerHeight) < 1 && r.height >= 76 + safeBottom, 'tab safe area missing');
     for (const item of items) {
      const rect = item.getBoundingClientRect(); check(rect.height >= 44 && rect.width >= 44 && rect.left >= 0 && rect.right <= innerWidth, 'tab touch target outside viewport');
      check(parseFloat(getComputedStyle(item.querySelector('.tab-label')).fontSize) === 16, 'tab font must be 16px');
      check(item.querySelector('.tab-icon').getBoundingClientRect().height >= 24, 'missing navigation icon');
     }
     check(parseFloat(getComputedStyle(document.querySelector('.tab-page')).paddingBottom) > r.height, 'footer covers page content');
    }
    if (page === 'home') {
     check(document.querySelector('.hero'), 'home missing');
    } else if (page === 'bookCard') {
     check(document.querySelectorAll('.completion').length === (selected ? 2 : 0), 'completion badge mismatch');
     for (const badge of document.querySelectorAll('.completion')) {
      const b = badge.getBoundingClientRect(), cover = badge.parentElement.getBoundingClientRect();
      check(b.left >= cover.left && b.right <= cover.right && b.bottom <= cover.bottom, 'completion badge outside cover');
     }
    } else if (page === 'shelf' && scenario === 'shelfFavorites') {
     check(document.querySelectorAll('.favorite-completion').length === 4, 'shelf completion badge mismatch');
     const rows = [...document.querySelectorAll('.favorite-row')];
     check(rows.length === 8, 'favorites page must contain eight rows');
     for (const row of rows) { const r = row.getBoundingClientRect(); check(r.height >= 72, 'favorite touch target too small'); check(row.scrollWidth <= row.clientWidth + 1, 'favorite title overflow'); }
     check(document.querySelector('.shelf-pagination').textContent.includes('2 / 3'), 'favorite page indicator missing');
     check(document.querySelectorAll('.shelf-pagination button').length === 2, 'favorite page controls missing');
    } else if (scenario === 'shelfAccount') {
     const card = document.querySelector('.account-card');
     check(card.scrollWidth <= card.clientWidth + 1, 'account card overflows');
     check(document.querySelectorAll('.account-edit').length === (selected ? 1 : 0), 'edit entry ignores session');
     check(document.querySelectorAll('.account-logout').length === (selected ? 1 : 0), 'logout entry ignores session');
     for (const el of document.querySelectorAll('.account-edit,.account-link')) {
      const style = getComputedStyle(el);
      check(style.backgroundColor === 'rgba(0, 0, 0, 0)', 'account action is too prominent');
      check(parseFloat(style.fontSize) <= 13 && el.clientHeight >= 40, 'account action text or touch target');
     }
     check(document.querySelectorAll('.account-avatar').length === (selected ? 1 : 0), 'avatar mapping preview missing');
     check(document.querySelector('.account-avatar-wrap').clientWidth >= 44, 'avatar too small');
    } else if (page === 'shelf') {
     const modal = document.querySelector('.age-welcome'), m = modal.getBoundingClientRect();
     check(m.left >= 0 && m.right <= innerWidth && m.top >= 0 && m.bottom <= innerHeight, 'age dialog outside viewport');
     check(document.querySelectorAll('.age-option').length === 3, 'missing ages');
     check(document.querySelector('.welcome-save').disabled === !selected, 'confirmation ignores required selection');
     check(document.querySelectorAll('.age-option.selected').length === (selected ? 1 : 0), 'selection mismatch');
     for (const el of document.querySelectorAll('.age-option')) { const r = el.getBoundingClientRect(); check(r.width > 180 && r.height >= 60, 'age touch target too small'); }
     check(modal.scrollWidth <= modal.clientWidth + 1, 'dialog horizontal overflow');
     const save = document.querySelector('.welcome-save'); save.scrollIntoView({ block: 'nearest' });
     check(save.getBoundingClientRect().bottom <= m.bottom + 1, 'save button cannot be reached');
    } else if (page === 'library') {
     const filters = [...document.querySelectorAll('.filter-value')];
     check(filters.length === 2, 'missing filter pickers');
     check(filters[0].textContent.includes(selected ? '3–4 岁' : '全部'), 'age label mismatch');
     check(filters[1].textContent.includes(selected ? '动物朋友' : '全部'), 'theme label mismatch');
     for (const el of filters) { const r = el.getBoundingClientRect(); check(r.width >= 120 && r.height >= 36, 'filter touch target too small'); check(el.scrollWidth <= el.clientWidth + 1, 'filter content overflow'); }
    } else {
     check(document.querySelector('input').getAttribute('value') === '小小读者', 'profile name missing');
     check(document.querySelector('.age-picker').textContent.includes('3–4'), 'saved age missing');
    }
    return failures;
   }, { page, selected, scenario, hasTabBar, safeBottom });
   assert.deepEqual(errors, [], `${page}/${selected}/${width}x${height}: ${errors.join('; ')}`); checks++;
   if (output && width === 390 && selected) {
    fs.mkdirSync(output, { recursive: true });
    if (page === 'shelf' && !['shelfFavorites', 'shelfAccount'].includes(scenario)) await p.locator('.age-welcome').evaluate(e => e.scrollTop = 0);
    await p.screenshot({ path: path.join(output, scenario + '-390.png'), fullPage: true });
   }
  }
 }
 console.log(`PASS: ${checks} age-dialog/profile/library browser adapter cases; four viewports, custom tab icons/16px labels/selection/safe areas, required selection, saved profile, filter labels, compact favorite rows/pagination, completed badges, touch targets and scrolling. Not a native device test.`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
