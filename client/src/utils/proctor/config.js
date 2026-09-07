/**
 * Cấu hình giám sát thi (eKYC-style): ưu tiên giảm false positive —
 * confirm dài hơn, oval rộng hơn, tin FaceDetector hơn heuristic da.
 */
export const PROCTOR_CONFIG = {
  MAX_FACE_VIOLATIONS: 5,
  MAX_TAB_WARNINGS: 2,

  /** Lấy mẫu frame — ~3.3 Hz */
  SAMPLE_INTERVAL_MS: 300,

  /** Mất mặt: phải mất liên tục khá lâu mới tính 1 lỗi cứng */
  FACE_ABSENT_CONFIRM_MS: 5500,
  FACE_ABSENT_MIN_FRAMES: 14,
  /** Không phạt mất mặt trong vài giây đầu khi vừa bật cam */
  FACE_ABSENT_START_GRACE_MS: 6000,
  /** Sau khi đã thấy mặt: chờ thêm trước khi bắt đầu đếm mất mặt */
  FACE_LOST_HYSTERESIS_MS: 1500,

  EYE_MISS_CONFIRM_MS: 5000,
  EYE_MISS_MIN_FRAMES: 12,
  GAZE_MISS_CONFIRM_MS: 4500,
  GAZE_MISS_MIN_FRAMES: 11,
  MULTI_FACE_CONFIRM_MS: 2800,
  MULTI_FACE_MIN_FRAMES: 8,
  LENS_BLOCK_CONFIRM_MS: 2000,
  LENS_BLOCK_MIN_FRAMES: 5,

  MOTION_STALE_MS: 45000,
  MOTION_GRACE_MS: 15000,
  MOTION_LUMA_DELTA: 14,
  MOTION_CHANGED_RATIO: 0.018,

  WARN_COOLDOWN_MS: 7000,
  SOFT_WARN_COOLDOWN_MS: 10000,

  /** Vùng “nhìn thẳng” rộng — ngồi lệch nhẹ / nghiêng đầu vẫn OK */
  GAZE_CENTER_MIN: 0.22,
  GAZE_CENTER_MAX: 0.78,
  OVAL_CX: 0.5,
  OVAL_CY: 0.44,
  /** Oval rộng hơn nhiều so với bản cũ (0.21 / 0.3) */
  OVAL_RX: 0.34,
  OVAL_RY: 0.42,
  /** Nới bounding-box FaceDetector so với oval */
  OVAL_FACE_MARGIN: 1.22,
  GAZE_CY_MAX: 0.68,
  GAZE_CY_MIN: 0.08,

  /** Bắt buộc cấu trúc mặt khi OS có landmarks (macOS/Android) */
  REQUIRE_FACE_LANDMARKS: true,
  /**
   * Windows Chrome không trả landmarks — chỉ chấp nhận box nếu texture giống mặt người
   * (da + độ tương phản + vùng mắt tối hơn). Ghế đen / mặt phẳng → loại.
   */
  ALLOW_TEXTURE_FALLBACK_WITHOUT_LANDMARKS: true,
  /** Ngưỡng texture khi không có landmarks (Windows) */
  NO_LM_MIN_SKIN_RATIO: 0.10,
  NO_LM_MIN_AVG_L: 42,
  NO_LM_MAX_AVG_L: 210,
  NO_LM_MIN_STD_L: 14,
  NO_LM_MIN_UPPER_DARK_RATIO: 0.04,

  DETECT_W: 320,
  DETECT_H: 240,
  /** Mặt xa cam / laptop vẫn nhận */
  MIN_FACE_AREA_RATIO: 0.01,
  MIN_FACE_BOX_ASPECT: 0.28,
  MAX_FACE_BOX_ASPECT: 1.65,
  /** Ngưỡng da thấp hơn — tránh false “không thấy mặt” với ánh sáng / tone da khác nhau */
  MIN_FACE_SKIN_RATIO: 0.028,
  MIN_EYE_SKIN_RATIO: 0.016,
  MIN_BBOX_SKIN_RATIO: 0.032,
  GRID_COLS: 18,
  GRID_ROWS: 14,

  MIN_VIDEO_WIDTH: 320,
  MIN_VIDEO_HEIGHT: 240,
  MIN_STABLE_FPS: 8,
  LOW_LIGHT_AVG_L: 22,
  GOOD_LIGHT_AVG_L: 40,

  RISK_DECAY_PER_SEC: 0.55,
  RISK_SOFT_THRESHOLD: 32,
  RISK_HARD_THRESHOLD: 88,
  RISK_WEIGHTS: {
    face_absent: 10,
    multi_face: 16,
    lens_blocked: 14,
    eye_miss: 7,
    gaze_off: 4,
    motion_stale: 10,
    tab_blur: 20,
    camera_lost: 22,
    camera_flap: 10,
    low_res: 4,
    low_fps: 3,
    low_light: 3,
    network_offline: 15,
    device_change: 12,
  },

  AUDIT_FLUSH_MS: 12000,
  AUDIT_MAX_BUFFER: 80,
  ALLOW_SNAPSHOT_CAPTURE: false,
};

export default PROCTOR_CONFIG;
