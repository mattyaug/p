# Perigee Property Management Website

This version is configured for the current Cloudflare **Workers & Pages → Create a Worker from Git** flow.

It includes:

- Public site for `goperigee.com`
- Customer portal at `/portal/`
- In-house scheduler
- Owner dashboard at `/owner/` and `owner.goperigee.com`
- Cloudflare D1 appointment database support
- Resend email notifications to `ma@goperigee.com`
- Stripe membership payment link placeholder for the $199/month membership

## Cloudflare deploy settings

When Cloudflare shows the Worker setup screen, use:

```text
Build command: leave blank
Deploy command: npx wrangler deploy
```

The deploy command is okay for this updated Worker version.

## Important files

```text
public/              Static website files
src/index.js         Worker backend/API and static asset router
schema.sql           D1 appointment table
wrangler.toml        Cloudflare deploy configuration
package.json         Wrangler dependency and scripts
```

## After the first deploy

The website can deploy before the database is connected, but the scheduler will not save appointments until D1 is connected.

### 1. Create the database

In Cloudflare:

```text
Storage & databases → D1 SQL Database → Create
```

Name it:

```text
perigee_appointments
```

### 2. Add the appointment table

Open the D1 database, go to the query/console area, paste the contents of `schema.sql`, and run it.

### 3. Add the D1 binding

Open your Worker:

```text
Compute → Workers & Pages → perigee-website → Settings → Bindings
```

Add a D1 database binding:

```text
Variable name: DB
Database: perigee_appointments
```

### 4. Add environment variables / secrets

In the same Worker settings, add:

```text
ADMIN_TOKEN=choose-a-private-owner-code
RESEND_API_KEY=your-resend-api-key
STRIPE_MEMBERSHIP_LINK=https://buy.stripe.com/your-real-link
```

These are already set in `wrangler.toml` and do not need to be added unless you want to override them:

```text
BUSINESS_NAME=Perigee Property Management
SERVICE_AREA=Portland
ADMIN_EMAIL=ma@goperigee.com
FROM_EMAIL=bookings@goperigee.com
```

## Custom domains

Add these routes/custom domains to the Worker:

```text
goperigee.com/*
www.goperigee.com/*
owner.goperigee.com/*
```

The owner subdomain automatically opens the owner dashboard.
