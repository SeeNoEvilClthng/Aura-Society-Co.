const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Product photos are stored as multi-megabyte data URIs. Shoppers get a `thumb` URL instead:
// the small JPEG in assets/products when it was made from the same photo (manifest.json holds
// each photo's fingerprint), otherwise the full photo from /images/products/:id.
const manifestPath = path.join(process.cwd(), "assets", "products", "manifest.json");
let manifest;

function readManifest() {
  if (!manifest) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      manifest = {};
    }
  }
  return manifest;
}

function imageKey(image) {
  return crypto.createHash("sha1").update(String(image)).digest("hex").slice(0, 12);
}

function productThumbUrl(product) {
  const image = String(product.image || "").trim();
  if (!image) return "";
  // Full URLs and site paths (photos shipped in assets/products) are used as-is.
  if (/^(https?:\/\/|\/)/.test(image)) return image;

  const id = encodeURIComponent(product.id);
  const key = imageKey(image);
  return readManifest()[product.id] === key
    ? `/assets/products/${id}.jpg?v=${key}`
    : `/images/products/${id}?v=${key}`;
}

function stripProductImages(products) {
  return products.map(({ image, ...product }) => {
    const thumb = productThumbUrl({ ...product, image });
    return thumb ? { ...product, thumb } : product;
  });
}

module.exports = { imageKey, productThumbUrl, stripProductImages };
