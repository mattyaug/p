# Perigee Portland Reviews Update

This update adds a public Reviews section, Portland service-area emphasis, and owner dashboard review approvals.

## Included changes

- Adds Portland imagery to the homepage using the uploaded Portland photos.
- Updates homepage language to emphasize "serving Portland" and Portland-focused exterior property care.
- Adds a public Reviews section to the homepage.
- Adds a public review submission form.
- Adds owner dashboard review approval tools.
- Adds owner logs for new review submissions, review approvals, rejections, and deletions.
- Adds 12 five-star starter sample review entries and 1 four-star starter sample review entry as **pending** reviews. They are not shown publicly unless approved in the owner dashboard.

## Install

1. Unzip this package.
2. Replace the files in the GitHub repo with these files.
3. Commit changes.
4. Let Cloudflare redeploy.

## Database

The Worker can create the reviews table automatically. For a clean setup, run this once in D1:

```text
migration_reviews.sql
```

Path:

```text
Cloudflare → Storage & databases → D1 SQL Database → perigee_appointments → Console / Query
```

Copy the contents of `migration_reviews.sql`, paste into the D1 console, and run it.

## Review approval

Public users can submit reviews on the homepage. Reviews are saved as `pending` and will not appear publicly until approved.

Review moderation is here:

```text
https://goperigee.com/owner/
```

Cloudflare Zero Trust should continue protecting:

```text
goperigee.com/owner
goperigee.com/owner/*
goperigee.com/logs
goperigee.com/logs/*
goperigee.com/api/admin
goperigee.com/api/admin/*
```

## Starter samples

The included starter reviews are intentionally marked `pending`. Approve only reviews you want to display publicly.
