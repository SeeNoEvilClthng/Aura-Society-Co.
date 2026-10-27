const fs = require("fs");
const path = require("path");

const BRAND = "Aura Society Co.";
const DEFAULT_DESCRIPTION = "Shop 100% authentic designer and niche fragrances from Creed, Maison Francis Kurkdjian, Parfums de Marly, Tom Ford, Louis Vuitton and more. Free standard shipping on orders $100+.";
const LOGO_PATH = "/assets/branding/aura-society-logo.png";

// Literal paths so Vercel's file tracing bundles the templates with each function.
const templatePaths = {
  index: path.join(__dirname, "..", "templates", "index.html"),
  collections: path.join(__dirname, "..", "templates", "collections.html"),
  collection: path.join(__dirname, "..", "templates", "collection.html"),
  product: path.join(__dirname, "..", "templates", "product.html")
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function getSiteUrl(request) {
  // Ignore a localhost SITE_URL in production so canonical links and the sitemap stay public.
  const configured = (process.env.SITE_URL || "").replace(/\/$/, "");
  const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(configured);
  if (configured && !(isLocalUrl && process.env.VERCEL)) return configured;
  if (process.env.VERCEL && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;

  const headers = request.headers || {};
  const host = headers["x-forwarded-host"] || headers.host || "localhost:4173";
  const proto = headers["x-forwarded-proto"] || (/^(localhost|127\.0\.0\.1)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

function pageNeedsProducts(page) {
  return page === "collections" || page === "collection" || page === "product";
}

function renderPage(page, { products = [], query = {}, siteUrl }) {
  const template = fs.readFileSync(templatePaths[page] || templatePaths.index, "utf8");

  if (page === "product") return renderProduct(template, products, query.id, siteUrl);
  if (page === "collection") return renderCollection(template, products, query.collection, siteUrl);
  if (page === "collections") return renderCollections(template, products, siteUrl);
  return renderIndex(template, siteUrl);
}

function renderIndex(template, siteUrl) {
  const title = `${BRAND} | Authentic Designer & Niche Fragrances`;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BRAND,
      url: `${siteUrl}/`,
      logo: `${siteUrl}${LOGO_PATH}`,
      email: "support@aurasocietyco.com"
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: BRAND,
      url: `${siteUrl}/`
    }
  ];

  return applyHead(template, {
    title,
    description: DEFAULT_DESCRIPTION,
    canonical: `${siteUrl}/`,
    image: `${siteUrl}${LOGO_PATH}`,
    type: "website",
    structuredData
  });
}

function renderCollections(template, products, siteUrl) {
  const collections = getCollections(products);
  const html = applyHead(template, {
    title: `Shop Fragrances by Brand & Scent Family | ${BRAND}`,
    description: `Browse ${products.length} authentic fragrances by brand, collection, and scent family. ${shippingLine()}`,
    canonical: `${siteUrl}/collections.html`,
    image: `${siteUrl}${LOGO_PATH}`,
    type: "website"
  });

  const links = collections.map((collection) => `<a class="promo-card" href="${escapeHtml(collectionPath(collection))}"><div class="promo-copy"><h3>${escapeHtml(collection)}</h3></div></a>`).join("");
  return fillElement(html, "collectionGrid", links);
}

function renderCollection(template, products, collectionName, siteUrl) {
  const collection = String(collectionName || "").trim();
  const items = collectionProducts(products, collection);

  if (!collection || !items.length) {
    return applyHead(template, {
      title: `Collection | ${BRAND}`,
      description: DEFAULT_DESCRIPTION,
      canonical: `${siteUrl}/collections.html`,
      noindex: true
    });
  }

  const description = truncate(`Shop ${items.length} authentic ${collection} fragrance${items.length === 1 ? "" : "s"} at ${BRAND}, including ${items.slice(0, 3).map((product) => product.name).join(", ")}. ${shippingLine()}`, 160);
  const canonical = `${siteUrl}${collectionPath(collection)}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${collection} Fragrances`,
    itemListElement: items.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${siteUrl}${productPath(product)}`,
      name: product.name
    }))
  };

  let html = applyHead(template, {
    title: `${collection} Fragrances | ${BRAND}`,
    description,
    canonical,
    image: items.find((product) => product.image) ? productImageUrl(items.find((product) => product.image), siteUrl) : `${siteUrl}${LOGO_PATH}`,
    type: "website",
    structuredData
  });

  html = fillElement(html, "collectionTitle", escapeHtml(collection));
  html = fillElement(html, "collectionDescription", escapeHtml(`Shop ${items.length} authentic fragrance${items.length === 1 ? "" : "s"} from ${collection}.`));
  return fillElement(html, "productGrid", items.map(staticProductCard).join(""));
}

function renderProduct(template, products, productId, siteUrl) {
  const product = products.find((entry) => entry.id === productId);

  if (!product) {
    return applyHead(template, {
      title: `Fragrance | ${BRAND}`,
      description: DEFAULT_DESCRIPTION,
      canonical: `${siteUrl}/collections.html`,
      noindex: true
    });
  }

  const name = [product.brand, product.name].filter(Boolean).join(" ");
  const sizeLabel = product.size ? ` ${product.size}` : "";
  const title = `${name}${sizeLabel} | ${BRAND}`;
  const description = truncate(`Shop authentic ${name}${sizeLabel} for ${currency.format(product.price)}. ${product.family ? `${product.family} fragrance. ` : ""}${product.notes || product.description || ""}`, 160);
  const canonical = `${siteUrl}${productPath(product)}`;
  const image = product.image ? productImageUrl(product, siteUrl) : `${siteUrl}${LOGO_PATH}`;
  const freeShipping = Number(product.price) >= 100;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.size ? `${product.name} ${product.size}` : product.name,
    description: product.description || product.notes || name,
    sku: product.id,
    image: [image],
    category: "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne",
    brand: { "@type": "Brand", name: product.brand || BRAND },
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "USD",
      price: Number(product.price).toFixed(2),
      itemCondition: "https://schema.org/NewCondition",
      availability: Number(product.stock) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: BRAND },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: freeShipping ? "0.00" : "10.00", currency: "USD" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          transitTime: { "@type": "QuantitativeValue", minValue: 3, maxValue: 7, unitCode: "DAY" }
        }
      }
    }
  };

  const html = applyHead(template, {
    title,
    description,
    canonical,
    image,
    imageAlt: `${name} fragrance bottle`,
    type: "product",
    price: Number(product.price).toFixed(2),
    structuredData
  });

  // Crawlers get real content; pages.js replaces it with the interactive version.
  const detail = `
      <div class="product-detail-copy">
        <h1>${escapeHtml(product.name)}</h1>
        <p class="product-detail-brand">${escapeHtml(product.brand)} | ${escapeHtml(product.size)}</p>
        <p class="product-detail-price">${currency.format(product.price)}</p>
        <p>${escapeHtml(product.description)}</p>
        <p class="notes">${escapeHtml(product.notes)}</p>
        <p>100% authentic bottle. ${escapeHtml(shippingLine())}</p>
      </div>`;
  return fillElement(html, "productDetail", detail);
}

function renderSitemap(products, siteUrl) {
  const urls = [
    `${siteUrl}/`,
    `${siteUrl}/collections.html`,
    ...getCollections(products).map((collection) => `${siteUrl}${collectionPath(collection)}`),
    ...products.map((product) => `${siteUrl}${productPath(product)}`)
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}
</urlset>
`;
}

function renderRobots(siteUrl) {
  return `User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /checkout.html
Disallow: /success.html
Disallow: /api/
Disallow: /templates/

Sitemap: ${siteUrl}/sitemap.xml
`;
}

// Product images are stored as data URIs; this turns one into a real image file
// so Google, Merchant Center, and social link previews can fetch it.
function decodeProductImage(image) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(image || ""));
  if (!match) return null;

  return {
    contentType: match[1],
    body: match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]))
  };
}

function applyHead(template, { title, description, canonical, image, imageAlt, type, price, noindex, structuredData }) {
  const tags = [
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    noindex ? '<meta name="robots" content="noindex">' : "",
    `<meta property="og:site_name" content="${BRAND}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="${type || "website"}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : "",
    imageAlt ? `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}">` : "",
    price ? `<meta property="product:price:amount" content="${price}">` : "",
    price ? '<meta property="product:price:currency" content="USD">' : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : "",
    structuredData ? `<script type="application/ld+json">${jsonForScript(structuredData)}</script>` : ""
  ].filter(Boolean).map((tag) => `    ${tag}`).join("\n");

  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`)
    .replace("</head>", `${tags}\n  </head>`);
}

function fillElement(html, id, content) {
  const pattern = new RegExp(`(<(\\w+)[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?(</\\2>)`);
  return html.replace(pattern, (match, open, tag, close) => `${open}${content}${close}`);
}

function staticProductCard(product) {
  return `<article class="product-card retail-product-card"><div class="product-info"><div class="product-meta"><span>${escapeHtml(product.brand)}</span></div><h3><a href="${escapeHtml(productPath(product))}">${escapeHtml(product.name)}</a></h3><p class="notes">${escapeHtml(product.notes)}</p><div class="price-row"><span class="price">${currency.format(product.price)}</span></div></div></article>`;
}

function getCollections(products) {
  return [
    ...new Set(products.flatMap((product) => [
      product.collection,
      product.brand,
      product.family
    ]).filter(Boolean))
  ].sort();
}

function collectionProducts(products, collection) {
  const key = String(collection || "").trim().toLowerCase();
  return products.filter((product) => [
    product.collection,
    product.brand,
    product.family
  ].some((value) => String(value || "").trim().toLowerCase() === key));
}

function productPath(product) {
  return `/product.html?id=${encodeURIComponent(product.id)}`;
}

function collectionPath(collection) {
  return `/collection.html?collection=${encodeURIComponent(collection)}`;
}

function productImageUrl(product, siteUrl) {
  if (/^https?:\/\//.test(product.image)) return product.image;
  return `${siteUrl}/images/products/${encodeURIComponent(product.id)}`;
}

function shippingLine() {
  return "Free standard shipping on orders $100+.";
}

function truncate(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}…`;
}

function jsonForScript(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  getSiteUrl,
  pageNeedsProducts,
  renderPage,
  renderSitemap,
  renderRobots,
  decodeProductImage
};
