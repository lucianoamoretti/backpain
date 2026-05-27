#!/usr/bin/env node
/**
 * CJ Dropshipping — Product Finder
 *
 * Usage:
 *   CJ_EMAIL=xxx CJ_API_KEY=yyy node scripts/find-products.js
 *   CJ_EMAIL=xxx CJ_API_KEY=yyy node scripts/find-products.js "back brace"
 */

const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

// Products we already found — will always fetch details for these
const KNOWN_PIDS = [
  '0F7E340F-1AC1-42AF-92E6-5D4005343233', // Adjustable Smart Back Posture Corrector
  '365F290E-04C2-41F7-ABE7-35D53B5C39C2', // Adjustable Posture Corrector Back Support Strap
  '37559219-6AB6-4237-965F-F3237A9E03A8', // Back Shoulder Spine Posture Corrector
  '1711665689041309696',                   // Unisex Anti-Humpback Chest Lift Brace
];

const QUERY   = process.argv[2] || 'posture corrector';
const TARGET  = 'IE'; // Ireland

// ── Auth ────────────────────────────────────────────────────────────────────
async function getToken() {
  const { CJ_EMAIL, CJ_API_KEY } = process.env;
  if (!CJ_EMAIL || !CJ_API_KEY) {
    console.error('\n❌  Missing env vars. Run with:\n');
    console.error('   CJ_EMAIL=your@email.com CJ_API_KEY=yourpassword node scripts/find-products.js\n');
    process.exit(1);
  }

  const res  = await fetch(`${BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CJ_EMAIL, password: CJ_API_KEY }),
  });
  const data = await res.json();
  if (!data.data?.accessToken) {
    console.error('❌  CJ auth failed:', JSON.stringify(data));
    process.exit(1);
  }
  return data.data.accessToken;
}

// ── Search ───────────────────────────────────────────────────────────────────
async function searchProducts(token, query) {
  const url = `${BASE}/product/list?productName=${encodeURIComponent(query)}&pageNum=1&pageSize=20`;
  const res  = await fetch(url, { headers: { 'CJ-Access-Token': token } });
  const data = await res.json();
  return data.data?.list || [];
}

// ── Product detail + variants ────────────────────────────────────────────────
async function getProduct(token, pid) {
  const res  = await fetch(`${BASE}/product/query?pid=${pid}`, {
    headers: { 'CJ-Access-Token': token },
  });
  const data = await res.json();
  return data.data || null;
}

// ── Shipping to Ireland ──────────────────────────────────────────────────────
async function getShipping(token, vid) {
  const res  = await fetch(`${BASE}/logistic/freightCalculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token },
    body: JSON.stringify({
      startCountryCode: 'CN',
      endCountryCode:   TARGET,
      quantity:         1,
      vid,
    }),
  });
  const data = await res.json();
  return data.data || [];
}

// ── Display helpers ──────────────────────────────────────────────────────────
function eur(cents) {
  return cents != null ? `€${(cents / 100).toFixed(2)}` : '—';
}

function printProduct(p, shipping) {
  const variants = p.variants || p.productVariantList || [];
  const hasEUStock = variants.some(v => v.variantStock > 0);

  console.log('\n' + '─'.repeat(72));
  console.log(`📦  ${p.productName}`);
  console.log(`    PID  : ${p.pid}`);
  console.log(`    Price: ${eur(p.sellPrice * 100)} — ${eur(p.sourcePrice * 100)} (source)`);
  console.log(`    URL  : https://cjdropshipping.com/product/p-${p.pid}.html`);
  console.log(`    EU   : ${hasEUStock ? '✅ EU Warehouse stock' : '⚠️  No EU warehouse — ships from CN'}`);

  if (variants.length) {
    console.log('\n    Variants (VID → size → price → stock):');
    variants.forEach(v => {
      const sizeProp = v.variantProperty?.find(p => /size/i.test(p.propertyName));
      const size     = sizeProp?.propertyValueName || v.variantKeyEn || v.variantName || '?';
      const price    = eur((v.variantSellPrice || v.variantSourcePrice || 0) * 100);
      const stock    = v.variantStock != null ? `${v.variantStock} units` : 'unknown';
      console.log(`      ${v.vid}  |  ${size.padEnd(6)}|  ${price.padEnd(8)}|  ${stock}`);
    });
  }

  if (shipping?.length) {
    console.log('\n    Shipping to Ireland 🇮🇪:');
    shipping.slice(0, 5).forEach(s => {
      const days  = s.time ? `${s.time} days` : '?';
      const cost  = s.logisticFee != null ? `€${s.logisticFee}` : '?';
      const track = s.trackType === 1 ? '📍 Tracked' : '';
      console.log(`      ${(s.logisticName || s.shippingMethod || '?').padEnd(28)} ${cost.padEnd(8)} ${days.padEnd(10)} ${track}`);
    });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔑  Authenticating with CJ Dropshipping...');
  const token = await getToken();
  console.log('✅  Authenticated\n');

  // 1. Search by query
  console.log(`🔍  Searching: "${QUERY}"...`);
  const results = await searchProducts(token, QUERY);
  console.log(`    Found ${results.length} results`);

  // Merge search results with our known PIDs (deduplicated)
  const allPids = [...new Set([
    ...KNOWN_PIDS,
    ...results.slice(0, 5).map(r => r.pid).filter(Boolean),
  ])];

  console.log(`\n📋  Fetching details for ${allPids.length} products...\n`);

  for (const pid of allPids) {
    try {
      const product = await getProduct(token, pid);
      if (!product) { console.log(`  ⚠️  No data for PID: ${pid}`); continue; }

      // Get shipping for first variant (representative)
      const firstVid = (product.variants || product.productVariantList || [])[0]?.vid;
      const shipping = firstVid ? await getShipping(token, firstVid) : [];

      printProduct(product, shipping);
    } catch (err) {
      console.log(`  ❌  Error for PID ${pid}: ${err.message}`);
    }
  }

  // Summary for .env
  console.log('\n' + '═'.repeat(72));
  console.log('📋  ENV VARS TO COPY (.env / Netlify dashboard)\n');
  for (const pid of allPids) {
    try {
      const product = await getProduct(token, pid);
      if (!product) continue;
      const variants = product.variants || product.productVariantList || [];
      variants.forEach(v => {
        const sizeProp = v.variantProperty?.find(p => /size/i.test(p.propertyName));
        const size     = (sizeProp?.propertyValueName || v.variantKeyEn || '').toUpperCase();
        if (['S','M','L','XL'].includes(size)) {
          console.log(`CJ_VID_${size}=${v.vid}   # ${product.productName}`);
        }
      });
    } catch { /* skip */ }
  }
  console.log('═'.repeat(72) + '\n');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
