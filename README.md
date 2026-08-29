# CrisisLink

Crowdsourced disaster reporting and verification for **India**. Citizens report
incidents from a mobile-first web app; the backend does not trust any single
report, but clusters reports by location, time and disaster type, scores the
cluster's confidence, and only escalates once independent evidence agrees.
Official hazard feeds are ingested alongside the crowd data.

**The interesting part is the verification pipeline, not the CRUD.**

---

## Status: Phase 1 complete

| Phase | Scope | State |
|---|---|---|
| **1** | Auth, report submission with GPS, live map, admin report list, USGS feed ingest | **Done** |
| **2** | Clustering, confidence scoring, incident state machine, audit log, admin decisions | **Done** |
| 3 | Text classification (**done**), Web Push alerts (**done**), live updates, offline queue | In progress |
| 4 | Responder queue, resources, shelters, analytics, PWA (**done**); Android TWA build | In progress |

---

## Setup

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL and JWT_SECRET
npm run db:migrate            # applies both migrations, including PostGIS
npm run db:seed               # creates admin / responder / citizen accounts
npm run poll:usgs             # pulls real earthquakes so the map is not empty
npm run dev
```

Seeded accounts all use the password `crisislink123` (override with
`SEED_PASSWORD`):

| Email | Role |
|---|---|
| `admin@crisislink.local` | ADMIN |
| `responder@crisislink.local` | RESPONDER |
| `citizen@crisislink.local` | CITIZEN |

The database must have the PostGIS extension available. Neon supports it; the
migration runs `CREATE EXTENSION IF NOT EXISTS postgis`.

---

## Architecture

| Layer | Choice |
|---|---|
| Frontend + API | Next.js 16 (App Router, TypeScript, Tailwind 4) |
| Database | PostgreSQL + PostGIS |
| ORM | Prisma 7 (with the `pg` driver adapter) |
| Auth | Hand-rolled: bcrypt + JWT in an httpOnly cookie, verified with `jose` |
| Maps | Leaflet + OpenStreetMap tiles |
| Hazard feed | USGS FDSN event API |
| Notifications | Web Push (VAPID) — keys generated locally, no service |
| Classification | Gemini API (`@google/genai`), free tier |

### Geospatial approach

Prisma cannot model PostGIS `geography` columns, so coordinates are stored as
plain `lat`/`lng` floats and the migration in
`prisma/migrations/*_postgis/` creates **GiST expression indexes** over
`ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`. Radius queries use
`ST_DWithin` against that expression and hit the index — with no duplicate
geometry column to keep in sync, and nothing for Prisma to be confused by.

Postgres only uses an expression index when a query repeats the expression
*exactly*, so the canonical fragments live in one place: `src/lib/geo-sql.ts`.

Because those objects are invisible to Prisma, schema changes must go through
`npm run db:migrate:dev` (which is `prisma migrate dev --create-only`), so the
generated SQL can be reviewed before it is applied.

### India scoping

`src/lib/india.ts` defines **two deliberately different** bounding boxes:

- `REPORTING_BOUNDS` — where a citizen report is accepted. There are no
  responders outside India, so an out-of-area coordinate is a spoof or a
  parsing error.
- `HAZARD_BOUNDS` — where an official hazard event is worth ingesting. This is
  **wider on purpose**: a M7 in Nepal or the Hindu Kush shakes Indian
  districts, and clipping official feeds to the border would discard exactly
  the events that matter most in the north and east.

Both are axis-aligned boxes, **not** the political border, and are not a
statement about where any border lies. A box that contains all of India also
contains Kathmandu, Colombo and Dhaka, so the reporting filter is a coarse
service-area guard rather than a precise one. Sharpening it needs an
authoritative boundary polygon — noted as future work in the report.

All clock times are rendered in IST regardless of the viewer's device.

---

## The verification pipeline

Lives under `src/lib/verification/`, orchestrated by `pipeline.ts`.

1. **Sanity checks at ingest** (`sanity.ts`) — done.
   - Per-user rate limit: 5 reports / 10 minutes.
   - Impossible-GPS-jump rejection: a jump over 2 km is rejected if it implies
     a ground speed above 280 m/s (roughly airliner cruise). Generous by
     design, so it only fires on genuinely impossible movement rather than on
     someone reporting from a moving vehicle.
   - Service-area check: the report must fall inside `REPORTING_BOUNDS`.
2. **Clustering** (`cluster.ts`) — done. Same disaster type, within 1 km of an
   open incident's centre, incident active within the last 2 hours. Nearest
   match wins, via `ST_DWithin` and the `<->` KNN operator over the GiST
   expression index. Only `CITIZEN`-sourced incidents are candidates, so crowd
   data can never be absorbed into an official-feed record. The cluster's
   centre and radius are then recomputed from its members.
3. **Confidence scoring** (`confidence.ts`) — done. See below.
4. **Text classification** (`classify.ts`) — done. One structured-output call
   per report at intake, via the Gemini API (`@google/genai`), stored on the
   report row so it is paid for once rather than recomputed on every rescore.
   Feeds the `llmClassification` quality component.

   **Optional throughout.** With `GEMINI_API_KEY` unset the call is skipped,
   `aiConfidence` stays null, the component drops out and the score
   renormalises — the pipeline is fully correct without it. The mapping from
   raw classification to component value lives in
   `classificationToComponentValue()`, deliberately in code rather than in the
   prompt, so the policy — implausible text scores 0, a real event of the wrong
   type is discounted but never zeroed — is reviewable and tested.
5. **State transitions** (`state.ts`) — done. See below.
**Offline reporting** (`offline-queue.ts`) — a report that fails to reach the
server is stored in IndexedDB and replayed when the browser reports coming back
online, keeping its original `clientCreatedAt` so clustering still sees when it
was written rather than when it synced. Only network failures queue: a 422 or
429 is the server deciding, and retrying it forever would spam an endpoint that
already refused. Every report carries a client-generated `clientId`, and the
API deduplicates on it — testing found a real race where a mount and an
`online` event drained the queue concurrently and sent the same report twice,
which matters because report count is the heaviest input to the confidence
score and a duplicate reads as a second independent witness.

6. **Alerting** (`push.ts`) — done. On a human ACTIVATE, subscribers whose
   stored location falls inside the incident radius are found via `ST_DWithin`
   over a partial GiST index, sent a Web Push notification, and the outcome
   (recipients, delivered, pruned) is written to both the `Alert` row and the
   audit log. Subscriptions the push service reports permanently gone
   (404/410) are deleted; transient failures are counted and left alone, so a
   push-service hiccup cannot destroy working registrations.

   **Runs on no paid service.** VAPID keys are generated locally and delivery
   goes to the browser's own push endpoint (Google/Mozilla/Apple). There is
   nothing to sign up for.

### The confidence formula

Deliberately **not** a learned model: for a system that can dispatch
responders, being able to say *"0.62 because four separate people reported the
same thing within 400 m and 20 minutes"* is worth more than a few points of
accuracy from something opaque.

    score = evidence x quality

Components fall into two groups doing different jobs. **Evidence** is how much
independent support the claim has, and sets the ceiling. **Quality** is whether
those reports agree, and can only discount that ceiling — never raise it.

| Group | Component | Weight | What it measures |
|---|---|---|---|
| Evidence | Report count | 0.65 | Independent reports, saturating at 5 |
| Evidence | Official corroboration | 0.35 | A feed event matching in place and time |
| Quality | Geographic tightness | 0.25 | Mean distance of reports from the centre |
| Quality | Time correlation | 0.25 | How bunched the reports are in time |
| Quality | Reporter diversity | 0.15 | Distinct accounts, normalised |
| Quality | Severity agreement | 0.15 | Standard deviation of severity ratings |
| Quality | Text classification | 0.20 | Phase 3 — declared, currently unavailable |

**Why multiplicative, not one flat sum.** The first implementation *was* a
single weighted sum, and testing it against real clustered reports showed why
that is wrong. Every quality signal is near 1.0 for any tight pair of reports,
so the moment a second report arrived they all activated at once and dragged
the score from 0.20 to 0.76 in one step — straight past `SUSPECTED`, leaving
that state unreachable in practice. A flat sum lets agreement manufacture
confidence that the amount of evidence does not support. Two people agreeing
perfectly is still only two people.

Separating the groups and multiplying gives a monotone, well-spread curve.
Measured end to end against the live database, six people reporting one flood:

| Reports | Score | State |
|---|---|---|
| 1 | 0.200 | `UNVERIFIED` |
| 2 | 0.390 | `SUSPECTED` |
| 3 | 0.543 | `SUSPECTED` |
| 4 | 0.723 | `HIGH_CONFIDENCE` |
| 5 | 0.873 | `VERIFIED` |
| 6 | 0.877 | `VERIFIED` |

And five reports that *disagree* — one account, spread over kilometres and
hours, contradictory severities — score evidence 1.00 x quality 0.33, staying
`UNVERIFIED` despite the volume.

**Availability, not zero.** A component that cannot be *meaningfully computed*
reports itself unavailable and is dropped from its group's numerator and
denominator, rather than scoring 0. This matters more than it looks:

- A single report has no spread, no time span and no reporter diversity.
  Scoring those 0 would cap a genuine first report of a real disaster at 0.30
  no matter how credible it was.
- Official corroboration is only askable for hazards a feed actually covers.
  We ingest earthquakes only, so scoring floods 0 there would silently cap
  every flood in the country at 0.80 for a reason unrelated to the flood.

With no assessable quality signals at all — a lone first report — quality
falls back to a neutral 1.0 rather than punishing whoever reported first, and
the evidence ceiling alone decides the score.

The weights are reasoned, not fitted — there is no labelled dataset of verified
Indian disaster reports to fit them to. Each constant carries its rationale in
a comment, in one place, so they can be argued with.

### State machine and the safety rule

| Score | State |
|---|---|
| < 0.35 | `UNVERIFIED` |
| ≥ 0.35 | `SUSPECTED` |
| ≥ 0.60 | `HIGH_CONFIDENCE` |
| ≥ 0.80 | `VERIFIED` |

Automatic scoring can move an incident along that ladder and no further.
**`ACTIVE` — the state that alerts real people — and `RESOLVED` are reachable
only through a human decision**, and this is enforced structurally: they are
simply unreachable from `nextAutomaticState`, and a test walks the entire score
range from every starting state to prove no score produces `ACTIVE`.

Automation also refuses to act in three further cases:

1. The incident is already `ACTIVE` or `RESOLVED` — a human owns it, and
   scoring must not yank an alert out from under a responder.
2. A human has reviewed it — automation may still *raise* the state as evidence
   arrives, but never overrule a person downward.
3. It came from an official feed — its confidence is not produced by this
   formula, so the formula has no business rescoring it.

Every human decision, and every automatic transition, is written to `AuditLog`
with the actor (`null` for automatic).

### Non-negotiable safety rule

`unverified → suspected → high_confidence → verified` may be driven
automatically by the confidence score. **The transition to `active` — the state
that sends real alerts to real people — requires a human.** No automated
process, no matter how confident, and no official feed, however authoritative,
may make that transition. USGS events are ingested as `VERIFIED`, never
`ACTIVE`, for exactly this reason.

---

## Official hazard data

Real, live, public data — no mock rows.

| Source | Covers | Auth | Status |
|---|---|---|---|
| USGS FDSN event API | Earthquakes, bounded to the India hazard region | None | **Integrated** |
| NASA EONET v3 | Wildfires, severe storms, volcanoes | None | Planned |
| NASA FIRMS | Active fire hotspots | Free MAP_KEY | Planned |
| GDACS | Multi-hazard, incl. cyclones and floods | None | Planned |
| IMD | India-specific warnings, rainfall, cyclone tracks | TBC | Planned — verify access early |

Polling runs from `/api/cron/poll-usgs`, scheduled by Vercel Cron
(`vercel.json`) once daily and protected by `CRON_SECRET`.

**Why daily, not every 15 minutes:** Vercel's Hobby plan caps cron jobs at one
run per day, and a more frequent expression *fails deployment* outright rather
than being throttled. This costs nothing in completeness — the ingester looks
back 7 days on every run, so a daily poll still picks up every event; only
freshness drops. Trigger it by hand (`npm run poll:usgs`) before a demo, or
raise the frequency on a Pro plan. Ingest is
idempotent: events are upserted on a namespaced `externalId` (`usgs:<id>`), and
USGS revisions to magnitude or location are picked up on the next poll.

Run it by hand with `npm run poll:usgs`.

**These feeds provide real _official_ data. They do not provide real _citizen
reports_** — no ToS-compliant API hands those out. To demo the clustering and
confidence pipeline, either have real people submit through the real UI during
the presentation, or drive the real `/api/reports` endpoint with a generator
script. The latter is a load-test harness exercising the actual pipeline, not
fabricated database rows — a distinction worth being explicit about with
evaluators.

---

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Create a migration for review, without applying |
| `npm run db:seed` | Seed the three role accounts |
| `npm run db:studio` | Prisma Studio |
| `npm run poll:usgs` | Ingest earthquakes once |
| `npm test` | Unit tests for the scoring and state logic |

---

## Scoped-prototype disclosures

For the report and viva — things deliberately simplified, per the project brief:

- Government/NDMA integration is designed for but **not** built.
- Alert targeting is a **radius query**, not polygon or wind-direction modelling.
- The service-area filter is a **bounding box**, not a border polygon.
- Resource allocation is a **priority sort**, not an optimiser: `state first,
  then severity × (1 + people in danger)`. It models no travel time, crew
  skills or road access, and the UI says so on the page itself.
- Resources and shelters are **seeded inventory**, because no public feed lists
  a district's boats or relief centres. This is a different thing from the
  incident data, where no observation is ever fabricated — worth keeping that
  distinction sharp in the report.
- Responder assignment is **one responder per incident**; real dispatch needs
  many-to-many with roles and shift handover.
- The analytics "rejected by a human" figure is a **proxy** for false-positive
  rate, not a ground-truth error rate.
- Scalability is discussed analytically; it is not built for millions of users.
- Report media upload is deferred to Phase 3.
- Confidence weights are reasoned, not fitted to data — there is no labelled
  dataset of verified Indian citizen reports to fit them to.
- **Text classification runs on the Gemini free tier, whose terms permit Google
  to use submitted content for product improvement and allow human reviewers to
  read API input and output.** The call sends only the description text and the
  claimed disaster type — never the reporter's identity, coordinates, or
  people-in-danger count — but a citizen's free-text description can still
  contain personal information. This is an accepted, disclosed limitation of the
  prototype and a genuine blocker for real deployment, where the paid tier
  (whose terms exclude training use) or a locally hosted model would be
  required.

---

## Installable Android app (TWA, not Capacitor)

The build brief called for a Capacitor wrap. That was changed deliberately, and
the reason is worth stating in the report:

**Capacitor runs the app in Android's WebView, which does not implement the
Push API.** WebView does not run service workers the way Chrome does and cannot
wake when the app is closed, so the Web Push alerting built in Phase 3 would
simply not function inside a Capacitor shell. Restoring it would mean adding
Firebase Cloud Messaging and maintaining a second, parallel push implementation
server-side — exactly the "native FCM complexity" the brief said to avoid.

A **Trusted Web Activity** produces the same thing a user cares about — a real,
installable, sideloadable Android package — but runs the site in Chrome rather
than a WebView, so the existing Web Push works unchanged and there is one push
implementation instead of two.

### What is already done

- `public/manifest.webmanifest` — name, icons (192, 512, maskable), standalone
  display, theme colour, and a "Report an incident" shortcut.
- Service worker registered on load (`ServiceWorkerRegistrar`), with a
  deliberately **pass-through** fetch handler. Installability requires a fetch
  handler; caching an emergency map does not, and a responder shown stale
  incidents has no way to know. Offline queueing will add a narrow handler for
  `POST /api/reports` only.
- `/.well-known/assetlinks.json` served from environment variables.

### Remaining steps (need the app deployed to HTTPS first)

```bash
# 1. Deploy to Vercel and note the URL.
# 2. Generate the TWA project:
npx @bubblewrap/cli init --manifest https://<your-domain>/manifest.webmanifest
npx @bubblewrap/cli build

# 3. Read the signing fingerprint Bubblewrap created:
keytool -list -v -keystore android.keystore -alias android
```

Set `TWA_SHA256_FINGERPRINT` (and `TWA_PACKAGE_NAME` if changed) in Vercel,
redeploy, then install the APK. A missing or mismatched fingerprint shows as a
Chrome address bar across the top of the app — that is the usual symptom.

**Toolchain note:** the Android Gradle Plugin needs JDK 21, and system JDKs 23
and 25 are both too new. Android Studio bundles a suitable one:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

---

## Deferred — carried forward deliberately

Not blocked by anything, and nothing depends on them. Listed here so they stay
visible rather than being quietly forgotten.

| Item | Phase | Why deferred | Note |
|---|---|---|---|
| Live map updates (Pusher / SSE) | 3 | The map already polls every 60s, which a demo cannot distinguish from push. Pusher's free tier needs an account; SSE holds a serverless function open. | Tighten the poll to ~15s as the cheap win. |
| Report media upload | 3 | R2 needs a payment method; Vercel Blob is the free substitute. | `Report.mediaUrls` exists and is always `[]`. |
| Boundary polygon for the service area | — | Political sensitivity around depicting disputed borders; needs an authoritative source. | Bounding box is the documented stand-in. |
| Per-report evidence weighting | — | Hearsay is currently discounted in the quality factor. | A relayed account is not a weak observation, it is not an observation; the cleaner fix is to weight its contribution to *evidence*, which needs per-report evidence weighting the formula does not yet have. |

---

## Running costs

Everything this project uses has a free tier that needs no payment method:

| Service | Tier | Card required |
|---|---|---|
| Neon Postgres | Free | No |
| Gemini API | Free | No |
| USGS earthquake feed | Public, keyless | No |
| Esri basemap tiles | Public, keyless | No |
| Web Push | No service involved | No |
| Vercel (Hobby) | Free, non-commercial | No |

Cloudflare R2 was the original plan for media storage but requires a payment
method even on its free tier; Vercel Blob (included with Hobby) is the
substitute. Vercel Hobby is restricted to non-commercial personal use, which a
capstone satisfies.
