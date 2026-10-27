const { readProducts, readCatalogProducts } = require("./products");
const { getSiteUrl, pageNeedsProducts, renderPage } = require("../lib/seo");

// Serves index, collections, collection, and product pages with real titles,
// descriptions, social preview tags, and structured data already in the HTML.
module.exports = async function handler(request, response) {
  const query = getQuery(request);
  const page = ["index", "collections", "collection", "product"].includes(query.page) ? query.page : "index";
  const siteUrl = getSiteUrl(request);
  let products = [];

  if (pageNeedsProducts(page)) {
    try {
      products = await readProducts();
    } catch {
      products = readCatalogProducts();
    }
  }

  let html;
  try {
    html = renderPage(page, { products, query, siteUrl });
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("Page could not load.");
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
  response.end(html);
};

function getQuery(request) {
  if (request.query && typeof request.query === "object") return request.query;
  return Object.fromEntries(new URL(request.url, "http://localhost").searchParams);
}
