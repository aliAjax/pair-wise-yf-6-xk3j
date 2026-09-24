// 保修跟进规则层：只放业务规则，不依赖 DOM、localStorage，便于单独测试。

export const REPAIR_STATUSES = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成"
};

export const REWORK_STATUSES = {
  pending: "待返修",
  doing: "返修中",
  done: "返修完成"
};

export const PRIORITIES = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- 日期 ----------

// 按日历月加 N 个月（完工日 1 月 31 日 + 1 个月 → 2 月最后一天）。
export function addMonths(dateText, months) {
  const base = new Date(`${dateText}T00:00:00`);
  const target = new Date(base.getFullYear(), base.getMonth() + Number(months), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  return toDateText(target);
}

export function todayText(now = new Date()) {
  return toDateText(now);
}

function toDateText(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------- 保修状态 ----------

// 旧记录没有保修资料：视为已过保（缺月数/师傅/完工日任一均算资料缺失）。
export function warrantyState(repair, nowText = todayText()) {
  const w = repair && repair.warranty;
  if (!w || !w.months || !w.master || !w.completedDate) {
    return { active: false, label: "已过保", reason: "无保修资料" };
  }
  const expireDate = addMonths(w.completedDate, w.months);
  if (nowText > expireDate) {
    return { active: false, label: "已过保", reason: `保修期至 ${expireDate}` };
  }
  const days = Math.max(0, Math.round((new Date(`${expireDate}T00:00:00`) - new Date(`${nowText}T00:00:00`)) / DAY_MS));
  return { active: true, label: "保修中", expireDate, daysLeft: days };
}

// 同一位置、在保修期内的最近一单（完工单）。
export function findActiveWarranty(repairs, location, nowText = todayText()) {
  const place = location.trim();
  return repairs
    .filter((r) => r.status === "done" && r.location.trim() === place && warrantyState(r, nowText).active)
    .sort((a, b) => b.warranty.completedDate.localeCompare(a.warranty.completedDate))[0] || null;
}

// ---------- 新事项分流 ----------

// 同位置在保 → 新事项挂在原单下，先记“待返修”；否则作为普通新维修单。
// 待返修暂不计入未完成费用，所以分流逻辑本身不改任何费用字段。
export function planNewItem(repairs, data, nowText = todayText()) {
  const parent = findActiveWarranty(repairs, data.location, nowText);
  if (parent) {
    return {
      type: "rework",
      parent,
      rework: {
        id: crypto.randomUUID(),
        title: data.title,
        cost: Number(data.cost || 0),
        photo: data.photo,
        note: data.note,
        priority: data.priority,
        status: "pending",
        createdAt: new Date().toISOString(),
        assignee: "",
        authorizedBy: "",
        logs: [
          {
            at: new Date().toISOString(),
            kind: "info",
            text: `同位置在保（至 ${warrantyState(parent, nowText).expireDate}），挂在 ${parent.warranty.master} 的完工单下，状态：待返修`
          }
        ]
      }
    };
  }
  return {
    type: "repair",
    repair: {
      id: crypto.randomUUID(),
      location: data.location.trim(),
      title: data.title.trim(),
      priority: data.priority,
      cost: Number(data.cost || 0),
      status: data.status,
      photo: data.photo,
      note: data.note,
      reworks: [],
      logs: [{ at: new Date().toISOString(), kind: "info", text: "登记维修事项" }]
    }
  };
}

// ---------- 接单 / 换人规则 ----------

// 原师傅未接手前，其他人接单会被退回并提示“在途责任”；换人必须登记授权人。
// 返回 { ok, status?, assignee?, authorizedBy?, log, notice }
export function reviewAssignment(rework, warranty, input) {
  const worker = (input.worker || "").trim();
  const authorizedBy = (input.authorizedBy || "").trim();
  const stamp = new Date().toISOString();

  if (!worker) {
    return { ok: false, notice: "请填写接单师傅" };
  }
  if (rework.status !== "pending") {
    return { ok: false, notice: "该返修已有人接手，不能重复接单" };
  }
  if (worker === warranty.master) {
    return {
      ok: true,
      status: "doing",
      assignee: worker,
      authorizedBy: "",
      log: { at: stamp, kind: "info", text: `原师傅 ${worker} 接手返修` },
      notice: `原师傅 ${worker} 已接手`
    };
  }
  if (!authorizedBy) {
    // 退回：状态保持“待返修”，只留痕、不改费用。
    return {
      ok: false,
      rejected: true,
      log: { at: stamp, kind: "reject", text: `在途责任：${worker} 尝试接单被退回，需原师傅 ${warranty.master} 先接手，或登记授权人后换人` },
      notice: `已退回：在途责任属于原师傅 ${warranty.master}。请由原师傅接手，或在“授权人”栏登记后换人处理。`
    };
  }
  return {
    ok: true,
    status: "doing",
    assignee: worker,
    authorizedBy,
    log: { at: stamp, kind: "switch", text: `换人处理：${worker} 接单，授权人 ${authorizedBy}` },
    notice: `已换人：${worker} 接单（授权人 ${authorizedBy}）`
  };
}

export function completeRework(rework) {
  return {
    status: "done",
    log: { at: new Date().toISOString(), kind: "info", text: "返修完成" }
  };
}

export function registerWarranty(repair, input, nowText = todayText()) {
  const months = Number(input.months);
  const master = (input.master || "").trim();
  const completedDate = input.completedDate || nowText;
  if (!months || months <= 0) return { ok: false, notice: "请填写保修月数" };
  if (!master) return { ok: false, notice: "请填写完工师傅" };
  return {
    ok: true,
    status: "done",
    warranty: { months, master, completedDate },
    log: {
      at: new Date().toISOString(),
      kind: "info",
      text: repair.warranty
        ? `补登保修：${master}，保修 ${months} 个月（完工日 ${completedDate}）`
        : `完工登记：师傅 ${master}，保修 ${months} 个月（完工日 ${completedDate}）`
    }
  };
}

// ---------- 筛选 ----------

// all/todo/doing/done 按原单状态；pending-rework：有待返修子事项的单；
// warranty-expired：已过保的完工单（含无保修资料的旧记录）。
export function filterRepairs(repairs, filter, nowText = todayText()) {
  switch (filter) {
    case "pending-rework":
      return repairs.filter((r) => (r.reworks || []).some((x) => x.status === "pending"));
    case "warranty-expired":
      return repairs.filter((r) => r.status === "done" && !warrantyState(r, nowText).active);
    case "all":
      return repairs;
    default:
      return repairs.filter((r) => r.status === filter);
  }
}

// ---------- 统计 ----------

export function unfinishedCost(repairs) {
  // 未完成原单的预计费用 + 已接手（返修中）的返修费用；
  // 待返修单暂不计入，返修完成的也不再计入。
  const repairCost = repairs
    .filter((r) => r.status !== "done")
    .reduce((sum, r) => sum + Number(r.cost || 0), 0);
  const activeReworkCost = repairs.reduce(
    (sum, r) =>
      sum + (r.reworks || []).filter((x) => x.status === "doing").reduce((s, x) => s + Number(x.cost || 0), 0),
    0
  );
  return repairCost + activeReworkCost;
}

export function pendingReworkCount(repairs) {
  return repairs.reduce((sum, r) => sum + (r.reworks || []).filter((x) => x.status === "pending").length, 0);
}

export { MONTH_MS };
