import { sb, esc, toast, errMsg, modal, confirmBox, fetchTrainers, fetchQuarters, fetchEvaluations, quarterLabel, aggregate, normEval, avg } from '../core.js';
import { fmt, CATEGORIES, completeness, performanceBand, QUARTER_LABELS } from '../kpi.js';
import { renderForm, summaryHtml } from '../form.js';

/* ---------- ümumi: rüb seçimi ---------- */
export async function pickQuarter(ctx) {
  const quarters = await fetchQuarters();
  const wanted = ctx.params.get('q');
  let q = quarters.find((x) => x.id === wanted);
  if (!q) {
    // ən son, qiymətləndirməsi olan rüb (yoxdursa ən son rüb)
    const { data } = await sb.from('evaluations').select('quarter_id').limit(1000);
    const withData = new Set((data || []).map((r) => r.quarter_id));
    q = quarters.find((x) => withData.has(x.id)) || quarters[0] || null;
  }
  return { quarters, q };
}

export function quarterSelect(quarters, q, base, extra = '') {
  return `<select class="inp" style="width:auto" onchange="location.hash='${base}?q='+this.value${extra}">
    ${quarters.map((x) => `<option value="${x.id}" ${x.id === q?.id ? 'selected' : ''}>${esc(quarterLabel(x))}${x.status === 'open' ? ' · açıq' : ''}</option>`).join('')}</select>`;
}

const bandBadge = (v) => { if (v == null) return '<span class="badge">—</span>'; const b = performanceBand(v); return `<span class="badge ${b.cls}">${b.label}</span>`; };

function downloadCsv(name, rows) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- Nəticələr ---------- */
export async function adminResults(ctx) {
  const { view } = ctx;
  view.innerHTML = '<div class="muted">Yüklənir…</div>';
  const { quarters, q } = await pickQuarter(ctx);
  if (!q) { view.innerHTML = '<div class="card empty">Hələ rüb yaradılmayıb. «Rüblər» bölməsindən əlavə edin.</div>'; return; }
  const [trainers, evals] = await Promise.all([fetchTrainers(true, q.id), fetchEvaluations({ quarter_id: q.id })]);
  if (!ctx.isCurrent()) return;
  const active = trainers.filter((t) => t.active || evals.some((e) => e.trainer_id === t.id));
  const agg = aggregate(active, evals);
  const finals = agg.ranked.map((r) => r.final);
  const qAvg = finals.length ? avg(finals) : null;
  const expected = agg.cols.length * active.length;

  view.innerHTML = `<div class="page-h"><div><div class="eyebrow">Yekun nəticələr</div><h1>${esc(quarterLabel(q))} üzrə qiymətləndirmə</h1></div>
    <div class="tools">${quarterSelect(quarters, q, '#/neticeler')}<span class="badge ${q.status === 'open' ? 'open' : ''}">${q.status === 'open' ? 'Rüb açıqdır' : 'Rüb bağlıdır'}</span><button class="btn ghost sm" id="csv">Cədvəli endir (CSV)</button></div><div class="rule"></div></div>
    <div class="grid g4" style="margin-bottom:18px">
      <div class="card stat"><div class="k">Qiymətləndirilən təlimçi</div><div class="v">${agg.ranked.length}<span class="muted" style="font-size:16px"> / ${active.length}</span></div></div>
      <div class="card stat"><div class="k">Filial üzrə orta bal</div><div class="v">${qAvg == null ? '—' : fmt(qAvg)}</div><div class="s">100 bal üzərindən</div></div>
      <div class="card stat"><div class="k">Ən yüksək nəticə</div><div class="v">${agg.ranked[0] ? fmt(agg.ranked[0].final) : '—'}</div><div class="s">${agg.ranked[0] ? esc(agg.ranked[0].trainer.full_name) : ''}</div></div>
      <div class="card stat"><div class="k">Doldurulmuş blanklar</div><div class="v">${evals.length}<span class="muted" style="font-size:16px"> / ${expected || '—'}</span></div><div class="s">${agg.cols.length} qiymətləndirici</div></div>
    </div>
    <div class="card"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th class="ctr">№</th><th>Təlimçinin soyadı, adı</th><th>Vəzifə</th>${agg.cols.map((c) => `<th class="num" title="${esc(c.name)}">${esc(c.label)}</th>`).join('')}<th class="num">Ortalama</th><th class="num">Yekun bal</th><th>Səviyyə</th></tr></thead>
      <tbody>${agg.rows.map((r) => `<tr class="click" data-t="${r.trainer.id}"><td class="ctr">${r.rank || '—'}</td><td><b>${esc(r.trainer.full_name)}</b></td><td class="muted">${esc(r.trainer.position)}</td>
        ${agg.cols.map((c) => `<td class="num">${r.byKey[c.key] ? fmt(r.byKey[c.key].total) : '<span class="badge warn">yoxdur</span>'}</td>`).join('')}
        <td class="num">${fmt(r.final)}</td><td class="num total" style="font-size:16px">${r.rounded ?? '—'}</td><td>${bandBadge(r.final)}</td></tr>`).join('')}</tbody>
    </table></div>${agg.cols.length ? '' : '<div class="empty">Bu rüb üçün hələ qiymətləndirmə yoxdur.</div>'}</div>
    <p class="legend-note">Yekun bal — bütün qiymətləndiricilərin (Direktor və Sosial iş üzrə mütəxəssislər) bərabər çəkili ortalaması. Səviyyə: 85+ Əla · 70–84 Yaxşı · 60–69 Qənaətbəxş · &lt;60 İnkişaf tələb edir.</p>`;

  view.querySelectorAll('tr[data-t]').forEach((tr) => (tr.onclick = () => trainerDetail(agg.rows.find((r) => r.trainer.id === tr.dataset.t), agg.cols, q)));
  view.querySelector('#csv').onclick = () => downloadCsv(`KPI ${quarterLabel(q)}.csv`, [
    ['№', 'Təlimçi', 'Vəzifə', ...agg.cols.map((c) => `${c.label} – ${c.name}`), 'Ortalama', 'Yekun bal', ...CATEGORIES.map((c) => `${c.title} (${c.max})`)],
    ...agg.rows.map((r) => [r.rank || '', r.trainer.full_name, r.trainer.position, ...agg.cols.map((c) => r.byKey[c.key] ? fmt(r.byKey[c.key].total) : ''), fmt(r.final), r.rounded ?? '', ...r.cats.map((x) => fmt(x))]),
  ]);
}

function trainerDetail(r, cols, q) {
  modal({
    title: `${r.trainer.full_name} · ${quarterLabel(q)}`, wide: true,
    body: `<div class="grid g3" style="margin-bottom:16px"><div class="card stat"><div class="k">Yekun bal</div><div class="v" style="color:var(--blue)">${r.rounded ?? '—'}</div><div class="s">Ortalama ${fmt(r.final)}</div></div>
      <div class="card stat"><div class="k">Reytinq</div><div class="v">${r.rank ? r.rank + '.' : '—'}</div></div><div class="card stat"><div class="k">Səviyyə</div><div class="v" style="font-size:20px;margin-top:10px">${bandBadge(r.final)}</div></div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>KPI istiqaməti</th><th class="num">Maks.</th>${cols.map((c) => `<th class="num">${esc(c.label)}</th>`).join('')}<th class="num">Ortalama</th></tr></thead>
      <tbody>${CATEGORIES.map((c, i) => `<tr><td>${c.no}. ${esc(c.title)}</td><td class="num muted">${c.max}</td>${cols.map((col) => `<td class="num">${r.byKey[col.key] ? fmt(r.byKey[col.key].cat_scores[i]) : '—'}</td>`).join('')}<td class="num total">${fmt(r.cats[i])}</td></tr>`).join('')}
      <tr><td><b>CƏMİ</b></td><td class="num muted">100</td>${cols.map((col) => `<td class="num"><b>${r.byKey[col.key] ? fmt(r.byKey[col.key].total) : '—'}</b></td>`).join('')}<td class="num total">${fmt(r.final)}</td></tr></tbody></table></div>`,
  });
}

/* ---------- Blanklar ---------- */
export async function adminForms(ctx) {
  const { view, params } = ctx;
  view.innerHTML = '<div class="muted">Yüklənir…</div>';
  const { quarters, q } = await pickQuarter(ctx);
  if (!q) { view.innerHTML = '<div class="card empty">Rüb yoxdur.</div>'; return; }
  const [trainers, evals] = await Promise.all([fetchTrainers(true, q.id), fetchEvaluations({ quarter_id: q.id })]);
  if (!ctx.isCurrent()) return;
  const tf = params.get('t') || ''; const ef = params.get('e') || '';
  const evaluators = [...new Map(evals.map((e) => [e.evaluator_key, e.evaluator_name])).entries()];
  const list = evals.filter((e) => (!tf || e.trainer_id === tf) && (!ef || e.evaluator_key === ef))
    .sort((a, b) => trainers.findIndex((t) => t.id === a.trainer_id) - trainers.findIndex((t) => t.id === b.trainer_id) || (a.evaluator_role === 'director' ? -1 : 1));
  const tName = (id) => trainers.find((t) => t.id === id)?.full_name || '—';
  const nav = (k, v) => { const p = new URLSearchParams({ q: q.id, t: tf, e: ef }); p.set(k, v); location.hash = '#/blanklar?' + p; };

  view.innerHTML = `<div class="page-h"><div><div class="eyebrow">Qiymətləndirmə blankları</div><h1>${esc(quarterLabel(q))}</h1></div>
    <div class="tools">${quarterSelect(quarters, q, '#/blanklar')}
      <select class="inp" style="width:auto" id="tf"><option value="">Bütün təlimçilər</option>${trainers.map((t) => `<option value="${t.id}" ${t.id === tf ? 'selected' : ''}>${esc(t.full_name)}</option>`).join('')}</select>
      <select class="inp" style="width:auto" id="ef"><option value="">Bütün qiymətləndiricilər</option>${evaluators.map(([k, n]) => `<option value="${esc(k)}" ${k === ef ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div><div class="rule"></div></div>
    <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Təlimçi</th><th>Qiymətləndirən</th><th>Vəzifə</th><th>Tarix</th>${CATEGORIES.map((c) => `<th class="num" title="${esc(c.title)}">${c.no} (${c.max})</th>`).join('')}<th class="num">Cəmi</th><th>Status</th></tr></thead>
    <tbody>${list.map((e) => { const c = completeness(e.inputs); return `<tr class="click" data-id="${e.id}"><td><b>${esc(tName(e.trainer_id))}</b></td><td>${esc(e.evaluator_name)}</td><td class="muted">${esc(e.evaluator_position || '')}</td><td class="muted tnum">${esc(e.eval_date || '')}</td>
      ${e.is_summary ? `<td colspan="${CATEGORIES.length}" class="muted small" style="text-align:center">Köhnə blankdan yalnız yekun bal idxal edilib</td>` : e.cat_scores.map((s) => `<td class="num">${fmt(s)}</td>`).join('')}<td class="num total">${fmt(e.total)}</td><td>${e.is_summary ? '<span class="badge">Yekun bal</span>' : c.done ? '<span class="badge ok">Tam</span>' : `<span class="badge warn">${c.filled}/${c.all}</span>`}</td></tr>`; }).join('')}</tbody></table>
    ${list.length ? '' : '<div class="empty">Blank tapılmadı.</div>'}</div></div>`;
  view.querySelector('#tf').onchange = (e) => nav('t', e.target.value);
  view.querySelector('#ef').onchange = (e) => nav('e', e.target.value);
  view.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => openBlank(list.find((e) => e.id === tr.dataset.id), trainers, q, () => adminForms(ctx))));
}

function openBlank(e, trainers, q, reload, editing = false) {
  const t = trainers.find((x) => x.id === e.trainer_id);
  if (e.is_summary) {
    modal({ title: `${t?.full_name} — ${e.evaluator_name}`,
      body: `<p style="margin-top:0">Bu qiymətləndirmə köhnə blankdan idxal edilib: yalnız yekun bal mövcuddur, göstəricilər və əsaslandırmalar yoxdur.</p><div class="stat card"><div class="k">Yekun bal</div><div class="v" style="color:var(--blue)">${fmt(e.total)}</div><div class="s">${esc(quarterLabel(q))} · ${esc(e.evaluator_position || '')}</div></div>`,
      footer: '<button class="btn danger" data-a="del">Sil</button>',
      onMount: (m, close) => { m.querySelector('[data-a=del]').onclick = async () => {
        if (!await confirmBox('Bu qeyd silinsin?', 'Sil')) return;
        const { error } = await sb.from('evaluations').delete().eq('id', e.id);
        if (error) return toast(errMsg(error), 'err');
        close(); reload();
      }; } });
    return;
  }
  let form;
  modal({
    title: `${t?.full_name} — ${e.evaluator_name}`, wide: true,
    body: `<div class="form-layout"><div id="bf"></div><aside><div class="card summary" id="bs"></div></aside></div>`,
    footer: editing ? `<button class="btn ghost" data-a="cancel">İmtina</button><button class="btn teal" data-a="save">Yadda saxla</button>`
      : `<button class="btn danger" data-a="del">Sil</button><span style="flex:1"></span><button class="btn ghost" data-a="edit">Düzəliş et</button>`,
    onMount: (m, close) => {
      form = renderForm(m.querySelector('#bf'), {
        evaluation: e, editable: editing,
        header: { period: quarterLabel(q), date: e.eval_date, evaluator: e.evaluator_name, evaluatorPos: e.evaluator_position, trainer: t?.full_name, trainerPos: t?.position },
        onChange: ({ scores, complete }) => { m.querySelector('#bs').innerHTML = summaryHtml(scores, complete); },
      });
      const a = (k) => m.querySelector(`[data-a=${k}]`);
      if (editing) {
        a('cancel').onclick = () => { close(); openBlank(e, trainers, q, reload, false); };
        a('save').onclick = async () => {
          const { data, error } = await sb.from('evaluations').update({ inputs: form.inputs, justifications: form.justifications, eval_date: form.date }).eq('id', e.id).select().single();
          if (error) return toast(errMsg(error), 'err');
          toast('Blank yeniləndi', 'ok'); close(); reload(); void normEval(data);
        };
      } else {
        a('edit').onclick = () => { close(); openBlank(e, trainers, q, reload, true); };
        a('del').onclick = async () => {
          if (!await confirmBox(`${e.evaluator_name} tərəfindən ${t?.full_name} üçün doldurulmuş blank silinsin?`, 'Sil')) return;
          const { error } = await sb.from('evaluations').delete().eq('id', e.id);
          if (error) return toast(errMsg(error), 'err');
          toast('Blank silindi', 'ok'); close(); reload();
        };
      }
    },
  });
}

/* ---------- Təlimçilər ---------- */
export async function adminTrainers(ctx) {
  const { view } = ctx;
  const trainers = await fetchTrainers(true);
  if (!ctx.isCurrent()) return;
  view.innerHTML = `<div class="page-h"><div><div class="eyebrow">İdarəetmə</div><h1>Təlimçilər</h1></div><div class="tools"><button class="btn teal" id="add">+ Təlimçi əlavə et</button></div><div class="rule"></div></div>
    <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="ctr">Sıra</th><th>Soyadı, adı, ata adı</th><th>Vəzifə</th><th>Status</th><th></th></tr></thead>
    <tbody>${trainers.map((t) => `<tr><td class="ctr">${t.sort_order}</td><td><b>${esc(t.full_name)}</b></td><td>${esc(t.position)}</td><td>${t.active ? '<span class="badge ok">Aktiv</span>' : '<span class="badge">Deaktiv</span>'}</td>
      <td class="num"><button class="btn ghost sm" data-e="${t.id}">Düzəliş</button> <button class="btn ghost sm" data-tog="${t.id}">${t.active ? 'Deaktiv et' : 'Aktiv et'}</button></td></tr>`).join('')}</tbody></table></div></div>
    <p class="legend-note">Deaktiv təlimçi yeni qiymətləndirmələrdə görünmür, keçmiş nəticələri isə saxlanılır. Vəzifə dəyişdikdə bağlı rüblərin nəticə və təqdimatlarında köhnə vəzifə qalır.</p>`;
  const edit = (t) => modal({
    title: t ? 'Təlimçini redaktə et' : 'Yeni təlimçi',
    body: `<label class="f"><span>Soyadı, adı, ata adı</span><input class="inp" id="n" value="${esc(t?.full_name || '')}"></label>
      <label class="f"><span>Vəzifə</span><select class="inp" id="p">${['Baş təlimçi', 'Təlimçi'].map((p) => `<option ${t?.position === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label class="f"><span>Sıra nömrəsi</span><input class="inp" id="o" type="number" value="${t?.sort_order ?? trainers.length + 1}"></label>`,
    footer: '<button class="btn teal" data-a="s">Yadda saxla</button>',
    onMount: (m, close) => {
      m.querySelector('[data-a=s]').onclick = async () => {
        const row = { full_name: m.querySelector('#n').value.trim(), position: m.querySelector('#p').value, sort_order: Number(m.querySelector('#o').value) || 0 };
        if (row.full_name.length < 3) return toast('Ad daxil edin', 'err');
        // vəzifə dəyişirsə, köhnə vəzifəni artıq qiymətləndirilmiş rüblər üçün tarixçədə saxla
        if (t && t.position !== row.position) {
          const [{ data: ev }, { data: hist }, { data: qs }] = await Promise.all([
            sb.from('evaluations').select('quarter_id').eq('trainer_id', t.id),
            sb.from('trainer_positions').select('quarter_id').eq('trainer_id', t.id),
            sb.from('quarters').select('id,status')]);
          const has = new Set((hist || []).map((h) => h.quarter_id));
          const closed = new Set((qs || []).filter((x) => x.status === 'closed').map((x) => x.id));
          const keep = [...new Set((ev || []).map((e) => e.quarter_id))].filter((id) => closed.has(id) && !has.has(id));
          if (keep.length) {
            const { error: he } = await sb.from('trainer_positions').insert(keep.map((quarter_id) => ({ trainer_id: t.id, quarter_id, position: t.position })));
            if (he) return toast(errMsg(he), 'err');
          }
        }
        const { error } = t ? await sb.from('trainers').update(row).eq('id', t.id) : await sb.from('trainers').insert(row);
        if (error) return toast(errMsg(error), 'err');
        close(); toast('Yadda saxlanıldı', 'ok'); adminTrainers(ctx);
      };
    },
  });
  view.querySelector('#add').onclick = () => edit(null);
  view.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => edit(trainers.find((t) => t.id === b.dataset.e))));
  view.querySelectorAll('[data-tog]').forEach((b) => (b.onclick = async () => {
    const t = trainers.find((x) => x.id === b.dataset.tog);
    const { error } = await sb.from('trainers').update({ active: !t.active }).eq('id', t.id);
    if (error) return toast(errMsg(error), 'err');
    adminTrainers(ctx);
  }));
}

/* ---------- Rüblər ---------- */
export async function adminQuarters(ctx) {
  const { view } = ctx;
  const [quarters, { data: counts }] = await Promise.all([fetchQuarters(), sb.from('evaluations').select('quarter_id')]);
  if (!ctx.isCurrent()) return;
  const cnt = {}; (counts || []).forEach((r) => { cnt[r.quarter_id] = (cnt[r.quarter_id] || 0) + 1; });
  const y = new Date().getFullYear();
  view.innerHTML = `<div class="page-h"><div><div class="eyebrow">İdarəetmə</div><h1>Qiymətləndirmə dövrləri</h1></div><div class="rule"></div></div>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start">
    <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Dövr</th><th>Status</th><th class="num">Blank sayı</th><th></th></tr></thead>
    <tbody>${quarters.map((q) => `<tr><td><b>${esc(quarterLabel(q))}</b></td><td>${q.status === 'open' ? '<span class="badge open">Açıq — qiymətləndirmə gedir</span>' : '<span class="badge">Bağlı</span>'}</td><td class="num">${cnt[q.id] || 0}</td>
      <td class="num"><button class="btn ${q.status === 'open' ? 'ghost' : 'teal'} sm" data-tog="${q.id}">${q.status === 'open' ? 'Bağla' : 'Aç'}</button></td></tr>`).join('')}</tbody></table></div></div>
    <div class="card pad"><h3>Yeni rüb</h3><div class="muted small" style="margin-bottom:12px">Rüb açıq olduqda mütəxəssislər və direktor qiymətləndirmə apara bilər.</div>
      <label class="f"><span>İl</span><input class="inp" id="y" type="number" value="${y}"></label>
      <label class="f"><span>Rüb</span><select class="inp" id="qq">${[1, 2, 3, 4].map((n) => `<option value="${n}">${QUARTER_LABELS[n]}</option>`).join('')}</select></label>
      <button class="btn teal block" id="addq">Əlavə et</button></div></div>`;
  view.querySelectorAll('[data-tog]').forEach((b) => (b.onclick = async () => {
    const q = quarters.find((x) => x.id === b.dataset.tog);
    const to = q.status === 'open' ? 'closed' : 'open';
    if (to === 'closed' && !await confirmBox(`${quarterLabel(q)} bağlansın? Bağlandıqdan sonra mütəxəssislər və direktor dəyişiklik edə bilməyəcək.`, 'Bağla')) return;
    const { error } = await sb.from('quarters').update({ status: to }).eq('id', q.id);
    if (error) return toast(errMsg(error), 'err');
    adminQuarters(ctx);
  }));
  view.querySelector('#addq').onclick = async () => {
    const { error } = await sb.from('quarters').insert({ year: Number(view.querySelector('#y').value), quarter: Number(view.querySelector('#qq').value), status: 'closed' });
    if (error) return toast(/duplicate/.test(error.message) ? 'Bu rüb artıq mövcuddur' : errMsg(error), 'err');
    toast('Rüb əlavə edildi', 'ok'); adminQuarters(ctx);
  };
}

/* ---------- Tənzimləmələr ---------- */
export async function adminSettings(ctx) {
  const { view } = ctx;
  const { data: profiles } = await sb.from('profiles').select('*');
  const dir = (profiles || []).find((p) => p.role === 'director');
  view.innerHTML = `<div class="page-h"><div><div class="eyebrow">İdarəetmə</div><h1>Tənzimləmələr</h1></div><div class="rule"></div></div>
    <div class="grid g3">
      <div class="card pad"><h3>Mütəxəssislərin ortaq şifrəsi</h3><div class="muted small" style="margin-bottom:12px">Psixoloq, sosial işçi və bədii yaradıcılıq üzrə mütəxəssislər bu şifrə ilə daxil olur. Hər rüb dəyişmək tövsiyə olunur.</div>
        <label class="f"><span>Yeni şifrə</span><input class="inp" id="sp1" type="text" autocomplete="off" minlength="6"></label>
        <button class="btn teal block" data-pw="specialist">Şifrəni dəyiş</button></div>
      <div class="card pad"><h3>Direktor hesabı</h3><div class="muted small" style="margin-bottom:12px">İstifadəçi adı: <b>direktor</b>. Ad və vəzifə blanklarda və təqdimatda göstərilir.</div>
        <label class="f"><span>Ad, soyad</span><input class="inp" id="dn" value="${esc(dir?.display_name || '')}"></label>
        <label class="f"><span>Vəzifə</span><input class="inp" id="dp" value="${esc(dir?.display_position || 'Direktor')}"></label>
        <button class="btn ghost block" id="dsave">Məlumatı yadda saxla</button>
        <label class="f" style="margin-top:14px"><span>Yeni şifrə</span><input class="inp" id="sp2" type="text" autocomplete="off"></label>
        <button class="btn teal block" data-pw="director">Direktorun şifrəsini dəyiş</button></div>
      <div class="card pad"><h3>Admin şifrəsi</h3><div class="muted small" style="margin-bottom:12px">İstifadəçi adı: <b>admin</b></div>
        <label class="f"><span>Yeni şifrə</span><input class="inp" id="sp3" type="password" autocomplete="new-password"></label>
        <label class="f"><span>Təkrar</span><input class="inp" id="sp4" type="password" autocomplete="new-password"></label>
        <button class="btn teal block" id="asave">Şifrəni dəyiş</button></div>
    </div>`;
  view.querySelectorAll('[data-pw]').forEach((b) => (b.onclick = async () => {
    const role = b.dataset.pw; const inp = view.querySelector(role === 'specialist' ? '#sp1' : '#sp2');
    if (inp.value.length < 6) return toast('Şifrə ən azı 6 simvol olmalıdır', 'err');
    const { error } = await sb.rpc('admin_set_password', { p_role: role, p_password: inp.value });
    if (error) return toast(errMsg(error), 'err');
    toast('Şifrə dəyişdirildi', 'ok'); inp.value = '';
  }));
  view.querySelector('#dsave').onclick = async () => {
    const newName = view.querySelector('#dn').value.trim();
    const { error } = await sb.from('profiles').update({ display_name: newName, display_position: view.querySelector('#dp').value.trim() }).eq('user_id', dir.user_id);
    if (error) return toast(errMsg(error), 'err');
    toast('Yadda saxlanıldı', 'ok');
  };
  view.querySelector('#asave').onclick = async () => {
    const a = view.querySelector('#sp3').value, b2 = view.querySelector('#sp4').value;
    if (a.length < 8) return toast('Şifrə ən azı 8 simvol olmalıdır', 'err');
    if (a !== b2) return toast('Şifrələr eyni deyil', 'err');
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) return toast(errMsg(error), 'err');
    toast('Admin şifrəsi dəyişdirildi', 'ok');
  };
}
