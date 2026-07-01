# Perigee Property Management Website + Customer Account Portal

This is the Cloudflare Worker version of the Perigee website.

It includes:

- Public website for `goperigee.com`
- Customer account portal at `/portal/`
- Customer registration and login
- Secure HttpOnly session cookies
- Password hashing using PBKDF2/SHA-256 through the Cloudflare Web Crypto API
- Logged-in customer appointment scheduling
- Customer appointment history
- Customer profile editing
- Owner dashboard at `/owner/` and `owner.goperigee.com`
- Owner appointment management
- Owner customer/member management
- Cloudflare D1 database storage
- Resend email notifications
- Stripe membership payment link placeholder

## Project structure

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
wrangler.toml
package.json
```

## Deploy settings in Cloudflare

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

## Existing database migration

Because you already have the first version running, run this one-time D1 migration before using the new portal:

```txt
migration_accounts.sql
```

In Cloudflare:

```txt
Storage & databases
→ D1 SQL Database
→ perigee_appointments
→ Console / Query / Run SQL
```

Copy everything from `migration_accounts.sql`, paste it, and run it.

Important: if Cloudflare says the `user_id` column already exists, that means the migration already ran. You can ignore that specific error.

## New database install

For a brand-new install, run:

```txt
schema.sql
```

## Required Cloudflare binding

Your Worker must have the D1 binding:

```txt
Binding type: D1 Database
Variable name: DB
Database: perigee_appointments
```

## Required variables/secrets

In the Worker settings, use:

```env
BUSINESS_NAME=Perigee Property Management
SERVICE_AREA=Portland
ADMIN_EMAIL=ma@goperigee.com
FROM_EMAIL=bookings@goperigee.com
STRIPE_MEMBERSHIP_LINK=https://buy.stripe.com/placeholder
```

Set these as secrets:

```env
ADMIN_TOKEN=your-private-owner-access-code
RESEND_API_KEY=your-resend-api-key
```

## Customer portal flow

Customers go to:

```txt
https://goperigee.com/portal/
```

They can:

1. Create an account.
2. Log in.
3. View membership status.
4. Open the Stripe membership payment link.
5. Update their profile/property address.
6. Schedule services from inside their account.
7. View appointment history.

New customer accounts start as:

```txt
pending
```

The owner dashboard can mark an account:

```txt
active
pending
canceled
```

## Owner dashboard flow

Open:

```txt
https://goperigee.com/owner/
```

or:

```txt
https://owner.goperigee.com
```

Enter your `ADMIN_TOKEN`.

You can manage:

- Appointment status: requested, confirmed, completed, canceled
- Customer membership status: pending, active, canceled

## Stripe note

The portal does not automatically mark members active after Stripe payment yet.

Current simplest workflow:

1. Customer creates account.
2. Customer pays through Stripe Payment Link.
3. You see the customer in Stripe.
4. You open `/owner/`.
5. You mark the matching customer account as `active`.

A future version can add a Stripe webhook so payment automatically activates the member account.

## Email note

`FROM_EMAIL=bookings@goperigee.com` does not have to be a real mailbox if your domain is verified in Resend.

`ADMIN_EMAIL=ma@goperigee.com` can be a Cloudflare Email Routing alias that forwards to your real inbox.
