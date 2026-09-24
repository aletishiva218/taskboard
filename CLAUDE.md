# TaskBoard — Claude Code Guide

## Project Overview

TaskBoard is a production-grade real-time collaborative task management app (think Trello). Built as a FAANG portfolio project demonstrating:
- Real-time multi-user collaboration at scale (Socket.io + Redis pub/sub)
- Stateless JWT auth with refresh token rotation
- Google OAuth 2.0 with account linking
- Background job queue for email (Bull + Redis)
- Horizontal scaling architecture

## Tech Stack & Rationale

| Technology | Why |
|------------|-----|
| **Node.js + Express** | Mature, battle-tested, easy to reason about middleware chain |
| **Socket.io** | Handles WebSocket + polling fallback; room abstraction maps cleanly to boards |
| **PostgreSQL** | ACID transactions for card moves; relational integrity; JSONB for flexible metadata |
| **Redis** | Pub/sub for Socket.io scaling; LRU cache for board data; Bull backend; rate limiting |
| **Next.js 14 App Router** | React Server Components for layout; Client Components for interactive board UI; `output: standalone` for Docker |
| **Zustand** | Minimal, no-boilerplate state management; survives re-renders without Provider hell |
| **@hello-pangea/dnd** | React 18 + App Router compatible DnD (react-beautiful-dnd fork without SSR issues) |
| **Bull** | Redis-backed job queue with retry, backoff, and visibility (Bull Board UI) |
| **Passport.js** | Industry-standard OAuth; only used for the handshake, session destroyed immediately after |
| **Nodemailer** | Flexible SMTP; works with Mailtrap (dev), Mailgun, Resend, Gmail (prod) |
| **Docker + docker-compose** | One-command local dev; production-ready containerization |

**Why Next.js App Router over React CRA:**
- Built-in routing, layouts, code splitting
- Server Components reduce JS bundle for static content
- `output: standalone` makes Docker images small and self-contained
- No need for a separate React Router setup

**Why Express backend instead of Next.js API routes:**
- Socket.io requires a persistent Node.js process — serverless-style handlers can't maintain WebSocket connections
- Clean separation: backend can be scaled independently, reused by mobile clients
- Express middleware (rate limiting, session, passport) integrates more naturally

## Folder Structure

### Backend (`/backend/src/`)

```
/controllers    — Pure request/response logic (no business logic in routes)
/middleware     — authenticate (JWT), requireBoardAccess (role check), errorHandler
/routes         — Express Router instances, input validation via express-validator
/socket         — initSocket() sets up Socket.io with Redis adapter + all event handlers
/services       — EmailService class (template rendering + Nodemailer)
/queues         — emailQueue.js (Bull processor, preference check, handlers)
/templates      — 7 HTML email templates with {{variable}} interpolation
/utils          — jwt.js, position.js (float positioning), activity.js (fire-and-forget logger), notifications.js (create + emit)
/cron           — dueDateReminder.js (node-cron, daily 09:00 UTC)
/config         — db.js (pg-pool singleton), redis.js (3 ioredis clients), passport.js (Google strategy)
/migrations     — 001_initial_schema.sql, 002_notifications.sql, run.js (migration runner), seed.js (dev data)
```

### Frontend (`/frontend/`)

```
/app/(auth)             — login, register, callback pages (no sidebar)
/app/(dashboard)        — layout with sidebar+navbar, dashboard, board/[boardId], settings
/components/layout      — Sidebar (nav), Navbar (user dropdown + NotificationBell), LiveAvatars (presence)
/components/board       — BoardCard (grid tile), CreateBoardModal
/components/lists       — ListColumn (DnD draggable list), CreateListForm
/components/cards       — CardItem (DnD draggable card), CardDetailModal
/components/activity    — ActivityFeed (sidebar)
/hooks                  — useAuth, useBoard (CRUD + store sync), useSocket (event wiring), useDragAndDrop
/store                  — authStore (user + token, persisted to sessionStorage), boardStore (optimistic UI)
/lib                    — api.ts (axios + JWT interceptor + auto-refresh), socket.ts (singleton), utils.ts
/types/index.ts         — All TypeScript interfaces (User, Board, List, Card, Activity...)
middleware.ts           — Next.js edge middleware, checks tb-auth-check cookie
```

## How to Run Locally

```bash
# Requirements: Docker Desktop

git clone <repo>
cd taskboard
cp .env.example .env
# Edit .env — at minimum set strong JWT_SECRET, JWT_REFRESH_SECRET, SESSION_SECRET

docker-compose up --build
# First boot: ~2-3 minutes (npm install + DB migrations + seed)

# Frontend: http://localhost:3000
# Backend:  http://localhost:5000
# Login:    alice@example.com / password123
```

## How Each Major System Works

### Auth Flow
1. User POSTs `/api/auth/login` with email + password
2. Server validates, generates 15-min JWT access token + 64-byte random refresh token
3. Refresh token is SHA-256 hashed and stored in `refresh_tokens` table
4. Raw refresh token sent as httpOnly cookie (`refreshToken`)
5. Access token returned in JSON response body
6. Frontend stores access token in Zustand (sessionStorage-persisted)
7. Axios interceptor attaches `Authorization: Bearer <token>` to all requests
8. On 401 `TOKEN_EXPIRED`: interceptor calls `/api/auth/refresh` (uses cookie)
9. Server validates hash, rotates token (delete old, insert new), returns new access token
10. Frontend sets lightweight `tb-auth-check=1` cookie for Next.js middleware to read

### Google OAuth Flow
1. User clicks "Continue with Google" → frontend navigates to `/api/auth/google`
2. Passport redirects to Google consent screen
3. Google redirects to `/api/auth/google/callback?code=...`
4. Passport exchanges code for profile; runs strategy callback:
   - If `google_id` matches existing user → use that user
   - If `email` matches existing user → link `google_id` to that user (no duplicate)
   - Otherwise → create new user from Google profile
5. JWT access token generated; refresh token stored; OAuth session **immediately destroyed**
6. Backend redirects to `CLIENT_URL/callback?token=<jwt>`
7. Next.js `/callback` page reads `?token` via `useSearchParams()`, stores in Zustand, calls `router.replace('/dashboard')` to clear token from URL

### Real-time Sync Flow
1. Frontend connects socket on board page load: `getSocket()` → `socket.emit('board:join', { boardId })`
2. Server authenticates socket via JWT in `auth.token`, verifies board membership
3. Server joins socket to room `board:<boardId>`
4. When any API endpoint modifies a list/card, it calls `io.to('board:<boardId>').emit('event:name', payload)`
5. Socket.io Redis adapter fans the event to all Node.js instances
6. Every client in that room receives the event
7. Frontend socket hook (`useSocket`) updates Zustand store, which re-renders components
8. Optimistic updates: board/reorder operations update Zustand immediately before API returns

### Board Invitation Flow
Access to boards is **invite-only** — direct board URLs do not grant access to non-members.

**Inviting any user (registered or not):**
1. Board owner enters email + role in ShareBoardModal → `POST /api/boards/:boardId/members`
2. Backend generates a signed JWT invitation token (`type: 'board_invite'`, 7-day expiry)
3. Email is sent with an "Accept Invitation" button pointing to `/join?token=<jwt>`
4. If the invitee is already registered: an in-app notification is also created in the `notifications` table and emitted via `notification:new` to their `user:<id>` socket room
5. Invitee clicks the link → `/join` page decodes the JWT client-side for display
6. If not logged in: prompted to register or sign in (redirect param preserves the token)
7. After login, invitee clicks "Accept Invitation" → `POST /api/boards/join { token }`
8. Backend verifies the JWT signature, checks email matches logged-in user, inserts into `board_members`

**Key invariant:** No one is ever added to `board_members` without explicitly accepting an invitation on the `/join` page.

### In-App Notification System
- `notifications` table: `id, user_id, type, title, message, data (jsonb), is_read, created_at`
- `GET /api/notifications` — returns last 20 notifications + unreadCount
- `PATCH /api/notifications/:id/read` — mark single notification read
- `PATCH /api/notifications/read-all` — mark all read
- Real-time delivery: socket joins `user:<userId>` room on connect; server emits `notification:new` with the full notification object when one is created
- Frontend `NotificationBell` component in Navbar: bell icon with unread count badge, dropdown list, navigates to `/join?token=...` when a `board_invite` notification is clicked

### Email Queue Flow
1. API handler calls `addEmailJob('card_assigned', { userId, email, ... })`
2. Bull adds job to Redis list (non-blocking, returns immediately)
3. Queue worker (same process) processes job:
   a. Queries user's `email_notifications` and `notification_preferences`
   b. If disabled → skip (log, mark complete)
   c. If enabled → render HTML template, call `EmailService.send()`
   d. On failure → retry with exponential backoff (3 attempts: 2s, 4s, 8s)

### Next.js Middleware Route Protection
1. `middleware.ts` runs at the edge on every non-static request
2. Checks for `tb-auth-check` cookie (set on login/OAuth; 7-day max-age)
3. Protected paths (`/dashboard`, `/board`, `/settings`): redirect to `/login` if no cookie
4. Auth paths (`/login`, `/register`): redirect to `/dashboard` if cookie exists
5. The cookie is **not** the JWT — it's a simple presence marker. Actual JWT validation happens in the Express middleware on every API call.

> Note: The middleware can't read Zustand/sessionStorage (server context). The lightweight cookie is the workaround.

## Environment Variables Reference

See `backend/.env.example` and `frontend/.env.local.example` for full lists.

Critical for production:
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `UNSUBSCRIBE_SECRET` — must be cryptographically random, ≥32 chars
- `REDIS_PASSWORD` — always set in production
- `SESSION_SECRET` — for express-session (OAuth handshake only)
- `GOOGLE_CLIENT_ID/SECRET` — from Google Cloud Console

## Common Commands

```bash
# Run backend unit tests
cd backend && npm test

# Run migrations manually (outside Docker)
cd backend && DATABASE_URL=postgresql://... node src/migrations/run.js

# Seed development data
cd backend && DATABASE_URL=postgresql://... node src/migrations/seed.js

# Load test (requires k6 CLI)
k6 run k6/load-test.js

# Bull Board (email queue monitor)
open http://localhost:5000/admin/queues
# Add header: x-admin-secret: <ADMIN_SECRET from .env>

# Rebuild a single service
docker-compose up --build app

# Follow backend logs
docker-compose logs -f app

# Access PostgreSQL directly
docker exec -it taskboard-postgres psql -U taskboard -d taskboard
```

## Next.js-Specific Notes

### Why Client Components for Board Data
Board, list, and card data requires the JWT access token from Zustand, which lives in `sessionStorage`. Server Components execute on the server and cannot access `sessionStorage`. All interactive board components are `'use client'`.

### SSR Hydration Gotchas
1. **Socket.io**: `getSocket()` checks `typeof window` before accessing sessionStorage. Never call it in a Server Component or during SSR.
2. **@hello-pangea/dnd**: `DragDropContext` and `Droppable` must be in Client Components. SSR renders static HTML; hydration would mismatch draggable IDs.
3. **Zustand persist**: Uses `sessionStorage` (not `localStorage`) — cleared on tab close, slightly more secure. The `partialize` option limits what gets persisted.

### Standalone Docker Output
`output: 'standalone'` in `next.config.js` makes Next.js copy only the necessary files into `.next/standalone/`. The Docker `runner` stage copies this folder + static assets. Result: a lean image (~150MB vs ~800MB for a naive copy).

## Verified Functionality Status

All features below have been code-audited and confirmed working (last audit: 2026-05-18, token system re-audited 2026-05-18).

### ✅ Working Correctly
| Feature | Notes |
|---------|-------|
| Email/password auth (register, login, logout) | Token lifecycle verified |
| JWT access token refresh (15-min expiry) | Interceptor in `api.ts` uses Zustand store — fixed stale-token overwrite bug |
| Refresh token rotation | SHA-256 hash stored in DB, raw token in httpOnly cookie |
| Google OAuth 2.0 | Profile, link, new user flows all working; session destroyed post-handshake |
| Forgot password / reset password | Signed token, 1-hour expiry, invalidates refresh tokens on success |
| Board CRUD (create, rename, delete) | Cache invalidated on all mutations |
| List CRUD + drag-to-reorder | Socket events wired: `list:created/updated/deleted/reordered` |
| Card CRUD + drag within/between lists | Socket events wired: `card:created/updated/deleted/moved/reordered` |
| Card labels (add/remove) | Toggle UI in CardDetailModal, socket-synced |
| Card assignees (add/remove) | Board-member check enforced, notification email sent |
| Card due dates | ISO date stored, overdue/due-soon badges in CardItem |
| Card comments (add/delete) | Real-time via `comment:created/deleted` socket events |
| Card attachments (upload/delete) | Multer disk storage, served from `/uploads/`, lightbox preview for images |
| Board activity feed | Last 50 entries, fetched on board load |
| Card-level activity | Last 30 entries, shown in CardDetailModal activity tab |
| Favourite boards | Toggle via star, user-specific (not cached), shown in dashboard |
| Board export (CSV + JSON) | Full export: board name, members, lists, cards (description, due date, labels, assignees), comments, attachments; download triggered client-side via fetch + Blob |
| Board sharing (invite by email) | JWT invite token, 7-day expiry, in-app + email notification |
| Accept invitation (`/join`) | Email match enforced, already-member case handled |
| Role-based access control | Owner/editor/viewer enforced server-side via `requireBoardAccess` |
| Viewer read-only UI | All create/edit/delete controls hidden for viewer role |
| Real-time presence (LiveAvatars) | Online users tracked per board room, join/leave events; board:join re-emitted on every connect to survive token-expiry reconnects |
| In-app notifications | Real-time via `notification:new` socket; unread count from DB count query |
| Email notifications | Bull queue, preference checks, 9 email types, retry with exponential backoff |
| Due date reminders (cron) | Daily at 09:00 UTC, queries assignees due within 24 hours |
| Settings: profile name update | PATCH `/api/users/profile` |
| Settings: profile photo upload/remove | POST `/api/users/avatar` (multer, 5 MB, images only, stored in `uploads/avatars/`); DELETE `/api/users/avatar` (nulls DB field + deletes file); old file auto-deleted on replace; avatar shown in Settings and Navbar (falls back to initials) |
| Settings: change password | Invalidates all refresh tokens; hidden for OAuth-only users |
| Settings: notification preferences | Granular toggles (board_invite, card_assigned, due_date, activity, role_changed) |
| Board print / PDF | "Generate PDF" button fetches full JSON export, uses `html2pdf.js` to render a professionally designed HTML document (cover page with indigo banner + stats grid + members grid, then lists with indigo headers and detailed cards including labels, due date badges, assignees, description, comments, attachments), and auto-downloads as `<board-name>_board.pdf` — no print dialog, no new tab |
| Board Chat | Real-time chat panel for all board members. "Chat" button in board header opens a slide-over panel (mobile) or static side panel (desktop) with unread count badge. Messages stored in `board_messages` table (`content` nullable when attachment present, `edited_at` nullable timestamptz). REST: `GET /api/boards/:boardId/messages` (last 50, paginated by `?before=<id>`), `POST /api/boards/:boardId/messages` (text), `POST /api/boards/:boardId/messages/upload` (multipart file + optional caption, 10 MB limit), `PATCH /api/boards/:boardId/messages/:messageId` (edit own text message within 1 minute — server enforces age guard; file-only messages cannot be edited). Socket: server emits `chat:message` on every new message; `chat:message_updated` on edit; `chat:typing` / `chat:stop_typing` broadcast to others in the board room. Frontend: `BoardChat.tsx`; `chatMessages` + `chatUnreadCount` + `typingUsers` + `updateChatMessage` in boardStore; `chat:message` / `chat:message_updated` / `chat:typing` / `chat:stop_typing` listeners in `useSocket`; typing indicator emitted on every keystroke (2 s idle timeout to stop); animated dots + "X is typing…" shown above input; file attach button opens hidden file input with preview strip; per-second tick drives 1-minute edit window — on hover of own text messages the pencil "Edit" button appears, clicking opens inline textarea with Save/Cancel; Escape closes; "(edited)" label shown in bubble after a successful edit; `editedAt` preserved across page reload via GET messages. |
| Next.js middleware route guard | `tb-auth-check` cookie; edge-compatible |
| Fully responsive UI | All pages and components adapt to mobile/tablet/desktop; collapsible sidebar drawer on mobile with `md:hidden` hamburger; board header buttons collapse to icon-only on mobile; activity panel and card modal slide-over on mobile; notification dropdown width clamped to viewport; list columns use scroll-snap on mobile; smooth CSS animations throughout (`animate-fade-in`, `animate-slide-up`, `animate-slide-in-left/right`, `animate-scale-in` in `globals.css`) |

### ⚠️ Known Limitations (not bugs — design trade-offs)
| Limitation | Improvement |
|------------|-------------|
| Card description is plain text | Rich text editor (Tiptap/Slate) |
| Attachments stored on disk | S3/R2 with presigned URLs for production |
| No full-text search | PostgreSQL `tsvector` or Elasticsearch |
| No workspaces/organizations | Workspaces layer above boards |
| No @mentions in comments | Comments with mention notifications |
| Float positions degrade over time | LexoRank string positions |
| OAuth session stored in Redis | Move to stateless PKCE flow |
| No 2FA | TOTP via `otplib` |
| Bull Board unprotected in dev | Add RBAC, move to separate admin service |
| Activity feed not live-updated | Requires manual refresh or page reload |

## Bugs Fixed (2026-05-18 Audit)

| Bug | Severity | File(s) | Fix |
|-----|----------|---------|-----|
| `card:deleted` socket event missing `listId` | Critical | `cardController.js` | Added `list_id` to SELECT, included in socket payload |
| Board cache missing `is_favourite` for user | High | `boardController.js` | Query `favourite_boards` per-user when serving cached board |
| `hasPassword` used `!google_id` (wrong for linked accounts) | High | `routes/auth.js` | Check `password_hash IS NOT NULL` from DB |
| `unreadCount` computed from LIMIT 20 subset | Medium | `notificationController.js` | Separate `COUNT(*)` query for unread |
| Unused `calculatePosition` import | Low | `listController.js` | Removed |
| `useSocket.ts` imported unused `addActivity` | Medium | `useSocket.ts` | Removed from destructuring |
| `socket.ts` read token from sessionStorage directly | Medium | `socket.ts` | Now uses `useAuthStore.getState().accessToken` |
| Token refresh overwrote Zustand with stale expired token | Critical | `api.ts` | `useAuthStore.getState().setToken(newToken)` replaces manual sessionStorage patch |
| Refresh failure didn't clear `tb-auth-check` cookie → infinite redirect loop | Critical | `api.ts` | Added `document.cookie = 'tb-auth-check=; ...; max-age=0'` before redirect to `/login` |
| Middleware set `?from=` but login/register read `?redirect=` → redirect-after-login broken | Medium | `middleware.ts` | Changed `from` → `redirect` to match what login/register pages consume |
| Login/register/refresh responses returned incomplete User (missing `emailNotifications`, `notificationPreferences`, `hasPassword`) | Medium | `authController.js` | All three endpoints now return the full User object matching the TypeScript `User` interface |
| Role change not reflected in real-time — user stayed in viewer UI until page refresh | High | `boardController.js`, `useSocket.ts` | `updateMemberRole` now emits `member:role_updated` to `user:<id>` room; `useSocket` listens and calls `updateBoard()` to update `currentBoard.role` in boardStore |
| Comment/attachment not reflected in card after posting when socket is stale | High | `CardDetailModal.tsx` | `handleAddComment` and `handleFileChange` now use the API response to update state immediately; socket event handlers deduplicate by id to prevent double entries |
| Socket reconnect with expired access token fails silently — events never received | High | `socket.ts`, `api.ts` | Added `updateSocketToken(newToken)` exported from `socket.ts`; called in `api.ts` after every successful token refresh so the socket reconnects with the fresh token |
| Online presence (LiveAvatars) gone after page refresh when token was expired at reload time | High | `useSocket.ts` | Socket.io clears its send buffer on disconnect; buffered `board:join` was lost after auth failure + reconnect. Fixed by listening for the `connect` event and emitting `board:join` from there (re-fires on every successful connection including token-refresh reconnects) |
| 401 with no/invalid token not redirecting to login — showed "Failed to load boards" instead | High | `api.ts` | Interceptor only caught `code === 'TOKEN_EXPIRED'`; backend returns no `code` for missing/invalid tokens. Fixed by catching all 401s from non-auth endpoints and attempting refresh — on failure, clears state and redirects to `/login` |
| Online presence gone on page refresh — `getSocket()` destroyed the connecting socket | Critical | `socket.ts` | `getSocket()` checked `socket?.connected` and destroyed the socket if not yet connected; multiple callers (NotificationBell + useSocket) during the same render cycle caused the last caller to destroy the first's socket along with its `connect` listener, so `board:join` was never emitted. Fixed by returning the existing socket unconditionally — never destroy it mid-connection; `updateSocketToken` handles token rotation |
| Board export missing comments, attachments, and members | High | `boardController.js` | `exportBoard` only fetched cards with labels/assignees. Fixed by adding parallel queries for `card_comments`, `card_attachments`, and `board_members`; JSON export nests comments + attachments under each card; CSV adds Comments and Attachments columns |

## Known Limitations & Future Improvements

| Limitation | Improvement |
|------------|-------------|
| Card description is plain text | Rich text editor (Tiptap/Slate) |
| Attachments stored on disk | S3/R2 file upload with presigned URLs |
| No search | Full-text search via PostgreSQL `tsvector` or Elasticsearch |
| Single board per team | Workspaces/organizations layer |
| No @mentions in comments | Comments table with @mention notifications |
| Position floats degrade | Implement full LexoRank string positions |
| OAuth session in Redis | Move to stateless PKCE flow to eliminate session entirely |
| No 2FA | TOTP via `otplib` |
| Bull Board unprotected in dev | Add RBAC, move to separate admin service |
| Email templates are basic | Responsive MJML templates |
