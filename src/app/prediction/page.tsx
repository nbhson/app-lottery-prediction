/**
 * Trang dự đoán — Server Component:
 * tạo dự đoán ban đầu qua prediction-service (dùng chung với /api/prediction,
 * gồm cả accuracy logging) + accuracy stats — render ngay lần đầu.
 * Phần tương tác (đổi loại hình/phương pháp) ở PredictionClient.
 */
import { computePrediction, parsePredictionMethod } from "@/lib/prediction-service";
import { getAccuracyStats } from "@/lib/accuracy";
import { parseLotteryTypeParam } from "@/lib/validate";
import PredictionClient from "@/components/PredictionClient";

export const dynamic = "force-dynamic";

export default async function PredictionPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; method?: string }>;
}) {
  const sp = await searchParams;
  const type = parseLotteryTypeParam(sp.type ?? null) ?? "MEGA_645";
  const method = parsePredictionMethod(sp.method ?? null);

  let initData = null;
  let accuracy = null;
  try {
    const result = computePrediction(type, method);
    if (!("error" in result)) {
      initData = {
        prediction: result.data,
        hotNumbers: result.hotNumbers,
        coldNumbers: result.coldNumbers,
      };
    }
    accuracy = getAccuracyStats(type);
  } catch (error) {
    console.error("[prediction page] Lỗi render server:", error);
  }

  return (
    <PredictionClient
      initialType={type}
      initialMethod={method}
      initialData={initData}
      initialAccuracy={accuracy}
    />
  );
}
