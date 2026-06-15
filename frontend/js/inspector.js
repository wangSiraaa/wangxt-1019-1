let currentTab = "all";
let siltPoints = [];

async function loadData() {
  try {
    const [points, stats] = await Promise.all([
      apiGet("/silt-points"),
      apiGet("/stats/overview")
    ]);
    siltPoints = points;
    updateStats(stats);
    renderList();
  } catch (e) {
    console.error(e);
    showToast("加载数据失败", "error");
  }
}

function updateStats(stats) {
  document.getElementById("stat-reported").textContent = stats.by_status.reported;
  document.getElementById("stat-processing").textContent = stats.by_status.processing;
  document.getElementById("stat-noparking").textContent = stats.no_parking_count;
  document.getElementById("stat-today").textContent = "--";
}

function switchTab(tab, el) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  renderList();
}

function renderList() {
  let filtered = [...siltPoints];
  if (currentTab === "noParking") {
    filtered = filtered.filter(s => s.is_no_parking);
  } else if (currentTab !== "all") {
    filtered = filtered.filter(s => s.status === currentTab);
  }
  const tbody = document.getElementById("silt-list");
  tbody.innerHTML = filtered.map(sp => {
    const remaining = getSlaRemaining(sp.sla_deadline);
    const slaClass = getSlaClass(remaining);
    const slaText = remaining < 0 ? ("逾期" + Math.abs(remaining) + "分钟") : (remaining + "分钟");
    const noParkingTag = sp.is_no_parking ? "<span class=\"no-parking-tag\">禁停</span>" : "";
    return `<tr>
      <td><strong>${sp.plan_code}</strong>${noParkingTag}</td>
      <td>${sp.location_name || sp.grid_code}</td>
      <td>${sp.location_name || "-"}</td>
      <td>${sp.bike_count}</td>
      <td>${sp.broken_bike_count || 0}</td>
      <td><span class=\"${getStatusClass(sp.status)}\">${getStatusText(sp.status)}</span></td>
      <td class=\"${slaClass}\">${slaText}</td>
      <td>${formatTime(sp.report_time)}</td>
    </tr>`;
  }).join("");
  if (filtered.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"8\" style=\"text-align:center;color:#999;padding:2rem;\">暂无数据</td></tr>";
  }
}

function showReportModal() {
  showModal("report-modal");
}

async function submitReport() {
  const gridCode = document.getElementById("report-grid").value;
  const gridNames = { G001: "中心广场", G002: "科技园", G003: "商业街", G004: "住宅区", G005: "地铁站" };
  const address = document.getElementById("report-address").value;
  const vehicles = parseInt(document.getElementById("report-vehicles").value) || 0;
  const faults = parseInt(document.getElementById("report-faults").value) || 0;
  const isNoParking = document.getElementById("report-noparking").checked;
  const remark = document.getElementById("report-remark").value;
  if (vehicles <= 0) {
    showToast("请输入车辆数量", "error");
    return;
  }
  try {
    const lngBase = 116.4 + Math.random() * 0.1;
    const latBase = 39.9 + Math.random() * 0.1;
    await apiPost("/silt-points", {
      grid_code: gridCode,
      location_name: gridNames[gridCode] || gridCode,
      location_name: address,
      bike_count: vehicles,
      broken_bike_count: faults,
      is_no_parking: isNoParking,
      remark: remark,
      lng: lngBase,
      lat: latBase,
      reporter: "巡检员小王"
    });
    showToast("上报成功", "success");
    hideModal("report-modal");
    loadData();
  } catch (e) {
    showToast(e.message, "error");
  }
}

loadData();
setInterval(loadData, 30000);