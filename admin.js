const AUTH_KEY = "auraSocietyAdminAuth";
const ADMIN_USERNAME = "XThaBoss2";
const ADMIN_PASSWORD = "ZaraAleah12!";
const LOCAL_API_BASE = "http://localhost:4173";
const LEGACY_PRODUCTS_KEY = "auraSocietyProducts";
const LEGACY_MIGRATION_KEY = "auraSocietyProductsMigrated";

const sampleProducts = [
  {
    id: "aurora-veil",
    name: "Aurora Veil",
    brand: "Aura Society Co.",
    price: 86,
    size: "50 ml",
    family: "Floral",
    collection: "Signature Collection",
    notes: "Pear blossom, jasmine silk, white musk",
    description: "A clean floral with soft projection and a polished, airy finish.",
    stock: 18,
    image: ""
  },
  {
    id: "midnight-ember",
    name: "Midnight Ember",
    brand: "Aura Society Co.",
    price: 96,
    size: "50 ml",
    family: "Amber",
    collection: "Evening Reserve",
    notes: "Saffron, cedar, vanilla smoke",
    description: "Warm, resinous, and refined for evenings that linger.",
    stock: 9,
    image: ""
  },
  {
    id: "citrus-accord",
    name: "Citrus Accord",
    brand: "Aura Society Co.",
    price: 74,
    size: "30 ml",
    family: "Citrus",
    collection: "Daily Rituals",
    notes: "Bergamot, neroli, mineral woods",
    description: "Bright citrus with a dry woods base for everyday wear.",
    stock: 24,
    image: ""
  }
];

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

let products = [];
let site = defaultSite;
let selectedImage = "";

const loginShell = document.querySelector("#loginShell");
const adminShell = document.querySelector("#adminShell");
const loginForm = document.querySelector("#loginForm");
const adminUsername = document.querySelector("#adminUsername");
const adminPassword = document.querySelector("#adminPassword");
const loginError = document.querySelector("#loginError");
const logoutButton = document.querySelector("#logoutButton");
const form = document.querySelector("#productForm");
const productId = document.querySelector("#productId");
const productName = document.querySelector("#productName");
const productBrand = document.querySelector("#productBrand");
const productPrice = document.querySelector("#productPrice");
const productSize = document.querySelector("#productSize");
const productFamily = document.querySelector("#productFamily");
const productCollection = document.querySelector("#productCollection");
const collectionOptions = document.querySelector("#collectionOptions");
const productStock = document.querySelector("#productStock");
const productNotes = document.querySelector("#productNotes");
const productDescription = document.querySelector("#productDescription");
const productImage = document.querySelector("#productImage");
const imagePreview = document.querySelector("#imagePreview");
const productList = document.querySelector("#adminProductList");
const siteForm = document.querySelector("#siteForm");
const saveSiteButton = document.querySelector("#saveSiteButton");
const siteTopBanner = document.querySelector("#siteTopBanner");
const siteNavLinks = document.querySelector("#siteNavLinks");
const siteHeroKicker = document.querySelector("#siteHeroKicker");
const siteHeroTitle = document.querySelector("#siteHeroTitle");
const siteHeroSubtitle = document.querySelector("#siteHeroSubtitle");
const siteHeroButton = document.querySelector("#siteHeroButton");
const siteFeaturedTitle = document.querySelector("#siteFeaturedTitle");
const siteFeaturedLinks = document.querySelector("#siteFeaturedLinks");
const siteCollectionsTitle = document.querySelector("#siteCollectionsTitle");
const siteTrendingTitle = document.querySelector("#siteTrendingTitle");
const siteBrandsTitle = document.querySelector("#siteBrandsTitle");
const siteHelpTitle = document.querySelector("#siteHelpTitle");
const siteVipTitle = document.querySelector("#siteVipTitle");
const siteVipText = document.querySelector("#siteVipText");
const promoEditor = document.querySelector("#promoEditor");
const saveProductButton = document.querySelector("#saveProductButton");
const resetButton = document.querySelector("#resetButton");
const seedButton = document.querySelector("#seedButton");
const exportButton = document.querySelector("#exportButton");
const toast = document.querySelector("#toast");

function isAuthenticated() {
  return localStorage.getItem(AUTH_KEY) === "true";
}

async function setAdminVisible(isVisible) {
  loginShell.classList.toggle("hidden", isVisible);
  adminShell.classList.toggle("hidden", !isVisible);
  logoutButton.classList.toggle("hidden", !isVisible);
  exportButton.classList.toggle("hidden", !isVisible);

  if (isVisible) {
    await Promise.all([loadProducts(), loadSite()]);
    await migrateLegacyProducts();
    refreshSiteUI();
    refreshProductsUI();
  } else {
    window.setTimeout(() => adminUsername.focus(), 0);
  }
}

async function loadProducts() {
  try {
    productList.innerHTML = '<div class="empty-state">Loading products...</div>';
    const data = await requestJson("/api/products");
    products = Array.isArray(data.products) ? data.products : [];
  } catch (error) {
    products = [];
    productList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    showToast(error.message);
  }
}

async function loadSite() {
  try {
    const data = await requestJson("/api/site");
    site = normalizeSite(data.site || defaultSite);
  } catch (error) {
    site = defaultSite;
    showToast(error.message);
  }
}

async function migrateLegacyProducts() {
  if (localStorage.getItem(LEGACY_MIGRATION_KEY) === "true") return;

  let legacyProducts = [];
  try {
    legacyProducts = JSON.parse(localStorage.getItem(LEGACY_PRODUCTS_KEY)) || [];
  } catch {
    legacyProducts = [];
  }

  if (!Array.isArray(legacyProducts) || !legacyProducts.length) {
    localStorage.setItem(LEGACY_MIGRATION_KEY, "true");
    return;
  }

  const existingIds = new Set(products.map((product) => product.id));
  const additions = legacyProducts.filter((product) => product && product.id && !existingIds.has(product.id));

  if (additions.length) {
    products = [...additions, ...products];
    await saveProducts();
    await loadProducts();
    showToast("Recovered previously saved browser products.");
  }

  localStorage.setItem(LEGACY_MIGRATION_KEY, "true");
}

function renderCollectionOptions() {
  const collections = [...new Set(products.map((product) => product.collection).filter(Boolean))].sort();
  collectionOptions.innerHTML = collections.map((collection) => `<option value="${escapeAttribute(collection)}"></option>`).join("");
}

function refreshProductsUI() {
  renderCollectionOptions();
  renderProducts();
}

function refreshSiteUI() {
  site = normalizeSite(site);
  siteTopBanner.value = site.topBanner;
  siteNavLinks.value = site.navLinks;
  siteHeroKicker.value = site.heroKicker;
  siteHeroTitle.value = site.heroTitle;
  siteHeroSubtitle.value = site.heroSubtitle;
  siteHeroButton.value = site.heroButton;
  siteFeaturedTitle.value = site.featuredTitle;
  siteFeaturedLinks.value = site.featuredLinks;
  siteCollectionsTitle.value = site.collectionsTitle;
  siteTrendingTitle.value = site.trendingTitle;
  siteBrandsTitle.value = site.brandsTitle;
  siteHelpTitle.value = site.helpTitle;
  siteVipTitle.value = site.vipTitle;
  siteVipText.value = site.vipText;
  renderPromoEditor();
}

async function saveProducts() {
  const data = await requestJson("/api/products", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ products })
  });

  products = Array.isArray(data.products) ? data.products : products;
}

async function saveProduct(product) {
  const data = await requestJson("/api/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ product })
  });

  products = Array.isArray(data.products) ? data.products : products;
}

async function deleteProduct(product) {
  const data = await requestJson(`/api/products?id=${encodeURIComponent(product.id)}`, {
    method: "DELETE"
  });

  products = Array.isArray(data.products) ? data.products : products;
}

async function saveSite() {
  const data = await requestJson("/api/site", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ site })
  });

  site = normalizeSite(data.site || site);
}

async function requestJson(url, options) {
  const urls = getApiUrls(url);
  let lastError;

  for (const candidate of urls) {
    try {
      return await fetchJson(candidate, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Changes could not save.");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON from ${url}.`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Changes could not save.");
  }

  return data;
}

function getApiUrls(path) {
  const sameOriginUrl = path;
  const localApiUrl = `${LOCAL_API_BASE}${path}`;
  return getShouldPreferLocalApi() ? [localApiUrl, sameOriginUrl] : [sameOriginUrl, localApiUrl];
}

function getShouldPreferLocalApi() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", ""]);
  return window.location.protocol === "file:" || (localHosts.has(window.location.hostname) && window.location.port !== "4173");
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function productImageMarkup(product) {
  if (product.image) {
    return `<img src="${escapeAttribute(product.image)}" alt="${escapeAttribute(product.name)}">`;
  }

  return `<div class="product-placeholder" aria-hidden="true">${escapeHtml(product.name.charAt(0))}</div>`;
}

function renderPreview(image) {
  if (!image) {
    imagePreview.innerHTML = "<span>No image selected</span>";
    return;
  }

  imagePreview.innerHTML = `<img src="${escapeAttribute(image)}" alt="Selected product preview">`;
}

function renderPromoEditor() {
  promoEditor.innerHTML = site.promoCards.map((card, index) => `
    <fieldset class="promo-edit-card">
      <legend>Homepage card ${index + 1}</legend>
      <label>
        Small label
        <input class="input" data-promo="${index}" data-promo-field="label" value="${escapeAttribute(card.label)}">
      </label>
      <label>
        Card title / collection
        <input class="input" data-promo="${index}" data-promo-field="title" value="${escapeAttribute(card.title)}">
      </label>
      <label>
        Button text
        <input class="input" data-promo="${index}" data-promo-field="button" value="${escapeAttribute(card.button)}">
      </label>
      <label>
        Card image
        <input class="input file-input" type="file" accept="image/*" data-promo-image="${index}">
      </label>
      <div class="image-preview promo-preview">${card.image ? `<img src="${escapeAttribute(card.image)}" alt="${escapeAttribute(card.title)}">` : "<span>No card image selected</span>"}</div>
    </fieldset>
  `).join("");
}

function clearForm() {
  form.reset();
  productId.value = "";
  selectedImage = "";
  renderPreview("");
  if (!adminShell.classList.contains("hidden")) {
    productName.focus();
  }
}

function fillForm(product) {
  productId.value = product.id;
  productName.value = product.name;
  productBrand.value = product.brand;
  productPrice.value = product.price;
  productSize.value = product.size;
  productFamily.value = product.family;
  productCollection.value = product.collection || "";
  productStock.value = product.stock;
  productNotes.value = product.notes;
  productDescription.value = product.description;
  selectedImage = product.image || "";
  renderPreview(selectedImage);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderProducts() {
  if (!products.length) {
    productList.innerHTML = '<div class="empty-state">No products yet. Add your first fragrance with the form.</div>';
    return;
  }

  productList.innerHTML = products.map((product) => `
    <article class="admin-product">
      <div class="admin-thumb">${productImageMarkup(product)}</div>
      <div>
        <strong>${escapeHtml(product.name)}</strong>
        <p>${escapeHtml(product.brand)} | ${escapeHtml(product.collection || "No collection")} | $${Number(product.price).toFixed(2)}</p>
        <p>${escapeHtml(product.family)} | ${product.stock} in stock | ${escapeHtml(product.size)}</p>
      </div>
      <div class="admin-actions">
        <button class="mini-button" type="button" data-edit="${escapeAttribute(product.id)}">Edit</button>
        <button class="mini-button danger" type="button" data-delete="${escapeAttribute(product.id)}">Delete</button>
      </div>
    </article>
  `).join("");
}

function siteFromForm() {
  return normalizeSite({
    topBanner: siteTopBanner.value,
    navLinks: siteNavLinks.value,
    heroKicker: siteHeroKicker.value,
    heroTitle: siteHeroTitle.value,
    heroSubtitle: siteHeroSubtitle.value,
    heroButton: siteHeroButton.value,
    featuredTitle: siteFeaturedTitle.value,
    featuredLinks: siteFeaturedLinks.value,
    collectionsTitle: siteCollectionsTitle.value,
    trendingTitle: siteTrendingTitle.value,
    brandsTitle: siteBrandsTitle.value,
    helpTitle: siteHelpTitle.value,
    vipTitle: siteVipTitle.value,
    vipText: siteVipText.value,
    promoCards: site.promoCards
  });
}

function normalizeSite(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...defaultSite,
    ...source,
    promoCards: normalizePromoCards(source.promoCards)
  };
}

function normalizePromoCards(cards) {
  const sourceCards = Array.isArray(cards) ? cards : [];
  return defaultSite.promoCards.map((fallback, index) => {
    const card = sourceCards[index] && typeof sourceCards[index] === "object" ? sourceCards[index] : {};
    return {
      label: String(card.label || fallback.label).trim(),
      title: String(card.title || fallback.title).trim(),
      button: String(card.button || fallback.button).trim(),
      image: String(card.image || fallback.image || "").trim()
    };
  });
}

function showToast(message) {
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

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const username = adminUsername.value.trim();
  const password = adminPassword.value;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    localStorage.setItem(AUTH_KEY, "true");
    loginError.textContent = "";
    loginForm.reset();
    setAdminVisible(true);
    showToast("Admin unlocked.");
    return;
  }

  loginError.textContent = "Username or password is incorrect.";
  adminPassword.value = "";
  adminPassword.focus();
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem(AUTH_KEY);
  clearForm();
  setAdminVisible(false);
  showToast("Logged out.");
});

productImage.addEventListener("change", () => {
  const file = productImage.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    selectedImage = reader.result;
    renderPreview(selectedImage);
  });
  reader.readAsDataURL(file);
});

siteForm.addEventListener("input", (event) => {
  const promoInput = event.target.closest("[data-promo]");
  if (!promoInput) {
    site = siteFromForm();
    return;
  }

  const index = Number(promoInput.dataset.promo);
  const field = promoInput.dataset.promoField;
  site.promoCards[index][field] = promoInput.value;
});

promoEditor.addEventListener("change", (event) => {
  const input = event.target.closest("[data-promo-image]");
  if (!input || !input.files[0]) return;

  const index = Number(input.dataset.promoImage);
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    site.promoCards[index].image = reader.result;
    renderPromoEditor();
  });
  reader.readAsDataURL(input.files[0]);
});

saveSiteButton.addEventListener("click", async () => {
  saveSiteButton.disabled = true;
  saveSiteButton.textContent = "Saving...";
  site = siteFromForm();

  try {
    await saveSite();
    refreshSiteUI();
    showToast("Homepage saved.");
  } catch (error) {
    showToast(error.message);
  } finally {
    saveSiteButton.disabled = false;
    saveSiteButton.textContent = "Save homepage";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveProductButton.disabled = true;
  saveProductButton.textContent = "Saving...";

  const duplicateKey = getProductDuplicateKey({
    name: productName.value,
    brand: productBrand.value,
    size: productSize.value
  });
  const existing = products.find((product) => {
    if (productId.value && product.id === productId.value) return true;
    return getProductDuplicateKey(product) === duplicateKey;
  });
  const id = existing?.id || `${slugify(productName.value)}-${Date.now().toString(36)}`;
  const product = {
    id,
    name: productName.value.trim(),
    brand: productBrand.value.trim(),
    price: Number(productPrice.value),
    size: productSize.value.trim(),
    family: productFamily.value,
    collection: productCollection.value.trim() || "Signature Collection",
    stock: Number(productStock.value),
    notes: productNotes.value.trim(),
    description: productDescription.value.trim(),
    image: selectedImage
  };

  try {
    await saveProduct(product);
    await loadProducts();
    clearForm();
    refreshProductsUI();
    showToast(existing ? "Matching fragrance updated." : "Product added.");
  } catch (error) {
    showToast(error.message);
  } finally {
    saveProductButton.disabled = false;
    saveProductButton.textContent = "Save product";
  }
});

productList.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-delete]");

  if (edit) {
    const product = products.find((entry) => entry.id === edit.dataset.edit);
    if (product) fillForm(product);
  }

  if (remove) {
    const product = products.find((entry) => entry.id === remove.dataset.delete);
    if (!product) return;
    const confirmed = window.confirm(`Delete ${product.name}?`);
    if (!confirmed) return;
    try {
      await deleteProduct(product);
      await loadProducts();
      refreshProductsUI();
      showToast("Product deleted.");
    } catch (error) {
      showToast(error.message);
    }
  }
});

function getProductDuplicateKey(product) {
  return [
    product.name,
    product.brand,
    product.size
  ].map((value) => String(value || "").trim().toLowerCase()).join("|");
}

resetButton.addEventListener("click", clearForm);

seedButton.addEventListener("click", async () => {
  try {
    products = sampleProducts;
    await saveProducts();
    await loadProducts();
    clearForm();
    refreshProductsUI();
    showToast("Sample products restored.");
  } catch (error) {
    showToast(error.message);
  }
});

exportButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ site, products }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "aura-society-storefront.json";
  link.click();
  URL.revokeObjectURL(url);
});

setAdminVisible(isAuthenticated());
