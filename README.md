# TaskBoard

A production-grade real-time collaborative task board built with Next.js 14, Socket.io, PostgreSQL, and Redis.

## Features

- **Real-time collaboration** — drag cards, rename lists, and invite teammates. All changes sync instantly via Socket.io.
- **Live presence** — see who is currently viewing a board with live avatar indicators.
- **Drag & drop** — reorder cards within and between lists; reorder lists themselves.
- **Auth** — JWT (15min access + 7-day refresh token rotation) + Google OAuth 2.0.
- **Board permissions** — Owner / Editor / Viewer roles per board.
- **Card details** — description, due dates, color labels, assignees.
- **Activity feed** — last 50 actions with timestamps and user avatars.
- **Email notifications** — 7 event types, per-user preferences, signed unsubscribe links.
- **Background email queue** — Bull + Redis: retries, exponential backoff, never blocks API.
- **Due date reminders** — daily cron job at 09:00 UTC for cards due in 24h.
- **Rate limiting** — per-user via Redis.
- **Redis caching** — board data cached, invalidated on writes.
- **Horizontal scaling** — stateless API, Redis pub/sub Socket.io adapter.
- **Dockerized** — all services via docker-compose with health checks.
- **Load tested** — k6 script for 200 concurrent users.

## Architecture

```
Browser (Next.js 14) ──HTTP/WS──► Express API ──► PostgreSQL
                                       │
                                    Redis
                                  ├── pub/sub (Socket.io adapter)
                                  ├── cache (board data, 60s TTL)
                                  ├── sessions (OAuth handshake only)
                                  ├── rate limiting
                                  └── Bull email queue ──► SMTP
```

## Quick Start

```bash
# 1. Clone and enter project
cd taskboard

# 2. Copy environment files
cp .env.example .env

# 3. Build and start all services
docker-compose up --build

# Services:
#   Backend API: http://localhost:5000
#   Frontend:    http://localhost:3000
#   PostgreSQL:  localhost:5432
#   Redis:       localhost:6379
```

Default seed users (password: `password123`):
- `alice@example.com` (board owner)
- `bob@example.com` (board editor)

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URIs: `http://localhost:5000/api/auth/google/callback`
4. Copy Client ID and Client Secret to `.env`:
   ```
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

## Environment Variables

### Backend (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `REDIS_URL` | Redis connection string with auth | — |
| `JWT_SECRET` | Access token signing key (≥32 chars) | — |
| `JWT_REFRESH_SECRET` | Refresh token signing key (≥32 chars) | — |
| `SESSION_SECRET` | Express session key for OAuth | — |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | — |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URL | `http://localhost:5000/api/auth/google/callback` |
| `SMTP_HOST` | SMTP server hostname | `smtp.mailtrap.io` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `EMAIL_FROM` | Sender address | `TaskBoard <no-reply@taskboard.com>` |
| `UNSUBSCRIBE_SECRET` | JWT signing key for unsubscribe links | — |
| `ADMIN_SECRET` | Header secret for /admin/queues | — |
| `CLIENT_URL` | Frontend URL for CORS and redirects | `http://localhost:3000` |

### Frontend (`frontend/.env.local`)

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `http://localhost:5000` |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io server URL | `http://localhost:5000` |

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register with email + password |
| POST | `/api/auth/login` | Login, returns access token + refresh cookie |
| POST | `/api/auth/refresh` | Rotate refresh token, returns new access token |
| POST | `/api/auth/logout` | Invalidate refresh token |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/auth/google` | Redirect to Google OAuth |
| GET | `/api/auth/google/callback` | OAuth callback → redirect to `/callback?token=` |
| GET | `/api/auth/unsubscribe?token=` | Unsubscribe from all emails |

### Boards
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/boards` | List user's boards |
| POST | `/api/boards` | Create board |
| GET | `/api/boards/:id` | Get board with lists, cards, members |
| PATCH | `/api/boards/:id` | Rename board |
| DELETE | `/api/boards/:id` | Delete board (owner only) |
| POST | `/api/boards/:id/members` | Invite member by email |
| PATCH | `/api/boards/:id/members/:userId/role` | Change member role |
| DELETE | `/api/boards/:id/members/:userId` | Remove member |
| GET | `/api/boards/:id/activity` | Get last 50 activity entries |

### Lists
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/boards/:boardId/lists` | Get lists |
| POST | `/api/boards/:boardId/lists` | Create list |
| PATCH | `/api/boards/:boardId/lists/:id` | Rename list |
| DELETE | `/api/boards/:boardId/lists/:id` | Delete list |
| POST | `/api/boards/:boardId/lists/reorder` | Reorder lists |

### Cards
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/boards/:boardId/cards` | Create card |
| GET | `/api/boards/:boardId/cards/:id` | Get card detail |
| PATCH | `/api/boards/:boardId/cards/:id` | Update card (name, description, due date) |
| DELETE | `/api/boards/:boardId/cards/:id` | Delete card |
| PATCH | `/api/boards/:boardId/cards/:id/move` | Move card to different list |
| POST | `/api/boards/:boardId/cards/reorder` | Reorder cards within a list |
| POST | `/api/boards/:boardId/cards/:id/assignees` | Assign user |
| DELETE | `/api/boards/:boardId/cards/:id/assignees/:userId` | Remove assignee |
| POST | `/api/boards/:boardId/cards/:id/labels` | Add label |
| DELETE | `/api/boards/:boardId/cards/:id/labels/:labelId` | Remove label |

### Users
| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/users/profile` | Update name |
| PATCH | `/api/users/change-password` | Change password (non-OAuth users) |
| PATCH | `/api/users/notification-preferences` | Update notification prefs |

## WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `board:join` | `{ boardId }` | Join board room (authenticated) |
| `board:leave` | `{ boardId }` | Leave board room |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `board:online_users` | `{ boardId, users[] }` | Current online users on join |
| `user:joined` | `{ user, boardId }` | Someone joined the board |
| `user:left` | `{ userId, boardId }` | Someone left the board |
| `list:created` | `{ list, userId }` | New list created |
| `list:updated` | `{ list, userId }` | List renamed |
| `list:deleted` | `{ listId, userId }` | List deleted |
| `lists:reordered` | `{ orderedIds, userId }` | Lists reordered |
| `card:created` | `{ card, userId }` | New card created |
| `card:updated` | `{ card, userId }` | Card updated |
| `card:deleted` | `{ cardId, boardId, userId }` | Card deleted |
| `card:moved` | `{ card, oldListId, newListId, position, userId }` | Card moved |
| `cards:reordered` | `{ listId, orderedIds, userId }` | Cards reordered |

## Email Notifications

| Trigger | Template | Preference Key |
|---------|----------|----------------|
| Invited to a board | `board-invite.html` | `board_invite` |
| Card assigned to you | `card-assigned.html` | `card_assigned` |
| Assigned card due in 24h | `due-date-reminder.html` | `due_date` |
| Assigned card moved | `card-moved.html` | `activity` |
| Activity on assigned card | `activity-update.html` | `activity` |
| Board role changed | `role-changed.html` | `role_changed` |
| First Google OAuth login | `welcome.html` | (always sent) |

## Common Commands

```bash
# Run tests
cd backend && npm test

# Run migrations manually
cd backend && DATABASE_URL=... node src/migrations/run.js

# Seed development data
cd backend && DATABASE_URL=... node src/migrations/seed.js

# Run load test (requires k6 installed)
k6 run k6/load-test.js

# Access Bull Board (email queue monitor)
# Header: x-admin-secret: your_admin_secret
curl -H "x-admin-secret: your_admin_secret" http://localhost:5000/admin/queues

# View logs
docker-compose logs -f app

# Rebuild single service
docker-compose up --build app
```

## Next.js Notes

- **App Router only** — no `pages/` directory. All routes in `app/`.
- **Client Components** for all board/card/list data — requires auth token from Zustand (sessionStorage).
- **Server Components** only for static layout wrappers and the root layout.
- **Socket.io client** initialized as singleton in `lib/socket.ts` — avoids multiple connections on re-render.
- **@hello-pangea/dnd** used for drag and drop (forked from react-beautiful-dnd, works with React 18 + App Router without SSR issues).
- **`output: 'standalone'`** in next.config.js enables self-contained Docker deployment.
- **Middleware** (`middleware.ts`) checks `tb-auth-check` cookie (set on login/OAuth) for fast edge-level route protection without verifying the JWT.

## Load Testing

```bash
# Install k6: https://k6.io/docs/getting-started/installation/
# Ensure seed users exist (alice@example.com, bob@example.com, password123)

k6 run k6/load-test.js

# Custom API URL
BASE_URL=https://your-api.com k6 run k6/load-test.js

# Results saved to load-test-results.json
```

## Screenshots

_[Board view screenshot]_
_[Dashboard screenshot]_
_[Card detail modal screenshot]_

---

## Project Structure

```
/backend/src
  /controllers    — Request handlers (auth, boards, lists, cards)
  /middleware     — authenticate, requireBoardAccess, errorHandler
  /models         — (DB queries are inline in controllers for simplicity)
  /routes         — Express routers
  /socket         — Socket.io init + event handlers
  /services       — EmailService (Nodemailer)
  /queues         — Bull emailQueue with processor
  /templates      — 7 HTML email templates
  /utils          — JWT, position, activity logger
  /cron           — Due date reminder job
  /config         — db.js (pg-pool), redis.js, passport.js
  /migrations     — SQL schema + run.js migration runner + seed.js

/frontend
  /app/(auth)     — login, register, callback pages
  /app/(dashboard)— dashboard, board/[boardId], settings pages
  /components     — board, lists, cards, activity, layout, ui
  /hooks          — useAuth, useBoard, useSocket, useDragAndDrop
  /store          — authStore (Zustand), boardStore (Zustand)
  /lib            — api.ts (axios + interceptors), socket.ts, utils.ts
  /types          — TypeScript interfaces
```
