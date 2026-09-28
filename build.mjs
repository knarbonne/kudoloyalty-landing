/**
 * Emits one pre-rendered HTML file per locale from src/index.html.
 *
 * Why this exists: the page used to hold both languages in a JS object and
 * swap them in at runtime. Crawlers have no localStorage and Googlebot
 * reports navigator.language as en-US, so the Thai copy was never indexed
 * and had no URL of its own. Now each locale is a real, static document.
 *
 *   src/index.html  ->  index.html      (th, root — the primary market)
 *                   ->  en/index.html   (en)
 *
 * Also writes robots.txt and sitemap.xml.
 * Run: node build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/* One place to change when a custom domain lands. */
const SITE = 'https://kudoloyalty-landing.vercel.app';

const LOCALES = {
  th: {
    path: '/',
    out: 'index.html',
    ogLocale: 'th_TH',
    switchTo: { href: '/en', hreflang: 'en', label: 'English' },
    title: 'Kudo — ระบบสะสมแต้มผ่าน LINE สำหรับร้านค้าไทย',
    description:
      'ระบบสะสมแต้มและสมาชิกที่ทำงานอยู่ใน LINE — แต้ม รางวัล กลุ่มลูกค้า และการส่งข้อความอัตโนมัติ ' +
      'ลูกค้าไม่ต้องดาวน์โหลดแอปใหม่ ตั้งค่าเองได้ในไม่ถึง 15 นาที',
    ogTitle: 'Kudo — ระบบสะสมแต้มที่อยู่ใน LINE',
    ogDescription:
      'ลูกค้าของคุณอยู่บน LINE อยู่แล้ว ให้โปรแกรมสะสมแต้มอยู่ที่นั่นด้วย เริ่มใช้ฟรี ไม่ต้องใช้บัตรเครดิต',
    imageAlt:
      'Kudo — โปรแกรมสะสมแต้มที่ทำงานใน LINE แสดงแต้มสะสมของสมาชิกและรางวัลที่พร้อมแลก',
  },
  en: {
    path: '/en',
    out: 'en/index.html',
    ogLocale: 'en_US',
    switchTo: { href: '/', hreflang: 'th', label: 'ภาษาไทย' },
    title: 'Kudo — Loyalty built for LINE',
    description:
      'Kudo — LINE-native loyalty platform for Thai SMEs. Points, stamps, segments, ' +
      'broadcasts, and automated messages — without asking customers to download anything new.',
    ogTitle: 'Kudo — Loyalty built for LINE',
    ogDescription:
      'Your customers are already on LINE. Give them a loyalty program that lives there too. ' +
      'Self-serve setup in under 15 minutes.',
    imageAlt:
      "Kudo — a loyalty program running inside LINE, showing a member's points balance and a reward ready to redeem.",
  },
};

/* Prices are identical across locales; only the wording differs. */
const PRICING = {
  th: {
    mo: '/เดือน',
    tiers: {
      starter:  { monthly: '฿590',   annual: '฿492',   note: 'หรือ ฿492/เดือน เมื่อชำระรายปี' },
      growth:   { monthly: '฿1,290', annual: '฿1,075', note: 'หรือ ฿1,075/เดือน เมื่อชำระรายปี' },
      business: { monthly: '฿2,490', annual: '฿2,075', note: 'หรือ ฿2,075/เดือน เมื่อชำระรายปี' },
    },
  },
  en: {
    mo: '/mo',
    tiers: {
      starter:  { monthly: '฿590',   annual: '฿492',   note: 'or ฿492/mo billed annually' },
      growth:   { monthly: '฿1,290', annual: '฿1,075', note: 'or ฿1,075/mo billed annually' },
      business: { monthly: '฿2,490', annual: '฿2,075', note: 'or ฿2,075/mo billed annually' },
    },
  },
};

const src = readFileSync('src/index.html', 'utf8');
const CSS = '  <style>\n' + readFileSync('src/styles.css', 'utf8').replace(/\n$/, '') + '\n  </style>';
const legalShell = readFileSync('src/legal.html', 'utf8');

/* Legal pages: prose per locale, dropped into the shared shell. */
const LEGAL = {
  privacy: {
    slug: 'privacy',
    th: { title: 'นโยบายความเป็นส่วนตัว — Kudo', desc: 'Kudo เก็บและใช้ข้อมูลส่วนบุคคลอย่างไร ภายใต้ PDPA ของประเทศไทย' },
    en: { title: 'Privacy Policy — Kudo', desc: 'How Kudo collects, uses and protects personal data under Thailand\'s PDPA.' },
  },
  terms: {
    slug: 'terms',
    th: { title: 'ข้อกำหนดการให้บริการ — Kudo', desc: 'ข้อกำหนดการใช้งาน Kudo สำหรับร้านค้า ครอบคลุมแพ็กเกจ ค่าบริการ และความรับผิดชอบ' },
    en: { title: 'Terms of Service — Kudo', desc: 'The terms governing merchant use of Kudo, covering plans, fees and responsibilities.' },
  },
};

const NAV = {
  th: { cta: 'เริ่มใช้งาน →', home: 'หน้าแรก', privacy: 'ความเป็นส่วนตัว', terms: 'ข้อกำหนด', contact: 'ติดต่อ', other: 'English' },
  en: { cta: 'Get started →', home: 'Home', privacy: 'Privacy', terms: 'Terms', contact: 'Contact', other: 'ภาษาไทย' },
};

/* Every URL the site publishes, so the sitemap and hreflang stay honest. */
const urlFor = (loc, slug) => (loc === 'th' ? (slug ? `/${slug}` : '/') : (slug ? `/en/${slug}` : '/en'));
const PAGES = ['', 'privacy', 'terms'];

/* ── pull the translation table out of the source ─────────────────── */
const tStart = src.indexOf('const T = {');
const tEnd = src.indexOf('};', src.indexOf("'footer-signin'", src.indexOf("th: {"))) + 2;
if (tStart === -1 || tEnd < tStart) throw new Error('could not locate the T translation table');
const T = eval('(' + src.slice(tStart + 'const T = '.length, tEnd - 1) + ')');
for (const l of Object.keys(LOCALES)) {
  if (!T[l]) throw new Error(`translation table has no "${l}" block`);
}

/**
 * Replace an element's innerHTML by id, matching the closing tag by depth so
 * nested markup (the <span> inside the hero <h1>, for one) survives intact.
 */
function setInner(html, id, value) {
  const at = html.indexOf(`id="${id}"`);
  if (at === -1) return { html, hit: false };
  const open = html.lastIndexOf('<', at);
  const tag = /^<([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(open, open + 20))[1];
  const openEnd = html.indexOf('>', at) + 1;
  const re = new RegExp(`<(/?)${tag}(?=[\\s/>])`, 'gi');
  re.lastIndex = openEnd;
  let depth = 1, close = -1, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) { close = m.index; break; }
  }
  if (close === -1) throw new Error(`unbalanced <${tag}> for id="${id}"`);
  return { html: html.slice(0, openEnd) + value + html.slice(close), hit: true };
}

const jsonld = (loc) => JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'Kudo',
      url: SITE,
      logo: `${SITE}/og.png`,
      email: 'krissada.narbonne@gmail.com',
      areaServed: { '@type': 'Country', name: 'Thailand' },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#site`,
      url: SITE,
      name: 'Kudo',
      publisher: { '@id': `${SITE}/#org` },
      inLanguage: loc === 'th' ? 'th-TH' : 'en-US',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#app`,
      name: 'Kudo',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, LINE',
      description: LOCALES[loc].description,
      publisher: { '@id': `${SITE}/#org` },
      inLanguage: loc === 'th' ? 'th-TH' : 'en-US',
      offers: [
        { tier: 'Free',     price: '0',    limit: loc === 'th' ? 'สูงสุด 200 สมาชิก'    : 'Up to 200 members' },
        { tier: 'Starter',  price: '590',  limit: loc === 'th' ? 'สูงสุด 1,000 สมาชิก'  : 'Up to 1,000 members' },
        { tier: 'Growth',   price: '1290', limit: loc === 'th' ? 'สูงสุด 5,000 สมาชิก'  : 'Up to 5,000 members' },
        { tier: 'Business', price: '2490', limit: loc === 'th' ? 'สมาชิกไม่จำกัด'       : 'Unlimited members' },
      ].map((o) => ({
        '@type': 'Offer',
        name: o.tier,
        description: o.limit,
        price: o.price,
        priceCurrency: 'THB',
        availability: 'https://schema.org/InStock',
      })),
    },
  ],
}, null, 2);

function buildScript(loc) {
  const p = PRICING[loc];
  return `  <script>
    /* Billing toggle. Copy is baked per locale at build time — see build.mjs. */
    (function () {
      var isAnnual = false;
      var MO = ${JSON.stringify(p.mo)};
      var D = ${JSON.stringify(p.tiers)};
      var track = document.getElementById('billing-toggle');

      function updatePricing() {
        Object.keys(D).forEach(function (t) {
          var priceEl = document.getElementById('pp-' + t + '-price');
          var noteEl = document.getElementById('pa-' + t);
          if (!priceEl || !noteEl) return;
          priceEl.innerHTML = (isAnnual ? D[t].annual : D[t].monthly) + ' <span>' + MO + '</span>';
          noteEl.textContent = isAnnual ? '' : D[t].note;
        });
        if (track) track.classList.toggle('annual', isAnnual);
      }

      if (track) {
        track.setAttribute('aria-pressed', 'false');
        track.addEventListener('click', function () {
          isAnnual = !isAnnual;
          track.setAttribute('aria-pressed', String(isAnnual));
          updatePricing();
        });
      }
      updatePricing();
    })();
  </script>`;
}

/* ── build one locale ─────────────────────────────────────────────── */
function build(loc) {
  const L = LOCALES[loc];
  let html = src;
  let hits = 0, misses = [];

  for (const [id, value] of Object.entries(T[loc])) {
    const r = setInner(html, id, value);
    html = r.html;
    r.hit ? hits++ : misses.push(id);
  }

  html = html.replace('<!--STYLES-->', CSS);
  html = html.replace(/\{\{PRIVACY\}\}/g, urlFor(loc, 'privacy'));
  html = html.replace(/\{\{TERMS\}\}/g, urlFor(loc, 'terms'));
  html = html.replace('<html lang="en">', `<html lang="${loc}">`);

  /* head: canonical, hreflang cluster, per-locale metadata */
  const alts = Object.entries(LOCALES)
    .map(([k, v]) => `  <link rel="alternate" hreflang="${k}" href="${SITE}${v.path}" />`)
    .join('\n');
  html = html.replace(
    /  <link rel="canonical"[^>]*\/>/,
    `  <link rel="canonical" href="${SITE}${L.path}" />\n` +
      alts + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}${LOCALES.th.path}" />`
  );
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${L.title}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${L.description}$2`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${L.ogTitle}$2`);
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${L.ogTitle}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${L.ogDescription}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${L.ogDescription}$2`);
  html = html.replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${L.imageAlt}$2`);
  html = html.replace(/(<meta name="twitter:image:alt" content=")[^"]*(")/, `$1${L.imageAlt}$2`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${SITE}${L.path}$2`);
  html = html.replace(/(<meta property="og:locale" content=")[^"]*(")/, `$1${L.ogLocale}$2`);
  html = html.replace(
    /(<meta property="og:locale:alternate" content=")[^"]*(")/,
    `$1${LOCALES[loc === 'th' ? 'en' : 'th'].ogLocale}$2`
  );
  html = html.replace('</head>', `\n  <script type="application/ld+json">\n${jsonld(loc)}\n  </script>\n</head>`);

  /* the language switch is now a link between two URLs, not a JS swap */
  html = html.replace(
    /<button class="lang-btn" id="lang-btn"[^>]*>[^<]*<\/button>/,
    `<a class="lang-btn" id="lang-btn" href="${L.switchTo.href}" hreflang="${L.switchTo.hreflang}">${L.switchTo.label}</a>`
  );
  html = html.replace('<a href="/" class="logo">', `<a href="${L.path}" class="logo">`);

  /* swap the whole runtime i18n block for a locale-baked one */
  const sStart = html.indexOf('  <script>\n    const T = {');
  const sEnd = html.indexOf('</script>', sStart) + '</script>'.length;
  if (sStart === -1) throw new Error('could not locate the runtime script block');
  html = html.slice(0, sStart) + buildScript(loc) + html.slice(sEnd);

  if (L.out.includes('/')) mkdirSync(L.out.split('/')[0], { recursive: true });
  writeFileSync(L.out, html);
  console.log(
    `  ${L.out.padEnd(16)} ${String(hits).padStart(3)} strings` +
      (misses.length ? `  (${misses.length} unused: ${misses.slice(0, 4).join(', ')}${misses.length > 4 ? '…' : ''})` : '')
  );
}

function buildLegal(name, loc) {
  const L = LOCALES[loc], meta = LEGAL[name][loc], slug = LEGAL[name].slug, nav = NAV[loc];
  const body = readFileSync(`src/content/${name}.${loc}.html`, 'utf8').replace(/\n$/, '');
  const other = loc === 'th' ? 'en' : 'th';

  const alts = Object.keys(LOCALES)
    .map((k) => `  <link rel="alternate" hreflang="${k}" href="${SITE}${urlFor(k, slug)}" />`)
    .join('\n');

  let html = legalShell
    .replace('<!--STYLES-->', CSS)
    .replace('<html lang="en">', `<html lang="${loc}">`)
    .replace('{{TITLE}}', meta.title)
    .replace('{{DESC}}', meta.desc)
    .replace('{{BODY}}', body)
    .replace('{{CTA}}', nav.cta)
    .replace('{{NAV_HOME}}', nav.home)
    .replace('{{NAV_PRIVACY}}', nav.privacy)
    .replace('{{NAV_TERMS}}', nav.terms)
    .replace('{{NAV_CONTACT}}', nav.contact)
    .replace('<!--LANGBTN-->', `<a class="lang-btn" href="${urlFor(other, slug)}" hreflang="${other}">${nav.other}</a>`)
    .replace('<!--HEADLINKS-->',
      `<link rel="canonical" href="${SITE}${urlFor(loc, slug)}" />\n` + alts +
      `\n  <link rel="alternate" hreflang="x-default" href="${SITE}${urlFor('th', slug)}" />`)
    .replace(/\{\{HOME\}\}/g, urlFor(loc, ''))
    .replace(/\{\{PRIVACY\}\}/g, urlFor(loc, 'privacy'))
    .replace(/\{\{TERMS\}\}/g, urlFor(loc, 'terms'));

  const out = loc === 'th' ? `${slug}.html` : `en/${slug}.html`;
  if (out.includes('/')) mkdirSync(out.split('/')[0], { recursive: true });
  writeFileSync(out, html);
  const fills = (body.match(/class="fill"/g) || []).length;
  console.log(`  ${out.padEnd(16)} ${String(body.split('\n').length).padStart(3)} lines` +
    (fills ? `  (${fills} fields still to fill in)` : ''));
}

console.log('building:');
Object.keys(LOCALES).forEach(build);
for (const name of Object.keys(LEGAL)) for (const loc of Object.keys(LOCALES)) buildLegal(name, loc);

/* ── crawl files ──────────────────────────────────────────────────── */
const lastmod = new Date().toISOString().slice(0, 10);
writeFileSync('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

const altBlock = (slug) =>
  Object.keys(LOCALES)
    .map((k) => `    <xhtml:link rel="alternate" hreflang="${k}" href="${SITE}${urlFor(k, slug)}" />`)
    .join('\n') +
  `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${urlFor('th', slug)}" />`;

const entries = [];
for (const slug of PAGES) {
  for (const loc of Object.keys(LOCALES)) {
    entries.push(`  <url>
    <loc>${SITE}${urlFor(loc, slug)}</loc>
${altBlock(slug)}
    <lastmod>${lastmod}</lastmod>
    <changefreq>${slug ? 'yearly' : 'weekly'}</changefreq>
    <priority>${slug ? '0.3' : loc === 'th' ? '1.0' : '0.8'}</priority>
  </url>`);
  }
}

writeFileSync(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`
);
console.log(`  robots.txt\n  sitemap.xml      ${entries.length} urls, lastmod ${lastmod}`);
