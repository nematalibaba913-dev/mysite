// KPI qiymətləndirmə blankı (Excel strukturunda)
import { CATEGORIES, computeScores, completeness, fmt, r2 } from './kpi.js';
import { esc } from './core.js';

const pctVal = (v) => (v === undefined || v === null || v === '' ? '' : r2(Number(v) * 100));

export function renderForm(root, { evaluation = null, editable = true, header = {}, onChange } = {}) {
  const inputs = { ...(evaluation?.inputs || {}) };
  const just = { ...(evaluation?.justifications || {}) };
  const ro = !editable;

  const field = (code, max) => {
    if (ro) return `<span class="val">${inputs[code] == null || inputs[code] === '' ? '—' : fmt(Number(inputs[code]) * 100, 0) + '%'}</span>`;
    return `<div class="pct"><input class="inp tnum" type="number" min="0" max="100" step="1" inputmode="decimal" data-code="${code}" data-max="${max}" value="${pctVal(inputs[code])}" placeholder="0–100"></div>`;
  };
  const jfield = (key, ph = 'Qısa əsaslandırma') => ro
    ? `<span class="muted small">${esc(just[key] || '')}</span>`
    : `<textarea class="inp" rows="1" data-just="${key}" placeholder="${ph}">${esc(just[key] || '')}</textarea>`;

  const sections = CATEGORIES.map((c) => {
    let body;
    if (c.type === 'pct') {
      body = `<table class="kpi-tbl"><thead><tr><th class="c-no">№</th><th>Göstərici</th><th class="c-max">Maks.</th><th class="c-res">Nəticə</th><th class="c-bal">Bal</th><th class="c-just">Qısa əsaslandırma</th></tr></thead><tbody>
        ${c.items.map((it, i) => `<tr><td class="c-no">${i + 1}</td><td>${esc(it.title)}</td><td class="c-max">${it.max}</td><td class="c-res">${field(it.code, it.max)}</td><td class="c-bal" data-bal="${it.code}">—</td><td class="c-just">${jfield(it.code)}</td></tr>`).join('')}
      </tbody></table>`;
    } else {
      const sel = Number(inputs['3.lvl']) || 0;
      body = `<table class="kpi-tbl"><thead><tr><th class="c-no">№</th><th>Meyar</th><th class="c-max">Aralıq</th><th class="c-res">Seçim üzrə bal</th><th>Səviyyə</th><th class="c-just">Qısa əsaslandırma</th></tr></thead><tbody>
        ${c.levels.map((l) => {
          const on = sel === l.lvl;
          const cell = ro
            ? `<span class="val">${on ? fmt(inputs['3.score'], 0) : ''}</span>`
            : `<input class="inp tnum" type="number" step="1" min="${l.min}" max="${l.max}" data-lvlscore="${l.lvl}" value="${on ? esc(inputs['3.score'] ?? '') : ''}" placeholder="${l.min}–${l.max}" ${on ? '' : 'disabled'}>`;
          return `<tr class="lvl ${on ? 'on' : ''}" data-lvl="${l.lvl}"><td class="c-no">${ro ? (on ? '●' : l.lvl) : `<input type="radio" name="lvl" value="${l.lvl}" ${on ? 'checked' : ''}>`}</td><td>${esc(l.title)}</td><td class="c-max">${l.min}–${l.max}</td><td class="c-res">${cell}</td><td>${esc(l.label)}</td>${l.lvl === 1 ? `<td class="c-just" rowspan="4">${jfield('3')}</td>` : ''}</tr>`;
        }).join('')}
      </tbody></table>`;
    }
    return `<div class="sec" data-sec="${c.no}">
      <div class="sec-h"><h4>${esc(c.section)}</h4><span class="muted small">Maks. ${c.max} bal</span><span class="sub" data-cat="${c.no}">0.00 / ${c.max}</span></div>
      ${body}
      <div class="cat-just">${ro ? (just['c' + c.no] ? `<div class="small"><b>İstiqamət üzrə əsaslandırma:</b> ${esc(just['c' + c.no])}</div>` : '') : `<textarea class="inp" rows="1" data-just="c${c.no}" placeholder="«${esc(c.title)}» istiqaməti üzrə qısa əsaslandırma (yekun cədvəl üçün)"></textarea>`}</div>
    </div>`;
  }).join('');

  root.innerHTML = `<div class="card ${ro ? 'ro' : ''}">
    <div class="form-head">
      <div><div class="k">Qiymətləndirmə dövrü</div><div class="v">${esc(header.period || '')}</div></div>
      <div><div class="k">Tarix</div><div class="v">${ro ? esc(header.date || '') : `<input class="inp" type="date" data-date value="${esc(header.date || new Date().toISOString().slice(0, 10))}" style="padding:6px 8px">`}</div></div>
      <div><div class="k">Qiymətləndirən</div><div class="v">${esc(header.evaluator || '')}<div class="small muted">${esc(header.evaluatorPos || '')}</div></div></div>
      <div><div class="k">Təlimçi</div><div class="v">${esc(header.trainer || '')}<div class="small muted">${esc(header.trainerPos || '')}</div></div></div>
    </div>
    ${sections}
  </div>`;
  if (!ro) $$all(root, 'textarea[data-just]').forEach((t) => { if (t.dataset.just.startsWith('c')) t.value = just[t.dataset.just] || ''; });

  const refresh = () => {
    const sc = computeScores(inputs);
    for (const c of CATEGORIES) {
      if (c.type === 'pct') for (const it of c.items) {
        const cell = root.querySelector(`[data-bal="${it.code}"]`);
        const v = inputs[it.code];
        cell.textContent = v === '' || v == null ? '—' : fmt(Number(v) * it.max);
      }
      root.querySelector(`[data-cat="${c.no}"]`).textContent = `${fmt(sc.cats[c.no - 1])} / ${c.max}`;
    }
    onChange?.({ inputs: { ...inputs }, scores: sc, complete: completeness(inputs) });
    return sc;
  };

  if (!ro) {
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.code) {
        const raw = t.value.trim();
        const n = Number(raw.replace(',', '.'));
        const ok = raw === '' || (isFinite(n) && n >= 0 && n <= 100);
        t.classList.toggle('inv', !ok);
        if (raw === '' || !ok) delete inputs[t.dataset.code]; else inputs[t.dataset.code] = r2(n) / 100;
        refresh();
      } else if (t.dataset.lvlscore) {
        const l = CATEGORIES[2].levels.find((x) => x.lvl === Number(t.dataset.lvlscore));
        const raw = t.value.trim(); const n = Number(raw.replace(',', '.'));
        const ok = raw === '' || (isFinite(n) && n >= l.min && n <= l.max);
        t.classList.toggle('inv', !ok);
        if (raw === '' || !ok) delete inputs['3.score']; else inputs['3.score'] = n;
        refresh();
      } else if (t.dataset.just) {
        just[t.dataset.just] = t.value;
      }
    });
    root.addEventListener('change', (e) => {
      if (e.target.name === 'lvl') selectLevel(Number(e.target.value));
    });
    root.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.lvl');
      if (tr && !e.target.closest('input,textarea')) selectLevel(Number(tr.dataset.lvl));
    });
    const selectLevel = (lvl) => {
      if (Number(inputs['3.lvl']) === lvl) return;
      inputs['3.lvl'] = lvl; delete inputs['3.score'];
      $$all(root, 'tr.lvl').forEach((tr) => {
        const on = Number(tr.dataset.lvl) === lvl;
        tr.classList.toggle('on', on);
        tr.querySelector('input[type=radio]').checked = on;
        const si = tr.querySelector('[data-lvlscore]');
        si.disabled = !on; si.value = ''; si.classList.remove('inv');
      });
      root.querySelector(`[data-lvlscore="${lvl}"]`).focus();
      refresh();
    };
    // textarea auto-grow
    root.addEventListener('input', (e) => { if (e.target.tagName === 'TEXTAREA') { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 2 + 'px'; } });
  }
  const sc0 = refresh();

  return {
    get inputs() { return { ...inputs }; },
    get justifications() {
      const j = {};
      for (const [k, v] of Object.entries(just)) if (String(v || '').trim()) j[k] = String(v).trim();
      return j;
    },
    get date() { return root.querySelector('[data-date]')?.value || null; },
    get scores() { return computeScores(inputs); },
    complete: () => completeness(inputs),
    firstMissing() {
      for (const c of CATEGORIES) {
        if (c.type === 'level') { if (!inputs['3.lvl'] || inputs['3.score'] == null) return root.querySelector('[data-sec="3"]'); continue; }
        for (const it of c.items) if (inputs[it.code] == null) return root.querySelector(`[data-code="${it.code}"]`);
      }
      return null;
    },
    initial: sc0,
  };
}

function $$all(root, sel) { return [...root.querySelectorAll(sel)]; }

// Yan panel — yekun cədvəl (Excel-dəki "KPI üzrə yekun qiymətləndirmə")
export function summaryHtml(scores, complete) {
  return `<div class="eyebrow">KPI üzrə yekun qiymətləndirmə</div>
    <div style="display:flex;align-items:flex-end;gap:10px;margin-top:10px"><div class="big" data-sum-total>${fmt(scores.total)}</div><div class="muted" style="padding-bottom:6px">/ 100</div></div>
    <div class="cats">${CATEGORIES.map((c, i) => `<div><div class="row"><span>${c.no}. ${esc(c.title)}</span><b>${fmt(scores.cats[i])} / ${c.max}</b></div><div class="bar"><i style="width:${Math.min(100, (scores.cats[i] / c.max) * 100)}%"></i></div></div>`).join('')}</div>
    <div class="small muted" style="margin-top:14px">Doldurulub: <b>${complete.filled}</b> / ${complete.all} göstərici</div>`;
}
