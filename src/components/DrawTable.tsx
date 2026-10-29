/**
 * DrawTable — bảng lịch sử kết quả (kỳ, ngày, bộ số, jackpot).
 * Dùng chung cho /history và nơi khác cần liệt kê kỳ quay.
 */
import { DrawResult } from "@/types/lottery";
import LotteryBall from "@/components/LotteryBall";
import { formatDate, formatVnd } from "@/lib/format";

export default function DrawTable({ draws }: { draws: DrawResult[] }) {
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Kỳ</th>
            <th scope="col">Ngày</th>
            <th scope="col">Kết quả</th>
            <th scope="col">Jackpot</th>
          </tr>
        </thead>
        <tbody>
          {draws.map((draw) => (
            <tr key={draw.id}>
              <td className="mono">{draw.drawNumber}</td>
              <td>{formatDate(draw.drawDate)}</td>
              <td>
                <div className="ball-cell">
                  {draw.numbers.map((n, i) => (
                    <LotteryBall key={`${draw.id}-${n}-${i}`} n={n} size="sm" />
                  ))}
                  {draw.bonusNumber !== undefined && (
                    <LotteryBall n={draw.bonusNumber} bonus size="sm" />
                  )}
                </div>
              </td>
              <td>
                {draw.jackpot > 0 ? (
                  <span className="badge badge-success">{formatVnd(draw.jackpot)}</span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
