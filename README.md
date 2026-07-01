# Perigee Portal Membership Update

This update keeps the current website/portal layout mostly the same and adds two specific upgrades:

1. **Automatic member activation after Stripe payment** using a Stripe webhook.
2. **Guest appointment requests without signing up**, while still keeping full member benefits inside logged-in portal accounts.

Upload these files to GitHub, replacing the current repo contents, then redeploy the Worker.

---

# What changed

## Customer portal

Customers can still create accounts and log in at:

```txt
https://goperigee.com/portal/
```

Logged-in customers can:

- View membership status
- Click the membership payment link
- Schedule account-linked appointments
- View appointment history
- Update profile/property details

When a logged-in customer clicks the membership payment button, the Stripe Payment Link is opened with the portal email locked into the Stripe checkout email field. That helps Stripe match the payment back to the same portal account.

## Guest appointment requests

The portal also includes a public guest appointment form. Customers can request an appointment without creating an account.

Guest requests:

- Save to the same `appointments` table
- Send the same Resend email notification
- Show in the owner dashboard as public requests
- Do **not** unlock member benefits

Members should still create/log in to a portal account for member benefits, free inspections, discounts, and appointment history.

## Stripe automatic activation

The Worker now includes this endpoint:

```txt
https://goperigee.com/api/stripe/webhook
```

When Stripe sends a successful checkout/payment event, the Worker finds a portal member with the same email address and marks that account:

```txt
active
```

If someone pays first and creates an account later with the same email, the new account starts as `active`.

---

# Project structure

```txt
public/
  index.html
  portal/index.html
  owner/index.html
  privacy/index.html
  assets/
    styles.css
    main.js
    portal.js
    owner.js
    perigee-logo.jpeg
src/
  index.js
schema.sql
migration_accounts.sql
migration_stripe_auto_activation.sql
wrangler.toml
package.json
```

---

# Deploy settings in Cloudflare

Use your current Worker deployment flow.

```txt
Build command: leave blank
Deploy command: npx wrangler deploy
```

The Worker entry point is:

```txt
src/index.js
```

Static website assets are served from:

```txt
public/
```

---

# Database migration

Because you already have the portal running, run this new migration once:

```txt
migration_stripe_auto_activation.sql
```

In Cloudflare:

```txt
Storage & databases
→ D1 SQL Database
→ perigee_appointments
→ Console / Query / Run SQL
```

Copy everything from `migration_stripe_auto_activation.sql`, paste it, and run it.

If you are installing the whole website from scratch, run:

```txt
schema.sql
```

---

# Required Cloudflare binding

Your Worker must have the D1 binding:

```txt
Binding type: D1 Database
Variable name: DB
Database: perigee_appointments
```

---

# Required variables/secrets

In the Worker settings, use:

```env
BUSINESS_NAME=Perigee Property Management
SERVICE_AREA=Portland
ADMIN_EMAIL=ma@goperigee.com
FROM_EMAIL=bookings@goperigee.com
STRIPE_MEMBERSHIP_LINK=https://buy.stripe.com/4gM7sNewm0td1JwaBs8og00
```

Set these as secrets:

```env
ADMIN_TOKEN=your-private-owner-access-code
RESEND_API_KEY=your-resend-api-key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_signing_secret
```

Important: `STRIPE_WEBHOOK_SECRET` is not your normal Stripe secret API key. It is the webhook endpoint signing secret that starts with `whsec_`.

---

# Stripe webhook setup

In Stripe:

```txt
Developers
→ Webhooks
→ Add endpoint
```

Endpoint URL:

```txt
https://goperigee.com/api/stripe/webhook
```

Events to send:

```txt
checkout.session.completed
invoice.payment_succeeded
```

After creating the webhook, copy the **Signing secret** that starts with:

```txt
whsec_
```

Then add it to Cloudflare as a secret:

```env
STRIPE_WEBHOOK_SECRET=whsec_your_real_secret
```

Redeploy the Worker after adding the secret.

---

# Testing automatic activation

1. Create a test portal account at `/portal/`.
2. Log in.
3. Click the membership payment link from inside the portal.
4. Pay through Stripe using the same email address.
5. Wait for the Stripe webhook to fire.
6. Refresh the portal.
7. The account should show as `active`.

If the account does not activate, check:

- The email used in Stripe matches the portal account email.
- `STRIPE_WEBHOOK_SECRET` is saved correctly in Cloudflare.
- The webhook endpoint in Stripe is `https://goperigee.com/api/stripe/webhook`.
- The new D1 migration was run.
- Cloudflare Worker logs for Stripe webhook errors.

---

# Email note

`FROM_EMAIL=bookings@goperigee.com` does not have to be a real mailbox if your domain is verified in Resend.

`ADMIN_EMAIL=ma@goperigee.com` can be a Cloudflare Email Routing alias that forwards to your real inbox.


## July 2026 Membership Terms Update

This build clarifies the membership offer across the homepage, portal, and `/terms/` page. The membership is stated as exactly:

- Up to weekly mowing services
- 4 yearly fertilization services
- Twice yearly gutter cleaning
- Free inspections and quotes
- Priority scheduling
- Discounted rates on other services

The Stripe membership link is now hardcoded in the source and Worker vars as:

```text
https://buy.stripe.com/4gM7sNewm0td1JwaBs8og00
```

The portal now tells customers to use the same email for Stripe and their Perigee portal account so automatic membership activation can match payment to account.

Email notifications are sent to `ADMIN_EMAIL`, defaulting to `ma@goperigee.com`, for guest appointment requests, member work orders, and new portal signups.

### D1 binding note

Your existing Cloudflare dashboard D1 binding named `DB` should remain in place. I did not hardcode an unknown D1 `database_id` because a placeholder ID can break deployment. To make the binding repo-level/permanent later, open `wrangler.toml`, uncomment the `[[d1_databases]]` block, and paste your real Cloudflare D1 database ID.


## July 2026 small owner-requested update

This package sets `name = "p"` in `wrangler.toml` and includes a permanent D1 database binding:

```toml
[[d1_databases]]
binding = "DB"
database_name = "perigee_appointments"
database_id = "ad4c73c9-fd3f-4c05-af7e-1775ef0b2030"
```

The portal now allows customers to enter any preferred appointment time, includes a combined `Mowing and edging` service option, and makes the owner dashboard distinguish between guest requests, portal account users, and actual active members.
