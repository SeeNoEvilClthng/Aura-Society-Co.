const reviewIntro = document.querySelector("#reviewIntro");
const reviewHeading = document.querySelector("#reviewHeading");
const reviewItems = document.querySelector("#reviewItems");
const sessionId = new URLSearchParams(window.location.search).get("session") || "";

async function loadOrder() {
  if (!sessionId) {
    reviewIntro.textContent = "This review link is missing its order number. Use the link from your order confirmation.";
    return;
  }

  try {
    const response = await fetch(`/api/reviews?session=${encodeURIComponent(sessionId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "We couldn't load your order.");

    if (data.customerName) reviewHeading.textContent = `Thanks, ${data.customerName}. How's your fragrance?`;
    reviewIntro.textContent = data.items.length
      ? "Your review is marked as a verified purchase. Honest reviews, good or bad, help other shoppers find their scent."
      : "We couldn't find any fragrances in this order to review.";
    reviewItems.innerHTML = data.items.map(reviewForm).join("");
  } catch (error) {
    reviewIntro.textContent = error.message;
  }
}

function reviewForm(item) {
  if (item.reviewed) {
    return `<article class="review-item"><h2>${escapeHtml(item.name)}</h2><p class="microcopy">Thanks, you've reviewed this one. Submitting again will update your review.</p>${formFields(item)}</article>`;
  }
  return `<article class="review-item"><h2>${escapeHtml(item.name)}</h2>${formFields(item)}</article>`;
}

function formFields(item) {
  const id = escapeHtml(item.productId);
  const stars = [5, 4, 3, 2, 1].map((value) => `
    <input type="radio" id="star-${id}-${value}" name="rating" value="${value}" required>
    <label for="star-${id}-${value}" title="${value} star${value === 1 ? "" : "s"}">&#9733;</label>
  `).join("");

  return `
    <form class="review-form" data-product="${id}">
      <fieldset class="star-input"><legend>Your rating</legend>${stars}</fieldset>
      <label>Headline (optional)<input class="input" name="title" maxlength="120" placeholder="Smells like a summer night"></label>
      <label>Your review<textarea class="input textarea" name="body" maxlength="2000" required placeholder="How does it smell, how long does it last, where do you wear it?"></textarea></label>
      <label>Display name<input class="input" name="name" maxlength="60" placeholder="First name"></label>
      <button class="primary-button" type="submit">Post review</button>
      <p class="review-status" role="status" aria-live="polite"></p>
    </form>
  `;
}

reviewItems.addEventListener("submit", async (event) => {
  const form = event.target.closest(".review-form");
  if (!form) return;
  event.preventDefault();

  const status = form.querySelector(".review-status");
  const button = form.querySelector("button[type='submit']");
  const data = new FormData(form);

  if (!data.get("rating")) {
    status.textContent = "Choose a star rating.";
    return;
  }

  button.disabled = true;
  status.textContent = "Posting...";

  try {
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: sessionId,
        productId: form.dataset.product,
        rating: Number(data.get("rating")),
        title: data.get("title"),
        body: data.get("body"),
        name: data.get("name")
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Your review couldn't be posted.");

    status.innerHTML = `Thank you! Your review is live. <a href="product.html?id=${encodeURIComponent(form.dataset.product)}">See it on the product page</a>.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

loadOrder();
