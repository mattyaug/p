const authPanel = document.querySelector("#authPanel");
const portalPanel = document.querySelector("#portalPanel");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const profileForm = document.querySelector("#profileForm");
const portalBookingForm = document.querySelector("#portalBookingForm");
const portalLogout = document.querySelector("#portalLogout");
const portalLogoutTop = document.querySelector("#portalLogoutTop");
const refreshPortal = document.querySelector("#refreshPortal");
const membershipLinks = document.querySelectorAll("[data-membership-link]");
const slotButtons = document.querySelectorAll("[data-slot]");
const portalRequestedTime = document.querySelector("#portalRequestedTime");

const loginResult = document.querySelector("#loginResult");
const registerResult = document.querySelector("#registerResult");
const portalResult = document.querySelector("#portalResult");
const loginButton = document.querySelector("#loginButton");
const registerButton = document.querySelector("#registerButton");
const profileButton = document.querySelector("#profileButton");
const portalBookingButton = document.querySelector("#portalBookingButton");

const welcomeName = document.querySelector("#welcomeName");
const membershipBadge = document.querySelector("#membershipBadge");
const profileSummary = document.querySelector("#profileSummary");
const customerAppointmentsBody = document.querySelector("#customerAppointmentsBody");
const customerEmptyState = document.querySelector("#customerEmptyState");
const customerCountBadge = document.querySelector("#customerCountBadge");

let currentMember = null;

slotButtons.forEach((button) => {
  button.addEventListener("click", () => {
    slotButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    portalRequestedTime.value = button.dataset.slot;
  });
});

function formPayload(form) {
  return Object.fromEntries(Array.from(new FormData(form).entries()).map(([key, value]) => [key, String(value || "").trim()]));
}

function showMessage(target, type, message) {
  target.className = `notice ${type || ""}`.trim();
  target.textContent = message;
  target.classList.remove("hidden");
}

function hideMessage(target) {
  target.classList.add("hidden");
  target.textContent = "";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    const config = await response.json();
    if (config.stripeMembershipLink) {
      membershipLinks.forEach((link) => { link.href = config.stripeMembershipLink; });
    }
  } catch (error) {
    console.warn("Config unavailable", error);
  }
}

async function loadMe() {
  const data = await api("/api/auth/me", { method: "GET" });
  currentMember = data.member || null;
  renderAuthState();
  if (currentMember) await loadPortalData();
}

function renderAuthState() {
  const loggedIn = !!currentMember;
  authPanel.classList.toggle("hidden", loggedIn);
  portalPanel.classList.toggle("hidden", !loggedIn);
  portalLogoutTop.classList.toggle("hidden", !loggedIn);

  if (!loggedIn) return;

  welcomeName.textContent = `Welcome, ${currentMember.fullName.split(" ")[0] || currentMember.fullName}`;
  membershipBadge.textContent = currentMember.membershipStatus;
  membershipBadge.className = `status ${statusClass(currentMember.membershipStatus)}`;
  profileSummary.innerHTML = `
    <strong>${escapeHtml(currentMember.fullName)}</strong><br>
    ${escapeHtml(currentMember.email)}<br>
    ${escapeHtml(currentMember.phone)}<br>
    ${escapeHtml(currentMember.propertyAddress)}
  `;

  document.querySelector("#profileFullName").value = currentMember.fullName || "";
  document.querySelector("#profilePhone").value = currentMember.phone || "";
  document.querySelector("#profilePropertyAddress").value = currentMember.propertyAddress || "";
}

function statusClass(value) {
  if (value === "active") return "completed";
  if (value === "inactive" || value === "canceled") return "canceled";
  return "requested";
}

async function loadPortalData() {
  const data = await api("/api/portal/appointments", { method: "GET" });
  renderCustomerAppointments(data.appointments || []);
}

function renderCustomerAppointments(appointments) {
  customerCountBadge.textContent = `${appointments.length} appointment${appointments.length === 1 ? "" : "s"}`;
  customerEmptyState.classList.toggle("hidden", appointments.length > 0);
  customerAppointmentsBody.innerHTML = appointments.map((item) => `
    <tr>
      <td><span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td>
      <td><strong>${escapeHtml(item.service)}</strong><br><span class="muted">${escapeHtml(item.member_status)}</span></td>
      <td>${escapeHtml(formatDateTime(item.requested_date, item.requested_time))}</td>
      <td>${escapeHtml(item.property_address)}</td>
      <td>${escapeHtml(item.notes || "—")}</td>
      <td>${escapeHtml(new Date(item.created_at).toLocaleString())}</td>
    </tr>
  `).join("");
}

function formatDateTime(dateValue, timeValue) {
  if (!dateValue) return "—";
  return `${dateValue}${timeValue ? ` at ${timeValue}` : ""}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(loginResult);
  loginButton.disabled = true;
  loginButton.textContent = "Logging in...";
  try {
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(formPayload(loginForm)) });
    currentMember = data.member;
    loginForm.reset();
    renderAuthState();
    await loadPortalData();
    showMessage(portalResult, "success", "Logged in successfully.");
  } catch (error) {
    showMessage(loginResult, "error", error.message || "Could not log in.");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Log in";
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(registerResult);
  registerButton.disabled = true;
  registerButton.textContent = "Creating account...";
  try {
    const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify(formPayload(registerForm)) });
    currentMember = data.member;
    registerForm.reset();
    renderAuthState();
    await loadPortalData();
    showMessage(portalResult, "success", "Your portal account was created. You can schedule appointments now.");
  } catch (error) {
    showMessage(registerResult, "error", error.message || "Could not create account.");
  } finally {
    registerButton.disabled = false;
    registerButton.textContent = "Create portal account";
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(portalResult);
  profileButton.disabled = true;
  profileButton.textContent = "Saving...";
  try {
    const data = await api("/api/portal/profile", { method: "PATCH", body: JSON.stringify(formPayload(profileForm)) });
    currentMember = data.member;
    renderAuthState();
    showMessage(portalResult, "success", "Profile updated.");
  } catch (error) {
    showMessage(portalResult, "error", error.message || "Could not update profile.");
  } finally {
    profileButton.disabled = false;
    profileButton.textContent = "Save profile";
  }
});

portalBookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(portalResult);
  portalBookingButton.disabled = true;
  portalBookingButton.textContent = "Sending request...";
  try {
    await api("/api/portal/appointments", { method: "POST", body: JSON.stringify(formPayload(portalBookingForm)) });
    portalBookingForm.reset();
    slotButtons.forEach((item) => item.classList.remove("active"));
    await loadPortalData();
    showMessage(portalResult, "success", "Appointment request received. Perigee will confirm your appointment window.");
  } catch (error) {
    showMessage(portalResult, "error", error.message || "Could not request appointment.");
  } finally {
    portalBookingButton.disabled = false;
    portalBookingButton.textContent = "Request appointment";
  }
});

async function logout() {
  try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch (_) {}
  currentMember = null;
  renderAuthState();
}

portalLogout.addEventListener("click", logout);
portalLogoutTop.addEventListener("click", logout);
refreshPortal.addEventListener("click", async () => {
  hideMessage(portalResult);
  try {
    await loadMe();
    showMessage(portalResult, "success", "Portal refreshed.");
  } catch (error) {
    showMessage(portalResult, "error", error.message || "Could not refresh portal.");
  }
});

loadPublicConfig();
loadMe().catch((error) => console.warn("Portal init failed", error));
