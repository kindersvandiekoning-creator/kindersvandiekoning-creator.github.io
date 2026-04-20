# Kinders van die Koning — Setup Guide

This is the one-time setup. Once it's done, the admin never has to touch any
of these services again — she just opens `/admin.html`, signs in, and manages
everything from one page.

Total time: **about 45 minutes**, mostly clicking buttons.

---

## What you're setting up

| Service | What it stores | Free tier |
|--|--|--|
| **Supabase** | The admin's login, newsletter subscribers, and contact-form messages | 500MB DB + 50k monthly active users — plenty |
| **Contentful** | Events, newsletters, staff, progress updates, site images | 25,000 entries, 2 roles — plenty |
| **EmailJS** | Sends newsletters and contact-form notifications | 200 emails/month free — upgrade if needed |

You'll collect **9 keys / IDs** across these three services and paste them into
`/js/config.js`.

---

## 1. Contentful (content + images)

### 1a. Create the space

1. Go to <https://www.contentful.com/sign-up> and sign up (free).
2. Create a new space called **"Kinders van die Koning"**.
3. Open it. Note the URL — it contains your Space ID, e.g.
   `https://app.contentful.com/spaces/**a1b2c3d4e5f6**/...`.
   **Copy that ID** → it goes in `config.js` as `contentful.spaceId`.

### 1b. Create the content types

In Contentful, click **Content model → + Add content type** and create each of
these. For each field, use the exact **Field ID** shown (case matters). Leave
validations at default unless noted.

#### Content type: `event` (Name: "Event")

| Field | ID | Type | Notes |
|--|--|--|--|
| Title | `title` | Short text | required |
| Slug | `slug` | Short text | |
| Start date | `startDate` | Date & time | required |
| Time | `time` | Short text | e.g. "10:00 – 12:00" |
| Location | `location` | Short text | |
| Summary | `summary` | Short text (long) | |
| Details | `details` | Long text | |
| Photo URL | `photoUrl` | Short text | URL, filled automatically by admin |

#### Content type: `newsletter` (Name: "Newsletter")

| Field | ID | Type |
|--|--|--|
| Title | `title` | Short text (required) |
| Sent date | `sentDate` | Date (date only) |
| Summary | `summary` | Short text (long) |
| Body | `body` | Long text (required) |
| Cover image URL | `coverImageUrl` | Short text |
| Email sent at | `emailSentAt` | Date & time |

#### Content type: `staffMember` (Name: "Staff Member")

| Field | ID | Type |
|--|--|--|
| Name | `name` | Short text (required) |
| Role | `role` | Short text (required) |
| Bio | `bio` | Long text |
| Photo URL | `photoUrl` | Short text |
| Display order | `displayOrder` | Integer — default `100` |

#### Content type: `progressUpdate` (Name: "Progress Update")

| Field | ID | Type |
|--|--|--|
| Title | `title` | Short text (required) |
| Date | `date` | Date (required) |
| Body | `body` | Long text |
| Photo URL | `photoUrl` | Short text |

#### Content type: `siteImages` (Name: "Site Images")

This holds one single entry with every big photo used across the site.

| Field | ID | Type |
|--|--|--|
| Home — hero image URL | `homeHeroUrl` | Short text |
| Home — about image URL | `homeAboutUrl` | Short text |
| Progress hero URL | `progressHeroUrl` | Short text |
| Home gallery URLs | `homeGalleryUrls` | **Short text, List** (array of strings) |

After saving the content type, click **Content → + Add entry → Site Images** and
create **one empty entry** (leave all fields blank, just publish). The admin
portal will populate it.

### 1c. Get the API tokens

You need **two** tokens: a Delivery token (used by every visitor to read the
website) and a Management / Personal Access Token (used only on `/admin.html`
to write new events, newsletters, etc.).

#### Delivery token (public, safe to expose)

1. In Contentful, click the **⚙ Settings** cog in the top-right of the space
   (or the space menu → **Settings**) and choose **API keys**.
   Direct link: `https://app.contentful.com/spaces/<YOUR-SPACE-ID>/api/keys`.
2. Click **Add API key**. Name it "Website (delivery)".
3. On the key's page, copy the **Content Delivery API - access token**
   → this is `contentful.deliveryToken`.
   (Ignore the Preview token — we don't use it.)

#### Management token (admin-only, sensitive)

Contentful has moved this around over the years. Try these in order — the first
one that exists in your account is the right path:

1. **Newest UI — space-level tokens (recommended)**
   - Same page as above: **Settings → API keys**.
   - Click the **"Content management tokens"** tab at the top.
   - Click **Generate personal token**, name it "Admin portal".
   - Copy the token immediately (you can never see it again)
     → this is `contentful.managementToken`.

2. **If that tab isn't there — account-level personal access tokens**
   - Click your **avatar / initials** in the top-right corner.
   - Choose **Account settings** (or **Organization settings → Users**, then
     your own user).
   - In the left sidebar pick **CMA tokens** (sometimes labelled
     **"Personal access tokens"** or **"API access"**).
   - Direct link: <https://app.contentful.com/account/profile/cma_tokens>.
   - Click **Create personal access token**, name it "Admin portal", and
     copy the value → this is `contentful.managementToken`.

3. **Fallback — OAuth app (rarely needed)**
   If neither path exists in your plan, create an OAuth app under
   **Account settings → OAuth applications** and use the generated token.
   Not needed for a free Contentful account.

⚠ The management token is sensitive. It's OK in `config.js` because only the
admin opens `/admin.html`, and nothing in the public site uses it — but don't
publish `config.js` to a public repo. If your repo is public, gitignore
`config.js` and keep a local copy, or move to environment-variable injection
at build time.

---

## 2. Supabase (auth + subscribers + queries)

### 2a. Create the project

1. Go to <https://supabase.com> → **Sign up** (free).
2. Click **New project**. Pick a name, a strong DB password (save it somewhere),
   and the closest region (for South Africa: **eu-west-1 Ireland** or **South
   Africa** if available).
3. Wait ~2 minutes for it to provision.

### 2b. Get the keys

In your project's sidebar, go to **Settings → API**. You'll need:

- **Project URL** → `supabase.url` (looks like `https://xxxxx.supabase.co`)
- **anon / public key** → `supabase.anonKey` (long JWT-like string)

### 2c. Create the admin user

1. In the sidebar, go to **Authentication → Users → Add user → Create new user**.
2. Enter **her email** and a password. **Important:** tick "Auto Confirm User"
   so she doesn't need to verify the email.
3. Give her the password privately. She'll use it to sign in at
   `https://yoursite.com/login.html`.

### 2d. Create the tables

Go to **SQL Editor → + New query**, paste the block below, and click **Run**:

```sql
-- ── 1. Newsletter subscribers ─────────────────────────────
create table public.subscribers (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  source         text,                      -- where they signed up: footer, events-page, etc.
  subscribed_at  timestamptz not null default now(),
  unsubscribed   boolean not null default false
);

-- ── 2. Contact-form queries ───────────────────────────────
create table public.contact_queries (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  email         text,
  topic         text,
  message       text,
  submitted_at  timestamptz not null default now(),
  read          boolean not null default false
);

-- ── 3. Row-level security: who can do what ────────────────
alter table public.subscribers      enable row level security;
alter table public.contact_queries  enable row level security;

-- Anyone (anonymous) can insert a subscriber (signing up)
create policy "anyone can subscribe"
  on public.subscribers
  for insert
  to anon, authenticated
  with check (true);

-- Anyone can insert a contact query
create policy "anyone can send a query"
  on public.contact_queries
  for insert
  to anon, authenticated
  with check (true);

-- Only signed-in users (the admin) can read / update / delete
create policy "admin can read subscribers"
  on public.subscribers
  for select to authenticated using (true);

create policy "admin can modify subscribers"
  on public.subscribers
  for all to authenticated
  using (true) with check (true);

create policy "admin can read queries"
  on public.contact_queries
  for select to authenticated using (true);

create policy "admin can modify queries"
  on public.contact_queries
  for all to authenticated
  using (true) with check (true);
```

That's it for Supabase.

---

## 3. EmailJS (newsletter sending)

### 3a. Sign up + connect an email

1. Go to <https://www.emailjs.com> → sign up.
2. Click **Email Services → Add New Service**.
3. Pick **Gmail** (or whichever account you want the newsletters to come FROM —
   her personal Gmail is fine). Follow the OAuth prompts.
4. Once connected, copy the **Service ID** (e.g. `service_abc123`) → this is
   `emailjs.serviceId`.

### 3b. Public key

- Go to **Account → General** → copy the **Public Key** → this is
  `emailjs.publicKey`.

### 3c. Create the newsletter template

1. Go to **Email Templates → Create New Template**.
2. Name: "Newsletter".
3. **To email:** `{{to_email}}`
4. **Bcc:** `{{bcc}}`
5. **Subject:** `{{subject}}`
6. **Content (HTML mode):** paste this:

```html
<div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif; max-width:620px; margin:0 auto; color:#2F3A52;">
  {{#cover_url}}
  <img src="{{cover_url}}" style="width:100%; border-radius:10px; margin-bottom:24px;">
  {{/cover_url}}
  <h1 style="color:#1B2A4E; font-weight:700; font-size:1.8rem;">{{title}}</h1>
  {{#summary}}<p style="color:#555; font-size:1.05rem;">{{summary}}</p>{{/summary}}
  <div style="line-height:1.7; font-size:1rem;">
    {{{body_html}}}
  </div>
  <hr style="margin:36px 0; border:none; border-top:1px solid #eee;">
  <p style="font-size:.78rem; color:#999;">
    You're receiving this because you subscribed at
    <a href="https://YOUR-WEBSITE.com" style="color:#D4A24B;">Kinders van die Koning</a>.
    &copy; {{year}} Kinders van die Koning.
  </p>
</div>
```

7. Save the template and copy the **Template ID** (e.g. `template_xyz789`) →
   this is `emailjs.newsletterTemplateId`.

### 3d. Create the contact-form template (optional but recommended)

This one forwards contact-form submissions to the admin's inbox.

1. **Create New Template** → "Contact Form Notification".
2. **To email:** `{{to_email}}`
3. **Subject:** `New message: {{topic}} — from {{from_name}}`
4. **Content:**

```
From:  {{from_name}} <{{from_email}}>
Topic: {{topic}}

{{message}}
```

5. Copy the Template ID → this is `emailjs.contactTemplateId`.

---

## 4. Paste everything into `/js/config.js`

Open `js/config.js` and fill in **all** the blank fields. The admin email is the
one you want contact-form messages sent to — probably the same Gmail you
connected to EmailJS.

Example (with real-looking values):

```js
window.KFTK_CONFIG = {
  contentful: {
    spaceId:        "a1b2c3d4e5f6",
    environment:    "master",
    deliveryToken:  "y_1zH...long-string",
    previewToken:   "",
    managementToken:"CFPAT-long-token-here",
  },
  supabase: {
    url:     "https://xxxxx.supabase.co",
    anonKey: "eyJhbGciOiJ...long JWT",
  },
  emailjs: {
    publicKey:            "user_AbC123",
    serviceId:            "service_abc123",
    newsletterTemplateId: "template_xyz789",
    contactTemplateId:    "template_qrs456",
  },
  site: {
    name:    "Kinders van die Koning",
    tagline: "A Christian Early Development Centre in Strand.",
    adminEmail: "kindersvandiekoning@gmail.com",
    location:   "Strand, Cape Town, South Africa",
    contact: {
      email:   "kindersvandiekoning@gmail.com",
      phone:   "+27 21 000 0000",
      address: "Community Hall of Casablanca, Strand, Cape Town",
    },
    social: {
      facebook:  "",
      instagram: "",
    },
  },
};
```

---

## 5. Test the admin portal

1. Open `https://YOUR-SITE.com/login.html`.
2. Sign in with the email + password you created in Supabase (step 2c).
3. You should land on `/admin.html`.
4. Try adding a test event. It should appear on `/events.html` within 5 seconds.
5. Try adding a subscriber through the public footer form, then check they show
   up under **Subscribers** in admin.

---

## 6. Going live

- Point your domain (or use the default `kinderskoning.github.io` GitHub Pages
  URL) at the repo `kinderskoning.github.io`. Enable HTTPS in the repo's
  **Settings → Pages**.
- The site needs no server — everything runs in the browser.

---

## How the admin uses this day-to-day

1. She bookmarks **`yoursite.com/admin.html`**.
2. Signs in once (the browser will remember her for 30 days).
3. Clicks the left-hand menu to add events, staff, newsletters, or progress
   updates.
4. To send a newsletter: write it, click **Save & send to all subscribers**.
5. To change a big photo on the site: **Site images** → upload → Save.

Everything she saves is instantly live on the public website.

---

## Notes & troubleshooting

- **"Contentful is not configured"** → a key is still blank in `config.js`.
- **"Supabase is not configured"** → same — fill in the URL and anon key.
- **Newsletter send fails** → check EmailJS is connected, and that the
  `bcc` field is enabled in the template settings (EmailJS hides it by default).
  If she has many subscribers, upgrade EmailJS or migrate to Resend/Brevo later.
- **Login fails** → double-check the user was "auto confirmed" in Supabase.
- **Photos don't show** → ensure the Contentful content types have the `photoUrl`
  field (not `photo`) as described in step 1b.
- **Need to change her password** → Supabase → Authentication → Users → click
  her row → Reset password.
