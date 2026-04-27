/**
 * ═══════════════════════════════════════════════════════════════════════
 *  QUANLYCMS — Master Test Runner
 *  Chạy tất cả kịch bản test và xuất báo cáo tổng hợp
 *
 *  Chạy: node tests/run_all_tests.js
 *  Hoặc chạy riêng: node tests/run_all_tests.js --scenario=1
 * ═══════════════════════════════════════════════════════════════════════
 */
const { execSync, spawn } = require('child_process');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const TESTS_DIR   = __dirname;
const REPORTS_DIR = path.join(TESTS_DIR, 'reports');

// ── Parse CLI args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const scenarioArg = args.find(a => a.startsWith('--scenario='));
const onlyScenario = scenarioArg ? parseInt(scenarioArg.split('=')[1]) : null;

// ── Ensure report directory ────────────────────────────────────────────
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// ── System Info ────────────────────────────────────────────────────────
function getSystemInfo() {
  return {
    platform: os.platform(),
    arch:     os.arch(),
    cpus:     os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    totalRAM: `${(os.totalmem() / (1024 ** 3)).toFixed(1)} GB`,
    freeRAM:  `${(os.freemem() / (1024 ** 3)).toFixed(1)} GB`,
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  };
}

// ── Step Runner ────────────────────────────────────────────────────────
function runStep(name, command, cwd = TESTS_DIR) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ▶ ${name}`);
  console.log(`${'═'.repeat(60)}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn('node', command.split(' ').slice(1), {
      cwd: path.join(TESTS_DIR, '..'),
      stdio: 'inherit',
      shell: true,
    });

    // Use full command if 'node' is the first word
    const proc = spawn(command.split(' ')[0], command.split(' ').slice(1), {
      cwd: path.join(TESTS_DIR, '..'),
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`\n  ✅ ${name} — COMPLETED`);
        resolve(true);
      } else {
        console.error(`\n  ❌ ${name} — FAILED (exit code: ${code})`);
        resolve(false); // Don't reject, continue with other tests
      }
    });

    proc.on('error', (err) => {
      console.error(`\n  ❌ ${name} — ERROR: ${err.message}`);
      resolve(false);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════
async function main() {
  const systemInfo = getSystemInfo();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 QUANLYCMS — MASTER TEST RUNNER                       ║');
  console.log('║   Load Testing + E2E Testing Suite                         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║   CPU:  ${systemInfo.cpuModel.substring(0, 50).padEnd(50)}║`);
  console.log(`║   RAM:  ${systemInfo.totalRAM} total, ${systemInfo.freeRAM} free`.padEnd(63) + '║');
  console.log(`║   Node: ${systemInfo.nodeVersion.padEnd(50)}║`);
  console.log(`║   Time: ${systemInfo.timestamp.padEnd(50)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const results = {};
  const startTime = Date.now();

  // ── Step 0: Seed test accounts ─────────────────────────────────────
  console.log('📦 Step 0: Seeding test accounts...');
  results.seed = await runStep(
    'Seed Test Accounts (20 tài khoản)',
    'node tests/seed_test_accounts.js'
  );

  if (!results.seed) {
    console.error('❌ Seed failed! Cannot continue.');
    process.exit(1);
  }

  // ── Step 1: Scenario 1 — Concurrency Test ──────────────────────────
  if (!onlyScenario || onlyScenario === 1) {
    results.scenario1 = await runStep(
      'Kịch bản 1: Concurrency Test (20 users, 5 phút)',
      'node tests/e2e/scenario1_concurrency.js'
    );
  }

  // ── Step 2: Scenario 2 — Exam Stress Test ──────────────────────────
  if (!onlyScenario || onlyScenario === 2) {
    results.scenario2 = await runStep(
      'Kịch bản 2: Exam Stress Test (5 HV, phòng thi)',
      'node tests/e2e/scenario2_exam_stress.js'
    );
  }

  // ── Step 3: K6 Load Test (optional — requires K6 installed) ────────
  if (!onlyScenario || onlyScenario === 3) {
    try {
      execSync('k6 version', { stdio: 'ignore' });
      console.log('\n✅ K6 detected — Running API load test...');
      
      // Generate admin token for K6
      const jwt = require('jsonwebtoken');
      require('dotenv').config({ path: path.join(TESTS_DIR, '..', '.env') });
      const token = jwt.sign(
        { id: 'admin', role: 'admin', name: 'Admin Test', adminRole: 'SUPER_ADMIN', aud: 'internal' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      results.k6 = await runStep(
        'K6 API Load Test (20-50 VUs)',
        `k6 run -e JWT_TOKEN=${token} -e API_BASE_URL=http://localhost:5000 tests/load-test/k6_api_load.js`
      );
    } catch {
      console.log('\n⚠️  K6 not installed — Skipping API load test');
      console.log('    Install: https://k6.io/docs/get-started/installation/');
      results.k6 = 'skipped';
    }
  }

  // ── Final Summary ──────────────────────────────────────────────────
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // Generate final HTML report
  generateHTMLReport(results, systemInfo, totalTime);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║             🏁 TẤT CẢ TEST ĐÃ HOÀN THÀNH                ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  ⏱️  Tổng thời gian: ${(totalTime + ' phút').padEnd(38)}║`);
  console.log(`║  📦 Seed:            ${(results.seed ? '✅ Passed' : '❌ Failed').padEnd(38)}║`);
  if (results.scenario1 !== undefined) {
    console.log(`║  🔥 Scenario 1:      ${(results.scenario1 ? '✅ Passed' : '❌ Failed').padEnd(38)}║`);
  }
  if (results.scenario2 !== undefined) {
    console.log(`║  🏫 Scenario 2:      ${(results.scenario2 ? '✅ Passed' : '❌ Failed').padEnd(38)}║`);
  }
  if (results.k6 !== undefined) {
    console.log(`║  📊 K6 Load Test:    ${(results.k6 === 'skipped' ? '⏭️ Skipped' : results.k6 ? '✅ Passed' : '❌ Failed').padEnd(38)}║`);
  }
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  📁 Reports:  tests/reports/                               ║');
  console.log('║  🎥 Videos:   tests/videos/                                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

// ── HTML Report Generator ─────────────────────────────────────────────
function generateHTMLReport(results, systemInfo, totalTime) {
  // Gather all JSON reports from reports directory
  const reportFiles = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.json'));
  const reports = {};
  for (const file of reportFiles) {
    try {
      reports[file] = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, file), 'utf-8'));
    } catch {}
  }

  // Get screenshots
  const screenshots = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.png'));

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>QUANLYCMS — Báo Cáo Kiểm Thử Hiệu Năng</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #38bdf8; font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { color: #f59e0b; margin: 2rem 0 1rem; font-size: 1.5rem; border-bottom: 2px solid #1e293b; padding-bottom: 0.5rem; }
    h3 { color: #22d3ee; margin: 1rem 0 0.5rem; }
    .header { background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #334155; border-radius: 16px; padding: 2rem; margin-bottom: 2rem; }
    .subtitle { color: #94a3b8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; }
    .card.success { border-color: #22c55e; }
    .card.error { border-color: #ef4444; }
    .card.warning { border-color: #f59e0b; }
    .metric { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #334155; }
    .metric:last-child { border-bottom: none; }
    .metric-label { color: #94a3b8; font-size: 0.875rem; }
    .metric-value { font-weight: bold; font-size: 1.1rem; }
    .metric-value.good { color: #22c55e; }
    .metric-value.warn { color: #f59e0b; }
    .metric-value.bad { color: #ef4444; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #1e293b; color: #94a3b8; font-size: 0.875rem; text-transform: uppercase; }
    td { font-size: 0.925rem; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: bold; }
    .badge.pass { background: #22c55e20; color: #22c55e; border: 1px solid #22c55e40; }
    .badge.fail { background: #ef444420; color: #ef4444; border: 1px solid #ef444440; }
    .badge.skip { background: #94a3b820; color: #94a3b8; border: 1px solid #94a3b840; }
    .sysinfo { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; }
    .sysinfo div { padding: 0.5rem; background: #0f172a; border-radius: 8px; font-size: 0.85rem; }
    .sysinfo span { color: #38bdf8; font-weight: bold; }
    .screenshots { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .screenshots img { width: 100%; border-radius: 8px; border: 1px solid #334155; }
    footer { text-align: center; color: #475569; margin-top: 3rem; padding: 1rem; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 QUANLYCMS — Báo Cáo Kiểm Thử Hiệu Năng</h1>
      <p class="subtitle">Load Testing & E2E Testing Report — Trung Tâm Thắng Tin Học</p>
      <p class="subtitle" style="margin-top:0.5rem">⏱️ Tổng thời gian: <strong style="color:#22d3ee">${totalTime} phút</strong> | 📅 ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}</p>
    </div>

    <!-- System Info -->
    <h2>💻 Thông Tin Hệ Thống</h2>
    <div class="card">
      <div class="sysinfo">
        <div>CPU: <span>${systemInfo.cpuModel}</span></div>
        <div>Cores: <span>${systemInfo.cpus}</span></div>
        <div>RAM: <span>${systemInfo.totalRAM}</span></div>
        <div>Free RAM: <span>${systemInfo.freeRAM}</span></div>
        <div>Node.js: <span>${systemInfo.nodeVersion}</span></div>
        <div>OS: <span>${systemInfo.platform} ${systemInfo.arch}</span></div>
      </div>
    </div>

    <!-- Test Results Summary -->
    <h2>📊 Tổng Hợp Kết Quả</h2>
    <div class="grid">
      <div class="card ${results.seed ? 'success' : 'error'}">
        <h3>📦 Seed Accounts</h3>
        <div class="metric"><span class="metric-label">Status</span><span class="badge ${results.seed ? 'pass' : 'fail'}">${results.seed ? 'PASSED' : 'FAILED'}</span></div>
        <div class="metric"><span class="metric-label">Accounts</span><span class="metric-value good">20 accounts</span></div>
      </div>
      ${results.scenario1 !== undefined ? `
      <div class="card ${results.scenario1 ? 'success' : 'error'}">
        <h3>🔥 Kịch Bản 1: Concurrency</h3>
        <div class="metric"><span class="metric-label">Status</span><span class="badge ${results.scenario1 ? 'pass' : 'fail'}">${results.scenario1 ? 'PASSED' : 'FAILED'}</span></div>
        <div class="metric"><span class="metric-label">Users</span><span class="metric-value">20 simultaneous</span></div>
        <div class="metric"><span class="metric-label">Duration</span><span class="metric-value">5 phút</span></div>
      </div>` : ''}
      ${results.scenario2 !== undefined ? `
      <div class="card ${results.scenario2 ? 'success' : 'error'}">
        <h3>🏫 Kịch Bản 2: Exam Stress</h3>
        <div class="metric"><span class="metric-label">Status</span><span class="badge ${results.scenario2 ? 'pass' : 'fail'}">${results.scenario2 ? 'PASSED' : 'FAILED'}</span></div>
        <div class="metric"><span class="metric-label">Students</span><span class="metric-value">5 simultaneous</span></div>
      </div>` : ''}
      ${results.k6 !== undefined ? `
      <div class="card ${results.k6 === 'skipped' ? 'warning' : results.k6 ? 'success' : 'error'}">
        <h3>📈 K6 API Load Test</h3>
        <div class="metric"><span class="metric-label">Status</span><span class="badge ${results.k6 === 'skipped' ? 'skip' : results.k6 ? 'pass' : 'fail'}">${results.k6 === 'skipped' ? 'SKIPPED' : results.k6 ? 'PASSED' : 'FAILED'}</span></div>
        <div class="metric"><span class="metric-label">VUs</span><span class="metric-value">20-50 users</span></div>
      </div>` : ''}
    </div>

    <!-- Detailed Reports -->
    ${Object.keys(reports).length > 0 ? `
    <h2>📋 Chi Tiết Các Kịch Bản</h2>
    ${Object.entries(reports).map(([file, data]) => `
      <div class="card" style="margin-bottom:1rem">
        <h3>📄 ${file}</h3>
        ${data.summary ? `
        <div style="margin-top:1rem">
          ${Object.entries(data.summary).map(([key, val]) => `
            <div class="metric">
              <span class="metric-label">${key.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span class="metric-value">${val}</span>
            </div>
          `).join('')}
        </div>
        ` : '<p style="color:#475569">Raw data available in JSON file</p>'}
      </div>
    `).join('')}` : ''}

    <!-- Screenshots -->
    ${screenshots.length > 0 ? `
    <h2>📸 Screenshots</h2>
    <div class="screenshots">
      ${screenshots.map(s => `<div><img src="${s}" alt="${s}"><p style="text-align:center;color:#64748b;font-size:0.8rem;margin-top:0.5rem">${s}</p></div>`).join('')}
    </div>` : ''}

    <footer>
      <p>🏫 Trung Tâm Thắng Tin Học — QUANLYCMS Load Testing Report</p>
      <p>Generated by Antigravity Testing Suite v1.0</p>
    </footer>
  </div>
</body>
</html>`;

  const htmlPath = path.join(REPORTS_DIR, 'performance_report.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`\n📄 HTML Report saved to: ${htmlPath}`);
}

main().catch(err => {
  console.error('❌ Test runner failed:', err);
  process.exit(1);
});
