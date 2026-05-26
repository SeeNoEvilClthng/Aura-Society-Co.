# Aura Society Co.

Online fragrance marketplace prototype with a customer storefront, Stripe Checkout, and a Shopify-style admin product manager.

## Pages

- `index.html` is the storefront with editable homepage sections, product previews, cart drawer, and links into the shopping pages.
- `collections.html`, `collection.html`, and `product.html` provide dedicated collection and product pages for the customer shopping flow.
- `checkout.html` is a Shopify-style checkout information page that summarizes the cart before redirecting to Stripe payment.
- `admin.html` is the admin portal for editing homepage content, collection cards, adding products, editing products, deleting products, uploading pictures, and exporting store data.
- `success.html` is the Stripe Checkout return page.

## Stripe Setup

1. Copy `.env.example` to `.env`.
2. Add your Stripe secret key as `STRIPE_SECRET_KEY`.
3. Start the local server with `npm start`.
4. Open `http://localhost:4173`.

The checkout flow creates a Stripe Checkout Session from the cart and redirects the customer to Stripe-hosted payment.

Stripe Checkout is configured to use dashboard-managed dynamic payment methods. To show methods like Cash App Pay, PayPal, Apple Pay, Google Pay, Link, Klarna, Afterpay/Clearpay, Affirm, and eligible bank options, enable them in Stripe Dashboard under **Settings > Payment methods**. Stripe decides which enabled methods appear based on customer location, currency, amount, device/browser, and account eligibility.

## Vercel Setup

Use the repository root as the Vercel project root. Leave the framework preset as "Other" or static/default.

Add these environment variables in Vercel Project Settings:

- `STRIPE_SECRET_KEY`: Stripe secret key. Use `sk_test_...` first, then switch to live when ready.
- `SITE_URL`: Your production URL, such as `https://your-domain.com`.
- `SUPABASE_URL`: Your Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service-role key. Keep this server-side only.
- `SUPABASE_PRODUCTS_TABLE`: Optional. Defaults to `site_settings`.

Create this table in Supabase SQL Editor:

```sql
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

Vercel serverless functions cannot permanently save changes to files inside the deployment. The admin portal needs Supabase environment variables above so product changes persist for customers. Upstash/Vercel KV is also supported as a fallback using `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

## Product Data

Products are stored in `data/products.json` through the local Node server. Homepage content is stored in `data/site.json`. The storefront and admin portal use `/api/products` and `/api/site`, so admin changes show up for every visitor using the same deployed server.

The admin portal saves individual products with `POST /api/products` and deletes individual products with `DELETE /api/products?id=...`, so adding or editing one fragrance no longer requires uploading the full catalog each time. This removes the app-level cap caused by whole-catalog saves and lets the inventory grow with the connected database/storage limits.

For a production store, connect the admin portal to a database or commerce platform and calculate product prices server-side instead of trusting browser data.
