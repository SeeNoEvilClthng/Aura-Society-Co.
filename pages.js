const CART_KEY = "auraSocietyCart";
const FREE_SHIPPING_THRESHOLD = 100;
const API_BASE = getApiBase();
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

let products = [];
let cart = loadCart();
let reviewSummary = {};

const toast = document.querySelector("#toast");
const cartCount = document.querySelector("#cartCount");

async function initPage() {
  try {
    products = await fetchProducts();
    updateCartCount();

    const page = document.body.dataset.page;
    if (page === "gifts" || page === "guide") renderGiftsPage();
    if (page === "collections") renderCollectionsPage();
    if (page === "collection") renderCollectionPage();
    if (page === "product") renderProductPage();
    if (page === "checkout") renderCheckoutPage();
    if (page !== "checkout") loadReviewSummary();
    if (page === "product") loadProductReviews();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadReviewSummary() {
  try {
    const data = await requestJson(`${API_BASE}/api/reviews?summary=1`);
    reviewSummary = data.summary || {};
    if (Object.keys(reviewSummary).length) rerenderCurrentPage();
  } catch {
    reviewSummary = {};
  }
}

async function loadProductReviews() {
  const container = document.querySelector("#productReviews");
  const product = currentProduct();
  if (!container || !product) return;

  try {
    const data = await requestJson(`${API_BASE}/api/reviews?productId=${encodeURIComponent(product.id)}`);
    container.innerHTML = reviewsSection(data.summary, data.reviews || []);
  } catch {
    // Keep the server-rendered reviews (if any) when the API is unavailable.
  }
}

function reviewsSection(summary, reviews) {
  const heading = summary && summary.count
    ? `<p class="rating-line">${starsMarkup(summary.average)} <strong>${summary.average.toFixed(1)}</strong> out of 5 from ${summary.count} verified review${summary.count === 1 ? "" : "s"}</p>`
    : '<p class="microcopy">No reviews yet. Bought this fragrance? Use the review link from your order confirmation.</p>';

  return `
    <div class="retail-section-head"><h2>Reviews</h2></div>
    ${heading}
    <div class="review-list">
      ${reviews.map((review) => `
        <article class="review-entry">
          <p>${starsMarkup(review.rating)}${review.title ? ` <strong>${escapeHtml(review.title)}</strong>` : ""}</p>
          <p>${escapeHtml(review.body)}</p>
          <p class="microcopy">${escapeHtml(review.name)}${review.verified ? " | Verified buyer" : ""} | ${escapeHtml(new Date(review.createdAt).toLocaleDateString())}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function starsMarkup(rating) {
  const rounded = Math.round(Number(rating) || 0);
  return `<span class="stars" aria-label="${Number(rating).toFixed(1)} out of 5 stars">${"&#9733;".repeat(rounded)}${"&#9734;".repeat(5 - rounded)}</span>`;
}

function ratingBadge(productId) {
  const entry = reviewSummary[productId];
  if (!entry || !entry.count) return "<span>100% Authentic</span>";
  return `<span class="card-rating" aria-label="Rated ${entry.average.toFixed(1)} out of 5 from ${entry.count} reviews">&#9733; ${entry.average.toFixed(1)} (${entry.count})</span>`;
}

function currentProduct() {
  const id = new URLSearchParams(window.location.search).get("id");
  return products.find((entry) => entry.id === id);
}

async function fetchProducts() {
  try {
    const data = await requestJson(`${API_BASE}/api/products?images=0`);
    return Array.isArray(data.products) ? data.products : [];
  } catch {
    const fallback = await requestJson("/catalog/products-lite.json");
    return Array.isArray(fallback) ? fallback : [];
  }
}

function rerenderCurrentPage() {
  const page = document.body.dataset.page;
  if (page === "gifts" || page === "guide") renderGiftsPage();
  if (page === "collections") renderCollectionsPage();
  if (page === "collection") renderCollectionPage();
  if (page === "product") renderProductPage();
  if (page === "checkout") renderCheckoutPage();
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON from ${url}.`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function renderCollectionsPage() {
  const familyGrid = document.querySelector("#familyGrid");
  const brandList = document.querySelector("#collectionGrid");
  const productGrid = document.querySelector("#productGrid");
  const familyFilter = document.querySelector("#familyFilter");
  const sortSelect = document.querySelector("#sortSelect");
  const selectedFamily = new URLSearchParams(window.location.search).get("family") || "all";
  const countLabel = (count) => `${count} ${count === 1 ? "fragrance" : "fragrances"}`;

  // Scent families get picture cards (biggest first); brands get a compact A-Z list.
  const families = [...new Set(products.map((product) => product.family).filter(Boolean))]
    .sort((a, b) => collectionProducts(b).length - collectionProducts(a).length);
  familyGrid.innerHTML = families.map((family) => {
    const familyItems = collectionProducts(family);
    return `
      <a class="promo-card" href="${collectionHref(family)}">
        <div class="promo-media">${productImage(familyItems.find(inStock) || familyItems[0], "tile")}</div>
        <div class="promo-copy">
          <span>${countLabel(familyItems.length)}</span>
          <h3>${escapeHtml(family)}</h3>
          <strong class="primary-button">Shop now</strong>
        </div>
      </a>
    `;
  }).join("");

  const brands = [...new Set(products.map((product) => product.brand).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  brandList.innerHTML = brands.map((brand) => `
    <a class="brand-chip" href="${collectionHref(brand)}">${escapeHtml(brand)} <small>${collectionProducts(brand).length}</small></a>
  `).join("");

  if (familyFilter.dataset.bound !== "true") {
    populateFamilies(familyFilter, selectedFamily);
    familyFilter.dataset.bound = "true";
    bindPagedGrid(productGrid, () => sortProducts(
      products.filter((product) => familyFilter.value === "all" || product.family === familyFilter.value),
      sortSelect.value
    ), [familyFilter, sortSelect]);
  }
  productGrid.refreshPagedGrid();
  bindAddToBag(productGrid);
}

// Long product grids show a batch at a time with a "Show more" button. getList returns the
// filtered, sorted products; changing any of the controls starts again from the first batch.
const PRODUCT_BATCH = 24;

function bindPagedGrid(grid, getList, controls) {
  const button = grid.parentElement.querySelector(".show-more");
  let limit = PRODUCT_BATCH;

  grid.refreshPagedGrid = () => {
    const list = getList();
    grid.innerHTML = list.length
      ? productCards(list.slice(0, limit))
      : '<div class="empty-state">No fragrances match.</div>';
    if (button) {
      const remaining = list.length - limit;
      button.hidden = remaining <= 0;
      button.textContent = `Show ${Math.min(remaining, PRODUCT_BATCH)} more`;
    }
  };

  controls.forEach((control) => control?.addEventListener("input", () => {
    limit = PRODUCT_BATCH;
    grid.refreshPagedGrid();
  }));
  button?.addEventListener("click", () => {
    limit += PRODUCT_BATCH;
    grid.refreshPagedGrid();
  });
}

function sortProducts(list, sort) {
  const sorted = [...list];
  if (sort === "price-low") sorted.sort((a, b) => a.price - b.price);
  if (sort === "price-high") sorted.sort((a, b) => b.price - a.price);
  if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

function renderCollectionPage() {
  const params = new URLSearchParams(window.location.search);
  const collection = params.get("collection") || getCollections()[0] || "Collection";
  const productGrid = document.querySelector("#productGrid");
  const visible = collectionProducts(collection);

  document.title = `${collection} | Aura Society Co.`;
  document.querySelector("#collectionTitle").textContent = collection;
  // Keep the brand introduction the server already rendered; fill in only the placeholder.
  const description = document.querySelector("#collectionDescription");
  if (description.textContent.trim() === "Shop this fragrance collection.") {
    description.textContent = visible.length
      ? `Shop ${visible.length} fragrance${visible.length === 1 ? "" : "s"} from ${collection}.`
      : "New fragrances are coming to this collection soon.";
  }
  document.querySelector("#collectionProductTitle").textContent = `${visible.length} fragrance${visible.length === 1 ? "" : "s"}`;
  if (!visible.length) {
    productGrid.innerHTML = '<div class="empty-state">No fragrances in this collection yet.</div>';
    return;
  }

  const sortSelect = document.querySelector("#sortSelect");
  if (sortSelect && sortSelect.dataset.bound !== "true") {
    sortSelect.dataset.bound = "true";
    sortSelect.addEventListener("input", () => renderCollectionPage());
  }
  productGrid.innerHTML = productCards(sortProducts(visible, sortSelect?.value));
  bindAddToBag(productGrid);
}

// Each gift section lists hand-picked product ids in data-gift-ids. Picks that are
// sold out or removed are skipped, and the section is topped up with in-stock
// bottles from the same price range so it never looks empty.
function renderGiftsPage() {
  const used = new Set();
  document.querySelectorAll("[data-gift-ids]").forEach((grid) => {
    const picks = grid.dataset.giftIds.split(",")
      .map((id) => products.find((product) => product.id === id.trim()))
      .filter((product) => product && inStock(product) && !used.has(product.id));
    if (grid.dataset.fill !== "false" && picks.length && picks.length < 8) {
      const low = Math.min(...picks.map((product) => Number(product.price)));
      const high = Math.max(...picks.map((product) => Number(product.price)));
      const extras = products.filter((product) => inStock(product)
        && !used.has(product.id) && !picks.includes(product)
        && Number(product.price) >= low && Number(product.price) <= high);
      picks.push(...extras.slice(0, 8 - picks.length));
    }
    picks.forEach((product) => used.add(product.id));
    grid.innerHTML = productCards(picks);
    bindAddToBag(grid);
  });
}

function renderProductPage() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const product = products.find((entry) => entry.id === id);
  const detail = document.querySelector("#productDetail");
  const relatedGrid = document.querySelector("#relatedGrid");

  // An old or mistyped link used to show a different bottle; say so and suggest others.
  if (!product) {
    detail.innerHTML = `
      <div class="empty-state product-missing">
        <h1>This fragrance isn't available</h1>
        <p>It may have sold out or been removed. Here are a few others you might like.</p>
        <a class="primary-button" href="collections.html">Shop all fragrances</a>
      </div>
    `;
    relatedGrid.innerHTML = productCards(products.filter(inStock).slice(0, 4));
    bindAddToBag(relatedGrid);
    return;
  }

  const soldOut = !inStock(product);
  const toFreeShipping = FREE_SHIPPING_THRESHOLD - Number(product.price);
  if (typeof auraTrack === "function") auraTrack("view_item", { value: Number(product.price), items: [gaItem(product)] });

  document.title = `${product.name} | Aura Society Co.`;
  detail.innerHTML = `
    <div class="product-detail-media">${productImage(product)}</div>
    <div class="product-detail-copy">
      <a class="back-link" href="${collectionHref(product.collection)}">${escapeHtml(product.collection || "Collection")}</a>
      <h1>${escapeHtml(product.name)}</h1>
      ${reviewSummary[product.id]?.count ? `<a class="rating-line" href="#productReviews">${starsMarkup(reviewSummary[product.id].average)} ${reviewSummary[product.id].average.toFixed(1)} (${reviewSummary[product.id].count} review${reviewSummary[product.id].count === 1 ? "" : "s"})</a>` : ""}
      <p class="product-detail-brand">${escapeHtml(product.brand)} | ${escapeHtml(product.size)}</p>
      <p class="product-detail-price">${currency.format(product.price)}</p>
      <p class="shipping-hint">${toFreeShipping <= 0 ? "Ships free with standard shipping" : `Add ${currency.format(toFreeShipping)} more to your bag for free shipping`}</p>
      <p>${escapeHtml(product.description)}</p>
      <p class="notes">${escapeHtml(product.notes)}</p>
      <div class="payment-methods">
        <span>${escapeHtml(product.family)}</span>
        <span>${escapeHtml(product.collection || "Aura Society Co.")}</span>
      </div>
      <button class="primary-button product-add" type="button" data-add="${escapeAttribute(product.id)}" ${soldOut ? "disabled" : ""}>${soldOut ? "Sold out" : "Add to bag"}</button>
      <a class="secondary-button product-checkout" href="checkout.html">Go to checkout</a>
      <ul class="trust-list">
        <li>100% authentic bottle</li>
        <li>Free standard shipping on orders $100+</li>
        <li>Secure checkout with Stripe</li>
      </ul>
    </div>
  `;

  relatedGrid.innerHTML = productCards(relatedProducts(product, 4));
  bindAddToBag(detail);
  bindAddToBag(relatedGrid);
  if (soldOut) {
    document.querySelector("#stickyAdd")?.remove();
  } else {
    renderStickyAdd(product, detail.querySelector(".product-add"));
  }
}

function inStock(product) {
  return Number(product.stock) !== 0;
}

// Same scent family first (what the shopper is drawn to), then same brand, then
// whatever is closest in price, so "More scents" is never just the first four products.
function relatedProducts(product, limit) {
  const price = Number(product.price) || 0;
  const score = (entry) =>
    (entry.family && entry.family === product.family ? 0 : 2) +
    (entry.brand && entry.brand === product.brand ? 0 : 1);

  return products
    .filter((entry) => entry.id !== product.id && inStock(entry))
    .sort((a, b) => score(a) - score(b) || Math.abs(Number(a.price) - price) - Math.abs(Number(b.price) - price))
    .slice(0, limit);
}

// On phones the header and photo push "Add to bag" well below the first screen, so keep a
// compact bar pinned to the bottom while the main button is out of view (CSS shows it <=760px).
let stickyAddObserver = null;

function renderStickyAdd(product, mainButton) {
  let bar = document.querySelector("#stickyAdd");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "stickyAdd";
    bar.className = "sticky-add";
    document.body.append(bar);
    bindAddToBag(bar);
  }

  bar.innerHTML = `
    <div>
      <strong>${escapeHtml(product.name)}</strong>
      <span>${currency.format(product.price)}</span>
    </div>
    <button class="primary-button" type="button" data-add="${escapeAttribute(product.id)}">Add to bag</button>
  `;

  stickyAddObserver?.disconnect();
  if (!mainButton || !("IntersectionObserver" in window)) return;
  stickyAddObserver = new IntersectionObserver(([entry]) => {
    bar.classList.toggle("is-hidden", entry.isIntersecting);
  });
  stickyAddObserver.observe(mainButton);
}

function renderCheckoutPage() {
  const itemsContainer = document.querySelector("#checkoutItems");
  const subtotalEl = document.querySelector("#checkoutSubtotal");
  const shippingEl = document.querySelector("#checkoutShipping");
  const totalEl = document.querySelector("#checkoutTotal");
  const checkoutForm = document.querySelector("#checkoutForm");
  const checkoutButton = document.querySelector("#checkoutButton");
  const standardShippingName = document.querySelector("#standardShippingName");
  const standardShippingPrice = document.querySelector("#standardShippingPrice");
  const activeItems = getActiveCartItems();
  const subtotal = activeItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const isFreeShipping = subtotal >= 100;
  const getShippingAmount = () => {
    const selected = document.querySelector("input[name='shippingMethod']:checked")?.value || "standard";
    return selected === "express" ? 15 : (isFreeShipping ? 0 : 10);
  };
  const updateCheckoutTotals = () => {
    const shipping = getShippingAmount();
    shippingEl.textContent = shipping === 0 ? "Free" : currency.format(shipping);
    totalEl.textContent = currency.format(subtotal + shipping);
  };

  if (!activeItems.length) {
    itemsContainer.innerHTML = '<div class="empty-state">Your bag is empty.</div>';
    checkoutButton.disabled = true;
  } else {
    itemsContainer.innerHTML = activeItems.map((item) => `
      <article class="checkout-item">
        <div class="checkout-thumb">${productImage(item.product)}</div>
        <span class="checkout-quantity">${item.quantity}</span>
        <div>
          <strong>${escapeHtml(item.product.name)}</strong>
          <p>${escapeHtml(item.product.size)} / ${escapeHtml(item.product.family)}</p>
        </div>
        <strong>${currency.format(item.product.price * item.quantity)}</strong>
      </article>
    `).join("");
  }

  standardShippingName.textContent = isFreeShipping ? "Free standard shipping" : "Standard shipping";
  standardShippingPrice.textContent = isFreeShipping ? "Free" : "$10.00";
  subtotalEl.textContent = currency.format(subtotal);
  renderShippingProgress(document.querySelector("#shippingProgress"), subtotal);
  renderFreeShippingPairings(document.querySelector("#checkoutPairings"), activeItems, subtotal);
  updateCheckoutTotals();

  // This page re-renders when images, reviews or the bag change; bind listeners once so a
  // single click can't open two payment sessions.
  if (checkoutForm.dataset.bound === "true") return;
  checkoutForm.dataset.bound = "true";

  document.querySelectorAll("input[name='shippingMethod']").forEach((input) => {
    input.addEventListener("input", renderCheckoutPage);
  });

  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const latestItems = getActiveCartItems();
    if (!latestItems.length) {
      showToast("Your bag is empty.");
      return;
    }

    const formData = new FormData(checkoutForm);
    const customerName = `${formData.get("firstName")} ${formData.get("lastName")}`.trim();
    const address = [
      formData.get("address"),
      formData.get("apartment"),
      formData.get("state"),
      formData.get("zip"),
      formData.get("country")
    ].filter(Boolean).join(", ");

    checkoutButton.disabled = true;
    checkoutButton.textContent = "Opening payment...";

    if (typeof auraTrack === "function") {
      const gaItems = latestItems.map((item) => gaItem(item.product, item.quantity));
      const value = latestItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      auraTrack("begin_checkout", { value, items: gaItems });
      rememberPendingPurchase(gaItems, value);
    }

    if (formData.get("marketing")) {
      // Opt-in from the checkbox; a failed signup must never hold up payment.
      fetch(`${API_BASE}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.get("email"), source: "checkout" }),
        keepalive: true
      }).catch(() => {});
    }

    try {
      const data = await requestJson(`${API_BASE}/api/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: customerName,
            email: formData.get("email"),
            address
          },
          items: latestItems.map((item) => ({
            id: item.product.id,
            name: item.product.name,
            price: item.product.price,
            size: item.product.size,
            notes: item.product.notes,
            description: item.product.description,
            quantity: item.quantity
          })),
          shippingMethod: document.querySelector("input[name='shippingMethod']:checked")?.value || "standard",
          marketingOptIn: Boolean(formData.get("marketing"))
        })
      });

      window.location.href = data.url;
    } catch (error) {
      checkoutButton.disabled = false;
      checkoutButton.textContent = "Continue to payment";
      showToast(error.message);
    }
  });
}

function renderShippingProgress(container, subtotal) {
  if (!container) return;
  if (subtotal <= 0) {
    container.innerHTML = "";
    return;
  }

  const remaining = Math.max(FREE_SHIPPING_THRESHOLD - subtotal, 0);
  const percent = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100);
  const message = remaining > 0
    ? `Add <strong>${currency.format(remaining)}</strong> more for free standard shipping. <a href="collections.html">Keep shopping</a>`
    : "<strong>You've unlocked free standard shipping</strong>";

  container.innerHTML = `
    <p>${message}</p>
    <div class="shipping-progress-track"><span style="width: ${percent.toFixed(1)}%"></span></div>
  `;
}

// Most bottles sit just under the free-shipping line, so suggest a second one that clears
// it: same scent family as the bag first, then the lowest price that gets there.
function freeShippingPairings(activeItems, subtotal, limit = 3) {
  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
  if (subtotal <= 0 || remaining <= 0) return [];

  const inBag = new Set(activeItems.map((item) => item.product.id));
  const families = new Set(activeItems.map((item) => item.product.family).filter(Boolean));
  return products
    .filter((product) => !inBag.has(product.id) && product.price >= remaining && product.stock !== 0)
    .sort((a, b) => (families.has(b.family) - families.has(a.family)) || (a.price - b.price))
    .slice(0, limit);
}

function renderFreeShippingPairings(container, activeItems, subtotal) {
  if (!container) return;
  const pairings = freeShippingPairings(activeItems, subtotal);
  if (!pairings.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <p class="pairings-title">Pair it and ship free</p>
    ${pairings.map((product) => `
      <div class="pairing-item">
        <a class="pairing-thumb" href="product.html?id=${encodeURIComponent(product.id)}">${productImage(product)}</a>
        <div>
          <a href="product.html?id=${encodeURIComponent(product.id)}"><strong>${escapeHtml(product.name)}</strong></a>
          <p class="microcopy">${currency.format(product.price)} | ${escapeHtml(product.family || product.size)}</p>
        </div>
        <button class="secondary-button" type="button" data-add="${escapeAttribute(product.id)}">Add</button>
      </div>
    `).join("")}
  `;
  bindAddToBag(container);
}

function productCards(entries) {
  return entries.map((product) => `
    <article class="product-card retail-product-card">
      <a class="product-image" href="product.html?id=${encodeURIComponent(product.id)}">${productImage(product)}</a>
      <div class="product-info">
        <div class="product-meta">
          <span>${escapeHtml(product.brand)}</span>
          ${ratingBadge(product.id)}
        </div>
        <h3><a href="product.html?id=${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a></h3>
        <p class="notes">${escapeHtml(product.notes)}</p>
        <div class="product-meta">
          <span>${escapeHtml(product.size)}</span>
          <span>${escapeHtml(product.family || "Fragrance")}</span>
        </div>
        <div class="price-row">
          <span class="price">${currency.format(product.price)}</span>
          <button class="primary-button" type="button" data-add="${escapeAttribute(product.id)}" ${inStock(product) ? "" : "disabled"}>${inStock(product) ? "Add to bag" : "Sold out"}</button>
        </div>
      </div>
    </article>
  `).join("");
}

function productImage(product, variant = "card") {
  const src = product?.thumb || product?.image;
  if (src) {
    const loading = variant === "hero" ? "eager" : "lazy";
    const fetchPriority = variant === "hero" ? "high" : "auto";
    return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(product.name)} fragrance" loading="${loading}" decoding="async" fetchpriority="${fetchPriority}">`;
  }

  const label = product?.name?.charAt(0) || "A";
  return `<div class="product-placeholder ${variant === "hero" ? "is-hero" : ""}" aria-hidden="true">${escapeHtml(label)}</div>`;
}

function bindAddToBag(container) {
  if (container.dataset.addToBagBound === "true") return;
  container.dataset.addToBagBound = "true";

  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (!button) return;

    addToCart(button.dataset.add);
  });
}

function addToCart(productId) {
  const product = products.find((entry) => entry.id === productId);
  if (!product || !inStock(product)) return;

  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id: productId, quantity: 1 });
  }

  saveCart();
  updateCartCount();
  if (document.body.dataset.page === "checkout") renderCheckoutPage();
  showToast(`${product.name} added to bag.`);
  if (typeof auraTrack === "function") auraTrack("add_to_cart", { value: Number(product.price), items: [gaItem(product)] });
}

function getActiveCartItems() {
  return cart
    .map((item) => ({ ...item, product: products.find((product) => product.id === item.id) }))
    .filter((item) => item.product);
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function updateCartCount() {
  if (!cartCount) return;
  cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
}

function populateFamilies(select, selectedFamily) {
  const families = [...new Set(products.map((product) => product.family).filter(Boolean))].sort();
  select.innerHTML = '<option value="all">All families</option>';
  families.forEach((family) => {
    const option = document.createElement("option");
    option.value = family;
    option.textContent = family;
    select.append(option);
  });
  select.value = families.includes(selectedFamily) ? selectedFamily : "all";
}

function getCollections() {
  return [
    ...new Set(products.flatMap((product) => [
      product.collection,
      product.brand,
      product.family
    ]).filter(Boolean))
  ].sort();
}

function collectionProducts(collection) {
  const collectionKey = normalizeCollectionKey(collection);
  return products.filter((product) => [
    product.collection,
    product.brand,
    product.family
  ].some((value) => normalizeCollectionKey(value) === collectionKey));
}

function normalizeCollectionKey(value) {
  return String(value || "").trim().toLowerCase();
}

function collectionHref(collection) {
  return `collection.html?collection=${encodeURIComponent(collection || "")}`;
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function getApiBase() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (window.location.protocol === "file:" || (localHosts.has(window.location.hostname) && window.location.port !== "4173")) {
    return "http://localhost:4173";
  }

  return "";
}

initPage();
