// KPI forması — Excel blankının strukturu (KPİ - yaradıcılıq nümunə.xlsx)
// "Nəticə" (%) əl ilə daxil edilir, Bal = Nəticə × Maks. bal.
// Yaradıcılıq bölməsində səviyyə seçilir və aralıqdan bal verilir.
export const CATEGORIES = [
  {
    no: 1, key: 'c1', title: 'Benefisiarların inkişafı və təlim keyfiyyəti', max: 35,
    section: '1. KPI-lərin qiymətləndirilməsi', type: 'pct',
    items: [
      { code: '1.1', title: 'Benefisiarların ölçülə bilən inkişafı', max: 15 },
      { code: '1.2', title: 'İştirakçı məmnuniyyəti', max: 10 },
      { code: '1.3', title: 'Aktiv iştirak və praktiki tətbiq', max: 5 },
      { code: '1.4', title: 'Təlimin keyfiyyəti və metodika', max: 5 },
    ],
  },
  {
    no: 2, key: 'c2', title: 'Təlimlərin icrası və nəticəlilik', max: 20,
    section: '2. Təlimlərin icrası və nəticəlilik', type: 'pct',
    items: [
      { code: '2.1', title: 'Planlaşdırılmış təlimlərin icrası', max: 10 },
      { code: '2.2', title: 'Davamiyyət və iştirak', max: 4 },
      { code: '2.3', title: 'Təlimlərin vaxtında keçirilməsi', max: 2 },
      { code: '2.4', title: 'Proqram və standartlara uyğunluq', max: 2 },
      { code: '2.5', title: 'Sənədlərin və hesabatların vaxtında təqdim edilməsi', max: 2 },
    ],
  },
  {
    no: 3, key: 'c3', title: 'Yaradıcılıq və innovasiya', max: 15,
    section: '3. Yaradıcılıq və innovasiya', type: 'level',
    levels: [
      { lvl: 1, title: 'Müntəzəm yeni metod/material tətbiq edir, yeni yanaşmalar yaradır və paylaşır', min: 13, max: 15, label: 'Əla' },
      { lvl: 2, title: 'Hər rübdə yeni metod, material və ya tapşırıqlar tətbiq edir', min: 10, max: 12, label: 'Yaxşı' },
      { lvl: 3, title: 'Bəzən yeni yanaşmalardan istifadə edir', min: 7, max: 9, label: 'Qənaətbəxş' },
      { lvl: 4, title: 'Əsasən standart metodlarla işləyir', min: 0, max: 6, label: 'İnkişaf tələb edir' },
    ],
  },
  {
    no: 4, key: 'c4', title: 'Peşəkar inkişaf və komanda işi', max: 15,
    section: '4. Peşəkar inkişaf və komanda işi', type: 'pct',
    items: [
      { code: '4.1', title: 'İxtisasartırma və yeni biliklərin əldə edilməsi', max: 5 },
      { code: '4.2', title: 'Yeni biliklərin praktikada tətbiqi', max: 3 },
      { code: '4.3', title: 'Komanda işində iştirak', max: 3 },
      { code: '4.4', title: 'Təcrübə və metodların paylaşılması', max: 2 },
      { code: '4.5', title: 'Mentor dəstəyi / yeni əməkdaşlara dəstək', max: 2 },
    ],
  },
  {
    no: 5, key: 'c5', title: 'Hesabatlılıq və əmək intizamı', max: 15,
    section: '5. Hesabatlılıq və əmək intizamı', type: 'pct',
    items: [
      { code: '5.1', title: 'Hesabatların vaxtında və düzgün təqdim edilməsi', max: 4 },
      { code: '5.2', title: 'İş qrafikinə və əmək intizamına riayət', max: 4 },
      { code: '5.3', title: 'Daxili prosedurlara əməl', max: 2 },
      { code: '5.4', title: 'Etik davranış və komanda münasibətləri', max: 2 },
      { code: '5.5', title: 'Benefisiar məlumatlarının məxfiliyinin qorunması', max: 2 },
      { code: '5.6', title: 'Rəhbərliyin tapşırıqlarının vaxtında icrası', max: 1 },
    ],
  },
];

export const QUARTER_LABELS = { 1: 'I rüb', 2: 'II rüb', 3: 'III rüb', 4: 'IV rüb' };

export const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
export const fmt = (x, d = 2) => (x === null || x === undefined || isNaN(x)) ? '—' : Number(x).toFixed(d);

// Excel düsturlarının eynisi
export function computeScores(inputs = {}) {
  const cats = CATEGORIES.map((c) => {
    if (c.type === 'level') {
      const s = Number(inputs['3.score']);
      return isFinite(s) && inputs['3.score'] !== '' && inputs['3.score'] != null ? s : 0;
    }
    return c.items.reduce((sum, it) => {
      const v = inputs[it.code];
      return sum + (v === '' || v == null || isNaN(v) ? 0 : Number(v) * it.max);
    }, 0);
  }).map(r2);
  return { cats, total: r2(cats.reduce((a, b) => a + b, 0)) };
}

// Blankın tamamlanma vəziyyəti
export function completeness(inputs = {}) {
  let filled = 0, all = 0;
  for (const c of CATEGORIES) {
    if (c.type === 'level') { all++; if (inputs['3.score'] !== undefined && inputs['3.score'] !== '' && inputs['3.lvl']) filled++; continue; }
    for (const it of c.items) { all++; if (inputs[it.code] !== undefined && inputs[it.code] !== '' && inputs[it.code] !== null) filled++; }
  }
  return { filled, all, done: filled === all };
}

export function levelOf(inputs) {
  const l = CATEGORIES[2].levels.find((x) => x.lvl === Number(inputs?.['3.lvl']));
  return l || null;
}

export function performanceBand(total) {
  if (total >= 85) return { label: 'Əla', cls: 'band-a' };
  if (total >= 70) return { label: 'Yaxşı', cls: 'band-b' };
  if (total >= 60) return { label: 'Qənaətbəxş', cls: 'band-c' };
  return { label: 'İnkişaf tələb edir', cls: 'band-d' };
}
