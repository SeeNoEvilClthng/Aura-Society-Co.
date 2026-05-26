const PRODUCTS_KEY = "auraSocietyProducts";
const CART_KEY = "auraSocietyCart";

const sampleProducts = [
  {
    id: "aurora-veil",
    name: "Aurora Veil",
    brand: "Aura Society Co.",
    price: 86,
    size: "50 ml",
    family: "Floral",
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
    notes: "Bergamot, neroli, mineral woods",
    description: "Bright citrus with a dry woods base for everyday wear.",
    stock: 24,
    image: ""
  }
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

let products = loadProducts();
let cart = loadCart();

const productGrid = document.querySelector("#productGrid");
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
const toast = document.querySelector("#toast");

function loadProducts() {
  const stored = localStorage.getItem(PRODUCTS_KEY);
  if (!stored) {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(sampleProducts));
    return sampleProducts;
  }

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(sampleProducts));
    return sampleProducts;
  }
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
    const haystack = `${product.name} ${product.brand} ${product.notes} ${product.description}`.toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const matchesFamily = family === "all" || product.family === family;
    return matchesSearch && matchesFamily;
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
          <span>${product.family}</span>
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

checkoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  cart = [];
  saveCart();
  renderCart();
  closeCart();
  checkoutForm.reset();
  showToast("Demo order placed. Add live payments when you are ready.");
});

[searchInput, familyFilter, sortSelect].forEach((control) => {
  control.addEventListener("input", renderProducts);
});

populateFamilies();
renderProducts();
renderCart();
