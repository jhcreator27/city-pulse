// Controllo accessibilità eseguito nella pagina (usato dai test automatici)
(() => {
  const out = { contrast: [], noName: [], noAlt: [], noLabel: [], iconText: 0, dupIds: [], noH1: false, noMain: false, clickNoFocus: [] };
  const lum = c => { const srgb = c.startsWith('color('); const m = c.replace('srgb','').match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(v => { v = srgb ? +v : v / 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return { L: .2126 * r + .7152 * g + .0722 * b, a: m[3] === undefined ? 1 : +m[3] } };
  const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none') return 'complex'; const c = lum(cs.backgroundColor); if (c && c.a > .5) return c.L; if (e.classList?.contains('ill') || e.tagName === 'svg') return 'complex'; } return 1 };
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > .1 };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || el.closest('.ms,svg,script,style,[aria-hidden="true"]')) continue;
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.data.trim()).join(' ').trim();
    if (!txt) continue;
    const cs = getComputedStyle(el); const fg = lum(cs.color); const bg = bgOf(el);
    if (bg === 'complex' || !fg) continue;
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700; const large = size >= 24 || (bold && size >= 18.66);
    const r = ratio(fg.L, bg); const need = large ? 3 : 4.5;
    if (r < need) { const k = cs.color + '|' + txt.slice(0, 30); if (!seen.has(k)) { seen.add(k); out.contrast.push({ text: txt.slice(0, 40), ratio: +r.toFixed(2), need, color: cs.color, cls: el.className?.toString?.().slice(0, 40) }) } }
  }
  const name = el => (el.getAttribute('aria-label') || [...el.querySelectorAll('*')].concat([el]).filter(x => !x.closest('.ms,[aria-hidden="true"]')).map(x => [...x.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join('')).join(' ') || el.getAttribute('title') || (el.querySelector('img[alt]')?.alt) || '').trim();
  for (const el of document.querySelectorAll('button, a[href], [role=button]')) if (vis(el) && !name(el)) out.noName.push(el.outerHTML.slice(0, 90));
  for (const el of document.querySelectorAll('img')) if (!el.hasAttribute('alt')) out.noAlt.push(el.outerHTML.slice(0, 80));
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    if (!vis(el) && el.type !== 'checkbox' && el.type !== 'file') continue;
    const ok = el.getAttribute('aria-label') || el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.title;
    if (!ok) out.noLabel.push(el.outerHTML.slice(0, 90));
  }
  out.iconText = [...document.querySelectorAll('.ms')].filter(s => s.getAttribute('aria-hidden') !== 'true' && !s.closest('[aria-hidden="true"]')).length;
  const ids = {}; for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1; out.dupIds = Object.keys(ids).filter(k => ids[k] > 1);
  out.noH1 = !document.querySelector('#app h1, #app h2'); out.noMain = !document.querySelector('main,[role=main]');
  for (const el of document.querySelectorAll('[data-act]')) if (!['BUTTON', 'A', 'INPUT', 'SELECT'].includes(el.tagName) && el.tabIndex < 0 && vis(el)) out.clickNoFocus.push(el.tagName + '.' + (el.getAttribute('class') || '') + ' ' + el.dataset.act);
  return out;
})()
