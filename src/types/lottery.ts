// Nguồn dữ liệu Vietlott
// ============================================================
// Vietlott KHÔNG cung cấp API công khai chính thức.
// Ứng dụng chạy với tập dữ liệu mẫu (sample data) kèm thông báo
// "chưa kết nối nguồn". Cần xác nhận nguồn dữ liệu trước khi triển khai thực tế.
//
// Các nguồn tiềm năng cần xác minh:
// 1. Website chính thức Vietlott (vietlott.vn) — cần kiểm tra Điều khoản sử dụng
// 2. Trang kết quả xổ số (xosovn.vn, vietlott.vn/result) — scraping với consent
// 3. Dịch vụ bên thứ 3 (nếu có) — cần đăng ký API key
// ============================================================

export type LotteryType = "MEGA_645" | "POWER_655";

export interface DrawResult {
  id: number;
  drawNumber: string;
  lotteryType: LotteryType;
  drawDate: string; // ISO date-only string "YYYY-MM-DD" (ngày quay theo lịch VN — không mang giờ)
  numbers: number[]; // 6 số cho Mega 6/45
  bonusNumber?: number; // số đặc biệt cho Power 6/55
  jackpot: number; // giải jackpot (VNĐ)
  published: boolean; // đã có kết quả chính thức
}

export interface Prediction {
  numbers: number[];
  method: "FREQUENCY" | "GAP" | "FREQUENCY_AND_GAP";
  confidence: number; // 0-100, chỉ mang tính tương đối
  description: string;
  lotteryType: LotteryType;
}

export interface FrequencyStats {
  number: number;
  count: number; // số lần xuất hiện
  lastAppeared: string; // ISO date
  gap: number; // số kỳ chưa xuất hiện
}

// Quy tắc mỗi loại hình
export const LOTTERY_RULES: Record<
  LotteryType,
  {
    name: string;
    nameVi: string;
    totalNumbers: number;
    pickCount: number;
    minNumber: number;
    maxNumber: number;
    hasBonusNumber: boolean;
    bonusMin?: number;
    bonusMax?: number;
  }
> = {
  MEGA_645: {
    name: "Mega 6/45",
    nameVi: "Mega 6/45",
    totalNumbers: 45,
    pickCount: 6,
    minNumber: 1,
    maxNumber: 45,
    hasBonusNumber: false,
  },
  POWER_655: {
    name: "Power 6/55",
    nameVi: "Power 6/55",
    totalNumbers: 55,
    pickCount: 6,
    minNumber: 1,
    maxNumber: 55,
    hasBonusNumber: true,
    bonusMin: 1,
    bonusMax: 55,
  },
};

// Múi giờ Việt Nam
export const TIMEZONE_VN = "Asia/Ho_Chi_Minh";

// Trạng thái nguồn dữ liệu
export interface DataSourceStatus {
  connected: boolean;
  source: string;
  lastSync: string | null;
  recordCount: number;
  note?: string;
}

// ============================================================
// Thống kê nâng cao (client-safe types — KHÔNG import lib/db vào đây)
// ============================================================

/** Cặp số cùng xuất hiện trong 1 kỳ + số lần đồng xuất hiện */
export interface PairStat {
  a: number; // luôn < b
  b: number;
  count: number;
}

export interface PairMatrixResult {
  pairs: PairStat[]; // chỉ chứa cặp có count > 0 (danh sách thưa)
  maxCount: number;
  drawsAnalyzed: number;
}
