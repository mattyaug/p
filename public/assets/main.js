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
