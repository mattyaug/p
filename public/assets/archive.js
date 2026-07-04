const archivedBody = document.querySelector("#archivedBody");
const logsBody = document.querySelector("#logsBody");
const archivedReviewsBody = document.querySelector("#archivedReviewsBody");
const refreshButton = document.querySelector("#refreshArchive");
const archiveEmptyState = document.querySelector("#archiveEmptyState");
const logsEmptyState = document.querySelector("#logsEmptyState");
const archivedCountBadge = document.querySelector("#archivedCountBadge");
const logsCountBadge = document.querySelector("#logsCountBadge");
const archivedReviewsCountBadge = document.querySelector("#archivedReviewsCountBadge");
const archivedReviewsEmptyState = document.querySelector("#archivedReviewsEmptyState");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(dateValue, timeValue) {
  if (!dateValue) return "—";
  return `${dateValue}`;
}

function customerTypeLabel(item) {
  if (!item.user_id) return { text: "Guest request — no portal account", className: "requested" };
  if (item.account_status === "active") return { text: "Active member work order", className: "completed" };
  if (item.account_status === "canceled" || item.account_status === "inactive") return { text: `Portal account — membership ${item.account_status}`, className: "canceled" };
  return { text: "Portal account — not active member", className: "confirmed" };
}

function renderArchived(appointments) {
  archivedCountBadge.textContent = `${appointments.length} archived record${appointments.length === 1 ? "" : "s"}`;
  archiveEmptyState.classList.toggle("hidden", appointments.length > 0);
  archivedBody.innerHTML = appointments.map((item) => {
    const type = customerTypeLabel(item);
    return `
      <tr>
        <td>${escapeHtml(item.archived_at ? new Date(item.archived_at).toLocaleString() : "—")}<br><span class="muted">${escapeHtml(item.archive_reason || "Deleted from owner dashboard")}</span></td>
        <td><span class="status ${escapeHtml(type.className)}">${escapeHtml(type.text)}</span></td>
        <td><strong>${escapeHtml(item.full_name)}</strong><br><span class="muted">${escapeHtml(item.phone)}</span><br><a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a></td>
        <td>${escapeHtml(item.property_address)}</td>
        <td><strong>${escapeHtml(item.service)}</strong><br><span class="muted">${escapeHtml(item.member_status || "—")}</span></td>
        <td>${escapeHtml(formatDateTime(item.requested_date, item.requested_time))}</td>
        <td>${escapeHtml(item.notes || "—")}</td>
        <td><span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span><br><span class="muted">Created ${escapeHtml(new Date(item.created_at).toLocaleString())}</span></td>
      </tr>
    `;
  }).join("");
}


function renderArchivedReviews(reviews) {
  if (!archivedReviewsBody) return;
  archivedReviewsCountBadge.textContent = `${reviews.length} archived review${reviews.length === 1 ? "" : "s"}`;
  archivedReviewsEmptyState.classList.toggle("hidden", reviews.length > 0);
  archivedReviewsBody.innerHTML = reviews.map((item) => `
    <tr>
      <td>${escapeHtml(item.updated_at ? new Date(item.updated_at).toLocaleString() : "—")}</td>
      <td><span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span><br><span class="muted">${escapeHtml(item.source || "website")}</span></td>
      <td><strong>${escapeHtml(item.customer_name)}</strong><br><a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a><br><span class="muted">${escapeHtml(item.city || "Portland")}</span></td>
      <td>${escapeHtml(item.rating)}/5</td>
      <td>${escapeHtml(item.review_text)}</td>
      <td>${escapeHtml(item.service || "—")}</td>
    </tr>
  `).join("");
}

function summarizeDetails(details) {
  try {
    const parsed = JSON.parse(details || "{}");
    return Object.entries(parsed).map(([key, value]) => `${key}: ${value}`).join(" · ") || "—";
  } catch (_) {
    return details || "—";
  }
}

function renderLogs(logs) {
  logsCountBadge.textContent = `${logs.length} log entr${logs.length === 1 ? "y" : "ies"}`;
  logsEmptyState.classList.toggle("hidden", logs.length > 0);
  logsBody.innerHTML = logs.map((item) => `
    <tr>
      <td>${escapeHtml(new Date(item.created_at).toLocaleString())}</td>
      <td><strong>${escapeHtml(item.title)}</strong><br><span class="muted">${escapeHtml(item.event_type)}</span></td>
      <td>${escapeHtml(item.entity_type)}<br><span class="muted">${escapeHtml(item.entity_id || "—")}</span></td>
      <td>${escapeHtml(summarizeDetails(item.details))}</td>
    </tr>
  `).join("");
}

async function fetchAdmin(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Owner access is restricted by Cloudflare Access.");
  }
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function loadArchive() {
  refreshButton.disabled = true;
  try {
    const data = await fetchAdmin("/api/admin/archive");
    renderArchived(data.archivedAppointments || []);
    renderArchivedReviews(data.archivedReviews || []);
    renderLogs(data.logs || []);
  } catch (error) {
    if (String(error.message).includes("Cloudflare Access")) return;
    archiveEmptyState.className = "notice error";
    archiveEmptyState.textContent = error.message || "Could not load archives.";
    archiveEmptyState.classList.remove("hidden");
  } finally {
    refreshButton.disabled = false;
  }
}


refreshButton.addEventListener("click", loadArchive);
loadArchive();
