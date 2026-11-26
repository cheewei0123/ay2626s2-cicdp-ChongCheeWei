// k6 load test for the live app (KAN-55). Run by .github/workflows/k6.yml, or locally:
//   k6 run qa/k6/smoke.js                       (BASE_URL defaults to production)
//   k6 run -e BASE_URL=http://localhost:8080 qa/k6/smoke.js
// Two scenarios:
//   load      10 users for 1 minute, each opening the app and calling /api/health
//             (Caddy → NestJS → a query on RDS), with the pass/fail thresholds below.
//   ratelimit after the load, 25 quick join-code guesses from one IP: the first 20 get
//             404 (no such code), the rest must get 429, so the limit really works.
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const BASE = __ENV.BASE_URL || 'https://splitlah.duckdns.org';

export const options = {
  scenarios: {
    load: { executor: 'constant-vus', vus: 10, duration: '1m', exec: 'browse' },
    ratelimit: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 25,
      startTime: '1m5s', // after the load, so the two don't mix
      exec: 'guessCodes',
    },
  },
  // Only the load scenario counts here: the 404s and 429s below are expected answers
  thresholds: {
    'http_req_duration{scenario:load}': ['p(95)<500'],
    'http_req_failed{scenario:load}': ['rate<0.01'],
    'checks{scenario:ratelimit}': ['rate==1'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
};

export function browse() {
  const page = http.get(`${BASE}/`);
  check(page, { 'app page is 200': (r) => r.status === 200 });

  const health = http.get(`${BASE}/api/health`);
  check(health, {
    'health says db up': (r) => r.status === 200 && r.json('db') === 'up',
  });

  sleep(1); // a real user pauses between screens
}

export function guessCodes() {
  const res = http.get(`${BASE}/api/join/ZZZZZ`, {
    responseCallback: http.expectedStatuses(404, 429),
  });
  const n = exec.scenario.iterationInTest; // 0..24
  check(res, {
    'first 20 guesses answered (404)': (r) => n >= 20 || r.status === 404,
    'later guesses blocked (429)': (r) => n < 20 || r.status === 429,
  });
}
