# Perigee Property Management Website

This version keeps the public website and customer portal unchanged, but makes the owner tools private through Cloudflare Zero Trust Access instead of a public owner login page.

## Private owner pages

Use only these private owner URLs:

- `https://goperigee.com/owner/` — owner panel
- `https://goperigee.com/logs/` — logs and archives

There is no public backup owner login screen in this version.

## Required Cloudflare Access setup

In Cloudflare Zero Trust, create one self-hosted Access application for `goperigee.com` and protect these paths:

- `/owner/*`
- `/logs/*`
- `/api/admin/*`

Allow only the owner email address, such as:

- `ma@goperigee.com`

The Worker also checks Cloudflare Access headers. If those headers are missing or the email is not allowed, the owner pages and admin APIs return `404 Not found`.

## Worker environment variables

The project includes the permanent D1 binding in `wrangler.toml`:

```toml
name = "p"

[[d1_databases]]
binding = "DB"
database_name = "perigee_appointments"
database_id = "ad4c73c9-fd3f-4c05-af7e-1775ef0b2030"
```

Set these variables/secrets in Cloudflare:

```env
RESEND_API_KEY=your_resend_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
OWNER_ACCESS_EMAILS=ma@goperigee.com
```

These are already in `wrangler.toml` as non-secret variables:

```env
ADMIN_EMAIL=ma@goperigee.com
FROM_EMAIL=bookings@goperigee.com
STRIPE_MEMBERSHIP_LINK=https://buy.stripe.com/4gM7sNewm0td1JwaBs8og00
```

## Install

1. Upload the unzipped contents to GitHub, replacing the current files.
2. Commit changes.
3. Let Cloudflare redeploy.
4. In Cloudflare Zero Trust Access, protect `/owner/*`, `/logs/*`, and `/api/admin/*`.
5. Test `https://goperigee.com/owner/` using the allowed owner email.

No new SQL migration is needed if the previous owner archive/log migration was already run.


## Latest update

- Public pages no longer link to or mention the owner tools.
- Home page now displays a public member count equal to active members plus 27.
