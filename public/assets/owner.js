const tableBody = document.querySelector("#appointmentsBody");
const membersBody = document.querySelector("#membersBody");
const refreshButton = document.querySelector("#refreshDashboard");
const emptyState = document.querySelector("#emptyState");
const memberEmptyState = document.querySelector("#memberEmptyState");
const countBadge = document.querySelector("#countBadge");
const memberCountBadge = document.querySelector("#memberCountBadge");
const reviewsBody = document.querySelector("#reviewsBody");
const reviewEmptyState = document.querySelector("#reviewEmptyState");
const reviewCountBadge = document.querySelector("#reviewCountBadge");
const tokenStatus = document.querySelector("#tokenStatus");
const searchInput = document.querySelector("#dashboardSearch");
const filterInput = document.querySelector("#dashboardFilter");
const statTotal = document.querySelector("#statTotal");
const statMembers = document.querySelector("#statMembers");
const statGuests = document.querySelector("#statGuests");
const statAccounts = document.querySelector("#statAccounts");
const statReviews = document.querySelector("#statReviews");

let allAppointments = [];
let allMembers = [];
let allReviews = [];

function formatDateTime(dateValue, timeValue) {
  if (!dateValue) return "—";
  const time = timeValue || "";
  return `${dateValue}${time ? ` at ${time}` : ""}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function memberStatusClass(value) {
  if (value === "active") return "completed";
  if (value === "inactive" || value === "canceled") return "canceled";
  return "requested";
}

function customerTypeLabel(item) {
  if (!item.user_id) return { text: "Guest request — no portal account", className: "requested", group: "guest" };
  if (item.account_status === "active") return { text: "Active member work order", className: "completed", group: "member" };
  if (item.account_status === "canceled" || item.account_status === "inactive") return { text: `Portal account — membership ${item.account_status}`, className: "canceled", group: "account" };
  return { text: "Portal account — not active member", className: "confirmed", group: "account" };
}

function membershipDetailLabel(status) {
  if (status === "active") return "Actual member: active paid/approved membership";
  if (status === "pending") return "Portal account only: membership not active yet";
  if (status === "canceled") return "Portal account: membership canceled";
  if (status === "inactive") return "Portal account: membership inactive";
  return `Portal account: membership ${status || "pending"}`;
}

function reviewStatusClass(status) {
  if (status === "approved") return "completed";
  if (status === "rejected") return "canceled";
  return "requested";
}

function renderStars(rating) {
  const value = Math.max(1, Math.min(5, Number(rating) || 5));
  return "★".repeat(value) + "☆".repeat(5 - value);
}

function matchesAppointmentFilter(item) {
  const selected = filterInput.value;
  const type = customerTypeLabel(item);
  if (selected !== "all") {
    if (["member", "account", "guest"].includes(selected) && type.group !== selected) return false;
    if (["requested", "confirmed", "completed", "canceled"].includes(selected) && item.status !== selected) return false;
  }
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return true;
  return [
    item.full_name, item.email, item.phone, item.property_address, item.service,
    item.member_status, item.requested_date, item.requested_time, item.notes, item.status,
    item.account_status, type.text,
  ].some((value) => String(value || "").toLowerCase().includes(query));
}

function renderStats() {
  const visible = allAppointments;
  statTotal.textContent = visible.length;
  statMembers.textContent = visible.filter((item) => customerTypeLabel(item).group === "member").length;
  statGuests.textContent = visible.filter((item) => customerTypeLabel(item).group === "guest").length;
  statAccounts.textContent = allMembers.length;
  if (statReviews) statReviews.textContent = allReviews.filter((item) => item.status === "pending").length;
}

function renderRows() {
  const appointments = allAppointments.filter(matchesAppointmentFilter);
  countBadge.textContent = `${appointments.length} visible appointment${appointments.length === 1 ? "" : "s"}`;
  emptyState.classList.toggle("hidden", appointments.length > 0);
  tableBody.innerHTML = appointments.map((item) => {
    const type = customerTypeLabel(item);
    return `
    <tr>
      <td><span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td>
      <td><span class="status ${escapeHtml(type.className)}">${escapeHtml(type.text)}</span><br><span class="muted">${escapeHtml(item.user_id ? membershipDetailLabel(item.account_status) : "No login account attached")}</span></td>
      <td><strong>${escapeHtml(item.full_name)}</strong><br><span class="muted">${escapeHtml(item.phone)}</span><br><a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a></td>
      <td>${escapeHtml(item.property_address)}</td>
      <td><strong>${escapeHtml(item.service)}</strong><br><span class="muted">${escapeHtml(item.account_status ? membershipDetailLabel(item.account_status) : item.member_status)}</span></td>
      <td>${escapeHtml(formatDateTime(item.requested_date, item.requested_time))}</td>
      <td>${escapeHtml(item.notes || "—")}</td>
      <td>${escapeHtml(new Date(item.created_at).toLocaleString())}</td>
      <td>
        <div class="admin-actions">
          <button class="btn small secondary" data-appointment-action="confirmed" data-id="${item.id}">Confirm</button>
          <button class="btn small secondary" data-appointment-action="completed" data-id="${item.id}">Complete</button>
          <button class="btn small danger" data-appointment-action="canceled" data-id="${item.id}">Cancel</button>
          <button class="btn small danger outline-danger" data-appointment-delete="1" data-id="${item.id}">Delete from dashboard</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function renderReviews() {
  if (!reviewsBody) return;
  reviewCountBadge.textContent = `${allReviews.length} review${allReviews.length === 1 ? "" : "s"}`;
  reviewEmptyState.classList.toggle("hidden", allReviews.length > 0);
  reviewsBody.innerHTML = allReviews.map((item) => `
    <tr>
      <td><span class="status ${reviewStatusClass(item.status)}">${escapeHtml(item.status)}</span><br><span class="muted">${escapeHtml(item.source || "website")}</span></td>
      <td><span class="stars small-stars">${escapeHtml(renderStars(item.rating))}</span><br><span class="muted">${escapeHtml(item.rating)}/5</span></td>
      <td><strong>${escapeHtml(item.customer_name)}</strong><br><a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a><br><span class="muted">${escapeHtml(item.city || "Portland")}</span></td>
      <td>${escapeHtml(item.review_text)}</td>
      <td>${escapeHtml(item.service || "—")}</td>
      <td>${escapeHtml(new Date(item.created_at).toLocaleString())}</td>
      <td>
        <div class="admin-actions">
          <button class="btn small secondary" data-review-action="approved" data-id="${item.id}">Approve / show</button>
          <button class="btn small secondary" data-review-action="pending" data-id="${item.id}">Back to pending</button>
          <button class="btn small danger outline-danger" data-review-hide="1" data-id="${item.id}">Remove from website</button>
          <button class="btn small secondary" data-review-archive="1" data-id="${item.id}">Move to logs, keep live</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderMembers() {
  memberCountBadge.textContent = `${allMembers.length} customer account${allMembers.length === 1 ? "" : "s"}`;
  memberEmptyState.classList.toggle("hidden", allMembers.length > 0);
  membersBody.innerHTML = allMembers.map((item) => `
    <tr>
      <td><span class="status confirmed">Portal account</span><br><span class="status ${memberStatusClass(item.membership_status)}">${escapeHtml(item.membership_status === "active" ? "Active member" : `Membership ${item.membership_status}`)}</span><br><span class="muted">${escapeHtml(membershipDetailLabel(item.membership_status))}</span></td>
      <td><strong>${escapeHtml(item.full_name)}</strong><br><span class="muted">${escapeHtml(item.phone)}</span><br><a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a></td>
      <td>${escapeHtml(item.property_address)}</td>
      <td>${escapeHtml(item.appointment_count || 0)}<br><span class="muted">Last: ${escapeHtml(item.last_appointment_at ? new Date(item.last_appointment_at).toLocaleString() : "—")}</span></td>
      <td>${escapeHtml(new Date(item.created_at).toLocaleString())}</td>
      <td>
        <div class="admin-actions">
          <button class="btn small secondary" data-member-action="active" data-id="${item.id}">Mark active</button>
          <button class="btn small secondary" data-member-action="pending" data-id="${item.id}">Pending</button>
          <button class="btn small danger" data-member-action="canceled" data-id="${item.id}">Cancel</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function fetchAdmin(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Owner access is restricted by Cloudflare Access.");
  }
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function loadDashboard() {
  refreshButton.disabled = true;
  try {
    const [appointmentsData, membersData, reviewsData] = await Promise.all([
      fetchAdmin("/api/admin/appointments"),
      fetchAdmin("/api/admin/members"),
      fetchAdmin("/api/admin/reviews"),
    ]);
    tokenStatus.className = "notice success";
    tokenStatus.textContent = "Private owner access verified.";
    tokenStatus.classList.remove("hidden");
    allAppointments = appointmentsData.appointments || [];
    allMembers = membersData.members || [];
    allReviews = reviewsData.reviews || [];
    renderStats();
    renderRows();
    renderReviews();
    renderMembers();
  } catch (error) {
    if (String(error.message).includes("Cloudflare Access")) return;
    tokenStatus.className = "notice error";
    tokenStatus.textContent = error.message || "Unable to load dashboard.";
    tokenStatus.classList.remove("hidden");
    allAppointments = [];
    allMembers = [];
    allReviews = [];
    renderStats();
    renderRows();
    renderReviews();
    renderMembers();
  } finally {
    refreshButton.disabled = false;
  }
}

async function updateAppointmentStatus(id, status) {
  try {
    await fetchAdmin(`/api/admin/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadDashboard();
  } catch (error) {
    tokenStatus.className = "notice error";
    tokenStatus.textContent = error.message || "Could not update appointment.";
    tokenStatus.classList.remove("hidden");
  }
}

async function archiveAppointment(id) {
  const confirmed = window.confirm("Delete this work order from the owner dashboard? It will remain in Logs & Archives.");
  if (!confirmed) return;
  try {
    await fetchAdmin(`/api/admin/appointments/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ reason: "Deleted from owner dashboard" }),
    });
    await loadDashboard();
  } catch (error) {
    tokenStatus.className = "notice error";
    tokenStatus.textContent = error.message || "Could not delete from dashboard.";
    tokenStatus.classList.remove("hidden");
  }
}

async function updateMemberStatus(id, membershipStatus) {
  try {
    await fetchAdmin(`/api/admin/members/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ membershipStatus }),
    });
    await loadDashboard();
  } catch (error) {
    tokenStatus.className = "notice error";
    tokenStatus.textContent = error.message || "Could not update member.";
    tokenStatus.classList.remove("hidden");
  }
}

async function updateReviewStatus(id, status) {
  try {
    await fetchAdmin(`/api/admin/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadDashboard();
  } catch (error) {
    tokenStatus.className = "notice error";
    tokenStatus.textContent = error.message || "Could not update review.";
    tokenStatus.classList.remove("hidden");
  }
}

async function hideReviewFromWebsite(id) {
  const confirmed = window.confirm("Remove this review from the public website but keep it in the owner panel?");
  if (!confirmed) return;
  try {
    await fetchAdmin(`/api/admin/reviews/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ mode: "hide_keep_panel" }),
    });
    await loadDashboard();
  } catch (error) {
    tokenStatus.className = "notice error";
    tokenStatus.textContent = error.message || "Could not hide review.";
    tokenStatus.classList.remove("hidden");
  }
}

async function archiveReviewKeepLive(id) {
  const confirmed = window.confirm("Move this review out of the owner panel and into logs/archives? If it is approved, it will stay visible on the public website.");
  if (!confirmed) return;
  try {
    await fetchAdmin(`/api/admin/reviews/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ mode: "archive_keep_live" }),
    });
    await loadDashboard();
  } catch (error) {
    tokenStatus.className = "notice error";
    tokenStatus.textContent = error.message || "Could not move review to logs.";
    tokenStatus.classList.remove("hidden");
  }
}


refreshButton.addEventListener("click", loadDashboard);
searchInput.addEventListener("input", renderRows);
filterInput.addEventListener("change", renderRows);

tableBody.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("button[data-appointment-action]");
  if (actionButton) {
    await updateAppointmentStatus(actionButton.dataset.id, actionButton.dataset.appointmentAction);
    return;
  }
  const deleteButton = event.target.closest("button[data-appointment-delete]");
  if (deleteButton) await archiveAppointment(deleteButton.dataset.id);
});

membersBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-member-action]");
  if (!button) return;
  await updateMemberStatus(button.dataset.id, button.dataset.memberAction);
});

if (reviewsBody) {
  reviewsBody.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("button[data-review-action]");
    if (actionButton) {
      await updateReviewStatus(actionButton.dataset.id, actionButton.dataset.reviewAction);
      return;
    }
    const hideButton = event.target.closest("button[data-review-hide]");
    if (hideButton) await hideReviewFromWebsite(hideButton.dataset.id);

    const archiveButton = event.target.closest("button[data-review-archive]");
    if (archiveButton) await archiveReviewKeepLive(archiveButton.dataset.id);
  });
}

loadDashboard();
