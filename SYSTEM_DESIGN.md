# TaskBoard — System Design

## Architecture Overview

```
                          ┌─────────────────────────────────┐
                          │         Client Browser           │
                          │  Next.js 14 (App Router)        │
                          │  Zustand · Axios · Socket.io     │
                          └───────────┬─────────────────────┘
                                      │ HTTP/WebSocket
                          ┌───────────▼─────────────────────┐
                          │      Express.js API Server       │
                          │  (Node.js · Passport · JWT)      │
                          │                                  │
                          │  ┌────────────┐ ┌────────────┐  │
                          │  │ REST API   │ │ Socket.io  │  │
                          │  │ Routes     │ │ Server     │  │
                          │  └─────┬──────┘ └─────┬──────┘  │
                          └────────┼───────────────┼─────────┘
                                   │               │
              ┌────────────────────┼───────────────┼────────────────┐
              │                    │               │                │
   ┌──────────▼──────┐    ┌────────▼───────────────▼──────┐   ┌────▼──────────┐
   │   PostgreSQL 15  │    │           Redis 7             │   │  Bull Queue   │
   │                  │    │                               │   │  (Email Jobs) │
   │  Users           │    │  ┌──────────┐ ┌───────────┐  │   │               │
   │  Boards          │    │  │ Pub/Sub  │ │  Cache    │  │   │  ┌──────────┐  │
   │  Lists           │    │  │ Adapter  │ │  Sessions │  │   │  │Nodemailer│  │
   │  Cards           │    │  │(Socket.io│ │  Rate     │  │   │  │  SMTP    │  │
   │  Activity Logs   │    │  │ scaling) │ │  Limiting │  │   │  └──────────┘  │
   └──────────────────┘    │  └──────────┘ └───────────┘  │   └───────────────┘
                           └───────────────────────────────┘
```

## Technology Decisions

### PostgreSQL over MongoDB
- **ACID transactions**: Card moves require updating both position and list_id atomically.
- **Complex queries**: Activity feed joins users + logs; board data joins 5 tables with aggregations.
- **Relational integrity**: Foreign keys prevent orphaned cards/lists. MongoDB lacks this without extra app logic.
- **JSONB**: Used for `notification_preferences` and `metadata`, giving document flexibility within relational structure.
- **Trade-off**: PostgreSQL requires schema migrations; MongoDB allows schemaless iteration. For a task board with stable entities, the relational guarantees outweigh flexibility.

### Redis pub/sub for Socket.io scaling
Socket.io by default uses in-memory state — only sockets connected to the **same Node.js process** can receive events. When scaled horizontally:
- Node A handles Alice's connection; Node B handles Bob's connection.
- Alice moves a card → Node A emits to room `board:123` → only Node A's sockets receive it.
- Bob on Node B sees nothing.

Redis pub/sub solves this: `@socket.io/redis-adapter` makes every Node.js instance subscribe to the same Redis channel. When Node A publishes an event, Redis fans it out to all instances, which forward it to their connected sockets.

**Why ioredis over node-redis**: ioredis handles reconnection, cluster mode, and pipeline operations more robustly. Requires separate client instances for pub and sub (Redis protocol limitation).

### Bull queue for email
- **Non-blocking**: Email I/O (SMTP handshake, TLS, DNS) can take 100–500ms. Queuing ensures API response is immediate.
- **Retry with backoff**: SMTP servers fail transiently. Bull retries 3× with exponential backoff.
- **Persistence**: Jobs survive server restarts (stored in Redis).
- **Visibility**: Bull Board gives real-time job monitoring.
- **Alternative**: Simple `setImmediate` or `process.nextTick` would lose jobs on crash.

### Next.js App Router + Express (not Next.js API routes)
Socket.io requires a **persistent Node.js HTTP server**. Next.js API routes are serverless-style functions — no persistent process means no Socket.io server. The separation also gives:
- Independent scaling of API vs. frontend.
- Clear separation of concerns (backend owns DB, auth, queues; frontend owns UI).
- Backend can be reused by mobile clients.

### Client Components for board data
Board/list/card data requires the JWT access token from Zustand (sessionStorage). Server Components run on the server and cannot access sessionStorage. All interactive board components are Client Components using axios.

---

## Sequence Diagrams

### 1. Card Move Event

```
User A          Next.js         Express         Redis           User B
  │                │               │               │               │
  │  drag card     │               │               │               │
  │───────────────►│               │               │               │
  │                │ PATCH /cards/:id/move         │               │
  │  optimistic    │──────────────►│               │               │
  │  UI update     │               │ UPDATE cards  │               │
  │                │               │──────────────►│(PostgreSQL)   │
  │                │               │◄──────────────│               │
  │                │               │ invalidate    │               │
  │                │               │ board cache   │               │
  │                │               │──────────────►│(Redis DEL)    │
  │                │               │ publish       │               │
  │                │               │ card:moved    │               │
  │                │               │──────────────►│               │
  │                │               │               │ fan-out to    │
  │                │               │               │ all instances │
  │                │               │               │──────────────►│
  │  200 OK        │               │               │ socket emit   │
  │◄───────────────│◄──────────────│               │ card:moved    │
  │                │               │               │               │ card moves
  │                │               │               │               │ in UI
```

### 2. Email Notification Flow

```
API Handler     Bull Queue      Redis           Queue Worker    SMTP/Nodemailer
    │               │               │               │               │
    │ addEmailJob() │               │               │               │
    │──────────────►│               │               │               │
    │               │ RPUSH job     │               │               │
    │               │──────────────►│               │               │
    │ returns       │               │               │               │
    │◄──────────────│               │               │               │
    │               │               │               │               │
    │               │               │ BLPOP job     │               │
    │               │               │◄──────────────│               │
    │               │               │──────────────►│               │
    │               │               │               │ checkPrefs()  │
    │               │               │               │ (DB query)    │
    │               │               │               │               │
    │               │               │               │ if allowed:   │
    │               │               │               │──────────────►│
    │               │               │               │               │ sendMail()
    │               │               │               │◄──────────────│
    │               │               │               │               │
    │               │               │               │ on failure:   │
    │               │               │               │ retry w/ exp  │
    │               │               │               │ backoff (3x)  │
```

### 3. Google OAuth Flow

```
Browser         Next.js         Express         Google          Redis
  │               │               │               │               │
  │ click Google  │               │               │               │
  │──────────────►│               │               │               │
  │               │ GET /api/auth/google           │               │
  │               │──────────────►│               │               │
  │               │               │ create session│               │
  │               │               │ (CSRF state)  │               │
  │               │               │──────────────►│(store state)  │
  │               │               │               │               │
  │ redirect to   │               │               │               │
  │ Google 302    │◄──────────────│               │               │
  │──────────────────────────────────────────────►│               │
  │               │               │               │ user consents │
  │◄──────────────────────────────────────────────│               │
  │ /google/callback?code=...     │               │               │
  │──────────────►│               │               │               │
  │               │ GET /api/auth/google/callback  │               │
  │               │──────────────►│               │               │
  │               │               │ exchange code │               │
  │               │               │──────────────►│               │
  │               │               │◄──────────────│               │
  │               │               │ find-or-create user (DB)      │
  │               │               │ issue JWT + refresh token     │
  │               │               │ DESTROY session               │
  │               │               │──────────────►│(DEL session)  │
  │               │ redirect to   │               │               │
  │               │ /callback?token=JWT       │               │
  │◄──────────────│◄──────────────│               │               │
  │ store token   │               │               │               │
  │ router.replace('/dashboard')  │               │               │
```

---

## Scaling to 1 Million Users

### Current Single-Server Limits
- Node.js: ~50k concurrent WebSocket connections per process
- PostgreSQL: ~200 concurrent connections with pg-pool
- Redis: ~100k ops/sec single node

### Horizontal Scaling Strategy

**1. Stateless API Tier**
```
Internet → Load Balancer (nginx/AWS ALB)
              ├── Node.js API Pod 1
              ├── Node.js API Pod 2  (Socket.io → Redis pub/sub)
              ├── Node.js API Pod 3
              └── Node.js API Pod N
```

**2. Database Layer**
- Read replicas for `GET /boards/:id`, activity logs (read-heavy)
- Primary for all writes
- Connection pooling with PgBouncer (transaction mode)
- At 1M users: shard by `board_id` (consistent hash). Cards, lists, activity all co-located.

**3. Redis Cluster**
- 3-node Redis cluster with sentinel for HA
- Separate clusters for: pub/sub, caching, rate limiting, sessions
- Use Redis Streams instead of Bull at very high volume

**4. CDN**
- Next.js `output: 'standalone'` static assets → CloudFront/Fastly
- API responses that don't require auth → edge cache

**5. Bottleneck Analysis**

| Bottleneck | At scale | Solution |
|------------|----------|----------|
| WebSocket connections | >50k/node | Add nodes; Redis adapter fans events |
| DB write contention | High-traffic boards | Optimistic locking + write batching |
| Redis pub/sub | >100k msgs/sec | Redis Cluster, partition by board_id |
| Email queue | Spikes | Multiple Bull workers; rate-limit sends |
| Board cache invalidation | Thundering herd | Cache stampede protection (probabilistic early recompute) |
| Hot boards | Celebrity problem | Per-board cache, not global | 

**6. Observability**
- Distributed tracing: OpenTelemetry → Jaeger
- Metrics: Prometheus + Grafana
- Error tracking: Sentry
- Logs: Structured JSON → Elasticsearch
