const slotButtons = document.querySelectorAll("[data-slot]");
const timeInput = document.querySelector("#requestedTime");
const form = document.querySelector("#bookingForm");
const result = document.querySelector("#bookingResult");
const submitButton = document.querySelector("#submitBooking");
const membershipLink = document.querySelector("[data-membership-link]");

slotButtons.forEach((button) => {
  button.addEventListener("click", () => {
    slotButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    timeInput.value = button.dataset.slot;
  });
});

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    const config = await response.json();
    if (config.stripeMembershipLink && membershipLink) {
      membershipLink.href = config.stripeMembershipLink;
    }
  } catch (error) {
    console.warn("Config unavailable", error);
  }
}

function showMessage(type, message) {
  result.className = `notice ${type}`;
  result.textContent = message;
  result.classList.remove("hidden");
}

function cleanPayload(formData) {
  return Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, String(value || "").trim()])
  );
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    result.classList.add("hidden");
    submitButton.disabled = true;
    submitButton.textContent = "Sending request...";

    try {
      const payload = cleanPayload(new FormData(form));
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      showMessage("success", "Appointment request received. Perigee will follow up to confirm your exact appointment window.");
      form.reset();
      slotButtons.forEach((item) => item.classList.remove("active"));
    } catch (error) {
      showMessage("error", error.message || "Could not submit the appointment request.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Request appointment";
    }
  });
}

loadPublicConfig();
