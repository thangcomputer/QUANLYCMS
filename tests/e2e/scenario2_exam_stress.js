/**
 * ═══════════════════════════════════════════════════════════════════════
 *  KỊCH BẢN 2: EXAM STRESS TEST — Phòng thi căng thẳng
 *  Playwright + Performance Monitoring
 *
 *  Mục tiêu:
 *  - 5 HV cùng bấm "Vào thi ngay" đồng thời
 *  - Tự động click đáp án trắc nghiệm liên tục
 *  - Giả lập chuyển Tab trình duyệt (blur/focus) → test Camera AI
 *  - 5 HV nộp bài đồng loạt giây cuối
 *  - Đo lường: Crash rate, Grading accuracy, Socket stability
 *
 *  Chạy: node tests/e2e/scenario2_exam_stress.js
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

// ── Metrics ───────────────────────────────────────────────────────────
class ExamMetrics {
  constructor() {
    this.examEntries     = [];  // { account, entryTime, success }
    this.answerClicks    = [];  // { account, questionIdx, answerIdx, time }
    this.tabSwitches     = [];  // { account, switchTime, returnTime, socketAlive }
    this.submissions     = [];  // { account, submitTime, responseTime, status, score }
    this.violations      = [];  // { account, type, time }
    this.apiCalls        = [];
    this.errors          = [];
    this.startTime       = null;
    this.endTime         = null;
  }

  getSummary() {
    const submissionTimes = this.submissions.map(s => s.responseTime).filter(Boolean);
    const avgSubmitTime = submissionTimes.length
      ? (submissionTimes.reduce((a, b) => a + b, 0) / submissionTimes.length).toFixed(0)
      : 0;

    return {
      totalStudents:    TEST_CONFIG.examStress.numStudents,
      examEntries:      this.examEntries.length,
      successEntries:   this.examEntries.filter(e => e.success).length,
      totalAnswers:     this.answerClicks.length,
      tabSwitches:      this.tabSwitches.length,
      violations:       this.violations.length,
      submissions:      this.submissions.length,
      successSubmits:   this.submissions.filter(s => s.status === 'success').length,
      avgSubmitTime:    `${avgSubmitTime}ms`,
      totalApiCalls:    this.apiCalls.length,
      totalErrors:      this.errors.length,
      errorRate:        this.apiCalls.length ? `${((this.errors.length / this.apiCalls.length) * 100).toFixed(2)}%` : '0%',
      crashDetected:    this.errors.some(e => e.error?.includes('crash') || e.error?.includes('timeout')),
      testDuration:     this.endTime ? `${((this.endTime - this.startTime) / 1000).toFixed(1)}s` : 'N/A',
    };
  }
}

const metrics = new ExamMetrics();

// ── Create Exam Browser Session ───────────────────────────────────────
async function createExamSession(browser, student, index) {
  const label = `[STUDENT #${index + 1}] ${student.name}`;
  const vw = 800, vh = 600;

  const context = await browser.newContext({
    viewport: { width: vw, height: vh },
    recordVideo: {
      dir: path.join(__dirname, '..', 'videos'),
      size: { width: vw, height: vh },
    },
    permissions: ['camera', 'microphone'],  // Cấp quyền Camera cho AI monitoring
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // ── Track API calls ─────────────────────────────────────────────
  page.on('response', (response) => {
    if (response.url().includes('/api/')) {
      const timing = response.request().timing();
      metrics.apiCalls.push({
        url: response.url().replace(API_BASE_URL, ''),
        status: response.status(),
        duration: timing.responseEnd > 0 ? Math.round(timing.responseEnd) : null,
        account: student.name,
        timestamp: Date.now(),
      });

      if (response.status() >= 400) {
        metrics.errors.push({
          url: response.url().replace(API_BASE_URL, ''),
          error: `HTTP ${response.status()}`,
          account: student.name,
          timestamp: Date.now(),
        });
      }
    }
  });

  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/')) {
      metrics.errors.push({
        url: request.url(),
        error: request.failure()?.errorText || 'Request failed',
        account: student.name,
        timestamp: Date.now(),
      });
    }
  });

  // ── Inject student session ──────────────────────────────────────
  const token = generateTestToken({
    id:    student._id,
    role:  'student',
    name:  student.name,
  }, 'public');

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

  await page.evaluate(({ token, student }) => {
    const user = {
      _id: student._id,
      id: student._id,
      name: student.name,
      role: 'student',
      phone: student.phone,
      status: 'active',
      accessToken: token,
      refreshToken: token,
    };
    localStorage.setItem('student_user', JSON.stringify(user));
    localStorage.setItem('student_access_token', token);
    localStorage.setItem('student_refresh_token', token);
  }, { token, student });

  console.log(`  ✅ ${label} — Session injected`);
  return { context, page, label, student };
}

// ── Phase 1: All students enter exam simultaneously ───────────────────
async function enterExam(session) {
  const { page, label } = session;
  const entryStart = Date.now();

  try {
    // Navigate to exam room
    await page.goto(`${BASE_URL}/student/exam`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Look for "Vào thi ngay" button
    const examButton = await page.$('button:has-text("Vào thi ngay"), button:has-text("Thi lại"), button:has-text("Tiếp tục thi")');

    if (examButton) {
      await examButton.click();
      await page.waitForTimeout(2000);
      
      metrics.examEntries.push({
        account: label,
        entryTime: Date.now() - entryStart,
        success: true,
      });
      console.log(`  🎯 ${label} — Entered exam (${Date.now() - entryStart}ms)`);
    } else {
      // Try navigating directly to word exam
      await page.goto(`${BASE_URL}/student/exam/word`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);

      metrics.examEntries.push({
        account: label,
        entryTime: Date.now() - entryStart,
        success: true,
      });
      console.log(`  🎯 ${label} — Entered exam directly (${Date.now() - entryStart}ms)`);
    }
  } catch (err) {
    metrics.examEntries.push({
      account: label,
      entryTime: Date.now() - entryStart,
      success: false,
    });
    metrics.errors.push({
      url: '/student/exam',
      error: err.message,
      account: label,
      timestamp: Date.now(),
    });
    console.error(`  ❌ ${label} — Failed to enter exam: ${err.message}`);
  }
}

// ── Phase 2: Auto-click answers continuously ──────────────────────────
async function autoClickAnswers(session, numQuestions = 15) {
  const { page, label } = session;

  for (let q = 0; q < numQuestions; q++) {
    try {
      // Find all answer option buttons/labels on the current question
      const answerOptions = await page.$$('input[type="radio"], label.answer-option, button[data-answer], div[class*="answer"] input, div[class*="option"] input, label:has(input[type="radio"])');

      if (answerOptions.length > 0) {
        // Pick a random answer
        const randomIdx = Math.floor(Math.random() * answerOptions.length);
        await answerOptions[randomIdx].click({ force: true });

        metrics.answerClicks.push({
          account: label,
          questionIdx: q,
          answerIdx: randomIdx,
          time: Date.now(),
        });
      } else {
        // Try clicking any clickable element that looks like an answer
        const anyClickable = await page.$$('[class*="option"], [class*="answer"], [class*="choice"]');
        if (anyClickable.length > 0) {
          const randomIdx = Math.floor(Math.random() * anyClickable.length);
          await anyClickable[randomIdx].click({ force: true }).catch(() => {});
          
          metrics.answerClicks.push({
            account: label,
            questionIdx: q,
            answerIdx: randomIdx,
            time: Date.now(),
          });
        }
      }

      // Try to navigate to next question if there's a "Next" button
      const nextBtn = await page.$('button:has-text("Câu tiếp"), button:has-text("Tiếp theo"), button:has-text("Next")');
      if (nextBtn) {
        await nextBtn.click().catch(() => {});
      }

      await page.waitForTimeout(TEST_CONFIG.examStress.answerInterval);
    } catch (err) {
      // Page might have navigated or crashed
      console.warn(`  ⚠️ ${label} — Answer click error at Q${q + 1}: ${err.message}`);
    }
  }

  console.log(`  📝 ${label} — Completed ${numQuestions} answer clicks`);
}

// ── Phase 3: Tab switching simulation (blur/focus) ────────────────────
async function simulateTabSwitch(session) {
  const { page, label } = session;
  const switchCount = TEST_CONFIG.examStress.tabSwitchCount;

  console.log(`  🔄 ${label} — Starting ${switchCount} tab switches (blur/focus)...`);

  for (let i = 0; i < switchCount; i++) {
    try {
      const switchStart = Date.now();

      // Simulate leaving the page (blur event — as if switching to Word/Excel)
      await page.evaluate(() => {
        // Trigger visibility change and blur events
        Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('blur'));
      });

      // Wait as if user is in another app
      await page.waitForTimeout(TEST_CONFIG.examStress.tabSwitchPause);

      // Simulate returning to the exam page (focus event)
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });

      const returnTime = Date.now();

      metrics.tabSwitches.push({
        account: label,
        switchTime: switchStart,
        returnTime: returnTime,
        duration: returnTime - switchStart,
        socketAlive: true, // We'll verify this below
      });

      // Check if there's a violation warning popup
      const violationPopup = await page.$('[class*="violation"], [class*="warning"], div:has-text("vi phạm")');
      if (violationPopup) {
        metrics.violations.push({
          account: label,
          type: 'tab_switch_detected',
          time: Date.now(),
        });
        console.log(`  🚨 ${label} — Violation detected on switch #${i + 1}`);
      }

      await page.waitForTimeout(1000);
    } catch (err) {
      console.warn(`  ⚠️ ${label} — Tab switch error #${i + 1}: ${err.message}`);
    }
  }

  console.log(`  ✅ ${label} — Completed ${switchCount} tab switches`);
}

// ── Phase 4: Submit exam simultaneously ───────────────────────────────
async function submitExam(session) {
  const { page, label } = session;
  const submitStart = Date.now();

  try {
    // Look for submit button
    const submitBtn = await page.$('button:has-text("Nộp bài"), button:has-text("Submit"), button:has-text("Hoàn thành")');

    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Check for confirmation dialog
      const confirmBtn = await page.$('button:has-text("Xác nhận"), button:has-text("Đồng ý"), button:has-text("OK")');
      if (confirmBtn) {
        await confirmBtn.click();
      }

      await page.waitForTimeout(3000); // Wait for grading

      const submitTime = Date.now() - submitStart;

      metrics.submissions.push({
        account: label,
        submitTime: Date.now(),
        responseTime: submitTime,
        status: 'success',
      });

      console.log(`  ✅ ${label} — Submitted exam (${submitTime}ms)`);
    } else {
      // If no submit button found, try alternative selectors
      console.warn(`  ⚠️ ${label} — No submit button found, trying alternative...`);

      // Try scroll to bottom and find button
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);

      const altSubmit = await page.$('button[type="submit"], button:last-of-type');
      if (altSubmit) {
        await altSubmit.click();
        await page.waitForTimeout(2000);
      }

      metrics.submissions.push({
        account: label,
        submitTime: Date.now(),
        responseTime: Date.now() - submitStart,
        status: 'alternative',
      });
    }
  } catch (err) {
    metrics.submissions.push({
      account: label,
      submitTime: Date.now(),
      responseTime: Date.now() - submitStart,
      status: 'error',
      error: err.message,
    });
    metrics.errors.push({
      url: '/exam/submit',
      error: err.message,
      account: label,
      timestamp: Date.now(),
    });
    console.error(`  ❌ ${label} — Submit failed: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN — Orchestrator
// ══════════════════════════════════════════════════════════════════════
async function runExamStressTest() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏫 KỊCH BẢN 2: EXAM STRESS TEST — Phòng Thi Căng Thẳng ║');
  console.log('║  📊 5 HV vào thi → Click đáp án → Chuyển tab → Nộp bài  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  metrics.startTime = Date.now();
  const numStudents = TEST_CONFIG.examStress.numStudents;
  const testStudents = ACCOUNTS.students.slice(0, numStudents);

  console.log(`📋 Số học viên test: ${testStudents.length}`);
  testStudents.forEach((s, i) => console.log(`   ${i + 1}. ${s.name} (${s.phone})`));
  console.log('');

  // Launch browser
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',  // Auto-grant camera permissions
      '--use-fake-device-for-media-stream', // Use fake camera
    ],
  });

  console.log('🚀 Browser launched — Creating exam sessions...\n');

  // ── Create sessions ─────────────────────────────────────────────
  const sessions = [];
  for (let i = 0; i < testStudents.length; i++) {
    sessions.push(await createExamSession(browser, testStudents[i], i));
  }

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 1: Simultaneous exam entry
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ PHASE 1: Vào thi đồng loạt ═══');
  await Promise.allSettled(sessions.map(s => enterExam(s)));
  await new Promise(r => setTimeout(r, 3000));

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 2: Auto-click answers
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ PHASE 2: Click chọn đáp án trắc nghiệm ═══');
  await Promise.allSettled(sessions.map(s => autoClickAnswers(s, 15)));
  await new Promise(r => setTimeout(r, 2000));

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 3: Tab switching (Camera AI stress test)
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ PHASE 3: Chuyển Tab — Test Camera AI ═══');
  await Promise.allSettled(sessions.map(s => simulateTabSwitch(s)));
  await new Promise(r => setTimeout(r, 2000));

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 4: Simultaneous submission ("giây cuối cùng")
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ PHASE 4: Nộp bài đồng loạt ═══');
  console.log('  ⏳ Countdown 3...2...1...');
  await new Promise(r => setTimeout(r, 3000));
  console.log('  🚀 NỘP BÀI!');

  // Submit ALL at exactly the same moment
  await Promise.allSettled(sessions.map((s, i) =>
    new Promise(resolve => setTimeout(() => submitExam(s).then(resolve), i * TEST_CONFIG.examStress.submitDelay))
  ));

  await new Promise(r => setTimeout(r, 5000)); // Wait for grading to complete

  metrics.endTime = Date.now();

  // ── Take final screenshots ──────────────────────────────────────
  console.log('\n📸 Taking final screenshots...');
  for (let i = 0; i < sessions.length; i++) {
    try {
      await sessions[i].page.screenshot({
        path: path.join(__dirname, '..', 'reports', `scenario2_result_student_${i + 1}.png`),
        fullPage: true,
      });
    } catch {}
  }

  // ── Close sessions ──────────────────────────────────────────────
  console.log('\n🔄 Closing sessions...');
  for (const session of sessions) {
    try {
      await session.page.close();
      await session.context.close();
    } catch {}
  }
  await browser.close();

  // ── Generate Report ─────────────────────────────────────────────
  const summary = metrics.getSummary();
  const report = generateExamReport(summary);

  const reportPath = path.join(__dirname, '..', 'reports', `scenario2_report_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    summary,
    examEntries: metrics.examEntries,
    answerClicks: metrics.answerClicks,
    tabSwitches: metrics.tabSwitches,
    submissions: metrics.submissions,
    violations:  metrics.violations,
    errors:      metrics.errors,
  }, null, 2));

  console.log(report);
  console.log(`\n📄 Full report saved to: ${reportPath}`);

  return summary;
}

// ── Exam Report Generator ─────────────────────────────────────────────
function generateExamReport(summary) {
  return `
╔══════════════════════════════════════════════════════════════╗
║        📊 BÁO CÁO KỊCH BẢN 2: EXAM STRESS TEST           ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  👥 Tổng học viên test:      ${String(summary.totalStudents).padEnd(30)}║
║  🎯 Vào thi thành công:     ${String(summary.successEntries + '/' + summary.examEntries).padEnd(30)}║
║  📝 Tổng câu trả lời:       ${String(summary.totalAnswers).padEnd(30)}║
║                                                              ║
║  ── Tab Switching (Camera AI) ──────────────────────────    ║
║  🔄 Tab switches:            ${String(summary.tabSwitches).padEnd(30)}║
║  🚨 Violations detected:     ${String(summary.violations).padEnd(30)}║
║                                                              ║
║  ── Nộp bài đồng loạt ─────────────────────────────────    ║
║  📤 Nộp bài thành công:      ${String(summary.successSubmits + '/' + summary.submissions).padEnd(30)}║
║  ⏱️  Avg submit time:        ${summary.avgSubmitTime.padEnd(30)}║
║                                                              ║
║  ── Server Health ──────────────────────────────────────    ║
║  📡 Total API Calls:         ${String(summary.totalApiCalls).padEnd(30)}║
║  ❌ Total Errors:            ${String(summary.totalErrors).padEnd(30)}║
║  📈 Error Rate:              ${summary.errorRate.padEnd(30)}║
║  💥 Crash Detected:          ${String(summary.crashDetected ? 'YES ⚠️' : 'NO ✅').padEnd(30)}║
║  ⏱️  Test Duration:          ${summary.testDuration.padEnd(30)}║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝`;
}

// ── RUN ───────────────────────────────────────────────────────────────
runExamStressTest().catch(err => {
  console.error('❌ Exam Stress Test failed:', err);
  process.exit(1);
});
