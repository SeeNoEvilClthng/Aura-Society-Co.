const CART_KEY = "auraSocietyCart";
const API_BASE = getApiBase();
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

let products = [];
let cart = loadCart();
let productImagesHydrated = false;

const toast = document.querySelector("#toast");
const cartCount = document.querySelector("#cartCount");

async function initPage() {
  try {
    products = await fetchProducts();
    updateCartCount();

    const page = document.body.dataset.page;
    if (page === "collections") renderCollectionsPage();
    if (page === "collection") renderCollectionPage();
    if (page === "product") renderProductPage();
    if (page === "checkout") renderCheckoutPage();
    hydrateProductImages();
  } catch (error) {
    showToast(error.message);
  }
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

async function hydrateProductImages() {
  if (productImagesHydrated) return;
  productImagesHydrated = true;

  try {
    const data = await requestJson(`${API_BASE}/api/products?images=1`);
    const fullProducts = Array.isArray(data.products) ? data.products : [];
    if (!mergeProductImages(fullProducts)) return;

    rerenderCurrentPage();
  } catch {
    try {
      const fullProducts = await requestJson("/catalog/products.json");
      if (!mergeProductImages(Array.isArray(fullProducts) ? fullProducts : [])) return;

      rerenderCurrentPage();
    } catch {
      productImagesHydrated = false;
    }
  }
}

function mergeProductImages(fullProducts) {
  const imagesById = new Map(fullProducts.filter((product) => product.image).map((product) => [product.id, product.image]));
  let changed = false;
  products = products.map((product) => {
    const image = imagesById.get(product.id);
    if (!image || product.image === image) return product;
    changed = true;
    return { ...product, image };
  });
  return changed;
}

function rerenderCurrentPage() {
  const page = document.body.dataset.page;
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
  const collectionGrid = document.querySelector("#collectionGrid");
  const productGrid = document.querySelector("#productGrid");
  const familyFilter = document.querySelector("#familyFilter");
  const selectedFamily = new URLSearchParams(window.location.search).get("family") || "all";
  const collections = getCollections();

  collectionGrid.innerHTML = collections.map((collection) => {
    const collectionItems = collectionProducts(collection);
    const product = collectionItems[0];
    return `
      <a class="promo-card" href="${collectionHref(collection)}">
        <div class="promo-media">${productImage(product, "tile")}</div>
        <div class="promo-copy">
          <span>${collectionItems.length} fragrances</span>
          <h3>${escapeHtml(collection)}</h3>
          <strong class="primary-button">Shop now</strong>
        </div>
      </a>
    `;
  }).join("");

  populateFamilies(familyFilter, selectedFamily);
  const renderGrid = () => {
    const family = familyFilter.value;
    const visible = products.filter((product) => family === "all" || product.family === family);
    productGrid.innerHTML = productCards(visible);
  };

  familyFilter.addEventListener("input", renderGrid);
  renderGrid();
  bindAddToBag(productGrid);
}

function renderCollectionPage() {
  const params = new URLSearchParams(window.location.search);
  const collection = params.get("collection") || getCollections()[0] || "Collection";
  const productGrid = document.querySelector("#productGrid");
  const visible = collectionProducts(collection);

  document.title = `${collection} | Aura Society Co.`;
  document.querySelector("#collectionTitle").textContent = collection;
  document.querySelector("#collectionDescription").textContent = visible.length
    ? `Shop ${visible.length} fragrance${visible.length === 1 ? "" : "s"} from ${collection}.`
    : "This collection is ready for your first fragrance upload in the admin portal.";
  document.querySelector("#collectionProductTitle").textContent = collection;
  productGrid.innerHTML = visible.length ? productCards(visible) : '<div class="empty-state">No fragrances in this collection yet.</div>';
  bindAddToBag(productGrid);
}

function renderProductPage() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const product = products.find((entry) => entry.id === id) || products[0];
  const detail = document.querySelector("#productDetail");
  const relatedGrid = document.querySelector("#relatedGrid");

  if (!product) {
    detail.innerHTML = '<div class="empty-state">No product found.</div>';
    return;
  }

  document.title = `${product.name} | Aura Society Co.`;
  detail.innerHTML = `
    <div class="product-detail-media">${productImage(product)}</div>
    <div class="product-detail-copy">
      <a class="back-link" href="${collectionHref(product.collection)}">${escapeHtml(product.collection || "Collection")}</a>
      <h1>${escapeHtml(product.name)}</h1>
      <p class="product-detail-brand">${escapeHtml(product.brand)} | ${escapeHtml(product.size)}</p>
      <p class="product-detail-price">${currency.format(product.price)}</p>
      <p>${escapeHtml(product.description)}</p>
      <p class="notes">${escapeHtml(product.notes)}</p>
      <div class="payment-methods">
        <span>${escapeHtml(product.family)}</span>
        <span>${escapeHtml(product.collection || "Aura Society Co.")}</span>
      </div>
      <button class="primary-button product-add" type="button" data-add="${escapeAttribute(product.id)}">Add to bag</button>
      <a class="secondary-button product-checkout" href="checkout.html">Go to checkout</a>
    </div>
  `;

  const related = products.filter((entry) => entry.id !== product.id && entry.collection === product.collection).slice(0, 4);
  relatedGrid.innerHTML = productCards(related.length ? related : products.filter((entry) => entry.id !== product.id).slice(0, 4));
  bindAddToBag(detail);
  bindAddToBag(relatedGrid);
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
  updateCheckoutTotals();
  document.querySelectorAll("input[name='shippingMethod']").forEach((input) => {
    input.addEventListener("input", updateCheckoutTotals);
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
          shippingMethod: document.querySelector("input[name='shippingMethod']:checked")?.value || "standard"
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

function productCards(entries) {
  return entries.map((product) => `
    <article class="product-card retail-product-card">
      <a class="product-image" href="product.html?id=${encodeURIComponent(product.id)}">${productImage(product)}</a>
      <div class="product-info">
        <div class="product-meta">
          <span>${escapeHtml(product.brand)}</span>
          <span>Star 5.0</span>
        </div>
        <h3><a href="product.html?id=${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a></h3>
        <p class="notes">${escapeHtml(product.notes)}</p>
        <div class="product-meta">
          <span>${escapeHtml(product.size)}</span>
          <span>${escapeHtml(product.family || "Fragrance")}</span>
        </div>
        <div class="price-row">
          <span class="price">${currency.format(product.price)}</span>
          <button class="primary-button" type="button" data-add="${escapeAttribute(product.id)}">Add to bag</button>
        </div>
      </div>
    </article>
  `).join("");
}

function productImage(product, variant = "card") {
  if (product?.image) {
    const loading = variant === "hero" ? "eager" : "lazy";
    const fetchPriority = variant === "hero" ? "high" : "auto";
    return `<img src="${escapeAttribute(product.image)}" alt="${escapeAttribute(product.name)} fragrance" loading="${loading}" decoding="async" fetchpriority="${fetchPriority}">`;
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
  if (!product) return;

  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id: productId, quantity: 1 });
  }

  saveCart();
  updateCartCount();
  showToast(`${product.name} added to bag.`);
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
