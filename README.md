# Perigee Zero Trust Owner Access Update

This update removes the extra in-app owner email/header check so Cloudflare Zero Trust Access is the only privacy gate for the owner pages.

Private pages:

- `/owner` — owner panel
- `/logs` — logs and archives

Protect these exact paths in Cloudflare Zero Trust Access:

- `goperigee.com/owner`
- `goperigee.com/owner/*`
- `goperigee.com/logs`
- `goperigee.com/logs/*`
- `goperigee.com/api/admin`
- `goperigee.com/api/admin/*`

Allow only your owner email address in the Access policy.

## Install

1. Upload the unzipped contents of this package to GitHub, replacing the current files.
2. Commit changes.
3. Let Cloudflare redeploy.
4. Confirm the Zero Trust Access rules above are active.

No database migration is required for this update.
