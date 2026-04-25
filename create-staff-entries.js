/* ================================================================
   KINDERS VIR DIE KONING — Create Staff & Board Contentful Entries
   ----------------------------------------------------------------
   HOW TO USE:
   1. Open the admin portal in your browser (admin.html) and log in
   2. Open DevTools → Console  (F12 or right-click → Inspect)
   3. Paste this entire script and press Enter
   4. Watch the console for OK / SKIP / FAIL messages
   ================================================================ */

(async function createStaffEntries() {
  const cfg    = window.KFTK_CONFIG?.contentful || {};
  const SPACE  = cfg.spaceId;
  const ENV    = cfg.environment || "master";
  const TOKEN  = cfg.managementToken;
  const LOCALE = "en-US";
  const BASE   = `https://api.contentful.com/spaces/${SPACE}/environments/${ENV}`;

  if (!SPACE || !TOKEN) {
    console.error("❌ Contentful config not found. Are you on the admin page?");
    return;
  }

  function cmHeaders(extra = {}) {
    return Object.assign({
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type":  "application/vnd.contentful.management.v1+json",
    }, extra);
  }

  async function cmGet(path) {
    const r = await fetch(BASE + path, { headers: cmHeaders() });
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
    return r.json();
  }

  async function cmPost(path, body, extraHeaders = {}) {
    const r = await fetch(BASE + path, {
      method: "POST",
      headers: cmHeaders(extraHeaders),
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }

  async function cmPut(path, body, extraHeaders = {}) {
    const r = await fetch(BASE + path, {
      method: "PUT",
      headers: cmHeaders(extraHeaders),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`PUT ${path} → ${r.status}: ${text.slice(0, 200)}`);
    }
    return r.status === 204 ? null : r.json();
  }

  function f(val) { return { [LOCALE]: val }; }

  const STAFF = [
    // ── Teaching staff (order 1–8) ──────────────────────────
    { name:"Elvyda Bell",        role:"Grade R Teacher",   bio:"Grade R teacher with a Level 5 ECD qualification.",                                           displayOrder:1  },
    { name:"Renate Goliath",     role:"Grade R Teacher",   bio:"Grade R teacher, currently completing her Level 5 ECD at Stadio.",                            displayOrder:2  },
    { name:"Karen Herbert",      role:"Grade RR Teacher",  bio:"Grade RR teacher, currently completing her Level 4 ECD at Ed-Build.",                         displayOrder:3  },
    { name:"Bernadine Marais",   role:"Grade RR Teacher",  bio:"Grade RR teacher with a Level 4 ECD qualification.",                                          displayOrder:4  },
    { name:"Cheri-Lee Williams", role:"Grade RRR Teacher", bio:"Grade RRR teacher, nurturing our youngest learners.",                                          displayOrder:5  },
    { name:"Britney Cookson",    role:"Teacher",           bio:"Teacher, currently completing her Bachelor of Education at Helderberg College.",               displayOrder:6  },
    { name:"Tracy",              role:"Staff",             bio:"",                                                                                             displayOrder:7  },
    { name:"Jeffrey Booysen",    role:"Caretaker",         bio:"Our caretaker, keeping the school safe and running smoothly every day.",                       displayOrder:8  },
    // ── Board members (order 10–17) ─────────────────────────
    { name:"Sonia Leibrandt",    role:"Chairlady",         bio:"Chairlady of the board. Retired school principal with a lifetime of dedication to education.", displayOrder:10 },
    { name:"Frans Kersop",       role:"Director",          bio:"Director responsible for school finance. Retired teacher.",                                    displayOrder:11 },
    { name:"Helen Joubert",      role:"Director",          bio:"Director and Manager of the school. Retired retail manager with strong organisational skills.", displayOrder:12 },
    { name:"David Gabriel",      role:"Director",          bio:"Director with a background in social work and community development.",                         displayOrder:13 },
    { name:"Marie Goliath",      role:"Community Worker",  bio:"Community worker and dedicated board member.",                                                 displayOrder:14 },
    { name:"Edward Marais",      role:"Community Worker",  bio:"Community worker and dedicated board member.",                                                 displayOrder:15 },
    { name:"Katryn Titus",       role:"Community Worker",  bio:"Community worker and dedicated board member.",                                                 displayOrder:16 },
    { name:"Theo Calitz",        role:"Director",          bio:"Director and businessman, contributing valuable business expertise to the board.",              displayOrder:17 },
  ];

  console.log("📋 Fetching existing staff entries...");
  const existing = await cmGet("/entries?content_type=staffMember&limit=200");
  const existingNames = new Set(
    (existing.items || []).map(e => (e.fields?.name?.[LOCALE] || "").toLowerCase().trim())
  );
  console.log(`   Found ${existingNames.size} existing: ${[...existingNames].join(", ") || "(none)"}`);

  let ok = 0, skip = 0, fail = 0;
  for (const person of STAFF) {
    const key = person.name.toLowerCase().trim();
    if (existingNames.has(key)) {
      console.log(`   ⏭  SKIP  ${person.name}`);
      skip++; continue;
    }
    try {
      const fields = {
        name:         f(person.name),
        role:         f(person.role),
        displayOrder: f(person.displayOrder),
      };
      if (person.bio) fields.bio = f(person.bio);

      const entry = await cmPost("/entries", { fields }, {
        "X-Contentful-Content-Type": "staffMember",
      });

      await cmPut(`/entries/${entry.sys.id}/published`, undefined, {
        "X-Contentful-Version": String(entry.sys.version),
      });

      console.log(`   ✅  OK    ${person.name}  (id: ${entry.sys.id})`);
      ok++;
    } catch (e) {
      console.error(`   ❌  FAIL  ${person.name}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n🎉 Done! Created: ${ok}  Skipped: ${skip}  Failed: ${fail}`);
  if (ok > 0) console.log("Refresh the Staff panel in the admin to see them.");
})();
