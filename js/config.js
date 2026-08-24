/* ==============================================================
   KINDERS VAN DIE KONING — CENTRAL CONFIG
   --------------------------------------------------------------
   Fill in these values once all 3 services are set up.
   See SETUP.md at the project root for step-by-step instructions.
   All blank strings must be replaced before the site is live.
   ============================================================== */

window.KFTK_CONFIG = {

  /* ────────────────────────────────────────────────────────────
     1. CONTENTFUL (content + images CMS)
     See SETUP.md § 1  for how to create the space, content
     types, and tokens.
     ──────────────────────────────────────────────────────────── */
  contentful: {
    spaceId:        "3nnc322hqyhj",   // e.g. "a1b2c3d4e5f6"
    environment:    "master",
    deliveryToken:  "KIW5VajsS_qcR-ubcyVDbnRbDl7PQSoX-S1f514MhdU",   // Content Delivery API — PUBLIC (for visitors)
    previewToken:   "IOzFQdMsNot9ZxJcQrtfJ8dDLwRDOWqNmUd8jf33kI4",   // (optional) Preview API — not required
    managementToken:"CFPAT-xmwBZi7mcCaSFIYEUgohTEaA-hvIK6nfNgTrw0rhgIw",   // Content Management API — admin only.
  },

  /* ────────────────────────────────────────────────────────────
     2. SUPABASE (subscribers list + contact queries)
     Auth is no longer handled by Supabase — see adminPasswordHash below.
     ──────────────────────────────────────────────────────────── */
  supabase: {
    url:          "https://ibkofwakscfjboszgqac.supabase.co",
    anonKey:      "sb_publishable_xfUmNhwl5MaycsmLZLWvyQ_STXRvJe-",
  },

  /* ────────────────────────────────────────────────────────────
     ADMIN LOGIN — no external service needed
     SHA-256 hash of the admin password. To change the password:
       1. Run: echo -n "NewPassword" | sha256sum
       2. Paste the result here.
     ──────────────────────────────────────────────────────────── */
  adminPasswordHash: "49806b8287e5262149fb03641bc86f777b4159598a3b9a72bc7e0b785c69cb2a",

  /* ────────────────────────────────────────────────────────────
     3. EMAILJS (newsletter sender)
     See SETUP.md § 3 for service setup and template IDs.
     ──────────────────────────────────────────────────────────── */
  emailjs: {
    publicKey:       "JZIWhqAyBNXj5K87t",   // e.g. "user_xxxxxxxxxxxxxxxx"
    serviceId:       "service_a0tmyzf",   // e.g. "service_abc123"
    newsletterTemplateId: "template_e72acq3",  // Template for newsletter blasts
    contactTemplateId:    "template_2437ark",  // (optional) Template for contact-form notifications to the admin
  },

  /* ────────────────────────────────────────────────────────────
     ADMIN / SITE SETTINGS
     ──────────────────────────────────────────────────────────── */
  site: {
    name:    "Kinders van die Koning",
    tagline: "A Christian Early Development Centre in Strand.",
    adminEmail: "kidsfortheking@gmail.com",        // where contact-form submissions are sent
    location:   "Strand, Cape Town, South Africa",
    year:       new Date().getFullYear(),
    contact: {
      email:   "kidsfortheking@gmail.com",    // public contact email
      phone:   "",
      address: "Community Hall of Casablanca, Strand, Cape Town",
    },
    social: {
      facebook:  "",
      instagram: "",
    },
  },
};

/* Small helper: warn loudly in console if keys are still blank */
(function checkConfig() {
  const cfg = window.KFTK_CONFIG;
  const missing = [];
  if (!cfg.contentful.spaceId)       missing.push("contentful.spaceId");
  if (!cfg.contentful.deliveryToken) missing.push("contentful.deliveryToken");
  if (!cfg.adminPasswordHash)        missing.push("adminPasswordHash");
  if (missing.length) {
    console.warn(
      "%c[KvdK] Config missing:",
      "color:#D4A24B;font-weight:bold;",
      missing.join(", "),
      "\n→ See SETUP.md to add them in /js/config.js"
    );
  }
})();
