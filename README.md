# Perigee Day-Only Appointment Update

This update keeps the existing backend structure and removes customer appointment time selection. Customers now choose only a service day. The Worker stores an empty `requested_time` value so the existing D1 schema remains compatible.

Changes:
- Guest appointment requests require only a preferred service day.
- Logged-in member work orders require only a preferred service day.
- Appointment displays show the day only in the portal, owner panel, and logs.
- Added a safe owner activity logger so appointment requests do not fail after saving if logging has an issue.

No SQL migration is required. Upload the unzipped contents to GitHub, commit, and let Cloudflare redeploy.

# Perigee Review Reliability Fix

This update fixes the review workflow without changing the site structure.

## Fixes

- Review submit form now shows success once the review has been saved.
- Review submit endpoint supports both the older and newer review table shapes.
- Approving a review returns success immediately after the status is updated.
- Approved reviews are fetched with no cache so they appear on the public site right away.
- Owner dashboard review actions use cache-busting requests.
- Public reviews use compatible column aliases so old table fields still work.

## Install

1. Unzip this package.
2. Replace the files in your GitHub repo with these files.
3. Commit changes.
4. Let Cloudflare redeploy.

No SQL migration is required.


Appearance-only update: changed membership wording to “Priority + Same-Day Scheduling when Eligible” and added locally owned and operated messaging. No backend changes or SQL migration required.
