/**
 * Fixture — HTML thật từ vietlott.vn EN (đã xác minh hoạt động 27/10/2026)
 * Format chính xác: <span class="bong_tron">04</span><span class="bong_tron">13</span>...
 */

export const SCRAPE_FIXTURE_MEGA = `
<!DOCTYPE html><html><body>
<div class="day_so_ket_qua_v2">
  <span class="bong_tron">04</span><span class="bong_tron">13</span>
  <span class="bong_tron">22</span><span class="bong_tron">25</span>
  <span class="bong_tron">40</span><span class="bong_tron">41</span>
</div>
<h5>Draw ID <b>#01580</b> Date <b>25/10/2026</b></H5>
<div class="so_tien"><h3>16.103.186.000</h3><p>VNĐ</p></div>
<script>function ClientDrawResult(DrawId){}</script>
</body></html>
`;

export const SCRAPE_FIXTURE_POWER = `
<!DOCTYPE html><html><body>
<div class="day_so_ket_qua_v2">
  <span class="bong_tron">14</span><span class="bong_tron">18</span>
  <span class="bong_tron">21</span><span class="bong_tron">38</span>
  <span class="bong_tron">48</span><span class="bong_tron">52</span>
  <span class="bong_tron">49</span>
</div>
<h5>Draw ID <b>#01403</b> Date <b>26/09/2026</b></H5>
<div class="so_tien"><h3>78.500.000.000</h3><p>VNĐ</p></div>
<script>function ClientDrawResult(DrawId){}</script>
</body></html>
`;

export const SCRAPE_FIXTURE_BLOCKED = `
<html><head><title>Vietlott</title></head><body>captcha required 401</body></html>
`;

export const SCRAPE_FIXTURE_NO_DATA = `<html><body>No results here</body></html>`;
