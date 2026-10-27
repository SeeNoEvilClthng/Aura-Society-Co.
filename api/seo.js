const { readProducts, readCatalogProducts } = require("./products");
const { getSiteUrl, renderSitemap, renderRobots, decodeProductImage } = require("../lib/seo");

// Serves /sitemap.xml, /robots.txt, and /images/products/:id (see vercel.json rewrites).
module.exports = async function handler(request, response) {
  const query = getQuery(request);
  const siteUrl = getSiteUrl(request);

  if (query.file === "robots") {
    send(response, 200, "text/plain; charset=utf-8", renderRobots(siteUrl), 86400);
    return;
  }

  let products;
  try {
    products = await readProducts();
  } catch {
    products = readCatalogProducts();
  }

  if (query.file === "sitemap") {
    send(response, 200, "application/xml; charset=utf-8", renderSitemap(products, siteUrl), 3600);
    return;
  }

  if (query.file === "image") {
    const product = products.find((entry) => entry.id === query.id);
    if (product && /^https?:\/\//.test(product.image)) {
      response.statusCode = 302;
      response.setHeader("Location", product.image);
      response.end();
      return;
    }

    const image = product && decodeProductImage(product.image);
    if (!image) {
      send(response, 404, "text/plain; charset=utf-8", "Image not found.", 60);
      return;
    }

    send(response, 200, image.contentType, image.body, 86400);
    return;
  }

  send(response, 404, "text/plain; charset=utf-8", "Not found.", 60);
};

function send(response, statusCode, contentType, body, maxAge) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=86400`);
  response.end(body);
}

function getQuery(request) {
  if (request.query && typeof request.query === "object") return request.query;
  return Object.fromEntries(new URL(request.url, "http://localhost").searchParams);
}
