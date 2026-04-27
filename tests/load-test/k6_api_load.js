/**
 * ═══════════════════════════════════════════════════════════════════════
 *  QUANLYCMS — K6 Load Test Script 
 *  Kiểm thử sức chịu tải API thuần (không browser)
 *
 *  Cài đặt K6: https://k6.io/docs/get-started/installation/
 *  Chạy: k6 run tests/load-test/k6_api_load.js
 *
 *  Giả lập:
 *  - 20 Virtual Users (VUs) đồng thời
 *  - Duration: 5 phút
 *  - Target APIs: Auth, Students, Schedules, Messages, ExamResults
 * ═══════════════════════════════════════════════════════════════════════
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── K6 Options ────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Kịch bản 1: 20 users đồng thời trong 5 phút
    concurrent_access: {
      executor: 'constant-vus',
      vus: 20,
      duration: '5m',
    },
    // Kịch bản 2: Ramp up rồi spike
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },   // Ramp up to 10
        { duration: '1m',  target: 20 },   // Ramp up to 20
        { duration: '2m',  target: 20 },   // Hold at 20
        { duration: '30s', target: 50 },   // Spike to 50!
        { duration: '1m',  target: 0 },    // Ramp down
      ],
      startTime: '5m', // Start after scenario 1
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% requests < 2s
    http_req_failed:   ['rate<0.05'],   // Error rate < 5%
    'api_response_time': ['p(95)<2000', 'avg<500'],
  },
};

// ── Custom Metrics ─────────────────────────────────────────────────────
const apiResponseTime = new Trend('api_response_time');
const apiErrorRate    = new Rate('api_error_rate');
const apiCallCounter  = new Counter('api_call_total');

// ── Config ─────────────────────────────────────────────────────────────
const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:5000';
const JWT_TOKEN = __ENV.JWT_TOKEN || ''; // Pass via: k6 run -e JWT_TOKEN=xxx

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${JWT_TOKEN}`,
};

// ── Helper: API Request with Metrics ──────────────────────────────────
function apiRequest(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const params = { headers, timeout: '10s' };
  let res;

  if (method === 'GET') {
    res = http.get(url, params);
  } else if (method === 'POST') {
    res = http.post(url, body ? JSON.stringify(body) : null, params);
  } else if (method === 'PUT') {
    res = http.put(url, body ? JSON.stringify(body) : null, params);
  }

  apiCallCounter.add(1);
  apiResponseTime.add(res.timings.duration);
  apiErrorRate.add(res.status >= 400);

  return res;
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN TEST FUNCTION
// ══════════════════════════════════════════════════════════════════════
export default function () {
  const vuId = __VU;

  // ── Group 1: Dashboard APIs ────────────────────────────────────────
  group('Dashboard — Load Data', () => {
    // GET Root API
    const rootRes = apiRequest('GET', '/');
    check(rootRes, {
      'Root API returns 200': (r) => r.status === 200,
      'Root API is fast (<500ms)': (r) => r.timings.duration < 500,
    });

    // GET Students list
    const studentsRes = apiRequest('GET', '/api/students?page=1&limit=10');
    check(studentsRes, {
      'Students API returns 200|401': (r) => [200, 401].includes(r.status),
      'Students API < 2s': (r) => r.timings.duration < 2000,
    });

    // GET Student stats
    const statsRes = apiRequest('GET', '/api/students/stats');
    check(statsRes, {
      'Stats API returns 200|401': (r) => [200, 401].includes(r.status),
      'Stats API < 2s': (r) => r.timings.duration < 2000,
    });

    sleep(0.5);
  });

  // ── Group 2: Schedule APIs ─────────────────────────────────────────
  group('Schedules — Load Calendar', () => {
    const schedRes = apiRequest('GET', '/api/schedules');
    check(schedRes, {
      'Schedules API returns 200|401': (r) => [200, 401].includes(r.status),
      'Schedules API < 2s': (r) => r.timings.duration < 2000,
    });

    const schedStatsRes = apiRequest('GET', '/api/schedules/stats');
    check(schedStatsRes, {
      'Schedule stats 200|401': (r) => [200, 401].includes(r.status),
    });

    sleep(0.5);
  });

  // ── Group 3: Courses API ───────────────────────────────────────────
  group('Courses — Load List', () => {
    const coursesRes = apiRequest('GET', '/api/courses');
    check(coursesRes, {
      'Courses API returns 200|401': (r) => [200, 401].includes(r.status),
      'Courses API < 2s': (r) => r.timings.duration < 2000,
    });

    sleep(0.3);
  });

  // ── Group 4: Teachers API ──────────────────────────────────────────
  group('Teachers — Load List', () => {
    const teachersRes = apiRequest('GET', '/api/teachers');
    check(teachersRes, {
      'Teachers API returns 200|401': (r) => [200, 401].includes(r.status),
      'Teachers API < 2s': (r) => r.timings.duration < 2000,
    });

    sleep(0.3);
  });

  // ── Group 5: Exam Results ──────────────────────────────────────────
  group('Exam Results — Stress', () => {
    const examRes = apiRequest('GET', '/api/exam-results');
    check(examRes, {
      'Exam results API 200': (r) => r.status === 200,
      'Exam results < 2s': (r) => r.timings.duration < 2000,
    });

    // Simulate exam submission (POST)
    if (vuId <= 5) { // Only first 5 VUs submit exams
      const submitRes = apiRequest('POST', '/api/exam-results', {
        type: 'student',
        studentId: `test_vu_${vuId}`,
        studentName: `VU Test ${vuId}`,
        subject: 'word',
        multipleChoiceCorrect: Math.floor(Math.random() * 15),
        multipleChoiceTotal: 15,
        passed: false,
        date: new Date().toISOString(),
      });
      check(submitRes, {
        'Exam submit 201|400': (r) => [201, 400].includes(r.status),
      });
    }

    sleep(0.5);
  });

  // ── Group 6: Notifications ─────────────────────────────────────────
  group('Notifications — Load', () => {
    const notifRes = apiRequest('GET', '/api/notifications');
    check(notifRes, {
      'Notifications 200|401': (r) => [200, 401].includes(r.status),
    });

    sleep(0.3);
  });

  // ── Group 7: Auth — Token Refresh ──────────────────────────────────
  group('Auth — Token Operations', () => {
    const captchaRes = apiRequest('GET', '/api/auth/captcha');
    check(captchaRes, {
      'Captcha API 200': (r) => r.status === 200,
      'Captcha fast (<500ms)': (r) => r.timings.duration < 500,
    });

    sleep(0.3);
  });

  // Breather between iterations
  sleep(1 + Math.random() * 2);
}

// ── Summary handler ──────────────────────────────────────────────────
export function handleSummary(data) {
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    [`tests/reports/k6_report_${now}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const metrics = data.metrics || {};
  const req_duration = metrics.http_req_duration || { values: {} };
  const duration = req_duration.values || {};
  const req_failed = metrics.http_req_failed || { values: {} };
  const failed = req_failed.values || {};
  const reqs = metrics.http_reqs || { values: {} };

  return `
╔══════════════════════════════════════════════════════════════╗
║           📊 K6 LOAD TEST REPORT — QUANLYCMS               ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  ── HTTP Request Duration ──────────────────────────────    ║
║  🟢 Avg:     ${String(Math.round(duration.avg || 0) + 'ms').padEnd(45)}║
║  🟡 Med:     ${String(Math.round(duration.med || 0) + 'ms').padEnd(45)}║
║  📊 P90:     ${String(Math.round(duration['p(90)'] || 0) + 'ms').padEnd(45)}║
║  📊 P95:     ${String(Math.round(duration['p(95)'] || 0) + 'ms').padEnd(45)}║
║  🔴 Max:     ${String(Math.round(duration.max || 0) + 'ms').padEnd(45)}║
║                                                              ║
║  ── Error Rate ─────────────────────────────────────────    ║
║  ❌ Failed:  ${String(((failed.rate || 0) * 100).toFixed(2) + '%').padEnd(45)}║
║                                                              ║
║  ── Throughput ─────────────────────────────────────────    ║
║  📡 Reqs:    ${String(Math.round(reqs.values.count || 0)).padEnd(45)}║
║  📈 RPS:     ${String(Math.round(reqs.values.rate || 0)).padEnd(45)}║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;
}
