const CART_KEY = "auraSocietyCart";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const API_BASE = getApiBase();
let products = [];
let activeCollection = "all";
let cart = loadCart();

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

async function loadProducts() {
  productGrid.innerHTML = '<div class="empty-state">Loading fragrances...</div>';

  try {
    products = await fetchProducts();
    populateFamilies();
    renderCollectionTabs();
    renderProducts();
    renderCart();
  } catch (error) {
    productGrid.innerHTML = `<div class="empty-state">${error.message}</div>`;
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

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`Expected JSON from ${url}, received: ${text.slice(0, 80)}`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Products could not load.");
  }

  return data;
}

function renderCollectionTabs() {
  const collections = [...new Set(products.map((product) => product.collection).filter(Boolean))].sort();
  const tabs = ["all", ...collections];

  collectionTabs.innerHTML = tabs.map((collection) => {
    const isActive = collection === activeCollection;
    const label = collection === "all" ? "All Collections" : collection;
    const count = collection === "all"
      ? products.length
      : products.filter((product) => product.collection === collection).length;

    return `
      <button class="collection-tab ${isActive ? "is-active" : ""}" type="button" data-collection="${collection}" aria-pressed="${isActive}">
        <span>${label}</span>
        <small>${count}</small>
      </button>
    `;
  }).join("");
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function productImage(product) {
  if (product.image) {
    return `<img src="${product.image}" alt="${product.name} fragrance bottle">`;
  }

  return `<div class="product-placeholder" aria-hidden="true">${product.name.charAt(0)}</div>`;
}

function populateFamilies() {
  const families = [...new Set(products.map((product) => product.family))].sort();
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
    const matchesCollection = activeCollection === "all" || product.collection === activeCollection;
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
    <article class="product-card">
      <div class="product-image">${productImage(product)}</div>
      <div class="product-info">
        <div>
          <div class="product-meta">
            <span>${product.brand}</span>
            <span>${product.size}</span>
          </div>
          <h3>${product.name}</h3>
          <p class="notes">${product.notes}</p>
        </div>
        <div class="product-meta">
          <span>${product.collection || product.family}</span>
          <span>${product.stock > 0 ? `${product.stock} in stock` : "Sold out"}</span>
        </div>
        <div class="price-row">
          <span class="price">${currency.format(product.price)}</span>
          <button class="primary-button" type="button" data-add="${product.id}" ${product.stock <= 0 ? "disabled" : ""}>
            Add to cart
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
        <strong>${item.product.name}</strong>
        <p class="microcopy">${currency.format(item.product.price)} | ${item.product.size}</p>
      </div>
      <div class="quantity" aria-label="Quantity controls for ${item.product.name}">
        <button type="button" data-decrease="${item.id}" aria-label="Decrease quantity">-</button>
        <strong>${item.quantity}</strong>
        <button type="button" data-increase="${item.id}" aria-label="Increase quantity">+</button>
      </div>
    </div>
  `).join("");
}

function addToCart(productId) {
  const product = products.find((entry) => entry.id === productId);
  if (!product || product.stock <= 0) return;

  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + 1, product.stock);
  } else {
    cart.push({ id: productId, quantity: 1 });
  }

  saveCart();
  renderCart();
  showToast(`${product.name} added to cart.`);
}

function updateQuantity(productId, change) {
  const product = products.find((entry) => entry.id === productId);
  const item = cart.find((entry) => entry.id === productId);
  if (!product || !item) return;

  item.quantity += change;
  if (item.quantity <= 0) {
    cart = cart.filter((entry) => entry.id !== productId);
  } else {
    item.quantity = Math.min(item.quantity, product.stock);
  }

  saveCart();
  renderCart();
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

  const activeItems = cart
    .map((item) => ({ ...item, product: products.find((product) => product.id === item.id) }))
    .filter((item) => item.product);

  if (!activeItems.length) {
    showToast("Your cart is empty.");
    return;
  }

  const formData = new FormData(checkoutForm);
  checkoutButton.disabled = true;
  checkoutButton.textContent = "Opening Stripe...";

  try {
    const response = await fetch(`${API_BASE}/api/create-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        customer: {
          name: formData.get("name"),
          email: formData.get("email"),
          address: formData.get("address")
        },
        items: activeItems.map((item) => ({
          id: item.product.id,
          name: item.product.name,
          price: item.product.price,
          size: item.product.size,
          notes: item.product.notes,
          description: item.product.description,
          quantity: item.quantity
        }))
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Stripe checkout could not start.");
    }

    window.location.href = data.url;
  } catch (error) {
    showToast(error.message);
    checkoutButton.disabled = false;
    checkoutButton.textContent = "Pay with Stripe";
  }
});

function getApiBase() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (localHosts.has(window.location.hostname) && window.location.port !== "4173") {
    return "http://localhost:4173";
  }

  return "";
}

[searchInput, familyFilter, sortSelect].forEach((control) => {
  control.addEventListener("input", renderProducts);
});

loadProducts();
renderCart();
