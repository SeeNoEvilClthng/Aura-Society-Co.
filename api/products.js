const fs = require("fs");
const path = require("path");

const PRODUCT_KEY = "aura-society-products";
const catalogPath = path.join(process.cwd(), "catalog", "products.json");

module.exports = async function handler(request, response) {
  applyCors(response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  try {
    if (request.method === "GET" || request.method === "HEAD") {
      sendJson(response, 200, { products: await readProducts() });
      return;
    }

    if (request.method === "PUT") {
      const payload = await readPayload(request);
      const products = Array.isArray(payload.products) ? payload.products : payload;

      if (!Array.isArray(products)) {
        sendJson(response, 400, { error: "Products must be an array." });
        return;
      }

      const normalizedProducts = products.map(normalizeProduct);
      await writeProducts(normalizedProducts);
      sendJson(response, 200, { products: normalizedProducts });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Products could not save." });
  }
};

async function readProducts() {
  if (hasKvConfig()) {
    const stored = await kvCommand(["GET", PRODUCT_KEY]);
    if (stored) {
      try {
        const products = JSON.parse(stored);
        return Array.isArray(products) ? products.map(normalizeProduct) : readCatalogProducts();
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
  if (!hasKvConfig()) {
    throw new Error("Product saving on Vercel requires KV_REST_API_URL and KV_REST_API_TOKEN environment variables.");
  }

  await kvCommand(["SET", PRODUCT_KEY, JSON.stringify(products)]);
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
      if (text.length > 12_000_000) {
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
    image: sanitize(product.image, 10_000_000)
  };
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
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, data) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(data));
}
