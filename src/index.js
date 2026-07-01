const REQUIRED_FIELDS = [
  "fullName",
  "email",
  "phone",
  "propertyAddress",
  "service",
  "memberStatus",
  "requestedDate",
  "requestedTime",
];

const PORTAL_REQUIRED_FIELDS = ["service", "requestedDate", "requestedTime"];
const ALLOWED_STATUSES = new Set(["requested", "confirmed", "completed", "canceled"]);
const ALLOWED_MEMBER_STATUSES = new Set(["pending", "active", "inactive", "canceled"]);
const SESSION_DAYS = 30;
const COOKIE_NAME = "perigee_session";
const ADMIN_COOKIE_NAME = "perigee_owner_session";
const ADMIN_SESSION_HOURS = 12;
const PASSWORD_ITERATIONS = 30000;
const OWNER_ACCESS_DEFAULT_EMAIL = "ma@goperigee.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: corsHeaders("GET, POST, PATCH, DELETE, OPTIONS") });
    }

    try {
      if (url.pathname === "/api/config" && request.method === "GET") {
        return handleConfig(env);
      }

      if (url.pathname === "/api/member-count" && request.method === "GET") {
        return handleMemberCount(env);
      }

      if (url.pathname === "/api/reviews" && request.method === "GET") {
        return handlePublicReviews(request, env);
      }

      if (url.pathname === "/api/reviews" && request.method === "POST") {
        return handleSubmitReview(request, env);
      }

      // Stripe webhook for automatic membership activation after payment.
      if (url.pathname === "/api/stripe/webhook" && request.method === "POST") {
        return handleStripeWebhook(request, env);
      }

      // Public appointment endpoint remains available for older forms/links.
      if (url.pathname === "/api/appointments" && request.method === "POST") {
        return handleCreateAppointment(request, env);
      }

      // Customer account endpoints.
      if (url.pathname === "/api/auth/register" && request.method === "POST") {
        return handleRegister(request, env);
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return handleLogin(request, env);
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return handleLogout(request, env);
      }

      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        return handleMe(request, env);
      }

      if (url.pathname === "/api/portal/profile" && request.method === "PATCH") {
        return handleUpdateProfile(request, env);
      }

      if (url.pathname === "/api/portal/appointments" && request.method === "GET") {
        return handleCustomerAppointments(request, env);
      }

      if (url.pathname === "/api/portal/appointments" && request.method === "POST") {
        return handleCustomerCreateAppointment(request, env);
      }

      // Owner/admin endpoints are private and require Cloudflare Zero Trust Access.
      // There is intentionally no public owner login screen or fallback login endpoint.
      if (["/api/admin/login", "/api/admin/logout", "/api/admin/me"].includes(url.pathname)) {
        return json({ error: "Not found." }, 404);
      }

      // Owner/admin endpoints.
      if (url.pathname === "/api/admin/appointments" && request.method === "GET") {
        return handleListAppointments(request, env);
      }

      const appointmentIdMatch = url.pathname.match(/^\/api\/admin\/appointments\/([^/]+)$/);
      if (appointmentIdMatch && request.method === "PATCH") {
        return handleUpdateAppointment(request, env, appointmentIdMatch[1]);
      }

      if (appointmentIdMatch && request.method === "DELETE") {
        return handleArchiveAppointment(request, env, appointmentIdMatch[1]);
      }

      if (url.pathname === "/api/admin/archive" && request.method === "GET") {
        return handleAdminArchive(request, env);
      }

      if (url.pathname === "/api/admin/reviews" && request.method === "GET") {
        return handleAdminReviews(request, env);
      }

      const reviewIdMatch = url.pathname.match(/^\/api\/admin\/reviews\/([^/]+)$/);
      if (reviewIdMatch && request.method === "PATCH") {
        return handleUpdateReview(request, env, reviewIdMatch[1]);
      }
      if (reviewIdMatch && request.method === "DELETE") {
        return handleDeleteReview(request, env, reviewIdMatch[1]);
      }

      if (url.pathname === "/api/admin/members" && request.method === "GET") {
        return handleListMembers(request, env);
      }

      const memberIdMatch = url.pathname.match(/^\/api\/admin\/members\/([^/]+)$/);
      if (memberIdMatch && request.method === "PATCH") {
        return handleUpdateMember(request, env, memberIdMatch[1]);
      }

      if (url.pathname.startsWith("/api/")) {
        return json({ error: "Not found." }, 404);
      }

      return serveStaticAsset(request, env);
    } catch (error) {
      console.error("Worker error", error);
      return json({ error: "Server error." }, 500);
    }
  },
};

function handleConfig(env) {
  const defaultStripeMembershipLink = "https://buy.stripe.com/4gM7sNewm0td1JwaBs8og00";
  const configuredStripeLink = String(env.STRIPE_MEMBERSHIP_LINK || "").trim();
  return json({
    businessName: env.BUSINESS_NAME || "Perigee Property Management",
    serviceArea: env.SERVICE_AREA || "Portland",
    stripeMembershipLink: configuredStripeLink && configuredStripeLink !== "https://buy.stripe.com/placeholder" ? configuredStripeLink : defaultStripeMembershipLink,
  }, 200, { "Cache-Control": "public, max-age=60" });
}

async function handleMemberCount(env) {
  const baseOffset = 27;
  if (!env.DB) {
    return json({ displayCount: baseOffset }, 200, { "Cache-Control": "public, max-age=300" });
  }

  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM members WHERE membership_status = 'active'").first();
    const activeMembers = Number(row?.count || 0);
    return json({ displayCount: activeMembers + baseOffset }, 200, { "Cache-Control": "public, max-age=300" });
  } catch (error) {
    console.error("Member count error", error);
    return json({ displayCount: baseOffset }, 200, { "Cache-Control": "public, max-age=300" });
  }
}

async function handleStripeWebhook(request, env) {
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: "STRIPE_WEBHOOK_SECRET is not configured." }, 500);

  const rawBody = await request.text();
  const signature = request.headers.get("Stripe-Signature") || "";
  const verified = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return json({ error: "Invalid Stripe signature." }, 400);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (_) {
    return json({ error: "Invalid Stripe payload." }, 400);
  }

  try {
    const result = await activateMembershipFromStripeEvent(env, event);
    return json({ received: true, ...result });
  } catch (error) {
    console.error("Stripe webhook handling failed", error);
    return json({ error: "Stripe webhook handler failed." }, 500);
  }
}

async function activateMembershipFromStripeEvent(env, event) {
  const type = String(event?.type || "");
  const object = event?.data?.object || {};

  if (!["checkout.session.completed", "invoice.payment_succeeded"].includes(type)) {
    return { ignored: true, reason: "Unhandled event type.", eventType: type };
  }

  const email = normalizeStripeEmail(object);
  if (!email) {
    console.warn("Stripe event had no customer email", type, event?.id || "");
    return { ignored: true, reason: "No customer email found.", eventType: type };
  }

  const paymentStatus = String(object.payment_status || object.status || "").toLowerCase();
  const shouldActivate = type === "invoice.payment_succeeded" || paymentStatus === "paid" || paymentStatus === "complete" || paymentStatus === "completed";
  if (!shouldActivate) {
    return { ignored: true, reason: `Payment status not active: ${paymentStatus || "unknown"}.`, eventType: type, email };
  }

  await recordMembershipPayment(env, {
    eventId: String(event.id || crypto.randomUUID()),
    eventType: type,
    email,
    stripeCustomerId: typeof object.customer === "string" ? object.customer : "",
    stripeSubscriptionId: typeof object.subscription === "string" ? object.subscription : "",
    paymentLinkId: typeof object.payment_link === "string" ? object.payment_link : "",
    status: "active",
  });

  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE members
    SET membership_status = 'active', updated_at = ?
    WHERE lower(email) = lower(?) AND membership_status != 'active'
  `).bind(now, email).run();

  return {
    ok: true,
    eventType: type,
    email,
    activatedExistingAccount: !!(result.meta && result.meta.changes > 0),
  };
}

function normalizeStripeEmail(object) {
  return trimLimit(
    object?.customer_details?.email ||
    object?.customer_email ||
    object?.customer?.email ||
    object?.metadata?.email ||
    "",
    160
  ).toLowerCase();
}

async function recordMembershipPayment(env, payment) {
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO membership_payments (
        id, event_id, event_type, email, stripe_customer_id, stripe_subscription_id,
        payment_link_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      payment.eventId,
      payment.eventType,
      payment.email,
      payment.stripeCustomerId || "",
      payment.stripeSubscriptionId || "",
      payment.paymentLinkId || "",
      payment.status || "active",
      now
    ).run();
  } catch (error) {
    console.error("Could not record Stripe membership payment. Run migration_stripe_auto_activation.sql if this persists.", error);
  }
}

async function hasCompletedMembershipPayment(env, email) {
  try {
    const row = await env.DB.prepare(`
      SELECT id
      FROM membership_payments
      WHERE lower(email) = lower(?) AND status = 'active'
      LIMIT 1
    `).bind(email).first();
    return !!row;
  } catch (_) {
    return false;
  }
}

async function verifyStripeSignature(payload, signatureHeader, secret) {
  const parts = String(signatureHeader || "").split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestampPart || !signatures.length) return false;

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = `${timestamp}.${payload}`;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expected = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((candidate) => timingSafeStringEqual(candidate, expected));
}

function timingSafeStringEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handleCreateAppointment(request, env) {
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ error: "Invalid request body." }, 400);

  const data = normalizePayload(payload);
  const missing = REQUIRED_FIELDS.filter((field) => !data[field]);
  if (missing.length) return json({ error: `Missing required field: ${missing[0]}` }, 400);

  if (!isValidEmail(data.email)) return json({ error: "Please enter a valid email address." }, 400);
  if (!isIsoDate(data.requestedDate)) return json({ error: "Please choose a valid requested date." }, 400);
  if (!isTime(data.requestedTime)) return json({ error: "Please choose a valid requested time." }, 400);

  const appointment = await insertAppointment(env, { ...data, userId: null });
  await logOwnerEvent(env, {
    eventType: "guest_request_created",
    entityType: "appointment",
    entityId: appointment.id,
    title: `Guest request: ${appointment.service}`,
    details: JSON.stringify({ email: appointment.email, name: appointment.fullName, requestedDate: appointment.requestedDate, requestedTime: appointment.requestedTime }),
  });
  const emailResult = await sendAppointmentEmail(env, appointment);

  return json({ ok: true, id: appointment.id, emailSent: emailResult.ok, emailWarning: emailResult.ok ? null : emailResult.warning }, 201);
}

async function handleRegister(request, env) {
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ error: "Invalid request body." }, 400);

  const fullName = trimLimit(payload.fullName, 120);
  const email = trimLimit(payload.email, 160).toLowerCase();
  const phone = trimLimit(payload.phone, 60);
  const propertyAddress = trimLimit(payload.propertyAddress, 240);
  const password = String(payload.password || "");

  if (!fullName || !email || !phone || !propertyAddress || !password) {
    return json({ error: "Name, email, phone, property address, and password are required." }, 400);
  }
  if (!isValidEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

  const existing = await env.DB.prepare("SELECT id FROM members WHERE lower(email) = lower(?) LIMIT 1").bind(email).first();
  if (existing) return json({ error: "An account already exists for that email. Please log in." }, 409);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const initialMembershipStatus = await hasCompletedMembershipPayment(env, email) ? "active" : "pending";

  await env.DB.prepare(`
    INSERT INTO members (
      id, full_name, email, password_hash, phone, property_address,
      membership_status, role, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'customer', ?, ?)
  `).bind(id, fullName, email, passwordHash, phone, propertyAddress, initialMembershipStatus, now, now).run();

  const member = await findMemberById(env, id);
  const { cookie, session } = await createSession(env, id);

  await logOwnerEvent(env, {
    eventType: "customer_signup",
    entityType: "member",
    entityId: id,
    title: `New portal account: ${fullName}`,
    details: JSON.stringify({ email, phone, propertyAddress, membershipStatus: initialMembershipStatus }),
  });
  await sendMemberWelcomeEmail(env, member).catch((error) => console.error("Welcome/admin email failed", error));

  return json({ ok: true, member: publicMember(member), sessionExpiresAt: session.expiresAt }, 201, {
    "Set-Cookie": cookie,
  });
}

async function handleLogin(request, env) {
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ error: "Invalid request body." }, 400);

  const email = trimLimit(payload.email, 160).toLowerCase();
  const password = String(payload.password || "");
  if (!email || !password) return json({ error: "Email and password are required." }, 400);

  const member = await env.DB.prepare(`
    SELECT id, full_name, email, password_hash, phone, property_address, membership_status, role, created_at, updated_at
    FROM members
    WHERE lower(email) = lower(?)
    LIMIT 1
  `).bind(email).first();

  if (!member || !(await verifyPassword(password, member.password_hash))) {
    return json({ error: "Invalid email or password." }, 401);
  }

  const { cookie, session } = await createSession(env, member.id);
  delete member.password_hash;

  return json({ ok: true, member: publicMember(member), sessionExpiresAt: session.expiresAt }, 200, {
    "Set-Cookie": cookie,
  });
}

async function handleLogout(request, env) {
  if (env.DB) {
    const token = getCookie(request, COOKIE_NAME);
    if (token) {
      const tokenHash = await sha256Hex(token);
      await env.DB.prepare("DELETE FROM member_sessions WHERE token_hash = ?").bind(tokenHash).run().catch(() => null);
    }
  }
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

async function handleMe(request, env) {
  const auth = await requireMember(request, env);
  if (!auth.ok) return json({ member: null }, 200);
  return json({ member: publicMember(auth.member) });
}

async function handleUpdateProfile(request, env) {
  const auth = await requireMember(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ error: "Invalid request body." }, 400);

  const fullName = trimLimit(payload.fullName, 120);
  const phone = trimLimit(payload.phone, 60);
  const propertyAddress = trimLimit(payload.propertyAddress, 240);
  if (!fullName || !phone || !propertyAddress) {
    return json({ error: "Name, phone, and property address are required." }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE members
    SET full_name = ?, phone = ?, property_address = ?, updated_at = ?
    WHERE id = ?
  `).bind(fullName, phone, propertyAddress, now, auth.member.id).run();

  const member = await findMemberById(env, auth.member.id);
  return json({ ok: true, member: publicMember(member) });
}

async function handleCustomerAppointments(request, env) {
  const auth = await requireMember(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const result = await env.DB.prepare(`
    SELECT id, full_name, email, phone, property_address, service, member_status,
           requested_date, requested_time, notes, status, created_at, updated_at
    FROM appointments
    WHERE user_id = ? OR lower(email) = lower(?)
    ORDER BY requested_date DESC, requested_time DESC, created_at DESC
    LIMIT 200
  `).bind(auth.member.id, auth.member.email).all();

  return json({ appointments: result.results || [] });
}

async function handleCustomerCreateAppointment(request, env) {
  const auth = await requireMember(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ error: "Invalid request body." }, 400);

  const data = normalizePortalAppointmentPayload(payload, auth.member);
  const missing = PORTAL_REQUIRED_FIELDS.filter((field) => !data[field]);
  if (missing.length) return json({ error: `Missing required field: ${missing[0]}` }, 400);
  if (!isIsoDate(data.requestedDate)) return json({ error: "Please choose a valid requested date." }, 400);
  if (!isTime(data.requestedTime)) return json({ error: "Please choose a valid requested time." }, 400);

  const appointment = await insertAppointment(env, data);
  await logOwnerEvent(env, {
    eventType: "member_work_order_created",
    entityType: "appointment",
    entityId: appointment.id,
    title: `Member work order: ${appointment.service}`,
    details: JSON.stringify({ memberId: auth.member.id, email: auth.member.email, requestedDate: appointment.requestedDate, requestedTime: appointment.requestedTime }),
  });
  const emailResult = await sendMemberWorkOrderEmail(env, appointment, auth.member);

  return json({ ok: true, appointment, emailSent: emailResult.ok, emailWarning: emailResult.ok ? null : emailResult.warning }, 201);
}


async function handlePublicReviews(request, env) {
  if (!env.DB) return json({ reviews: [] }, 200, { "Cache-Control": "public, max-age=120" });
  await ensureReviewsSchema(env);
  const result = await env.DB.prepare(`
    SELECT id, customer_name, city, rating, review_text, service, created_at
    FROM reviews
    WHERE status = 'approved'
    ORDER BY created_at DESC
    LIMIT 60
  `).all();
  return json({ reviews: result.results || [] }, 200, { "Cache-Control": "public, max-age=120" });
}

async function handleSubmitReview(request, env) {
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  await ensureReviewsSchema(env);

  const payload = await request.json().catch(() => null);
  if (!payload) return json({ error: "Invalid review request." }, 400);

  const customerName = trimLimit(payload.customerName, 120);
  const email = trimLimit(payload.email, 160).toLowerCase();
  const city = trimLimit(payload.city || "Portland", 80) || "Portland";
  const service = trimLimit(payload.service || "Perigee Membership", 120) || "Perigee Membership";
  const reviewText = trimLimit(payload.reviewText, 1200);
  const rating = Number(payload.rating);

  if (!customerName || !email || !reviewText) return json({ error: "Name, email, and review are required." }, 400);
  if (!isValidEmail(email)) return json({ error: "Please enter a valid email." }, 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "Please choose a rating from 1 to 5 stars." }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO reviews (id, customer_name, email, city, rating, review_text, service, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'public_submission', ?, ?)
  `).bind(id, customerName, email, city, rating, reviewText, service, now, now).run();

  await logOwnerEvent(env, {
    eventType: "review_submitted",
    entityType: "review",
    entityId: id,
    title: `New review submitted by ${customerName}`,
    details: JSON.stringify({ email, city, rating, service }),
  });
  await sendReviewNotificationEmail(env, { customerName, email, city, rating, reviewText, service, createdAt: now });

  return json({ ok: true, message: "Thank you. Your review has been submitted for approval." }, 201);
}

async function handleAdminReviews(request, env) {
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  await ensureReviewsSchema(env);

  const result = await env.DB.prepare(`
    SELECT id, customer_name, email, city, rating, review_text, service, status, source, created_at, updated_at
    FROM reviews
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC
    LIMIT 500
  `).all();
  return json({ reviews: result.results || [] });
}

async function handleUpdateReview(request, env, id) {
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  await ensureReviewsSchema(env);

  id = String(id || "").trim();
  const payload = await request.json().catch(() => null);
  const status = String(payload?.status || "").trim().toLowerCase();
  if (!["pending", "approved", "rejected"].includes(status)) return json({ error: "Invalid review status." }, 400);

  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE reviews SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, now, id).run();
  if (!result.meta || result.meta.changes === 0) return json({ error: "Review not found." }, 404);

  await logOwnerEvent(env, {
    eventType: "review_status_updated",
    entityType: "review",
    entityId: id,
    title: `Review marked ${status}`,
    details: JSON.stringify({ status }),
  });
  return json({ ok: true, id, status });
}

async function handleDeleteReview(request, env, id) {
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  await ensureReviewsSchema(env);

  id = String(id || "").trim();
  const existing = await env.DB.prepare("SELECT id, customer_name, email, rating FROM reviews WHERE id = ? LIMIT 1").bind(id).first();
  if (!existing) return json({ error: "Review not found." }, 404);

  await env.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
  await logOwnerEvent(env, {
    eventType: "review_deleted",
    entityType: "review",
    entityId: id,
    title: `Review deleted: ${existing.customer_name}`,
    details: JSON.stringify({ email: existing.email, rating: existing.rating }),
  });
  return json({ ok: true, id });
}

async function handleListAppointments(request, env) {
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  await ensureOwnerSchema(env);

  const result = await env.DB.prepare(`
    SELECT
      a.id, a.user_id, a.full_name, a.email, a.phone, a.property_address, a.service,
      a.member_status, a.requested_date, a.requested_time, a.notes, a.status,
      a.hidden_from_owner, a.archived_at, a.archive_reason,
      a.created_at, a.updated_at, m.membership_status AS account_status
    FROM appointments a
    LEFT JOIN members m ON m.id = a.user_id
    WHERE COALESCE(a.hidden_from_owner, 0) = 0
    ORDER BY a.requested_date ASC, a.requested_time ASC, a.created_at DESC
    LIMIT 500
  `).all();

  return json({ appointments: result.results || [] });
}

async function handleUpdateAppointment(request, env, id) {
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  await ensureOwnerSchema(env);

  id = String(id || "").trim();
  if (!id) return json({ error: "Missing appointment ID." }, 400);

  const payload = await request.json().catch(() => null);
  const status = String(payload?.status || "").trim().toLowerCase();
  if (!ALLOWED_STATUSES.has(status)) return json({ error: "Invalid appointment status." }, 400);

  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, now, id).run();

  if (!result.meta || result.meta.changes === 0) return json({ error: "Appointment not found." }, 404);
  await logOwnerEvent(env, {
    eventType: "appointment_status_updated",
    entityType: "appointment",
    entityId: id,
    title: `Appointment marked ${status}`,
    details: JSON.stringify({ status }),
  });
  return json({ ok: true, id, status });
}

async function handleArchiveAppointment(request, env, id) {
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  await ensureOwnerSchema(env);

  id = String(id || "").trim();
  if (!id) return json({ error: "Missing appointment ID." }, 400);

  const payload = await request.json().catch(() => ({}));
  const reason = trimLimit(payload?.reason || "Deleted from owner dashboard", 240);
  const now = new Date().toISOString();

  const existing = await env.DB.prepare("SELECT id, service, full_name, email FROM appointments WHERE id = ? LIMIT 1").bind(id).first();
  if (!existing) return json({ error: "Appointment not found." }, 404);

  const result = await env.DB.prepare(`
    UPDATE appointments
    SET hidden_from_owner = 1, archived_at = ?, archive_reason = ?, updated_at = ?
    WHERE id = ?
  `).bind(now, reason, now, id).run();

  if (!result.meta || result.meta.changes === 0) return json({ error: "Appointment not found." }, 404);
  await logOwnerEvent(env, {
    eventType: "appointment_archived",
    entityType: "appointment",
    entityId: id,
    title: `Archived from dashboard: ${existing.service}`,
    details: JSON.stringify({ reason, customer: existing.full_name, email: existing.email }),
  });
  return json({ ok: true, id, archivedAt: now });
}

async function handleAdminArchive(request, env) {
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  await ensureOwnerSchema(env);

  const appointments = await env.DB.prepare(`
    SELECT
      a.id, a.user_id, a.full_name, a.email, a.phone, a.property_address, a.service,
      a.member_status, a.requested_date, a.requested_time, a.notes, a.status,
      a.hidden_from_owner, a.archived_at, a.archive_reason,
      a.created_at, a.updated_at, m.membership_status AS account_status
    FROM appointments a
    LEFT JOIN members m ON m.id = a.user_id
    WHERE COALESCE(a.hidden_from_owner, 0) = 1
    ORDER BY COALESCE(a.archived_at, a.updated_at, a.created_at) DESC
    LIMIT 500
  `).all();

  const logs = await env.DB.prepare(`
    SELECT id, event_type, entity_type, entity_id, title, details, created_at
    FROM owner_logs
    ORDER BY created_at DESC
    LIMIT 1000
  `).all();

  return json({ archivedAppointments: appointments.results || [], logs: logs.results || [] });
}

async function handleListMembers(request, env) {
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  await ensureOwnerSchema(env);

  const result = await env.DB.prepare(`
    SELECT
      m.id, m.full_name, m.email, m.phone, m.property_address, m.membership_status,
      m.role, m.created_at, m.updated_at,
      COUNT(a.id) AS appointment_count,
      MAX(a.created_at) AS last_appointment_at
    FROM members m
    LEFT JOIN appointments a ON a.user_id = m.id OR lower(a.email) = lower(m.email)
    GROUP BY m.id
    ORDER BY m.created_at DESC
    LIMIT 500
  `).all();

  return json({ members: result.results || [] });
}

async function handleUpdateMember(request, env, id) {
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);

  id = String(id || "").trim();
  if (!id) return json({ error: "Missing member ID." }, 400);

  const payload = await request.json().catch(() => null);
  const membershipStatus = String(payload?.membershipStatus || "").trim().toLowerCase();
  if (!ALLOWED_MEMBER_STATUSES.has(membershipStatus)) return json({ error: "Invalid membership status." }, 400);

  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE members SET membership_status = ?, updated_at = ? WHERE id = ?")
    .bind(membershipStatus, now, id).run();

  if (!result.meta || result.meta.changes === 0) return json({ error: "Member not found." }, 404);
  await logOwnerEvent(env, {
    eventType: "member_status_updated",
    entityType: "member",
    entityId: id,
    title: `Member status changed to ${membershipStatus}`,
    details: JSON.stringify({ membershipStatus }),
  });
  return json({ ok: true, id, membershipStatus });
}

async function insertAppointment(env, data) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO appointments (
      id, user_id, full_name, email, phone, property_address, service, member_status,
      requested_date, requested_time, notes, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)
  `).bind(
    id,
    data.userId || null,
    data.fullName,
    data.email,
    data.phone,
    data.propertyAddress,
    data.service,
    data.memberStatus,
    data.requestedDate,
    data.requestedTime,
    data.notes || "",
    now,
    now
  ).run();

  return { id, ...data, notes: data.notes || "", createdAt: now, updatedAt: now, status: "requested" };
}

async function serveStaticAsset(request, env) {
  if (!env.ASSETS) return new Response("Static assets binding is not configured.", { status: 500 });

  const originalUrl = new URL(request.url);
  const url = new URL(request.url);

  if (url.hostname === "owner.goperigee.com" && (url.pathname === "/" || url.pathname === "")) {
    // Legacy owner subdomain support. The intended private pages are now on goperigee.com/owner/ and goperigee.com/logs/.
    url.pathname = "/owner/";
  }

  if (url.pathname === "/portal") url.pathname = "/portal/";
  if (url.pathname === "/owner") url.pathname = "/owner/";
  if (url.pathname === "/logs") url.pathname = "/logs/";
  if (url.pathname === "/owner/archive" || url.pathname === "/owner/archive/") url.pathname = "/logs/";
  if (url.pathname === "/privacy") url.pathname = "/privacy/";
  if (url.pathname === "/terms") url.pathname = "/terms/";

  const privateOwnerPage = url.pathname.startsWith("/owner/") || url.pathname.startsWith("/logs/");
  if (privateOwnerPage && !isCloudflareAccessAuthorized(request, env)) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const assetRequest = new Request(url.toString(), request);
  let response = await env.ASSETS.fetch(assetRequest);

  if (response.status === 404 && url.pathname.endsWith("/")) {
    const indexUrl = new URL(url.toString());
    indexUrl.pathname = `${url.pathname}index.html`;
    response = await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
  }

  if (response.status === 404 && originalUrl.pathname === "/") {
    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    response = await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
  }

  return response;
}

function normalizePayload(payload) {
  return {
    fullName: trimLimit(payload.fullName, 120),
    email: trimLimit(payload.email, 160).toLowerCase(),
    phone: trimLimit(payload.phone, 60),
    propertyAddress: trimLimit(payload.propertyAddress, 240),
    service: trimLimit(payload.service, 120),
    memberStatus: trimLimit(payload.memberStatus, 120),
    requestedDate: trimLimit(payload.requestedDate, 20),
    requestedTime: trimLimit(payload.requestedTime, 20),
    notes: trimLimit(payload.notes, 2000),
  };
}

function normalizePortalAppointmentPayload(payload, member) {
  const accountStatus = member.membership_status || "pending";
  const displayStatus = accountStatus === "active" ? "Active member" : `Account ${accountStatus}`;
  return {
    userId: member.id,
    fullName: member.full_name,
    email: member.email,
    phone: member.phone || "",
    propertyAddress: member.property_address || "",
    service: trimLimit(payload.service, 120),
    memberStatus: displayStatus,
    requestedDate: trimLimit(payload.requestedDate, 20),
    requestedTime: trimLimit(payload.requestedTime, 20),
    notes: trimLimit(payload.notes, 2000),
  };
}

function publicMember(member) {
  if (!member) return null;
  return {
    id: member.id,
    fullName: member.full_name,
    email: member.email,
    phone: member.phone || "",
    propertyAddress: member.property_address || "",
    membershipStatus: member.membership_status || "pending",
    role: member.role || "customer",
    createdAt: member.created_at,
    updatedAt: member.updated_at,
  };
}

async function requireMember(request, env) {
  if (!env.DB) return { ok: false, status: 500, error: "Database binding DB is not configured." };

  const token = getCookie(request, COOKIE_NAME);
  if (!token) return { ok: false, status: 401, error: "Please log in." };

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();

  const row = await env.DB.prepare(`
    SELECT
      m.id, m.full_name, m.email, m.phone, m.property_address, m.membership_status,
      m.role, m.created_at, m.updated_at, s.expires_at
    FROM member_sessions s
    JOIN members m ON m.id = s.member_id
    WHERE s.token_hash = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first();

  if (!row) return { ok: false, status: 401, error: "Please log in." };
  return { ok: true, member: row };
}

async function createSession(env, memberId) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const sessionId = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO member_sessions (id, member_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(sessionId, memberId, tokenHash, expiresAt, now.toISOString()).run();

  await env.DB.prepare("DELETE FROM member_sessions WHERE expires_at <= ?").bind(now.toISOString()).run().catch(() => null);

  return {
    session: { id: sessionId, expiresAt },
    cookie: sessionCookie(token, expiresAt),
  };
}

async function findMemberById(env, id) {
  return env.DB.prepare(`
    SELECT id, full_name, email, phone, property_address, membership_status, role, created_at, updated_at
    FROM members
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${base64Encode(salt)}$${base64Encode(hash)}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10000) return false;
  const salt = base64Decode(parts[2]);
  const expected = base64Decode(parts[3]);
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(password, salt, iterations) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64UrlEncode(bytes);
}

function base64Encode(bytes) {
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64Decode(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(bytes) {
  return base64Encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const parts = cookie.split(";").map((part) => part.trim());
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index);
    const value = part.slice(index + 1);
    if (key === name) return decodeURIComponent(value);
  }
  return "";
}

function sessionCookie(token, expiresAt) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`;
}

function trimLimit(value, max) {
  return String(value || "").trim().slice(0, max);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTime(value) {
  return /^\d{2}:\d{2}$/.test(value);
}

async function handleAdminLogin(request, env) {
  if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN is not configured." }, 500);

  const payload = await request.json().catch(() => null);
  const token = String(payload?.token || "").trim();
  if (!token || token !== env.ADMIN_TOKEN) {
    await logOwnerEvent(env, {
      eventType: "owner_login_failed",
      entityType: "owner",
      entityId: "owner",
      title: "Failed owner dashboard login",
      details: JSON.stringify({ ip: request.headers.get("CF-Connecting-IP") || "unknown" }),
    });
    return json({ error: "Invalid owner access code." }, 401);
  }

  const { cookie, expiresAt } = await createAdminSessionCookie(env);
  await logOwnerEvent(env, {
    eventType: "owner_login",
    entityType: "owner",
    entityId: "owner",
    title: "Owner dashboard login",
    details: JSON.stringify({ expiresAt }),
  });
  return json({ ok: true, expiresAt }, 200, { "Set-Cookie": cookie });
}

async function handleAdminLogout(request, env) {
  await logOwnerEvent(env, {
    eventType: "owner_logout",
    entityType: "owner",
    entityId: "owner",
    title: "Owner dashboard logout",
    details: "{}",
  });
  return json({ ok: true }, 200, { "Set-Cookie": clearAdminSessionCookie() });
}

async function handleAdminMe(request, env) {
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ owner: null, error: auth.error }, auth.status);
  return json({ owner: { authenticated: true } });
}

async function authorize(request, env) {
  // Owner privacy is handled at the Cloudflare Zero Trust Access layer.
  // Protect these paths in Cloudflare Access:
  //   /owner, /owner/*, /logs, /logs/*, /api/admin, /api/admin/*
  // This avoids a duplicate in-app login/header check and prevents public users from reaching these routes when Access is configured.
  return { ok: true };
}

async function createAdminSessionCookie(env) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = nowSeconds + ADMIN_SESSION_HOURS * 60 * 60;
  const payload = { iat: nowSeconds, exp: expiresAtSeconds, nonce: randomToken(16) };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSha256Hex(env.ADMIN_TOKEN, payloadB64);
  const expiresAt = new Date(expiresAtSeconds * 1000).toISOString();
  return {
    expiresAt,
    cookie: `${ADMIN_COOKIE_NAME}=${payloadB64}.${signature}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; Secure; SameSite=Lax`,
  };
}

function clearAdminSessionCookie() {
  return `${ADMIN_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`;
}

async function hmacSha256Hex(secret, value) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlDecode(value) {
  let input = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return base64Decode(input);
}

async function ensureOwnerSchema(env) {
  if (!env.DB) return;
  await env.DB.prepare("ALTER TABLE appointments ADD COLUMN hidden_from_owner INTEGER NOT NULL DEFAULT 0").run().catch(() => null);
  await env.DB.prepare("ALTER TABLE appointments ADD COLUMN archived_at TEXT").run().catch(() => null);
  await env.DB.prepare("ALTER TABLE appointments ADD COLUMN archive_reason TEXT").run().catch(() => null);
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_appointments_hidden_from_owner ON appointments (hidden_from_owner)").run().catch(() => null);
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS owner_logs (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT DEFAULT '',
      title TEXT NOT NULL,
      details TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `).run().catch(() => null);
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_owner_logs_created_at ON owner_logs (created_at)").run().catch(() => null);
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_owner_logs_entity ON owner_logs (entity_type, entity_id)").run().catch(() => null);
}


async function ensureReviewsSchema(env) {
  if (!env.DB) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Portland',
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      review_text TEXT NOT NULL,
      service TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      source TEXT DEFAULT 'public_submission',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run().catch(() => null);
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews (status)").run().catch(() => null);
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews (created_at)").run().catch(() => null);
  // Starter reviews are no longer auto-seeded. Reviews remain under owner control.
}

async function sendReviewNotificationEmail(env, review) {
  const apiKey = env.RESEND_API_KEY;
  const to = env.ADMIN_EMAIL || "ma@goperigee.com";
  const from = env.FROM_EMAIL || "bookings@goperigee.com";
  if (!apiKey) return { ok: false, warning: "RESEND_API_KEY is not configured, so no email was sent." };

  const subject = `New Perigee review submitted: ${review.rating} stars`;
  const text = `A new Perigee review was submitted for approval.\n\nName: ${review.customerName}\nEmail: ${review.email}\nCity: ${review.city}\nRating: ${review.rating}/5\nService: ${review.service}\n\nReview:\n${review.reviewText}\n\nReview it in the owner dashboard.`;
  const html = `<h2>New Perigee review submitted</h2><p>A new review is waiting for approval.</p><ul><li><strong>Name:</strong> ${escapeHtml(review.customerName)}</li><li><strong>Email:</strong> ${escapeHtml(review.email)}</li><li><strong>City:</strong> ${escapeHtml(review.city)}</li><li><strong>Rating:</strong> ${escapeHtml(review.rating)}/5</li><li><strong>Service:</strong> ${escapeHtml(review.service)}</li></ul><p>${escapeHtml(review.reviewText)}</p>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: formatFromAddress(from, "Perigee Reviews"), to, subject, text, html }),
    });
    if (!response.ok) return { ok: false, warning: `Resend returned ${response.status}.` };
    return { ok: true };
  } catch (error) {
    console.error("Review email failed", error);
    return { ok: false, warning: "Review email failed." };
  }
}

async function sendMemberWorkOrderEmail(env, appointment, member) {
  const enriched = {
    ...appointment,
    memberStatus: appointment.memberStatus || (member?.membership_status === "active" ? "Active member" : `Account ${member?.membership_status || "pending"}`),
    portalAccountEmail: member?.email || appointment.email,
  };
  return sendAppointmentEmail(env, enriched, {
    subject: `New Perigee member work order: ${appointment.service}`,
    intro: "A portal member submitted a new Perigee work order.",
    fromName: "Perigee Work Orders",
  });
}

async function sendAppointmentEmail(env, appointment, options = {}) {
  const apiKey = env.RESEND_API_KEY;
  const to = env.ADMIN_EMAIL || "ma@goperigee.com";
  const from = env.FROM_EMAIL || "bookings@goperigee.com";

  if (!apiKey) return { ok: false, warning: "RESEND_API_KEY is not configured, so no email was sent." };

  const subject = options.subject || `New Perigee appointment: ${appointment.service}`;
  const html = appointmentEmailHtml(appointment, options.intro);
  const text = appointmentEmailText(appointment, options.intro);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${options.fromName || "Perigee Bookings"} <${from}>`,
        to: [to],
        reply_to: appointment.email,
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Resend appointment email failed", response.status, body);
      return { ok: false, warning: "Appointment was saved, but the email notification failed." };
    }
    return { ok: true };
  } catch (error) {
    console.error("Resend appointment email error", error);
    return { ok: false, warning: "Appointment was saved, but the email notification failed." };
  }
}

async function sendMemberWelcomeEmail(env, member) {
  const apiKey = env.RESEND_API_KEY;
  const to = env.ADMIN_EMAIL || "ma@goperigee.com";
  const from = env.FROM_EMAIL || "bookings@goperigee.com";
  if (!apiKey || !member) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Perigee Portal <${from}>`,
      to: [to],
      reply_to: member.email,
      subject: `New Perigee customer signup: ${member.full_name}`,
      html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><h1 style="color:#06265a">New customer account</h1><p>${escapeHtml(member.full_name)} created a portal account. Check whether the customer has used the same email for Stripe membership payment.</p><table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px">${row("Name", member.full_name)}${row("Email", member.email)}${row("Phone", member.phone || "—")}${row("Property", member.property_address || "—")}${row("Status", member.membership_status || "pending")}</table></div>`,
      text: [`New customer account`, `Name: ${member.full_name}`, `Email: ${member.email}`, `Phone: ${member.phone || "—"}`, `Property: ${member.property_address || "—"}`, `Status: ${member.membership_status || "pending"}`].join("\n"),
    }),
  });
}

function appointmentEmailHtml(a, intro = "A customer submitted a new Perigee appointment request.") {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
      <h1 style="color:#06265a">New appointment request</h1>
      <p>${escapeHtml(intro)}</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px">
        ${row("Request ID", a.id)}
        ${row("Account ID", a.userId || "No portal account attached")}
        ${row("Name", a.fullName)}
        ${row("Email", a.email)}
        ${row("Phone", a.phone)}
        ${row("Property", a.propertyAddress)}
        ${row("Service", a.service)}
        ${row("Membership status", a.memberStatus)}
        ${row("Preferred date", a.requestedDate)}
        ${row("Preferred time", a.requestedTime)}
        ${row("Notes", a.notes || "—")}
        ${row("Created", a.createdAt)}
      </table>
    </div>
  `;
}

function appointmentEmailText(a, intro = "A customer submitted a new Perigee appointment request.") {
  return [
    "New Perigee appointment request",
    intro,
    `Request ID: ${a.id}`,
    `Account ID: ${a.userId || "No portal account attached"}`,
    `Name: ${a.fullName}`,
    `Email: ${a.email}`,
    `Phone: ${a.phone}`,
    `Property: ${a.propertyAddress}`,
    `Service: ${a.service}`,
    `Membership status: ${a.memberStatus}`,
    `Preferred date: ${a.requestedDate}`,
    `Preferred time: ${a.requestedTime}`,
    `Notes: ${a.notes || "—"}`,
    `Created: ${a.createdAt}`,
  ].join("\n");
}

function row(label, value) {
  return `<tr><th align="left" style="border:1px solid #d9e2ef;background:#f7faff;color:#06265a;width:190px">${escapeHtml(label)}</th><td style="border:1px solid #d9e2ef">${escapeHtml(value)}</td></tr>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders("GET, POST, PATCH, DELETE, OPTIONS"),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(methods) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
