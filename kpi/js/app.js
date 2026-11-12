import { sb, esc, $, toast, errMsg, fetchProfile, EMAIL_DOMAIN, SPECIALIST_EMAIL, ORG } from './core.js';
import { specialistHome, specialistForm } from './views/specialist.js';
import { directorHome, directorForm } from './views/director.js';
import { adminResults, adminForms, adminTrainers, adminQuarters, adminSettings } from './views/admin.js';
import { adminReport } from './views/report.js';
import { adminAnalytics } from './views/analytics.js';

export const state = { profile: null, sp: null };
const SP_KEY = 'dostevi-kpi-specialist';

const ROLE_LABEL = { admin: 'Admin', director: 'Direktor (moderator)', specialist: 'Mütəxəssis' };
const NAV = {
  admin: [['#/neticeler', 'Nəticələr'], ['#/teqdimat', 'Təqdimat'], ['#/tehlil', 'Təhlil'], ['#/blanklar', 'Blanklar'], ['#/telimciler', 'Təlimçilər'], ['#/rubler', 'Rüblər'], ['#/tenzimlemeler', 'Tənzimləmələr']],
  director: [['#/dir', 'Qiymətləndirmə']],
  specialist: [['#/sp', 'Qiymətləndirmə']],
};
const HOME = { admin: '#/neticeler', director: '#/dir', specialist: '#/sp' };

/* ---------------- Login ---------------- */
function renderLogin(mode = 'sp', msg = '') {
  $('#app').innerHTML = `<div class="login-wrap">
    <section class="login-hero">
      <div><div class="eyebrow">${esc(ORG.branch)} filialı</div>
      <h1>Təlimçilərin performans və KPI qiymətləndirilməsi</h1>
      <p>${esc(ORG.dept[0].toUpperCase() + ORG.dept.slice(1))} üzrə rüblük qiymətləndirmə, yekun nəticələr və rəhbərlik üçün təqdimat.</p></div>
      <div class="meta">5 əsas KPI istiqaməti · Maksimum 100 bal</div>
    </section>
    <section class="login-side"><div class="login-card">
      <h2>Sistemə giriş</h2><div class="muted">Rolunuzu seçin</div>
      <div class="seg"><button data-m="sp" class="${mode === 'sp' ? 'on' : ''}">Mütəxəssis</button><button data-m="lead" class="${mode === 'lead' ? 'on' : ''}">Direktor / Admin</button></div>
      <form id="lf" autocomplete="on">
        ${mode === 'sp' ? `
          <label class="f"><span>Ad, soyad</span><input class="inp" name="name" required minlength="3" placeholder="məs. Həsənli Şahnaz" value="${esc(JSON.parse(localStorage.getItem(SP_KEY) || '{}').name || '')}"></label>
          <label class="f"><span>Vəzifə</span><input class="inp" name="pos" required placeholder="məs. Psixoloq" value="${esc(JSON.parse(localStorage.getItem(SP_KEY) || '{}').position || '')}"></label>
          <label class="f"><span>Şifrə</span><input class="inp" name="pw" type="password" required autocomplete="current-password"></label>`
        : `<label class="f"><span>İstifadəçi adı</span><input class="inp" name="user" required placeholder="direktor və ya admin" autocomplete="username"></label>
          <label class="f"><span>Şifrə</span><input class="inp" name="pw" type="password" required autocomplete="current-password"></label>`}
        <button class="btn block teal" type="submit">Daxil ol</button>
        <div class="err">${esc(msg)}</div>
      </form>
    </div></section></div>`;
  $('#app').querySelectorAll('.seg button').forEach((b) => (b.onclick = () => renderLogin(b.dataset.m)));
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Yoxlanılır…';
    try {
      let email;
      if (mode === 'sp') {
        const name = String(f.get('name')).trim().replace(/\s+/g, ' ');
        const position = String(f.get('pos')).trim();
        if (name.split(' ').length < 2) throw new Error('Ad və soyadı tam daxil edin');
        localStorage.setItem(SP_KEY, JSON.stringify({ name, position }));
        email = SPECIALIST_EMAIL;
      } else {
        const u = String(f.get('user')).trim().toLowerCase();
        email = u.includes('@') ? u : u + EMAIL_DOMAIN;
      }
      const { error } = await sb.auth.signInWithPassword({ email, password: String(f.get('pw')) });
      if (error) throw error;
      await boot();
    } catch (err) {
      renderLogin(mode, errMsg(err));
    }
  };
}

/* ---------------- Shell ---------------- */
function shell(activeHash) {
  const p = state.profile;
  const who = p.role === 'specialist' ? `${state.sp?.name || ''}<div class="small" style="color:#94A3B8">${esc(state.sp?.position || '')}</div>` : esc(p.display_name || '');
  $('#app').innerHTML = `<header class="topbar">
      <div class="brand"><div class="logo">K</div><div>${esc(ORG.branch)} · KPI<small>Təlimçilərin qiymətləndirilməsi</small></div></div>
      <nav class="nav">${NAV[p.role].map(([h, l]) => `<a href="${h}" class="${activeHash.startsWith(h) ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <div class="who"><span class="role-pill">${ROLE_LABEL[p.role]}</span><div><b>${p.role === 'specialist' ? esc(state.sp?.name || '') : who}</b></div><button class="btn sm" id="logout">Çıxış</button></div>
    </header><main class="page" id="view"></main>`;
  $('#logout').onclick = logout;
  return $('#view');
}

async function logout() {
  await sb.auth.signOut();
  state.profile = null;
  location.hash = '';
  renderLogin(state.sp ? 'sp' : 'lead');
}

/* ---------------- Router ---------------- */
let routeToken = 0;
async function route() {
  if (!state.profile) return;
  const role = state.profile.role;
  let hash = location.hash || HOME[role];
  if (!NAV[role].some(([h]) => hash.startsWith(h))) { location.hash = HOME[role]; return; }
  const [path, qs] = hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(qs || '');
  const view = shell('#/' + parts[0]);
  const token = ++routeToken;
  const ctx = { view, params, state, isCurrent: () => token === routeToken };
  try {
    if (role === 'specialist') return parts[1] ? specialistForm(ctx, parts[1]) : specialistHome(ctx);
    if (role === 'director') return parts[1] ? directorForm(ctx, parts[1]) : directorHome(ctx);
    const map = { neticeler: adminResults, blanklar: adminForms, teqdimat: adminReport, tehlil: adminAnalytics, telimciler: adminTrainers, rubler: adminQuarters, tenzimlemeler: adminSettings };
    return map[parts[0]](ctx);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card pad err">${esc(errMsg(e))}</div>`;
  }
}

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin(localStorage.getItem(SP_KEY) ? 'sp' : 'sp');
  try {
    state.profile = await fetchProfile();
  } catch (e) { toast(errMsg(e), 'err'); }
  if (!state.profile) { await sb.auth.signOut(); return renderLogin('lead', 'Bu istifadəçi üçün rol təyin edilməyib'); }
  if (state.profile.role === 'specialist') {
    state.sp = JSON.parse(localStorage.getItem(SP_KEY) || 'null');
    if (!state.sp?.name) { await sb.auth.signOut(); return renderLogin('sp', 'Ad və vəzifəni daxil edin'); }
  }
  if (!location.hash) location.hash = HOME[state.profile.role];
  else route();
}

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toast(errMsg(e.reason), 'err'); });
boot();
