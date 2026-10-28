// Fixes to listings that already exist in product storage. The bundled catalog can only
// refresh a stored product's photo and copy, so name, brand, and price fixes live here and
// run on every read (storefront, checkout, and sitemap all see the same listing).
// Keep this to fixes the admin portal would never want undone.

// Duplicate listings: Valentino Uomo Born in Roma EDT 100mL was listed twice ($55 and $62).
const REMOVED_IDS = new Set(["valentino-valentino-uomo-born-in-roma-eau-de-toilette-100ml"]);

// One-time price fixes: applied only while the old price is still set, so a later price
// change in the admin portal sticks.
const PRICE_FIXES = {
  "valentino-uomo-born-in-roma-eau-de-toilette-100ml": { from: 55, to: 62 },
  "baccarat-rouge-540-extrait-de-parfum-mpzucmug": { from: 247, to: 190 }
};

// Misspelled or inconsistent brand names (also used as collection names).
const BRAND_NAMES = {
  "jean paul gualtier": "Jean Paul Gaultier",
  "bond no.9 new york": "Bond No. 9 New York"
};

function fixBrand(value) {
  const key = String(value || "").trim().toLowerCase();
  return BRAND_NAMES[key] || value;
}

function applyListingCorrections(products) {
  return products
    .filter((product) => !REMOVED_IDS.has(product.id))
    .map((product) => {
      const priceFix = PRICE_FIXES[product.id];
      return {
        ...product,
        brand: fixBrand(product.brand),
        collection: fixBrand(product.collection),
        price: priceFix && Number(product.price) === priceFix.from ? priceFix.to : product.price
      };
    });
}

module.exports = { applyListingCorrections };
