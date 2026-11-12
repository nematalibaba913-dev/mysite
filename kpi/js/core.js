// Supabase müştərisi, ümumi köməkçilər və verilənlər funksiyaları
import { CATEGORIES, QUARTER_LABELS, computeScores, r2 } from './kpi.js';

export const SUPABASE_URL = 'https://oqryxvyqhcreiuucdivc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_9sVOz-vgiVZ9Bg3GzNg0aQ_NBWxLY8F';
export const EMAIL_DOMAIN = '@dostevi.az';
export const SPECIALIST_EMAIL = 'mutexessis' + EMAIL_DOMAIN;
export const ORG = { branch: 'DOST Evi', dept: 'bədii yaradıcılıq və sənətkarlıq şöbəsi' };

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dostevi-kpi-auth' },
});

/* ---------------- DOM helpers ---------------- */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 6000 : 3200);
}

export function modal({ title, body, footer = '', wide = false, onMount }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="mh"><h3>${esc(title)}</h3><button class="x" aria-label="Bağla">×</button></div>
    <div class="mb">${body}</div>${footer ? `<div class="mf">${footer}</div>` : ''}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  bg.querySelector('.x').onclick = close;
  document.body.appendChild(bg);
  onMount?.(bg.querySelector('.modal'), close);
  return close;
}

export function confirmBox(text, okLabel = 'Təsdiq et') {
  return new Promise((res) => {
    const close = modal({
      title: 'Təsdiq', body: `<p style="margin:0">${esc(text)}</p>`,
      footer: `<button class="btn ghost" data-a="no">İmtina</button><button class="btn" data-a="ok">${esc(okLabel)}</button>`,
      onMount: (m, c) => {
        m.querySelector('[data-a=no]').onclick = () => { c(); res(false); };
        m.querySelector('[data-a=ok]').onclick = () => { c(); res(true); };
      },
    });
    void close;
  });
}

export const errMsg = (e) => {
  const m = e?.message || String(e);
  if (/Invalid login/i.test(m)) return 'Şifrə və ya istifadəçi adı yanlışdır';
  if (/duplicate key/i.test(m)) return 'Bu ad ilə həmin təlimçi üçün qiymətləndirmə artıq mövcuddur';
  if (/row-level security/i.test(m)) return 'Bu əməliyyat üçün icazə yoxdur (rüb bağlı ola bilər)';
  return m;
};

export const quarterLabel = (q) => q ? `${q.year} · ${QUARTER_LABELS[q.quarter]}` : '';
export const shortName = (full) => {
  const p = String(full || '').trim().split(/\s+/);
  return p.length >= 2 ? `${p[0]} ${p[1][0]}.` : full;
};
export const twoNames = (full) => String(full || '').trim().split(/\s+/).slice(0, 2).join(' ');
export const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

/* ---------------- Data ---------------- */
export async function fetchProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, email: user.email } : null;
}

export async function fetchTrainers(includeInactive = false) {
  let q = sb.from('trainers').select('*').order('sort_order').order('full_name');
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchQuarters() {
  const { data, error } = await sb.from('quarters').select('*').order('year', { ascending: false }).order('quarter', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchEvaluations(filter = {}) {
  let q = sb.from('evaluations').select('*');
  if (filter.quarter_id) q = q.eq('quarter_id', filter.quarter_id);
  if (filter.quarter_ids) q = q.in('quarter_id', filter.quarter_ids);
  if (filter.trainer_id) q = q.eq('trainer_id', filter.trainer_id);
  const { data, error } = await q.order('created_at');
  if (error) throw error;
  return data.map(normEval);
}

export function normEval(e) {
  return { ...e, total: Number(e.total), cat_scores: (e.cat_scores || []).map(Number) };
}

export async function fetchReportTexts(quarter_id) {
  const { data, error } = await sb.from('report_texts').select('*').eq('quarter_id', quarter_id);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.key, r.content]));
}

export async function saveReportText(quarter_id, key, content) {
  const { error } = await sb.from('report_texts').upsert({ quarter_id, key, content, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/* Qiymətləndiricilər (sütunlar): Direktor əvvəl, sonra mütəxəssislər */
export function evaluatorColumns(evals) {
  const map = new Map();
  for (const e of evals) {
    if (!map.has(e.evaluator_key)) map.set(e.evaluator_key, { key: e.evaluator_key, name: e.evaluator_name, role: e.evaluator_role, positions: {} });
    const c = map.get(e.evaluator_key);
    const p = (e.evaluator_position || '').trim() || (e.evaluator_role === 'director' ? 'Direktor' : 'Mütəxəssis');
    c.positions[p] = (c.positions[p] || 0) + 1;
  }
  const cols = [...map.values()].map((c) => ({
    ...c, position: Object.entries(c.positions).sort((a, b) => b[1] - a[1])[0][0],
  }));
  cols.sort((a, b) => (a.role === b.role ? a.position.localeCompare(b.position, 'az') || a.name.localeCompare(b.name, 'az') : a.role === 'director' ? -1 : 1));
  // eyni vəzifə adı təkrarlanırsa adla fərqləndir
  const cnt = {};
  cols.forEach((c) => { cnt[c.position] = (cnt[c.position] || 0) + 1; });
  cols.forEach((c) => { c.label = cnt[c.position] > 1 ? `${c.position} (${shortName(c.name)})` : c.position; });
  return cols;
}

/* Rüb üzrə yekun nəticələr — hamı bərabər çəkidə */
export function aggregate(trainers, evals) {
  const cols = evaluatorColumns(evals);
  const rows = trainers.map((t) => {
    const ev = evals.filter((e) => e.trainer_id === t.id);
    const byKey = Object.fromEntries(ev.map((e) => [e.evaluator_key, e]));
    const final = ev.length ? r2(avg(ev.map((e) => e.total))) : null;
    const det = ev.filter((e) => !e.is_summary); // göstəricilər üzrə doldurulmuş blanklar
    const cats = CATEGORIES.map((_, i) => (det.length ? r2(avg(det.map((e) => e.cat_scores[i] || 0))) : null));
    // göstəricilər üzrə orta faiz (avtomatik əsaslandırma üçün)
    const itemPct = {};
    for (const c of CATEGORIES) {
      if (c.type !== 'pct') continue;
      for (const it of c.items) {
        const vals = det.map((e) => e.inputs?.[it.code]).filter((v) => v !== undefined && v !== null && v !== '').map(Number);
        itemPct[it.code] = vals.length ? avg(vals) : null;
      }
    }
    const lvls = det.map((e) => Number(e.inputs?.['3.lvl'])).filter(Boolean);
    return { trainer: t, evals: ev, byKey, final, rounded: final === null ? null : Math.round(final), cats, itemPct, lvls };
  });
  const ranked = rows.filter((r) => r.final !== null).sort((a, b) => b.final - a.final);
  ranked.forEach((r, i) => { r.rank = i + 1; });
  const pending = rows.filter((r) => r.final === null);
  return { cols, rows: [...ranked, ...pending], ranked };
}

export { computeScores, CATEGORIES, QUARTER_LABELS, r2 };
