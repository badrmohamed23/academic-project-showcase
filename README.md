# GUC Showcase

![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![TanStack Start](https://img.shields.io/badge/TanStack_Start-1.167-FF4154?logo=reactquery&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)

> Role-based academic showcase connecting GUC students, instructors & employers — TanStack Start + Supabase.

---

## ✨ Overview & Highlights

**GUC Showcase** is a full-stack, role-aware platform for the German University in Cairo that turns academic work into discoverable opportunity. Students publish projects, thesis drafts and portfolios; instructors link projects to their courses, rate and comment on student work; employers verify their company and post internships; and administrators moderate the entire ecosystem from a single console.

The system is built around **four first-class roles** (`student`, `instructor`, `employer`, `admin`), each with its own navigation, permissions and dashboards.

Core engineering decisions:

- **Supabase-compatible local data layer.** `src/lib/json-db.ts` implements a drop-in subset of the Supabase client (`auth`, `from().select/insert/update/delete/upsert`, `storage`, realtime `channel`, `functions`) backed by `localStorage`. The app runs fully offline with zero backend, then switches to real Supabase with a one-line change in `src/integrations/supabase/client.ts`.
- **Type-safe, file-based routing.** TanStack Start + TanStack Router generate a strongly typed route tree (`src/routeTree.gen.ts`), with a nested `/dashboard` layout and per-role route guards.
- **Database-enforced security.** Production schema ships with Postgres RLS policies, enums, triggers and helper functions so authorization is enforced in the database — not just the UI.
- **Domain-aware validation.** Registration and course-linking rules encode real GUC constraints (e.g. `@student.guc.edu.eg` vs `@guc.edu.eg`, bachelor-supervisor-to-course mapping).

---

## 🛠️ Tech Stack

**Frontend**

- React 19 + TypeScript 5.8
- TanStack Start / TanStack Router (SSR-ready, file-based routing) + TanStack Query
- Vite 7
- Tailwind CSS v4 + shadcn/ui (Radix primitives, New York style)
- Recharts (statistics), react-leaflet / Leaflet (location picker), react-hook-form + Zod (forms & validation), date-fns, Sonner (toasts), Lucide icons

**Backend / Data**

- Supabase — Postgres, Auth, Storage, Realtime, Edge Functions
- 20+ tables with Row Level Security, enums, indexes, triggers and notification helpers
- Local JSON database adapter for offline/demo mode

**Tooling & Deployment**

- ESLint + Prettier
- Cloudflare Workers via Wrangler (`@cloudflare/vite-plugin`, `wrangler.jsonc`)
- Package managers: Bun (`bun.lockb`) or npm (`package-lock.json`)

---

## 🚀 Key Features

- **Authentication & roles** — email/password sign-up and sign-in, OTP-based password reset, GUC domain enforcement, and role-scoped dashboards.
- **Project showcase** — create `web` / `bachelor` projects, attach files and demo videos, publish to a portfolio, edit with collaborator-aware permissions.
- **Thesis drafts** — versioned thesis uploads with owner/admin storage policies.
- **Discovery** — project search with filters/sorting, public portfolios, instructor directory, and personalized recommendations.
- **Feedback loop** — instructors rate projects (1–5) and leave threaded comments on projects, tasks and thesis drafts.
- **Collaboration** — invite collaborators, accept/reject invitations, and assign project tasks (`pending` / `postponed` / `completed`).
- **Courses & instructor linking** — admins manage courses; instructors request course links that admins approve or reject.
- **Internships** — employers post and manage internships; students search, apply, and track application status.
- **Employer verification** — companies upload tax documents for admin review before being trusted on the platform.
- **Messaging** — 1:1 conversations with normalized `user_a < user_b` uniqueness and realtime updates.
- **Notifications** — in-app notification center with unread badge, realtime bell, and per-user preferences.
- **Moderation** — flag projects with reasons, manage appeals, and toggle project visibility (`is_active`, `is_admin_active`).
- **Analytics** — role-specific statistics pages powered by Recharts.
- **Profile & theming** — avatar upload, profile editing, and light/dark theme toggle.

---

## 📁 Project Architecture / File Structure

```
.
├── src/
│   ├── routes/                  # File-based routes (TanStack Router)
│   │   ├── __root.tsx           # Root layout & providers
│   │   ├── index.tsx            # Public landing page
│   │   ├── login.tsx            # Sign in
│   │   ├── register.tsx         # Role-aware registration
│   │   ├── forgot-password.tsx  # OTP password reset
│   │   ├── dashboard.tsx        # Authenticated shell + <Outlet/>
│   │   └── dashboard.*.tsx      # Role-scoped feature pages
│   ├── components/
│   │   ├── dashboard-shell.tsx  # Sidebar, role nav, notification bell
│   │   ├── project-*.tsx        # Tasks & feedback dialogs
│   │   ├── location-picker.tsx  # Leaflet map picker
│   │   └── ui/                  # shadcn/ui component library
│   ├── lib/
│   │   ├── auth-context.tsx     # Auth provider, profile & role state
│   │   ├── json-db.ts           # Supabase-compatible local data layer
│   │   ├── database.seed.json   # Seed users, tables & storage
│   │   ├── validators.ts        # GUC email & formatting helpers
│   │   ├── messaging.ts         # Conversation helpers
│   │   └── bachelor-supervisors.ts
│   ├── integrations/supabase/
│   │   └── client.ts            # Client binding (local ↔ Supabase)
│   ├── hooks/                   # Shared React hooks
│   ├── router.tsx               # Router setup
│   ├── routeTree.gen.ts         # Generated route tree
│   └── styles.css               # Tailwind theme & design tokens
├── supabase/
│   ├── config.toml              # Local Supabase configuration
│   ├── functions/create-admin/  # Edge function for admin provisioning
│   └── migrations/              # Versioned schema, RLS, triggers
├── components.json              # shadcn/ui configuration
├── vite.config.ts               # Vite + TanStack Start config
├── wrangler.jsonc               # Cloudflare Workers deployment config
└── package.json
```

---

## ⚙️ Getting Started & How to Run

### Prerequisites

- **Node.js 20.19+ or 22.12+** (required by Vite 7)
- **Bun** (recommended, matches `bun.lockb`) or **npm**
- Optional: **Supabase CLI** and **Wrangler** for production backends / deployment

### 1. Clone & install

```bash
git clone <your-repository-url>
cd academic-project-showcase
```

Using Bun:

```bash
bun install
```

Or npm:

```bash
npm install
```

### 2. Environment variables (optional)

The app runs out of the box against the local JSON database, so **no environment variables are required for local development**. To connect a real Supabase project, create a `.env` file:

```bash
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<your-anon-publishable-key>"
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<your-anon-publishable-key>"
VITE_SUPABASE_PROJECT_ID="<project-ref>"
```

Then switch the client binding in `src/integrations/supabase/client.ts` from the local adapter to the real Supabase client.

### 3. Run locally

```bash
bun dev
# or
npm run dev
```

Open the printed URL (typically `http://localhost:5173`).

### 4. Build & preview

```bash
bun run build
bun run preview
```

### 5. Quality checks

```bash
bun run lint     # ESLint
bun run format   # Prettier
```

### 6. Optional: local Supabase backend

```bash
supabase start
supabase db reset     # applies migrations in supabase/migrations
supabase functions serve create-admin
```

### 7. Optional: deploy to Cloudflare

```bash
bun run build
bunx wrangler deploy
```

### 🔑 Demo accounts (seeded local mode)

| Role       | Email                    | Password          |
| ---------- | ------------------------ | ----------------- |
| Admin      | `admin@guc.edu.eg`       | `Admin1234!`      |
| Student    | `student@guc.edu.eg`     | `Student1234!`    |
| Instructor | `amr.elwan@guc.edu.eg`   | `Instructor1234!` |
| Employer   | `employer@acme.com`      | `Employer1234!`   |

> Seed data lives in `src/lib/database.seed.json` and is persisted under the `bug-busters.json-db.v2` localStorage key. Clear site data to reset to defaults.

---

## 💡 Future Improvements / Roadmap

1. **Full-text + vector search** — move project/internship discovery to Postgres `tsvector` or `pgvector` embeddings for semantic, skill-based matching instead of client-side filtering.
2. **Scalable file pipeline** — replace base64 localStorage storage with signed Supabase Storage uploads, background video transcoding, and CDN delivery for large media.

---

## 📄 License

Released under the MIT License.
