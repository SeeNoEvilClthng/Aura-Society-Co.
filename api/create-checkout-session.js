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

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
    if (!stripeSecretKey) {
      sendJson(response, 500, { error: "Stripe is missing STRIPE_SECRET_KEY in Vercel environment variables." });
      return;
    }

    const payload = await readPayload(request);
    const items = Array.isArray(payload.items) ? payload.items : [];
    const customer = payload.customer || {};
    const products = await readProducts();
    const checkoutItems = buildCheckoutItems(items, products);
    const subtotalCents = checkoutItems.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
    const shippingOptions = buildShippingOptions(subtotalCents, payload.shippingMethod);

    if (!checkoutItems.length) {
      sendJson(response, 400, { error: "Cart is empty." });
      return;
    }

    if (checkoutItems.length > 100) {
      sendJson(response, 400, { error: "Stripe Checkout supports up to 100 line items." });
      return;
    }

    const siteUrl = getSiteUrl(request);
    const params = new URLSearchParams();
    params.set("mode", "payment");
    // Do not set payment_method_types here. Stripe Checkout will show eligible
    // methods enabled in the Stripe Dashboard, such as cards, Cash App Pay,
    // PayPal, wallets, Link, and buy-now-pay-later options where available.
    params.set("billing_address_collection", "required");
    params.set("phone_number_collection[enabled]", "true");
    params.set("allow_promotion_codes", "true");
    params.set("success_url", `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`);
    params.set("cancel_url", `${siteUrl}/index.html`);
    params.set("shipping_address_collection[allowed_countries][0]", "US");
    params.set("metadata[customer_name]", sanitize(customer.name, 120));
    params.set("metadata[shipping_address]", sanitize(customer.address, 450));
    params.set("metadata[shipping_method]", shippingOptions[0].key);

    if (process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION) {
      params.set("payment_method_configuration", process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION);
    }

    if (isEmail(customer.email)) {
      params.set("customer_email", customer.email.trim());
    }

    checkoutItems.forEach((item, index) => {
      params.set(`line_items[${index}][quantity]`, String(item.quantity));
      if (item.product.stripePriceId) {
        params.set(`line_items[${index}][price]`, item.product.stripePriceId);
      } else {
        params.set(`line_items[${index}][price_data][currency]`, "usd");
        params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmount));
        params.set(`line_items[${index}][price_data][product_data][name]`, item.product.size ? `${item.product.name} - ${item.product.size}` : item.product.name);
        params.set(`line_items[${index}][price_data][product_data][description]`, item.product.description || item.product.notes || item.product.collection);
        params.set(`line_items[${index}][price_data][product_data][metadata][product_id]`, item.product.id);
      }
    });

    shippingOptions.forEach((option, index) => {
      params.set(`shipping_options[${index}][shipping_rate_data][type]`, "fixed_amount");
      params.set(`shipping_options[${index}][shipping_rate_data][fixed_amount][amount]`, String(option.amount));
      params.set(`shipping_options[${index}][shipping_rate_data][fixed_amount][currency]`, "usd");
      params.set(`shipping_options[${index}][shipping_rate_data][display_name]`, option.name);
      params.set(`shipping_options[${index}][shipping_rate_data][delivery_estimate][minimum][unit]`, "business_day");
      params.set(`shipping_options[${index}][shipping_rate_data][delivery_estimate][minimum][value]`, String(option.minDays));
      params.set(`shipping_options[${index}][shipping_rate_data][delivery_estimate][maximum][unit]`, "business_day");
      params.set(`shipping_options[${index}][shipping_rate_data][delivery_estimate][maximum][value]`, String(option.maxDays));
    });

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
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
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Stripe checkout could not start." });
  }
};

async function readPayload(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const body = await new Promise((resolve, reject) => {
    let text = "";
    request.on("data", (chunk) => {
      text += chunk;
      if (text.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => resolve(text));
    request.on("error", reject);
  });

  return body ? JSON.parse(body) : {};
}

function buildCheckoutItems(items, products) {
  return items.map((item) => {
    const product = products.find((entry) => entry.id === sanitize(item.id, 120));
    if (!product) return null;

    const quantity = clampInteger(item.quantity, 1, 999999);
    const unitAmount = Math.round(Number(product.price) * 100);
    if (!product.name || !Number.isFinite(unitAmount) || unitAmount < 0) return null;

    return { product, quantity, unitAmount };
  }).filter(Boolean);
}

function buildShippingOptions(subtotalCents, preferredMethod) {
  const isFreeEligible = subtotalCents >= 10_000;
  const standard = {
    key: isFreeEligible ? "free_standard" : "standard",
    name: isFreeEligible ? "Free standard shipping" : "Standard shipping",
    amount: isFreeEligible ? 0 : 1000,
    minDays: 3,
    maxDays: 7
  };
  const express = {
    key: "express",
    name: "Express shipping",
    amount: 1500,
    minDays: 1,
    maxDays: 3
  };
  const options = [standard, express];
  const preferred = options.find((option) => option.key === preferredMethod || (preferredMethod === "standard" && option.key === "free_standard"));

  if (!preferred) return options;
  return [preferred, ...options.filter((option) => option.key !== preferred.key)];
}

async function readProducts() {
  if (hasSupabaseConfig()) {
    const products = await readSupabaseProducts();
    if (products.length) return products;
  }

  if (hasKvConfig()) {
    const stored = await kvCommand(["GET", PRODUCT_KEY]);
    if (stored) {
      try {
        const products = JSON.parse(stored);
        if (Array.isArray(products)) return products.map(normalizeProduct);
      } catch {
        return readCatalogProducts();
      }
    }
  }

  return readCatalogProducts();
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

async function kvCommand(command) {
  const response = await fetch(getKvUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKvToken()}`,
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

function normalizeProduct(product) {
  return {
    id: sanitize(product.id, 120),
    name: sanitize(product.name, 140),
    brand: sanitize(product.brand, 140),
    price: Number.isFinite(Number(product.price)) ? Number(product.price) : 0,
    size: sanitize(product.size, 60),
    family: sanitize(product.family, 80),
    collection: sanitize(product.collection, 120) || "Signature Collection",
    notes: sanitize(product.notes, 240),
    description: sanitize(product.description, 600),
    stock: clampInteger(product.stock, 0, 999999),
    stripePriceId: sanitize(product.stripePriceId, 120)
  };
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

function getSiteUrl(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  const host = request.headers["x-forwarded-host"] || request.headers.host;
  const protocol = request.headers["x-forwarded-proto"] || "https";
  return `${protocol}://${host}`;
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

function applyCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, data) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(data));
}
