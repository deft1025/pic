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
  for (const [page, selected] of [['shelf', false], ['shelf', true], ['profile', true], ['library', false], ['library', true]]) {
   const data = page === 'shelf' ? { loggedIn: true, profile: { id: '10000', name: '' }, needsProfile: true, busy: false, loading: false, items: [], error: '', loginError: '', syncError: '', ageDialog: true, firstAges: ages, firstAge: selected ? '3-4' : '', ageSaving: false } : page === 'library' ? { q: '', ages: [{ id: '', name: '全部' }, ...ages], categories: [{ id: '', name: '全部' }, { id: 'animals', name: '动物朋友' }], ageIndex: selected ? 2 : 0, categoryIndex: selected ? 1 : 0, filtersReady: true, filtersLoading: false, filterError: '', error: '', loading: false, total: 0, items: [] } : { name: '小小读者', age: '3-4', ages, ageNames: ['请选择年龄段', ...ages.map(a => a.name)], ageIndex: 2, first: false, loading: false, saving: false, error: '' };
   const template = fs.readFileSync(path.join(root, 'pages', page, 'index.wxml'), 'utf8');
   const styles = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8').replace(/\bpage\{/g, 'body{') + fs.readFileSync(path.join(root, 'pages', page, 'index.wxss'), 'utf8');
   await p.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
   await p.evaluate(({ template, styles, data }) => {
    const css = document.createElement('style'); css.textContent = 'body{margin:0}*{box-sizing:border-box}button{border:0;font-family:inherit}input{font-family:inherit}' + styles.replace(/([\d.]+)rpx/g, (_, n) => Number(n) * innerWidth / 750 + 'px'); document.head.append(css);
    const tree = new DOMParser().parseFromString(template.replace(/<([\w-]+)([^>]*?)\/>/g, (_, t, a) => t === 'br' ? '<br>' : '<' + t + a + '></' + t + '>'), 'text/html').body;
    const expr = (e, s) => new Function('s', 'with(s){return (' + e + ')}')(s);
    const val = (v, s) => /^{{([\s\S]+)}}$/.test(v) ? expr(v.slice(2, -2), s) : v.replace(/{{([\s\S]+?)}}/g, (_, e) => expr(e, s) ?? '');
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
     const tag = ['input', 'button', 'br'].includes(n.localName) ? n.localName : n.localName === 'text' ? 'span' : 'div';
     const e = document.createElement(tag);
     for (const a of n.attributes) {
      if (/^(wx:|bind|catch)/.test(a.name)) continue;
      const v = val(a.value, scope);
      if (a.name === 'disabled') e.disabled = Boolean(v); else e.setAttribute(a.name, String(v));
     }
     if (n.localName === 'scroll-view' && n.hasAttribute('scroll-y')) e.style.overflowY = 'auto';
     out.append(e); children(n, e, scope);
    }
    children(tree, document.body, data);
   }, { template, styles, data });
   const errors = await p.evaluate(({ page, selected }) => {
    const failures = [], check = (v, m) => { if (!v) failures.push(m); };
    check(document.documentElement.scrollWidth <= innerWidth + 1, 'page horizontal overflow');
    if (page === 'shelf') {
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
   }, { page, selected });
   assert.deepEqual(errors, [], `${page}/${selected}/${width}x${height}: ${errors.join('; ')}`); checks++;
   if (output && width === 390 && selected) {
    fs.mkdirSync(output, { recursive: true });
    if (page === 'shelf') await p.locator('.age-welcome').evaluate(e => e.scrollTop = 0);
    await p.screenshot({ path: path.join(output, page + '-390.png'), fullPage: true });
   }
  }
 }
 console.log(`PASS: ${checks} age-dialog/profile/library browser adapter cases; four viewports, required selection, saved profile, filter labels, touch targets and scrolling. Not a native device test.`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
