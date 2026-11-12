import { sb, esc, toast, errMsg, fetchTrainers, fetchEvaluations, quarterLabel, avg, normEval } from '../core.js';
import { fmt, CATEGORIES, completeness, r2 } from '../kpi.js';
import { renderForm, summaryHtml } from '../form.js';
import { openQuarterPicker, quarterChips, noOpenQuarter } from './specialist.js';


export async function directorHome(ctx) {
  const { view, state } = ctx;
  view.innerHTML = '<div class="muted">Yüklənir…</div>';
  const { open, q } = await openQuarterPicker(ctx);
  if (!q) { view.innerHTML = noOpenQuarter; return; }
  const [trainers, evals] = await Promise.all([fetchTrainers(), fetchEvaluations({ quarter_id: q.id })]);
  if (!ctx.isCurrent()) return;
  const mineDone = evals.filter((e) => e.evaluator_role === 'director').length;
  view.innerHTML = `<div class="page-h"><div><div class="eyebrow">${esc(quarterLabel(q))} · moderator paneli</div><h1>Təlimçilərin qiymətləndirilməsi</h1></div>
    <div class="tools">${quarterChips(open, q, '#/dir')}<span class="badge ${mineDone === trainers.length ? 'ok' : 'warn'}">Sizin blanklar: ${mineDone} / ${trainers.length}</span></div><div class="rule"></div></div>
    <div class="trainer-grid">${trainers.map((t) => {
      const ev = evals.filter((e) => e.trainer_id === t.id);
      const mine = ev.find((e) => e.evaluator_role === 'director');
      const a = ev.length ? avg(ev.map((e) => e.total)) : null;
      return `<a class="card tcard" href="#/dir/${t.id}?q=${q.id}" style="text-decoration:none;color:inherit">
        <div><div class="nm">${esc(t.full_name)}</div><div class="small muted">${esc(t.position)}</div></div>
        <div class="row"><div class="small muted">Ortalama bal<br><b style="color:var(--navy)">${ev.length} qiymətləndirmə</b></div><span class="score">${a === null ? '—' : fmt(a)}</span></div>
        <div class="bar"><i style="width:${a || 0}%"></i></div>
        <div class="row">${mine ? `<span class="badge ok">Sizin bal: ${fmt(mine.total)}</span>` : '<span class="badge warn">Sizin qiymətləndirmə gözləyir</span>'}</div></a>`;
    }).join('')}</div>`;
}

export async function directorForm(ctx, trainerId) {
  const { view, state } = ctx;
  view.innerHTML = '<div class="muted">Yüklənir…</div>';
  const { q } = await openQuarterPicker(ctx);
  if (!q) { view.innerHTML = noOpenQuarter; return; }
  const trainers = await fetchTrainers();
  const t = trainers.find((x) => x.id === trainerId);
  if (!t) { view.innerHTML = '<div class="card empty">Təlimçi tapılmadı</div>'; return; }
  let evals = await fetchEvaluations({ quarter_id: q.id, trainer_id: t.id });
  if (!ctx.isCurrent()) return;
  let mine = evals.find((e) => e.evaluator_role === 'director' && !e.is_summary) || null;
  const idx = trainers.indexOf(t); const next = trainers[idx + 1];

  view.innerHTML = `<div class="page-h"><div><a href="#/dir?q=${q.id}" class="small">← Təlimçilər</a><div class="eyebrow" style="margin-top:6px">${esc(quarterLabel(q))} · Təlimçinin KPI qiymətləndirmə forması</div><h1>${esc(t.full_name)}</h1></div><div class="rule"></div></div>
    <div class="form-layout"><div><div id="f"></div>
      <div class="card pad" style="margin-top:18px"><h3>Digər qiymətləndiricilərin blankları</h3><div class="muted small" style="margin-bottom:12px">Yalnız baxış üçündür · yeni blank daxil olduqda avtomatik yenilənir</div><div id="others"></div></div></div>
    <aside class="sticky"><div class="card summary"><div id="sum"></div>
      <div class="live"><div class="eyebrow">Təlimçinin ortalama balı</div><div class="avg" id="avg">—</div><div class="small muted" id="avgnote"></div><div class="ev-list" id="evl"></div></div></div>
      <button class="btn teal block" id="save" style="margin-top:12px">${mine ? 'Dəyişiklikləri saxla' : 'Yadda saxla'}</button>
      ${next ? `<a class="btn ghost block" style="margin-top:8px" href="#/dir/${next.id}?q=${q.id}">Növbəti təlimçi →</a>` : ''}
    </aside></div>`;

  let draft = mine ? { total: mine.total, cats: mine.cat_scores } : null;
  const others = () => evals.filter((e) => !(e.evaluator_role === 'director' && !e.is_summary));

  const renderLive = () => {
    const list = others().map((e) => ({ label: `${e.evaluator_position || 'Mütəxəssis'} · ${e.evaluator_name}`, total: e.total }));
    const myDone = draft && draft.complete !== false;
    if (draft) list.unshift({ label: `Siz (${state.profile.display_position || 'Direktor'})`, total: draft.total, me: true, partial: draft.complete === false });
    const vals = list.filter((x) => !x.partial).map((x) => x.total);
    const a = vals.length ? avg(vals) : null;
    view.querySelector('#avg').textContent = a === null ? '—' : fmt(a);
    view.querySelector('#avgnote').textContent = vals.length ? `${vals.length} qiymətləndiricinin bərabər çəkili ortalaması${myDone ? '' : ' (sizin natamam blankınız daxil deyil)'}` : 'Hələ qiymətləndirmə yoxdur';
    view.querySelector('#evl').innerHTML = list.map((x) => `<div class="row ${x.me ? 'me' : ''}"><span>${esc(x.label)}${x.partial ? ' <span class="badge warn">natamam</span>' : ''}</span><b class="tnum">${fmt(x.total)}</b></div>`).join('');
  };

  const renderOthers = () => {
    const o = others();
    view.querySelector('#others').innerHTML = o.length ? o.map((e) => `<details class="other"><summary><div><b>${esc(e.evaluator_name)}</b><div class="small muted">${esc(e.evaluator_position || '')} · ${esc(e.eval_date || '')}</div></div><span class="t">${fmt(e.total)}</span></summary>
      <div class="body">${e.is_summary ? '<div class="muted" style="padding-top:6px">Köhnə blankdan yalnız yekun bal idxal edilib.</div>' : CATEGORIES.map((c, i) => {
        const js = [e.justifications?.['c' + c.no], ...(c.type === 'pct' ? c.items.map((it) => e.justifications?.[it.code] && `${it.title}: ${e.justifications[it.code]}`) : [e.justifications?.['3']])].filter(Boolean);
        return `<div class="catline"><div>${c.no}. ${esc(c.title)} <span class="muted">(${c.max})</span>${js.length ? `<div class="just">${js.map(esc).join('<br>')}</div>` : ''}</div><b class="tnum" style="text-align:right">${fmt(e.cat_scores[i])}</b></div>`;
      }).join('')}</div></details>`).join('') : '<div class="muted">Digər qiymətləndiricilər bu təlimçini hələ qiymətləndirməyib.</div>';
  };

  const form = renderForm(view.querySelector('#f'), {
    evaluation: mine, editable: true,
    header: { period: quarterLabel(q), date: mine?.eval_date, evaluator: state.profile.display_name, evaluatorPos: state.profile.display_position || 'Direktor', trainer: t.full_name, trainerPos: t.position },
    onChange: ({ scores, complete, inputs }) => {
      view.querySelector('#sum').innerHTML = summaryHtml(scores, complete);
      const touched = Object.keys(inputs).length > 0;
      draft = touched ? { total: scores.total, cats: scores.cats, complete: complete.done } : null;
      renderLive();
    },
  });
  renderOthers(); renderLive();

  // Realtime: digər qiymətləndiricilərin blankları daxil olduqca yenilə
  const ch = sb.channel('ev-' + t.id + '-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluations', filter: `trainer_id=eq.${t.id}` }, async () => {
      evals = (await fetchEvaluations({ quarter_id: q.id, trainer_id: t.id }));
      renderOthers(); renderLive();
    }).subscribe();
  const off = () => { sb.removeChannel(ch); window.removeEventListener('hashchange', off); };
  window.addEventListener('hashchange', off);

  view.querySelector('#save').onclick = async (ev) => {
    const c = form.complete();
    if (!c.done) { const el = form.firstMissing(); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus?.(); toast(`Bütün göstəricilər doldurulmalıdır (${c.filled}/${c.all})`, 'err'); return; }
    ev.target.disabled = true;
    const payload = { eval_date: form.date, inputs: form.inputs, justifications: form.justifications };
    try {
      let res;
      if (mine) res = await sb.from('evaluations').update(payload).eq('id', mine.id).select().single();
      else res = await sb.from('evaluations').insert({ ...payload, quarter_id: q.id, trainer_id: t.id, evaluator_role: 'director', evaluator_name: state.profile.display_name, evaluator_position: state.profile.display_position || 'Direktor', evaluator_key: '-' }).select().single();
      if (res.error) throw res.error;
      mine = normEval(res.data);
      evals = evals.filter((e) => e.id !== mine.id).concat(mine);
      draft = { total: mine.total, cats: mine.cat_scores, complete: true };
      renderLive();
      ev.target.textContent = 'Dəyişiklikləri saxla';
      toast(`Yadda saxlanıldı · Sizin bal ${fmt(mine.total)} · Ortalama ${fmt(r2(avg(evals.map((e) => e.total))))}`, 'ok');
    } catch (e) { toast(errMsg(e), 'err'); }
    ev.target.disabled = false;
  };
  void completeness;
}
