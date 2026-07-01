const OWNER_HOST_PREFIX = "owner.";

if (window.location.hostname.startsWith(OWNER_HOST_PREFIX) && window.location.pathname === "/") {
  window.location.replace("/owner/");
}

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    const config = await response.json();
    const paymentLinks = document.querySelectorAll("[data-membership-link]");
    paymentLinks.forEach((link) => {
      if (config.stripeMembershipLink) link.href = config.stripeMembershipLink;
    });
  } catch (error) {
    console.warn("Config unavailable", error);
  }
}

loadPublicConfig();


async function loadMemberCount() {
  const target = document.querySelector("[data-member-count]");
  if (!target) return;
  try {
    const response = await fetch("/api/member-count");
    if (!response.ok) return;
    const data = await response.json();
    if (typeof data.displayCount === "number") {
      target.textContent = data.displayCount.toLocaleString();
    }
  } catch (error) {
    console.warn("Member count unavailable", error);
  }
}

loadMemberCount();


function renderStars(rating) {
  const value = Math.max(1, Math.min(5, Number(rating) || 5));
  return "★".repeat(value) + "☆".repeat(5 - value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadReviews() {
  const grid = document.querySelector("#reviewsGrid");
  if (!grid) return;
  try {
    const response = await fetch(`/api/reviews?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const reviews = data.reviews || [];
    if (!reviews.length) {
      grid.innerHTML = '<div class="notice">Approved customer reviews will appear here.</div>';
      return;
    }
    grid.innerHTML = reviews.map((review) => `
      <article class="review-card">
        <div class="stars" aria-label="${escapeHtml(review.rating)} out of 5 stars">${renderStars(review.rating)}</div>
        <p>“${escapeHtml(review.review_text)}”</p>
        <div class="review-meta"><strong>${escapeHtml(review.customer_name)}</strong><span>${escapeHtml(review.city || "Portland")}${review.service ? ` · ${escapeHtml(review.service)}` : ""}</span></div>
      </article>
    `).join("");
  } catch (error) {
    console.warn("Reviews unavailable", error);
  }
}

async function submitReview(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector("#reviewFormStatus");
  const submit = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.city = "Portland";
  payload.rating = Number(payload.rating || 5);
  status.className = "notice";
  status.textContent = "Submitting review...";
  submit.disabled = true;
  try {
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status < 500) throw new Error(data.error || "Could not submit review.");
    status.className = "notice success";
    status.textContent = data.message || "Thank you. Your review was submitted for approval.";
    form.reset();
  } catch (error) {
    status.className = "notice error";
    status.textContent = error.message || "Could not submit review.";
  } finally {
    submit.disabled = false;
  }
}

loadReviews();
const reviewForm = document.querySelector("#reviewForm");
if (reviewForm) reviewForm.addEventListener("submit", submitReview);
