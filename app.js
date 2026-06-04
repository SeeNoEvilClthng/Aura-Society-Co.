const CART_KEY = "auraSocietyCart";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const defaultSite = {
  topBanner: "Free standard shipping on fragrance orders $100+ USD",
  navLinks: "New Arrivals, Best Sellers, Collections, Fragrance Oils, Gift Cards, Help",
  heroKicker: "New fragrance drop",
  heroTitle: "Aura Society Co. Signature Scents",
  heroSubtitle: "A bold fragrance marketplace for elevated oils, extrait sprays, and daily signature scents.",
  heroButton: "Shop the collection",
  featuredTitle: "Featured",
  featuredLinks: "Signature Collection, Evening Reserve, Daily Rituals, Fragrance Oils",
  collectionsTitle: "Collections",
  trendingTitle: "Trending",
  brandsTitle: "Scent Families",
  helpTitle: "Need help",
  vipTitle: "Become a VIP",
  vipText: "Subscribe to get early access to drops, exclusive offers, and fragrance restocks.",
  promoCards: [
    { label: "Just arrived", title: "Signature Collection", button: "Shop now", image: "" },
    { label: "Warm + bold", title: "Evening Reserve", button: "Shop now", image: "" },
    { label: "Everyday wear", title: "Daily Rituals", button: "Shop now", image: "" },
    { label: "Layer your aura", title: "Fragrance Oils", button: "Shop now", image: "" }
  ]
};

const API_BASE = getApiBase();
let products = [];
let site = defaultSite;
let activeCollection = "all";
let cart = loadCart();

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
  } catch (error) {
    productGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    showToast(error.message);
  }
}

async function fetchProducts() {
  try {
    const data = await requestJson(`${API_BASE}/api/products`);
    return Array.isArray(data.products) ? data.products : [];
  } catch {
    const fallback = await requestJson("/catalog/products.json");
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

function renderNav() {
  const links = splitList(site.navLinks);
  primaryNav.innerHTML = links.map((label) => `<a href="${escapeAttribute(navHref(label))}">${escapeHtml(label)}</a>`).join("");
}

function renderHeroPanels() {
  const heroProducts = products.slice(0, 3);
  heroPanels.innerHTML = [0, 1, 2].map((index) => {
    const product = heroProducts[index];
    return `
      <div class="hero-panel">
        ${productImage(product, "hero")}
        <span>${escapeHtml(product?.collection || product?.family || "Aura Society Co.")}</span>
      </div>
    `;
  }).join("");
}

function renderFeaturedTiles() {
  const links = splitList(site.featuredLinks).slice(0, 4);
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
  promoGrid.innerHTML = site.promoCards.slice(0, 4).map((card, index) => {
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
  if (product?.image) {
    return `<img src="${escapeAttribute(product.image)}" alt="${escapeAttribute(product.name)} fragrance">`;
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
          <button class="primary-button" type="button" data-add="${escapeAttribute(product.id)}">
            Add to bag
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
  if (normalized.includes("collection") || normalized.includes("new") || normalized.includes("seller") || normalized.includes("oil")) {
    return "collections.html";
  }
  if (normalized.includes("help")) return "mailto:support@aurasocietyco.com";
  if (normalized.includes("gift")) return "collections.html";
  return "collections.html";
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
