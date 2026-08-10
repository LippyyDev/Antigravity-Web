# CLAUDE.md — Antigravity Quota Monitor

## Project Overview
- **Name**        : Antigravity Quota Monitor (Web Dashboard)
- **Description** : A web-based dashboard to monitor, manage, and display AI quota usage across multiple Antigravity/Google accounts in real-time
- **Goal**        : Replace the desktop-only AntigravityManager with a browser-accessible dashboard that shows quota per model (Gemini, Claude, GPT), account metadata, and settings — deployable on Vercel
- **Target Users**: Developers and power users who manage multiple Antigravity Google accounts and need a centralized quota overview
- **Version**     : v1.0.0
- **Status**      : Active Development

---

## Tech Stack
- **Language**        : TypeScript 5.8
- **Framework**       : Next.js 15 (App Router, Turbopack)
- **Runtime**         : React 19
- **Styling**         : Vanilla CSS (globals.css) — Neo-Brutalism design system. No Tailwind, no CSS Modules
- **UI Icons**        : lucide-react
- **Auth**            : Firebase Authentication (Google Sign-In only)
- **Database**        : Supabase (PostgreSQL) — via `@supabase/supabase-js`
- **External API**    : `cloudcode-pa.googleapis.com` (internal Google API for quota fetch)
- **Package Manager** : npm
- **Deployment**      : Vercel (planned)

---

## Commands
```bash
# Development
npm run dev       # Start dev server with Turbopack (http://localhost:3000)
npm run build     # Build for production
npm run start     # Run production build
npm run lint      # Run Next.js ESLint

# Package Management
npm install [package]   # Install new package — confirm with user first

# No test suite currently configured
```

> **Never use `yarn` or `pnpm`** — always use `npm`.

---

## Project Structure
```
Architecture: Feature-based (pages in app/, shared logic in lib/ and components/)

Antigravity Web/
├── app/
│   ├── globals.css           # SINGLE CSS file — all styles live here (Neo-Brutalism design system)
│   ├── layout.tsx            # Root layout (font, meta)
│   ├── page.tsx              # Landing / Login page (Firebase Google Sign-In)
│   ├── dashboard/
│   │   └── page.tsx          # Main dashboard — account cards, quota display, refresh all
│   ├── settings/
│   │   └── page.tsx          # User settings page (display, refresh, alert config)
│   └── api/
│       ├── auth/             # OAuth callback routes for Antigravity account connection
│       ├── quota/            # POST /api/quota/fetch — fetches quota from Google internal API
│       ├── settings/         # GET+PUT /api/settings — user settings CRUD
│       └── setup/            # GET /api/setup/check — checks if user has accounts
│
├── components/
│   ├── AccountEditModal.tsx  # Modal for editing account metadata (name, tags, desc, deadline)
│   └── ModelModal.tsx        # Modal for viewing all models and their quota details
│
├── lib/
│   ├── firebase.ts           # Firebase app + auth instance
│   ├── supabase.ts           # Supabase client instance
│   └── types.ts              # ALL shared TypeScript interfaces and utility functions
│
├── .env.local                # Local environment variables (never commit)
├── supabase-schema.sql       # DB migration SQL — run manually in Supabase SQL Editor
├── next.config.mjs           # Next.js config
└── tsconfig.json             # TypeScript config

# File placement rules:
# - New pages → app/[page-name]/page.tsx
# - New API routes → app/api/[route]/route.ts
# - Shared UI components → components/
# - Shared types and utilities → lib/types.ts
# - Never create new folders without user confirmation
```

---

## Naming Conventions
```
# Files & Folders
- Pages        : page.tsx (Next.js App Router convention)
- API Routes   : route.ts (Next.js App Router convention)
- Components   : PascalCase   → AccountEditModal.tsx, ModelModal.tsx
- Lib files    : camelCase    → firebase.ts, supabase.ts, types.ts
- Folders      : kebab-case   → account-quota-models/

# Inside Code
- Variables    : camelCase    → modelsMap, refreshingId, editingAccount
- Constants    : UPPER_SNAKE  → DEFAULT_SETTINGS, MODEL_DISPLAY_NAMES, TIER_STYLE
- Functions    : camelCase    → normalizeTier(), getQuotaStatus(), formatCountdown()
- Interfaces   : PascalCase   → AntigravityAccount, UserSettings, UserTag
- Type aliases : PascalCase   → QuotaStatus, TierKey
- CSS classes  : kebab-case   → account-card, tier-badge, quota-bar-fill

# Git Branch (if using branches)
- Feature      : feat/[feature-name]
- Bug fix      : fix/[bug-name]
- Refactor     : refactor/[what]
```

---

## Code Conventions

### General
- Follow DRY — extract to function if used more than once
- Prefer readability over cleverness
- All async functions must have try-catch with proper error handling

### TypeScript
- Strict mode enabled — no `any` types
- Always write explicit return types for non-trivial functions
- Use `interface` for object shapes (DB rows, props), `type` for unions/aliases

### Import Order
```ts
// 1. React / Next.js core
import { useState, useCallback } from 'react';
import Link from 'next/link';

// 2. External libraries
import { supabase } from '@/lib/supabase';

// 3. Internal absolute (@/)
import { AntigravityAccount, DEFAULT_SETTINGS } from '@/lib/types';
import { AccountEditModal } from '@/components/AccountEditModal';

// 4. Types only (if needed separately)
import type { UserTag } from '@/lib/types';
```

### Export Pattern
- Named exports for all components, functions, types
- Default export only for `page.tsx` and `layout.tsx`

### Error Handling
- Always use try-catch in API routes and async handlers
- Show user-friendly error messages via `setError()` state
- Clear error messages after 5 seconds with `setTimeout`

---

## Component Rules

### Order Within a Component
1. `'use client'` directive (if needed)
2. Imports
3. Interface/type definitions (props)
4. Component function
5. useState hooks
6. useRef hooks
7. useCallback / useMemo
8. useEffect
9. Handler functions
10. Return JSX
11. Named export

### Server vs Client Components
- Default: **Server Component** (API routes, layouts)
- Use `'use client'` only when component needs:
  - `useState` / `useEffect` / hooks
  - `onClick`, `onChange` or any event handlers
  - Firebase/Supabase client calls
  - Browser APIs (localStorage, window)
- **All dashboard and settings pages are `'use client'`** — they require auth state

### Props
- Always type props explicitly with an inline interface or named interface
- Never pass raw Supabase row objects directly — always use typed interfaces from `lib/types.ts`

---

## Styling Rules

### Approach
- **Single CSS file only**: `app/globals.css` — all styles live here
- **No Tailwind**, no CSS Modules, no Styled Components
- Design language: **Neo-Brutalism** — thick borders, hard box-shadows (no blur), high contrast, no border-radius (or max 2px)
- Inline styles allowed only for dynamic values (colors, widths based on quota %)

### CSS Variables (defined in globals.css)
```css
--green, --orange, --red, --blue, --purple  /* Status colors */
--mono                                        /* Monospace font family */
```

### Neo-Brutalism Rules
- Borders: `2px solid #000` or `2px solid [color]`
- Shadows: `3px 3px 0px #000` (hard offset, zero blur)
- No `border-radius` on cards and badges (use `0`)
- Font weight: 700–900 for headings and badges
- Typography: monospace for data/numbers, sans-serif for labels

### Responsive
- Cards use CSS Grid with auto-fill — controlled by `grid_layout` setting
- Minimum card width: 280px

---

## API & Data Fetching Rules

### Architecture
- All quota data fetched **client-side** from the user's browser — never from server cron
- This is intentional: each request uses the user's own IP, matching their Google account
- **Never create server-side cron jobs** that bulk-fetch quota for all accounts from one IP

### Internal Google API
- Quota endpoint: `https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`
- Fallback: `https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`
- Requires header: `User-Agent: antigravity/1.11.3`
- Access token is the user's Antigravity OAuth token (not Firebase token)

### API Route Pattern (`app/api/*/route.ts`)
```ts
// Always return consistent format:
return NextResponse.json({ success: true, data: result });
return NextResponse.json({ success: false, error: 'message' }, { status: 400 });
```

### Supabase Rules
- Client-side: use `supabase` from `@/lib/supabase`
- Always use `eq('owner_uid', uid)` to scope queries to the authenticated user
- Never expose access tokens or refresh tokens to the browser console

### State Updates After DB Writes
- After Supabase `update()`, always update local React state immediately (optimistic update)
- Pattern: `setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))`

---

## State Management Rules

### Hierarchy
1. **Local state** (`useState`) — used for everything; this app has no global state manager
2. **Lifted state** — settings and accounts state live in `dashboard/page.tsx` and passed as props

### Key State in Dashboard
- `accounts` — list of `AntigravityAccount[]` from Supabase
- `modelsMap` — `Record<accountId, AccountQuotaModel[]>` — quota per model per account
- `settings` — `UserSettings | null` — user's display/refresh preferences
- `refreshingId` / `refreshingAll` — loading state for refresh actions
- `editingAccount` — which account's modal is open

### No Global State Manager
- Do not add Zustand, Redux, or Context API without explicit user request
- All state is co-located in page components

---

## Performance Rules

### Do Not Add Unnecessary Re-renders
- Use `useCallback` for all handlers passed as props to child components
- Use `useMemo` only if a computation is measurably expensive

### Data Loading
- Load accounts and models in parallel using `Promise.all`
- Don't block rendering — show loading skeleton while fetching

### Auto Refresh
- Implemented with `setInterval` in a `useRef` — always clear on component unmount
- Minimum interval: 1 minute, default: 15 minutes

### Bundle
- Import only what is needed from libraries
- `lucide-react`: import individual icons, not the whole package

---

## Git Rules

### MANDATORY: Commit After Every Change
- Commit every meaningful change before moving to the next task
- This allows rollback if something breaks

### Commit Message Format
```
feat: [description of new feature]
fix: [description of bug fixed]
refactor: [description of refactor]
style: [CSS/visual changes]
docs: [documentation changes]
chore: [config, deps, tooling]
```

### Forbidden
- Never commit `.env.local` or any file containing secrets
- Never commit `node_modules/`
- One logical change per commit

---

## Features

### ✅ Completed & Working — Do Not Break
- [x] Firebase Google Sign-In authentication
- [x] Supabase multi-table schema (accounts, quota_models, user_settings, user_tags)
- [x] Add Antigravity account via OAuth callback (`/api/auth/antigravity-connect`)
- [x] Quota refresh per account (calls internal Google API)
- [x] Refresh All Accounts button in navbar
- [x] Account card display with avg quota bar, model count, tags, description, deadline countdown
- [x] Pinned model quota display on card (configurable in settings)
- [x] Tier badge (FREE / PRO / ULTRA / RESTRICTED) — Neo-Brutalism style, normalized from raw API value
- [x] Account edit modal (custom name, description, tags with library, deadline date)
- [x] Tag library persisted in `user_tags` table — reusable across accounts with color and suggestions
- [x] Model visibility settings (show/hide specific models across all cards)
- [x] Card display model settings (which model quotas to pin on cards)
- [x] Grid layout settings (auto / 2-col / 3-col / list / compact)
- [x] Account sort (recently used / quota overall / quota claude / quota flash)
- [x] Auto refresh timer (configurable interval, runs in browser)
- [x] Quota alert threshold setting

### 🚧 In Progress — Do Not Touch Without Confirmation
- [ ] Account detail page (`/dashboard/accounts/[id]`)

### 📋 Planned / Not Started
- [ ] Supabase RLS tied to Firebase UID (currently open policies)
- [ ] Dark mode
- [ ] Export accounts data
- [ ] Quota history chart per model

---

## Testing
- **No automated test suite** currently configured
- Manual testing via browser at `http://localhost:3000`
- Before any change: verify dashboard loads, quota refresh works, settings save correctly
- Do not add Jest/Vitest/Playwright without explicit user request

---

## Do Not

### MOST IMPORTANT
- If a request is ambiguous, **ASK FIRST** before writing code — do not assume
- Never remove features that are marked ✅ in the Features section without explicit instruction

### Files & Structure
- Do not create new folders without user confirmation
- Do not delete any file without confirmation
- Do not move files without confirmation
- Do not modify `app/globals.css` design tokens (colors, fonts) without confirmation

### Code
- Do not use `any` type in TypeScript — ever
- Do not hardcode access tokens, API keys, or secrets in source code
- Do not commit `.env.local`
- Do not install new npm packages without asking first
- Do not add Tailwind, CSS Modules, or any CSS-in-JS — styling is pure vanilla CSS only

### API & Security
- Do not create server-side cron jobs that bulk-fetch quota (IP rotation risk)
- Do not expose `access_token` or `refresh_token` to client-side console logs
- Do not bypass the `owner_uid` filter in Supabase queries
- Do not call the internal Google API (`cloudcode-pa.googleapis.com`) from server-side cron — only from user's browser session

### Removed Features — Never Re-add
- **Warmup feature** (calling `generateContent` to warm up model connections) — REMOVED. It violates Google ToS and risks account suspension. Do not re-implement under any name.

### Patterns
- Do not use `useEffect` for data fetching — use `useCallback` + explicit trigger
- Do not use inline styles for static values — use CSS classes from `globals.css`
- Do not add a global state manager (Zustand, Redux) without user request

---

## Environment Variables

### Setup
- Copy `.env.local.example` to `.env.local` for local development
- **Never commit `.env.local`** to any repository

### All Variables (all are `NEXT_PUBLIC_` — client-safe by design)
```bash
# Firebase Authentication
NEXT_PUBLIC_FIREBASE_API_KEY=           # Firebase Web API Key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=       # Firebase Auth domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=        # Firebase project ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=    # Firebase storage bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID= # Firebase messaging sender
NEXT_PUBLIC_FIREBASE_APP_ID=            # Firebase app ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=    # Firebase Analytics (optional)

# Supabase Database
NEXT_PUBLIC_SUPABASE_URL=               # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=          # Supabase public anon key (safe for client)

# App
NEXT_PUBLIC_APP_URL=                    # Base URL (http://localhost:3000 or https://yourdomain.com)
```

> **Note**: All variables are `NEXT_PUBLIC_` because this app uses client-side Firebase auth and Supabase anon key (protected by RLS). There are no server-only secrets in the current architecture.
> 
> If server-side secrets are added in the future (e.g., Supabase service role key), they must be stored as non-`NEXT_PUBLIC_` variables and accessed **only in API routes**, never in client components.
