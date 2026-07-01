const tokenForm = document.querySelector("#tokenForm");
const tokenInput = document.querySelector("#adminToken");
const tokenStatus = document.querySelector("#tokenStatus");
const tableBody = document.querySelector("#appointmentsBody");
const refreshButton = document.querySelector("#refreshAppointments");
const logoutButton = document.querySelector("#logoutAdmin");
const emptyState = document.querySelector("#emptyState");
const countBadge = document.querySelector("#countBadge");

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

function renderRows(appointments) {
  countBadge.textContent = `${appointments.length} appointment${appointments.length === 1 ? "" : "s"}`;
  emptyState.classList.toggle("hidden", appointments.length > 0);
  tableBody.innerHTML = appointments.map((item) => `
    <tr>
      <td><span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td>
      <td><strong>${escapeHtml(item.full_name)}</strong><br><span class="muted">${escapeHtml(item.phone)}</span><br><a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a></td>
      <td>${escapeHtml(item.property_address)}</td>
      <td><strong>${escapeHtml(item.service)}</strong><br><span class="muted">${escapeHtml(item.member_status)}</span></td>
      <td>${escapeHtml(formatDateTime(item.requested_date, item.requested_time))}</td>
      <td>${escapeHtml(item.notes || "—")}</td>
      <td>${escapeHtml(new Date(item.created_at).toLocaleString())}</td>
      <td>
        <div class="admin-actions">
          <button class="btn small secondary" data-action="confirmed" data-id="${item.id}">Confirm</button>
          <button class="btn small secondary" data-action="completed" data-id="${item.id}">Complete</button>
          <button class="btn small danger" data-action="canceled" data-id="${item.id}">Cancel</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function loadAppointments() {
  const token = getToken();
  if (!token) {
    tokenStatus.className = "notice";
    tokenStatus.textContent = "Enter your owner access code to load appointments.";
    tokenStatus.classList.remove("hidden");
    return;
  }

  refreshButton.disabled = true;
  try {
    const response = await fetch("/api/admin/appointments", {
      headers: { "X-Admin-Token": token },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load appointments.");
    tokenStatus.className = "notice success";
    tokenStatus.textContent = "Owner access active.";
    tokenStatus.classList.remove("hidden");
    renderRows(data.appointments || []);
  } catch (error) {
    tokenStatus.className = "notice error";
    tokenStatus.textContent = error.message || "Unable to load appointments.";
    tokenStatus.classList.remove("hidden");
    renderRows([]);
  } finally {
    refreshButton.disabled = false;
  }
}

async function updateStatus(id, status) {
  const token = getToken();
  if (!token) return;
  try {
    const response = await fetch(`/api/admin/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Admin-Token": token },
      body: JSON.stringify({ status }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not update appointment.");
    await loadAppointments();
  } catch (error) {
    tokenStatus.className = "notice error";
    tokenStatus.textContent = error.message || "Could not update appointment.";
    tokenStatus.classList.remove("hidden");
  }
}

tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setToken(tokenInput.value.trim());
  tokenInput.value = "";
  await loadAppointments();
});

refreshButton.addEventListener("click", loadAppointments);
logoutButton.addEventListener("click", () => {
  clearToken();
  renderRows([]);
  tokenStatus.className = "notice";
  tokenStatus.textContent = "Logged out of owner access on this browser.";
  tokenStatus.classList.remove("hidden");
});

tableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  await updateStatus(button.dataset.id, button.dataset.action);
});

loadAppointments();
