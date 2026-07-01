const tokenForm = document.querySelector("#tokenForm");
const tokenInput = document.querySelector("#adminToken");
const tokenStatus = document.querySelector("#tokenStatus");
const tableBody = document.querySelector("#appointmentsBody");
const membersBody = document.querySelector("#membersBody");
const refreshButton = document.querySelector("#refreshDashboard");
const logoutButton = document.querySelector("#logoutAdmin");
const emptyState = document.querySelector("#emptyState");
const memberEmptyState = document.querySelector("#memberEmptyState");
const countBadge = document.querySelector("#countBadge");
const memberCountBadge = document.querySelector("#memberCountBadge");

const TOKEN_KEY = "perigee_admin_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

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

function renderRows(appointments) {
  countBadge.textContent = `${appointments.length} appointment${appointments.length === 1 ? "" : "s"}`;
  emptyState.classList.toggle("hidden", appointments.length > 0);
  tableBody.innerHTML = appointments.map((item) => `
    <tr>
      <td><span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td>
      <td><strong>${escapeHtml(item.full_name)}</strong><br><span class="muted">${escapeHtml(item.phone)}</span><br><a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a><br><span class="muted">${item.user_id ? "Portal account" : "Public request"}</span></td>
      <td>${escapeHtml(item.property_address)}</td>
      <td><strong>${escapeHtml(item.service)}</strong><br><span class="muted">${escapeHtml(item.account_status ? `Account ${item.account_status}` : item.member_status)}</span></td>
      <td>${escapeHtml(formatDateTime(item.requested_date, item.requested_time))}</td>
      <td>${escapeHtml(item.notes || "—")}</td>
      <td>${escapeHtml(new Date(item.created_at).toLocaleString())}</td>
      <td>
        <div class="admin-actions">
          <button class="btn small secondary" data-appointment-action="confirmed" data-id="${item.id}">Confirm</button>
          <button class="btn small secondary" data-appointment-action="completed" data-id="${item.id}">Complete</button>
          <button class="btn small danger" data-appointment-action="canceled" data-id="${item.id}">Cancel</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderMembers(members) {
  memberCountBadge.textContent = `${members.length} member${members.length === 1 ? "" : "s"}`;
  memberEmptyState.classList.toggle("hidden", members.length > 0);
  membersBody.innerHTML = members.map((item) => `
    <tr>
      <td><span class="status ${memberStatusClass(item.membership_status)}">${escapeHtml(item.membership_status)}</span></td>
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
  const token = getToken();
  if (!token) throw new Error("Enter your owner access code to load the dashboard.");
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", "X-Admin-Token": token, ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function loadDashboard() {
  refreshButton.disabled = true;
  try {
    const [appointmentsData, membersData] = await Promise.all([
      fetchAdmin("/api/admin/appointments"),
      fetchAdmin("/api/admin/members"),
    ]);
    tokenStatus.className = "notice success";
    tokenStatus.textContent = "Owner access active.";
    tokenStatus.classList.remove("hidden");
    renderRows(appointmentsData.appointments || []);
    renderMembers(membersData.members || []);
  } catch (error) {
    tokenStatus.className = "notice error";
    tokenStatus.textContent = error.message || "Unable to load dashboard.";
    tokenStatus.classList.remove("hidden");
    renderRows([]);
    renderMembers([]);
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

tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setToken(tokenInput.value.trim());
  tokenInput.value = "";
  await loadDashboard();
});

refreshButton.addEventListener("click", loadDashboard);
logoutButton.addEventListener("click", () => {
  clearToken();
  renderRows([]);
  renderMembers([]);
  tokenStatus.className = "notice";
  tokenStatus.textContent = "Logged out of owner access on this browser.";
  tokenStatus.classList.remove("hidden");
});

tableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-appointment-action]");
  if (!button) return;
  await updateAppointmentStatus(button.dataset.id, button.dataset.appointmentAction);
});

membersBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-member-action]");
  if (!button) return;
  await updateMemberStatus(button.dataset.id, button.dataset.memberAction);
});

loadDashboard();
