const fs = require("fs");
const path = require("path");

const PRODUCT_KEY = "aura-society-products";
const catalogPath = path.join(process.cwd(), "catalog", "products.json");
const MAX_REQUEST_BODY_BYTES = 100_000_000;

module.exports = async function handler(request, response) {
  applyCors(response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  try {
    if (request.method === "GET" || request.method === "HEAD") {
      const requestUrl = new URL(request.url, "http://localhost");
      const products = await readProducts();
      sendJson(response, 200, { products: shouldIncludeImages(requestUrl) ? products : stripProductImages(products) });
      return;
    }

    if (request.method === "POST") {
      const payload = await readPayload(request);
      const product = await syncStripeCatalogProduct(normalizeProduct(payload.product || payload));
      const products = upsertProduct(await readProducts(), product);

      await writeProducts(products);
      sendJson(response, 200, { product, products });
      return;
    }

    if (request.method === "PUT") {
      const payload = await readPayload(request);
      const products = Array.isArray(payload.products) ? payload.products : payload;

      if (!Array.isArray(products)) {
        sendJson(response, 400, { error: "Products must be an array." });
        return;
      }

      const normalizedProducts = dedupeProducts(products.map(normalizeProduct));
      await writeProducts(normalizedProducts);
      sendJson(response, 200, { products: normalizedProducts });
      return;
    }

    if (request.method === "DELETE") {
      const requestUrl = new URL(request.url, "http://localhost");
      const productId = sanitize(requestUrl.searchParams.get("id"), 120);
      const products = await readProducts();
      const product = products.find((entry) => entry.id === productId);

      if (!product) {
        sendJson(response, 404, { error: "Product not found." });
        return;
      }

      const updatedProducts = removeProduct(products, product);
      await writeProducts(updatedProducts);
      sendJson(response, 200, { products: updatedProducts });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Products could not save." });
  }
};

async function readProducts() {
  if (hasSupabaseConfig()) {
    const products = await readSupabaseProducts();
    const catalogProducts = readCatalogProducts();
    const mergedProducts = mergeCatalogProducts(products, catalogProducts);

    if (productsChanged(products, mergedProducts)) {
      await writeSupabaseProducts(mergedProducts);
    }

    return mergedProducts;
  }

  if (hasKvConfig()) {
    const stored = await kvCommand(["GET", PRODUCT_KEY]);
    if (stored) {
      try {
        const products = JSON.parse(stored);
        const normalizedProducts = Array.isArray(products) ? products.map(normalizeProduct) : [];
        const catalogProducts = readCatalogProducts();
        const mergedProducts = mergeCatalogProducts(normalizedProducts, catalogProducts);

        if (productsChanged(normalizedProducts, mergedProducts)) {
          await kvCommand(["SET", PRODUCT_KEY, JSON.stringify(mergedProducts)]);
        }

        return mergedProducts;
      } catch {
        return readCatalogProducts();
      }
    }

    const products = readCatalogProducts();
    await writeProducts(products);
    return products;
  }

  return readCatalogProducts();
}

async function writeProducts(products) {
  if (hasSupabaseConfig()) {
    await writeSupabaseProducts(products);
    return;
  }

  if (hasKvConfig()) {
    await kvCommand(["SET", PRODUCT_KEY, JSON.stringify(products)]);
    return;
  }

  throw new Error("Product saving on Vercel requires Supabase env vars or KV_REST_API_URL and KV_REST_API_TOKEN.");
}

async function readSupabaseProducts() {
  const response = await fetch(`${getSupabaseRestUrl()}?key=eq.${encodeURIComponent(PRODUCT_KEY)}&select=value`, {
    headers: getSupabaseHeaders()
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Supabase products could not load.");
  }

  const value = Array.isArray(data) && data[0] ? data[0].value : [];
  return Array.isArray(value) ? value.map(normalizeProduct) : [];
}

async function writeSupabaseProducts(products) {
  const response = await fetch(getSupabaseRestUrl(), {
    method: "POST",
    headers: {
      ...getSupabaseHeaders(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      key: PRODUCT_KEY,
      value: products,
      updated_at: new Date().toISOString()
    })
  });
  const text = await response.text();

  if (!response.ok) {
    try {
      const data = JSON.parse(text);
      throw new Error(data.message || "Supabase products could not save.");
    } catch (error) {
      throw new Error(error.message || text || "Supabase products could not save.");
    }
  }
}

async function kvCommand(command) {
  const url = getKvUrl();
  const token = getKvToken();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || "KV request failed.");
  }

  return data.result;
}

function readCatalogProducts() {
  try {
    const products = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    return Array.isArray(products) ? products.map(normalizeProduct) : [];
  } catch {
    return [];
  }
}

function shouldIncludeImages(requestUrl) {
  return requestUrl.searchParams.get("images") !== "0";
}

function stripProductImages(products) {
  return products.map(({ image, ...product }) => product);
}

function mergeCatalogProducts(products, catalogProducts) {
  if (!catalogProducts.length) {
    return products;
  }

  const catalogByKey = new Map(catalogProducts.map((product) => [getProductDuplicateKey(product), product]));
  const existingKeys = new Set();
  const mergedProducts = products.map((product) => {
    const key = getProductDuplicateKey(product);
    existingKeys.add(key);

    const catalogProduct = catalogByKey.get(key);
    if (!catalogProduct) return product;

    return {
      ...product,
      image: catalogProduct.image || product.image,
      notes: catalogProduct.notes || product.notes,
      description: catalogProduct.description || product.description
    };
  });
  const additions = catalogProducts.filter((product) => {
    const key = getProductDuplicateKey(product);
    if (!key || existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });

  return dedupeProducts([...mergedProducts, ...additions]);
}

function productsChanged(left, right) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function hasSupabaseConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

function getSupabaseRestUrl() {
  return `${getSupabaseUrl().replace(/\/$/, "")}/rest/v1/${encodeURIComponent(getSupabaseTable())}`;
}

function getSupabaseHeaders() {
  const key = getSupabaseKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`
  };
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || "";
}

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function getSupabaseTable() {
  return process.env.SUPABASE_PRODUCTS_TABLE || "site_settings";
}

function hasKvConfig() {
  return Boolean(getKvUrl() && getKvToken());
}

function getKvUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
}

function getKvToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
}

async function readPayload(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const body = await new Promise((resolve, reject) => {
    let text = "";
    request.on("data", (chunk) => {
      text += chunk;
      if (text.length > MAX_REQUEST_BODY_BYTES) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => resolve(text));
    request.on("error", reject);
  });

  return body ? JSON.parse(body) : {};
}

function normalizeProduct(product) {
  return {
    id: sanitize(product.id, 120) || `product-${Date.now().toString(36)}`,
    name: sanitize(product.name, 140),
    brand: sanitize(product.brand, 140),
    price: Number.isFinite(Number(product.price)) ? Number(product.price) : 0,
    size: sanitize(product.size, 60),
    family: sanitize(product.family, 80),
    collection: sanitize(product.collection, 120) || "Signature Collection",
    notes: sanitize(product.notes, 240),
    description: sanitize(product.description, 600),
    stock: clampInteger(product.stock, 0, 999999),
    image: sanitize(product.image, 10_000_000),
    stripeProductId: sanitize(product.stripeProductId, 120),
    stripePriceId: sanitize(product.stripePriceId, 120),
    stripeUnitAmount: clampInteger(product.stripeUnitAmount, 0, 999999999)
  };
}

function dedupeProducts(products) {
  const seen = new Set();
  return products.filter((product) => {
    const key = getProductDuplicateKey(product);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function upsertProduct(products, product) {
  const duplicateKey = getProductDuplicateKey(product);
  const existing = products.find((entry) => entry.id === product.id || getProductDuplicateKey(entry) === duplicateKey);
  if (!existing) {
    return [product, ...products];
  }

  return dedupeProducts(products
    .filter((entry) => getProductDuplicateKey(entry) !== duplicateKey || entry.id === existing.id)
    .map((entry) => entry.id === existing.id ? { ...product, id: existing.id } : entry));
}

function removeProduct(products, product) {
  const duplicateKey = getProductDuplicateKey(product);
  return products.filter((entry) => entry.id !== product.id && getProductDuplicateKey(entry) !== duplicateKey);
}

async function syncStripeCatalogProduct(product) {
  if (!getStripeSecretKey()) return product;

  const unitAmount = Math.round(Number(product.price) * 100);
  if (!Number.isFinite(unitAmount) || unitAmount < 0) return product;

  const stripeProduct = product.stripeProductId
    ? await updateStripeProduct(product)
    : await createStripeProduct(product);
  const stripePriceId = product.stripePriceId && product.stripeUnitAmount === unitAmount
    ? product.stripePriceId
    : await createStripePrice(stripeProduct.id, unitAmount);

  return {
    ...product,
    stripeProductId: stripeProduct.id,
    stripePriceId,
    stripeUnitAmount: unitAmount
  };
}

async function createStripeProduct(product) {
  const params = new URLSearchParams();
  params.set("name", product.size ? `${product.name} - ${product.size}` : product.name);
  params.set("description", product.description || product.notes || product.collection);
  params.set("metadata[product_id]", product.id);
  params.set("metadata[brand]", product.brand);
  params.set("metadata[collection]", product.collection);
  params.set("metadata[family]", product.family);

  return stripeRequest("/v1/products", params);
}

async function updateStripeProduct(product) {
  const params = new URLSearchParams();
  params.set("name", product.size ? `${product.name} - ${product.size}` : product.name);
  params.set("description", product.description || product.notes || product.collection);
  params.set("metadata[product_id]", product.id);
  params.set("metadata[brand]", product.brand);
  params.set("metadata[collection]", product.collection);
  params.set("metadata[family]", product.family);

  try {
    return await stripeRequest(`/v1/products/${encodeURIComponent(product.stripeProductId)}`, params);
  } catch {
    return createStripeProduct(product);
  }
}

async function createStripePrice(stripeProductId, unitAmount) {
  const params = new URLSearchParams();
  params.set("currency", "usd");
  params.set("unit_amount", String(unitAmount));
  params.set("product", stripeProductId);

  const price = await stripeRequest("/v1/prices", params);
  return price.id;
}

async function stripeRequest(pathname, params) {
  const response = await fetch(`https://api.stripe.com${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Stripe catalog sync failed.");
  }

  return data;
}

function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY || "";
}

function getProductDuplicateKey(product) {
  return [
    product.name,
    product.brand,
    product.size
  ].map((value) => String(value || "").trim().toLowerCase()).join("|");
}

function sanitize(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function clampInteger(value, min, max) {
  const integer = Math.trunc(Number(value));
  if (!Number.isFinite(integer)) return min;
  return Math.min(Math.max(integer, min), max);
}

function applyCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, POST, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, data) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(data));
}
