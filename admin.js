const AUTH_KEY = "auraSocietyAdminAuth";
const ADMIN_USERNAME = "XThaBoss2";
const ADMIN_PASSWORD = "ZaraAleah12!";
const API_BASE = getApiBase();

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

let products = [];
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
    await loadProducts();
    renderProducts();
  } else {
    window.setTimeout(() => adminUsername.focus(), 0);
  }
}

async function loadProducts() {
  try {
    productList.innerHTML = '<div class="empty-state">Loading products...</div>';
    const data = await requestJson(`${API_BASE}/api/products`);
    products = Array.isArray(data.products) ? data.products : [];
    renderCollectionOptions();
  } catch (error) {
    products = [];
    productList.innerHTML = `<div class="empty-state">${error.message}</div>`;
    showToast(error.message);
  }
}

function renderCollectionOptions() {
  const collections = [...new Set(products.map((product) => product.collection).filter(Boolean))].sort();
  collectionOptions.innerHTML = collections.map((collection) => `<option value="${collection}"></option>`).join("");
}

async function saveProducts() {
  const data = await requestJson(`${API_BASE}/api/products`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ products })
  });

  products = Array.isArray(data.products) ? data.products : products;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    await response.text();
    throw new Error("Admin product saving requires the Node server. Run npm start and open http://localhost:4173/admin.html.");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Products could not save.");
  }

  return data;
}

function getApiBase() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (localHosts.has(window.location.hostname) && window.location.port !== "4173") {
    return "http://localhost:4173";
  }

  return "";
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
    return `<img src="${product.image}" alt="${product.name}">`;
  }

  return `<div class="product-placeholder" aria-hidden="true">${product.name.charAt(0)}</div>`;
}

function renderPreview(image) {
  if (!image) {
    imagePreview.innerHTML = "<span>No image selected</span>";
    return;
  }

  imagePreview.innerHTML = `<img src="${image}" alt="Selected product preview">`;
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
        <strong>${product.name}</strong>
        <p>${product.brand} | ${product.collection || "No collection"} | $${Number(product.price).toFixed(2)}</p>
        <p>${product.family} | ${product.stock} in stock | ${product.size}</p>
      </div>
      <div class="admin-actions">
        <button class="mini-button" type="button" data-edit="${product.id}">Edit</button>
        <button class="mini-button danger" type="button" data-delete="${product.id}">Delete</button>
      </div>
    </article>
  `).join("");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = productId.value || `${slugify(productName.value)}-${Date.now().toString(36)}`;
  const existing = products.find((product) => product.id === id);
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
    if (existing) {
      products = products.map((entry) => entry.id === id ? product : entry);
      showToast("Product updated.");
    } else {
      products = [product, ...products];
      showToast("Product added.");
    }

    await saveProducts();
    renderCollectionOptions();
    renderProducts();
    clearForm();
  } catch (error) {
    showToast(error.message);
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
      products = products.filter((entry) => entry.id !== product.id);
      await saveProducts();
      renderCollectionOptions();
      renderProducts();
      showToast("Product deleted.");
    } catch (error) {
      showToast(error.message);
    }
  }
});

resetButton.addEventListener("click", clearForm);

seedButton.addEventListener("click", async () => {
  try {
    products = sampleProducts;
    await saveProducts();
    clearForm();
    renderCollectionOptions();
    renderProducts();
    showToast("Sample products restored.");
  } catch (error) {
    showToast(error.message);
  }
});

exportButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "aura-society-products.json";
  link.click();
  URL.revokeObjectURL(url);
});

setAdminVisible(isAuthenticated());
