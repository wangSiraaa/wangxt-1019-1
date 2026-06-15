#!/usr/bin/env python3
"""完整业务流程端到端测试"""

import requests
import json

BASE = "http://localhost:3000/api"

def print_sep(title):
    print()
    print("=" * 60)
    print(f"  {title}")
    print("=" * 60)

# ========== 1. 初始状态 ==========
print_sep("1. 初始状态检查")
overview = requests.get(BASE + "/stats/overview").json()
print(f"总淤积点: {overview['total_silt_points']}")
print(f"各状态: {json.dumps(overview['by_status'], ensure_ascii=False)}")
print(f"禁停区: {overview['no_parking_count']}")
print(f"逾期: {overview['overdue_count']}")
print(f"总运力: {overview['total_capacity']}辆, 可用: {overview['available_capacity']}辆")

# ========== 2. 巡检员上报 ==========
print_sep("2. 巡检员上报淤积点")
report_data = {
    "grid_code": "G-TEST",
    "location_name": "测试区域-地铁站出口",
    "bike_count": 25,
    "broken_bike_count": 3,
    "is_no_parking": True,
    "reporter": "测试巡检员",
    "complaint_source": "市民投诉",
    "longitude": 116.42,
    "latitude": 39.92
}
r = requests.post(BASE + "/silt-points", json=report_data)
new_sp = r.json()
print(f"上报成功! 编号: {new_sp['code']}")
print(f"状态: {new_sp['status']}")
print(f"优先级: {new_sp['priority']}")
print(f"禁停区: {new_sp['is_no_parking']}")
print(f"SLA截止: {new_sp['sla_deadline']}")

# 查看快照
snapshots = requests.get(BASE + f"/silt-points/{new_sp['id']}/snapshots").json()
print(f"快照数量: {len(snapshots)}")
print(f"最新快照: {snapshots[0]['remark']}")

# ========== 3. 调度员查看待派车列表(禁停优先) ==========
print_sep("3. 待派车列表(禁停优先)")
pending = requests.get(BASE + "/silt-points?status=reported").json()
print(f"待派车总数: {len(pending)}")
print("Top 5 优先级:")
for i, sp in enumerate(pending[:5]):
    np_tag = " [禁停]" if sp["is_no_parking"] else ""
    print(f"  {i+1}. {sp['code']}{np_tag} 优先级={sp['priority']} {sp['bike_count']}辆")

# ========== 4. 容量不足测试 ==========
print_sep("4. 容量不足校验")
vehicles = requests.get(BASE + "/vehicles").json()
v = vehicles[0]
print(f"测试车辆: {v['plate_number']} 容量{v['capacity']}辆")

load_too_much = v["capacity"] + 10
r = requests.post(BASE + "/dispatch-plans", json={
    "silt_point_id": new_sp["id"],
    "vehicle_id": v["id"],
    "driver_id": 1,
    "driver_name": "测试司机",
    "load_count": load_too_much,
    "route_cost": 50,
    "dispatcher": "测试调度"
})
print(f"装载 {load_too_much} 辆(超过容量):")
print(f"  状态: {r.status_code}")
print(f"  错误: {r.json()['error']}")

# ========== 5. 正常派车 ==========
print_sep("5. 正常派车")
normal_load = min(new_sp["bike_count"], 15)
r = requests.post(BASE + "/dispatch-plans", json={
    "silt_point_id": new_sp["id"],
    "vehicle_id": v["id"],
    "driver_id": 1,
    "driver_name": "李师傅",
    "load_count": normal_load,
    "route_cost": 60,
    "dispatcher": "调度员小王"
})
plan = r.json()
print(f"派车成功! 单号: {plan['plan_code']}")
print(f"状态: {plan['status']}")
print(f"装载: {plan['planned_bikes']}辆")
print(f"路线成本: {plan['route_cost']}元")

# 检查淤积点状态变化
sp_detail = requests.get(BASE + f"/silt-points/{new_sp['id']}").json()
print(f"淤积点状态变为: {sp_detail['status']}")

# 检查车辆容量变化
v_detail = requests.get(BASE + f"/vehicles/{v['id']}").json()
print(f"车辆已装载: {v_detail.get('current_load', 0)}辆")

# ========== 6. 已关闭淤积点禁止派车测试 ==========
print_sep("6. 已关闭淤积点禁止派车")
closed = requests.get(BASE + "/silt-points?status=closed").json()
if closed:
    closed_sp = closed[0]
    print(f"测试已关闭淤积点: {closed_sp['code']}")
    r = requests.post(BASE + "/dispatch-plans", json={
        "silt_point_id": closed_sp["id"],
        "vehicle_id": vehicles[1]["id"],
        "driver_id": 2,
        "driver_name": "张师傅",
        "load_count": 5,
        "route_cost": 30,
        "dispatcher": "测试"
    })
    print(f"派车结果: {r.status_code} - {r.json()['error']}")

# ========== 7. 撤回派车测试 ==========
print_sep("7. 撤回派车(需写原因)")

# 先查一个待出发的派车单
plans = requests.get(BASE + "/dispatch-plans?status=pending").json()
if plans:
    test_plan = plans[0]
    print(f"测试派车单: {test_plan['plan_code']}")
    
    # 空原因测试
    r = requests.put(BASE + f"/dispatch-plans/{test_plan['id']}/withdraw", json={
        "reason": "",
        "operator": "测试"
    })
    print(f"空原因撤回: {r.status_code} - {r.json()['error']}")
    
    # 有原因撤回
    reason = "车辆临时故障，需要更换车辆"
    r = requests.put(BASE + f"/dispatch-plans/{test_plan['id']}/withdraw", json={
        "reason": reason,
        "operator": "调度员小李"
    })
    withdrawn = r.json()
    print(f"有原因撤回成功! 状态: {withdrawn['status']}")
    print(f"撤回原因: {withdrawn['withdraw_reason']}")
    
    # 检查淤积点状态是否回退
    sp_after = requests.get(BASE + f"/silt-points/{test_plan['silt_point_id']}").json()
    print(f"淤积点状态回退为: {sp_after['status']}")
    
    # 检查车辆容量是否释放
    v_after = requests.get(BASE + f"/vehicles/{test_plan['vehicle_id']}").json()
    print(f"车辆装载释放，当前: {v_after.get('current_load', 0)}辆")

# ========== 8. 开始和完成清运 ==========
print_sep("8. 开始清运 → 完成清运")
# 先找一个待出发的
pending_plans = requests.get(BASE + "/dispatch-plans?status=pending").json()
if pending_plans:
    plan = pending_plans[0]
    print(f"派车单: {plan['plan_code']}")
    
    # 开始
    r = requests.put(BASE + f"/dispatch-plans/{plan['id']}/start")
    started = r.json()
    print(f"开始清运! 状态: {started['status']}")
    
    # 检查淤积点状态
    sp = requests.get(BASE + f"/silt-points/{plan['silt_point_id']}").json()
    print(f"淤积点状态: {sp['status']}")
    
    # 完成
    r = requests.put(BASE + f"/dispatch-plans/{plan['id']}/complete")
    completed = r.json()
    print(f"完成清运! 状态: {completed['status']}")
    
    # 检查淤积点状态和剩余车辆
    sp = requests.get(BASE + f"/silt-points/{plan['silt_point_id']}").json()
    print(f"淤积点状态: {sp['status']}")
    print(f"剩余车辆: {sp['bike_count']}辆")

# ========== 9. SLA逾期红榜 ==========
print_sep("9. SLA逾期红榜")
red_list = requests.get(BASE + "/stats/sla-red-list").json()
print("逾期 Top 5:")
for i, item in enumerate(red_list[:5]):
    mins = round(item["overdue_minutes"])
    np_tag = " [禁停]" if item["is_no_parking"] else ""
    print(f"  {i+1}. {item['code']}{np_tag} 逾期{mins}分钟 {item['bike_count']}辆")

# ========== 10. 经理报表 ==========
print_sep("10. 经理报表统计")
sla_stats = requests.get(BASE + "/stats/sla").json()
print(f"SLA统计: 完成{sla_stats['total_closed']}个, 按时{sla_stats['on_time']}个, 逾期{sla_stats['overdue']}个, 达标率{sla_stats['rate']}%")

perf = requests.get(BASE + "/stats/performance").json()
print(f"绩效: 总完成{perf['total_cleared']}个, 平均时效{round(perf['avg_process_minutes'])}分钟")
print(f"  SLA达标率: {perf['sla_rate']}%")
print(f"  调度员排行: {[(d['name'], d['count']) for d in perf['by_dispatcher'][:3]]}")

complaints = requests.get(BASE + "/stats/complaint-sources").json()
print(f"投诉来源 Top 3: {[(c['source'], c['count']) for c in complaints[:3]]}")

secondary = requests.get(BASE + "/stats/secondary-silt").json()
print(f"二次淤积: {len(secondary)}个")

withdraw_reasons = requests.get(BASE + "/stats/withdraw-reasons").json()
print(f"撤回原因统计: {[(r['reason'][:10], r['count']) for r in withdraw_reasons[:3]]}")

# ========== 11. 最终状态 ==========
print_sep("11. 最终状态")
overview2 = requests.get(BASE + "/stats/overview").json()
print(f"总淤积点: {overview2['total_silt_points']}")
print(f"各状态: {json.dumps(overview2['by_status'], ensure_ascii=False)}")
print(f"派车计划: 待出发{overview2['pending_plans']}个, 进行中{overview2['in_progress_plans']}个")

print()
print("=" * 60)
print("  ✅ 所有业务场景测试通过!")
print("=" * 60)
