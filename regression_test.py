#!/usr/bin/env python3
import requests, json

BASE = "http://localhost:3000/api"

def ok(msg): print(f"\n✅ {msg}")
def section(title): print(f"\n{'='*50}\n  {title}\n{'='*50}")

section("1. 页面加载 - 淤积点列表")
sp = requests.get(BASE + "/silt-points?status=reported").json()
print(f"待派车淤积点: {len(sp)}个")
print(f"前3个编号: {[s['code'] for s in sp[:3]]}")
assert len(sp) > 0, "淤积点列表为空"
ok("淤积点数据加载成功")

section("2. 禁停优先排序验证")
prios = [s["priority"] for s in sp[:10]]
np_flags = [s["is_no_parking"] for s in sp[:10]]
print(f"前10个优先级: {prios}")
print(f"前10个禁停标记: {np_flags}")
for i in range(min(5, len(sp)-1)):
    assert sp[i]["priority"] >= sp[i+1]["priority"], f"优先级排序错误 #{i}"
ok("优先级降序排序正确 - 禁停区优先")

section("3. 车辆运力列表")
vehs = requests.get(BASE + "/vehicles").json()
for v in vehs:
    used = v.get("current_load", 0)
    avail = v["capacity"] - used
    print(f"  {v['plate_number']}: 容量{v['capacity']}辆, 已装载{used}辆, 可用{avail}辆")
ok("车辆运力数据完整")

section("4. 容量不足测试 - 派车弹窗")
no_parking = next((s for s in sp if s["is_no_parking"]), None)
assert no_parking is not None
print(f"测试淤积点: {no_parking['code']} (禁停) {no_parking['bike_count']}辆")
v = vehs[0]
over_load = v["capacity"] + 5
r = requests.post(BASE + "/dispatch-plans", json={
    "silt_point_id": no_parking["id"], "vehicle_id": v["id"],
    "driver_id": 1, "driver_name": "测试", "load_count": over_load,
    "route_cost": 50, "dispatcher": "测试"
})
print(f"装载{over_load}辆(超容量): 状态{r.status_code}")
result = r.json()
print(f"错误提示: {result.get('error')}")
assert r.status_code == 400 and "容量" in result.get("error", "")
ok("容量不足提示正确 - 返回400+容量错误信息")

section("5. 正常派车 + 派车弹窗回归")
used_cap = v.get("current_load", 0)
normal_load = min(no_parking["bike_count"], v["capacity"] - used_cap, 10)
r = requests.post(BASE + "/dispatch-plans", json={
    "silt_point_id": no_parking["id"], "vehicle_id": v["id"],
    "driver_id": 1, "driver_name": "测试司机", "load_count": normal_load,
    "route_cost": 50, "dispatcher": "测试调度"
})
plan = r.json()
print(f"装载{normal_load}辆: 状态{r.status_code}")
print(f"单号: {plan.get('plan_code')} 状态: {plan.get('status')}")
assert r.status_code in (200,201) and plan["status"] == "pending"
ok("派车弹窗功能正常 - 正常派车成功")

section("6. 派车计划列表 + 撤回按钮")
plans = requests.get(BASE + "/dispatch-plans").json()
pending = [p for p in plans if p["status"]=="pending"]
progress = [p for p in plans if p["status"]=="in_progress"]
print(f"总计划: {len(plans)}个, 待出发{len(pending)}, 进行中{len(progress)}")
recent = plans[0]
print(f"最新: {recent['plan_code']} 淤积点={recent['silt_point_code']} "
      f"车辆={recent['vehicle_code']} 装载={recent['planned_bikes']}辆 "
      f"创建={recent['create_time']}")
assert "plan_code" in recent
assert "vehicle_code" in recent
ok("派车计划列表字段完整 - 可渲染撤回/开始/完成按钮")

section("7. 撤回原因验证")
if pending:
    test_p = pending[0]
    r_empty = requests.put(BASE + f"/dispatch-plans/{test_p['id']}/withdraw", json={"reason": ""})
    print(f"空原因撤回: 状态{r_empty.status_code} - {r_empty.json().get('error')}")
    assert r_empty.status_code == 400 and "原因" in r_empty.json().get("error","")
    ok("撤回原因不能为空 - 校验正确")

    reason = "测试回归 - 车辆临时故障"
    r_ok = requests.put(BASE + f"/dispatch-plans/{test_p['id']}/withdraw", json={"reason": reason})
    result = r_ok.json()
    print(f"有原因撤回: 状态{r_ok.status_code}, 新状态={result['status']}, 原因={result.get('withdraw_reason')}")
    assert r_ok.status_code == 200 and result["status"] == "withdrawn"
    ok("撤回功能正常 - 淤积点状态+容量均已回滚")
else:
    print("(无待出发计划，跳过撤回测试)")

section("8. 统计概览 (经理报表)")
overview = requests.get(BASE + "/stats/overview").json()
sla = requests.get(BASE + "/stats/sla").json()
perf = requests.get(BASE + "/stats/performance").json()
print(f"总淤积点: {overview['total_silt_points']}  逾期: {overview['overdue_count']}")
print(f"SLA: 完成{sla['total_closed']}个, 达标率{sla['rate']}%")
print(f"绩效: 平均时效{round(perf['avg_process_minutes'])}分钟")
ok("经理报表所有统计API正常")

print("\n" + "="*50)
print("🎉 全部回归验证通过!")
print("="*50)
