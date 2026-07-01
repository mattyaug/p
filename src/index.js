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
const PASSWORD_ITERATIONS = 120000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: corsHeaders("GET, POST, PATCH, OPTIONS") });
    }

    try {
      if (url.pathname === "/api/config" && request.method === "GET") {
        return handleConfig(env);
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

      // Owner/admin endpoints.
      if (url.pathname === "/api/admin/appointments" && request.method === "GET") {
        return handleListAppointments(request, env);
      }

      const appointmentIdMatch = url.pathname.match(/^\/api\/admin\/appointments\/([^/]+)$/);
      if (appointmentIdMatch && request.method === "PATCH") {
        return handleUpdateAppointment(request, env, appointmentIdMatch[1]);
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
  return json({
    businessName: env.BUSINESS_NAME || "Perigee Property Management",
    serviceArea: env.SERVICE_AREA || "Portland",
    stripeMembershipLink: env.STRIPE_MEMBERSHIP_LINK || "https://buy.stripe.com/placeholder",
  }, 200, { "Cache-Control": "public, max-age=60" });
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

  await env.DB.prepare(`
    INSERT INTO members (
      id, full_name, email, password_hash, phone, property_address,
      membership_status, role, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'customer', ?, ?)
  `).bind(id, fullName, email, passwordHash, phone, propertyAddress, now, now).run();

  const member = await findMemberById(env, id);
  const { cookie, session } = await createSession(env, id);

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
  const emailResult = await sendAppointmentEmail(env, appointment);

  return json({ ok: true, appointment, emailSent: emailResult.ok, emailWarning: emailResult.ok ? null : emailResult.warning }, 201);
}

async function handleListAppointments(request, env) {
  const auth = authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);

  const result = await env.DB.prepare(`
    SELECT
      a.id, a.user_id, a.full_name, a.email, a.phone, a.property_address, a.service,
      a.member_status, a.requested_date, a.requested_time, a.notes, a.status,
      a.created_at, a.updated_at, m.membership_status AS account_status
    FROM appointments a
    LEFT JOIN members m ON m.id = a.user_id
    ORDER BY a.requested_date ASC, a.requested_time ASC, a.created_at DESC
    LIMIT 500
  `).all();

  return json({ appointments: result.results || [] });
}

async function handleUpdateAppointment(request, env, id) {
  const auth = authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);

  id = String(id || "").trim();
  if (!id) return json({ error: "Missing appointment ID." }, 400);

  const payload = await request.json().catch(() => null);
  const status = String(payload?.status || "").trim().toLowerCase();
  if (!ALLOWED_STATUSES.has(status)) return json({ error: "Invalid appointment status." }, 400);

  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, now, id).run();

  if (!result.meta || result.meta.changes === 0) return json({ error: "Appointment not found." }, 404);
  return json({ ok: true, id, status });
}

async function handleListMembers(request, env) {
  const auth = authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);

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
  const auth = authorize(request, env);
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
    url.pathname = "/owner/";
  }

  if (url.pathname === "/portal") url.pathname = "/portal/";
  if (url.pathname === "/owner") url.pathname = "/owner/";
  if (url.pathname === "/privacy") url.pathname = "/privacy/";

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

function authorize(request, env) {
  const configured = env.ADMIN_TOKEN;
  if (!configured) return { ok: false, status: 500, error: "ADMIN_TOKEN is not configured." };

  const token = request.headers.get("X-Admin-Token") || new URL(request.url).searchParams.get("token") || "";
  if (!token || token !== configured) return { ok: false, status: 401, error: "Unauthorized owner access." };
  return { ok: true };
}

async function sendAppointmentEmail(env, appointment) {
  const apiKey = env.RESEND_API_KEY;
  const to = env.ADMIN_EMAIL || "ma@goperigee.com";
  const from = env.FROM_EMAIL || "bookings@goperigee.com";

  if (!apiKey) return { ok: false, warning: "RESEND_API_KEY is not configured, so no email was sent." };

  const subject = `New Perigee appointment: ${appointment.service}`;
  const html = appointmentEmailHtml(appointment);
  const text = appointmentEmailText(appointment);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Perigee Bookings <${from}>`,
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
      subject: `New Perigee portal account: ${member.full_name}`,
      html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><h1 style="color:#06265a">New customer account</h1><p>${escapeHtml(member.full_name)} created a portal account.</p><table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px">${row("Name", member.full_name)}${row("Email", member.email)}${row("Phone", member.phone || "—")}${row("Property", member.property_address || "—")}${row("Status", member.membership_status || "pending")}</table></div>`,
      text: [`New customer account`, `Name: ${member.full_name}`, `Email: ${member.email}`, `Phone: ${member.phone || "—"}`, `Property: ${member.property_address || "—"}`, `Status: ${member.membership_status || "pending"}`].join("\n"),
    }),
  });
}

function appointmentEmailHtml(a) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
      <h1 style="color:#06265a">New appointment request</h1>
      <p>A customer submitted a new Perigee appointment request.</p>
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

function appointmentEmailText(a) {
  return [
    "New Perigee appointment request",
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
      ...corsHeaders("GET, POST, PATCH, OPTIONS"),
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
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
  };
}
