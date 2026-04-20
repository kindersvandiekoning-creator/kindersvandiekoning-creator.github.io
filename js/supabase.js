/* ==============================================================
   KINDERS VAN DIE KONING — SUPABASE CLIENT BOOTSTRAP
   Creates a single client at window.KFTK_supabase.
   Relies on the Supabase CDN script being loaded in the page.
   ============================================================== */
(function () {
  const cfg = (window.KFTK_CONFIG || {}).supabase || {};
  if (!cfg.url || !cfg.anonKey) {
    // Expose a stub so callers can check gracefully
    window.KFTK_supabase = null;
    return;
  }
  if (typeof window.supabase?.createClient !== "function") {
    console.error("[KFTK] Supabase CDN script not found on page.");
    window.KFTK_supabase = null;
    return;
  }
  window.KFTK_supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
})();
