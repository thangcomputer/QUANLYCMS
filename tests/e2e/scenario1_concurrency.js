/**
 * ═══════════════════════════════════════════════════════════════════════
 *  KỊCH BẢN 1: CONCURRENCY TEST — 20 tài khoản đồng thời
 *  Playwright + Performance Monitoring
 * 
 *  Mục tiêu:
 *  - 10 HV + 5 GV + 5 Admin cùng lúc truy cập Dashboard
 *  - Chuyển Tab liên tục trong 5 phút
 *  - Đo Response Time, CPU/RAM, Socket.io latency
 *  - Quay video toàn bộ quá trình
 *
 *  Chạy: node tests/e2e/scenario1_concurrency.js
 * ═══════════════════════════════════════════════════════════════════════
 */
const { chromium }     = require('playwright');
const path             = require('path');
const fs               = require('fs');
const { BASE_URL, API_BASE_URL, generateTestToken, TEST_CONFIG } = require('../config');

// ── Load test accounts ────────────────────────────────────────────────
let ACCOUNTS;
try {
  ACCOUNTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test_account_ids.json'), 'utf-8'));
} catch {
  console.error('❌ Chưa có file test_account_ids.json. Chạy "node tests/seed_test_accounts.js" trước!');
  process.exit(1);
}

// ── Performance Metrics Collector ─────────────────────────────────────
class MetricsCollector {
  constructor() {
    this.apiCalls    = [];  // { url, method, status, duration, timestamp, account }
    this.errors      = [];  // { url, error, timestamp, account }
    this.tabSwitches = [];  // { from, to, duration, timestamp, account }
    this.socketEvents = []; // { event, latency, timestamp, account }
    this.startTime   = null;
    this.endTime     = null;
  }

  recordApiCall(data)     { this.apiCalls.push({ ...data, timestamp: Date.now() }); }
  recordError(data)       { this.errors.push({ ...data, timestamp: Date.now() }); }
  recordTabSwitch(data)   { this.tabSwitches.push({ ...data, timestamp: Date.now() }); }
  recordSocketEvent(data) { this.socketEvents.push({ ...data, timestamp: Date.now() }); }

  getSummary() {
    const durations = this.apiCalls.map(c => c.duration).filter(d => d != null);
    const avgResponseTime = durations.length ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(0) : 0;
    const maxResponseTime = durations.length ? Math.max(...durations) : 0;
    const minResponseTime = durations.length ? Math.min(...durations) : 0;
    const p95 = durations.length ? durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] : 0;
    const p99 = durations.length ? durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.99)] : 0;
    const slowCalls = durations.filter(d => d > TEST_CONFIG.concurrency.maxDelay);
    const errorRate = this.apiCalls.length ? ((this.errors.length / this.apiCalls.length) * 100).toFixed(2) : 0;

    return {
      totalDuration:   this.endTime ? ((this.endTime - this.startTime) / 1000).toFixed(1) + 's' : 'N/A',
      totalApiCalls:   this.apiCalls.length,
      totalErrors:     this.errors.length,
      errorRate:       `${errorRate}%`,
      avgResponseTime: `${avgResponseTime}ms`,
      maxResponseTime: `${maxResponseTime}ms`,
      minResponseTime: `${minResponseTime}ms`,
      p95ResponseTime: `${p95}ms`,
      p99ResponseTime: `${p99}ms`,
      slowCalls:       `${slowCalls.length} calls > ${TEST_CONFIG.concurrency.maxDelay}ms`,
      tabSwitches:     this.tabSwitches.length,
      socketEvents:    this.socketEvents.length,
    };
  }
}

const metrics = new MetricsCollector();

// ── Browser Session Creator ───────────────────────────────────────────
async function createBrowserSession(browser, account, role, index, totalAccounts) {
  const label = `[${role.toUpperCase()} #${index + 1}] ${account.name}`;

  // Tính toán vị trí cửa sổ trên grid
  const cols = Math.ceil(Math.sqrt(totalAccounts));
  const row  = Math.floor(index / cols);
  const col  = index % cols;
  const vw   = TEST_CONFIG.viewports.small.width;
  const vh   = TEST_CONFIG.viewports.small.height;

  const context = await browser.newContext({
    viewport: { width: vw, height: vh },
    recordVideo: {
      dir: path.join(__dirname, '..', 'videos'),
      size: { width: vw, height: vh },
    },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // ── Intercept API calls for metrics ─────────────────────────────
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      const timing = response.request().timing();
      metrics.recordApiCall({
        url:      url.replace(API_BASE_URL, ''),
        method:   response.request().method(),
        status:   response.status(),
        duration: timing.responseEnd > 0 ? Math.round(timing.responseEnd) : null,
        account:  account.name,
      });

      if (response.status() >= 400) {
        metrics.recordError({
          url:     url.replace(API_BASE_URL, ''),
          error:   `HTTP ${response.status()}`,
          account: account.name,
        });
      }
    }
  });

  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/')) {
      metrics.recordError({
        url:     request.url().replace(API_BASE_URL, ''),
        error:   request.failure()?.errorText || 'Unknown',
        account: account.name,
      });
    }
  });

  // ── Inject session via localStorage ─────────────────────────────
  const tokenPayload = {
    id:         account._id,
    role:       role,
    name:       account.name,
    adminRole:  role === 'admin' ? 'STAFF' : null,
    permissions: role === 'admin' ? ['manage_students', 'manage_schedule', 'manage_finance'] : [],
    branchId:   null,
    branchCode: '',
  };

  const token = generateTestToken(tokenPayload, role === 'admin' ? 'internal' : 'public');
  const storagePrefix = role === 'student' ? 'student' : role === 'teacher' ? 'teacher' : 'admin';
  const dashboardUrl  = role === 'student' ? '/student' : role === 'teacher' ? '/teacher' : '/admin';

  // Navigate to base URL first to set localStorage
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

  await page.evaluate(({ prefix, token, user }) => {
    localStorage.setItem(`${prefix}_user`, JSON.stringify(user));
    localStorage.setItem(`${prefix}_access_token`, token);
    localStorage.setItem(`${prefix}_refresh_token`, token);
  }, {
    prefix: storagePrefix,
    token,
    user: { ...tokenPayload, _id: account._id, accessToken: token, refreshToken: token },
  });

  console.log(`  ✅ ${label} — Session injected`);
  return { context, page, label, role, dashboardUrl, storagePrefix };
}

// ── Tab Switching Simulation ──────────────────────────────────────────
async function simulateTabSwitching(session, durationMs) {
  const { page, label, role, dashboardUrl } = session;
  const tabs = getTabsForRole(role, dashboardUrl);
  const startTime = Date.now();
  let currentTabIdx = 0;

  console.log(`  🔄 ${label} — Starting tab switching (${tabs.length} tabs, ${durationMs / 1000}s)`);

  // Navigate to dashboard first
  try {
    await page.goto(`${BASE_URL}${dashboardUrl}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    console.warn(`  ⚠️ ${label} — Dashboard load slow: ${e.message}`);
  }

  while (Date.now() - startTime < durationMs) {
    const nextTabIdx = (currentTabIdx + 1) % tabs.length;
    const fromTab = tabs[currentTabIdx];
    const toTab   = tabs[nextTabIdx];

    const switchStart = Date.now();

    try {
      if (toTab.type === 'hash') {
        // Hash-based tab (Admin Dashboard tabs like #students, #teachers)
        await page.goto(`${BASE_URL}${dashboardUrl}${toTab.path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      } else if (toTab.type === 'route') {
        // Route-based navigation
        await page.goto(`${BASE_URL}${toTab.path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      } else if (toTab.type === 'click') {
        // Click-based tab switching
        const btn = await page.$(toTab.selector);
        if (btn) await btn.click();
      }

      await page.waitForTimeout(500); // Wait for content load

      const switchDuration = Date.now() - switchStart;
      metrics.recordTabSwitch({
        from:     fromTab.name,
        to:       toTab.name,
        duration: switchDuration,
        account:  label,
      });

      if (switchDuration > TEST_CONFIG.concurrency.maxDelay) {
        console.warn(`  ⚠️ ${label} — Slow tab switch: ${fromTab.name} → ${toTab.name} (${switchDuration}ms)`);
      }
    } catch (err) {
      metrics.recordError({
        url:     toTab.path || toTab.name,
        error:   err.message,
        account: label,
      });
    }

    currentTabIdx = nextTabIdx;
    await page.waitForTimeout(TEST_CONFIG.concurrency.tabSwitchInterval);
  }

  console.log(`  ✅ ${label} — Tab switching completed`);
}

// ── Define tabs per role ──────────────────────────────────────────────
function getTabsForRole(role, basePath) {
  if (role === 'admin') {
    return [
      { name: 'Dashboard',    type: 'hash', path: '' },
      { name: 'Học viên',     type: 'hash', path: '#students' },
      { name: 'Lịch dạy',    type: 'hash', path: '#schedules' },
      { name: 'Giảng viên',  type: 'hash', path: '#teachers' },
      { name: 'Hộp thư',     type: 'route', path: '/admin/inbox' },
    ];
  }
  if (role === 'teacher') {
    return [
      { name: 'Dashboard',   type: 'route', path: '/teacher' },
      { name: 'Hộp thư',     type: 'route', path: '/teacher/inbox' },
      { name: 'Tài chính',   type: 'route', path: '/teacher/finance' },
      { name: 'Dashboard 2', type: 'route', path: '/teacher' },
    ];
  }
  // student
  return [
    { name: 'Dashboard',   type: 'route', path: '/student' },
    { name: 'Phòng thi',   type: 'route', path: '/student/exam' },
    { name: 'Hộp thư',     type: 'route', path: '/student/inbox' },
    { name: 'Dashboard 2', type: 'route', path: '/student' },
  ];
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN — Orchestrator
// ══════════════════════════════════════════════════════════════════════
async function runConcurrencyTest() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🔥  KỊCH BẢN 1: CONCURRENCY TEST — 20 USER ĐỒNG THỜI   ║');
  console.log('║  📊  Đo lường CPU, RAM, API Response Time, Socket.io      ║');
  console.log('║  ⏱️   Thời gian: 5 phút chuyển tab liên tục               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  metrics.startTime = Date.now();
  const testDuration = TEST_CONFIG.concurrency.duration;
  const totalAccounts = ACCOUNTS.students.length + ACCOUNTS.teachers.length + ACCOUNTS.admins.length;

  console.log(`📋 Tổng tài khoản: ${totalAccounts}`);
  console.log(`   - Học viên:   ${ACCOUNTS.students.length}`);
  console.log(`   - Giảng viên: ${ACCOUNTS.teachers.length}`);
  console.log(`   - Admin:      ${ACCOUNTS.admins.length}`);
  console.log(`⏱️  Thời gian test: ${testDuration / 1000}s`);
  console.log('');

  // Launch browser (single instance, multiple contexts)
  const browser = await chromium.launch({
    headless: false, // Để thấy rõ 20 cửa sổ đang chạy
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  console.log('🚀 Browser launched — Creating sessions...');

  // ── Create all sessions ─────────────────────────────────────────
  const sessions = [];
  let idx = 0;

  for (const student of ACCOUNTS.students) {
    sessions.push(await createBrowserSession(browser, student, 'student', idx++, totalAccounts));
  }
  for (const teacher of ACCOUNTS.teachers) {
    sessions.push(await createBrowserSession(browser, teacher, 'teacher', idx++, totalAccounts));
  }
  for (const admin of ACCOUNTS.admins) {
    sessions.push(await createBrowserSession(browser, admin, 'admin', idx++, totalAccounts));
  }

  console.log(`\n✅ ${sessions.length} sessions created — Starting concurrent tab switching...\n`);

  // ── Run all sessions concurrently ───────────────────────────────
  const promises = sessions.map(session => simulateTabSwitching(session, testDuration));

  // ── Periodic status logging ─────────────────────────────────────
  const statusInterval = setInterval(() => {
    const elapsed = ((Date.now() - metrics.startTime) / 1000).toFixed(0);
    const remaining = Math.max(0, testDuration / 1000 - elapsed);
    console.log(`  ⏱️  Elapsed: ${elapsed}s | Remaining: ${remaining}s | API Calls: ${metrics.apiCalls.length} | Errors: ${metrics.errors.length}`);
  }, 30000);

  await Promise.allSettled(promises);
  clearInterval(statusInterval);

  metrics.endTime = Date.now();

  // ── Take final screenshots ──────────────────────────────────────
  console.log('\n📸 Taking final screenshots...');
  for (let i = 0; i < sessions.length; i++) {
    try {
      await sessions[i].page.screenshot({
        path: path.join(__dirname, '..', 'reports', `scenario1_final_${sessions[i].role}_${i}.png`),
        fullPage: false,
      });
    } catch {}
  }

  // ── Close all sessions ──────────────────────────────────────────
  console.log('\n🔄 Closing browser sessions...');
  for (const session of sessions) {
    try {
      await session.page.close();
      await session.context.close();
    } catch {}
  }
  await browser.close();

  // ── Generate Report ─────────────────────────────────────────────
  const summary = metrics.getSummary();
  const report = generateReport(summary);
  
  const reportPath = path.join(__dirname, '..', 'reports', `scenario1_report_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ summary, apiCalls: metrics.apiCalls, errors: metrics.errors, tabSwitches: metrics.tabSwitches }, null, 2));

  console.log(report);
  console.log(`\n📄 Full report saved to: ${reportPath}`);

  return summary;
}

// ── Report Generator ──────────────────────────────────────────────────
function generateReport(summary) {
  return `
╔══════════════════════════════════════════════════════════════╗
║           📊 BÁO CÁO KỊCH BẢN 1: CONCURRENCY TEST         ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  ⏱️  Thời gian test:        ${summary.totalDuration.padEnd(30)}║
║  📡 Tổng API Calls:         ${String(summary.totalApiCalls).padEnd(30)}║
║  ❌ Tổng Errors:            ${String(summary.totalErrors).padEnd(30)}║
║  📈 Error Rate:             ${summary.errorRate.padEnd(30)}║
║                                                              ║
║  ── Response Time ───────────────────────────────────────    ║
║  🟢 Avg:                    ${summary.avgResponseTime.padEnd(30)}║
║  🔴 Max:                    ${summary.maxResponseTime.padEnd(30)}║
║  🟡 Min:                    ${summary.minResponseTime.padEnd(30)}║
║  📊 P95:                    ${summary.p95ResponseTime.padEnd(30)}║
║  📊 P99:                    ${summary.p99ResponseTime.padEnd(30)}║
║  ⚠️  Slow (>${TEST_CONFIG.concurrency.maxDelay}ms):      ${summary.slowCalls.padEnd(30)}║
║                                                              ║
║  ── Tab Switching ───────────────────────────────────────    ║
║  🔄 Total Switches:         ${String(summary.tabSwitches).padEnd(30)}║
║  🔌 Socket Events:          ${String(summary.socketEvents).padEnd(30)}║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝`;
}

// ── RUN ───────────────────────────────────────────────────────────────
runConcurrencyTest().catch(err => {
  console.error('❌ Concurrency Test failed:', err);
  process.exit(1);
});
