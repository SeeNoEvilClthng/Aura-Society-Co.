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
      await handleCheckoutCompleted(event.data.object);
    }

    sendJson(response, 200, { received: true });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Webhook failed." });
  }
};

async function handleCheckoutCompleted(session) {
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
