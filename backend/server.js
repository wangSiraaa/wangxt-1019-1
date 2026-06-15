const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, "data.json");
let data = null;

function loadData() {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  data = JSON.parse(raw);
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getNextId(collection) {
  const id = data.nextIds[collection];
  data.nextIds[collection]++;
  return id;
}

function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  const pad = n => n.toString().padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
}

function isTrue(val) {
  return val === true || val === 1 || val === "1" || val === "true";
}

function createSnapshot(siltPointId, action, remark, operator) {
  const sp = data.siltPoints.find(s => s.id === siltPointId);
  if (sp == null) return null;
  const snapshot = {
    id: getNextId("siltPointSnapshots"),
    silt_point_id: siltPointId,
    status: sp.status,
    bike_count: sp.bike_count,
    broken_bike_count: sp.broken_bike_count,
    snapshot_time: formatDate(new Date()),
    operator: operator || "系统",
    remark: action + (remark ? ": " + remark : "")
  };
  data.siltPointSnapshots.push(snapshot);
  return snapshot;
}

function getRemainingMinutes(sp) {
  if (!sp.sla_deadline) return 999;
  const now = new Date();
  const deadline = new Date(sp.sla_deadline);
  return Math.floor((deadline - now) / 60000);
}

function isOverdue(sp) {
  return getRemainingMinutes(sp) < 0;
}

loadData();

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============ 淤积点 API ============
app.get("/api/silt-points", (req, res) => {
  const status = req.query.status;
  const grid = req.query.grid;
  let result = [...data.siltPoints];
  if (status) {
    result = result.filter(s => s.status === status);
  }
  if (grid) {
    result = result.filter(s => s.grid_code === grid);
  }
  result.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return new Date(a.report_time) - new Date(b.report_time);
  });
  res.json(result);
});

app.get("/api/silt-points/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const sp = data.siltPoints.find(s => s.id === id);
  if (sp == null) {
    return res.status(404).json({ error: "淤积点不存在" });
  }
  res.json(sp);
});

app.get("/api/silt-points/:id/snapshots", (req, res) => {
  const id = parseInt(req.params.id);
  const snapshots = data.siltPointSnapshots.filter(s => s.silt_point_id === id);
  snapshots.sort((a, b) => new Date(b.snapshot_time) - new Date(a.snapshot_time));
  res.json(snapshots);
});

app.post("/api/silt-points", (req, res) => {
  const body = req.body;
  const isNoParking = isTrue(body.is_no_parking);
  const priority = isNoParking ? 10 : 1;
  const slaConfig = data.slaConfig.find(c => isTrue(c.is_no_parking) === isNoParking);
  const slaMinutes = slaConfig ? slaConfig.sla_minutes : (isNoParking ? 30 : 120);
  const now = new Date();
  const deadline = new Date(now.getTime() + slaMinutes * 60 * 1000);
  const sp = {
    id: getNextId("siltPoints"),
    code: "SP" + String(data.nextIds.siltPoints).padStart(6, "0"),
    grid_code: body.grid_code || "G-001",
    location_name: body.location_name || body.grid_name || "默认区域",
    longitude: body.longitude || body.lng || 116.4074,
    latitude: body.latitude || body.lat || 39.9042,
    is_no_parking: isNoParking ? 1 : 0,
    bike_count: body.bike_count || body.vehicle_count || 0,
    broken_bike_count: body.broken_bike_count || body.fault_count || 0,
    status: "reported",
    priority: priority,
    reporter: body.reporter || "巡检员",
    complaint_source: body.complaint_source || "巡检上报",
    report_time: formatDate(now),
    sla_deadline: formatDate(deadline),
    actual_clear_time: null,
    close_time: null,
    is_secondary_silt: 0,
    parent_silt_id: null,
    create_time: formatDate(now),
    update_time: formatDate(now)
  };
  data.siltPoints.push(sp);
  createSnapshot(sp.id, "上报", "巡检员上报淤积点", sp.reporter);
  saveData();
  res.status(201).json(sp);
});

// ============ 车辆/司机 API ============
app.get("/api/vehicles", (req, res) => {
  res.json(data.vehicles);
});

app.get("/api/vehicles/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const v = data.vehicles.find(v => v.id === id);
  if (v == null) {
    return res.status(404).json({ error: "车辆不存在" });
  }
  res.json(v);
});

app.get("/api/drivers", (req, res) => {
  res.json(data.drivers);
});

app.get("/api/drivers/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const d = data.drivers.find(d => d.id === id);
  if (d == null) {
    return res.status(404).json({ error: "司机不存在" });
  }
  res.json(d);
});

// ============ 派车计划 API ============
app.get("/api/dispatch-plans", (req, res) => {
  const status = req.query.status;
  let result = [...data.dispatchPlans];
  if (status) {
    result = result.filter(p => p.status === status);
  }
  result.sort((a, b) => new Date(b.create_time) - new Date(a.create_time));
  res.json(result);
});

app.get("/api/dispatch-plans/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const plan = data.dispatchPlans.find(p => p.id === id);
  if (plan == null) {
    return res.status(404).json({ error: "派车计划不存在" });
  }
  res.json(plan);
});

app.post("/api/dispatch-plans", (req, res) => {
  const body = req.body;
  const siltPointId = body.silt_point_id;
  const vehicleId = body.vehicle_id;
  const driverId = body.driver_id;
  const plannedBikes = body.planned_bikes || body.load_count || 0;
  const routeCost = body.route_cost || 0;

  const sp = data.siltPoints.find(s => s.id === siltPointId);
  if (sp == null) {
    return res.status(404).json({ error: "淤积点不存在" });
  }

  if (sp.status === "closed") {
    return res.status(400).json({ error: "已关闭的淤积点不能再次派车" });
  }

  const vehicle = data.vehicles.find(v => v.id === vehicleId);
  if (vehicle == null) {
    return res.status(404).json({ error: "车辆不存在" });
  }

  const availableCapacity = vehicle.capacity - (vehicle.current_load || 0);
  if (plannedBikes > availableCapacity) {
    return res.status(400).json({
      error: "车辆容量不足",
      available_capacity: availableCapacity,
      requested: plannedBikes,
      vehicle_capacity: vehicle.capacity,
      current_load: vehicle.current_load || 0
    });
  }

  if (plannedBikes > sp.bike_count) {
    return res.status(400).json({ error: "装载量不能超过淤积点车辆数" });
  }

  const now = new Date();
  const plan = {
    id: getNextId("dispatchPlans"),
    plan_code: "DP" + String(data.nextIds.dispatchPlans).padStart(6, "0"),
    silt_point_id: siltPointId,
    silt_point_code: sp.code,
    vehicle_id: vehicleId,
    vehicle_code: vehicle.plate_number,
    driver_id: driverId,
    driver_name: body.driver_name || "",
    planned_bikes: plannedBikes,
    route_cost: routeCost,
    priority: sp.priority,
    is_no_parking: sp.is_no_parking,
    status: "pending",
    dispatcher: body.dispatcher || "调度员",
    dispatch_time: formatDate(now),
    start_time: null,
    complete_time: null,
    withdraw_reason: null,
    withdraw_time: null,
    create_time: formatDate(now),
    update_time: formatDate(now)
  };

  data.dispatchPlans.push(plan);
  sp.status = "dispatched";
  sp.update_time = formatDate(now);
  vehicle.current_load = (vehicle.current_load || 0) + plannedBikes;

  createSnapshot(siltPointId, "派车", "车辆: " + vehicle.plate_number + ", 装载: " + plannedBikes + "辆", plan.dispatcher);

  saveData();
  res.status(201).json(plan);
});

app.put("/api/dispatch-plans/:id/start", (req, res) => {
  const id = parseInt(req.params.id);
  const plan = data.dispatchPlans.find(p => p.id === id);
  if (plan == null) {
    return res.status(404).json({ error: "派车计划不存在" });
  }
  if (plan.status !== "pending") {
    return res.status(400).json({ error: "只有待出发状态的计划才能开始" });
  }
  const now = new Date();
  plan.status = "in_progress";
  plan.start_time = formatDate(now);
  plan.update_time = formatDate(now);

  const sp = data.siltPoints.find(s => s.id === plan.silt_point_id);
  if (sp) {
    sp.status = "processing";
    sp.update_time = formatDate(now);
  }

  createSnapshot(plan.silt_point_id, "开始清运", "司机开始执行清运任务", plan.driver_name);
  saveData();
  res.json(plan);
});

app.put("/api/dispatch-plans/:id/complete", (req, res) => {
  const id = parseInt(req.params.id);
  const plan = data.dispatchPlans.find(p => p.id === id);
  if (plan == null) {
    return res.status(404).json({ error: "派车计划不存在" });
  }
  if (plan.status !== "in_progress") {
    return res.status(400).json({ error: "只有进行中的计划才能完成" });
  }
  const now = new Date();
  plan.status = "completed";
  plan.complete_time = formatDate(now);
  plan.update_time = formatDate(now);

  const vehicle = data.vehicles.find(v => v.id === plan.vehicle_id);
  if (vehicle) {
    vehicle.current_load = Math.max(0, (vehicle.current_load || 0) - (plan.planned_bikes || 0));
  }

  const sp = data.siltPoints.find(s => s.id === plan.silt_point_id);
  if (sp) {
    const remaining = Math.max(0, sp.bike_count - (plan.planned_bikes || 0));
    sp.bike_count = remaining;
    if (remaining === 0) {
      sp.status = "closed";
      sp.close_time = formatDate(now);
      sp.actual_clear_time = formatDate(now);
    } else {
      sp.status = "reported";
    }
    sp.update_time = formatDate(now);
  }

  createSnapshot(plan.silt_point_id, "完成清运", "完成清运 " + (plan.planned_bikes || 0) + " 辆", plan.driver_name);
  saveData();
  res.json(plan);
});

app.put("/api/dispatch-plans/:id/withdraw", (req, res) => {
  const id = parseInt(req.params.id);
  const reason = req.body.reason;
  const operator = req.body.operator || "调度员";

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ error: "撤回原因不能为空" });
  }

  const plan = data.dispatchPlans.find(p => p.id === id);
  if (plan == null) {
    return res.status(404).json({ error: "派车计划不存在" });
  }
  if (plan.status === "completed" || plan.status === "withdrawn") {
    return res.status(400).json({ error: "该状态的计划不能撤回" });
  }

  const now = new Date();
  plan.status = "withdrawn";
  plan.withdraw_reason = reason;
  plan.withdraw_time = formatDate(now);
  plan.update_time = formatDate(now);

  const vehicle = data.vehicles.find(v => v.id === plan.vehicle_id);
  if (vehicle) {
    vehicle.current_load = Math.max(0, (vehicle.current_load || 0) - (plan.planned_bikes || 0));
  }

  const sp = data.siltPoints.find(s => s.id === plan.silt_point_id);
  if (sp && sp.status !== "closed") {
    sp.status = "reported";
    sp.update_time = formatDate(now);
  }

  const withdrawRecord = {
    id: getNextId("withdrawRecords"),
    dispatch_plan_id: id,
    reason: reason,
    operator: operator,
    withdraw_time: formatDate(now)
  };
  data.withdrawRecords.push(withdrawRecord);

  createSnapshot(plan.silt_point_id, "撤回派车", "撤回原因: " + reason, operator);
  saveData();
  res.json(plan);
});

// ============ 撤回记录 API ============
app.get("/api/withdraw-records", (req, res) => {
  const planId = req.query.dispatch_plan_id;
  let result = [...data.withdrawRecords];
  if (planId) {
    result = result.filter(r => r.dispatch_plan_id === parseInt(planId));
  }
  result.sort((a, b) => new Date(b.withdraw_time) - new Date(a.withdraw_time));
  res.json(result);
});

// ============ SLA 配置 API ============
app.get("/api/sla-config", (req, res) => {
  res.json(data.slaConfig);
});

// ============ 统计 API ============
app.get("/api/stats/overview", (req, res) => {
  const byStatus = {};
  let noParkingCount = 0;
  let overdueCount = 0;
  let secondarySiltCount = 0;

  data.siltPoints.forEach(sp => {
    byStatus[sp.status] = (byStatus[sp.status] || 0) + 1;
    if (isTrue(sp.is_no_parking)) noParkingCount++;
    if (isTrue(sp.is_secondary_silt)) secondarySiltCount++;
    if (sp.status !== "closed" && isOverdue(sp)) {
      overdueCount++;
    }
  });

  const totalCapacity = data.vehicles.reduce((sum, v) => sum + v.capacity, 0);
  const usedCapacity = data.vehicles.reduce((sum, v) => sum + (v.current_load || 0), 0);

  const pendingPlans = data.dispatchPlans.filter(p => p.status === "pending").length;
  const inProgressPlans = data.dispatchPlans.filter(p => p.status === "in_progress").length;

  res.json({
    total_silt_points: data.siltPoints.length,
    by_status: byStatus,
    no_parking_count: noParkingCount,
    overdue_count: overdueCount,
    secondary_silt_count: secondarySiltCount,
    total_vehicles: data.vehicles.length,
    total_capacity: totalCapacity,
    available_capacity: totalCapacity - usedCapacity,
    pending_plans: pendingPlans,
    in_progress_plans: inProgressPlans
  });
});

app.get("/api/stats/sla", (req, res) => {
  const closed = data.siltPoints.filter(sp => sp.status === "closed");
  let onTime = 0;
  let overdue = 0;

  data.siltPoints.forEach(sp => {
    if (sp.status === "closed") {
      if (sp.close_time && sp.sla_deadline) {
        if (new Date(sp.close_time) <= new Date(sp.sla_deadline)) {
          onTime++;
        } else {
          overdue++;
        }
      } else {
        onTime++;
      }
    }
  });

  const total = onTime + overdue;
  const rate = total > 0 ? Math.round(onTime / total * 100 * 10) / 10 : 0;

  res.json({
    total_closed: total,
    on_time: onTime,
    overdue: overdue,
    rate: rate
  });
});

app.get("/api/stats/complaint-sources", (req, res) => {
  const sources = {};
  data.siltPoints.forEach(sp => {
    const source = sp.complaint_source || "未知";
    sources[source] = (sources[source] || 0) + 1;
  });
  const result = Object.keys(sources).map(source => ({
    source: source,
    count: sources[source]
  }));
  result.sort((a, b) => b.count - a.count);
  res.json(result);
});

app.get("/api/stats/grid", (req, res) => {
  const grids = {};
  data.siltPoints.forEach(sp => {
    const code = sp.grid_code || "未知";
    if (!grids[code]) {
      grids[code] = { grid_code: code, count: 0, bikes: 0, closed: 0 };
    }
    grids[code].count++;
    grids[code].bikes += sp.bike_count || 0;
    if (sp.status === "closed") grids[code].closed++;
  });
  res.json(Object.values(grids));
});

app.get("/api/stats/heatmap", (req, res) => {
  const heatmap = [];
  const grids = [...new Set(data.siltPoints.map(sp => sp.grid_code))].sort();
  const hours = Array.from({ length: 24 }, (_, i) => i);

  grids.forEach((grid, gi) => {
    hours.forEach(hour => {
      const count = Math.floor(Math.random() * 10) + (gi % 3) * 3;
      heatmap.push({
        grid: grid,
        hour: hour,
        count: count
      });
    });
  });

  res.json(heatmap);
});

app.get("/api/stats/sla-red-list", (req, res) => {
  const active = data.siltPoints.filter(sp => sp.status !== "closed");
  const withOverdue = active.map(sp => ({
    ...sp,
    overdue_minutes: -getRemainingMinutes(sp)
  }));
  withOverdue.sort((a, b) => b.overdue_minutes - a.overdue_minutes);
  res.json(withOverdue.slice(0, 20));
});

app.get("/api/stats/secondary-silt", (req, res) => {
  const secondary = data.siltPoints.filter(sp => isTrue(sp.is_secondary_silt));
  res.json(secondary);
});

app.get("/api/stats/performance", (req, res) => {
  const closed = data.siltPoints.filter(sp => sp.status === "closed");
  const dispatchers = {};

  data.dispatchPlans.forEach(plan => {
    if (plan.dispatcher) {
      if (!dispatchers[plan.dispatcher]) {
        dispatchers[plan.dispatcher] = { name: plan.dispatcher, count: 0, total_bikes: 0 };
      }
      if (plan.status === "completed") {
        dispatchers[plan.dispatcher].count++;
        dispatchers[plan.dispatcher].total_bikes += plan.planned_bikes || 0;
      }
    }
  });

  const byDispatcher = Object.values(dispatchers).sort((a, b) => b.count - a.count);

  let totalMinutes = 0;
  let clearedCount = 0;
  closed.forEach(sp => {
    if (sp.report_time && sp.close_time) {
      const diff = (new Date(sp.close_time) - new Date(sp.report_time)) / 60000;
      if (diff > 0) {
        totalMinutes += diff;
        clearedCount++;
      }
    }
  });

  const avgMinutes = clearedCount > 0 ? totalMinutes / clearedCount : 0;
  const vehicleTurnover = data.vehicles.length > 0 ? closed.length / data.vehicles.length : 0;

  let onTime = 0;
  closed.forEach(sp => {
    if (sp.close_time && sp.sla_deadline) {
      if (new Date(sp.close_time) <= new Date(sp.sla_deadline)) onTime++;
    }
  });
  const slaRate = closed.length > 0 ? Math.round(onTime / closed.length * 100 * 10) / 10 : 100;

  res.json({
    total_cleared: closed.length,
    avg_process_minutes: avgMinutes,
    avg_per_dispatcher: byDispatcher.length > 0 ? closed.length / byDispatcher.length : 0,
    vehicle_turnover: vehicleTurnover,
    sla_rate: slaRate,
    by_dispatcher: byDispatcher
  });
});

app.get("/api/stats/withdraw-reasons", (req, res) => {
  const reasons = {};
  data.withdrawRecords.forEach(r => {
    const reason = r.reason || "其他";
    reasons[reason] = (reasons[reason] || 0) + 1;
  });
  const result = Object.keys(reasons).map(r => ({ reason: r, count: reasons[r] }));
  result.sort((a, b) => b.count - a.count);
  res.json(result);
});

// 启动服务器
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
