# Aura Society Co.

Online fragrance marketplace prototype with a customer storefront and a Shopify-style admin product manager.

## Pages

- `index.html` is the storefront with product filtering, cart, and demo checkout.
- `admin.html` is the product admin portal for adding, editing, deleting, and exporting products.

## Product Data

Products are stored in the browser with `localStorage`, including uploaded images as data URLs. This makes the prototype work without a backend.

For a production store, connect the admin portal to a database or commerce platform and replace the demo checkout with Stripe, Shopify Checkout, or another payment provider.
