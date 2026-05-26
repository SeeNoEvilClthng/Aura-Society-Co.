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

    if (!items.length) {
      sendJson(response, 400, { error: "Cart is empty." });
      return;
    }

    if (items.length > 100) {
      sendJson(response, 400, { error: "Stripe Checkout supports up to 100 line items." });
      return;
    }

    const siteUrl = getSiteUrl(request);
    const params = new URLSearchParams();
    params.set("mode", "payment");
    // Do not set payment_method_types here. Stripe Checkout will show eligible
    // methods enabled in the Stripe Dashboard, such as cards, Cash App Pay,
    // PayPal, wallets, Link, and buy-now-pay-later options where available.
    params.set("success_url", `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`);
    params.set("cancel_url", `${siteUrl}/index.html`);
    params.set("shipping_address_collection[allowed_countries][0]", "US");
    params.set("metadata[customer_name]", sanitize(customer.name, 120));
    params.set("metadata[shipping_address]", sanitize(customer.address, 450));

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
