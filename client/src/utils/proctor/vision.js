import { PROCTOR_CONFIG as CONFIG } from './config.js';

export function pointInProctorOval(nx, ny, margin = 1) {
  const dx = (nx - CONFIG.OVAL_CX) / (CONFIG.OVAL_RX * margin);
  const dy = (ny - CONFIG.OVAL_CY) / (CONFIG.OVAL_RY * margin);
  return dx * dx + dy * dy <= 1;
}

export function faceBoxMetrics(box, vw, vh) {
  const bw = box.width;
  const bh = box.height;
  const cx = (box.left + bw / 2) / vw;
  const eyeY = (box.top + bh * 0.32) / vh;
  const centerY = (box.top + bh / 2) / vh;
  const areaRatio = (bw * bh) / (vw * vh);
  const ar = bw / Math.max(bh, 1);
  return { cx, eyeY, centerY, areaRatio, ar };
}

export function faceBoxInProctorOval(box, vw, vh) {
  if (!box || !vw || !vh) return false;
  const { cx, eyeY, centerY, areaRatio, ar } = faceBoxMetrics(box, vw, vh);
  if (areaRatio < CONFIG.MIN_FACE_AREA_RATIO) return false;
  if (ar < CONFIG.MIN_FACE_BOX_ASPECT || ar > CONFIG.MAX_FACE_BOX_ASPECT) return false;
  const margin = Number(CONFIG.OVAL_FACE_MARGIN) > 0 ? CONFIG.OVAL_FACE_MARGIN : 1.15;
  // Chấp nhận nếu vùng mắt HOẶC tâm mặt nằm trong oval (nới)
  return pointInProctorOval(cx, eyeY, margin) || pointInProctorOval(cx, centerY, margin);
}

export function isSkinLike(r, g, b) {
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331364 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const sum = r + g + b + 1e-6;
  const nr = r / sum;
  const ng = g / sum;
  const rgbLoose =
    nr > 0.28 && nr < 0.68 && ng > 0.15 && ng < 0.5 && r > 40 && r > g * 0.75 && r > b * 0.85;
  const darkerTone =
    L > 18 && L < 175 && r > 22 && g > 16 && b > 10 && Math.max(r, g, b) - Math.min(r, g, b) > 8;
  const lighterTone =
    L >= 140 && L < 230 && r > 90 && g > 70 && b > 55 && Math.abs(r - g) < 55 && r >= g;
  const chromaRg = Math.max(r, g, b) - Math.min(r, g, b);
  if (chromaRg < 10 && L > 20 && L < 130) return false;
  const neutralGray = Math.abs(cb - 128) < 18 && Math.abs(cr - 128) < 18 && chromaRg < 18;
  if (neutralGray && L > 25 && L < 120) return false;
  const skinYcbcr2 = !neutralGray && cr >= 118 && cr <= 205 && cb >= 55 && cb <= 148;
  return skinYcbcr2 || rgbLoose || darkerTone || lighterTone;
}

export function faceBoxHasRealSkin(imageData, w, h, box) {
  if (!box) return false;
  const d = imageData.data;
  const x0 = Math.max(0, Math.floor(box.left));
  const y0 = Math.max(0, Math.floor(box.top));
  const x1 = Math.min(w, Math.ceil(box.left + box.width));
  const y1 = Math.min(h, Math.ceil(box.top + box.height * 0.72));
  let skinHits = 0;
  let samples = 0;

  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * w + x) * 4;
      const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (L < 12) continue;
      samples++;
      if (isSkinLike(d[i], d[i + 1], d[i + 2])) skinHits++;
    }
  }
  if (samples < 8) return false;
  return skinHits / samples >= CONFIG.MIN_BBOX_SKIN_RATIO;
}

/**
 * Windows không có landmarks — phân biệt mặt người vs ghế/vật thể bằng texture:
 * da + độ sáng trung bình + độ lệch chuẩn (có chi tiết) + vùng mắt tối hơn má.
 */
export function faceBoxLooksLikeHumanFace(imageData, w, h, box) {
  if (!box || !imageData?.data) return false;
  const d = imageData.data;
  const x0 = Math.max(0, Math.floor(box.left));
  const y0 = Math.max(0, Math.floor(box.top));
  const bw = Math.max(1, box.width);
  const bh = Math.max(1, box.height);
  const x1 = Math.min(w, Math.ceil(box.left + bw));
  const y1 = Math.min(h, Math.ceil(box.top + bh));
  const yEye1 = Math.min(y1, Math.floor(y0 + bh * 0.42));
  const yMid0 = Math.floor(y0 + bh * 0.35);
  const yMid1 = Math.min(y1, Math.floor(y0 + bh * 0.72));

  let sumL = 0;
  let sumL2 = 0;
  let samples = 0;
  let skinHits = 0;
  let upperSamples = 0;
  let upperDark = 0;
  let midSamples = 0;
  let midBright = 0;

  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      samples++;
      sumL += L;
      sumL2 += L * L;
      if (isSkinLike(r, g, b)) skinHits++;

      if (y < yEye1) {
        upperSamples++;
        if (L < 55) upperDark++;
      }
      if (y >= yMid0 && y < yMid1) {
        midSamples++;
        if (L > 70) midBright++;
      }
    }
  }

  if (samples < 24) return false;
  const avgL = sumL / samples;
  const variance = Math.max(0, sumL2 / samples - avgL * avgL);
  const stdL = Math.sqrt(variance);
  const skinRatio = skinHits / samples;
  const upperDarkRatio = upperSamples ? upperDark / upperSamples : 0;
  const midBrightRatio = midSamples ? midBright / midSamples : 0;

  // Ghế đen / bóng tối: avgL thấp
  if (avgL < (CONFIG.NO_LM_MIN_AVG_L || 42)) return false;
  if (avgL > (CONFIG.NO_LM_MAX_AVG_L || 210)) return false;
  // Mặt phẳng / ghế đồng màu: std thấp
  if (stdL < (CONFIG.NO_LM_MIN_STD_L || 14)) return false;
  // Phải có tỷ lệ da rõ (không chỉ “có box”)
  if (skinRatio < (CONFIG.NO_LM_MIN_SKIN_RATIO || 0.10)) return false;
  // Vùng mắt thường tối hơn một phần; má/miệng sáng hơn
  if (upperDarkRatio < (CONFIG.NO_LM_MIN_UPPER_DARK_RATIO || 0.04)) return false;
  if (midBrightRatio < 0.12) return false;

  return true;
}

export function measureSkinMass(imageData, w, h) {
  const d = imageData.data;
  let skinHits = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      if (L < 12) continue;
      if (!isSkinLike(r, g, b)) continue;
      skinHits++;
      sumX += x / w;
      sumY += y / h;
    }
  }
  if (skinHits < 18) return null;
  return { centroidX: sumX / skinHits, centroidY: sumY / skinHits, skinHits };
}

export function isSkinClearlyOutsideOval(imageData, w, h) {
  const mass = measureSkinMass(imageData, w, h);
  // Chỉ kết luận “da ngoài oval” khi khối da lớn và lệch rõ — tránh false positive
  if (!mass || mass.skinHits < 55) return false;
  return !pointInProctorOval(mass.centroidX, mass.centroidY, 1.05);
}

export function getLandmarkPoints(face, typeIncludes, vw, vh) {
  const landmarks = face?.landmarks;
  if (!Array.isArray(landmarks) || !vw || !vh) return [];
  const out = [];
  for (const lm of landmarks) {
    const type = String(lm?.type || '').toLowerCase();
    if (!typeIncludes.some((t) => type.includes(t))) continue;
    const locs = lm.locations || lm.location || [];
    const list = Array.isArray(locs) ? locs : [locs];
    for (const p of list) {
      if (p == null || p.x == null || p.y == null) continue;
      out.push({ nx: p.x / vw, ny: p.y / vh, x: p.x, y: p.y });
    }
  }
  return out;
}

/**
 * Mặt thật phải có cấu trúc: 2 mắt + (mũi hoặc miệng), bố cục hợp lý trong box.
 * Ghế / vật thể chỉ có boundingBox → bị loại.
 */
export function faceHasFacialStructure(face, vw, vh) {
  const box = face?.boundingBox;
  if (!box || !vw || !vh) return { ok: false, reason: 'no_box' };

  const landmarks = face?.landmarks;
  const hasLandmarkPayload = Array.isArray(landmarks) && landmarks.length > 0;
  if (!hasLandmarkPayload) {
    return { ok: false, reason: 'no_landmarks', landmarksSupported: false };
  }

  const eyes = getLandmarkPoints(face, ['eye'], vw, vh);
  const noses = getLandmarkPoints(face, ['nose'], vw, vh);
  const mouths = getLandmarkPoints(face, ['mouth'], vw, vh);

  if (eyes.length < 2) return { ok: false, reason: 'need_two_eyes', landmarksSupported: true };
  if (noses.length < 1 && mouths.length < 1) {
    return { ok: false, reason: 'need_nose_or_mouth', landmarksSupported: true };
  }

  const sortedEyes = [...eyes].sort((a, b) => a.nx - b.nx);
  const left = sortedEyes[0];
  const right = sortedEyes[sortedEyes.length - 1];
  const eyeSpan = right.nx - left.nx;
  const eyeMidY = (left.ny + right.ny) / 2;
  const eyeMidX = (left.nx + right.nx) / 2;

  // Hai mắt phải ngang nhau tương đối, khoảng cách hợp lý so với khung mặt
  if (eyeSpan < 0.02 || eyeSpan > 0.55) return { ok: false, reason: 'eye_span', landmarksSupported: true };
  if (Math.abs(left.ny - right.ny) > 0.12) return { ok: false, reason: 'eye_tilt', landmarksSupported: true };

  const boxLeft = box.left / vw;
  const boxRight = (box.left + box.width) / vw;
  const boxTop = box.top / vh;
  const boxBottom = (box.top + box.height) / vh;
  const pad = 0.04;
  const inBox = (p) => (
    p.nx >= boxLeft - pad && p.nx <= boxRight + pad
    && p.ny >= boxTop - pad && p.ny <= boxBottom + pad
  );
  if (!inBox(left) || !inBox(right)) return { ok: false, reason: 'eyes_outside_box', landmarksSupported: true };

  if (noses.length >= 1) {
    const nose = noses[0];
    if (!inBox(nose)) return { ok: false, reason: 'nose_outside_box', landmarksSupported: true };
    // Mũi nằm giữa hai mắt theo X, thấp hơn mắt
    if (Math.abs(nose.nx - eyeMidX) > eyeSpan * 0.85) return { ok: false, reason: 'nose_x', landmarksSupported: true };
    if (nose.ny < eyeMidY - 0.02) return { ok: false, reason: 'nose_above_eyes', landmarksSupported: true };
  }

  if (mouths.length >= 1) {
    const mouth = mouths[0];
    if (!inBox(mouth)) return { ok: false, reason: 'mouth_outside_box', landmarksSupported: true };
    // Miệng thấp hơn mắt (và thấp hơn mũi nếu có)
    if (mouth.ny <= eyeMidY + 0.01) return { ok: false, reason: 'mouth_above_eyes', landmarksSupported: true };
    if (noses.length >= 1 && mouth.ny < noses[0].ny - 0.01) {
      return { ok: false, reason: 'mouth_above_nose', landmarksSupported: true };
    }
    if (Math.abs(mouth.nx - eyeMidX) > eyeSpan * 1.1) return { ok: false, reason: 'mouth_x', landmarksSupported: true };
  }

  return {
    ok: true,
    reason: 'ok',
    landmarksSupported: true,
    eyes,
    noses,
    mouths,
  };
}

function facePassesValidation(face, frame, w, h, { requireOval }) {
  const box = face?.boundingBox;
  if (!box || !w || !h) return false;
  const { areaRatio, ar } = faceBoxMetrics(box, w, h);
  if (areaRatio < CONFIG.MIN_FACE_AREA_RATIO * (requireOval ? 1 : 0.75)) return false;
  if (ar < CONFIG.MIN_FACE_BOX_ASPECT * 0.85 || ar > CONFIG.MAX_FACE_BOX_ASPECT * 1.2) return false;
  if (requireOval && !faceBoxInProctorOval(box, w, h)) return false;

  const structure = faceHasFacialStructure(face, w, h);
  if (CONFIG.REQUIRE_FACE_LANDMARKS && structure.ok) {
    return true;
  }

  // Windows: không có landmarks → chỉ chấp nhận nếu texture giống mặt người thật
  if (
    structure.reason === 'no_landmarks'
    && CONFIG.ALLOW_TEXTURE_FALLBACK_WITHOUT_LANDMARKS
  ) {
    return faceBoxLooksLikeHumanFace(frame, w, h, box);
  }

  // Có landmark payload nhưng thiếu mắt/mũi/miệng → không phải mặt người
  return false;
}

export function getValidatedOvalFaces(faces, frame, w, h) {
  return (faces || []).filter((face) => facePassesValidation(face, frame, w, h, { requireOval: true }));
}

/** Mọi khuôn mặt hợp lệ trong khung (không chỉ oval) — phát hiện người thứ 2 */
export function getValidatedFrameFaces(faces, frame, w, h) {
  return (faces || []).filter((face) => facePassesValidation(face, frame, w, h, { requireOval: false }));
}

export function heuristicFacePresent(imageData, w, h) {
  const fakeBox = {
    left: (CONFIG.OVAL_CX - CONFIG.OVAL_RX) * w,
    top: (CONFIG.OVAL_CY - CONFIG.OVAL_RY) * h,
    width: CONFIG.OVAL_RX * 2 * w,
    height: CONFIG.OVAL_RY * 2 * h,
  };
  return faceBoxLooksLikeHumanFace(imageData, w, h, fakeBox);
}

/**
 * @param {ImageData} frame
 * @param {DetectedFace[]|null} faces — null chỉ khi KHÔNG có FaceDetector; [] = đã chạy, không thấy mặt
 * @param {number} w
 * @param {number} h
 * @param {{ detectorAvailable?: boolean }} [opts]
 */
export function evaluateFacePresence(frame, faces, w, h, opts = {}) {
  const detectorAvailable = opts.detectorAvailable === true || Array.isArray(faces);
  const list = Array.isArray(faces) ? faces : [];

  const ovalFaces = getValidatedOvalFaces(list, frame, w, h);
  if (ovalFaces.length > 0) return { present: true, ovalFaces };

  const frameFaces = getValidatedFrameFaces(list, frame, w, h);
  if (frameFaces.length > 0) return { present: true, ovalFaces: [] };

  // Đã có FaceDetector: không heuristic — ghế trống = không có người
  if (detectorAvailable) {
    return { present: false, ovalFaces: [] };
  }

  if (heuristicFacePresent(frame, w, h)) return { present: true, ovalFaces: [] };
  return { present: false, ovalFaces: [] };
}

export function frameLooksLikeLensBlocked(imageData, w, h) {
  const d = imageData.data;
  let sumL = 0;
  let sumL2 = 0;
  let chromaSum = 0;
  let dark = 0;
  let n = 0;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      sumL += L;
      sumL2 += L * L;
      chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
      if (L < 14) dark++;
      n++;
    }
  }
  if (n === 0) return true;
  const avgL = sumL / n;
  const variance = Math.max(0, sumL2 / n - avgL * avgL);
  const stdL = Math.sqrt(variance);
  const darkRatio = dark / n;
  const avgChroma = chromaSum / n;
  if (avgL < 10 && darkRatio > 0.8) return true;
  if (avgL < 20 && stdL < 3.5 && avgChroma < 4) return true;
  return false;
}

/** Độ sáng trung bình vùng oval (0–255) */
export function measureOvalBrightness(imageData, w, h) {
  const d = imageData.data;
  const cx = w * CONFIG.OVAL_CX;
  const cy = h * CONFIG.OVAL_CY;
  const rx = w * CONFIG.OVAL_RX;
  const ry = h * CONFIG.OVAL_RY;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const i = (y * w + x) * 4;
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      n++;
    }
  }
  return n ? sum / n : 0;
}

export function getEyePoints(face, vw, vh) {
  return getLandmarkPoints(face, ['eye'], vw, vh).map(({ nx, ny }) => ({ nx, ny }));
}

export function eyesVisibleFromFace(face, vw, vh) {
  const box = face?.boundingBox;
  if (!box || !vw || !vh) return false;
  const structure = faceHasFacialStructure(face, vw, vh);
  if (structure.ok && structure.eyes?.length >= 2) {
    const avgEyeY = structure.eyes.reduce((s, e) => s + e.ny, 0) / structure.eyes.length;
    return avgEyeY >= CONFIG.GAZE_CY_MIN && avgEyeY <= CONFIG.GAZE_CY_MAX + 0.1;
  }
  // Không có landmarks: không giả định "có mắt" — chỉ true nếu OS không hỗ trợ landmark + da trong oval
  if (structure.reason === 'no_landmarks' && faceBoxInProctorOval(box, vw, vh)) {
    const { eyeY, areaRatio } = faceBoxMetrics(box, vw, vh);
    return areaRatio >= CONFIG.MIN_FACE_AREA_RATIO && eyeY >= CONFIG.GAZE_CY_MIN && eyeY <= CONFIG.GAZE_CY_MAX + 0.1;
  }
  return false;
}

export function heuristicEyesInFrame(imageData, w, h) {
  const d = imageData.data;
  let skinHits = 0;
  let samples = 0;
  const cx = w * CONFIG.OVAL_CX;
  const cy = h * CONFIG.OVAL_CY;
  const rx = w * CONFIG.OVAL_RX;
  const ry = h * CONFIG.OVAL_RY;
  const yCut = cy + ry * 0.12;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1.15 || y > yCut) continue;
      const i = (y * w + x) * 4;
      const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (L < 8) continue;
      samples++;
      if (isSkinLike(d[i], d[i + 1], d[i + 2])) skinHits++;
    }
  }
  if (samples === 0) return false;
  return skinHits / samples >= CONFIG.MIN_EYE_SKIN_RATIO;
}

export function faceLookingStraightAtScreen(face, vw, vh) {
  const box = face?.boundingBox;
  if (!box || !vw || !vh) return false;
  const { cx, eyeY, centerY, areaRatio, ar } = faceBoxMetrics(box, vw, vh);
  if (areaRatio < CONFIG.MIN_FACE_AREA_RATIO) return false;
  if (cx < CONFIG.GAZE_CENTER_MIN || cx > CONFIG.GAZE_CENTER_MAX) return false;
  if (eyeY < CONFIG.GAZE_CY_MIN || eyeY > CONFIG.GAZE_CY_MAX + 0.1) return false;
  if (centerY > CONFIG.GAZE_CY_MAX + 0.14) return false;
  if (ar < 0.28 || ar > 1.7) return false;

  const structure = faceHasFacialStructure(face, vw, vh);
  if (structure.ok && structure.eyes?.length >= 2) {
    const sorted = [...structure.eyes].sort((a, b) => a.nx - b.nx);
    const eyeSpan = sorted[sorted.length - 1].nx - sorted[0].nx;
    const midX = (sorted[0].nx + sorted[sorted.length - 1].nx) / 2;
    const avgEyeY = structure.eyes.reduce((s, e) => s + e.ny, 0) / structure.eyes.length;
    if (Math.abs(midX - cx) > 0.16) return false;
    if (eyeSpan < 0.03 || eyeSpan > 0.55) return false;
    if (avgEyeY > CONFIG.GAZE_CY_MAX + 0.1) return false;
    return true;
  }
  // Không landmarks: chỉ coi nhìn thẳng khi box trong oval
  return structure.reason === 'no_landmarks' && faceBoxInProctorOval(box, vw, vh);
}

export function heuristicLookingStraight(imageData, w, h) {
  if (!heuristicEyesInFrame(imageData, w, h)) return false;
  const d = imageData.data;
  let sumX = 0;
  let sumY = 0;
  let skin = 0;
  const cx = w * CONFIG.OVAL_CX;
  const cy = h * CONFIG.OVAL_CY;
  const rx = w * CONFIG.OVAL_RX;
  const ry = h * CONFIG.OVAL_RY;
  const yCut = cy + ry * 0.08;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1 || y > yCut) continue;
      const i = (y * w + x) * 4;
      if (isSkinLike(d[i], d[i + 1], d[i + 2])) {
        sumX += x / w;
        sumY += y / h;
        skin++;
      }
    }
  }
  if (skin < 10) return false;
  const avgX = sumX / skin;
  const avgY = sumY / skin;
  return (
    avgX >= CONFIG.GAZE_CENTER_MIN &&
    avgX <= CONFIG.GAZE_CENTER_MAX &&
    avgY >= CONFIG.GAZE_CY_MIN &&
    avgY <= CONFIG.GAZE_CY_MAX
  );
}

export function sampleLumaGrid(imageData, w, h) {
  const cols = CONFIG.GRID_COLS;
  const rows = CONFIG.GRID_ROWS;
  const grid = new Uint8Array(cols * rows);
  const d = imageData.data;
  const cellW = w / cols;
  const cellH = h / rows;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const px = Math.min(w - 1, Math.floor((gx + 0.5) * cellW));
      const py = Math.min(h - 1, Math.floor((gy + 0.5) * cellH));
      const i = (py * w + px) * 4;
      grid[gy * cols + gx] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
  }
  return grid;
}

export function detectMotionFromGrids(prev, curr) {
  if (!prev || !curr || prev.length !== curr.length) return false;
  let changed = 0;
  for (let i = 0; i < curr.length; i++) {
    if (Math.abs(curr[i] - prev[i]) >= CONFIG.MOTION_LUMA_DELTA) changed++;
  }
  return changed / curr.length >= CONFIG.MOTION_CHANGED_RATIO;
}

export function drawMirroredVideoFrame(ctx, vid, w, h) {
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(vid, 0, 0, w, h);
  ctx.restore();
}
