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

Products are stored in `data/products.json` through the local Node server. The storefront and admin portal both use `/api/products`, so admin changes show up for every visitor using the same deployed server.

For a production store, connect the admin portal to a database or commerce platform and calculate product prices server-side instead of trusting browser data.
