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

function renderPage(page, { products = [], query = {}, siteUrl, reviews = [] }) {
  const template = fs.readFileSync(templatePaths[page] || templatePaths.index, "utf8");

  if (page === "product") return renderProduct(template, products, query.id, siteUrl, reviews);
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
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: `${siteUrl}/help.html`
      }
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

  const links = collections.map((collection) => `<a class="brand-chip" href="${escapeHtml(collectionPath(collection))}">${escapeHtml(collection)}</a>`).join("");
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

// "Creed" + "Creed Aventus" should read "Creed Aventus", not "Creed Creed Aventus".
function brandedName(product) {
  const brand = String(product.brand || "").trim();
  const name = String(product.name || "").trim();
  if (!brand || name.toLowerCase().startsWith(brand.toLowerCase())) return name;
  return `${brand} ${name}`;
}

function renderProduct(template, products, productId, siteUrl, reviews = []) {
  const product = products.find((entry) => entry.id === productId);

  if (!product) {
    return applyHead(template, {
      title: `Fragrance | ${BRAND}`,
      description: DEFAULT_DESCRIPTION,
      canonical: `${siteUrl}/collections.html`,
      noindex: true
    });
  }

  const name = brandedName(product);
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

  // Only real, visible, verified-buyer reviews feed the rating markup.
  const visibleReviews = reviews.filter((review) => review.productId === product.id && !review.hidden);
  if (visibleReviews.length) {
    const average = visibleReviews.reduce((sum, review) => sum + review.rating, 0) / visibleReviews.length;
    structuredData.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: average.toFixed(1),
      reviewCount: visibleReviews.length,
      bestRating: "5",
      worstRating: "1"
    };
    structuredData.review = visibleReviews.slice(0, 10).map((review) => ({
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: "5" },
      author: { "@type": "Person", name: review.name },
      datePublished: String(review.createdAt).slice(0, 10),
      name: review.title || undefined,
      reviewBody: review.body
    }));
  }

  let html = applyHead(template, {
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
  html = fillElement(html, "productDetail", detail);

  if (visibleReviews.length) {
    const reviewsHtml = `<div class="retail-section-head"><h2>Reviews</h2></div><div class="review-list">${visibleReviews.slice(0, 10).map((review) => `<article class="review-entry"><p>${review.rating} out of 5${review.title ? ` <strong>${escapeHtml(review.title)}</strong>` : ""}</p><p>${escapeHtml(review.body)}</p><p class="microcopy">${escapeHtml(review.name)} | Verified buyer</p></article>`).join("")}</div>`;
    html = fillElement(html, "productReviews", reviewsHtml);
  }

  return html;
}

function renderSitemap(products, siteUrl) {
  const urls = [
    `${siteUrl}/`,
    `${siteUrl}/collections.html`,
    `${siteUrl}/help.html`,
    ...getCollections(products).map((collection) => `${siteUrl}${collectionPath(collection)}`),
    ...products.map((product) => `${siteUrl}${productPath(product)}`)
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}
</urlset>
`;
}

// Google Merchant Center product feed (RSS 2.0 + g: namespace) for free Shopping listings.
function renderProductFeed(products, siteUrl) {
  const items = products
    .filter((product) => product.image && Number(product.price) > 0)
    .map((product) => {
      const title = truncate([brandedName(product), product.size].filter(Boolean).join(" "), 150);
      const description = truncate(product.description || product.notes || title, 5000);
      const freeShipping = Number(product.price) >= 100;
      return `    <item>
      <g:id>${escapeHtml(product.id)}</g:id>
      <g:title>${escapeHtml(title)}</g:title>
      <g:description>${escapeHtml(description)}</g:description>
      <g:link>${escapeHtml(`${siteUrl}${productPath(product)}`)}</g:link>
      <g:image_link>${escapeHtml(productImageUrl(product, siteUrl))}</g:image_link>
      <g:availability>${Number(product.stock) > 0 ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${Number(product.price).toFixed(2)} USD</g:price>
      <g:brand>${escapeHtml(product.brand || BRAND)}</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
      <g:google_product_category>479</g:google_product_category>
      <g:product_type>${escapeHtml(["Fragrance", product.family].filter(Boolean).join(" > "))}</g:product_type>
      <g:shipping>
        <g:country>US</g:country>
        <g:service>Standard</g:service>
        <g:price>${freeShipping ? "0.00" : "10.00"} USD</g:price>
      </g:shipping>
    </item>`;
    });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${BRAND}</title>
    <link>${escapeHtml(`${siteUrl}/`)}</link>
    <description>Authentic designer and niche fragrances</description>
${items.join("\n")}
  </channel>
</rss>
`;
}

function renderRobots(siteUrl) {
  return `User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /checkout.html
Disallow: /success.html
Disallow: /review.html
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
  renderProductFeed,
  renderRobots,
  decodeProductImage
};
