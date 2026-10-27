const fs = require("fs");
const path = require("path");

// Verified reviews: one per (product, Stripe checkout session). Stored as Supabase site_settings rows
// keyed "review:<productId>:<sessionId>", a KV hash, or data/reviews.json locally.
const KEY_PREFIX = "review:";
const KV_HASH = "aura-society-reviews";
const localPath = path.join(__dirname, "..", "data", "reviews.json");

// ---- Stripe purchase verification ----

async function getVerifiedPurchase(sessionId) {
  const id = String(sessionId || "").trim();
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return null;

  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) throw new Error("Reviews need STRIPE_SECRET_KEY to verify orders.");

  const headers = { Authorization: `Bearer ${secretKey}` };
  const sessionResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, { headers });
  if (!sessionResponse.ok) return null;

  const session = await sessionResponse.json();
  if (session.payment_status !== "paid") return null;

  const itemsResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}/line_items?limit=100&expand[]=data.price.product`, { headers });
  if (!itemsResponse.ok) return null;

  const items = ((await itemsResponse.json()).data || [])
    .map((item) => ({
      productId: String(item.price?.product?.metadata?.product_id || ""),
      name: String(item.description || item.price?.product?.name || "Fragrance")
    }))
    .filter((item) => item.productId);

  return {
    sessionId: id,
    customerName: session.customer_details?.name || session.metadata?.customer_name || "",
    purchasedAt: new Date(Number(session.created || 0) * 1000).toISOString(),
    items
  };
}

// ---- Review shape ----

function normalizeReviewInput(input, purchase) {
  const rating = Math.round(Number(input.rating));
  const productId = String(input.productId || "");
  const item = purchase.items.find((entry) => entry.productId === productId);
  if (!item) return { error: "This fragrance isn't part of that order." };
  if (!(rating >= 1 && rating <= 5)) return { error: "Choose a rating from 1 to 5 stars." };

  const body = String(input.body || "").trim().slice(0, 2000);
  if (body.length < 10) return { error: "Write at least a sentence about the scent." };

  return {
    review: {
      productId,
      sessionId: purchase.sessionId,
      productName: item.name,
      rating,
      title: String(input.title || "").trim().slice(0, 120),
      body,
      name: displayName(input.name || purchase.customerName),
      verified: true,
      hidden: false,
      createdAt: new Date().toISOString()
    }
  };
}

function displayName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Verified buyer";
  const first = parts[0].slice(0, 40);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first;
}

// What shoppers see: no session IDs.
function publicReview(review) {
  return {
    rating: review.rating,
    title: review.title,
    body: review.body,
    name: review.name,
    verified: Boolean(review.verified),
    createdAt: review.createdAt
  };
}

function summarize(reviews) {
  const visible = reviews.filter((review) => !review.hidden);
  const summary = {};
  visible.forEach((review) => {
    const entry = summary[review.productId] || { count: 0, total: 0 };
    entry.count += 1;
    entry.total += review.rating;
    summary[review.productId] = entry;
  });
  Object.values(summary).forEach((entry) => {
    entry.average = Math.round((entry.total / entry.count) * 10) / 10;
    delete entry.total;
  });
  return summary;
}

// ---- Storage ----

function reviewKey(review) {
  return `${KEY_PREFIX}${review.productId}:${review.sessionId}`;
}

async function saveReview(review) {
  if (hasSupabaseConfig()) {
    const response = await fetch(supabaseRestUrl(), {
      method: "POST",
      headers: { ...supabaseHeaders(), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key: reviewKey(review), value: review, updated_at: new Date().toISOString() })
    });
    if (!response.ok) throw new Error("Review could not be saved.");
    return;
  }

  if (hasKvConfig()) {
    await kvCommand(["HSET", KV_HASH, reviewKey(review), JSON.stringify(review)]);
    return;
  }

  if (process.env.VERCEL) throw new Error("Reviews need Supabase or KV environment variables on Vercel.");

  const reviews = readLocalReviews().filter((entry) => reviewKey(entry) !== reviewKey(review));
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, `${JSON.stringify([...reviews, review], null, 2)}\n`);
}

async function listReviews(productId) {
  const prefix = productId ? `${KEY_PREFIX}${productId}:` : KEY_PREFIX;
  let reviews = [];

  if (hasSupabaseConfig()) {
    const response = await fetch(`${supabaseRestUrl()}?key=like.${encodeURIComponent(prefix)}*&select=value`, { headers: supabaseHeaders() });
    if (!response.ok) throw new Error("Reviews could not load.");
    reviews = (await response.json()).map((row) => row.value);
  } else if (hasKvConfig()) {
    const flat = (await kvCommand(["HGETALL", KV_HASH])) || [];
    for (let index = 0; index < flat.length; index += 2) {
      if (!String(flat[index]).startsWith(prefix)) continue;
      try {
        reviews.push(JSON.parse(flat[index + 1]));
      } catch {
        // Skip malformed rows.
      }
    }
  } else {
    reviews = readLocalReviews().filter((review) => reviewKey(review).startsWith(prefix));
  }

  return reviews.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function setReviewHidden(key, hidden) {
  const [, productId, sessionId] = String(key || "").split(":");
  const existing = (await listReviews(productId)).find((review) => review.sessionId === sessionId);
  if (!existing) return null;

  const updated = { ...existing, hidden: Boolean(hidden) };
  await saveReview(updated);
  return updated;
}

function readLocalReviews() {
  try {
    const data = JSON.parse(fs.readFileSync(localPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function kvCommand(command) {
  const response = await fetch(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "KV request failed.");
  return data.result;
}

function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function hasKvConfig() {
  return Boolean((process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) && (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN));
}

function supabaseRestUrl() {
  const table = process.env.SUPABASE_PRODUCTS_TABLE || "site_settings";
  return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(table)}`;
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

module.exports = {
  getVerifiedPurchase,
  normalizeReviewInput,
  publicReview,
  summarize,
  reviewKey,
  saveReview,
  listReviews,
  setReviewHidden
};
