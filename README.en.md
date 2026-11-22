# Feedback Hub

**A shared feedback box for any app — users give feedback, AI reads it and makes the change, a human approves.**

*[Tiếng Việt](README.md)*

Feedback Hub is a small service (Next.js + PostgreSQL) plus a JavaScript widget. You add **one `<script>` tag** to your app; users press a 💡 button to give feedback about **features**, **content**, **bugs**, or to ask a **question**. The feedback lands in the hub, where:

- **people** read, reply and triage; or
- **AI (Claude Code)** picks the item up, edits the code, builds, ships the result — then **asks the submitter** when something is unclear and **waits for their acceptance**.

> The idea: software shouldn't be shaped only by developers in a room, but **evolve with the intent of its own users** — customers, domain experts, business analysts, and usage data. AI reads, proposes and does; developers review and handle the hard parts.

It was extracted from DGXL (an internal app by the author), where this loop has run daily with real users, and generalised so **any app or developer can use it**.

## Why

| | |
|---|---|
| **15-minute integration** | One token-signing endpoint (~10 lines; Node/Python/PHP/Go examples) + one `<script>` tag. No change to your app's database |
| **One standard for many apps** | Shared data model, statuses and API → one console for all apps; reuse tooling instead of rebuilding a feedback box |
| **Works for content, not only features** | Point at the element, select text to propose "before → after", attach a content record id (`contentRef`) |
| **AI acts, but not unchecked** | `collect` (record only) or `execute` (AI does the work); deliver as `branch` (awaits review) or `deploy` (backup → deploy → health check → auto-rollback); plan approval before edits; **AI's "done" must come with a verifiable string** the worker greps for in the running build |
| **Humans stay in the loop** | AI asks back when ambiguous; the submitter **accepts "correct / not quite"** (machines cannot fill this in); a **Stop** button |
| **Matches your brand** | Colours, radius, font, position, labels, icon, dark mode; `--fh-*` CSS variables pierce the Shadow DOM |
| **One console for dozens of projects** | **Overview** dashboard (daily trends, what needs attention, which project is piling up), a **notification bell** for new feedback and bugs, project search, an approval step before anything reaches the AI |
| **Many people, many projects** | Per-project roles (manager / viewer), read-only keys for a project owner's Claude Code, **email + chat webhooks** (Slack, Discord, Teams, Mattermost…) on new feedback |
| **Self-hosted, open source** | Docker Compose, data stays with you. MIT licence |

## How it works

```
 Your app                            Feedback Hub                      Handlers
┌─────────────────┐  signed token ┌───────────────────┐  worker key  ┌─────────────────────┐
│ <script widget> │ ────────────▶ │ user API          │ ◀─────────── │ worker: Claude Code │
│ 💡 button +     │   feedback    │ PostgreSQL        │              │ edits/builds/ships  │
│ feedback drawer │ ◀──────────── │ admin console     │ ◀─────────── │ MCP / CLI: Claude   │
│ + token endpoint│   webhook     └───────────────────┘ operator key │ works by hand       │
└─────────────────┘                                                  └─────────────────────┘
```

Status flow: `pending` → `reviewing` → (`awaiting_user` ⇄ asking the submitter) → `deploying` → `done` | `rejected`. Details: [docs/SPEC.md](docs/SPEC.md) *(Vietnamese)*.

## Quick start

### 1. Run the hub (5 min)

Requires Docker + Docker Compose v2.

```bash
git clone https://github.com/Lampx83/FeedbackHub.git
cd FeedbackHub
cp .env.example .env
# Fill POSTGRES_PASSWORD, AUTH_SECRET, HUB_ENCRYPTION_KEY (each: openssl rand -base64 32)
# and HUB_ADMIN_EMAIL / HUB_ADMIN_PASSWORD (first admin account)
docker compose up -d --build
curl -s http://127.0.0.1:3100/api/health        # {"ok":true}
```

Open `http://127.0.0.1:3100` and sign in. For a real server (HTTPS, backups): [docs/DEPLOY.md](docs/DEPLOY.md).

### 2. Create a project and embed it

Console → **Projects** → add a project (slug e.g. `my-app`, your app's origin) → copy the **signing secret**. Then:

```js
// Your app's server — only signed-in users get a token
app.get("/api/feedback-token", requireLogin, async (req, res) => {
  const token = await new SignJWT({ prj: "my-app", uid: String(req.user.id), name: req.user.name, role: req.user.role })
    .setProtectedHeader({ alg: "HS256" }).setAudience("feedback-hub")
    .setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.FEEDBACK_HUB_SECRET));
  res.json({ token });
});
```

```html
<script src="https://feedback.example.com/widget.js"
        data-project="my-app" data-token-url="/api/feedback-token" defer></script>
```

Done — signed-in users see the 💡 button. Next.js, Python, PHP, Go, anonymous mode and webhooks: [docs/INTEGRATION.md](docs/INTEGRATION.md).

### 3. (Optional) Let AI do the work

A project starts in `collect` mode (record only). To let Claude Code act:

- **Manually with Claude** — attach the [MCP server](mcp/README.md) to Claude Code/Desktop: *"Fetch the new feedback of my-app and fix it"*.
- **Fully automatic** — run the [worker](worker/README.md) from cron: it claims the oldest item, lets Claude Code edit, builds, verifies, then delivers a branch or deploys.

Read [docs/OPERATIONS.md](docs/OPERATIONS.md) and [docs/SECURITY.md](docs/SECURITY.md) **before** enabling `execute` — the AI reads text typed by users, so the boundaries matter.

## What's in this repo

| Path | Contents |
|---|---|
| `src/` | Hub: user API `/api/v1`, machine API `/api/v1/machine`, admin console |
| `public/widget.js` | Embeddable widget (vanilla JS, Shadow DOM, no dependencies). `public/demo.html` to try it |
| `worker/` | Worker that processes feedback with Claude Code (Node ≥ 20, zero dependencies) |
| `mcp/` | MCP server so Claude can work by hand with an operator key |
| `deploy/` | Caddy/nginx samples, backup script |
| `docs/` | Documentation (Vietnamese) |
| `scripts/` | `mint-token.mjs` (sign a test token), `smoke.mjs` (160+ step end-to-end test) |

> The detailed documentation is currently in Vietnamese; the API reference ([docs/API.md](docs/API.md)) and code samples are language-neutral. Translations are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Local development

```bash
docker run -d --name fh-db -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=feedbackhub -p 5437:5432 postgres:16-alpine
cp .env.example .env     # DATABASE_URL=postgresql://postgres:pw@localhost:5437/feedbackhub
npm install && npx prisma migrate deploy && npm run db:seed
npm run dev              # http://localhost:3100
npm run smoke            # end-to-end test (hub must be running)
```

## Status

Version `0.1`. The core (API, state machine, worker, widget) is tested end-to-end and used in production by DGXL. **No independent security audit yet** — see the [known limitations](docs/SECURITY.md). Issues and ideas welcome — and since this is a feedback box, try embedding it in your own app and send feedback 😄.

## Licence

[MIT](LICENSE) © 2026 Lampx83
