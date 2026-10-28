const fs = require("fs");
const path = require("path");

// VIP subscribers are stored one row per email so concurrent signups never overwrite each other:
// Supabase site_settings rows keyed "subscriber:<email>", a KV hash, or data/subscribers.json locally.
const KEY_PREFIX = "subscriber:";
const KV_HASH = "aura-society-subscribers";
const localPath = path.join(__dirname, "..", "data", "subscribers.json");

function normalizeSubscriber(input) {
  const email = String(input.email || "").trim().toLowerCase().slice(0, 254);
  const phone = String(input.phone || "").replace(/[^\d+]/g, "").slice(0, 20);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  return {
    email,
    phone,
    source: String(input.source || "homepage").slice(0, 40),
    createdAt: new Date().toISOString()
  };
}

async function saveSubscriber(subscriber) {
  // Try each store in turn so a paused database never loses a signup; as a last
  // resort the signup is emailed to the store owner.
  if (hasSupabaseConfig()) {
    try {
      const response = await fetch(supabaseRestUrl(), {
        method: "POST",
        headers: {
          ...supabaseHeaders(),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify({ key: `${KEY_PREFIX}${subscriber.email}`, value: subscriber, updated_at: subscriber.createdAt })
      });
      if (response.ok) return;
    } catch {}
  }

  if (hasKvConfig()) {
    try {
      await kvCommand(["HSET", KV_HASH, subscriber.email, JSON.stringify(subscriber)]);
      return;
    } catch {}
  }

  if (process.env.VERCEL) {
    if (await emailSubscriberToOwner(subscriber)) return;
    throw new Error("Signup could not be saved. Please try again.");
  }

  const subscribers = readLocalSubscribers().filter((entry) => entry.email !== subscriber.email);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, `${JSON.stringify([...subscribers, subscriber], null, 2)}\n`);
}

async function listSubscribers() {
  let subscribers = [];

  if (hasSupabaseConfig()) {
    const response = await fetch(`${supabaseRestUrl()}?key=like.${encodeURIComponent(KEY_PREFIX)}*&select=value`, {
      headers: supabaseHeaders()
    });
    if (!response.ok) throw new Error("Subscribers could not load.");
    subscribers = (await response.json()).map((row) => row.value);
  } else if (hasKvConfig()) {
    const flat = (await kvCommand(["HGETALL", KV_HASH])) || [];
    for (let index = 1; index < flat.length; index += 2) {
      try {
        subscribers.push(JSON.parse(flat[index]));
      } catch {
        // Skip malformed rows.
      }
    }
  } else {
    subscribers = readLocalSubscribers();
  }

  return subscribers.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function readLocalSubscribers() {
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

async function emailSubscriberToOwner(subscriber) {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ORDER_NOTIFICATION_FROM || "Aura Society Co <onboarding@resend.dev>",
        to: [process.env.ORDER_NOTIFICATION_EMAIL || "xswann07@gmail.com"],
        subject: `New VIP signup: ${subscriber.email}`,
        text: [
          "A shopper joined the Aura Society VIP list.",
          "",
          `Email: ${subscriber.email}`,
          subscriber.phone ? `Phone: ${subscriber.phone}` : "",
          `Signed up from: ${subscriber.source}`,
          `Time: ${subscriber.createdAt}`,
          "",
          "(Sent by email because the subscriber database is unavailable. Restore Supabase to keep a list in Admin.)"
        ].filter(Boolean).join("\n")
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

function getWelcomeOffer() {
  const code = String(process.env.WELCOME_PROMO_CODE || "").trim();
  return code ? { code, text: String(process.env.WELCOME_OFFER_TEXT || "Use this code at checkout on your first order.").trim() } : null;
}

module.exports = { normalizeSubscriber, saveSubscriber, listSubscribers, getWelcomeOffer };
