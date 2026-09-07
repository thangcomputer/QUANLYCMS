const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadProctor() {
  const base = path.join(__dirname, '../../client/src/utils/proctor');
  const risk = await import(pathToFileURL(path.join(base, 'riskEngine.js')).href);
  const cfg = await import(pathToFileURL(path.join(base, 'config.js')).href);
  const vision = await import(pathToFileURL(path.join(base, 'vision.js')).href);
  const events = await import(pathToFileURL(path.join(base, 'eventLog.js')).href);
  return { ...risk, ...cfg, ...vision, ...events };
}

test('createConfirmTracker requires frames + duration', async () => {
  const { createConfirmTracker } = await loadProctor();
  const t = createConfirmTracker({ minFrames: 3, confirmMs: 100 });
  const t0 = Date.now();
  assert.equal(t.tick(true, t0).confirmed, false);
  assert.equal(t.tick(true, t0 + 50).confirmed, false);
  assert.equal(t.tick(true, t0 + 120).confirmed, true);
  t.reset();
  assert.equal(t.tick(false, t0 + 200).confirmed, false);
});

test('riskEngine accumulates and decays; no hard from single soft event', async () => {
  const { createRiskEngine, PROCTOR_CONFIG } = await loadProctor();
  const eng = createRiskEngine();
  const r1 = eng.add('low_light');
  assert.ok(r1.score > 0);
  assert.equal(r1.hard, false);
  // Một sự kiện nhẹ không đủ hard
  assert.ok(r1.score < PROCTOR_CONFIG.RISK_HARD_THRESHOLD);
});

test('riskEngine hard after enough weight', async () => {
  const { createRiskEngine, PROCTOR_CONFIG } = await loadProctor();
  const eng = createRiskEngine();
  let last = null;
  for (let i = 0; i < 8; i++) last = eng.add('multi_face');
  assert.ok(last.hard || last.score >= PROCTOR_CONFIG.RISK_HARD_THRESHOLD);
});

test('pointInProctorOval center is inside', async () => {
  const { pointInProctorOval, PROCTOR_CONFIG } = await loadProctor();
  assert.equal(pointInProctorOval(PROCTOR_CONFIG.OVAL_CX, PROCTOR_CONFIG.OVAL_CY), true);
  assert.equal(pointInProctorOval(0.05, 0.05), false);
});

test('resolveProctorUiStatus maps states', async () => {
  const { resolveProctorUiStatus } = await loadProctor();
  assert.equal(resolveProctorUiStatus({ cameraStatus: 'active', facePresent: true, inOval: true }).level, 'green');
  assert.equal(resolveProctorUiStatus({ cameraStatus: 'active', facePresent: false }).code, 'no_face');
  assert.equal(resolveProctorUiStatus({ cameraStatus: 'active', facePresent: true, multiFace: true }).code, 'multi_face');
  assert.equal(resolveProctorUiStatus({ cameraStatus: 'denied' }).level, 'red');
});

test('eventLog sanitizes sensitive fields', async () => {
  const { createProctorEventLog } = await loadProctor();
  const log = createProctorEventLog({ flushMs: 0 });
  log.push('camera_start', 'info', {
    streamUrl: 'blob:secret',
    frameData: 'xxx',
    deviceLabel: 'A'.repeat(80),
  });
  const ev = log.getEvents()[0];
  assert.equal(ev.detail.streamUrl, undefined);
  assert.equal(ev.detail.frameData, undefined);
  assert.ok(ev.detail.deviceLabel.length <= 40);
});

test('evaluateFacePresence rejects box-only face without landmarks (chair/object)', async () => {
  const { evaluateFacePresence, PROCTOR_CONFIG } = await loadProctor();
  const w = PROCTOR_CONFIG.DETECT_W;
  const h = PROCTOR_CONFIG.DETECT_H;
  const frame = { data: new Uint8ClampedArray(w * h * 4) };
  const faces = [{
    boundingBox: {
      left: w * 0.28,
      top: h * 0.18,
      width: w * 0.44,
      height: h * 0.55,
    },
    landmarks: [
      { type: 'eye', locations: [{ x: w * 0.4, y: h * 0.35 }] },
    ],
  }];
  const result = evaluateFacePresence(frame, faces, w, h);
  assert.equal(result.present, false);
});

test('Windows no-landmarks + black chair texture → absent', async () => {
  const { evaluateFacePresence, faceBoxLooksLikeHumanFace, PROCTOR_CONFIG } = await loadProctor();
  const w = PROCTOR_CONFIG.DETECT_W;
  const h = PROCTOR_CONFIG.DETECT_H;
  // Frame ghế đen đồng màu
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 18; data[i + 1] = 18; data[i + 2] = 20; data[i + 3] = 255;
  }
  const box = { left: w * 0.3, top: h * 0.2, width: w * 0.4, height: h * 0.5 };
  assert.equal(faceBoxLooksLikeHumanFace({ data }, w, h, box), false);
  const faces = [{ boundingBox: box, landmarks: [] }];
  const result = evaluateFacePresence({ data }, faces, w, h, { detectorAvailable: true });
  assert.equal(result.present, false);
});

test('evaluateFacePresence accepts face with eyes + nose + mouth', async () => {
  const { evaluateFacePresence, faceHasFacialStructure, PROCTOR_CONFIG } = await loadProctor();
  const w = PROCTOR_CONFIG.DETECT_W;
  const h = PROCTOR_CONFIG.DETECT_H;
  const frame = { data: new Uint8ClampedArray(w * h * 4) };
  const face = {
    boundingBox: {
      left: w * 0.3,
      top: h * 0.2,
      width: w * 0.4,
      height: h * 0.5,
    },
    landmarks: [
      { type: 'eye', locations: [{ x: w * 0.4, y: h * 0.35 }] },
      { type: 'eye', locations: [{ x: w * 0.58, y: h * 0.35 }] },
      { type: 'nose', locations: [{ x: w * 0.49, y: h * 0.48 }] },
      { type: 'mouth', locations: [{ x: w * 0.49, y: h * 0.58 }] },
    ],
  };
  assert.equal(faceHasFacialStructure(face, w, h).ok, true);
  const result = evaluateFacePresence(frame, [face], w, h);
  assert.equal(result.present, true);
});

test('evaluateFacePresence: empty detector result is absent (no heuristic)', async () => {
  const { evaluateFacePresence, PROCTOR_CONFIG } = await loadProctor();
  const w = PROCTOR_CONFIG.DETECT_W;
  const h = PROCTOR_CONFIG.DETECT_H;
  // Frame giả lập "da" trong oval — nhưng faces=[] nghĩa là detector đã chạy
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 180; data[i + 1] = 120; data[i + 2] = 100; data[i + 3] = 255;
  }
  const result = evaluateFacePresence({ data }, [], w, h);
  assert.equal(result.present, false);
});

test('proctorAudit ALLOWED_TYPES covers core events', async () => {
  const service = require('../../services/proctorAuditService');
  assert.ok(service.ALLOWED_TYPES.has('camera_start'));
  assert.ok(service.ALLOWED_TYPES.has('multi_face'));
  assert.ok(service.ALLOWED_TYPES.has('exam_terminate'));
});
