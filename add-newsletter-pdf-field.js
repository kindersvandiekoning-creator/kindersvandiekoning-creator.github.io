/**
 * KINDERS VIR DIE KONING — Add pdfFileUrl field to newsletter content type
 *
 * Paste this entire script into the browser DevTools console while on the
 * Admin page (admin.html) — it will use the management token from config.
 *
 * Safe to run multiple times: it checks if the field already exists first.
 */
(async function () {
  const cfg = window.KFTK_CONFIG?.contentful;
  if (!cfg?.spaceId || !cfg?.managementToken) {
    console.error("❌ No Contentful config found. Open admin.html first.");
    return;
  }

  const BASE    = `https://api.contentful.com/spaces/${cfg.spaceId}/environments/${cfg.environment || "master"}`;
  const HEADERS = {
    "Authorization": `Bearer ${cfg.managementToken}`,
    "Content-Type":  "application/json",
  };

  // 1. Fetch the current content type
  console.log("Fetching newsletter content type…");
  const ctRes = await fetch(`${BASE}/content_types/newsletter`, { headers: HEADERS });
  if (!ctRes.ok) { console.error("❌ Could not fetch content type:", await ctRes.text()); return; }
  const ct = await ctRes.json();

  // 2. Check if pdfFileUrl already exists
  const exists = (ct.fields || []).some(f => f.id === "pdfFileUrl");
  if (exists) {
    console.log("✅ pdfFileUrl field already exists — nothing to do.");
    return;
  }

  // 3. Add the field
  ct.fields.push({
    id:       "pdfFileUrl",
    name:     "PDF File URL",
    type:     "Symbol",
    required: false,
    localized: false,
  });

  console.log("Adding pdfFileUrl field…");
  const updateRes = await fetch(`${BASE}/content_types/newsletter`, {
    method:  "PUT",
    headers: { ...HEADERS, "X-Contentful-Version": String(ct.sys.version) },
    body:    JSON.stringify({ name: ct.name, description: ct.description, fields: ct.fields }),
  });
  if (!updateRes.ok) { console.error("❌ Update failed:", await updateRes.text()); return; }
  const updated = await updateRes.json();

  // 4. Publish the content type
  console.log("Publishing content type…");
  const pubRes = await fetch(`${BASE}/content_types/newsletter/published`, {
    method:  "PUT",
    headers: { ...HEADERS, "X-Contentful-Version": String(updated.sys.version) },
  });
  if (!pubRes.ok) { console.error("❌ Publish failed:", await pubRes.text()); return; }

  console.log("✅ Done! The pdfFileUrl field has been added and published.");
  console.log("   You can now upload PDFs to newsletters in the admin portal.");
})();
