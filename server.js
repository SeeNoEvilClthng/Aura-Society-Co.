const http = require("http");
const fs = require("fs");
const path = require("path");

loadEnv();

const PORT = Number(process.env.PORT || 4173);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const publicDir = __dirname;

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
  console.log(`Aura Society Co. running at ${SITE_URL}`);
});

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
  params.set("success_url", `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${SITE_URL}/index.html`);
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

  if (!filePath.startsWith(publicDir)) {
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

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
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
