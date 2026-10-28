// Google Analytics 4 (page views plus the shopping events ads optimize for).
// Pages load gtag.js from Google; this file sets it up and gives the store
// scripts one safe helper, auraTrack(), that never breaks the page.
const GA_MEASUREMENT_ID = "G-8GLJ2NQNQK";
const PENDING_PURCHASE_KEY = "auraSocietyPendingPurchase";

window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
gtag("js", new Date());
gtag("config", GA_MEASUREMENT_ID);

function gaItem(product, quantity = 1) {
  return {
    item_id: product.id,
    item_name: product.name,
    item_brand: product.brand,
    item_category: product.family || "Fragrance",
    item_variant: product.size,
    price: Number(product.price) || 0,
    quantity
  };
}

function auraTrack(eventName, params) {
  try {
    gtag("event", eventName, { currency: "USD", ...params });
  } catch {
    // Analytics must never interrupt shopping.
  }
}

// Checkout happens on Stripe, so the order is remembered here and reported as a
// purchase when the shopper lands back on success.html.
function rememberPendingPurchase(items, value) {
  try {
    localStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify({ items, value }));
  } catch {}
}

function reportPendingPurchase(transactionId) {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_PURCHASE_KEY) || "null");
    localStorage.removeItem(PENDING_PURCHASE_KEY);
    if (!pending || !transactionId) return;
    auraTrack("purchase", { transaction_id: transactionId, value: pending.value, items: pending.items });
  } catch {}
}
