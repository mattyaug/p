# Perigee Review Reseed Fix

This update stops the starter review samples from automatically reappearing after they are deleted or archived.

## What changed

- Removed automatic review seeding from the Worker startup/database check.
- Reviews now stay deleted/archived after owner dashboard actions.
- Existing public site, portal, owner pages, logs, DB binding, Stripe link, and Portland homepage content remain in place.

## Install

1. Unzip this package.
2. Upload/replace the repo files in GitHub.
3. Commit changes.
4. Let Cloudflare redeploy.

## Database

No new SQL migration is required.

If old starter reviews are still present in D1 and you want to remove them all permanently, run:

```sql
DELETE FROM reviews
WHERE id LIKE 'starter-review-%';
```

Then refresh the owner dashboard. They should not reappear after this update is deployed.
