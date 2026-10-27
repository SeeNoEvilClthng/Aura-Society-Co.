const { requireAdmin } = require("../lib/admin-auth");
const reviews = require("../lib/reviews");

// GET ?summary=1            -> ratings for every product (cards)
// GET ?productId=ID         -> visible reviews for one product
// GET ?session=cs_...       -> items in a paid order the buyer can review
// GET ?all=1 (admin)        -> every review, including hidden ones
// POST {session, productId, rating, title, body, name} -> verified buyer submits a review
// PATCH {key, hidden} (admin) -> hide/show a review
module.exports = async function handler(request, response) {
  const send = (statusCode, data, cacheSeconds = 0) => {
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", cacheSeconds ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=600` : "no-store");
    response.end(JSON.stringify(data));
  };

  try {
    const query = getQuery(request);

    if (request.method === "GET") {
      if (query.all) {
        if (!(await requireAdmin(request, send))) return;
        const all = await reviews.listReviews();
        send(200, { reviews: all.map((review) => ({ ...review, key: reviews.reviewKey(review), sessionId: undefined })) });
        return;
      }

      if (query.session) {
        const purchase = await reviews.getVerifiedPurchase(query.session);
        if (!purchase) {
          send(404, { error: "We couldn't find a paid order for this review link." });
          return;
        }
        const existing = await reviews.listReviews();
        const reviewed = new Set(existing.filter((review) => review.sessionId === purchase.sessionId).map((review) => review.productId));
        send(200, {
          customerName: purchase.customerName.split(/\s+/)[0] || "",
          items: purchase.items.map((item) => ({ ...item, reviewed: reviewed.has(item.productId) }))
        });
        return;
      }

      if (query.productId) {
        const list = (await reviews.listReviews(String(query.productId))).filter((review) => !review.hidden);
        const summary = reviews.summarize(list)[query.productId] || { count: 0, average: 0 };
        send(200, { summary, reviews: list.map(reviews.publicReview) }, 60);
        return;
      }

      send(200, { summary: reviews.summarize(await reviews.listReviews()) }, 60);
      return;
    }

    if (request.method === "POST") {
      const payload = await readPayload(request);
      const purchase = await reviews.getVerifiedPurchase(payload.session);
      if (!purchase) {
        send(403, { error: "Only customers with a paid order can leave a review." });
        return;
      }

      const { review, error } = reviews.normalizeReviewInput(payload, purchase);
      if (error) {
        send(400, { error });
        return;
      }

      await reviews.saveReview(review);
      send(200, { ok: true, review: reviews.publicReview(review) });
      return;
    }

    if (request.method === "PATCH") {
      if (!(await requireAdmin(request, send))) return;
      const payload = await readPayload(request);
      const updated = await reviews.setReviewHidden(payload.key, payload.hidden);
      if (!updated) {
        send(404, { error: "Review not found." });
        return;
      }
      send(200, { ok: true, hidden: updated.hidden });
      return;
    }

    send(405, { error: "Method not allowed." });
  } catch (error) {
    send(500, { error: error.message || "Reviews are unavailable right now." });
  }
};

function getQuery(request) {
  if (request.query && typeof request.query === "object") return request.query;
  return Object.fromEntries(new URL(request.url, "http://localhost").searchParams);
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
