const { requireAdmin } = require("../lib/admin-auth");
const { normalizeSubscriber, saveSubscriber, listSubscribers, getWelcomeOffer } = require("../lib/subscribers");

// POST: public VIP signup from the homepage footer. GET: admin-only subscriber list.
module.exports = async function handler(request, response) {
  const send = (statusCode, data) => {
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify(data));
  };

  try {
    if (request.method === "GET") {
      // Public: lets the welcome popup check an offer is configured, without revealing the code.
      if (/[?&]offer\b/.test(request.url || "")) {
        send(200, { enabled: Boolean(getWelcomeOffer()) });
        return;
      }
      if (!(await requireAdmin(request, send))) return;
      send(200, { subscribers: await listSubscribers() });
      return;
    }

    if (request.method !== "POST") {
      send(405, { error: "Method not allowed." });
      return;
    }

    const payload = await readPayload(request);

    // Hidden "website" field: real visitors leave it empty, form-filling bots don't.
    if (payload.website) {
      send(200, { ok: true, offer: null });
      return;
    }

    const subscriber = normalizeSubscriber(payload);
    if (!subscriber) {
      send(400, { error: "Enter a valid email address." });
      return;
    }

    await saveSubscriber(subscriber);
    send(200, { ok: true, offer: getWelcomeOffer() });
  } catch (error) {
    send(500, { error: error.message || "Signup failed. Please try again." });
  }
};

async function readPayload(request) {
  if (request.body && typeof request.body === "object") return request.body;

  const body = await new Promise((resolve, reject) => {
    let text = "";
    request.on("data", (chunk) => {
      text += chunk;
      if (text.length > 10_000) reject(new Error("Request body too large."));
    });
    request.on("end", () => resolve(text));
    request.on("error", reject);
  });

  return body ? JSON.parse(body) : {};
}
