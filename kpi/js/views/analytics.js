// Təhlil — illik və rüblər üzrə ümumi mənzərə
import { esc, fetchTrainers, fetchQuarters, fetchEvaluations, aggregate, avg, shortName, twoNames } from '../core.js';
import { CATEGORIES, QUARTER_LABELS, fmt, r2, performanceBand } from '../kpi.js';

const CAT = ['#2563EB', '#0D9488', '#D97706', '#7C3AED', '#DB2777']; // validated categorical order
const INK = '#0F172A', MUTED = '#64748B', GRID = '#EEF2F6';
const charts = [];
Chart.defaults.font.family = '"Segoe UI","Inter",system-ui,sans-serif';
Chart.defaults.color = MUTED;

function heat(v) { // sequential single hue (teal), light → dark
  if (v == null) return 'background:#F8FAFC;color:#94A3B8';
  const t = Math.max(0, Math.min(1, (v - 40) / 50));
  const l = 95 - t * 62;
  return `background:hsl(174 60% ${l}%);color:${l < 55 ? '#fff' : INK}`;
}

export async function adminAnalytics(ctx) {
  const { view, params } = ctx;
  view.innerHTML = '<div class="muted">Yüklənir…</div>';
  charts.splice(0).forEach((c) => c.destroy());
  const [trainers, quarters] = await Promise.all([fetchTrainers(true), fetchQuarters()]);
  const evals = await fetchEvaluations({ quarter_ids: quarters.map((q) => q.id) });
  if (!ctx.isCurrent()) return;

  const years = [...new Set(quarters.map((q) => q.year))].sort((a, b) => b - a);
  const year = Number(params.get('y')) || years[0];
  const qsAll = [...quarters].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const aggBy = new Map(qsAll.map((q) => {
    const ev = evals.filter((e) => e.quarter_id === q.id);
    return [q.id, aggregate(trainers.filter((t) => ev.some((e) => e.trainer_id === t.id)), ev)];
  }));
  const withData = qsAll.filter((q) => aggBy.get(q.id).ranked.length);
  const yq = withData.filter((q) => q.year === year);
  const scope = params.get('s') || 'year';
  const scopeQ = yq.find((q) => q.id === scope) || null;

  // İllik nəticə: təlimçi üzrə rüb yekunlarının ortalaması
  const annual = trainers.map((t) => {
    const per = yq.map((q) => aggBy.get(q.id).rows.find((r) => r.trainer.id === t.id)?.final ?? null);
    const vals = per.filter((v) => v != null);
    const catsPer = yq.map((q) => aggBy.get(q.id).rows.find((r) => r.trainer.id === t.id)).filter((r) => r && r.final != null);
    return { t, per, final: vals.length ? r2(avg(vals)) : null, cats: CATEGORIES.map((_, i) => catsPer.length ? r2(avg(catsPer.map((r) => r.cats[i]))) : null), first: vals[0], last: vals[vals.length - 1], n: vals.length };
  }).filter((a) => a.final != null).sort((a, b) => b.final - a.final);

  const qAvgs = withData.map((q) => avg(aggBy.get(q.id).ranked.map((r) => r.final)));
  const yAvgs = yq.map((q) => avg(aggBy.get(q.id).ranked.map((r) => r.final)));
  const yearAvg = yAvgs.length ? avg(yAvgs) : null;
  const improved = annual.filter((a) => a.n > 1).map((a) => ({ ...a, d: a.last - a.first })).sort((a, b) => b.d - a.d)[0];
  const yEvals = evals.filter((e) => yq.some((q) => q.id === e.quarter_id));
  const lastQ = yq[yq.length - 1]; const prevQ = yq[yq.length - 2];
  const lastAvg = lastQ ? avg(aggBy.get(lastQ.id).ranked.map((r) => r.final)) : null;
  const prevAvg = prevQ ? avg(aggBy.get(prevQ.id).ranked.map((r) => r.final)) : null;

  // seçilmiş hissə (illik və ya rüb)
  const scopeRows = scopeQ ? aggBy.get(scopeQ.id).ranked.map((r) => ({ t: r.trainer, final: r.final, cats: r.cats })) : annual.map((a) => ({ t: a.t, final: a.final, cats: a.cats }));
  const scopeEvals = scopeQ ? evals.filter((e) => e.quarter_id === scopeQ.id) : yEvals;
  const scopeLbl = scopeQ ? `${year} · ${QUARTER_LABELS[scopeQ.quarter]}` : `${year} · illik`;

  const link = (y, s) => `#/tehlil?y=${y}&s=${s}`;
  view.innerHTML = `<div class="page-h"><div><div class="eyebrow">Təhlil paneli</div><h1>Ümumi mənzərə · ${year}</h1></div>
    <div class="tools"><select class="inp" style="width:auto" onchange="location.hash='#/tehlil?y='+this.value">${years.map((y) => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></div><div class="rule"></div></div>
    ${!yq.length ? '<div class="card empty">Bu il üçün qiymətləndirmə nəticəsi yoxdur.</div>' : `
    <div class="grid g4" style="margin-bottom:18px">
      <div class="card stat"><div class="k">İllik orta bal (filial)</div><div class="v">${fmt(yearAvg)}</div><div class="s">${yq.length} rüb üzrə</div></div>
      <div class="card stat"><div class="k">Son rüb · ${esc(QUARTER_LABELS[lastQ.quarter])}</div><div class="v">${fmt(lastAvg)}</div><div class="s">${prevAvg != null ? `<span class="${lastAvg >= prevAvg ? 'delta-up' : 'delta-down'}">${lastAvg >= prevAvg ? '▲' : '▼'} ${fmt(Math.abs(lastAvg - prevAvg))}</span> əvvəlki rübə nisbətən` : 'müqayisə üçün əvvəlki rüb yoxdur'}</div></div>
      <div class="card stat"><div class="k">İlin lider təlimçisi</div><div class="v" style="font-size:22px;margin-top:8px">${esc(twoNames(annual[0]?.t.full_name))}</div><div class="s">İllik bal ${fmt(annual[0]?.final)}</div></div>
      <div class="card stat"><div class="k">${improved ? 'Ən çox irəliləyən' : 'Doldurulmuş blanklar'}</div>${improved ? `<div class="v" style="font-size:22px;margin-top:8px">${esc(twoNames(improved.t.full_name))}</div><div class="s"><span class="${improved.d >= 0 ? 'delta-up' : 'delta-down'}">${improved.d >= 0 ? '+' : ''}${fmt(improved.d)}</span> bal (ilk → son rüb)</div>` : `<div class="v">${yEvals.length}</div><div class="s">${year} ili üzrə</div>`}</div>
    </div>

    <div class="grid g2" style="margin-bottom:18px">
      <div class="card chart-card"><h3>Filial üzrə orta bal — rüblər üzrə dinamika</h3><div class="muted small">Bütün qiymətləndirilmiş rüblər</div><div class="ch"><canvas id="c-trend"></canvas></div></div>
      <div class="card chart-card"><h3>KPI istiqamətləri üzrə icra səviyyəsi</h3><div class="muted small">Orta bal ÷ maksimum bal, ${year} rübləri üzrə</div><div class="ch"><canvas id="c-cats"></canvas></div></div>
    </div>

    <div class="card chart-card" style="margin-bottom:18px"><h3>Təlimçilər üzrə rüblük və illik nəticələr</h3><div class="muted small">İllik nəticə — qiymətləndirilmiş rüblərin yekun ballarının ortalaması</div>
      <div class="tbl-wrap" style="margin-top:12px"><table class="tbl heat"><thead><tr><th class="ctr">№</th><th>Təlimçi</th>${yq.map((q) => `<th class="ctr">${QUARTER_LABELS[q.quarter]}</th>`).join('')}<th class="ctr">İllik</th><th>Səviyyə</th><th class="ctr">Dinamika</th></tr></thead>
      <tbody>${annual.map((a, i) => { const b = performanceBand(a.final); const d = a.n > 1 ? a.last - a.first : null; return `<tr><td class="ctr">${i + 1}</td><td><b>${esc(a.t.full_name)}</b><div class="small muted">${esc(a.t.position)}</div></td>${a.per.map((v) => `<td class="h" style="${heat(v)}">${v == null ? '—' : fmt(v)}</td>`).join('')}<td class="h" style="${heat(a.final)};outline:2px solid #fff">${fmt(a.final)}</td><td><span class="badge ${b.cls}">${b.label}</span></td><td class="ctr">${d == null ? '<span class="muted">—</span>' : `<span class="${d >= 0 ? 'delta-up' : 'delta-down'}">${d >= 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}</span>`}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="legend-note">Rəng intensivliyi balın yüksəkliyini göstərir (40 → 90).</div></div>

    <div class="page-h" style="margin:26px 0 14px"><div><div class="eyebrow">Ətraflı baxış</div><h1 style="font-size:19px">${esc(scopeLbl)}</h1></div>
      <div class="tools"><div class="chips"><a class="chip ${!scopeQ ? 'on' : ''}" style="text-decoration:none" href="${link(year, 'year')}">İllik</a>${yq.map((q) => `<a class="chip ${scopeQ?.id === q.id ? 'on' : ''}" style="text-decoration:none" href="${link(year, q.id)}">${QUARTER_LABELS[q.quarter]}</a>`).join('')}</div></div></div>
    <div class="card chart-card" style="margin-bottom:18px"><h3>Təlimçilərin balının KPI istiqamətləri üzrə tərkibi</h3><div class="muted small">Hər sütun yekun balı 5 istiqamət üzrə bölür (maks. 100)</div><div class="ch tall"><canvas id="c-stack"></canvas></div></div>
    <div class="grid g2">
      <div class="card chart-card"><h3>Qiymətləndiricilərin verdiyi orta bal</h3><div class="muted small">Qiymətləndiricilər arasında yanaşma fərqini göstərir</div><div class="ch"><canvas id="c-evals"></canvas></div></div>
      <div class="card chart-card"><h3>Ən aşağı nəticəli 8 göstərici</h3><div class="muted small">Bütün blanklar üzrə orta «Nəticə» faizi</div><div class="ch"><canvas id="c-items"></canvas></div></div>
    </div>`}`;
  if (!yq.length) return;

  const baseOpts = (extra = {}) => ({ responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, color: INK } }, tooltip: { backgroundColor: INK, padding: 10, callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
    scales: { x: { grid: { display: false }, ticks: { color: MUTED } }, y: { grid: { color: GRID }, border: { display: false }, ticks: { color: MUTED } } }, ...extra });

  // 1. Trend
  charts.push(new Chart(view.querySelector('#c-trend'), {
    type: 'line',
    data: { labels: withData.map((q) => `${q.year} ${QUARTER_LABELS[q.quarter]}`), datasets: [{ label: 'Filial orta balı', data: qAvgs.map(r2), borderColor: '#0D9488', backgroundColor: '#0D9488', borderWidth: 2, pointRadius: 5, pointHoverRadius: 7, tension: 0.25 },
      { label: 'Ən yüksək', data: withData.map((q) => aggBy.get(q.id).ranked[0]?.final), borderColor: '#2563EB', backgroundColor: '#2563EB', borderWidth: 2, borderDash: [5, 4], pointRadius: 4 },
      { label: 'Ən aşağı', data: withData.map((q) => { const r = aggBy.get(q.id).ranked; return r[r.length - 1]?.final; }), borderColor: '#D97706', backgroundColor: '#D97706', borderWidth: 2, borderDash: [5, 4], pointRadius: 4 }] },
    options: baseOpts({ scales: { x: { grid: { display: false } }, y: { min: 0, max: 100, grid: { color: GRID }, border: { display: false } } } }),
  }));

  // 2. İstiqamətlər üzrə icra faizi
  charts.push(new Chart(view.querySelector('#c-cats'), {
    type: 'bar',
    data: { labels: CATEGORIES.map((c) => [`${c.no}. ${c.title.split(' ').slice(0, 2).join(' ')}`, c.title.split(' ').slice(2).join(' ')]),
      datasets: yq.map((q, i) => ({ label: QUARTER_LABELS[q.quarter], data: CATEGORIES.map((c, ci) => r2(avg(aggBy.get(q.id).ranked.map((r) => r.cats[ci])) / c.max * 100)), backgroundColor: CAT[i], borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26 })) },
    options: baseOpts({ plugins: { legend: { position: 'top', align: 'start', labels: { boxWidth: 10, usePointStyle: true, color: INK } }, tooltip: { backgroundColor: INK, callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.raw, 0)}%` } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10.5 } } }, y: { min: 0, max: 100, grid: { color: GRID }, border: { display: false }, ticks: { callback: (v) => v + '%' } } } }),
  }));

  // 3. Tərkib (stacked)
  charts.push(new Chart(view.querySelector('#c-stack'), {
    type: 'bar',
    data: { labels: scopeRows.map((r) => shortName(r.t.full_name)), datasets: CATEGORIES.map((c, i) => ({ label: `${c.no}. ${c.title} (${c.max})`, data: scopeRows.map((r) => r.cats[i]), backgroundColor: CAT[i], borderColor: '#fff', borderWidth: { top: 2 }, maxBarThickness: 54 })) },
    options: baseOpts({ plugins: { legend: { position: 'top', align: 'start', labels: { boxWidth: 10, usePointStyle: true, color: INK } }, tooltip: { backgroundColor: INK, callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.raw)}`, footer: (items) => `Cəmi: ${fmt(scopeRows[items[0].dataIndex].final)}` } } },
      scales: { x: { stacked: true, grid: { display: false }, ticks: { color: INK, font: { weight: '600' } } }, y: { stacked: true, min: 0, max: 100, grid: { color: GRID }, border: { display: false } } } }),
    plugins: [{ id: 'tot', afterDatasetsDraw(ch) { const { ctx } = ch; const meta = ch.getDatasetMeta(ch.data.datasets.length - 1); ctx.save(); ctx.font = '700 12px sans-serif'; ctx.fillStyle = INK; ctx.textAlign = 'center';
      meta.data.forEach((b, i) => ctx.fillText(fmt(scopeRows[i].final, 1), b.x, b.y - 6)); ctx.restore(); } }],
  }));

  // 4. Qiymətləndiricilər
  const byEv = new Map();
  scopeEvals.forEach((e) => { if (!byEv.has(e.evaluator_key)) byEv.set(e.evaluator_key, { name: e.evaluator_name, pos: e.evaluator_position, vals: [] }); byEv.get(e.evaluator_key).vals.push(e.total); });
  const evRows = [...byEv.values()].map((x) => ({ ...x, a: avg(x.vals) })).sort((a, b) => b.a - a.a);
  charts.push(new Chart(view.querySelector('#c-evals'), {
    type: 'bar',
    data: { labels: evRows.map((x) => [x.pos || '', x.name]), datasets: [{ label: 'Orta verilən bal', data: evRows.map((x) => r2(x.a)), backgroundColor: '#2563EB', borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 }] },
    options: baseOpts({ indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { backgroundColor: INK, callbacks: { label: (c) => ` Orta bal: ${fmt(c.raw)} (${evRows[c.dataIndex].vals.length} blank)` } } },
      scales: { x: { min: 0, max: 100, grid: { color: GRID }, border: { display: false } }, y: { grid: { display: false }, ticks: { color: INK, font: { size: 11 } } } } }),
  }));

  // 5. Zəif göstəricilər
  const items = [];
  CATEGORIES.forEach((c, ci) => { if (c.type !== 'pct') return; c.items.forEach((it) => { const v = scopeEvals.map((e) => e.inputs?.[it.code]).filter((x) => x != null && x !== '').map(Number); if (v.length) items.push({ t: it.title, ci, p: avg(v) * 100 }); }); });
  const low = items.sort((a, b) => a.p - b.p).slice(0, 8);
  charts.push(new Chart(view.querySelector('#c-items'), {
    type: 'bar',
    data: { labels: low.map((x) => x.t.length > 38 ? x.t.slice(0, 36) + '…' : x.t), datasets: [{ label: 'Orta nəticə', data: low.map((x) => r2(x.p)), backgroundColor: low.map((x) => CAT[x.ci]), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 18 }] },
    options: baseOpts({ indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { backgroundColor: INK, callbacks: { title: (i) => low[i[0].dataIndex].t, label: (c) => ` ${fmt(c.raw, 0)}% · ${CATEGORIES[low[c.dataIndex].ci].title}` } } },
      scales: { x: { min: 0, max: 100, grid: { color: GRID }, border: { display: false }, ticks: { callback: (v) => v + '%' } }, y: { grid: { display: false }, ticks: { color: INK, font: { size: 11 } } } } }),
  }));
}
