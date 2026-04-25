/* ==============================================================
   KINDERS VAN DIE KONING — NAVBAR + FOOTER LOADER, BASE UI
   Loaded on every public page. Depends on config.js.
   ============================================================== */
(function () {
  const cfg = window.KFTK_CONFIG || {};

  // ── 1. Inject navbar + footer partials ─────────────────────
  function injectPartial(id, url) {
    return fetch(url)
      .then(r => r.ok ? r.text() : Promise.reject("Failed to load " + url))
      .then(html => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
        return el;
      });
  }

  // ── 2. Nav scroll + mobile menu + active link ──────────────
  function wireNav() {
    const nav = document.getElementById("site-nav");
    if (!nav) return;

    // Scroll state
    const applyScroll = () => {
      nav.classList.toggle("scrolled", window.scrollY > 20);
    };
    applyScroll();
    window.addEventListener("scroll", applyScroll, { passive: true });

    // Mobile toggle
    const toggle = document.getElementById("nav-toggle");
    const panel  = document.getElementById("nav-mobile-panel");
    const close  = document.getElementById("nav-mobile-close");
    const backdrop = document.getElementById("nav-backdrop");
    const open  = () => { panel.classList.add("open"); backdrop.classList.add("open"); panel.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; };
    const shut  = () => { panel.classList.remove("open"); backdrop.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; };
    if (toggle) toggle.addEventListener("click", open);
    if (close)  close.addEventListener("click", shut);
    if (backdrop) backdrop.addEventListener("click", shut);

    // Active-link highlight
    const current = (document.body.dataset.page || "").trim();
    if (current) {
      document.querySelectorAll('[data-nav]').forEach(a => {
        if (a.dataset.nav === current) a.classList.add("active");
      });
    }
  }

  // ── 3. Footer dynamic bits ─────────────────────────────────
  function wireFooter() {
    // Year
    const y = document.getElementById("footer-year");
    if (y) y.textContent = new Date().getFullYear();

    // Location
    const loc = document.getElementById("footer-location");
    if (loc && cfg.site?.location) loc.textContent = cfg.site.location;

    // Social icons (only if set in config)
    const social = document.getElementById("footer-social");
    if (social && cfg.site?.social) {
      const s = cfg.site.social;
      if (s.facebook) social.insertAdjacentHTML("beforeend",
        `<a href="${s.facebook}" target="_blank" rel="noopener" aria-label="Facebook">
           <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V7a1 1 0 0 1 1-1h2V3h-3a4 4 0 0 0-4 4v2H8v3h2v8h3v-8h2.5l.5-3H13z"/></svg>
         </a>`);
      if (s.instagram) social.insertAdjacentHTML("beforeend",
        `<a href="${s.instagram}" target="_blank" rel="noopener" aria-label="Instagram">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <rect x="3" y="3" width="18" height="18" rx="5"/>
             <circle cx="12" cy="12" r="4"/>
             <circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>
           </svg>
         </a>`);
    }

    // Footer subscribe form
    const form = document.getElementById("footer-subscribe-form");
    const msg  = document.getElementById("footer-subscribe-msg");
    if (form) {
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        const email = form.email.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          showMsg("Please enter a valid email.", "error");
          return;
        }
        if (!window.KFTK_supabase) {
          showMsg("Subscription is not configured yet.", "error");
          return;
        }
        const btn = form.querySelector("button");
        btn.disabled = true; btn.textContent = "...";
        try {
          const { error } = await window.KFTK_supabase
            .from("subscribers")
            .insert({ email, source: "footer" });
          if (error && !String(error.message || "").toLowerCase().includes("duplicate")) throw error;
          showMsg("Thank you — you're on the list.", "success");
          form.reset();
        } catch (err) {
          console.error(err);
          showMsg("Sorry, something went wrong. Please try again.", "error");
        } finally {
          btn.disabled = false; btn.textContent = "Subscribe";
        }
      });
    }
    function showMsg(text, kind) {
      if (!msg) return;
      msg.textContent = text;
      msg.style.display = "block";
      msg.style.color = kind === "error" ? "#F6B2B2" : (kind === "success" ? "#B7E4C7" : "#fff");
    }
  }

  // ── 4. Scroll reveal ───────────────────────────────────────
  // Works for both static elements AND elements injected later by Contentful fetches.
  function wireReveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.08 });

    // Observe elements already in the DOM
    function observeAll() {
      document.querySelectorAll(".reveal:not(.in)").forEach(el => io.observe(el));
    }
    observeAll();

    // Watch for new .reveal elements added dynamically (Contentful cards, etc.)
    const mo = new MutationObserver(() => observeAll());
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ── 5. Init ────────────────────────────────────────────────
  async function init() {
    await Promise.all([
      injectPartial("kftk-navbar", "/partials/navbar.html"),
      injectPartial("kftk-footer", "/partials/footer.html"),
    ]);
    wireNav();
    wireFooter();
    wireReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
