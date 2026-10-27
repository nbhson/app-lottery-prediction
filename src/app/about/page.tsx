/**
 * Trang giới thiệu — cảnh báo rủi ro, cách tính, giới hạn dữ liệu
 */
export default function AboutPage() {
  return (
    <>
      <h1 style={{ marginBottom: "var(--space-6)" }}>Giới thiệu</h1>

      <div className="card">
        <h2 style={{ marginBottom: "var(--space-3)" }}>🎰 Về ứng dụng</h2>
        <p>
          Ứng dụng web tra cứu kết quả xổ số Vietlott (Mega 6/45, Power 6/55) và
          hiển thị các <strong>thống kê</strong> — không phải dự đoán chính xác —
          dựa trên dữ liệu lịch sử.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: "var(--space-4)" }}>⚠️ Cảnh báo rủi ro</h2>
        <ul style={{ paddingLeft: "1.25rem", lineHeight: 2 }}>
          <li>
            <strong>Xổ số là NGẪU NHIÊN hoàn toàn.</strong> Mỗi kỳ quay độc lập
            với các kỳ trước — kết quả trước KHÔNG ảnh hưởng đến kỳ sau.
          </li>
          <li>
            <strong>Dự đoán KHÔNG đảm bảo trúng.</strong> Mọi phương pháp thống
            kê chỉ mô tả quá khứ, không dự đoán được tương lai.
          </li>
          <li>
            <strong>Không nên chi tiêu quá khả năng.</strong> Chỉ chơi với số
            tiền bạn sẵn sàng mất. 18+
          </li>
          <li>
            Nếu bạn hoặc người thân có dấu hiệu nghiện cờ bạc, hãy tìm kiếm hỗ
            trợ chuyên môn.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: "var(--space-4)" }}>📊 Cách tính dự đoán</h2>

        <h3 style={{ marginTop: "var(--space-4)", color: "var(--color-primary)" }}>
          1. Tần suất (FREQUENCY)
        </h3>
        <p>
          Đếm số lần mỗi số xuất hiện trong lịch sử. Các số xuất hiện nhiều nhất
          được gọi là <em>số nóng</em>. Phương pháp chọn các số nóng.
        </p>

        <h3 style={{ marginTop: "var(--space-4)", color: "var(--color-primary)" }}>
          2. Khoảng trống (GAP)
        </h3>
        <p>
          Tính số kỳ mà mỗi số <em>chưa</em> xuất hiện. Các số lâu chưa ra được
          gọi là <em>số lạnh</em>. Phương pháp chọn các số lạnh dựa trên niềm
          tin (không chính xác) rằng &quot;số nào lâu không ra sẽ sắp ra&quot;.
        </p>

        <h3 style={{ marginTop: "var(--space-4)", color: "var(--color-primary)" }}>
          3. Kết hợp (FREQUENCY_AND_GAP)
        </h3>
        <p>
          Điểm của mỗi số = 50% tần suất chuẩn hóa + 50% khoảng trống chuẩn hóa.
          Chọn các số có điểm cao nhất.
        </p>

        <div className="warning-banner" style={{ marginTop: "var(--space-4)" }}>
          <strong>⚠️ Lưu ý:</strong> Tất cả các phương pháp trên đều{" "}
          <strong>không có cơ sở khoa học</strong> để tăng xác suất trúng. Chúng
          chỉ là mô tả thống kê của quá khứ.
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: "var(--space-4)" }}>🔌 Giới hạn dữ liệu</h2>
        <ul style={{ paddingLeft: "1.25rem", lineHeight: 2 }}>
          <li>
            Vietlott <strong>không cung cấp API công khai chính thức</strong>.
          </li>
          <li>
            Ứng dụng đồng bộ dữ liệu trực tiếp từ{" "}
            <strong>website chính thức vietlott.vn</strong> (phiên bản tiếng
            Anh) — kết quả là dữ liệu thật, không phải dữ liệu mẫu.
          </li>
          <li>
            Việc thu thập dữ liệu phải tuân thủ Điều khoản sử dụng của nguồn đó;
            khi trang thay đổi cấu trúc, sync sẽ thất bại an toàn và hiển thị
            trạng thái trên giao diện.
          </li>
          <li>
            Thống kê dựa trên số lượng kỳ có trong dữ liệu — càng nhiều kỳ, độ
            tin cậy mô tả càng cao (nhưng vẫn không tăng xác suất trúng).
          </li>
        </ul>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: "var(--space-4)" }}>⚖️ Điều khoản sử dụng</h2>
        <ul style={{ paddingLeft: "1.25rem", lineHeight: 2 }}>
          <li>Ứng dụng chỉ cung cấp thông tin và thống kê mang tính tham khảo.</li>
          <li>
            Không khuyến khích, không xúc tiến, không tổ chức cá cược/đánh bạc.
          </li>
          <li>Chỉ dành cho người từ 18 tuổi trở lên.</li>
          <li>
            Không chịu trách nhiệm với bất kỳ thiệt hại nào phát sinh từ việc sử
            dụng thông tin trong ứng dụng.
          </li>
        </ul>
      </div>
    </>
  );
}
