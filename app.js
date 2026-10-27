const CART_KEY = "auraSocietyCart";
const FREE_SHIPPING_THRESHOLD = 100;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const defaultSite = {
  topBanner: "Free standard shipping on fragrance orders $100+ USD",
  navLinks: "Shop All, Creed, Tom Ford, Parfums de Marly, Dior, Chanel, Help",
  heroKicker: "100% authentic bottles",
  heroTitle: "Authentic Designer & Niche Fragrances",
  heroSubtitle: "Creed, Tom Ford, Parfums de Marly, Dior, Chanel and more. Free standard shipping on orders $100+.",
  heroButton: "Shop all fragrances",
  featuredTitle: "Featured",
  featuredLinks: "Tom Ford, Creed, Parfums de Marly, Maison Francis Kurkdjian",
  collectionsTitle: "Collections",
  trendingTitle: "Trending",
  brandsTitle: "Scent Families",
  helpTitle: "Need help",
  vipTitle: "Become a VIP",
  vipText: "Subscribe to get early access to drops, exclusive offers, and fragrance restocks.",
  promoCards: [
    { label: "Warm + bold", title: "Amber", button: "Shop now", image: "" },
    { label: "Clean + bright", title: "Fresh", button: "Shop now", image: "" },
    { label: "Soft + romantic", title: "Floral", button: "Shop now", image: "" },
    { label: "Deep + smooth", title: "Woody", button: "Shop now", image: "" }
  ]
};

const API_BASE = getApiBase();
let products = [];
let site = defaultSite;
let activeCollection = "all";
let cart = loadCart();
let reviewSummary = {};

const topBanner = document.querySelector("#topBanner");
const primaryNav = document.querySelector("#primaryNav");
const heroPanels = document.querySelector("#heroPanels");
const heroKicker = document.querySelector("#heroKicker");
const heroTitle = document.querySelector("#heroTitle");
const heroSubtitle = document.querySelector("#heroSubtitle");
const heroButton = document.querySelector("#heroButton");
const featuredTitle = document.querySelector("#featuredTitle");
const featuredTiles = document.querySelector("#featuredTiles");
const collectionsTitle = document.querySelector("#collectionsTitle");
const promoGrid = document.querySelector("#promoGrid");
const trendingTitle = document.querySelector("#trendingTitle");
const brandsTitle = document.querySelector("#brandsTitle");
const familyTiles = document.querySelector("#familyTiles");
const helpTitle = document.querySelector("#helpTitle");
const vipTitle = document.querySelector("#vipTitle");
const vipText = document.querySelector("#vipText");
const productGrid = document.querySelector("#productGrid");
const collectionTabs = document.querySelector("#collectionTabs");
const productCount = document.querySelector("#productCount");
const searchInput = document.querySelector("#searchInput");
const familyFilter = document.querySelector("#familyFilter");
const sortSelect = document.querySelector("#sortSelect");
const cartDrawer = document.querySelector("#cartDrawer");
const cartItems = document.querySelector("#cartItems");
const cartCount = document.querySelector("#cartCount");
const cartTotal = document.querySelector("#cartTotal");
const cartEmpty = document.querySelector("#cartEmpty");
const checkoutForm = document.querySelector("#checkoutForm");
const checkoutButton = document.querySelector("#checkoutButton");
const shippingProgress = document.querySelector("#shippingProgress");
const cartPairings = document.querySelector("#cartPairings");
const vipForm = document.querySelector("#vipForm");
const vipMessage = document.querySelector("#vipMessage");
const toast = document.querySelector("#toast");

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

async function loadStorefront() {
  productGrid.innerHTML = '<div class="empty-state">Loading fragrances...</div>';

  try {
    const [productData, siteData] = await Promise.all([fetchProducts(), fetchSite()]);
    products = productData;
    site = normalizeSite(siteData);
    renderSite();
    populateFamilies();
    renderCollectionTabs();
    renderProducts();
    renderCart();
    loadReviewSummary();
  } catch (error) {
    productGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
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

async function fetchSite() {
  try {
    const data = await requestJson(`${API_BASE}/api/site`);
    return data.site || defaultSite;
  } catch {
    return requestJson("/catalog/site.json");
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`Expected JSON from ${url}, received: ${text.slice(0, 80)}`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Storefront content could not load.");
  }

  return data;
}

function normalizeSite(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...defaultSite,
    ...source,
    promoCards: Array.isArray(source.promoCards) && source.promoCards.length ? source.promoCards : defaultSite.promoCards
  };
}

function renderSite() {
  topBanner.textContent = site.topBanner;
  heroKicker.textContent = site.heroKicker;
  heroTitle.textContent = site.heroTitle;
  heroSubtitle.textContent = site.heroSubtitle;
  heroButton.textContent = site.heroButton;
  featuredTitle.textContent = site.featuredTitle;
  collectionsTitle.textContent = site.collectionsTitle;
  trendingTitle.textContent = site.trendingTitle;
  brandsTitle.textContent = site.brandsTitle;
  helpTitle.textContent = site.helpTitle;
  vipTitle.textContent = site.vipTitle;
  vipText.textContent = site.vipText;
  renderNav();
  renderHeroPanels();
  renderFeaturedTiles();
  renderPromoGrid();
  renderFamilyTiles();
}

// Homepage links can name collections the store doesn't carry; those are dropped
// (or replaced) so shoppers never land on an empty "coming soon" page.
function renderNav() {
  const links = splitList(site.navLinks)
    .map((label) => ({ label, href: navHref(label) }))
    .filter((link) => link.href);
  primaryNav.innerHTML = links.map((link) => `<a href="${escapeAttribute(link.href)}">${escapeHtml(link.label)}</a>`).join("");
}

function renderHeroPanels() {
  heroPanels.innerHTML = [0, 1, 2].map((index) => {
    const product = heroProducts()[index];
    return `
      <div class="hero-panel">
        ${productImage(product, "hero")}
        <span>${escapeHtml(product?.brand || product?.collection || "Aura Society Co.")}</span>
      </div>
    `;
  }).join("");
}

// Three in-stock bottles from different brands, most premium first.
function heroProducts() {
  const seenBrands = new Set();
  return [...products]
    .filter((product) => (product.thumb || product.image) && Number(product.stock) !== 0)
    .sort((a, b) => Number(b.price) - Number(a.price))
    .filter((product) => {
      const brand = normalizeCollectionKey(product.brand);
      if (seenBrands.has(brand)) return false;
      seenBrands.add(brand);
      return true;
    })
    .slice(0, 3);
}

function topBrands() {
  const counts = new Map();
  products.forEach((product) => {
    if (product.brand) counts.set(product.brand, (counts.get(product.brand) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([brand]) => brand);
}

function fillLabels(labels, extras, count) {
  const result = labels.filter((label) => matchingProducts(label).length);
  extras.forEach((label) => {
    if (result.length < count && !result.some((entry) => sameCollection(entry, label))) result.push(label);
  });
  return result.slice(0, count);
}

function renderFeaturedTiles() {
  const links = fillLabels(splitList(site.featuredLinks), topBrands(), 4);
  featuredTiles.innerHTML = links.map((label, index) => {
    const product = matchingProducts(label)[0] || products[index];
    return `
      <a class="feature-tile" href="${escapeAttribute(collectionHref(label))}">
        ${productImage(product, "tile")}
        <span>${escapeHtml(label)}</span>
      </a>
    `;
  }).join("");
}

function renderPromoGrid() {
  const families = [...new Set(products.map((product) => product.family).filter(Boolean))]
    .sort((a, b) => matchingProducts(b).length - matchingProducts(a).length);
  const cards = site.promoCards.filter((card) => matchingProducts(card.title).length);
  families.forEach((family) => {
    if (cards.length < 4 && !cards.some((card) => sameCollection(card.title, family))) {
      cards.push({ label: `${matchingProducts(family).length} fragrances`, title: family, button: "Shop now", image: "" });
    }
  });

  promoGrid.innerHTML = cards.slice(0, 4).map((card, index) => {
    const product = matchingProducts(card.title)[0] || products[index];
    return `
      <a class="promo-card" href="${escapeAttribute(collectionHref(card.title))}">
        <div class="promo-media">${card.image ? `<img src="${escapeAttribute(card.image)}" alt="${escapeAttribute(card.title)}">` : productImage(product, "tile")}</div>
        <div class="promo-copy">
          <span>${escapeHtml(card.label)}</span>
          <h3>${escapeHtml(card.title)}</h3>
          <strong class="primary-button">${escapeHtml(card.button)}</strong>
        </div>
      </a>
    `;
  }).join("");
}

function renderFamilyTiles() {
  const families = [...new Set(products.map((product) => product.family).filter(Boolean))].sort();
  familyTiles.innerHTML = families.map((family, index) => {
    const product = products.find((entry) => entry.family === family) || products[index];
    return `
      <a class="family-tile" href="collections.html?family=${encodeURIComponent(family)}">
        ${productImage(product, "tile")}
        <strong>${escapeHtml(family)}</strong>
      </a>
    `;
  }).join("");
}

function renderCollectionTabs() {
  const collections = getCollectionLabels();
  if (activeCollection !== "all" && !collections.some((collection) => sameCollection(collection, activeCollection))) {
    activeCollection = "all";
  }

  const tabs = ["all", ...collections];
  collectionTabs.innerHTML = tabs.map((collection) => {
    const isActive = collection === activeCollection;
    const label = collection === "all" ? "All Products" : collection;
    const count = collection === "all"
      ? products.length
      : matchingProducts(collection).length;

    return `
      <a class="collection-tab ${isActive ? "is-active" : ""}" href="${escapeAttribute(collection === "all" ? "index.html#shop" : collectionHref(collection))}" data-collection="${escapeAttribute(collection)}" aria-pressed="${isActive}">
        <span>${escapeHtml(label)}</span>
        <small>${count}</small>
      </a>
    `;
  }).join("");
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
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

function populateFamilies() {
  const families = [...new Set(products.map((product) => product.family).filter(Boolean))].sort();
  familyFilter.innerHTML = '<option value="all">All families</option>';
  families.forEach((family) => {
    const option = document.createElement("option");
    option.value = family;
    option.textContent = family;
    familyFilter.append(option);
  });
}

function filteredProducts() {
  const query = searchInput.value.trim().toLowerCase();
  const family = familyFilter.value;
  const sort = sortSelect.value;

  const filtered = products.filter((product) => {
    const haystack = `${product.name} ${product.brand} ${product.collection || ""} ${product.notes} ${product.description}`.toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const matchesFamily = family === "all" || product.family === family;
    const matchesCollection = activeCollection === "all" || productMatchesCollection(product, activeCollection);
    return matchesSearch && matchesFamily && matchesCollection;
  });

  return filtered.sort((a, b) => {
    if (sort === "price-low") return a.price - b.price;
    if (sort === "price-high") return b.price - a.price;
    if (sort === "name") return a.name.localeCompare(b.name);
    return 0;
  });
}

function renderProducts() {
  const visibleProducts = filteredProducts();
  productCount.textContent = `${visibleProducts.length} fragrance${visibleProducts.length === 1 ? "" : "s"}`;

  if (!visibleProducts.length) {
    productGrid.innerHTML = '<div class="empty-state">No fragrances match your search.</div>';
    return;
  }

  productGrid.innerHTML = visibleProducts.map((product) => `
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
          <button class="primary-button" type="button" data-add="${escapeAttribute(product.id)}" ${Number(product.stock) === 0 ? "disabled" : ""}>
            ${Number(product.stock) === 0 ? "Sold out" : "Add to bag"}
          </button>
        </div>
      </div>
    </article>
  `).join("");
}

function renderCart() {
  const quantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.id);
    return product ? sum + product.price * item.quantity : sum;
  }, 0);

  cartCount.textContent = quantity;
  cartTotal.textContent = currency.format(total);
  renderShippingProgress(shippingProgress, total);

  const activeItems = cart
    .map((item) => ({ ...item, product: products.find((product) => product.id === item.id) }))
    .filter((item) => item.product);

  cartEmpty.classList.toggle("is-visible", activeItems.length === 0);
  checkoutForm.style.display = activeItems.length ? "grid" : "none";

  cartItems.innerHTML = activeItems.map((item) => `
    <div class="cart-item">
      <div class="cart-thumb">${productImage(item.product)}</div>
      <div>
        <strong>${escapeHtml(item.product.name)}</strong>
        <p class="microcopy">${currency.format(item.product.price)} | ${escapeHtml(item.product.size)}</p>
      </div>
      <div class="quantity" aria-label="Quantity controls for ${escapeAttribute(item.product.name)}">
        <button type="button" data-decrease="${escapeAttribute(item.id)}" aria-label="Decrease quantity">-</button>
        <strong>${item.quantity}</strong>
        <button type="button" data-increase="${escapeAttribute(item.id)}" aria-label="Increase quantity">+</button>
      </div>
    </div>
  `).join("");

  renderFreeShippingPairings(cartPairings, activeItems, total);
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
}

async function loadReviewSummary() {
  try {
    const data = await requestJson(`${API_BASE}/api/reviews?summary=1`);
    reviewSummary = data.summary || {};
    if (Object.keys(reviewSummary).length) renderProducts();
  } catch {
    reviewSummary = {};
  }
}

function ratingBadge(productId) {
  const entry = reviewSummary[productId];
  if (!entry || !entry.count) return "<span>100% Authentic</span>";
  return `<span class="card-rating" aria-label="Rated ${entry.average.toFixed(1)} out of 5 from ${entry.count} reviews">&#9733; ${entry.average.toFixed(1)} (${entry.count})</span>`;
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
    ? `You're <strong>${currency.format(remaining)}</strong> away from free shipping`
    : "<strong>You've unlocked free standard shipping</strong>";

  container.innerHTML = `
    <p>${message}</p>
    <div class="shipping-progress-track"><span style="width: ${percent.toFixed(1)}%"></span></div>
  `;
}

function addToCart(productId) {
  const product = products.find((entry) => entry.id === productId);
  if (!product || Number(product.stock) === 0) return;

  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id: productId, quantity: 1 });
  }

  saveCart();
  renderCart();
  showToast(`${product.name} added to bag.`);
}

function updateQuantity(productId, change) {
  const product = products.find((entry) => entry.id === productId);
  const item = cart.find((entry) => entry.id === productId);
  if (!product || !item) return;

  item.quantity += change;
  if (item.quantity <= 0) {
    cart = cart.filter((entry) => entry.id !== productId);
  } else {
    item.quantity = Math.max(item.quantity, 1);
  }

  saveCart();
  renderCart();
}

function jumpToCollection(label) {
  window.location.href = collectionHref(label);
}

function openCart() {
  cartDrawer.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
  cartDrawer.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function navHref(label) {
  const normalized = String(label || "").toLowerCase();
  if (/help|faq|contact|shipping|return/.test(normalized)) return "help.html";
  if (/shop all|all fragrances|collections|new arrivals|best sellers/.test(normalized)) return "collections.html";
  return matchingProducts(label).length ? collectionHref(label) : "";
}

function collectionHref(label) {
  return `collection.html?collection=${encodeURIComponent(label)}`;
}

function getCollectionLabels() {
  return [
    ...new Set(products.flatMap((product) => [
      product.collection,
      product.brand,
      product.family
    ]).filter(Boolean))
  ].sort();
}

function matchingProducts(label) {
  return products.filter((product) => productMatchesCollection(product, label));
}

function productMatchesCollection(product, label) {
  const key = normalizeCollectionKey(label);
  return [
    product.collection,
    product.brand,
    product.family
  ].some((value) => normalizeCollectionKey(value) === key);
}

function sameCollection(left, right) {
  return normalizeCollectionKey(left) === normalizeCollectionKey(right);
}

function normalizeCollectionKey(value) {
  return String(value || "").trim().toLowerCase();
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

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (button) {
    addToCart(button.dataset.add);
    openCart();
  }
});

collectionTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-collection]");
  if (!button) return;

  event.preventDefault();
  activeCollection = button.dataset.collection;
  renderCollectionTabs();
  renderProducts();
});

cartItems.addEventListener("click", (event) => {
  const increase = event.target.closest("[data-increase]");
  const decrease = event.target.closest("[data-decrease]");

  if (increase) updateQuantity(increase.dataset.increase, 1);
  if (decrease) updateQuantity(decrease.dataset.decrease, -1);
});

cartPairings?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (button) addToCart(button.dataset.add);
});

document.querySelector(".cart-toggle").addEventListener("click", openCart);
document.querySelector(".cart-close").addEventListener("click", closeCart);
cartDrawer.addEventListener("click", (event) => {
  if (event.target === cartDrawer) closeCart();
});

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!cart.length) {
    showToast("Your bag is empty.");
    return;
  }

  window.location.href = "checkout.html";
});

vipForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = vipForm.querySelector("button[type='submit']");
  const formData = new FormData(vipForm);
  const email = String(formData.get("email") || "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    vipMessage.textContent = "Enter a valid email address.";
    return;
  }

  button.disabled = true;
  vipMessage.textContent = "Signing you up...";

  try {
    const data = await requestJson(`${API_BASE}/api/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        phone: formData.get("phone"),
        website: formData.get("website"),
        source: "homepage-footer"
      })
    });

    vipForm.reset();
    vipMessage.innerHTML = data.offer
      ? `You're in. Your code: <strong class="vip-code">${escapeHtml(data.offer.code)}</strong> ${escapeHtml(data.offer.text)}`
      : "You're on the VIP list. Watch your inbox for early drops.";
  } catch (error) {
    vipMessage.textContent = error instanceof TypeError ? "Signup failed. Check your connection and try again." : error.message;
  } finally {
    button.disabled = false;
  }
});

function getApiBase() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (window.location.protocol === "file:" || (localHosts.has(window.location.hostname) && window.location.port !== "4173")) {
    return "http://localhost:4173";
  }

  return "";
}

[searchInput, familyFilter, sortSelect].forEach((control) => {
  control.addEventListener("input", renderProducts);
});

loadStorefront();
renderCart();
