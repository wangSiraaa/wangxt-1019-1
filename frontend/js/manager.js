let slaChart, complaintChart, heatmapChart, withdrawChart;

async function loadAllData() {
  try {
    const [overview, sla, redList, complaintSources, secondary, performance, withdrawReasons, heatmap] = await Promise.all([
      apiGet("/stats/overview"),
      apiGet("/stats/sla"),
      apiGet("/stats/sla-red-list"),
      apiGet("/stats/complaint-sources"),
      apiGet("/stats/secondary-silt"),
      apiGet("/stats/performance"),
      apiGet("/stats/withdraw-reasons"),
      apiGet("/stats/heatmap")
    ]);
    updateOverview(overview);
    updateSlaChart(sla);
    updateComplaintChart(complaintSources);
    updateRedList(redList);
    updatePerfStats(performance);
    updateHeatmap(heatmap);
    updateSecondaryList(secondary);
    updateWithdrawChart(withdrawReasons);
  } catch (e) {
    console.error(e);
  }
}

function updateOverview(stats) {
  document.getElementById("stat-total").textContent = stats.total_silt_points;
  document.getElementById("stat-closed").textContent = stats.by_status.closed;
  document.getElementById("stat-overdue").textContent = stats.overdue_count;
  document.getElementById("stat-secondary").textContent = stats.secondary_silt_count;
}

function initCharts() {
  slaChart = echarts.init(document.getElementById("sla-chart"));
  complaintChart = echarts.init(document.getElementById("complaint-chart"));
  heatmapChart = echarts.init(document.getElementById("heatmap-chart"));
  withdrawChart = echarts.init(document.getElementById("withdraw-chart"));
  window.addEventListener("resize", () => {
    slaChart.resize();
    complaintChart.resize();
    heatmapChart.resize();
    withdrawChart.resize();
  });
}

function updateSlaChart(sla) {
  const option = {
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [{
      type: "pie",
      radius: ["40%", "70%"],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: "#fff", borderWidth: 2 },
      label: { show: true, formatter: "{b}: {c} ({d}%)" },
      data: [
        { value: sla.on_time, name: "按时", itemStyle: { color: "#27ae60" } },
        { value: sla.overdue, name: "逾期", itemStyle: { color: "#e74c3c" } }
      ]
    }]
  };
  slaChart.setOption(option);
}
function updateComplaintChart(sources) {
  const sorted = [...sources].sort((a, b) => b.count - a.count);
  const colors = ["#3498db", "#e74c3c", "#f39c12", "#27ae60", "#9b59b6", "#1abc9c"];
  const option = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: sorted.map(s => s.source), axisLabel: { interval: 0, rotate: 0 } },
    yAxis: { type: "value", name: "数量" },
    series: [{
      type: "bar",
      data: sorted.map((s, i) => ({ value: s.count, itemStyle: { color: colors[i % colors.length] } })),
      barWidth: "50%"
    }]
  };
  complaintChart.setOption(option);
}

function updateRedList(list) {
  const container = document.getElementById("red-list");
  if (list.length === 0) {
    container.innerHTML = "<p style=\"text-align:center;color:#999;padding:2rem;\">暂无逾期数据</p>";
    return;
  }
  container.innerHTML = list.map((item, idx) => {
    const overdueMinutes = Math.abs(item.overdue_minutes);
    const level = overdueMinutes > 60 ? "level-danger" : (overdueMinutes > 30 ? "level-warning" : "level-normal");
    const rankColors = ["#e74c3c", "#e67e22", "#f39c12", "#3498db", "#27ae60"];
    const rankColor = rankColors[Math.min(idx, rankColors.length - 1)];
    return `<div class=\"sla-red-item ${level}\">
      <div class=\"red-rank\" style=\"background:${rankColor};\">${idx + 1}</div>
      <div class=\"red-info\">
        <div class=\"red-title\">
          <strong>${item.code}</strong>
          ${item.is_no_parking ? "<span class=\"no-parking-tag\">禁停</span>" : ""}
        </div>
        <div class=\"red-desc\">${item.location_name || "-"}</div>
      </div>
      <div class=\"red-time\">
        <div style=\"font-weight:bold;color:#e74c3c;font-size:1.1rem;\">逾期${Math.round(item.overdue_minutes)}分</div>
        <div style=\"font-size:0.8rem;color:#999;\">${item.bike_count}辆</div>
      </div>
    </div>`;
  }).join("");
}

function updatePerfStats(perf) {
  const container = document.getElementById("perf-stats");
  const avgMinutes = perf.avg_process_minutes?.toFixed?.(1) || perf.avg_process_minutes || 0;
  container.innerHTML = `
    <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;\">
      <div class=\"perf-item\">
        <div class=\"perf-label\">调度员人均处理</div>
        <div class=\"perf-value\">${perf.avg_per_dispatcher || 0}单</div>
      </div>
      <div class=\"perf-item\">
        <div class=\"perf-label\">平均处理时效</div>
        <div class=\"perf-value\">${avgMinutes}分</div>
      </div>
      <div class=\"perf-item\">
        <div class=\"perf-label\">车辆周转率</div>
        <div class=\"perf-value\">${Math.round(perf.vehicle_turnover || 0)}次/车</div>
      </div>
      <div class=\"perf-item\">
        <div class=\"perf-label\">SLA达标率</div>
        <div class=\"perf-value\" style=\"color:${(perf.sla_rate || 0) >= 90 ? "#27ae60" : "#e74c3c"};\">${(perf.sla_rate || 0).toFixed?.(1)}%</div>
      </div>
    </div>
    <div style=\"margin-top:1rem;padding-top:1rem;border-top:1px solid #eee;\">
      <div class=\"perf-label\">调度员排行</div>
      <div style=\"margin-top:0.5rem;\">
        ${(perf.by_dispatcher || []).slice(0, 3).map((d, i) => `
          <div style=\"display:flex;justify-content:space-between;padding:0.3rem 0;font-size:0.9rem;\">
            <span>${i + 1}. ${d.name}</span>
            <span style=\"color:#3498db;font-weight:bold;\">${d.count}单</span>
          </div>
        ").join("")}
      </div>
    </div>
  `;
}

function updateHeatmap(data) {
  const hours = Array.from({ length: 24 }, (_, i) => i + "时");
  const grids = Array.from(new Set(data.map(d => d.grid)));
  const heatData = [];
  grids.forEach((grid, gi) => {
    for (let hi = 0; hi < 24; hi++) {
      const item = data.find(d => d.grid === grid && d.hour === hi);
      heatData.push([hi, gi, item ? item.count : 0]);
    }
  });
  const option = {
    tooltip: { position: "top" },
    grid: { height: "60%", top: "5%" },
    xAxis: { type: "category", data: hours, splitArea: { show: true } },
    yAxis: { type: "category", data: grids, splitArea: { show: true } },
    visualMap: {
      min: 0,
      max: Math.max(...data.map(d => d.count), 5),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "5%",
      inRange: { color: ["#313695", "#4575b4", "#74add1", "#abd9e9", "#fee090", "#fdae61", "#f46d43", "#d73027", "#a50026"] }
    },
    series: [{
      name: "淤积次数",
      type: "heatmap",
      data: heatData,
      label: { show: false },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.5)" } }
    }]
  };
  heatmapChart.setOption(option);
}

function updateSecondaryList(list) {
  const container = document.getElementById("secondary-list");
  if (list.length === 0) {
    container.innerHTML = "<p style=\"text-align:center;color:#999;padding:2rem;\">暂无二次淤积数据</p>";
    return;
  }
  container.innerHTML = list.map(item => `
    <div style=\"padding:0.8rem;border-bottom:1px solid #eee;\">
      <div style=\"display:flex;justify-content:space-between;\">
        <strong>${item.code}</strong>
        <span style=\"color:#f39c12;font-size:0.85rem;\">二次淤积</span>
      </div>
      <div style=\"font-size:0.85rem;color:#666;margin:0.3rem 0;\">${item.location_name || "-"}</div>
      <div style=\"font-size:0.8rem;color:#999;\">上次关闭: ${formatTime(item.last_close_time || item.update_time)} | ${item.bike_count}辆</div>
    </div>
  `).join("");
}

function updateWithdrawChart(reasons) {
  const sorted = [...reasons].sort((a, b) => b.count - a.count).slice(0, 6);
  const option = {
    tooltip: { trigger: "item" },
    legend: { bottom: 0, type: "scroll" },
    series: [{
      type: "pie",
      radius: "60%",
      data: sorted.map(r => ({ value: r.count, name: r.reason || "其他" }))
    }]
  };
  withdrawChart.setOption(option);
}

initCharts();
loadAllData();
setInterval(loadAllData, 60000);