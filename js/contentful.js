/* ==============================================================
   KINDERS VAN DIE KONING — CONTENTFUL HELPERS
   Tiny wrapper around Contentful's Delivery REST API
   (used on public pages — no SDK needed).
   ============================================================== */
(function () {
  const cfg = (window.KFTK_CONFIG || {}).contentful || {};
  const CDN_BASE = "https://cdn.contentful.com";

  async function getEntries(contentType, params = {}) {
    if (!cfg.spaceId || !cfg.deliveryToken) {
      console.warn("[KFTK] Contentful not configured — skipping fetch:", contentType);
      return { items: [], includes: {} };
    }
    const url = new URL(`${CDN_BASE}/spaces/${cfg.spaceId}/environments/${cfg.environment || 'master'}/entries`);
    url.searchParams.set("access_token", cfg.deliveryToken);
    url.searchParams.set("content_type", contentType);
    url.searchParams.set("include", "2");
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("Contentful error", res.status, await res.text());
      return { items: [], includes: {} };
    }
    return res.json();
  }

  // Resolve an image asset (link or asset object) to a full URL
  function assetUrl(imageField, includes) {
    if (!imageField) return "";
    // If already resolved to fields
    if (imageField.fields?.file?.url) return "https:" + imageField.fields.file.url;
    // If it's a link reference, look it up in includes.Asset
    const id = imageField.sys?.id;
    if (id && includes?.Asset) {
      const asset = includes.Asset.find(a => a.sys.id === id);
      if (asset?.fields?.file?.url) return "https:" + asset.fields.file.url;
    }
    return "";
  }

  // Format a richtext-ish or plain string for safe HTML insertion
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Nicely turn plain-text paragraphs (double-newlines) into <p>
  function paraHtml(str) {
    if (!str) return "";
    return String(str)
      .split(/\n\s*\n/)
      .map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  // Format date
  function fmtDate(iso, opts = { day: "numeric", month: "long", year: "numeric" }) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(undefined, opts); }
    catch { return iso; }
  }
  function fmtDateBadge(iso) {
    if (!iso) return { day: "", month: "" };
    const d = new Date(iso);
    return {
      day:   d.getDate().toString(),
      month: d.toLocaleString(undefined, { month: "short" }).toUpperCase(),
    };
  }

  // Accepts either a plain URL field or a Contentful asset reference —
  // returns a usable URL (empty string if neither is set).
  function pickImage(urlField, assetField, includes, fallback = "") {
    if (typeof urlField === "string" && urlField.trim()) return urlField.trim();
    const a = assetUrl(assetField, includes);
    return a || fallback;
  }

  window.KFTK_cf = { getEntries, assetUrl, pickImage, escapeHtml, paraHtml, fmtDate, fmtDateBadge };
})();
