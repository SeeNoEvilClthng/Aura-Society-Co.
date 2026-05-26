# Aura Society Co.

Online fragrance marketplace prototype with a customer storefront, Stripe Checkout, and a Shopify-style admin product manager.

## Pages

- `index.html` is the storefront with product filtering, cart, and demo checkout.
- `admin.html` is the product admin portal for adding, editing, deleting, and exporting products.
- `success.html` is the Stripe Checkout return page.

## Stripe Setup

1. Copy `.env.example` to `.env`.
2. Add your Stripe secret key as `STRIPE_SECRET_KEY`.
3. Start the local server with `npm start`.
4. Open `http://localhost:4173`.

The checkout flow creates a Stripe Checkout Session from the cart and redirects the customer to Stripe-hosted payment.

## Product Data

Products are stored in `data/products.json` through the local Node server. The storefront and admin portal both use `/api/products`, so admin changes show up for every visitor using the same deployed server.

For a production store, connect the admin portal to a database or commerce platform and calculate product prices server-side instead of trusting browser data.
