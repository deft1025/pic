// Speech ranges and illustration anchors come only from the book API.
// Only attribution-only gaps can continue a speech turn. Actions, scene changes,
// unknown anchors, and intervening speakers retain separate bubbles.
function isSpeechAttribution(gap,names,language) {
 if(gap.length>80||/[\r\n]/.test(gap))return false;
 const phrase=gap.trim().replace(/^[，,。.!?！？:：;；“”‘’"'…\s]+|[，,。.!?！？:：;；“”‘’"'…\s]+$/g,'');
 if(!phrase)return true;
 return names.filter(Boolean).some(name=>{
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 if(language==='zh')return new RegExp('^'+escaped+'(?:轻声|小声|大声|笑着)?(?:说|问|喊|叫)(?:道)?$').test(phrase);
 const verb='(?:says?|said|asks?|asked|calls?|called|shouts?|shouted|replies|replied|answers?|answered|whispers?|whispered)';
 return new RegExp('^(?:'+verb+'[ \t]+(?:the[ \t]+)?'+escaped+'|'+escaped+'[ \t]+'+verb+')$','i').test(phrase);
 });
}

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
function split(page, language, enabled) {
 const text = language === 'zh' ? page.text_zh : page.text_original, config = page.dialogue;
 if (!enabled || !config || config.length?.[language] !== text.length || !config.parts?.length) return { bubbles: [], narration: text };
 let cursor = 0, narration = [], bubbles = [];
 for (let i = 0; i < config.parts.length; i++) {
  const p = config.parts[i], start = p.start?.[language], end = p.end?.[language];
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < cursor || end <= start || end > text.length) return { bubbles: [], narration: text };
  const gap = text.slice(cursor, start), names = [config.parts[i - 1]?.speaker?.[language], p.speaker?.[language]];
  if (gap.trim() && !isSpeechAttribution(gap, names, language)) narration.push(gap);
  bubbles.push({ key: i, words: text.slice(start, end), speaker: p.speaker?.[language] || '', part: p }); cursor = end;
 }
 const tail = text.slice(cursor);
 if (tail.trim() && !isSpeechAttribution(tail, [config.parts[config.parts.length - 1].speaker?.[language]], language)) narration.push(tail);
 return { bubbles, narration: narration.join('') };
}
// Width choices share real text measurements with both free placement and packing.
function measurements(bubbles, width) {
 const max = Math.min(300, width - 12), result = [];
 bubbles.forEach((b, index) => {
  const preferred = clamp((b.part.width || 44) * width / 100, Math.min(90, max), max);
  const limits = [preferred, (width - 18) / 2, (width - 24) / 3, max];
  for (const limit of new Set(limits.filter(n => n >= Math.min(80, max)).map(Math.floor))) {
   result.push({ key: index + '-' + limit, index, width: limit, words: b.words, speaker: b.speaker });
  }
 });
 return result;
}
const distance = (r, p) => Math.hypot(p[0] - clamp(p[0], r.x, r.x + r.w), p[1] - clamp(p[1], r.y, r.y + r.h));
const intersects = (a, b, gap = 6) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
const target = (bubble, w, h) => bubble.part.target ? bubble.part.target.map((v, i) => v * (i ? h : w) / 100) : [bubble.part.x * w / 100, bubble.part.y * h / 100];
function positions(bubbles, choices, width, height) {
 const pad = 6, guard = 10, targets = bubbles.filter(b => b.part.target).map(b => target(b, width, height));
 const attempt = order => {
  const placed = [];
  for (const i of order) {
   const b = bubbles[i], t = target(b, width, height); let best = null;
   for (const size of choices[i]) {
    const w = size.w, h = size.h;
    if (h > height - 2 * pad || w > width - 2 * pad) continue;
    for (const x0 of [t[0] - w / 2, t[0] + guard, t[0] - guard - w, b.part.x * width / 100, pad, width - w - pad]) {
     for (const y0 of [t[1] - guard - h, t[1] + guard, t[1] - h / 2, b.part.y * height / 100, pad, height - h - pad]) {
      const r = { x: clamp(x0, pad, width - w - pad), y: clamp(y0, pad, height - h - pad), w, h, header: size.header, scroll: false };
      if (placed.some(o => o && intersects(r, o)) || targets.some(p => distance(r, p) < guard)) continue;
      const score = distance(r, t) * .3 + Math.hypot(r.x - b.part.x * width / 100, r.y - b.part.y * height / 100) * .08 + w * h / (width * height) * 100;
      if (!best || score < best.score) best = { ...r, score };
     }
    }
   }
   if (!best) return null; placed[i] = best;
  }
  return placed;
 };
 const order = bubbles.map((_, i) => i);
 return attempt(order) || attempt(order.reverse());
}
function permutations(items) {
 if (items.length < 2) return [items];
 return items.flatMap((item, i) => permutations(items.filter((_, j) => j !== i)).map(rest => [item, ...rest]));
}
function pack(bubbles, choices, width, height) {
 const pad = 6, gap = 6, targets = bubbles.filter(b => b.part.target).map(b => target(b, width, height));
 const indices = bubbles.map((_, i) => i), orders = indices.length <= 4 ? permutations(indices) : [indices];
 let best = null;
 for (let columns = 1; columns <= Math.min(3, bubbles.length); columns++) {
  const rows = Math.ceil(bubbles.length / columns), cw = (width - pad * 2 - gap * (columns - 1)) / columns;
  const available = (height - pad * 2 - gap * (rows - 1)) / rows;
  if (cw < Math.min(80, width - pad * 2)) continue;
  const eligible = choices.map(options => options.filter(size => size.w <= cw + .1));
  if (eligible.some(options => !options.length)) continue;
  const minimumHeight = Math.max(76, ...eligible.map(options => Math.min(...options.map(size => size.header + 24))));
  const ch = Math.max(minimumHeight, available), overflow = ch > available;
  for (const order of orders) {
   let score = overflow ? width * height : 0; const placed = [];
   for (let slot = 0; slot < order.length; slot++) {
    const i = order[slot], b = bubbles[i], t = target(b, width, height);
    const cell = { x: pad + (slot % columns) * (cw + gap), y: pad + Math.floor(slot / columns) * (ch + gap) };
    let candidate = null;
    for (const size of choices[i]) {
     if (size.w > cw + .1) continue;
     const h = Math.min(size.h, ch), w = size.w;
     if (h < size.header + 24) continue;
     for (const x of [cell.x, cell.x + cw - w]) for (const y of [cell.y, cell.y + ch - h]) {
      const r = { x, y, w, h, header: size.header, scroll: h < size.h };
      const covered = targets.reduce((sum, p) => sum + Math.max(0, 10 - distance(r, p)), 0);
      const cost = covered * 20 + distance(r, t) * .3 + Math.hypot(x - b.part.x * width / 100, y - b.part.y * height / 100) * .08 + w * h / (width * height) * 100 + (size.h - h) * 50;
      if (!candidate || cost < candidate.cost) candidate = { ...r, cost };
     }
    }
    if (!candidate) { score = Infinity; break; }
    score += candidate.cost; placed[i] = candidate;
   }
   if (Number.isFinite(score) && (!best || score < best.score)) best = { placements: placed, overflow, score };
  }
 }
 return best;
}
function merge(bubbles, page, language) {
 const text = language === 'zh' ? page.text_zh : page.text_original, result = [];
 for (const bubble of bubbles) {
  const before = result[result.length - 1], previous = before?.lastPart || before?.part;
  const gap = previous ? text.slice(previous.end[language], bubble.part.start[language]) : '';
  if (before && previous.speaker?.[language] === bubble.part.speaker?.[language] && previous.target && JSON.stringify(previous.target) === JSON.stringify(bubble.part.target) && isSpeechAttribution(gap, [bubble.speaker], language)) {
   before.words += ' ' + bubble.words; before.lastPart = bubble.part;
  } else result.push({ ...bubble });
 }
 return result;
}
module.exports = { split, measurements, positions, pack, merge };
