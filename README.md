# Perigee review moderation fix

This update fixes review moderation behavior without changing the site structure.

Changes:
- Approving/rejecting reviews no longer shows a false failure message if logging has a non-critical issue.
- Review submit/moderation remains compatible with the older D1 review table column names.
- Owner review buttons are clearer:
  - Approve / show
  - Back to pending
  - Remove from website (keeps the review in the owner panel)
  - Move to logs, keep live (removes from owner panel, leaves approved reviews visible publicly)
- Logs page now includes archived reviews.
- Red outline buttons have readable text.

Install:
1. Unzip this package.
2. Replace the current GitHub repo files with these files.
3. Commit changes.
4. Let Cloudflare redeploy.

No SQL migration is required. The Worker will add missing review compatibility columns automatically if needed.
