// POST: the help page's contact form. Emails the message to ORDER_NOTIFICATION_EMAIL through
// Resend with the shopper as reply-to, so you answer from your inbox and the store address
// is never shown on the site. Works with Resend's onboarding@resend.dev test sender, which
// can email the Resend account owner.
const TOPICS = ["Order question", "Shipping", "Returns or exchanges", "Product question", "Other"];

module.exports = async function handler(request, response) {
  const send = (statusCode, data) => {
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify(data));
  };

  if (request.method !== "POST") {
    send(405, { error: "Method not allowed." });
    return;
  }

  try {
    const payload = await readPayload(request);

    // Hidden "website" field: real visitors leave it empty, form-filling bots don't.
    if (payload.website) {
      send(200, { ok: true });
      return;
    }

    const message = normalizeMessage(payload);
    if (message.error) {
      send(400, { error: message.error });
      return;
    }

    const apiKey = process.env.RESEND_API_KEY || "";
    if (!apiKey) {
      send(503, { error: "Messages can't be sent right now. Please try again later." });
      return;
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.ORDER_NOTIFICATION_FROM || "Aura Society Co <onboarding@resend.dev>",
        to: [process.env.ORDER_NOTIFICATION_EMAIL || "xswann07@gmail.com"],
        reply_to: message.email,
        subject: `[Aura help] ${message.topic}: ${message.name}`,
        text: [
          `From: ${message.name} <${message.email}>`,
          ...(message.order ? [`Order: ${message.order}`] : []),
          `Topic: ${message.topic}`,
          "",
          message.body,
          "",
          "Reply to this email to answer the customer."
        ].join("\n")
      })
    });

    if (!resendResponse.ok) {
      console.error("Contact email failed:", resendResponse.status, await resendResponse.text());
      send(502, { error: "Your message couldn't be sent. Please try again in a few minutes." });
      return;
    }

    send(200, { ok: true });
  } catch (error) {
    send(500, { error: "Your message couldn't be sent. Please try again in a few minutes." });
  }
};

function normalizeMessage(payload) {
  const clean = (value, max) => String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
  const name = clean(payload.name, 80);
  const email = clean(payload.email, 160).toLowerCase();
  const order = clean(payload.order, 80);
  const topic = TOPICS.includes(payload.topic) ? payload.topic : "Other";
  const body = String(payload.message || "").trim().slice(0, 4000);

  if (!name) return { error: "Enter your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (body.length < 10) return { error: "Tell us a little more in your message." };
  return { name, email, order, topic, body };
}

async function readPayload(request) {
  if (request.body && typeof request.body === "object") return request.body;

  const body = await new Promise((resolve, reject) => {
    let text = "";
    request.on("data", (chunk) => {
      text += chunk;
      if (text.length > 20_000) reject(new Error("Request body too large."));
    });
    request.on("end", () => resolve(text));
    request.on("error", reject);
  });

  return body ? JSON.parse(body) : {};
}
