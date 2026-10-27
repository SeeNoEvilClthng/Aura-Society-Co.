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

Stripe Checkout is configured to use dashboard-managed dynamic payment methods instead of hard-coded card-only payments. To show methods like Cash App Pay, PayPal, Apple Pay, Google Pay, Link, Klarna, Afterpay/Clearpay, Affirm, and eligible bank options, enable them in Stripe Dashboard under **Settings > Payment methods**. Stripe decides which enabled methods appear based on customer location, currency, amount, device/browser, and account eligibility.

Checkout also collects billing address, phone number, shipping address, and promotion codes before redirecting to Stripe payment. If Stripe gives you a custom payment method configuration ID, add it as `STRIPE_PAYMENT_METHOD_CONFIGURATION`.

Checkout validates cart items against the saved product catalog on the server before creating the Stripe Checkout Session. Admin product saves also sync each fragrance to Stripe as a Product/Price when `STRIPE_SECRET_KEY` is available, so checkout can use the current server-side product and price data.

For order emails, create a Stripe webhook endpoint pointing to:

```text
https://your-domain.com/api/stripe-webhook
```

Subscribe it to `checkout.session.completed`, then add the webhook signing secret as `STRIPE_WEBHOOK_SECRET`. Add `RESEND_API_KEY` to send the order notification email to `ORDER_NOTIFICATION_EMAIL`, which defaults to `xswann07@gmail.com`.

### Sharing a Stripe account with another business

Every Checkout Session this store creates carries `metadata[store]=aura-society` (also on the PaymentIntent, with the description "Aura Society Co. order"), and `/api/stripe-webhook` ignores sessions without that tag, so the other business's checkouts never trigger Aura order alerts or review emails. Give the other business's own webhook the same treatment if it reacts to `checkout.session.completed`. Use a restricted key (Checkout Sessions, Products and Prices: write) as `STRIPE_SECRET_KEY` instead of the account's full secret key. Set `STRIPE_STATEMENT_DESCRIPTOR_SUFFIX` (letters, numbers and spaces) so card statements name Aura Society; the account's shortened descriptor plus the suffix is cut off at 22 characters.

## Vercel Setup

Use the repository root as the Vercel project root. Leave the framework preset as "Other" or static/default.

Add these environment variables in Vercel Project Settings:

- `WELCOME_PROMO_CODE` (optional): A Stripe promotion code (Stripe Dashboard > Products > Coupons) shown to shoppers right after they join the VIP list. `WELCOME_OFFER_TEXT` sets the sentence shown with it. Subscribers are saved to the same Supabase table and can be downloaded as CSV from the admin portal.
- Verified reviews: after checkout, `success.html` gives the buyer a `review.html?session=cs_...` link. `/api/reviews` checks with Stripe that the order is paid and contains the product before saving (one review per product per order). Reviews are stored in the same Supabase table, shown on product pages and cards, and added to the product's Google structured data. Admins can hide a review for content reasons from the admin portal.
- Review request emails: set `REVIEW_REQUEST_EMAILS=on` to have the Stripe webhook schedule a "How's your fragrance?" email with the buyer's review link through Resend, `REVIEW_REQUEST_DELAY_DAYS` after the order (default 7, max 29). It sends from `REVIEW_EMAIL_FROM` (or `ORDER_NOTIFICATION_FROM`), which must be on a domain verified in Resend; Resend's `onboarding@resend.dev` test sender can only email your own account, so the feature stays off until a real sender is set. Each order gets at most one email.
- Abandoned checkout emails: set `CART_RECOVERY_EMAILS=on` and add `checkout.session.expired` to the Stripe webhook's events. Checkout Sessions then expire after `CART_RECOVERY_HOURS` (default 2, 0.75 to 23) with a Stripe recovery link, and Stripe shows a "send me offers" checkbox. When a session expires unpaid, the webhook emails the link to shoppers who ticked that box or "Email me with news and offers" on our checkout page, from `REVIEW_EMAIL_FROM`, at most once per session. Put your mailing address in `BUSINESS_MAILING_ADDRESS` for the email footer, and remove anyone who replies "unsubscribe" from the subscriber list. If Stripe rejects these optional settings (or `STRIPE_STATEMENT_DESCRIPTOR_SUFFIX`), checkout retries without them so sales are never blocked.
- Free-shipping pairings: the cart drawer and checkout suggest up to three bottles (same scent family first) that lift the bag over the $100 free-shipping line.
- Product photos: shoppers get small JPEGs from `assets/products/` (about 45KB each instead of the 33MB photo bundle). After changing photos in the admin portal the site serves the new photo at full size automatically; to make small copies of new photos, export the catalog to `catalog/products.json`, regenerate `assets/products/<id>.jpg` (800px, JPEG) and update `assets/products/manifest.json` with the first 12 hex characters of each photo's SHA-1.
- Help page: `help.html` covers shipping, payments, authenticity and FAQs. Its contact form (`/api/contact`) emails messages to `ORDER_NOTIFICATION_EMAIL` through Resend with the shopper as reply-to, so just hit Reply to answer. It needs `RESEND_API_KEY`; the store email is never shown on the site.
- Homepage links: nav, featured and collection cards that name a brand or scent family with no products are dropped and replaced automatically, so shoppers never land on an empty collection.
- Google Shopping: submit `https://your-domain.com/feed.xml` as a scheduled product feed in Google Merchant Center for free product listings.
- `ADMIN_USERNAME` and `ADMIN_PASSWORD`: Admin portal login. The server checks these on every product or homepage change; without them, saving is disabled. Use a long password you don't use anywhere else.

- `STRIPE_SECRET_KEY`: Stripe secret key. Use `sk_test_...` first, then switch to live when ready.
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret for `/api/stripe-webhook`.
- `STRIPE_PAYMENT_METHOD_CONFIGURATION`: Optional Stripe payment method configuration ID.
- `RESEND_API_KEY`: Resend API key for order notification emails.
- `ORDER_NOTIFICATION_EMAIL`: Email address that receives order alerts.
- `ORDER_NOTIFICATION_FROM`: Verified sender address for Resend.
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
