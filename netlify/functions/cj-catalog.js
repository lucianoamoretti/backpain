/**
 * CJ Dropshipping Catalog Search
 * GET /.netlify/functions/cj-catalog?q=posture+corrector
 *
 * Returns: list of products with name, pid, variants (vid, size, price, stock),
 *          shipping options to Ireland, and EU warehouse availability.
 *
 * Requires env vars: CJ_EMAIL, CJ_API_KEY
 */

const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

const KNOWN_PIDS = [
  '0F7E340F-1AC1-42AF-92E6-5D4005343233',
  '365F290E-04C2-41F7-ABE7-35D53B5C39C2',
  '37559219-6AB6-4237-965F-F3237A9E03A8',
  '1711665689041309696',
];

async function cjGet(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'CJ-Access-Token': token },
  });
  return res.json();
}

async function cjPost(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getToken() {
  const res = await fetch(`${BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email:    process.env.CJ_EMAIL,
      password: process.env.CJ_API_KEY,
    }),
  });
  const data = await res.json();
  if (!data.data?.accessToken) throw new Error('CJ auth failed');
  return data.data.accessToken;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (!process.env.CJ_EMAIL || !process.env.CJ_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Missing CJ_EMAIL or CJ_API_KEY env vars' }),
    };
  }

  const query = event.queryStringParameters?.q || 'posture corrector';

  try {
    const token = await getToken();

    // Search + fetch known PIDs
    const searchData = await cjGet(
      `/product/list?productName=${encodeURIComponent(query)}&pageNum=1&pageSize=10`,
      token
    );
    const searchPids = (searchData.data?.list || []).map(p => p.pid).filter(Boolean);
    const allPids    = [...new Set([...KNOWN_PIDS, ...searchPids.slice(0, 5)])];

    const products = [];

    for (const pid of allPids) {
      try {
        const detail   = await cjGet(`/product/query?pid=${pid}`, token);
        const product  = detail.data;
        if (!product) continue;

        const variants = (product.variants || product.productVariantList || []).map(v => {
          const sizeProp = (v.variantProperty || []).find(p => /size/i.test(p.propertyName));
          return {
            vid:      v.vid,
            size:     sizeProp?.propertyValueName || v.variantKeyEn || v.variantName || '—',
            price:    v.variantSellPrice || v.variantSourcePrice || 0,
            stock:    v.variantStock,
            euStock:  v.warehouseList?.some(w => /DE|NL|EU/i.test(w.warehouseName) && w.stock > 0),
          };
        });

        // Get shipping for first variant
        let shipping = [];
        if (variants[0]?.vid) {
          const shipData = await cjPost('/logistic/freightCalculate', {
            startCountryCode: 'CN',
            endCountryCode:   'IE',
            quantity:         1,
            vid:              variants[0].vid,
          }, token);
          shipping = (shipData.data || []).slice(0, 5).map(s => ({
            method:  s.logisticName || s.shippingMethod,
            cost:    s.logisticFee,
            days:    s.time,
            tracked: s.trackType === 1,
          }));
        }

        products.push({
          pid,
          name:         product.productName,
          sellPrice:    product.sellPrice,
          sourcePrice:  product.sourcePrice,
          imageUrl:     product.productImageSet?.[0] || product.productImage,
          url:          `https://cjdropshipping.com/product/p-${pid}.html`,
          euWarehouse:  variants.some(v => v.euStock),
          variants,
          shipping,
        });
      } catch (err) {
        products.push({ pid, error: err.message });
      }
    }

    // Build env var recommendations
    const envVars = [];
    for (const p of products) {
      for (const v of p.variants || []) {
        const size = v.size?.toUpperCase();
        if (['S', 'M', 'L', 'XL'].includes(size)) {
          envVars.push({ key: `CJ_VID_${size}`, value: v.vid, product: p.name });
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ query, products, envVars }, null, 2),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
