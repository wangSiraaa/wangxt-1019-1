let currentPlanTab = "all";
let siltPoints = [];
let vehicles = [];
let drivers = [];
let dispatchPlans = [];
let selectedSiltId = null;
let selectedPlanId = null;

async function loadAllData() {
  try {
    const [points, vehs, drvs, plans, stats] = await Promise.all([
      apiGet("/silt-points?status=reported"),
      apiGet("/vehicles"),
      apiGet("/drivers?on_duty=true"),
      apiGet("/dispatch-plans"),
      apiGet("/stats/overview")
    ]);
    siltPoints = points;
    vehicles = vehs;
    drivers = drvs;
    dispatchPlans = plans;
    updateStats(stats);
    renderPendingList();
    renderVehicles();
    renderPlans();
  } catch (e) {
    console.error(e);
  }
}

function updateStats(stats) {
  document.getElementById("stat-pending").textContent = stats.by_status.reported;
  document.getElementById("stat-progress").textContent = stats.by_status.processing + stats.by_status.dispatched;
  document.getElementById("stat-vehicles").textContent = stats.total_vehicles;
  document.getElementById("stat-capacity").textContent = stats.available_capacity + "辆";
}

function renderPendingList() {
  const sorted = [...siltPoints].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  const tbody = document.getElementById("pending-list");
  tbody.innerHTML = sorted.map(sp => {
    const remaining = getSlaRemaining(sp.sla_deadline);
    const slaClass = getSlaClass(remaining);
    const slaText = remaining < 0 ? ("逾期" + Math.abs(remaining) + "分") : (remaining + "分");
    const noParkingTag = sp.is_no_parking ? "<span class=\"no-parking-tag\">禁停</span>" : "";
    const priorityText = sp.priority >= 10 ? "<span class=\"priority-high\">高</span>" : "普通";
    return `<tr>
      <td><strong>${sp.plan_code}</strong>${noParkingTag}</td>
      <td>${sp.location_name || "-"}</td>
      <td>${sp.bike_count}辆</td>
      <td>${priorityText}</td>
      <td class=\"${slaClass}\">${slaText}</td>
      <td><button class=\"btn btn-primary btn-sm\" onclick=\"openDispatchModal(${sp.id})\">派车</button></td>
    </tr>`;
  }).join("");
  if (sorted.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"6\" style=\"text-align:center;color:#999;padding:2rem;\">暂无待派车任务</td></tr>";
  }
}

function renderVehicles() {
  const container = document.getElementById("vehicles-list");
  container.innerHTML = vehicles.map(v => {
    const used = v.current_load || 0;
    const percent = Math.round(used / v.capacity * 100);
    const available = v.capacity - used;
    return `<div style=\"padding:1rem;border-bottom:1px solid #eee;\">
      <div style=\"display:flex;justify-content:space-between;margin-bottom:0.5rem;\">
        <strong>${v.plate_number}</strong>
        <span style=\"font-size:0.85rem;color:#666;\">容量: ${v.capacity}辆</span>
      </div>
      <div class=\"capacity-bar\"><div class=\"capacity-fill\" style=\"width:${percent}%\"></div></div>
      <div style=\"display:flex;justify-content:space-between;margin-top:0.5rem;font-size:0.85rem;\">
        <span>已装载: ${used}辆</span>
        <span style=\"color:${available > 0 ? "#27ae60" : "#e74c3c"};\">可用: ${available}辆</span>
      </div>
    </div>`;
  }).join("");
}
function openDispatchModal(siltId) {
  selectedSiltId = siltId;
  const sp = siltPoints.find(s => s.id === siltId);
  if (sp == null) return;
  document.getElementById("dispatch-silt-info").value = sp.plan_code + " - " + (sp.location_name || "");
  const vehicleSelect = document.getElementById("dispatch-vehicle");
  vehicleSelect.innerHTML = vehicles.map(v => {
    const available = v.capacity - (v.current_load || 0);
    const disabled = available <= 0 ? "disabled" : "";
    return `<option value=\"${v.id}\" ${disabled}>${v.plate_number} (可用${available}辆/容量${v.capacity}辆)</option>`;
  }).join("");
  const driverSelect = document.getElementById("dispatch-driver");
  driverSelect.innerHTML = drivers.map(d => `<option value=\"${d.id}\">${d.name}</option>`).join("");
  document.getElementById("dispatch-load").value = Math.min(sp.bike_count, 20);
  updateCapacityInfo();
  showModal("dispatch-modal");
}

function updateCapacityInfo() {
  const vehicleId = parseInt(document.getElementById("dispatch-vehicle").value);
  const v = vehicles.find(x => x.id === vehicleId);
  if (v == null) return;
  const available = v.capacity - (v.current_load || 0);
  const info = document.getElementById("capacity-info");
  info.innerHTML = `车辆 <strong>${v.plate_number}</strong>：总容量 ${v.capacity}辆，已装载 ${v.current_load || 0}辆，可用 <strong style="color:${available > 0 ? "#27ae60" : "#e74c3c"};">${available}辆</strong>`;
  checkCapacity();
}

function checkCapacity() {
  const vehicleId = parseInt(document.getElementById("dispatch-vehicle").value);
  const load = parseInt(document.getElementById("dispatch-load").value) || 0;
  const v = vehicles.find(x => x.id === vehicleId);
  const warning = document.getElementById("load-warning");
  if (v) {
    const available = v.capacity - (v.current_load || 0);
    if (load > available) {
      warning.style.display = "block";
      warning.textContent = "⚠️ 超过车辆可用容量！可用 " + available + " 辆";
    } else {
      warning.style.display = "none";
    }
  }
}

async function submitDispatch() {
  const vehicleId = parseInt(document.getElementById("dispatch-vehicle").value);
  const driverId = parseInt(document.getElementById("dispatch-driver").value);
  const loadCount = parseInt(document.getElementById("dispatch-load").value) || 0;
  const routeCost = parseFloat(document.getElementById("dispatch-cost").value) || 0;
  const remark = document.getElementById("dispatch-remark").value;
  const driverName = drivers.find(d => d.id === driverId)?.name || "";
  if (loadCount <= 0) {
    showToast("请输入装载数量", "error");
    return;
  }
  try {
    await apiPost("/dispatch-plans", {
      silt_point_id: selectedSiltId,
      vehicle_id: vehicleId,
      driver_id: driverId,
      driver_name: driverName,
      load_count: loadCount,
      route_cost: routeCost,
      remark: remark,
      dispatcher: "调度员小李"
    });
    showToast("派车成功", "success");
    hideModal("dispatch-modal");
    loadAllData();
  } catch (e) {
    showToast(e.message, "error");
  }
}
function switchPlanTab(tab, el) {
  currentPlanTab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  renderPlans();
}

function renderPlans() {
  let filtered = [...dispatchPlans];
  if (currentPlanTab !== "all") {
    filtered = filtered.filter(p => p.status === currentPlanTab);
  }
  filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const tbody = document.getElementById("plans-list");
  tbody.innerHTML = filtered.map(p => {
    const noParkingTag = p.is_no_parking ? "<span class=\"no-parking-tag\">禁停</span>" : "";
    let actions = "";
    if (p.status === "pending") {
      actions = `<button class=\"btn btn-success btn-sm\" onclick=\"startPlan(${p.id})\">开始</button> 
      actions += `<button class=\"btn btn-danger btn-sm\" onclick=\"openWithdrawModal(${p.id})\">撤回</button>`;
    } else if (p.status === "in_progress") {
      actions = `<button class=\"btn btn-primary btn-sm\" onclick=\"completePlan(${p.id})\">完成</button> 
      actions += `<button class=\"btn btn-danger btn-sm\" onclick=\"openWithdrawModal(${p.id})\">撤回</button>`;
    } else if (p.status === "withdrawn") {
      actions = "<span style=\"color:#999;font-size:0.85rem;\">" + (p.withdraw_reason || "-") + "</span>";
    } else {
      actions = "<span style=\"color:#999;font-size:0.85rem;\">-</span>";
    }
    return `<tr>
      <td><strong>${p.plan_code}</strong>${noParkingTag}</td>
      <td>${p.silt_point_code}</td>
      <td>${p.vehicle_code}</td>
      <td>${p.planned_bikes}辆</td>
      <td><span class=\"${getStatusClass(p.status)}\">${getStatusText(p.status)}</span></td>
      <td>${formatTime(p.create_time)}</td>
      <td>${actions}</td>
    </tr>`;
  }).join("");
  if (filtered.length === 0) {
    tbody.innerHTML = "<tr><td colspan=\"7\" style=\"text-align:center;color:#999;padding:2rem;\">暂无数据</td></tr>";
  }
}

async function startPlan(id) {
  try {
    await apiPut("/dispatch-plans/" + id + "/start");
    showToast("已开始执行", "success");
    loadAllData();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function completePlan(id) {
  try {
    await apiPut("/dispatch-plans/" + id + "/complete");
    showToast("已完成", "success");
    loadAllData();
  } catch (e) {
    showToast(e.message, "error");
  }
}

function openWithdrawModal(planId) {
  selectedPlanId = planId;
  document.getElementById("withdraw-reason-select").value = "";
  document.getElementById("withdraw-reason-detail").value = "";
  showModal("withdraw-modal");
}

function checkWithdrawReason() {
}

async function submitWithdraw() {
  const reasonSelect = document.getElementById("withdraw-reason-select").value;
  const reasonDetail = document.getElementById("withdraw-reason-detail").value;
  const reason = reasonDetail || reasonSelect;
  if (reason.trim().length === 0) {
    showToast("请填写撤回原因", "error");
    return;
  }
  try {
    await apiPut("/dispatch-plans/" + selectedPlanId + "/withdraw", { reason: reason, operator: "调度员小李" });
    showToast("撤回成功", "success");
    hideModal("withdraw-modal");
    loadAllData();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function loadDispatchPlans() {
  try {
    dispatchPlans = await apiGet("/dispatch-plans");
    renderPlans();
  } catch (e) {
    console.error(e);
  }
}

loadAllData();
setInterval(loadAllData, 30000);