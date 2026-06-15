const API_BASE = "http://localhost:3000/api

async function apiGet(url) {
  const res = await fetch(API_BASE + url);
  return await res.json();
}

async function apiPost(url, data) {
  const res = await fetch(API_BASE + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (res.ok == false) {
    throw new Error(result.error || "请求失败");
  }
  return result;
}

async function apiPut(url, data) {
  const res = await fetch(API_BASE + url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined
  });
  const result = await res.json();
  if (res.ok == false) {
    throw new Error(result.error || "请求失败");
  }
  return result;
}

function getStatusText(status) {
  const map = {
    reported: "已上报",
    dispatched: "已派车",
    processing: "处理中",
    closed: "已关闭",
    pending: "待出发",
    in_progress: "进行中",
    completed: "已完成",
    withdrawn: "已撤回"
  };
  return map[status] || status;
}

function getStatusClass(status) {
  return "status-badge status-" + status;
}

function formatTime(dateStr) {
  if (dateStr == null) return "-";
  const d = new Date(dateStr);
  const pad = n => n.toString().padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function getSlaRemaining(deadlineStr) {
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diff = Math.round((deadline - now) / 60000);
  return diff;
}

function getSlaClass(remaining) {
  if (remaining < 0) return "sla-danger";
  if (remaining < 30) return "sla-warning";
  return "sla-ok";
}

function showModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add("show");
}

function hideModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove("show");
}

function showToast(message, type) {
  const toast = document.createElement("div");
  toast.style.cssText = "position:fixed;top:20px;right:20px;padding:1rem 1.5rem;border-radius:8px;color:white;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:slideIn 0.3s ease;";
  if (type === "error") toast.style.background = "#e74c3c";
  else if (type === "success") toast.style.background = "#27ae60";
  else toast.style.background = "#3498db";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}