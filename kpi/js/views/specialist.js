import { sb, esc, toast, errMsg, fetchTrainers, fetchQuarters, quarterLabel, normEval, confirmBox } from '../core.js';
import { fmt, completeness } from '../kpi.js';
import { renderForm, summaryHtml } from '../form.js';

export async function openQuarterPicker(ctx) {
  const qs = (await fetchQuarters()).filter((q) => q.status === 'open');
  const wanted = ctx.params.get('q');
  const q = qs.find((x) => x.id === wanted) || qs[0] || null;
  return { open: qs, q };
}

export const quarterChips = (open, q, base) => open.length > 1
  ? `<div class="chips">${open.map((x) => `<a class="chip ${x.id === q.id ? 'on' : ''}" href="${base}?q=${x.id}" style="text-decoration:none">${esc(quarterLabel(x))}</a>`).join('')}</div>` : '';

export const noOpenQuarter = `<div class="card empty"><h3 style="color:var(--navy)">Hazırda açıq qiymətləndirmə dövrü yoxdur</h3><div>Rüb admin tərəfindən açıldıqdan sonra qiymətləndirmə aparmaq mümkün olacaq.</div></div>`;

async function myEvals(name) {
  const { data, error } = await sb.rpc('sp_my_evaluations', { p_name: name });
  if (error) throw error;
  return data.map(normEval);
}

export async function specialistHome(ctx) {
  const { view, state } = ctx;
  view.innerHTML = '<div class="muted">Yüklənir…</div>';
  const [{ open, q }, trainers, mine] = await Promise.all([openQuarterPicker(ctx), fetchTrainers(), myEvals(state.sp.name)]);
  if (!ctx.isCurrent()) return;
  if (!q) { view.innerHTML = noOpenQuarter; return; }
  const mineQ = mine.filter((e) => e.quarter_id === q.id);
  const done = mineQ.filter((e) => completeness(e.inputs).done).length;
  view.innerHTML = `<div class="page-h"><div><div class="eyebrow">${esc(quarterLabel(q))} · qiymətləndirmə</div><h1>Təlimçilər</h1></div>
    <div class="tools">${quarterChips(open, q, '#/sp')}<span class="badge ${done === trainers.length ? 'ok' : 'warn'}">${done} / ${trainers.length} tamamlanıb</span></div><div class="rule"></div></div>
    <p class="muted" style="margin-top:-8px">Hər təlimçini ayrıca qiymətləndirin. Rüb bağlanana qədər öz blanklarınıza düzəliş edə bilərsiniz.</p>
    <div class="trainer-grid">${trainers.map((t) => {
      const e = mineQ.find((x) => x.trainer_id === t.id);
      const st = e ? (completeness(e.inputs).done ? '<span class="badge ok">Qiymətləndirilib</span>' : '<span class="badge warn">Natamam</span>') : '<span class="badge">Gözləyir</span>';
      return `<a class="card tcard" href="#/sp/${t.id}?q=${q.id}" style="text-decoration:none;color:inherit">
        <div><div class="nm">${esc(t.full_name)}</div><div class="small muted">${esc(t.position)}</div></div>
        <div class="row">${st}${e ? `<span class="score">${fmt(e.total)}</span>` : '<span class="muted small">Başla →</span>'}</div></a>`;
    }).join('')}</div>`;
}

export async function specialistForm(ctx, trainerId) {
  const { view, state } = ctx;
  view.innerHTML = '<div class="muted">Yüklənir…</div>';
  const [{ q }, trainers, mine] = await Promise.all([openQuarterPicker(ctx), fetchTrainers(), myEvals(state.sp.name)]);
  if (!ctx.isCurrent()) return;
  if (!q) { view.innerHTML = noOpenQuarter; return; }
  const t = trainers.find((x) => x.id === trainerId);
  if (!t) { view.innerHTML = '<div class="card empty">Təlimçi tapılmadı</div>'; return; }
  const existing = mine.find((e) => e.quarter_id === q.id && e.trainer_id === t.id) || null;
  const idx = trainers.indexOf(t);
  const next = trainers[idx + 1];

  view.innerHTML = `<div class="page-h"><div><a href="#/sp?q=${q.id}" class="small">← Təlimçilər</a><div class="eyebrow" style="margin-top:6px">${esc(quarterLabel(q))} · Təlimçinin KPI qiymətləndirmə forması</div><h1>${esc(t.full_name)}</h1></div><div class="rule"></div></div>
    <div class="form-layout"><div id="f"></div>
    <aside class="sticky"><div class="card summary" id="sum"></div>
      <div style="display:flex;gap:10px;margin-top:12px"><button class="btn teal block" id="save">Yadda saxla</button></div>
      ${next ? `<a class="btn ghost block" style="margin-top:8px" href="#/sp/${next.id}?q=${q.id}">Növbəti təlimçi →</a>` : ''}
    </aside></div>`;

  let dirty = false;
  const form = renderForm(view.querySelector('#f'), {
    evaluation: existing, editable: true,
    header: { period: quarterLabel(q), date: existing?.eval_date, evaluator: state.sp.name, evaluatorPos: state.sp.position, trainer: t.full_name, trainerPos: t.position },
    onChange: ({ scores, complete }) => { view.querySelector('#sum').innerHTML = summaryHtml(scores, complete); },
  });
  view.querySelector('#f').addEventListener('input', () => { dirty = true; });
  const leaveGuard = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', leaveGuard);
  const offHash = () => { window.removeEventListener('beforeunload', leaveGuard); window.removeEventListener('hashchange', offHash); };
  window.addEventListener('hashchange', offHash);

  view.querySelector('#save').onclick = async (ev) => {
    const c = form.complete();
    if (!c.done) {
      const el = form.firstMissing(); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus?.();
      toast(`Bütün göstəricilər doldurulmalıdır (${c.filled}/${c.all})`, 'err'); return;
    }
    ev.target.disabled = true;
    try {
      const { data, error } = await sb.rpc('sp_save_evaluation', {
        p_quarter: q.id, p_trainer: t.id, p_name: state.sp.name, p_position: state.sp.position,
        p_date: form.date, p_inputs: form.inputs, p_just: form.justifications,
      });
      if (error) throw error;
      dirty = false;
      toast(`Yadda saxlanıldı · Cəmi ${fmt(data.total)} bal`, 'ok');
      if (next && await confirmBox('Qiymətləndirmə yadda saxlanıldı. Növbəti təlimçiyə keçək?', 'Növbəti')) location.hash = `#/sp/${next.id}?q=${q.id}`;
      else if (!next) location.hash = `#/sp?q=${q.id}`;
    } catch (e) { toast(errMsg(e), 'err'); }
    ev.target.disabled = false;
  };
}
