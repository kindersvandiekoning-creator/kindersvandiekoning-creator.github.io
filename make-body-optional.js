/**
 * KINDERS VIR DIE KONING — Make newsletter `body` field optional
 *
 * Paste into the browser DevTools console while on admin.html.
 * Removes the `required` constraint from the `body` field so PDF-only
 * newsletters can be saved without typing anything in the body box.
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

  console.log("Fetching newsletter content type…");
  const ctRes = await fetch(`${BASE}/content_types/newsletter`, { headers: HEADERS });
  if (!ctRes.ok) { console.error("❌ Fetch failed:", await ctRes.text()); return; }
  const ct = await ctRes.json();

  const bodyField = ct.fields.find(f => f.id === "body");
  if (!bodyField) { console.error("❌ Could not find body field."); return; }

  if (!bodyField.required) {
    console.log("✅ body field is already optional — nothing to do.");
    return;
  }

  bodyField.required = false;

  console.log("Updating content type…");
  const updateRes = await fetch(`${BASE}/content_types/newsletter`, {
    method:  "PUT",
    headers: { ...HEADERS, "X-Contentful-Version": String(ct.sys.version) },
    body:    JSON.stringify({ name: ct.name, description: ct.description, fields: ct.fields }),
  });
  if (!updateRes.ok) { console.error("❌ Update failed:", await updateRes.text()); return; }
  const updated = await updateRes.json();

  console.log("Publishing…");
  const pubRes = await fetch(`${BASE}/content_types/newsletter/published`, {
    method:  "PUT",
    headers: { ...HEADERS, "X-Contentful-Version": String(updated.sys.version) },
  });
  if (!pubRes.ok) { console.error("❌ Publish failed:", await pubRes.text()); return; }

  console.log("✅ Done! The body field is now optional. PDF-only newsletters will save without error.");
})();
