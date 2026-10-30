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
  <span class="bong_tron">48</span><span class="bong_tron no-margin-right">52</span>
  <i>|</i><span class="bong_tron small no-margin-right active">49</span>
</div>
<h5>Draw ID <b>#01403</b> Date <b>26/09/2026</b></h5>
<div class="so_tien"><h3>78.500.000.000</h3><p>VNĐ</p></div>
<script>function ClientDrawResult(DrawId){}</script>
</body></html>
`;

export const SCRAPE_FIXTURE_BLOCKED = `
<html><head><title>Vietlott</title></head><body>captcha required 401</body></html>
`;

export const SCRAPE_FIXTURE_NO_DATA = `<html><body>No results here</body></html>`;

/**
 * Fixture trang lịch sử (winning-number-645) — cấu trúc thật đã xác minh 30/10/2026:
 * mỗi <tr>: <td>DD/MM/YYYY</td> + <td><a href=".../645?id=NNNN">NNNN</a></td> + 6 span bong_tron
 */
export const SCRAPE_FIXTURE_HISTORY_MEGA = `
<html><body><table class="table table-hover"><thead><tr><th>Date </th><th>Draw</th></tr></thead>
<tbody>
<tr>
  <td>28/10/2026</td>
  <td><a href="/en/trung-thuong/ket-qua-trung-thuong/645?id=01581&nocatche=1" target="_self">01581</a></td>
  <td><div class="day_so_ket_qua_v2" style="padding-top:15px">
    <span class="bong_tron ">01</span><span class="bong_tron ">09</span><span class="bong_tron ">11</span>
    <span class="bong_tron ">28</span><span class="bong_tron ">33</span><span class="bong_tron no-margin-right ">42</span>
  </div></td>
</tr>
<tr>
  <td>25/10/2026</td>
  <td><a href="/en/trung-thuong/ket-qua-trung-thuong/645?id=01580&nocatche=1" target="_self">01580</a></td>
  <td><div class="day_so_ket_qua_v2" style="padding-top:15px">
    <span class="bong_tron ">04</span><span class="bong_tron ">13</span><span class="bong_tron ">22</span>
    <span class="bong_tron ">25</span><span class="bong_tron ">40</span><span class="bong_tron no-margin-right ">41</span>
  </div></td>
</tr>
<tr>
  <td>23/10/2026</td>
  <td><a href="/en/trung-thuong/ket-qua-trung-thuong/645?id=01579&nocatche=1" target="_self">01579</a></td>
  <td><div class="day_so_ket_qua_v2" style="padding-top:15px">
    <span class="bong_tron ">02</span><span class="bong_tron ">15</span><span class="bong_tron ">19</span>
    <span class="bong_tron ">30</span><span class="bong_tron ">37</span><span class="bong_tron no-margin-right ">44</span>
  </div></td>
</tr>
</tbody></table></body></html>
`;

/**
 * Fixture trang lịch sử Power 6/55 (winning-number-655) — có dấu phân cách
 * bonus: <span class="bong_tron-sperator">|</span> rồi span bonus.
 */
export const SCRAPE_FIXTURE_HISTORY_POWER = `
<html><body><table class="table table-hover"><thead><tr><th>Date </th><th>Draw</th></tr></thead>
<tbody>
<tr>
  <td>29/10/2026</td>
  <td><a href="/en/trung-thuong/ket-qua-trung-thuong/655?id=01417&nocatche=1" target="_self">01417</a></td>
  <td><div class="day_so_ket_qua_v2" style="padding-top:15px">
    <span class="bong_tron ">09</span><span class="bong_tron ">29</span><span class="bong_tron ">33</span>
    <span class="bong_tron ">38</span><span class="bong_tron ">45</span><span class="bong_tron no-margin-right ">46</span>
    <span class="bong_tron-sperator">|</span><span class="bong_tron no-margin-right">53</span>
  </div></td>
</tr>
<tr>
  <td>27/10/2026</td>
  <td><a href="/en/trung-thuong/ket-qua-trung-thuong/655?id=01416&nocatche=1" target="_self">01416</a></td>
  <td><div class="day_so_ket_qua_v2" style="padding-top:15px">
    <span class="bong_tron ">05</span><span class="bong_tron ">11</span><span class="bong_tron ">20</span>
    <span class="bong_tron ">27</span><span class="bong_tron ">36</span><span class="bong_tron no-margin-right ">50</span>
    <span class="bong_tron-sperator">|</span><span class="bong_tron no-margin-right">07</span>
  </div></td>
</tr>
</tbody></table></body></html>
`;
