# Perigee Owner Privacy + Archives Update

This is a focused update on top of the working Perigee portal.

It adds:

- A private owner login page at `/owner-login/`
- Server-side protection for `/owner/` and `/owner/archive/`
- HttpOnly owner session cookie instead of storing the admin token in browser localStorage
- A clearer and more functional owner dashboard
- A “Delete from dashboard” action for work orders/appointments
- A new `/owner/archive/` page for deleted/archived work orders and owner logs
- Automatic owner logs for signups, guest requests, member work orders, status changes, archived work orders, and owner logins

The site structure, membership terms, Stripe link, D1 binding, and existing portal flow remain in place.

---

## Install

1. Unzip this package.
2. Upload/replace the repo files in GitHub.
3. Commit the changes.
4. Let Cloudflare redeploy the Worker.

Your `wrangler.toml` still includes the permanent live D1 binding:

```toml
name = "p"

[[d1_databases]]
binding = "DB"
database_name = "perigee_appointments"
database_id = "ad4c73c9-fd3f-4c05-af7e-1775ef0b2030"
```

---

## Database update

The Worker includes a safe automatic schema check for the new archive/log fields. It will try to add the missing archive columns and log table the first time the owner dashboard loads.

For the cleanest setup, also run this migration once in D1:

```txt
migration_owner_privacy_archives.sql
```

Cloudflare path:

```txt
Storage & databases
→ D1 SQL Database
→ perigee_appointments
→ Console / Query / Run SQL
```

If you see `duplicate column name` on an `ALTER TABLE` line, that specific column already exists and you can ignore that line.

---

## Owner privacy flow

The owner dashboard is now protected this way:

```txt
/owner-login/        public login screen
/owner/              private dashboard, redirects to login unless owner session is active
/owner/archive/      private logs/archive area, redirects to login unless owner session is active
```

The owner access code is sent once to `/api/admin/login`. If it matches your `ADMIN_TOKEN`, the Worker sets a secure 12-hour HttpOnly cookie:

```txt
perigee_owner_session
```

The dashboard APIs no longer require the token to be stored in localStorage or placed in a URL.

---

## Owner dashboard actions

From `/owner/`, you can:

- View visible guest requests, portal account requests, and active member work orders
- Search the dashboard
- Filter by guest, portal account, active member, or request status
- Confirm, complete, or cancel work orders
- Delete a work order from the dashboard
- View portal accounts vs actual active members
- Mark a portal account active, pending, or canceled

“Delete from dashboard” does not destroy the D1 record. It removes it from the main owner view and sends it to:

```txt
/owner/archive/
```

---

## Logs & Archives

The new archive page shows:

- Work orders removed from the main owner dashboard
- Portal signups
- Guest appointment requests
- Logged-in member work orders
- Appointment status changes
- Member status changes
- Owner logins/logouts

Open it here:

```txt
https://goperigee.com/owner/archive/
```

or from the owner dashboard button.

---

## Required secrets and variables

Keep these in Cloudflare:

```env
BUSINESS_NAME=Perigee Property Management
SERVICE_AREA=Portland
ADMIN_EMAIL=ma@goperigee.com
FROM_EMAIL=bookings@goperigee.com
STRIPE_MEMBERSHIP_LINK=https://buy.stripe.com/4gM7sNewm0td1JwaBs8og00
```

Secrets:

```env
ADMIN_TOKEN=your-private-owner-access-code
RESEND_API_KEY=your-resend-api-key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_signing_secret
```

---

## Test after deploying

1. Open `/owner/` in a private/incognito window.
2. It should redirect to `/owner-login/`.
3. Log in with your `ADMIN_TOKEN`.
4. Confirm the dashboard loads.
5. Click “Delete from dashboard” on a test work order.
6. Open `/owner/archive/` and verify the record appears there.
