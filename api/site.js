const fs = require("fs");
const path = require("path");

const SITE_KEY = "aura-society-site";
const catalogPath = path.join(process.cwd(), "catalog", "site.json");

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

module.exports = async function handler(request, response) {
  applyCors(response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  try {
    if (request.method === "GET" || request.method === "HEAD") {
      sendJson(response, 200, { site: await readSite() });
      return;
    }

    if (request.method === "PUT") {
      const payload = await readPayload(request);
      const site = normalizeSite(payload.site || payload);
      await writeSite(site);
      sendJson(response, 200, { site });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Site content could not save." });
  }
};

async function readSite() {
  if (hasSupabaseConfig()) {
    const site = await readSupabaseSite();
    if (site) return site;

    const catalogSite = readCatalogSite();
    await writeSupabaseSite(catalogSite);
    return catalogSite;
  }

  if (hasKvConfig()) {
    const stored = await kvCommand(["GET", SITE_KEY]);
    if (stored) {
      try {
        return normalizeSite(JSON.parse(stored));
      } catch {
        return readCatalogSite();
      }
    }

    const site = readCatalogSite();
    await writeSite(site);
    return site;
  }

  return readCatalogSite();
}

async function writeSite(site) {
  if (hasSupabaseConfig()) {
    await writeSupabaseSite(site);
    return;
  }

  if (hasKvConfig()) {
    await kvCommand(["SET", SITE_KEY, JSON.stringify(site)]);
    return;
  }

  throw new Error("Site editing on Vercel requires Supabase env vars or KV_REST_API_URL and KV_REST_API_TOKEN.");
}

async function readSupabaseSite() {
  const response = await fetch(`${getSupabaseRestUrl()}?key=eq.${encodeURIComponent(SITE_KEY)}&select=value`, {
    headers: getSupabaseHeaders()
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Supabase site content could not load.");
  }

  const value = Array.isArray(data) && data[0] ? data[0].value : null;
  return value ? normalizeSite(value) : null;
}

async function writeSupabaseSite(site) {
  const response = await fetch(getSupabaseRestUrl(), {
    method: "POST",
    headers: {
      ...getSupabaseHeaders(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      key: SITE_KEY,
      value: site,
      updated_at: new Date().toISOString()
    })
  });
  const text = await response.text();

  if (!response.ok) {
    try {
      const data = JSON.parse(text);
      throw new Error(data.message || "Supabase site content could not save.");
    } catch (error) {
      throw new Error(error.message || text || "Supabase site content could not save.");
    }
  }
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

function readCatalogSite() {
  try {
    return normalizeSite(JSON.parse(fs.readFileSync(catalogPath, "utf8")));
  } catch {
    return defaultSite;
  }
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
      if (text.length > 12_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => resolve(text));
    request.on("error", reject);
  });

  return body ? JSON.parse(body) : {};
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

function sanitize(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
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
