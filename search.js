const SEARCH_API_BASE = getSearchApiBase();
let searchProducts = [];
let searchReady = false;

const searchOverlay = document.querySelector("#siteSearchOverlay");
const searchInput = document.querySelector("#siteSearchInput");
const searchResults = document.querySelector("#siteSearchResults");
const searchOpenButtons = document.querySelectorAll(".search-open");
const searchCloseButton = document.querySelector(".site-search-close");

if (searchOverlay && searchInput && searchResults) {
  searchOpenButtons.forEach((button) => {
    button.addEventListener("click", openSiteSearch);
  });
  searchCloseButton?.addEventListener("click", closeSiteSearch);
  searchOverlay.addEventListener("click", (event) => {
    if (event.target === searchOverlay) closeSiteSearch();
  });
  searchInput.addEventListener("input", renderSearchResults);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const firstResult = searchResults.querySelector("a");
      if (firstResult) {
        event.preventDefault();
        window.location.href = firstResult.href;
      }
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && searchOverlay.classList.contains("is-open")) {
      closeSiteSearch();
    }
  });
  renderSearchEmptyState();
}

async function openSiteSearch() {
  searchOverlay.classList.add("is-open");
  searchOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("search-lock");
  window.setTimeout(() => searchInput.focus(), 0);

  if (!searchReady) {
    searchResults.innerHTML = '<div class="site-search-empty">Loading fragrances...</div>';
    try {
      searchProducts = await fetchSearchProducts();
      searchReady = true;
      renderSearchResults();
    } catch (error) {
      searchResults.innerHTML = `<div class="site-search-empty">${escapeSearchHtml(error.message)}</div>`;
    }
  }
}

function closeSiteSearch() {
  searchOverlay.classList.remove("is-open");
  searchOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("search-lock");
}

async function fetchSearchProducts() {
  try {
    const data = await requestSearchJson(`${SEARCH_API_BASE}/api/products`);
    return Array.isArray(data.products) ? data.products : [];
  } catch {
    const fallback = await requestSearchJson("/catalog/products.json");
    return Array.isArray(fallback) ? fallback : [];
  }
}

async function requestSearchJson(url) {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Search could not load products.");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Search could not load products.");
  }

  return data;
}

function renderSearchResults() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    renderSearchEmptyState();
    return;
  }

  const matches = searchProducts.filter((product) => {
    const haystack = [
      product.name,
      product.brand,
      product.collection,
      product.family,
      product.notes,
      product.description,
      product.size
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  }).slice(0, 10);

  if (!matches.length) {
    searchResults.innerHTML = `<div class="site-search-empty">No results for "${escapeSearchHtml(searchInput.value)}".</div>`;
    return;
  }

  searchResults.innerHTML = `
    <p class="site-search-count">${matches.length} result${matches.length === 1 ? "" : "s"}</p>
    ${matches.map((product) => `
      <a class="site-search-result" href="product.html?id=${encodeURIComponent(product.id)}">
        <div class="site-search-thumb">${searchProductImage(product)}</div>
        <div>
          <strong>${escapeSearchHtml(product.name)}</strong>
          <span>${escapeSearchHtml(product.brand)} | ${escapeSearchHtml(product.collection || product.family || "Fragrance")}</span>
          <small>${escapeSearchHtml(product.notes || product.description || product.size || "")}</small>
        </div>
        <b>${formatSearchPrice(product.price)}</b>
      </a>
    `).join("")}
  `;
}

function renderSearchEmptyState() {
  const collections = [...new Set(searchProducts.map((product) => product.collection).filter(Boolean))].slice(0, 5);
  searchResults.innerHTML = `
    <div class="site-search-empty">
      <p>Start typing to search fragrances, notes, collections, or scent families.</p>
      ${collections.length ? `<div class="site-search-suggestions">${collections.map((collection) => `<a href="collection.html?collection=${encodeURIComponent(collection)}">${escapeSearchHtml(collection)}</a>`).join("")}</div>` : ""}
    </div>
  `;
}

function searchProductImage(product) {
  if (product?.image) {
    return `<img src="${escapeSearchAttribute(product.image)}" alt="${escapeSearchAttribute(product.name)}">`;
  }

  return `<span>${escapeSearchHtml(product?.name?.charAt(0) || "A")}</span>`;
}

function formatSearchPrice(price) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(price) || 0);
}

function getSearchApiBase() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (window.location.protocol === "file:" || (localHosts.has(window.location.hostname) && window.location.port !== "4173")) {
    return "http://localhost:4173";
  }

  return "";
}

function escapeSearchHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeSearchAttribute(value) {
  return escapeSearchHtml(value);
}
