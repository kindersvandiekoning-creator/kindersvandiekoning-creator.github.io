/* ==============================================================
   KINDERS VAN DIE KONING — ADMIN PORTAL
   Depends on: config.js, contentful.js, EmailJS CDN
   ============================================================== */
(function () {
  const cfg = window.KFTK_CONFIG || {};
  const sb  = window.KFTK_supabase;
  const cf  = window.KFTK_cf;

  const CM_BASE = "https://api.contentful.com";
  const LOCALE  = "en-US";

  // ── 1. AUTH GATE ─────────────────────────────────────────
  function requireAuth() {
    if (localStorage.getItem("kftk_auth") !== "1") {
      window.location.href = "/login.html";
      return false;
    }
    document.getElementById("admin-email").textContent = "Admin";
    document.getElementById("auth-loading").style.display = "none";
    document.getElementById("admin-shell").style.display  = "grid";
    return true;
  }

  // ── 2. PANEL SWITCHING ───────────────────────────────────
  const TITLES = {
    dashboard:   ["Dashboard", "A quick look at everything at once."],
    events:      ["Events", "Upcoming birthdays, prize-givings, anything you want to publish."],
    newsletters: ["Newsletters", "Write newsletters, save drafts, send to the whole list."],
    staff:       ["Staff", "The people on the Our Staff page."],
    progress:    ["New school progress", "Updates on the new school building."],
    "site-images":["Site images", "The big photos on the home page and others."],
    donors:      ["Donors & Partners", "The organisations and individuals on the Donors & Partners page."],
    subscribers: ["Subscribers", "Everyone on the newsletter mailing list."],
    queries:     ["Queries", "Messages sent via the Contact page."],
  };
  function switchPanel(name) {
    document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".admin-sidebar nav a").forEach(a => a.classList.remove("active"));
    const panel = document.getElementById("panel-" + name);
    const link  = document.querySelector(`.admin-sidebar nav a[data-panel="${name}"]`);
    if (panel) panel.classList.add("active");
    if (link)  link.classList.add("active");
    const [t, sub] = TITLES[name] || ["Admin", ""];
    document.getElementById("panel-title").textContent = t;
    document.getElementById("panel-subtitle").textContent = sub;
    location.hash = "#" + name;
  }

  // ── 3. CONTENTFUL MANAGEMENT HELPERS ─────────────────────
  function cmHeaders(extra = {}) {
    return Object.assign({
      "Authorization": `Bearer ${cfg.contentful?.managementToken || ""}`,
      "Content-Type":  "application/vnd.contentful.management.v1+json",
    }, extra);
  }
  function cmBase() {
    return `${CM_BASE}/spaces/${cfg.contentful?.spaceId}/environments/${cfg.contentful?.environment || "master"}`;
  }

  async function cmRequest(path, { method = "GET", body, extraHeaders = {} } = {}) {
    if (!cfg.contentful?.spaceId || !cfg.contentful?.managementToken) {
      throw new Error("Contentful is not configured.");
    }
    const res = await fetch(cmBase() + path, {
      method,
      headers: cmHeaders(extraHeaders),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Contentful ${method} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function cmListEntries(contentType, params = {}) {
    const url = new URL(cmBase() + "/entries");
    url.searchParams.set("content_type", contentType);
    url.searchParams.set("limit", "200");
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: cmHeaders() });
    if (!res.ok) throw new Error("List failed: " + res.status);
    return res.json();
  }

  async function cmCreateOrUpdateEntry(contentType, fields, existingEntry = null) {
    // Wrap every value in the locale envelope { "en-US": value } unless it already is.
    const wrapped = {};
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        const already = v && typeof v === "object" && !Array.isArray(v) && (LOCALE in v);
        wrapped[k] = already ? v : { [LOCALE]: v };
      }
    });
    const body = { fields: wrapped };

    let entry;
    if (existingEntry?.sys?.id) {
      entry = await cmRequest(`/entries/${existingEntry.sys.id}`, {
        method: "PUT",
        body,
        extraHeaders: {
          "X-Contentful-Version": String(existingEntry.sys.version),
        },
      });
    } else {
      entry = await cmRequest(`/entries`, {
        method: "POST",
        body,
        extraHeaders: { "X-Contentful-Content-Type": contentType },
      });
    }
    // Publish it
    await cmRequest(`/entries/${entry.sys.id}/published`, {
      method: "PUT",
      extraHeaders: { "X-Contentful-Version": String(entry.sys.version) },
    });
    return entry;
  }

  async function cmDeleteEntry(id) {
    const entry = await cmRequest(`/entries/${id}`);
    // Unpublish if published
    if (entry?.sys?.publishedVersion) {
      await cmRequest(`/entries/${id}/published`, {
        method: "DELETE",
        extraHeaders: { "X-Contentful-Version": String(entry.sys.version) },
      });
    }
    const refreshed = await cmRequest(`/entries/${id}`);
    await cmRequest(`/entries/${id}`, {
      method: "DELETE",
      extraHeaders: { "X-Contentful-Version": String(refreshed.sys.version) },
    });
  }

  // Upload an asset from a File object, return its URL
  async function cmUploadAsset(file, title = "Uploaded image") {
    if (!cfg.contentful?.managementToken) throw new Error("No management token");
    // Step A: create an upload (binary)
    const uploadRes = await fetch(`https://upload.contentful.com/spaces/${cfg.contentful.spaceId}/uploads`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.contentful.managementToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: file,
    });
    if (!uploadRes.ok) throw new Error("Upload step failed");
    const upload = await uploadRes.json();

    // Step B: create the asset pointing at the upload
    const assetBody = {
      fields: {
        title:       { [LOCALE]: title },
        description: { [LOCALE]: "" },
        file: {
          [LOCALE]: {
            contentType: file.type || "image/jpeg",
            fileName:    file.name || "image.jpg",
            uploadFrom:  { sys: { type: "Link", linkType: "Upload", id: upload.sys.id } },
          },
        },
      },
    };
    const asset = await cmRequest("/assets", {
      method: "POST",
      body: assetBody,
    });

    // Step C: process it (per locale)
    await cmRequest(`/assets/${asset.sys.id}/files/${LOCALE}/process`, { method: "PUT" });

    // Step D: poll until file.url is present
    let processed = null;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      processed = await cmRequest(`/assets/${asset.sys.id}`);
      if (processed?.fields?.file?.[LOCALE]?.url) break;
    }
    if (!processed?.fields?.file?.[LOCALE]?.url) throw new Error("Processing timed out");

    // Step E: publish
    await cmRequest(`/assets/${processed.sys.id}/published`, {
      method: "PUT",
      extraHeaders: { "X-Contentful-Version": String(processed.sys.version) },
    });

    return "https:" + processed.fields.file[LOCALE].url;
  }

  // ── 4. GENERIC FORM HELPERS ──────────────────────────────
  function fmtDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" }); }
    catch { return iso; }
  }
  function fmtDateTime(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString(undefined, { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }); }
    catch { return iso; }
  }
  function slugify(s) {
    return String(s || "").toLowerCase().trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }
  function showMsg(el, text, kind) {
    el.className = "notice " + kind;
    el.style.display = "block";
    el.textContent = text;
    if (kind !== "error") setTimeout(() => { el.style.display = "none"; }, 4000);
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  // Update a field's photo preview image (handles regular fields, gallery slots, and site-image hero fields)
  function updateFieldPreview(form, name, url) {
    // Site-image hero previews (use existing updateImagePreview)
    const heroMap = { homeHeroUrl: "homeHero", homeAboutUrl: "homeAbout", progressHeroUrl: "progressHero" };
    if (heroMap[name]) { updateImagePreview(heroMap[name], url); return; }

    const input = form?.querySelector(`[name="${name}"]`);
    if (!input) return;

    // Gallery slots (site images gallery + event photos) — the hidden input
    // lives inside its own .gallery-slot, so we just walk up from it.
    const slot = input.closest(".gallery-slot");
    if (slot) {
      const img = slot.querySelector(".gallery-slot-img");
      if (img) img.src = url || "";
      slot.classList.toggle("filled", !!url);
      return;
    }

    // Regular photo fields — find preview img in same .field container
    const field = input.closest(".field");
    if (!field) return;
    const preview = field.querySelector(".field-photo-preview");
    if (preview) {
      preview.src = url || "";
      preview.style.display = url ? "block" : "none";
    }
  }

  // Per-field image upload wiring (uses the hidden <input type=file>)
  // Delegated from document so slots created later (event photos) work too.
  function wireUploadButtons() {
    const fileInput = document.getElementById("upload-input");
    let activeTarget = null;
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".upload-btn");
      if (!btn) return;
      activeTarget = { form: btn.closest("form"), name: btn.dataset.target, btn };
      fileInput.multiple = false;
      fileInput.value = "";
      fileInput.click();
    });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file || !activeTarget) return;
      const input = activeTarget.form.querySelector(`[name="${activeTarget.name}"]`);
      const btn = activeTarget.btn;
      const originalText = btn.textContent;
      btn.disabled = true; btn.textContent = "Uploading…";
      try {
        const url = await cmUploadAsset(file, file.name);
        if (input) input.value = url;
        updateFieldPreview(activeTarget.form, activeTarget.name, url);
        if (activeTarget.name.startsWith("eventPhoto_")) refreshEventPhotoUi();
      } catch (err) {
        alert("Upload failed: " + err.message);
      } finally {
        btn.disabled = false; btn.textContent = originalText;
      }
    });

    // "✕" buttons on gallery slots
    document.addEventListener("click", (e) => {
      const rm = e.target.closest(".gallery-slot-remove");
      if (!rm) return;
      const slot = rm.closest(".gallery-slot");
      const form = rm.closest("form");
      const hidden = slot?.querySelector("input[type=hidden]");
      if (!hidden) return;
      hidden.value = "";
      updateFieldPreview(form, hidden.name, "");
      if (hidden.name.startsWith("eventPhoto_")) compactEventPhotos();
    });
  }

  // ── 5. EVENT PHOTOS (up to 12 per event) ─────────────────
  const EVENT_PHOTO_SLOTS = 12;
  let eventGalleryFieldOk = false;   // set by ensureEventGalleryField()

  /* Contentful needs a "galleryUrls" list field on the event content type.
     This adds it once, automatically, and is safe to run every load:
     if the field is already there it does nothing.                      */
  async function ensureEventGalleryField() {
    try {
      const ct = await cmRequest("/content_types/event");
      if ((ct.fields || []).some(f => f.id === "galleryUrls")) {
        eventGalleryFieldOk = true;
        return;
      }
      console.log("[KvdK] Adding galleryUrls field to the event content type…");
      ct.fields.push({
        id:        "galleryUrls",
        name:      "Photo URLs",
        type:      "Array",
        items:     { type: "Symbol", validations: [] },
        required:  false,
        localized: false,
      });
      const updated = await cmRequest("/content_types/event", {
        method: "PUT",
        body: { name: ct.name, description: ct.description, displayField: ct.displayField, fields: ct.fields },
        extraHeaders: { "X-Contentful-Version": String(ct.sys.version) },
      });
      await cmRequest("/content_types/event/published", {
        method: "PUT",
        extraHeaders: { "X-Contentful-Version": String(updated.sys.version) },
      });
      eventGalleryFieldOk = true;
      console.log("[KvdK] galleryUrls field added and published. ✅");
    } catch (err) {
      eventGalleryFieldOk = false;
      console.error("[KvdK] Could not add the galleryUrls field to Contentful:", err);
      const warn = document.getElementById("events-photos-warning");
      if (warn) {
        warn.style.display = "block";
        warn.textContent = "Extra photos can't be saved yet — Contentful hasn't accepted the new photo list field. " +
                           "Only the first photo will be saved. Please let Quintin know.";
      }
    }
  }

  function eventPhotoSlotHtml(i) {
    return `
      <div class="gallery-slot" data-index="${i}">
        <input type="hidden" name="eventPhoto_${i}" value="">
        <img src="" alt="" class="gallery-slot-img">
        <button type="button" class="gallery-slot-remove" title="Remove this photo" aria-label="Remove photo ${i + 1}">✕</button>
        <div class="gallery-slot-placeholder">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span>${i === 0 ? "Main photo" : "Photo " + (i + 1)}</span>
        </div>
        <button type="button" class="btn btn-outline btn-sm upload-btn" data-target="eventPhoto_${i}">Upload</button>
      </div>`;
  }

  function buildEventPhotoSlots() {
    const grid = document.getElementById("event-photo-slots");
    if (!grid || grid.dataset.built) return;
    grid.innerHTML = Array.from({ length: EVENT_PHOTO_SLOTS }, (_, i) => eventPhotoSlotHtml(i)).join("");
    grid.dataset.built = "1";
    setEventPhotos([]);   // start with just the one empty "Main photo" slot
  }

  function eventForm() { return document.getElementById("events-form"); }

  // Read the filled slots, in order
  function getEventPhotos() {
    const form = eventForm();
    if (!form) return [];
    return Array.from({ length: EVENT_PHOTO_SLOTS }, (_, i) =>
      (form.querySelector(`[name="eventPhoto_${i}"]`)?.value || "").trim()
    ).filter(Boolean);
  }

  // Write a list of URLs into the slots (extras beyond 12 are dropped)
  function setEventPhotos(urls) {
    const form = eventForm();
    if (!form) return;
    const list = (urls || []).filter(Boolean).slice(0, EVENT_PHOTO_SLOTS);
    for (let i = 0; i < EVENT_PHOTO_SLOTS; i++) {
      const url = list[i] || "";
      const hidden = form.querySelector(`[name="eventPhoto_${i}"]`);
      if (hidden) hidden.value = url;
      updateFieldPreview(form, `eventPhoto_${i}`, url);
      // Show the filled slots plus one empty one — no wall of empty boxes
      const slot = hidden?.closest(".gallery-slot");
      if (slot) slot.style.display = (i <= list.length) ? "" : "none";
    }
    if (form.photoUrl) form.photoUrl.value = list[0] || "";
    refreshEventPhotoUi();
  }

  // Close up gaps so the filled photos always sit at the front
  function compactEventPhotos() { setEventPhotos(getEventPhotos()); }

  function refreshEventPhotoUi() {
    const status = document.getElementById("events-photos-status");
    const form   = eventForm();
    const n      = getEventPhotos().length;
    if (form?.photoUrl) form.photoUrl.value = getEventPhotos()[0] || "";
    if (!status) return;
    status.textContent = n === 0
      ? "No photos yet"
      : `${n} of ${EVENT_PHOTO_SLOTS} photo${n === 1 ? "" : "s"} added`;
  }

  // "Add photos" — pick several files at once, they fill the empty slots
  function wireEventPhotoBulkUpload() {
    const addBtn   = document.getElementById("events-photos-add");
    const clearBtn = document.getElementById("events-photos-clear");
    const status   = document.getElementById("events-photos-status");
    if (!addBtn) return;

    // Its own file input so the shared single-file one is left alone
    const multiInput = document.createElement("input");
    multiInput.type = "file";
    multiInput.accept = "image/*";
    multiInput.multiple = true;
    multiInput.style.display = "none";
    document.body.appendChild(multiInput);

    addBtn.addEventListener("click", () => {
      if (getEventPhotos().length >= EVENT_PHOTO_SLOTS) {
        alert(`You already have ${EVENT_PHOTO_SLOTS} photos on this event — remove one first.`);
        return;
      }
      multiInput.value = "";
      multiInput.click();
    });

    multiInput.addEventListener("change", async () => {
      const files = Array.from(multiInput.files || []);
      if (!files.length) return;
      const existing = getEventPhotos();
      const room = EVENT_PHOTO_SLOTS - existing.length;
      const chosen = files.slice(0, room);
      const skipped = files.length - chosen.length;

      addBtn.disabled = true;
      const uploaded = [];
      for (let i = 0; i < chosen.length; i++) {
        if (status) status.textContent = `Uploading photo ${i + 1} of ${chosen.length}…`;
        addBtn.textContent = `Uploading ${i + 1}/${chosen.length}…`;
        try {
          uploaded.push(await cmUploadAsset(chosen[i], chosen[i].name));
          setEventPhotos([...existing, ...uploaded]);   // show each one as it lands
        } catch (err) {
          console.error(err);
          alert(`"${chosen[i].name}" could not be uploaded: ${err.message}`);
        }
      }
      addBtn.disabled = false; addBtn.textContent = "📷 Add photos";
      setEventPhotos([...existing, ...uploaded]);
      if (skipped > 0) {
        alert(`${skipped} photo${skipped === 1 ? "" : "s"} left out — an event can hold ${EVENT_PHOTO_SLOTS} photos at most.`);
      }
    });

    if (clearBtn) clearBtn.addEventListener("click", () => {
      if (!getEventPhotos().length) return;
      if (!confirm("Remove all photos from this event? (They stay in your Contentful media library.)")) return;
      setEventPhotos([]);
    });
  }

  // ── 5b. EVENTS PANEL ─────────────────────────────────────
  let eventsCache = [];
  async function loadEvents() {
    const tbody = document.querySelector("#events-table tbody");
    try {
      const res = await cmListEntries("event", { order: "-fields.startDate" });
      eventsCache = res.items || [];
      if (!eventsCache.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center;">No events yet. Add your first one above.</td></tr>`;
        return;
      }
      tbody.innerHTML = eventsCache.map((e, i) => {
        const f = e.fields || {};
        const title = f.title?.[LOCALE] || "(no title)";
        const date  = f.startDate?.[LOCALE] || "";
        const loc   = f.location?.[LOCALE] || "";
        const published = !!e.sys.publishedVersion;
        const nPhotos = entryPhotos(f).length;
        return `
          <tr>
            <td>${fmtDate(date)}</td>
            <td>${escapeHtml(title)}</td>
            <td>${escapeHtml(loc)}</td>
            <td>${nPhotos ? `📷 ${nPhotos}` : '<span class="text-muted">—</span>'}</td>
            <td>${published ? '<span class="pill">Live</span>' : '<span class="pill" style="background:rgba(217,69,69,.1); color:#a02020;">Draft</span>'}</td>
            <td class="row-actions">
              <button data-action="edit" data-i="${i}">Edit</button>
              <button data-action="delete" data-i="${i}" class="danger">Delete</button>
            </td>
          </tr>`;
      }).join("");
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center; color:#a02020;">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // Photos stored on an event entry: the galleryUrls list, with the older
  // single photoUrl kept as the first photo so nothing published before
  // this change disappears.
  function entryPhotos(f) {
    const out = [];
    const legacy = (f.photoUrl?.[LOCALE] || "").trim();
    if (legacy) out.push(legacy);
    const list = f.galleryUrls?.[LOCALE];
    if (Array.isArray(list)) list.forEach(u => { if (typeof u === "string" && u.trim()) out.push(u.trim()); });
    return [...new Set(out)].slice(0, EVENT_PHOTO_SLOTS);
  }
  function wireEvents() {
    const form = document.getElementById("events-form");
    const msg  = document.getElementById("events-msg");
    const cancel = document.getElementById("events-cancel");
    const title  = document.getElementById("events-form-title");

    buildEventPhotoSlots();
    wireEventPhotoBulkUpload();

    function resetForm() {
      form.reset(); form.id.value = "";
      title.textContent = "Add an event";
      cancel.style.display = "none";
      form.querySelectorAll(".field-photo-preview").forEach(p => { p.src = ""; p.style.display = "none"; });
      setEventPhotos([]);
    }
    cancel.addEventListener("click", resetForm);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        const id = form.id.value;
        const existing = id ? eventsCache.find(x => x.sys.id === id) : null;
        const photos = getEventPhotos();
        // <input type=datetime-local> → "2026-05-20T10:00"; convert to full ISO (local → UTC).
        let startIso = form.startDate.value;
        if (startIso && !/Z$|[+-]\d\d:?\d\d$/.test(startIso)) {
          startIso = new Date(startIso).toISOString();
        }
        const fields = {
          title:     form.title.value.trim(),
          slug:      form.slug.value.trim() || slugify(form.title.value),
          startDate: startIso,
          time:      form.time.value.trim(),
          location:  form.location.value.trim(),
          summary:   form.summary.value.trim(),
          details:   form.details.value.trim(),
        };
        // Photos: the first one stays in photoUrl (the original single-photo
        // field), the whole list goes into galleryUrls.
        if (photos[0]) fields.photoUrl = photos[0];
        if (eventGalleryFieldOk) fields.galleryUrls = photos;

        await cmCreateOrUpdateEntry("event", fields, existing);
        const extra = photos.length > 1 ? ` ${photos.length} photos attached.` : "";
        showMsg(msg, "Saved. It's live on the site." + extra, "success");
        resetForm();
        loadEvents(); loadStats();
      } catch (err) {
        showMsg(msg, "Couldn't save: " + err.message, "error");
      } finally {
        btn.disabled = false; btn.textContent = "Save event";
      }
    });

    document.querySelector("#events-table").addEventListener("click", async (e) => {
      const act = e.target.dataset.action;
      if (!act) return;
      const i = Number(e.target.dataset.i);
      const item = eventsCache[i];
      if (!item) return;

      if (act === "edit") {
        const f = item.fields || {};
        const rawDate = f.startDate?.[LOCALE] || "";
        // datetime-local wants "YYYY-MM-DDTHH:MM" (no seconds, no zone)
        let localValue = "";
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d)) {
            const pad = n => String(n).padStart(2, "0");
            localValue = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
        }
        form.id.value        = item.sys.id;
        form.title.value     = f.title?.[LOCALE] || "";
        form.slug.value      = f.slug?.[LOCALE] || "";
        form.startDate.value = localValue;
        form.time.value      = f.time?.[LOCALE] || "";
        form.location.value  = f.location?.[LOCALE] || "";
        form.summary.value   = f.summary?.[LOCALE] || "";
        form.details.value   = f.details?.[LOCALE] || "";
        setEventPhotos(entryPhotos(f));
        title.textContent = "Edit event";
        cancel.style.display = "inline-flex";
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (act === "delete") {
        if (!confirm("Delete this event? This cannot be undone.")) return;
        try {
          await cmDeleteEntry(item.sys.id);
          loadEvents(); loadStats();
        } catch (err) { alert("Delete failed: " + err.message); }
      }
    });
  }

  // ── 6. NEWSLETTERS PANEL ─────────────────────────────────
  let nlCache = [];
  async function loadNewsletters() {
    const tbody = document.querySelector("#newsletters-table tbody");
    try {
      const res = await cmListEntries("newsletter", { order: "-sys.createdAt" });
      nlCache = res.items || [];
      if (!nlCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">No newsletters yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = nlCache.map((e, i) => {
        const f = e.fields || {};
        const sent = !!f.emailSentAt?.[LOCALE];
        const hasPdf = !!f.pdfFileUrl?.[LOCALE];
        const statusBadge = sent
          ? '<span class="pill">Sent</span>'
          : '<span class="pill" style="background:rgba(27,42,78,.08); color:var(--navy);">Draft</span>';
        const pdfBadge = hasPdf ? ' <span class="pill" style="background:var(--gold-soft); color:var(--gold-dark); font-size:.7rem;">📄 PDF</span>' : '';
        return `
          <tr>
            <td>${fmtDate(f.sentDate?.[LOCALE] || e.sys.createdAt)}</td>
            <td>${escapeHtml(f.title?.[LOCALE] || "(untitled)")}</td>
            <td>${statusBadge}${pdfBadge}</td>
            <td class="row-actions">
              <button data-action="edit" data-i="${i}">Edit</button>
              <button data-action="send" data-i="${i}">Send</button>
              <button data-action="delete" data-i="${i}" class="danger">Delete</button>
            </td>
          </tr>`;
      }).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center; color:#a02020;">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function setNlPdfUi(form, url, filename) {
    const chipWrap = document.getElementById("nl-pdf-chip-wrap");
    const chipName = document.getElementById("nl-pdf-chip-name");
    const status   = document.getElementById("nl-pdf-status");
    form.pdfUrl.value = url || "";
    if (url) {
      chipName.textContent = filename || url.split("/").pop() || "newsletter.pdf";
      chipWrap.style.display = "inline-flex";
      if (status) status.style.display = "none";
    } else {
      chipWrap.style.display = "none";
      if (status) { status.style.display = ""; status.textContent = "No PDF uploaded yet"; }
    }
  }

  function wireNewsletters() {
    const form    = document.getElementById("newsletters-form");
    const msg     = document.getElementById("newsletters-msg");
    const cancel  = document.getElementById("newsletters-cancel");
    const sendBtn = document.getElementById("newsletters-send");
    const title   = document.getElementById("newsletters-form-title");

    function resetForm() {
      form.reset(); form.id.value = "";
      title.textContent = "Write a newsletter";
      cancel.style.display = "none"; sendBtn.style.display = "none";
      form.querySelectorAll(".field-photo-preview").forEach(p => { p.src = ""; p.style.display = "none"; });
      setNlPdfUi(form, "", "");
    }
    cancel.addEventListener("click", resetForm);

    // ── PDF upload button ────────────────────────────────────
    const pdfFileInput = document.getElementById("pdf-upload-input");
    const nlPdfBtn     = document.getElementById("nl-pdf-upload-btn");
    const nlPdfRemove  = document.getElementById("nl-pdf-remove");

    if (nlPdfBtn && pdfFileInput) {
      nlPdfBtn.addEventListener("click", () => pdfFileInput.click());
      pdfFileInput.addEventListener("change", async () => {
        const file = pdfFileInput.files[0];
        if (!file) return;
        if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
          alert("Please select a PDF file."); return;
        }
        nlPdfBtn.disabled = true; nlPdfBtn.textContent = "Uploading…";
        const status = document.getElementById("nl-pdf-status");
        if (status) { status.style.display = ""; status.textContent = "Uploading PDF…"; }
        try {
          const url = await cmUploadAsset(file, file.name.replace(/\.pdf$/i, ""));
          setNlPdfUi(form, url, file.name);
        } catch (err) {
          alert("PDF upload failed: " + err.message);
        } finally {
          nlPdfBtn.disabled = false; nlPdfBtn.textContent = "📄 Upload PDF";
          pdfFileInput.value = "";
        }
      });
    }
    if (nlPdfRemove) {
      nlPdfRemove.addEventListener("click", () => setNlPdfUi(form, "", ""));
    }

    async function save() {
      const id = form.id.value;
      const existing = id ? nlCache.find(x => x.sys.id === id) : null;
      const fields = {
        title:    form.title.value.trim(),
        sentDate: form.sentDate.value || new Date().toISOString().slice(0,10),
        summary:  form.summary.value.trim(),
      };
      // body is required in Contentful — use summary or a dash as fallback when PDF-only
      fields.body = form.body.value.trim() || form.summary.value.trim() || "—";
      if (form.coverUrl.value.trim()) fields.coverImageUrl = form.coverUrl.value.trim();
      if (form.pdfUrl.value.trim())  fields.pdfFileUrl   = form.pdfUrl.value.trim();
      return cmCreateOrUpdateEntry("newsletter", fields, existing);
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.title.value.trim()) {
        showMsg(msg, "Please fill in the title.", "error"); return;
      }
      if (!form.pdfUrl.value.trim() && !form.body.value.trim()) {
        showMsg(msg, "Please upload a PDF or write a body text.", "error"); return;
      }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        await save();
        showMsg(msg, "Saved — visitors can now read it on the Newsletters page.", "success");
        resetForm(); loadNewsletters(); loadStats();
      } catch (err) {
        showMsg(msg, "Couldn't save: " + err.message, "error");
      } finally {
        btn.disabled = false; btn.textContent = "Save newsletter";
      }
    });

    sendBtn.addEventListener("click", async () => {
      if (!form.title.value.trim()) {
        alert("Please fill in the title before sending."); return;
      }
      if (!form.pdfUrl.value.trim() && !form.body.value.trim()) {
        alert("Please upload a PDF or write a body text before sending."); return;
      }
      const ok = confirm("Save this newsletter and email subscribers a notification with a link. Continue?");
      if (!ok) return;
      sendBtn.disabled = true; sendBtn.textContent = "Saving & sending…";
      try {
        const entry = await save();
        const result = await sendNewsletterEmail({
          title:    form.title.value.trim(),
          summary:  form.summary.value.trim(),
          body:     form.body.value.trim(),
          coverUrl: form.coverUrl.value.trim(),
          pdfUrl:   form.pdfUrl.value.trim(),
        });

        // Mark as sent in Contentful
        const entryFull = await cmRequest(`/entries/${entry.sys.id}`);
        entryFull.fields = entryFull.fields || {};
        entryFull.fields.emailSentAt = { [LOCALE]: new Date().toISOString() };
        await cmRequest(`/entries/${entry.sys.id}`, {
          method: "PUT",
          body: { fields: entryFull.fields },
          extraHeaders: { "X-Contentful-Version": String(entryFull.sys.version) },
        });

        showMsg(msg, `Sent to ${result.count} subscribers.`, "success");
        resetForm(); loadNewsletters();
      } catch (err) {
        showMsg(msg, "Send failed: " + err.message, "error");
      } finally {
        sendBtn.disabled = false; sendBtn.textContent = "Save & send to all subscribers";
      }
    });

    document.querySelector("#newsletters-table").addEventListener("click", async (e) => {
      const act = e.target.dataset.action;
      if (!act) return;
      const i = Number(e.target.dataset.i);
      const item = nlCache[i];
      if (!item) return;

      if (act === "edit") {
        const f = item.fields || {};
        form.id.value       = item.sys.id;
        form.title.value    = f.title?.[LOCALE] || "";
        form.sentDate.value = (f.sentDate?.[LOCALE] || "").slice(0,10);
        form.summary.value  = f.summary?.[LOCALE] || "";
        form.body.value     = f.body?.[LOCALE] || "";
        form.coverUrl.value = f.coverImageUrl?.[LOCALE] || "";
        updateFieldPreview(form, "coverUrl", f.coverImageUrl?.[LOCALE] || "");
        const existingPdf = f.pdfFileUrl?.[LOCALE] || "";
        setNlPdfUi(form, existingPdf, existingPdf ? existingPdf.split("/").pop() : "");
        title.textContent   = "Edit newsletter";
        cancel.style.display = "inline-flex";
        sendBtn.style.display = "inline-flex";
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (act === "send") {
        if (!confirm("Send this newsletter to every subscriber on the list?")) return;
        try {
          const f = item.fields || {};
          const result = await sendNewsletterEmail({
            title:    f.title?.[LOCALE] || "",
            summary:  f.summary?.[LOCALE] || "",
            body:     f.body?.[LOCALE] || "",
            coverUrl: f.coverImageUrl?.[LOCALE] || "",
            pdfUrl:   f.pdfFileUrl?.[LOCALE] || "",
          });
          // Mark sent
          const full = await cmRequest(`/entries/${item.sys.id}`);
          full.fields = full.fields || {};
          full.fields.emailSentAt = { [LOCALE]: new Date().toISOString() };
          await cmRequest(`/entries/${item.sys.id}`, {
            method: "PUT",
            body: { fields: full.fields },
            extraHeaders: { "X-Contentful-Version": String(full.sys.version) },
          });
          alert(`Sent to ${result.count} subscribers.`);
          loadNewsletters();
        } catch (err) {
          alert("Send failed: " + err.message);
        }
      }
      if (act === "delete") {
        if (!confirm("Delete this newsletter? This cannot be undone.")) return;
        try { await cmDeleteEntry(item.sys.id); loadNewsletters(); loadStats(); }
        catch (err) { alert("Delete failed: " + err.message); }
      }
    });
  }

  async function sendNewsletterEmail({ title, summary, body, coverUrl, pdfUrl }) {
    if (!cfg.emailjs?.publicKey || !cfg.emailjs?.serviceId || !cfg.emailjs?.newsletterTemplateId) {
      throw new Error("EmailJS is not configured yet.");
    }
    if (!window.emailjs) throw new Error("EmailJS library did not load.");
    if (!sb) throw new Error("Supabase is not configured — no subscriber list.");

    // Fetch subscribers
    const { data, error } = await sb.from("subscribers").select("email").eq("unsubscribed", false);
    if (error) throw error;
    const emails = (data || []).map(r => r.email).filter(Boolean);
    if (!emails.length) throw new Error("No subscribers on the list yet.");

    window.emailjs.init({ publicKey: cfg.emailjs.publicKey });

    // For PDF newsletters, body_html is a "read online" message with a link
    const siteUrl = cfg.site?.url || "https://kindersvandiekoning-creator.github.io";
    const readLink = `${siteUrl}/newsletters.html`;
    const bodyHtml = pdfUrl
      ? `<p>${(summary || "").replace(/&/g,"&amp;").replace(/</g,"&lt;")}</p>
         <p style="margin-top:24px;">
           <a href="${readLink}" style="background:#D4A24B; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:700;">
             Read the full newsletter →
           </a>
         </p>
         <p style="margin-top:16px; font-size:.85em; color:#888;">
           Or copy this link: ${readLink}
         </p>`
      : (body || "").split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g,"<br>")}</p>`).join("");

    // Send in chunks via BCC to keep under EmailJS limits
    const CHUNK = 45;
    for (let i = 0; i < emails.length; i += CHUNK) {
      const batch = emails.slice(i, i + CHUNK);
      await window.emailjs.send(cfg.emailjs.serviceId, cfg.emailjs.newsletterTemplateId, {
        to_email:  cfg.site?.adminEmail || batch[0],
        bcc:       batch.join(","),
        subject:   title,
        title,
        summary,
        body_html: bodyHtml,
        body_text: summary || body || "",
        cover_url: coverUrl || "",
        pdf_url:   pdfUrl || "",
        year:      new Date().getFullYear(),
      });
    }
    return { count: emails.length };
  }

  // ── 7. STAFF PANEL ───────────────────────────────────────
  let staffCache = [];
  async function loadStaff() {
    const tbody = document.querySelector("#staff-table tbody");
    try {
      const res = await cmListEntries("staffMember", { order: "fields.displayOrder" });
      staffCache = res.items || [];
      if (!staffCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">No staff yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = staffCache.map((e, i) => {
        const f = e.fields || {};
        return `
          <tr>
            <td>${f.displayOrder?.[LOCALE] ?? ""}</td>
            <td>${escapeHtml(f.name?.[LOCALE] || "")}</td>
            <td>${escapeHtml(f.role?.[LOCALE] || "")}</td>
            <td class="row-actions">
              <button data-action="edit" data-i="${i}">Edit</button>
              <button data-action="delete" data-i="${i}" class="danger">Delete</button>
            </td>
          </tr>`;
      }).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center; color:#a02020;">${escapeHtml(err.message)}</td></tr>`;
    }
  }
  function wireStaff() {
    const form = document.getElementById("staff-form");
    const msg  = document.getElementById("staff-msg");
    const cancel = document.getElementById("staff-cancel");
    const title = document.getElementById("staff-form-title");

    function nextAvailableOrder() {
      const used = new Set(staffCache.map(e => Number(e.fields?.displayOrder?.[LOCALE]) || 100));
      for (let n = 1; n <= 99; n++) { if (!used.has(n)) return n; }
      return 100;
    }

    function resetForm() {
      form.reset(); form.id.value = "";
      form.displayOrder.value = nextAvailableOrder();
      title.textContent = "Add a staff member";
      cancel.style.display = "none";
      const preview = form.querySelector(".field-photo-preview");
      if (preview) { preview.src = ""; preview.style.display = "none"; }
    }
    cancel.addEventListener("click", resetForm);

    const autoBtn = document.getElementById("order-auto-btn");
    if (autoBtn) autoBtn.addEventListener("click", () => {
      form.displayOrder.value = nextAvailableOrder();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        const id = form.id.value;
        const existing = id ? staffCache.find(x => x.sys.id === id) : null;
        const fields = {
          name:          form.name.value.trim(),
          role:          form.role.value.trim(),
          bio:           form.bio.value.trim(),
          displayOrder:  Number(form.displayOrder.value) || 100,
        };
        if (form.photoUrl.value.trim()) fields.photoUrl = form.photoUrl.value.trim();
        await cmCreateOrUpdateEntry("staffMember", fields, existing);
        showMsg(msg, "Saved.", "success");
        resetForm(); loadStaff(); loadStats();
      } catch (err) {
        showMsg(msg, "Couldn't save: " + err.message, "error");
      } finally {
        btn.disabled = false; btn.textContent = "Save staff member";
      }
    });

    document.querySelector("#staff-table").addEventListener("click", async (e) => {
      const act = e.target.dataset.action; if (!act) return;
      const i = Number(e.target.dataset.i);
      const item = staffCache[i]; if (!item) return;

      if (act === "edit") {
        const f = item.fields || {};
        form.id.value           = item.sys.id;
        form.name.value         = f.name?.[LOCALE] || "";
        form.role.value         = f.role?.[LOCALE] || "";
        form.bio.value          = f.bio?.[LOCALE] || "";
        form.displayOrder.value = f.displayOrder?.[LOCALE] ?? 100;
        form.photoUrl.value     = f.photoUrl?.[LOCALE] || "";
        updateFieldPreview(form, "photoUrl", f.photoUrl?.[LOCALE] || "");
        title.textContent = "Edit staff member";
        cancel.style.display = "inline-flex";
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (act === "delete") {
        if (!confirm("Delete this staff member?")) return;
        try { await cmDeleteEntry(item.sys.id); loadStaff(); loadStats(); } catch (err) { alert(err.message); }
      }
    });
  }

  // ── 8. PROGRESS PANEL ────────────────────────────────────
  let progressCache = [];
  async function loadProgress() {
    const tbody = document.querySelector("#progress-table tbody");
    try {
      const res = await cmListEntries("progressUpdate", { order: "-fields.date" });
      progressCache = res.items || [];
      if (!progressCache.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-muted" style="text-align:center;">No updates yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = progressCache.map((e, i) => {
        const f = e.fields || {};
        return `
          <tr>
            <td>${fmtDate(f.date?.[LOCALE])}</td>
            <td>${escapeHtml(f.title?.[LOCALE] || "")}</td>
            <td class="row-actions">
              <button data-action="edit" data-i="${i}">Edit</button>
              <button data-action="delete" data-i="${i}" class="danger">Delete</button>
            </td>
          </tr>`;
      }).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-muted" style="text-align:center; color:#a02020;">${escapeHtml(err.message)}</td></tr>`;
    }
  }
  function wireProgress() {
    const form = document.getElementById("progress-form");
    const msg  = document.getElementById("progress-msg");
    const cancel = document.getElementById("progress-cancel");
    const title = document.getElementById("progress-form-title");

    function resetForm() {
      form.reset(); form.id.value = "";
      title.textContent = "Post a progress update";
      cancel.style.display = "none";
      form.querySelectorAll(".field-photo-preview").forEach(p => { p.src = ""; p.style.display = "none"; });
    }
    cancel.addEventListener("click", resetForm);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        const id = form.id.value;
        const existing = id ? progressCache.find(x => x.sys.id === id) : null;
        const fields = {
          title: form.title.value.trim(),
          date:  form.date.value,
          body:  form.body.value.trim(),
        };
        if (form.photoUrl.value.trim()) fields.photoUrl = form.photoUrl.value.trim();
        await cmCreateOrUpdateEntry("progressUpdate", fields, existing);
        showMsg(msg, "Saved.", "success");
        resetForm(); loadProgress();
      } catch (err) {
        showMsg(msg, "Couldn't save: " + err.message, "error");
      } finally {
        btn.disabled = false; btn.textContent = "Save update";
      }
    });

    document.querySelector("#progress-table").addEventListener("click", async (e) => {
      const act = e.target.dataset.action; if (!act) return;
      const i = Number(e.target.dataset.i);
      const item = progressCache[i]; if (!item) return;
      if (act === "edit") {
        const f = item.fields || {};
        form.id.value       = item.sys.id;
        form.title.value    = f.title?.[LOCALE] || "";
        form.date.value     = (f.date?.[LOCALE] || "").slice(0, 10);
        form.body.value     = f.body?.[LOCALE] || "";
        form.photoUrl.value = f.photoUrl?.[LOCALE] || "";
        updateFieldPreview(form, "photoUrl", f.photoUrl?.[LOCALE] || "");
        title.textContent = "Edit progress update";
        cancel.style.display = "inline-flex";
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (act === "delete") {
        if (!confirm("Delete this update?")) return;
        try { await cmDeleteEntry(item.sys.id); loadProgress(); } catch (err) { alert(err.message); }
      }
    });
  }

  // ── 9. SITE IMAGES PANEL ─────────────────────────────────
  async function loadSiteImages() {
    const form = document.getElementById("site-images-form");
    const msg  = document.getElementById("site-images-msg");

    try {
      const res = await cmListEntries("siteImages", { limit: 1 });
      let entry = res.items?.[0];
      const f = entry?.fields || {};

      // Populate hero URL hidden inputs + show previews
      const heroVal   = f.homeHeroUrl?.[LOCALE]     || "";
      const aboutVal  = f.homeAboutUrl?.[LOCALE]    || "";
      const progVal   = f.progressHeroUrl?.[LOCALE] || "";
      form.homeHeroUrl.value     = heroVal;
      form.homeAboutUrl.value    = aboutVal;
      form.progressHeroUrl.value = progVal;
      updateImagePreview("homeHero",     heroVal);
      updateImagePreview("homeAbout",    aboutVal);
      updateImagePreview("progressHero", progVal);

      // Populate gallery slots
      const rawGallery = f.homeGalleryUrls?.[LOCALE];
      const galleryUrls = Array.isArray(rawGallery)
        ? rawGallery
        : (typeof rawGallery === "string" ? rawGallery.split("\n").map(s => s.trim()).filter(Boolean) : []);
      for (let i = 0; i < 8; i++) {
        const url = galleryUrls[i] || "";
        const hidden = form.querySelector(`[name="galleryUrl_${i}"]`);
        if (hidden) hidden.value = url;
        updateFieldPreview(form, `galleryUrl_${i}`, url);
      }

      form.dataset.entryId = entry?.sys?.id || "";
    } catch (err) { console.warn(err); }

    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        // Collect gallery from 8 individual slots
        const gallery = Array.from({ length: 8 }, (_, i) =>
          (form.querySelector(`[name="galleryUrl_${i}"]`)?.value || "").trim()
        ).filter(Boolean);

        const fields = {
          homeHeroUrl:     (form.homeHeroUrl.value     || "").trim(),
          homeAboutUrl:    (form.homeAboutUrl.value    || "").trim(),
          progressHeroUrl: (form.progressHeroUrl.value || "").trim(),
          homeGalleryUrls: gallery,
        };
        const res = await cmListEntries("siteImages", { limit: 1 });
        const existing = res.items?.[0] || null;
        await cmCreateOrUpdateEntry("siteImages", fields, existing);
        showMsg(msg, "Images updated. Refresh the website to see the change.", "success");
      } catch (err) {
        showMsg(msg, "Couldn't save: " + err.message, "error");
      } finally {
        btn.disabled = false; btn.textContent = "Save site images";
      }
    };
  }
  function updateImagePreview(key, url) {
    const el = document.getElementById(key + "-preview");
    if (!el) return;
    if (url) { el.src = url; el.style.display = "block"; } else { el.style.display = "none"; }
  }

  // ── 10. DONORS PANEL ─────────────────────────────────────
  const INITIAL_DONORS = [
    { name: "Proud Partners",                    displayOrder: 1 },
    { name: "Bana Bathemba",                     displayOrder: 2 },
    { name: "Frans Dreyer Liefdadigheids Trust", displayOrder: 3 },
    { name: "Tirisanu Construction",             displayOrder: 4 },
  ];

  async function setupDonorContentType() {
    const setupMsg = document.getElementById("donors-setup-msg");
    const setupBtn = document.getElementById("donors-setup-btn");
    function log(text, kind) {
      setupMsg.style.display = "block";
      setupMsg.className = "notice " + kind;
      setupMsg.textContent = text;
    }
    try {
      setupBtn.disabled = true; setupBtn.textContent = "Creating content type…";
      const ct = await cmRequest("/content_types/donor", {
        method: "PUT",
        body: {
          name: "Donor",
          displayField: "name",
          fields: [
            { id: "name",         name: "Name",         type: "Symbol",  required: true  },
            { id: "description",  name: "Description",  type: "Text",    required: false },
            { id: "logoUrl",      name: "Logo URL",      type: "Symbol",  required: false },
            { id: "websiteUrl",   name: "Website URL",   type: "Symbol",  required: false },
            { id: "displayOrder", name: "Display order", type: "Integer", required: false },
          ],
        },
        extraHeaders: { "X-Contentful-Version": "0" },
      });
      if (!ct) throw new Error("Could not create content type.");
      await cmRequest(`/content_types/donor/published`, {
        method: "PUT",
        extraHeaders: { "X-Contentful-Version": String(ct.sys.version) },
      });
      log("Content type created! Seeding initial partners…", "info");
      for (const d of INITIAL_DONORS) {
        await cmCreateOrUpdateEntry("donor", d);
      }
      log("Done! The 4 initial partners have been added.", "success");
      document.getElementById("donors-setup-card").style.display = "none";
      loadDonors();
    } catch (err) {
      log("Setup failed: " + err.message, "error");
      setupBtn.disabled = false; setupBtn.textContent = "🚀 Create content type & seed donors";
    }
  }

  let donorsCache = [];
  async function loadDonors() {
    const tbody = document.querySelector("#donors-table tbody");
    try {
      const res = await cmListEntries("donor", { order: "fields.displayOrder,fields.name" });
      donorsCache = res.items || [];
      document.getElementById("donors-setup-card").style.display = "none";
      if (!donorsCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">No partners yet. Use the form above to add one.</td></tr>`;
        return;
      }
      tbody.innerHTML = donorsCache.map((e, i) => {
        const f = e.fields || {};
        const website = f.websiteUrl?.[LOCALE] || "";
        return `
          <tr>
            <td>${f.displayOrder?.[LOCALE] ?? ""}</td>
            <td>${escapeHtml(f.name?.[LOCALE] || "")}</td>
            <td>${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener" style="color:var(--gold-dark);">${escapeHtml(website)}</a>` : ""}</td>
            <td class="row-actions">
              <button data-action="edit" data-i="${i}">Edit</button>
              <button data-action="delete" data-i="${i}" class="danger">Delete</button>
            </td>
          </tr>`;
      }).join("");
    } catch (err) {
      document.getElementById("donors-setup-card").style.display = "block";
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">Run setup above first.</td></tr>`;
    }
  }

  function wireDonors() {
    const form   = document.getElementById("donors-form");
    const msg    = document.getElementById("donors-msg");
    const cancel = document.getElementById("donors-cancel");
    const title  = document.getElementById("donors-form-title");
    const setupBtn = document.getElementById("donors-setup-btn");
    if (setupBtn) setupBtn.addEventListener("click", setupDonorContentType);

    function resetForm() {
      form.reset(); form.id.value = "";
      title.textContent = "Add a partner / donor";
      cancel.style.display = "none";
      const preview = form.querySelector(".field-photo-preview");
      if (preview) { preview.src = ""; preview.style.display = "none"; }
    }
    cancel.addEventListener("click", resetForm);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        const id = form.id.value;
        const existing = id ? donorsCache.find(x => x.sys.id === id) : null;
        const fields = {
          name:         form.name.value.trim(),
          displayOrder: Number(form.displayOrder.value) || 10,
        };
        if (form.description.value.trim()) fields.description = form.description.value.trim();
        if (form.websiteUrl.value.trim())  fields.websiteUrl  = form.websiteUrl.value.trim();
        if (form.logoUrl.value.trim())     fields.logoUrl     = form.logoUrl.value.trim();
        await cmCreateOrUpdateEntry("donor", fields, existing);
        showMsg(msg, "Saved.", "success");
        resetForm(); loadDonors();
      } catch (err) {
        showMsg(msg, "Couldn't save: " + err.message, "error");
      } finally {
        btn.disabled = false; btn.textContent = "Save partner";
      }
    });

    document.querySelector("#donors-table").addEventListener("click", async (e) => {
      const act = e.target.dataset.action; if (!act) return;
      const i = Number(e.target.dataset.i);
      const item = donorsCache[i]; if (!item) return;
      if (act === "edit") {
        const f = item.fields || {};
        form.id.value           = item.sys.id;
        form.name.value         = f.name?.[LOCALE] || "";
        form.description.value  = f.description?.[LOCALE] || "";
        form.websiteUrl.value   = f.websiteUrl?.[LOCALE] || "";
        form.logoUrl.value      = f.logoUrl?.[LOCALE] || "";
        form.displayOrder.value = f.displayOrder?.[LOCALE] ?? 10;
        updateFieldPreview(form, "logoUrl", f.logoUrl?.[LOCALE] || "");
        title.textContent = "Edit partner / donor";
        cancel.style.display = "inline-flex";
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (act === "delete") {
        if (!confirm("Remove this partner? This cannot be undone.")) return;
        try { await cmDeleteEntry(item.sys.id); loadDonors(); }
        catch (err) { alert("Delete failed: " + err.message); }
      }
    });
  }

  // ── 11. SUBSCRIBERS PANEL ────────────────────────────────
  let subsCache = [];
  async function loadSubscribers() {
    const tbody = document.querySelector("#subs-table tbody");
    if (!sb) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">Supabase not configured.</td></tr>`;
      return;
    }
    const { data, error } = await sb.from("subscribers").select("*").order("subscribed_at", { ascending: false });
    if (error) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center; color:#a02020;">${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    subsCache = data || [];
    if (!subsCache.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">No subscribers yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = subsCache.map(s => `
      <tr>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.source || "")}</td>
        <td>${fmtDateTime(s.subscribed_at)}</td>
        <td class="row-actions">
          <button data-action="delete" data-email="${escapeHtml(s.email)}" class="danger">Remove</button>
        </td>
      </tr>`).join("");
  }
  function wireSubscribers() {
    document.querySelector("#subs-table").addEventListener("click", async (e) => {
      if (e.target.dataset.action === "delete") {
        const email = e.target.dataset.email;
        if (!confirm(`Remove ${email} from the list?`)) return;
        await sb.from("subscribers").delete().eq("email", email);
        loadSubscribers(); loadStats();
      }
    });
    document.getElementById("subs-export").addEventListener("click", () => {
      if (!subsCache.length) return alert("No subscribers yet.");
      const csv = "email,source,subscribed_at\n" + subsCache.map(s =>
        `"${(s.email||"").replace(/"/g,'""')}","${(s.source||"").replace(/"/g,'""')}","${s.subscribed_at||""}"`
      ).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `subscribers-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ── 11. QUERIES PANEL ────────────────────────────────────
  async function loadQueries() {
    const el = document.getElementById("queries-list");
    if (!sb) { el.innerHTML = `<p class="text-muted">Supabase not configured.</p>`; return; }
    const { data, error } = await sb.from("contact_queries").select("*").order("submitted_at", { ascending: false });
    if (error) { el.innerHTML = `<p class="text-muted" style="color:#a02020;">${escapeHtml(error.message)}</p>`; return; }
    if (!data.length) { el.innerHTML = `<p class="text-muted">No messages yet.</p>`; return; }
    el.innerHTML = data.map(q => `
      <div class="card" style="margin-bottom:14px; ${q.read ? '' : 'border-left:3px solid var(--gold);'}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <div>
            <strong>${escapeHtml(q.name || "")}</strong>
            <span class="text-muted" style="margin-left:10px; font-size:.9rem;">&lt;${escapeHtml(q.email || "")}&gt;</span>
            <div class="pill" style="margin-left:6px;">${escapeHtml(q.topic || "General")}</div>
          </div>
          <div class="text-muted" style="font-size:.85rem;">${fmtDateTime(q.submitted_at)}</div>
        </div>
        <p style="white-space:pre-wrap; margin-top:14px;">${escapeHtml(q.message || "")}</p>
        <div class="row-actions" style="margin-top:12px;">
          ${!q.read ? `<button data-action="read" data-id="${q.id}">Mark as read</button>` : ''}
          <button data-action="reply" data-email="${escapeHtml(q.email)}">Reply by email</button>
          <button data-action="delete" data-id="${q.id}" class="danger">Delete</button>
        </div>
      </div>`).join("");

    el.onclick = async (e) => {
      const act = e.target.dataset.action;
      if (!act) return;
      if (act === "read") { await sb.from("contact_queries").update({ read: true }).eq("id", e.target.dataset.id); loadQueries(); loadStats(); }
      if (act === "reply") { window.location.href = `mailto:${e.target.dataset.email}`; }
      if (act === "delete") {
        if (!confirm("Delete this message?")) return;
        await sb.from("contact_queries").delete().eq("id", e.target.dataset.id);
        loadQueries(); loadStats();
      }
    };
  }

  // ── 12. DASHBOARD STATS ──────────────────────────────────
  async function loadStats() {
    try {
      // Events (upcoming)
      const nowIso = new Date().toISOString();
      const evRes = await cmListEntries("event", { "fields.startDate[gte]": nowIso, limit: 1 });
      document.getElementById("stat-events").textContent = evRes.total ?? evRes.items?.length ?? 0;
    } catch { /* silent */ }
    try {
      const nlRes = await cmListEntries("newsletter", { limit: 1 });
      document.getElementById("stat-newsletters").textContent = nlRes.total ?? nlRes.items?.length ?? 0;
    } catch { /* silent */ }
    try {
      const stRes = await cmListEntries("staffMember", { limit: 1 });
      document.getElementById("stat-staff").textContent = stRes.total ?? stRes.items?.length ?? 0;
    } catch { /* silent */ }
    if (sb) {
      const { count: subCount } = await sb.from("subscribers").select("id", { count: "exact", head: true });
      document.getElementById("stat-subs").textContent = subCount ?? 0;
      const { count: qCount } = await sb.from("contact_queries").select("id", { count: "exact", head: true }).eq("read", false);
      document.getElementById("stat-queries").textContent = qCount ?? 0;
    }
  }

  // ── 13. BOOT ─────────────────────────────────────────────
  function init() {
    const ok = requireAuth();
    if (!ok) return;

    // Nav clicks
    document.querySelectorAll(".admin-sidebar nav a").forEach(a => {
      a.addEventListener("click", () => switchPanel(a.dataset.panel));
    });
    if (location.hash) {
      const name = location.hash.slice(1);
      if (TITLES[name]) switchPanel(name);
    }

    // Logout
    document.getElementById("logout-btn").addEventListener("click", () => {
      localStorage.removeItem("kftk_auth");
      window.location.href = "/login.html";
    });

    wireUploadButtons();
    wireEvents();
    // Make sure Contentful has the photo-list field, then load the events
    ensureEventGalleryField().then(loadEvents);
    wireNewsletters();  loadNewsletters();
    wireStaff();        loadStaff();
    wireDonors();       loadDonors();
    wireProgress();     loadProgress();
    loadSiteImages();
    wireSubscribers();  loadSubscribers();
    loadQueries();
    loadStats();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init());
  else init();
})();
