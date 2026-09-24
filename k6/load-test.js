import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const boardLoadTime = new Trend('board_load_time');
const cardCreateTime = new Trend('card_create_time');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

// 200 concurrent users ramping up, sustaining, ramping down
export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.01'],
    board_load_time: ['p(95)<300'],
    card_create_time: ['p(95)<400'],
  },
};

// Seed credentials — must exist in the DB
const USERS = [
  { email: 'alice@example.com', password: 'password123' },
  { email: 'bob@example.com', password: 'password123' },
];

let authTokens = [];

export function setup() {
  // Login all test users and store tokens
  const tokens = [];
  for (const user of USERS) {
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify(user),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (res.status === 200) {
      const body = JSON.parse(res.body);
      tokens.push({ token: body.data.accessToken, ...user });
    }
  }
  return { tokens };
}

export default function (data) {
  const { tokens } = data;
  const user = tokens[Math.floor(Math.random() * tokens.length)];

  if (!user) return;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user.token}`,
  };

  // 1. Get all boards
  const boardsStart = Date.now();
  const boardsRes = http.get(`${BASE_URL}/api/boards`, { headers });
  boardLoadTime.add(Date.now() - boardsStart);

  const ok1 = check(boardsRes, {
    'boards status 200': (r) => r.status === 200,
    'boards has data': (r) => JSON.parse(r.body).success === true,
  });
  errorRate.add(!ok1);

  if (boardsRes.status !== 200) { sleep(1); return; }

  const boards = JSON.parse(boardsRes.body).data.boards;
  if (!boards || boards.length === 0) { sleep(1); return; }

  const board = boards[Math.floor(Math.random() * boards.length)];

  // 2. Load specific board
  const boardRes = http.get(`${BASE_URL}/api/boards/${board.id}`, { headers });
  const ok2 = check(boardRes, {
    'board detail status 200': (r) => r.status === 200,
  });
  errorRate.add(!ok2);

  if (boardRes.status !== 200) { sleep(1); return; }

  const boardData = JSON.parse(boardRes.body).data;
  const lists = boardData.lists || [];

  // 3. Create a card (if editor/owner and lists exist)
  if (lists.length > 0 && ['owner', 'editor'].includes(board.role)) {
    const list = lists[Math.floor(Math.random() * lists.length)];
    const cardStart = Date.now();
    const cardRes = http.post(
      `${BASE_URL}/api/boards/${board.id}/cards`,
      JSON.stringify({ listId: list.id, name: `Load test card ${Date.now()}` }),
      { headers }
    );
    cardCreateTime.add(Date.now() - cardStart);

    const ok3 = check(cardRes, {
      'card created': (r) => r.status === 201,
    });
    errorRate.add(!ok3);
  }

  // 4. Get activity
  const actRes = http.get(`${BASE_URL}/api/boards/${board.id}/activity`, { headers });
  check(actRes, { 'activity status 200': (r) => r.status === 200 });

  // 5. Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health ok': (r) => r.status === 200 });

  sleep(Math.random() * 2 + 0.5); // 0.5–2.5s think time
}

export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: `
=== TaskBoard Load Test Summary ===
VUs: ${data.metrics.vus?.values?.max || 0} max concurrent
Requests: ${data.metrics.http_reqs?.values?.count || 0} total
Error rate: ${((data.metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%
p95 response: ${(data.metrics.http_req_duration?.values['p(95)'] || 0).toFixed(0)}ms
Board load p95: ${(data.metrics.board_load_time?.values['p(95)'] || 0).toFixed(0)}ms
Card create p95: ${(data.metrics.card_create_time?.values['p(95)'] || 0).toFixed(0)}ms
`,
  };
}
