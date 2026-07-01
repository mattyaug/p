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

const ALLOWED_STATUSES = new Set(["requested", "confirmed", "completed", "canceled"]);

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

      if (url.pathname === "/api/appointments" && request.method === "POST") {
        return handleCreateAppointment(request, env);
      }

      if (url.pathname === "/api/admin/appointments" && request.method === "GET") {
        return handleListAppointments(request, env);
      }

      const appointmentIdMatch = url.pathname.match(/^\/api\/admin\/appointments\/([^/]+)$/);
      if (appointmentIdMatch && request.method === "PATCH") {
        return handleUpdateAppointment(request, env, appointmentIdMatch[1]);
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
  if (!env.DB) {
    return json({ error: "Database binding DB is not configured." }, 500);
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ error: "Invalid request body." }, 400);
  }

  const data = normalizePayload(payload);
  const missing = REQUIRED_FIELDS.filter((field) => !data[field]);
  if (missing.length) {
    return json({ error: `Missing required field: ${missing[0]}` }, 400);
  }

  if (!isValidEmail(data.email)) {
    return json({ error: "Please enter a valid email address." }, 400);
  }

  if (!isIsoDate(data.requestedDate)) {
    return json({ error: "Please choose a valid requested date." }, 400);
  }

  if (!isTime(data.requestedTime)) {
    return json({ error: "Please choose a valid requested time." }, 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO appointments (
      id,
      full_name,
      email,
      phone,
      property_address,
      service,
      member_status,
      requested_date,
      requested_time,
      notes,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)
  `).bind(
    id,
    data.fullName,
    data.email,
    data.phone,
    data.propertyAddress,
    data.service,
    data.memberStatus,
    data.requestedDate,
    data.requestedTime,
    data.notes,
    now,
    now
  ).run();

  const emailResult = await sendAppointmentEmail(env, { id, ...data, createdAt: now });

  return json({
    ok: true,
    id,
    emailSent: emailResult.ok,
    emailWarning: emailResult.ok ? null : emailResult.warning,
  }, 201);
}

async function handleListAppointments(request, env) {
  const auth = authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  if (!env.DB) {
    return json({ error: "Database binding DB is not configured." }, 500);
  }

  const result = await env.DB.prepare(`
    SELECT
      id,
      full_name,
      email,
      phone,
      property_address,
      service,
      member_status,
      requested_date,
      requested_time,
      notes,
      status,
      created_at,
      updated_at
    FROM appointments
    ORDER BY requested_date ASC, requested_time ASC, created_at DESC
    LIMIT 500
  `).all();

  return json({ appointments: result.results || [] });
}

async function handleUpdateAppointment(request, env, id) {
  const auth = authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  if (!env.DB) {
    return json({ error: "Database binding DB is not configured." }, 500);
  }

  id = String(id || "").trim();
  if (!id) return json({ error: "Missing appointment ID." }, 400);

  const payload = await request.json().catch(() => null);
  const status = String(payload?.status || "").trim().toLowerCase();
  if (!ALLOWED_STATUSES.has(status)) {
    return json({ error: "Invalid appointment status." }, 400);
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE appointments
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).bind(status, now, id).run();

  if (!result.meta || result.meta.changes === 0) {
    return json({ error: "Appointment not found." }, 404);
  }

  return json({ ok: true, id, status });
}

async function serveStaticAsset(request, env) {
  if (!env.ASSETS) {
    return new Response("Static assets binding is not configured.", { status: 500 });
  }

  const originalUrl = new URL(request.url);
  const url = new URL(request.url);

  // Allow owner.goperigee.com to open the same dashboard as /owner/.
  if (url.hostname === "owner.goperigee.com" && (url.pathname === "/" || url.pathname === "")) {
    url.pathname = "/owner/";
  }

  // Directory convenience routes.
  if (url.pathname === "/portal") url.pathname = "/portal/";
  if (url.pathname === "/owner") url.pathname = "/owner/";
  if (url.pathname === "/privacy") url.pathname = "/privacy/";

  const assetRequest = new Request(url.toString(), request);
  let response = await env.ASSETS.fetch(assetRequest);

  // Some asset configs do not auto-resolve directory indexes. Try index.html manually.
  if (response.status === 404 && url.pathname.endsWith("/")) {
    const indexUrl = new URL(url.toString());
    indexUrl.pathname = `${url.pathname}index.html`;
    response = await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
  }

  // Root fallback.
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
  if (!configured) {
    return { ok: false, status: 500, error: "ADMIN_TOKEN is not configured." };
  }

  const token = request.headers.get("X-Admin-Token") || new URL(request.url).searchParams.get("token") || "";
  if (!token || token !== configured) {
    return { ok: false, status: 401, error: "Unauthorized owner access." };
  }

  return { ok: true };
}

async function sendAppointmentEmail(env, appointment) {
  const apiKey = env.RESEND_API_KEY;
  const to = env.ADMIN_EMAIL || "ma@goperigee.com";
  const from = env.FROM_EMAIL || "bookings@goperigee.com";

  if (!apiKey) {
    return { ok: false, warning: "RESEND_API_KEY is not configured, so no email was sent." };
  }

  const subject = `New Perigee appointment: ${appointment.service}`;
  const html = appointmentEmailHtml(appointment);
  const text = appointmentEmailText(appointment);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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
      console.error("Resend email failed", response.status, body);
      return { ok: false, warning: "Appointment was saved, but the email notification failed." };
    }

    return { ok: true };
  } catch (error) {
    console.error("Resend email error", error);
    return { ok: false, warning: "Appointment was saved, but the email notification failed." };
  }
}

function appointmentEmailHtml(a) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
      <h1 style="color:#06265a">New appointment request</h1>
      <p>A customer submitted a new Perigee appointment request.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px">
        ${row("Request ID", a.id)}
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
    .replace(/"/g, "&quot;")
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
