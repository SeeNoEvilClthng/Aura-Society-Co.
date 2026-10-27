const crypto = require("crypto");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const rawBody = await readRawBody(request);
    const event = verifyStripeEvent(rawBody, request.headers["stripe-signature"]);

    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object, request);
    }

    if (event.type === "checkout.session.expired") {
      // A missed reminder isn't worth a Stripe retry storm; log and acknowledge.
      try {
        await sendCartRecoveryEmail(event.data.object);
      } catch (error) {
        console.error("Cart recovery email failed:", error.message);
      }
    }

    sendJson(response, 200, { received: true });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Webhook failed." });
  }
};

async function handleCheckoutCompleted(session, request) {
  // On a shared Stripe account this endpoint also receives the other business's
  // checkouts; only orders tagged by create-checkout-session belong to this store.
  if (session.metadata?.store !== "aura-society") return;
  if (!getResendApiKey()) return;

  const lineItems = await fetchStripeLineItems(session.id);
  const orderSummary = lineItems.length
    ? lineItems.map((item) => `- ${item.quantity} x ${item.description || item.price?.product?.name || "Fragrance"} (${formatAmount(item.amount_total, item.currency)})`).join("\n")
    : "- Stripe order received. Open Stripe Dashboard for line items.";
  const customerName = session.customer_details?.name || session.metadata?.customer_name || "Customer";
  const customerEmail = session.customer_details?.email || session.customer_email || "No email";
  const total = formatAmount(session.amount_total, session.currency);

  await sendOrderEmail({
    subject: `New Aura Society Co. order - ${total}`,
    text: [
      "New order placed on Aura Society Co.",
      "",
      `Customer: ${customerName}`,
      `Email: ${customerEmail}`,
      `Total: ${total}`,
      `Stripe session: ${session.id}`,
      "",
      "Items:",
      orderSummary
    ].join("\n")
  });

  // Sent after the owner alert so a failed alert (which makes Stripe retry) never
  // leaves a review email already scheduled. A review-email failure is logged, not
  // thrown, so it can't trigger retries on its own.
  try {
    await scheduleReviewRequest(session, lineItems, request);
  } catch (error) {
    console.error("Review request email failed:", error.message);
  }
}

// ---- Review request email ----
// Opt-in with REVIEW_REQUEST_EMAILS=on. Needs a sender on a domain verified in Resend
// (REVIEW_EMAIL_FROM or ORDER_NOTIFICATION_FROM); Resend's onboarding@resend.dev
// sender can only email the account owner.
async function scheduleReviewRequest(session, lineItems, request) {
  if (String(process.env.REVIEW_REQUEST_EMAILS || "").toLowerCase() !== "on") return;
  if (session.payment_status && session.payment_status !== "paid") return;

  const to = session.customer_details?.email || session.customer_email;
  const from = process.env.REVIEW_EMAIL_FROM || process.env.ORDER_NOTIFICATION_FROM || "";
  if (!to || !from || /@resend\.dev>?$/i.test(from.trim())) return;

  const reviewUrl = `${getSiteUrl(request)}/review.html?session=${encodeURIComponent(session.id)}`;
  const firstName = String(session.customer_details?.name || session.metadata?.customer_name || "").trim().split(/\s+/)[0];
  const itemNames = lineItems.map((item) => item.description || item.price?.product?.name).filter(Boolean);
  const itemText = itemNames.length === 1 ? itemNames[0] : "your new fragrances";
  const message = buildReviewEmail({ firstName, itemText, itemNames, reviewUrl });

  const payload = {
    from,
    to: [to],
    subject: `How's ${itemText}?`,
    text: message.text,
    html: message.html
  };

  const delayDays = getReviewDelayDays();
  if (delayDays > 0) {
    payload.scheduled_at = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getResendApiKey()}`,
      "Content-Type": "application/json",
      // Stripe can deliver the same event more than once; this keeps it to one email.
      "Idempotency-Key": `review-request/${session.id}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Resend responded ${response.status}`);
  }
}

function buildReviewEmail({ firstName, itemText, itemNames, reviewUrl }) {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const text = [
    greeting,
    "",
    `Thanks again for shopping with Aura Society Co. Now that you've had time with ${itemText}, we'd love to hear what you think.`,
    "",
    "Your honest review, good or bad, helps other shoppers find their scent. It takes about a minute:",
    reviewUrl,
    "",
    "If your order hasn't arrived yet or something isn't right, just reply to this email and we'll help.",
    "",
    "Aura Society Co."
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111111; line-height: 1.5; max-width: 520px;">
      <p>${escapeHtml(greeting)}</p>
      <p>Thanks again for shopping with Aura Society Co. Now that you've had time with ${escapeHtml(itemText)}, we'd love to hear what you think.</p>
      ${itemNames.length > 1 ? `<ul>${itemNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>` : ""}
      <p>Your honest review, good or bad, helps other shoppers find their scent. It takes about a minute.</p>
      <p><a href="${escapeHtml(reviewUrl)}" style="display: inline-block; padding: 12px 22px; background: #050505; color: #ffffff; text-decoration: none; font-weight: bold;">Review my order</a></p>
      <p style="color: #555555; font-size: 13px;">If your order hasn't arrived yet or something isn't right, just reply to this email and we'll help.</p>
      <p>Aura Society Co.</p>
    </div>
  `;

  return { text, html };
}

// ---- Abandoned checkout reminder ----
// Opt-in with CART_RECOVERY_EMAILS=on (create-checkout-session then asks Stripe for a
// recovery link). Only emails shoppers who agreed to offers, on Stripe's page or ours.
async function sendCartRecoveryEmail(session) {
  if (session.metadata?.store !== "aura-society") return;
  if (String(process.env.CART_RECOVERY_EMAILS || "").toLowerCase() !== "on") return;
  if (!getResendApiKey()) return;

  const recoveryUrl = session.after_expiration?.recovery?.url;
  const to = session.customer_details?.email || session.customer_email;
  const consented = session.consent?.promotions === "opt_in" || session.metadata?.marketing_opt_in === "yes";
  const from = process.env.REVIEW_EMAIL_FROM || process.env.ORDER_NOTIFICATION_FROM || "";
  if (!recoveryUrl || !to || !consented || !from || /@resend\.dev>?$/i.test(from.trim())) return;

  const lineItems = await fetchStripeLineItems(session.id);
  const itemNames = lineItems.map((item) => item.description || item.price?.product?.name).filter(Boolean);
  const itemText = itemNames.length === 1 ? itemNames[0] : "your fragrances";
  const firstName = String(session.customer_details?.name || session.metadata?.customer_name || "").trim().split(/\s+/)[0];
  const message = buildCartRecoveryEmail({ firstName, itemText, itemNames, recoveryUrl });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getResendApiKey()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `cart-recovery/${session.id}`
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Still thinking about ${itemText}?`,
      text: message.text,
      html: message.html
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Resend responded ${response.status}`);
  }
}

function buildCartRecoveryEmail({ firstName, itemText, itemNames, recoveryUrl }) {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const address = String(process.env.BUSINESS_MAILING_ADDRESS || "").trim();
  const footer = "You're getting this because you asked for news and offers from Aura Society Co. Reply \"unsubscribe\" and we'll stop.";
  const text = [
    greeting,
    "",
    `You left ${itemText} in your bag. It's saved for you, and you can pick up right where you left off:`,
    recoveryUrl,
    "",
    "Every bottle is 100% authentic, and standard shipping is free on orders $100+.",
    "Questions about a scent? Just reply to this email.",
    "",
    "Aura Society Co.",
    "",
    footer,
    address
  ].filter((line, index, lines) => line || lines[index - 1]).join("\n").trim();

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111111; line-height: 1.5; max-width: 520px;">
      <p>${escapeHtml(greeting)}</p>
      <p>You left ${escapeHtml(itemText)} in your bag. It's saved for you, and you can pick up right where you left off.</p>
      ${itemNames.length > 1 ? `<ul>${itemNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>` : ""}
      <p><a href="${escapeHtml(recoveryUrl)}" style="display: inline-block; padding: 12px 22px; background: #050505; color: #ffffff; text-decoration: none; font-weight: bold;">Complete my order</a></p>
      <p>Every bottle is 100% authentic, and standard shipping is free on orders $100+. Questions about a scent? Just reply to this email.</p>
      <p>Aura Society Co.</p>
      <p style="color: #777777; font-size: 12px;">${escapeHtml(footer)}${address ? `<br>${escapeHtml(address)}` : ""}</p>
    </div>
  `;

  return { text, html };
}

function getReviewDelayDays() {
  const days = Number(process.env.REVIEW_REQUEST_DELAY_DAYS);
  if (!Number.isFinite(days)) return 7;
  return Math.min(Math.max(days, 0), 29);
}

function getSiteUrl(request) {
  const configured = (process.env.SITE_URL || "").replace(/\/$/, "");
  const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(configured);
  if (configured && !(isLocalUrl && process.env.VERCEL)) return configured;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;

  const host = request?.headers?.["x-forwarded-host"] || request?.headers?.host || "localhost:4173";
  return `https://${host}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchStripeLineItems(sessionId) {
  if (!getStripeSecretKey()) return [];

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=100&expand[]=data.price.product`, {
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`
    }
  });
  const data = await response.json();

  if (!response.ok) return [];
  return Array.isArray(data.data) ? data.data : [];
}

async function sendOrderEmail({ subject, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getResendApiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.ORDER_NOTIFICATION_FROM || "Aura Society Co <onboarding@resend.dev>",
      to: [process.env.ORDER_NOTIFICATION_EMAIL || "xswann07@gmail.com"],
      subject,
      text
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Order email could not send.");
  }
}

function verifyStripeEvent(rawBody, signatureHeader) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!webhookSecret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
  }

  const parts = String(signatureHeader || "").split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));

  if (!timestamp || !signatures.length) {
    throw new Error("Invalid Stripe signature header.");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");
  const isValid = signatures.some((signature) => timingSafeEqual(signature, expected));

  if (!isValid) {
    throw new Error("Invalid Stripe webhook signature.");
  }

  return JSON.parse(rawBody);
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Webhook body too large."));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function formatAmount(amount, currency) {
  const value = Number(amount || 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "usd").toUpperCase()
  }).format(value);
}

function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY || "";
}

function getResendApiKey() {
  return process.env.RESEND_API_KEY || "";
}

function sendJson(response, statusCode, data) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(data));
}
