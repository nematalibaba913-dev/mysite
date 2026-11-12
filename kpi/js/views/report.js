// Təqdimat: veb görünüş + PowerPoint ixracı (verilmiş 12 slaydlıq formada)
import { sb, esc, toast, errMsg, fetchTrainers, fetchEvaluations, fetchQuarters, fetchReportTexts, saveReportText, quarterLabel, aggregate, twoNames, shortName, avg, ORG } from '../core.js';
import { CATEGORIES, QUARTER_LABELS, fmt, r2 } from '../kpi.js';
import { pickQuarter, quarterSelect } from './admin.js';

const FOOT = 'Təlimçilərin KPI Qiymətləndirilməsi | Yekun İcmal';
const C = { navy: '0F172A', slate: '1E293B', teal: '0D9488', teal2: '14B8A6', blue: '1E3A8A', muted: '64748B', muted2: '94A3B8', bg: 'F8FAFC', row: 'F1F5F9', line: 'E2E8F0', white: 'FFFFFF', light: 'CBD5E1' };

const joinAz = (arr) => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' və ' + arr[arr.length - 1];
const lcFirst = (s) => s ? s[0].toLocaleLowerCase('az') + s.slice(1) : s;
const pct = (x) => Math.round(x * 100);

/* ---------------- Avtomatik qaralamalar ---------------- */
function adjFor(p) {
  if (p >= 0.8) return 'yüksəkdir';
  if (p >= 0.65) return 'yaxşı səviyyədədir';
  if (p >= 0.5) return 'orta səviyyədədir';
  return 'zəifdir, inkişaf etdirilməlidir';
}

export function draftTrainerJust(row, ci) {
  const c = CATEGORIES[ci];
  if (row.final === null) return '';
  if (c.type === 'level') {
    if (!row.lvls.length) return '';
    const freq = {}; row.lvls.forEach((l) => { freq[l] = (freq[l] || 0) + 1; });
    const lvl = Number(Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
    const L = c.levels.find((x) => x.lvl === lvl);
    return `${L.title} (${L.label} səviyyə).`;
  }
  const items = c.items.map((it) => ({ ...it, p: row.itemPct[it.code] })).filter((x) => x.p != null);
  if (!items.length) return '';
  const catP = row.cats[ci] / c.max;
  const sorted = [...items].sort((a, b) => (catP >= 0.65 ? b.p - a.p : a.p - b.p));
  const [a, b] = sorted;
  const part = b ? `${a.title} (${pct(a.p)}%) və ${lcFirst(b.title)} (${pct(b.p)}%)` : `${a.title} (${pct(a.p)}%)`;
  return `${part} ${adjFor(b ? (a.p + b.p) / 2 : a.p)}.`;
}

export function draftNotes(agg) {
  const r = agg.ranked;
  if (!r.length) return '';
  const nm = (x) => `${twoNames(x.trainer.full_name)}`;
  const leaders = r.filter((x, i) => i < 2 || x.final >= 70).filter((x) => x.final >= 60);
  const dev = r.filter((x) => x.final < 60 && !leaders.includes(x));
  const mid = r.filter((x) => !leaders.includes(x) && !dev.includes(x));
  const lines = [];
  if (leaders.length) lines.push(`Lider təlimçilər: ${joinAz(leaders.map((x) => `${nm(x)} (${x.rounded})`))} sabit yüksək performans nümayiş etdirir${leaders.length > 1 ? 'lər' : ''}.`);
  if (mid.length) lines.push(`Orta səviyyə: ${joinAz(mid.map((x) => `${nm(x)} (${x.rounded})`))} nizam-intizamlı və sabit nəticə göstərir${mid.length > 1 ? 'lər' : ''}.`);
  if (dev.length) lines.push(`İnkişaf sahələri: ${joinAz(dev.map(nm))} üçün inkişaf tələb olunur.`);
  return lines.join('\n');
}

const CAT_ADVICE = {
  1: 'FİP-lərin hədəflərinin dəqiqləşdirilməsi və benefisiar inkişafının mütəmadi ölçülməsi tövsiyə olunur.',
  2: 'Təlim planlarının icrasına aylıq nəzarət və davamiyyətin artırılması üzrə tədbirlər tövsiyə olunur.',
  3: 'Yeni metod və materialların paylaşılması üçün rüblük metodiki görüşlərin keçirilməsi tövsiyə olunur.',
  4: 'İxtisasartırma təlimləri, mentorluq və təcrübə mübadiləsinin planlaşdırılması tövsiyə olunur.',
  5: 'Hesabatların vaxtında təqdimi və daxili prosedurlara riayət üzrə nəzarətin gücləndirilməsi tövsiyə olunur.',
};

export function draftRecs(agg, prev) {
  const r = agg.ranked;
  if (!r.length) return '';
  const lines = [];
  const qAvg = avg(r.map((x) => x.final));
  lines.push(`Filial üzrə orta yekun bal ${fmt(qAvg)} təşkil edir; ${r.length} təlimçi qiymətləndirilib.`);
  if (prev?.ranked?.length) {
    const pAvg = avg(prev.ranked.map((x) => x.final));
    const d = qAvg - pAvg;
    lines.push(`Əvvəlki rüblə müqayisədə orta bal ${d >= 0 ? fmt(d) + ' bal artıb' : fmt(-d) + ' bal azalıb'} (${fmt(pAvg)} → ${fmt(qAvg)}).`);
  }
  const catP = CATEGORIES.map((c, i) => ({ c, p: avg(r.map((x) => x.cats[i])) / c.max }));
  const best = [...catP].sort((a, b) => b.p - a.p)[0];
  const worst = [...catP].sort((a, b) => a.p - b.p)[0];
  lines.push(`Ən güclü istiqamət: «${best.c.title}» (orta ${pct(best.p)}%).`);
  lines.push(`Ən zəif istiqamət: «${worst.c.title}» (orta ${pct(worst.p)}%). ${CAT_ADVICE[worst.c.no]}`);
  const items = [];
  for (const c of CATEGORIES) if (c.type === 'pct') for (const it of c.items) {
    const v = r.map((x) => x.itemPct[it.code]).filter((x) => x != null);
    if (v.length) items.push({ t: it.title, p: avg(v) });
  }
  const low = items.sort((a, b) => a.p - b.p).slice(0, 2);
  if (low.length) lines.push(`Ən aşağı göstəricilər: ${joinAz(low.map((x) => `${lcFirst(x.t)} (${pct(x.p)}%)`))}.`);
  const spread = r.filter((x) => x.evals.length > 1).map((x) => ({ x, lo: Math.min(...x.evals.map((e) => e.total)), hi: Math.max(...x.evals.map((e) => e.total)) })).filter((s) => s.hi - s.lo >= 15);
  if (spread.length) lines.push(`Qiymətləndiricilər arasında fərq yüksəkdir: ${joinAz(spread.map((s) => `${twoNames(s.x.trainer.full_name)} (${fmt(s.lo, 1)}–${fmt(s.hi, 1)})`))}. Meyarların vahid şərhi üçün qiymətləndiricilərlə kalibrləmə görüşü tövsiyə olunur.`);
  const dev = r.filter((x) => x.final < 60);
  if (dev.length) lines.push(`${joinAz(dev.map((x) => twoNames(x.trainer.full_name)))} üçün fərdi inkişaf planı hazırlanması və növbəti rübdə aralıq monitorinq tövsiyə olunur.`);
  return lines.join('\n');
}

/* ---------------- Model ---------------- */
async function buildModel(q, quarters) {
  const [trainers, evals, texts] = await Promise.all([fetchTrainers(true), fetchEvaluations({ quarter_id: q.id }), fetchReportTexts(q.id)]);
  const used = trainers.filter((t) => evals.some((e) => e.trainer_id === t.id));
  const agg = aggregate(used, evals);
  // əvvəlki rüb
  const order = [...quarters].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const pq = order[order.findIndex((x) => x.id === q.id) - 1];
  let prev = null;
  if (pq) {
    const pe = await fetchEvaluations({ quarter_id: pq.id });
    if (pe.length) prev = { q: pq, ...aggregate(trainers.filter((t) => pe.some((e) => e.trainer_id === t.id)), pe) };
  }
  const uniqPos = [...new Set(agg.cols.map((c) => c.position))];
  const qLbl = QUARTER_LABELS[q.quarter].replace('rüb', 'Rüb');
  const auto = {
    cover_desc: `${agg.ranked.length} təlimçi üzrə müfəssəl qiymətləndirmə kartları, əsaslandırılmış ballar və müqayisəli reytinq icmalı.`,
    cover_src: `Mənbə: ${qLbl} üzrə qiymətləndirmə blankları (${joinAz(uniqPos)})`,
    notes: draftNotes(agg),
    rec_title: 'Nəticələr və tövsiyələr',
    recs: draftRecs(agg, prev),
  };
  agg.ranked.forEach((r) => CATEGORIES.forEach((_, i) => { auto[`tj:${r.trainer.id}:${i + 1}`] = draftTrainerJust(r, i); }));
  const T = (k) => (texts[k] != null && texts[k] !== '' ? texts[k] : auto[k] || '');
  return { q, agg, prev, texts, auto, T, total: 3 + agg.ranked.length + 1 };
}

/* ---------------- Veb slaydlar ---------------- */
const head = (title) => `<div class="s-head"><div class="s-eyebrow">YEKUN NƏTİCƏLƏR</div><div class="s-title">${esc(title)}</div></div><div class="s-rule"></div>`;
const foot = (n, N) => `<div class="s-foot">${FOOT} | Səhifə ${n} / ${N}</div>`;
const bullets = (txt) => String(txt || '').split('\n').map((s) => s.trim()).filter(Boolean);

function slidesHtml(M, editing) {
  const { agg, T, q } = M; const N = M.total; let n = 0;
  const out = [];
  const wrap = (inner, cls = '', editor = '') => { n++; out.push(`<div class="slide-wrap"><div class="slide-num">Slayd ${n}</div><div class="slide ${cls}">${inner}</div>${editing && editor ? `<div class="card pad edit-pane" style="margin-top:10px">${editor}</div>` : ''}</div>`); };
  const ed = (key, label, src = '') => `<label class="f"><span>${esc(label)} ${M.texts[key] ? '<span class="badge open">redaktə edilib</span>' : '<span class="badge">avtomatik</span>'}</span>
    <textarea class="inp" data-key="${esc(key)}" rows="3">${esc(T(key))}</textarea></label>
    <div style="display:flex;gap:8px;margin:-6px 0 12px"><button class="btn sm teal" data-save="${esc(key)}">Yadda saxla</button>${M.texts[key] ? `<button class="btn sm ghost" data-reset="${esc(key)}">Avtomatik mətnə qaytar</button>` : ''}</div>${src}`;

  // 1. Üz qabığı
  wrap(`<div class="cover"><div class="e">YEKUN NƏTİCƏLƏR · ${esc(quarterLabel(q).toLocaleUpperCase('az'))}</div>
    <h2>${esc(ORG.branch)} filialının ${esc(ORG.dept)} üzrə<br>Təlimçilərin performans və KPI qiymətləndirilməsi hesabatı</h2>
    <div class="d">${esc(T('cover_desc'))}</div><ul><li>${esc(T('cover_src'))}</li><li>Əhatə olunan qiymətləndirmə istiqamətləri: 5 Əsas KPI Bəndi (Maksimum 100 Bal)</li></ul></div>
    <div class="s-foot" style="color:#64748B">${FOOT} | Səhifə 1 / ${N}</div>`, 'dark', ed('cover_desc', 'Üz qabığı — təsvir') + ed('cover_src', 'Üz qabığı — mənbə'));

  // 2. Reytinq cədvəli
  wrap(`${head('Ümumi reytinq və qiymətləndiricilər üzrə müqayisəli cədvəl')}
    <div class="s-body" style="left:12%;right:12%"><table class="st"><thead><tr><th style="text-align:center">№</th><th>Təlimçinin Soyadı, Adı</th><th style="text-align:center">Yekun Bal</th>${agg.cols.map((c) => `<th style="text-align:center">${esc(c.label)} Balı</th>`).join('')}</tr></thead>
    <tbody>${agg.ranked.map((r) => `<tr><td class="n">${r.rank}</td><td>${esc(r.trainer.full_name)}</td><td class="y">${r.rounded}</td>${agg.cols.map((c) => `<td class="n">${r.byKey[c.key] ? fmt(r.byKey[c.key].total) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${foot(2, N)}`);

  // 3. Qrafik + qeydlər
  wrap(`${head('Təlimçilərin yekun ballarının müqayisəli qrafiki')}
    <div class="s-body"><div class="chart-box"><canvas id="deck-chart"></canvas></div>
    <div class="note-box"><h5>Əsas qiymətləndirmə qeydləri</h5><ul>${bullets(T('notes')).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div></div>${foot(3, N)}`, '', ed('notes', 'Əsas qiymətləndirmə qeydləri (hər sətir bir bənd)'));

  // 4..: Təlimçi kartları
  agg.ranked.forEach((r, idx) => {
    const sn = n + 1;
    const src = (ci) => {
      const c = CATEGORIES[ci];
      const parts = r.evals.map((e) => {
        const j = [e.justifications?.['c' + c.no], ...(c.type === 'pct' ? c.items.map((it) => e.justifications?.[it.code]) : [e.justifications?.['3']])].filter(Boolean);
        return j.length ? `<div><b>${esc(e.evaluator_position || e.evaluator_name)}:</b> ${esc(j.join('; '))}</div>` : '';
      }).join('');
      return parts ? `<div class="edit-src" style="margin:-6px 0 14px">${parts}</div>` : '';
    };
    wrap(`${head(`Təlimçi #${idx + 1}: ${r.trainer.full_name.toLocaleUpperCase('az')} — ${r.trainer.position}`)}
      <div class="s-body"><div class="score-card"><div class="l">YEKUN BAL</div><div class="big">${r.rounded}</div>
        <div class="sub">Qiymətləndiricilərin Balları:</div><ul><li>Ortalama Bal: ${fmt(r.final)}</li>${agg.cols.filter((c) => r.byKey[c.key]).map((c) => `<li>${esc(c.label)}: ${fmt(r.byKey[c.key].total)}</li>`).join('')}</ul></div>
      <div class="kpi-side"><table class="st"><thead><tr><th style="text-align:center;width:6%">№</th><th style="width:34%">KPI İstiqaməti (Maks. Bal)</th><th style="text-align:center;width:10%">Bal</th><th>Əsaslandırma və Qeydlər</th></tr></thead>
      <tbody>${CATEGORIES.map((c, i) => `<tr><td class="n">${c.no}</td><td>${esc(c.title)} (${c.max})</td><td class="b">${fmt(r.cats[i])}</td><td>${esc(T(`tj:${r.trainer.id}:${i + 1}`))}</td></tr>`).join('')}</tbody></table></div></div>${foot(sn, N)}`,
    '', `<div class="eyebrow" style="margin-bottom:10px">${esc(r.trainer.full_name)} — əsaslandırma mətnləri</div>` + CATEGORIES.map((c, i) => ed(`tj:${r.trainer.id}:${i + 1}`, `${c.no}. ${c.title}`, src(i))).join(''));
  });

  // Son: tövsiyələr
  wrap(`${head(T('rec_title'))}<div class="s-body"><ul class="recs">${bullets(T('recs')).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>${foot(N, N)}`, '', ed('rec_title', 'Slaydın başlığı') + ed('recs', 'Nəticələr və tövsiyələr (hər sətir bir bənd)'));
  return out.join('');
}

let chartRef = null;
function drawChart(M) {
  const el = document.getElementById('deck-chart');
  if (!el) return;
  chartRef?.destroy();
  const r = M.agg.ranked;
  const ds = [{ label: 'Yekun bal', data: r.map((x) => x.final), backgroundColor: '#1E3A8A', borderRadius: 3 }];
  if (M.prev) ds.push({ label: `Əvvəlki rüb (${QUARTER_LABELS[M.prev.q.quarter]})`, data: r.map((x) => M.prev.rows.find((p) => p.trainer.id === x.trainer.id)?.final ?? null), backgroundColor: '#0D9488', borderRadius: 3 });
  chartRef = new Chart(el, {
    type: 'bar',
    data: { labels: r.map((x) => shortName(x.trainer.full_name)), datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, font: { size: 11 } } }, title: { display: true, text: 'Təlimçilərin yekun ballarının müqayisəli qrafiki', font: { size: 12, weight: 'bold' }, color: '#0F172A' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.raw)}` } } },
      scales: { y: { min: 0, max: 100, title: { display: true, text: 'Bal (0–100)', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { color: '#EEF2F6' } }, x: { ticks: { font: { size: 10, weight: 'bold' } }, grid: { display: false } } },
    },
    plugins: [{ id: 'vals', afterDatasetsDraw(ch) { const { ctx } = ch; ctx.save(); ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ch.data.datasets.forEach((d, di) => ch.getDatasetMeta(di).data.forEach((b, i) => { const v = d.data[i]; if (v == null) return; ctx.fillStyle = di ? '#0D9488' : '#1E3A8A'; ctx.fillText(di ? fmt(v, 1) : Math.round(v), b.x, b.y - 4); })); ctx.restore(); } }],
  });
}

/* ---------------- PowerPoint ---------------- */
async function exportPptx(M) {
  if (!window.PptxGenJS) { toast('PowerPoint modulu yüklənməyib, bir az sonra yenidən cəhd edin', 'err'); return; }
  const { agg, T, q } = M; const N = M.total;
  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'DOST Evi KPI'; pptx.title = `Təlimçilərin ${quarterLabel(q)} qiymətləndirmə nəticələri`;
  const F = 'DejaVu Sans';
  const footer = (s, n, dark) => s.addText(`${FOOT} | Səhifə ${n} / ${N}`, { x: 0.8, y: 7.0, w: 11.7, h: 0.2, fontSize: 8, color: C.muted, fontFace: F, margin: 0 });
  const header = (s, title) => {
    s.background = { color: C.bg };
    s.addText([{ text: 'YEKUN NƏTİCƏLƏR', options: { fontSize: 10, bold: true, color: C.teal, breakLine: true } }, { text: title, options: { fontSize: 20, bold: true, color: C.navy } }], { x: 0.8, y: 0.45, w: 11.7, h: 0.8, fontFace: F, margin: 0, valign: 'top' });
    s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.4, w: 11.73, h: 0.03, fill: { color: C.teal }, line: { color: C.teal, width: 0 } });
  };
  const th = (t, o = {}) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10, align: 'center', valign: 'middle', ...o } });

  // 1
  let s = pptx.addSlide(); s.background = { color: C.navy };
  s.addShape(pptx.ShapeType.roundRect, { x: 1.0, y: 1.16, w: 11.33, h: 5.12, fill: { color: C.slate }, line: { color: C.teal, width: 1.25 }, rectRadius: 0.5 });
  s.addText([
    { text: `YEKUN NƏTİCƏLƏR · ${quarterLabel(q).toLocaleUpperCase('az')}`, options: { fontSize: 11, bold: true, color: C.teal2, align: 'center', breakLine: true } },
    { text: ' ', options: { fontSize: 8, breakLine: true } },
    { text: `${ORG.branch} filialının ${ORG.dept} üzrə`, options: { fontSize: 24, bold: true, color: C.white, align: 'center', breakLine: true } },
    { text: 'Təlimçilərin performans və KPI qiymətləndirilməsi hesabatı', options: { fontSize: 24, bold: true, color: C.white, align: 'center', breakLine: true } },
    { text: ' ', options: { fontSize: 10, breakLine: true } },
    { text: T('cover_desc'), options: { fontSize: 13, color: C.muted2, align: 'left', breakLine: true } },
    { text: ' ', options: { fontSize: 12, breakLine: true } },
    { text: T('cover_src'), options: { fontSize: 10, color: C.light, bullet: true, align: 'left', breakLine: true } },
    { text: 'Əhatə olunan qiymətləndirmə istiqamətləri: 5 Əsas KPI Bəndi (Maksimum 100 Bal)', options: { fontSize: 10, color: C.light, bullet: true, align: 'left' } },
  ], { x: 1.6, y: 1.5, w: 10.1, h: 4.5, fontFace: F, valign: 'middle' });
  footer(s, 1);

  // 2
  s = pptx.addSlide(); header(s, 'Ümumi reytinq və qiymətləndiricilər üzrə müqayisəli cədvəl');
  const rows2 = [[th('№'), th('Təlimçinin Soyadı, Adı', { align: 'left' }), th('Yekun Bal'), ...agg.cols.map((c) => th(`${c.label} Balı`))]];
  agg.ranked.forEach((r, i) => {
    const fill = { color: i % 2 ? C.row : C.white };
    rows2.push([{ text: String(r.rank), options: { align: 'center', fill } }, { text: r.trainer.full_name, options: { fill } }, { text: String(r.rounded), options: { align: 'center', bold: true, color: C.blue, fill } },
      ...agg.cols.map((c) => ({ text: r.byKey[c.key] ? fmt(r.byKey[c.key].total) : '—', options: { align: 'center', fill } }))]);
  });
  const w2 = 9.83; const fixed = [0.5, 3.3, 1.3]; const rest = (w2 - fixed.reduce((a, b) => a + b)) / Math.max(1, agg.cols.length);
  s.addTable(rows2, { x: 1.75, y: 1.6, w: w2, colW: [...fixed, ...agg.cols.map(() => rest)], fontFace: F, fontSize: 10, color: C.navy, valign: 'middle', rowH: Math.min(0.55, 5.0 / (agg.ranked.length + 1)), border: { type: 'none' } });
  footer(s, 2);

  // 3
  s = pptx.addSlide(); header(s, 'Təlimçilərin yekun ballarının müqayisəli qrafiki');
  const labels = agg.ranked.map((x) => shortName(x.trainer.full_name));
  const data = [{ name: 'Yekun bal', labels, values: agg.ranked.map((x) => r2(x.final)) }];
  if (M.prev) data.push({ name: `Əvvəlki rüb (${QUARTER_LABELS[M.prev.q.quarter]})`, labels, values: agg.ranked.map((x) => r2(M.prev.rows.find((p) => p.trainer.id === x.trainer.id)?.final ?? 0)) });
  s.addChart(pptx.ChartType.bar, data, {
    x: 0.7, y: 1.8, w: 8.0, h: 4.6, barDir: 'col', barGapWidthPct: 60, chartColors: M.prev ? [C.blue, C.teal] : [C.blue],
    showValue: true, dataLabelFormatCode: '0', dataLabelFontSize: 8, dataLabelPosition: 'outEnd', dataLabelColor: C.navy,
    valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 10, valAxisLabelFontSize: 9, catAxisLabelFontSize: 8, catAxisLabelFontBold: true,
    showLegend: true, legendPos: 't', legendFontSize: 9, showTitle: true, title: 'Təlimçilərin Yekun Ballarının Müqayisəli Qrafiki', titleFontSize: 11, titleColor: C.navy,
    valAxisTitle: 'Bal (0 - 100)', showValAxisTitle: true, valAxisTitleFontSize: 9, valGridLine: { color: 'E5E7EB', size: 0.5 }, fontFace: F,
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.97, y: 2.2, w: 3.53, h: 3.9, fill: { color: C.white }, line: { color: C.line, width: 1 }, rectRadius: 0.35, shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: '000000', opacity: 0.15 } });
  s.addText([{ text: 'Əsas qiymətləndirmə qeydləri', options: { bold: true, fontSize: 13, align: 'center', breakLine: true } }, { text: ' ', options: { fontSize: 6, breakLine: true } },
    ...bullets(T('notes')).map((b, i, arr) => ({ text: b, options: { bullet: true, fontSize: 9.5, breakLine: i < arr.length - 1, paraSpaceAfter: 6 } }))],
  { x: 9.15, y: 2.35, w: 3.2, h: 3.6, fontFace: F, color: C.navy, valign: 'top' });
  footer(s, 3);

  // təlimçilər
  agg.ranked.forEach((r, idx) => {
    s = pptx.addSlide(); header(s, `Təlimçi #${idx + 1}: ${r.trainer.full_name.toLocaleUpperCase('az')} — ${r.trainer.position}`);
    s.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.6, w: 3.2, h: 5.0, fill: { color: C.white }, line: { color: C.line, width: 1 }, rectRadius: 0.35, shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: '000000', opacity: 0.15 } });
    s.addText([{ text: 'YEKUN BAL', options: { fontSize: 11, color: C.muted, breakLine: true } }, { text: String(r.rounded), options: { fontSize: 48, bold: true, color: C.blue, breakLine: true } },
      { text: ' ', options: { fontSize: 6, breakLine: true } }, { text: 'Qiymətləndiricilərin Balları:', options: { fontSize: 10.5, bold: true, color: C.navy, breakLine: true } },
      { text: `Ortalama Bal: ${fmt(r.final)}`, options: { fontSize: 10, bullet: true, color: C.navy, breakLine: true } },
      ...agg.cols.filter((c) => r.byKey[c.key]).map((c, i, arr) => ({ text: `${c.label}: ${fmt(r.byKey[c.key].total)}`, options: { fontSize: 10, bullet: true, color: C.navy, breakLine: i < arr.length - 1 } }))],
    { x: 1.0, y: 1.8, w: 2.85, h: 4.6, fontFace: F, valign: 'middle' });
    const rows = [[th('№'), th('KPI İstiqaməti (Maks. Bal)'), th('Bal'), th('Əsaslandırma və Qeydlər')]];
    CATEGORIES.forEach((c, i) => { const fill = { color: i % 2 ? C.row : C.white }; rows.push([{ text: String(c.no), options: { align: 'center', fill } }, { text: `${c.title} (${c.max})`, options: { fill } }, { text: fmt(r.cats[i]), options: { align: 'center', bold: true, color: C.blue, fill } }, { text: T(`tj:${r.trainer.id}:${i + 1}`), options: { fill } }]); });
    s.addTable(rows, { x: 4.2, y: 1.6, w: 8.33, colW: [0.45, 3.0, 0.85, 4.03], rowH: [0.5, 0.9, 0.9, 0.9, 0.9, 0.9], fontFace: F, fontSize: 9.5, color: C.navy, valign: 'middle', border: { type: 'none' } });
    footer(s, idx + 4);
  });

  // son
  s = pptx.addSlide(); header(s, T('rec_title'));
  const rb = bullets(T('recs'));
  s.addText(rb.map((b, i) => ({ text: b, options: { bullet: true, breakLine: i < rb.length - 1, paraSpaceAfter: 10 } })), { x: 0.9, y: 1.75, w: 11.5, h: 5.0, fontFace: F, fontSize: 13, color: C.navy, valign: 'top' });
  footer(s, N);

  await pptx.writeFile({ fileName: `${ORG.branch}-Təlimçilərin ${QUARTER_LABELS[q.quarter]} qiymətləndirmə nəticələri (${q.year}).pptx` });
}

/* ---------------- Səhifə ---------------- */
export async function adminReport(ctx) {
  const { view, params } = ctx;
  view.innerHTML = '<div class="muted">Yüklənir…</div>';
  const { quarters, q } = await pickQuarter(ctx);
  if (!q) { view.innerHTML = '<div class="card empty">Rüb yoxdur.</div>'; return; }
  const editing = params.get('edit') === '1';
  const M = await buildModel(q, await fetchQuarters());
  if (!ctx.isCurrent()) return;
  if (!M.agg.ranked.length) {
    view.innerHTML = `<div class="page-h"><div><div class="eyebrow">Təqdimat</div><h1>${esc(quarterLabel(q))}</h1></div><div class="tools">${quarterSelect(quarters, q, '#/teqdimat')}</div><div class="rule"></div></div><div class="card empty">Bu rüb üçün hələ qiymətləndirmə nəticəsi yoxdur.</div>`;
    return;
  }
  view.innerHTML = `<div class="page-h"><div><div class="eyebrow">Rəhbərlik üçün təqdimat</div><h1>${esc(quarterLabel(q))} qiymətləndirmə nəticələri</h1></div>
    <div class="tools">${quarterSelect(quarters, q, '#/teqdimat')}
      <a class="btn ghost" href="#/teqdimat?q=${q.id}${editing ? '' : '&edit=1'}">${editing ? 'Baxış rejimi' : 'Mətnləri redaktə et'}</a>
      <button class="btn teal" id="dl">PowerPoint endir</button></div><div class="rule"></div></div>
    ${q.status === 'open' ? '<div class="card pad" style="margin-bottom:16px;border-color:#FEDF89;background:#FFFCF5">Bu rüb hələ açıqdır — nəticələr qiymətləndirmə davam etdikcə dəyişə bilər.</div>' : ''}
    ${editing ? '<p class="muted" style="margin-top:-6px">Mətnlər ballara əsasən avtomatik hazırlanır. Dəyişdirib yadda saxladığınız mətn təqdimatda və PowerPoint faylında istifadə olunur. Boz fonda qiymətləndiricilərin yazdığı əsaslandırmalar göstərilir.</p>' : ''}
    <div class="deck">${slidesHtml(M, editing)}</div>`;
  drawChart(M);
  view.querySelector('#dl').onclick = async (e) => { e.target.disabled = true; e.target.textContent = 'Hazırlanır…'; try { await exportPptx(M); } catch (err) { console.error(err); toast(errMsg(err), 'err'); } e.target.disabled = false; e.target.textContent = 'PowerPoint endir'; };
  view.querySelectorAll('[data-save]').forEach((b) => (b.onclick = async () => {
    const key = b.dataset.save; const val = view.querySelector(`textarea[data-key="${CSS.escape(key)}"]`).value.trim();
    try { await saveReportText(q.id, key, val); toast('Mətn yadda saxlanıldı', 'ok'); const y = scrollY; await adminReport(ctx); scrollTo(0, y); } catch (err) { toast(errMsg(err), 'err'); }
  }));
  view.querySelectorAll('[data-reset]').forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from('report_texts').delete().eq('quarter_id', q.id).eq('key', b.dataset.reset);
    if (error) return toast(errMsg(error), 'err');
    toast('Avtomatik mətn bərpa olundu', 'ok'); const y = scrollY; await adminReport(ctx); scrollTo(0, y);
  }));
}
