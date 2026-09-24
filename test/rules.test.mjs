import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  warrantyState,
  findActiveWarranty,
  planNewItem,
  reviewAssignment,
  registerWarranty,
  filterRepairs,
  unfinishedCost,
  pendingReworkCount
} from "../src/rules/warranty.js";

const NOW = "2026-09-24";

function doneRepair(over = {}) {
  return {
    id: "r1",
    location: "卫生间",
    title: "花洒更换",
    status: "done",
    cost: 200,
    warranty: { months: 6, master: "王师傅", completedDate: "2026-05-01" },
    reworks: [],
    logs: [],
    ...over
  };
}

test("addMonths 按日历月计算并处理月末", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-05-01", 6), "2026-11-01");
});

test("有保修资料且未到期 → 保修中", () => {
  const s = warrantyState(doneRepair(), NOW);
  assert.equal(s.active, true);
  assert.equal(s.label, "保修中");
  assert.equal(s.expireDate, "2026-11-01");
});

test("超过保修期 → 已过保", () => {
  const s = warrantyState(doneRepair({ warranty: { months: 3, master: "王师傅", completedDate: "2026-01-01" } }), NOW);
  assert.deepEqual({ active: s.active, label: s.label }, { active: false, label: "已过保" });
});

test("旧记录缺少保修资料 → 按已过保处理", () => {
  const s = warrantyState(doneRepair({ warranty: null }), NOW);
  assert.equal(s.active, false);
  assert.equal(s.reason, "无保修资料");
});

test("同位置在保的新报事挂在原单下，状态待返修", () => {
  const repairs = [doneRepair()];
  const plan = planNewItem(repairs, { location: "卫生间", title: "又漏水", cost: 999, photo: "", note: "", priority: "high" }, NOW);
  assert.equal(plan.type, "rework");
  assert.equal(plan.parent.id, "r1");
  assert.equal(plan.rework.status, "pending");
  assert.equal(plan.rework.cost, 999);
});

test("不同位置或已过保 → 作为普通新单", () => {
  const plan = planNewItem([doneRepair()], { location: "厨房", title: "漏水", cost: 100, photo: "", note: "", priority: "low", status: "todo" }, NOW);
  assert.equal(plan.type, "repair");
});

test("findActiveWarranty 只匹配同位置在保完工单", () => {
  const repairs = [
    doneRepair(),
    doneRepair({ id: "r2", location: "厨房" }),
    doneRepair({ id: "r3", warranty: { months: 1, master: "李师傅", completedDate: "2026-01-01" } })
  ];
  assert.equal(findActiveWarranty(repairs, "卫生间", NOW).id, "r1");
  assert.equal(findActiveWarranty(repairs, "厨房", NOW).id, "r2");
  assert.equal(findActiveWarranty(repairs, "阳台", NOW), null);
  // r3 已过保，同名位置也不应命中
  assert.equal(findActiveWarranty(repairs, "卫生间", "2027-01-01"), null);
});

test("原师傅接单直接进入返修中", () => {
  const rw = { status: "pending" };
  const r = reviewAssignment(rw, { master: "王师傅" }, { worker: "王师傅" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "doing");
  assert.equal(r.assignee, "王师傅");
});

test("原师傅未接手前其他人接单被退回，状态不变", () => {
  const rw = { status: "pending", logs: [] };
  const r = reviewAssignment(rw, { master: "王师傅" }, { worker: "赵师傅" });
  assert.equal(r.ok, false);
  assert.equal(r.rejected, true);
  assert.match(r.notice, /在途责任/);
  assert.equal(rw.status, "pending");
  assert.equal(r.log.kind, "reject");
});

test("换人处理登记授权人后放行", () => {
  const rw = { status: "pending" };
  const r = reviewAssignment(rw, { master: "王师傅" }, { worker: "赵师傅", authorizedBy: "房东老李" });
  assert.equal(r.ok, true);
  assert.equal(r.status, "doing");
  assert.equal(r.assignee, "赵师傅");
  assert.equal(r.authorizedBy, "房东老李");
  assert.equal(r.log.kind, "switch");
});

test("已在返修中的单不能重复接单", () => {
  const r = reviewAssignment({ status: "doing" }, { master: "王师傅" }, { worker: "王师傅" });
  assert.equal(r.ok, false);
});

test("完工登记保修要求月数和师傅", () => {
  assert.equal(registerWarranty({}, { months: 0, master: "王师傅" }, NOW).ok, false);
  assert.equal(registerWarranty({}, { months: 6, master: "" }, NOW).ok, false);
  const ok = registerWarranty({}, { months: 6, master: "王师傅" }, NOW);
  assert.equal(ok.ok, true);
  assert.equal(ok.status, "done");
  assert.deepEqual(ok.warranty.completedDate, NOW);
});

test("按待返修和已过保筛选", () => {
  const repairs = [
    doneRepair(), // 保修中
    doneRepair({ id: "r2", location: "厨房", warranty: null, reworks: [] }), // 已过保（无资料）
    doneRepair({ id: "r3", location: "阳台", reworks: [{ status: "pending" }] })
  ];
  assert.deepEqual(filterRepairs(repairs, "pending-rework", NOW).map((r) => r.id), ["r3"]);
  assert.deepEqual(filterRepairs(repairs, "warranty-expired", NOW).map((r) => r.id), ["r2"]);
});

test("待返修费用暂不计入，返修中费用计入未完成费用", () => {
  const repairs = [
    { status: "todo", cost: 300 },
    doneRepair({ reworks: [{ status: "pending", cost: 999 }] }),
    doneRepair({ id: "r4", reworks: [{ status: "doing", cost: 120 }] }),
    doneRepair({ id: "r2", cost: 200 })
  ];
  assert.equal(unfinishedCost(repairs), 300 + 120);
  assert.equal(pendingReworkCount(repairs), 1);
});
