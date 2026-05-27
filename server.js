const http = require("http");
const fs = require("fs");
const path = require("path");

loadEnv();

const PORT = Number(process.env.PORT || 4173);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const MAX_REQUEST_BODY_BYTES = 100_000_000;
const publicDir = __dirname;
const dataDir = path.join(__dirname, "data");
const productsPath = path.join(dataDir, "products.json");
const sitePath = path.join(dataDir, "site.json");
const catalogDir = path.join(__dirname, "catalog");
const catalogPath = path.join(catalogDir, "products.json");
const catalogSitePath = path.join(catalogDir, "site.json");

const sampleProducts = [
  {
    id: "aurora-veil",
    name: "Aurora Veil",
    brand: "Aura Society Co.",
    price: 86,
    size: "50 ml",
    family: "Floral",
    collection: "Signature Collection",
    notes: "Pear blossom, jasmine silk, white musk",
    description: "A clean floral with soft projection and a polished, airy finish.",
    stock: 18,
    image: ""
  },
  {
    id: "midnight-ember",
    name: "Midnight Ember",
    brand: "Aura Society Co.",
    price: 96,
    size: "50 ml",
    family: "Amber",
    collection: "Evening Reserve",
    notes: "Saffron, cedar, vanilla smoke",
    description: "Warm, resinous, and refined for evenings that linger.",
    stock: 9,
    image: ""
  },
  {
    id: "citrus-accord",
    name: "Citrus Accord",
    brand: "Aura Society Co.",
    price: 74,
    size: "30 ml",
    family: "Citrus",
    collection: "Daily Rituals",
    notes: "Bergamot, neroli, mineral woods",
    description: "Bright citrus with a dry woods base for everyday wear.",
    stock: 24,
    image: ""
  }
];

const defaultSite = {
  topBanner: "Free standard shipping on fragrance orders $100+ USD",
  navLinks: "New Arrivals, Best Sellers, Collections, Fragrance Oils, Gift Cards, Help",
  heroKicker: "New fragrance drop",
  heroTitle: "Aura Society Co. Signature Scents",
  heroSubtitle: "A bold fragrance marketplace for elevated oils, extrait sprays, and daily signature scents.",
  heroButton: "Shop the collection",
  featuredTitle: "Featured",
  featuredLinks: "Signature Collection, Evening Reserve, Daily Rituals, Fragrance Oils",
  collectionsTitle: "Collections",
  trendingTitle: "Trending",
  brandsTitle: "Scent Families",
  helpTitle: "Need help",
  vipTitle: "Become a VIP",
  vipText: "Subscribe to get early access to drops, exclusive offers, and fragrance restocks.",
  promoCards: [
    { label: "Just arrived", title: "Signature Collection", button: "Shop now", image: "" },
    { label: "Warm + bold", title: "Evening Reserve", button: "Shop now", image: "" },
    { label: "Everyday wear", title: "Daily Rituals", button: "Shop now", image: "" },
    { label: "Layer your aura", title: "Fragrance Oils", button: "Shop now", image: "" }
  ]
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (request, response) => {
  try {
    applyCors(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const requestUrl = new URL(request.url, SITE_URL);

    if (requestUrl.pathname === "/api/products") {
      await handleProducts(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/site") {
      await handleSite(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/create-checkout-session") {
      await createCheckoutSession(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Something went wrong." });
  }
});

server.listen(PORT, () => {
  ensureDataStore();
  console.log(`Aura Society Co. running at ${SITE_URL}`);
});

async function handleProducts(request, response) {
  const requestUrl = new URL(request.url, SITE_URL);

  if (request.method === "GET" || request.method === "HEAD") {
    sendJson(response, 200, { products: readProducts() });
    return;
  }

  if (request.method === "POST") {
    const payload = await readJson(request);
    const product = normalizeProduct(payload.product || payload);
    const products = upsertProduct(readProducts(), product);

    writeProducts(products);
    sendJson(response, 200, { product, products });
    return;
  }

  if (request.method === "PUT") {
    const payload = await readJson(request);
    const products = Array.isArray(payload.products) ? payload.products : payload;

    if (!Array.isArray(products)) {
      sendJson(response, 400, { error: "Products must be an array." });
      return;
    }

    writeProducts(dedupeProducts(products.map(normalizeProduct)));
    sendJson(response, 200, { products: readProducts() });
    return;
  }

  if (request.method === "DELETE") {
    const productId = sanitize(requestUrl.searchParams.get("id"), 120);
    const products = readProducts();
    const product = products.find((entry) => entry.id === productId);

    if (!product) {
      sendJson(response, 404, { error: "Product not found." });
      return;
    }

    writeProducts(removeProduct(products, product));
    sendJson(response, 200, { products: readProducts() });
    return;
  }

  sendJson(response, 405, { error: "Method not allowed." });
}

async function handleSite(request, response) {
  if (request.method === "GET" || request.method === "HEAD") {
    sendJson(response, 200, { site: readSite() });
    return;
  }

  if (request.method === "PUT") {
    const payload = await readJson(request);
    const site = payload.site || payload;

    writeSite(normalizeSite(site));
    sendJson(response, 200, { site: readSite() });
    return;
  }

  sendJson(response, 405, { error: "Method not allowed." });
}

async function createCheckoutSession(request, response) {
  if (!STRIPE_SECRET_KEY) {
    sendJson(response, 500, { error: "Stripe is missing STRIPE_SECRET_KEY in .env." });
    return;
  }

  const payload = await readJson(request);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const customer = payload.customer || {};

  if (!items.length) {
    sendJson(response, 400, { error: "Cart is empty." });
    return;
  }

  if (items.length > 100) {
    sendJson(response, 400, { error: "Stripe Checkout supports up to 100 line items." });
    return;
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  // Do not set payment_method_types here. Stripe Checkout will show eligible methods
  // enabled in the Stripe Dashboard, such as cards, Cash App Pay, PayPal, wallets,
  // Link, and buy-now-pay-later options where available.
  params.set("payment_method_collection", "always");
  params.set("billing_address_collection", "required");
  params.set("phone_number_collection[enabled]", "true");
  params.set("allow_promotion_codes", "true");
  params.set("success_url", `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${SITE_URL}/index.html`);
  params.set("shipping_address_collection[allowed_countries][0]", "US");
  params.set("metadata[customer_name]", sanitize(customer.name, 120));
  params.set("metadata[shipping_address]", sanitize(customer.address, 450));

  if (process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION) {
    params.set("payment_method_configuration", process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION);
  }

  if (isEmail(customer.email)) {
    params.set("customer_email", customer.email.trim());
  }

  items.forEach((item, index) => {
    const name = sanitize(item.name, 120);
    const size = sanitize(item.size, 40);
    const description = sanitize(item.description || item.notes || size, 240);
    const quantity = clampInteger(item.quantity, 1, 999999);
    const unitAmount = Math.round(Number(item.price) * 100);

    if (!name || !Number.isFinite(unitAmount) || unitAmount < 0) {
      throw new Error("Invalid checkout item.");
    }

    params.set(`line_items[${index}][quantity]`, String(quantity));
    params.set(`line_items[${index}][price_data][currency]`, "usd");
    params.set(`line_items[${index}][price_data][unit_amount]`, String(unitAmount));
    params.set(`line_items[${index}][price_data][product_data][name]`, size ? `${name} - ${size}` : name);
    params.set(`line_items[${index}][price_data][product_data][description]`, description);
  });

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const session = await stripeResponse.json();
  if (!stripeResponse.ok) {
    sendJson(response, stripeResponse.status, {
      error: session.error?.message || "Stripe could not create a Checkout Session."
    });
    return;
  }

  sendJson(response, 200, { url: session.url });
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, SITE_URL);
  const cleanPath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const filePath = path.normalize(path.join(publicDir, cleanPath));

  if (!filePath.startsWith(publicDir) || isBlockedStaticPath(cleanPath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    response.end(content);
  });
}

function isBlockedStaticPath(cleanPath) {
  const normalized = cleanPath.replace(/\\/g, "/");
  const blockedFiles = new Set([
    "/.env",
    "/.env.example",
    "/.gitignore",
    "/package.json",
    "/server.js"
  ]);

  return normalized.includes("/.") || normalized.startsWith("/data/") || blockedFiles.has(normalized);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_REQUEST_BODY_BYTES) {
        request.destroy();
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function applyCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, POST, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function ensureDataStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(productsPath)) {
    writeProducts(sampleProducts);
  }

  if (!fs.existsSync(sitePath)) {
    writeSite(defaultSite);
  }
}

function readProducts() {
  ensureDataStore();

  try {
    const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));
    return Array.isArray(products) ? products.map(normalizeProduct) : sampleProducts;
  } catch {
    writeProducts(sampleProducts);
    return sampleProducts;
  }
}

function writeProducts(products) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(catalogDir)) {
    fs.mkdirSync(catalogDir, { recursive: true });
  }

  const content = `${JSON.stringify(products, null, 2)}\n`;
  fs.writeFileSync(productsPath, content);
  fs.writeFileSync(catalogPath, content);
}

function readSite() {
  ensureDataStore();

  try {
    return normalizeSite(JSON.parse(fs.readFileSync(sitePath, "utf8")));
  } catch {
    writeSite(defaultSite);
    return defaultSite;
  }
}

function writeSite(site) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(catalogDir)) {
    fs.mkdirSync(catalogDir, { recursive: true });
  }

  const content = `${JSON.stringify(normalizeSite(site), null, 2)}\n`;
  fs.writeFileSync(sitePath, content);
  fs.writeFileSync(catalogSitePath, content);
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
    image: sanitize(product.image, 10_000_000)
  };
}

function normalizeSite(site) {
  const source = site && typeof site === "object" ? site : {};
  return {
    ...defaultSite,
    topBanner: sanitize(source.topBanner || defaultSite.topBanner, 160),
    navLinks: sanitize(source.navLinks || defaultSite.navLinks, 240),
    heroKicker: sanitize(source.heroKicker || defaultSite.heroKicker, 120),
    heroTitle: sanitize(source.heroTitle || defaultSite.heroTitle, 140),
    heroSubtitle: sanitize(source.heroSubtitle || defaultSite.heroSubtitle, 260),
    heroButton: sanitize(source.heroButton || defaultSite.heroButton, 80),
    featuredTitle: sanitize(source.featuredTitle || defaultSite.featuredTitle, 80),
    featuredLinks: sanitize(source.featuredLinks || defaultSite.featuredLinks, 240),
    collectionsTitle: sanitize(source.collectionsTitle || defaultSite.collectionsTitle, 80),
    trendingTitle: sanitize(source.trendingTitle || defaultSite.trendingTitle, 80),
    brandsTitle: sanitize(source.brandsTitle || defaultSite.brandsTitle, 80),
    helpTitle: sanitize(source.helpTitle || defaultSite.helpTitle, 80),
    vipTitle: sanitize(source.vipTitle || defaultSite.vipTitle, 80),
    vipText: sanitize(source.vipText || defaultSite.vipText, 260),
    promoCards: normalizePromoCards(source.promoCards)
  };
}

function normalizePromoCards(cards) {
  const sourceCards = Array.isArray(cards) ? cards : [];
  return defaultSite.promoCards.map((fallback, index) => {
    const card = sourceCards[index] && typeof sourceCards[index] === "object" ? sourceCards[index] : {};
    return {
      label: sanitize(card.label || fallback.label, 80),
      title: sanitize(card.title || fallback.title, 100),
      button: sanitize(card.button || fallback.button, 60),
      image: sanitize(card.image || fallback.image, 10_000_000)
    };
  });
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

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function clampInteger(value, min, max) {
  const integer = Math.trunc(Number(value));
  if (!Number.isFinite(integer)) return min;
  return Math.min(Math.max(integer, min), max);
}

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}
