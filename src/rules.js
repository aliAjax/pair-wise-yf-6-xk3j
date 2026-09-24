// 规则层：状态口径、保修期计算、接单/换人约束、费用统计
export const statuses = {
  todo: "待处理",
  doing: "处理中",
  done: "已完成",
  rework: "待返修"
};

export const filters = {
  all: "全部",
  ...statuses,
  expired: "已过保"
};

// 保修到期时间；没有保修资料（保修月数或完工时间缺失）时返回 null
export function warrantyUntil(repair) {
  const months = Number(repair.warrantyMonths);
  if (!repair.completedAt || !months) return null;
  const date = new Date(repair.completedAt);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
}

export function isUnderWarranty(repair, now = Date.now()) {
  const until = warrantyUntil(repair);
  return until !== null && now <= until;
}

// 旧记录没有保修资料时按已过保处理
export function isExpiredWarranty(repair, now = Date.now()) {
  return repair.status === "done" && !isUnderWarranty(repair, now);
}

// 同一位置仍在保修期内的最近一张完工单
export function findWarrantyBase(repairs, location, now = Date.now()) {
  return (
    repairs
      .filter(
        (repair) =>
          repair.status === "done" &&
          !repair.parentId &&
          repair.location === location &&
          isUnderWarranty(repair, now)
      )
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0] || null
  );
}

// 接单约束：原师傅未接手前，其他人接单会被退回并提示在途责任
export function checkAccept(repair, person) {
  const name = String(person || "").trim();
  if (!name) return { ok: false, message: "请先填写接单人姓名" };
  if (repair.acceptedBy) {
    if (repair.acceptedBy === name) return { ok: true, name };
    return { ok: false, message: `在途责任：${repair.acceptedBy} 已接手本单，如需换人请先登记授权人` };
  }
  if (repair.technician && name !== repair.technician) {
    return { ok: false, message: `在途责任：原师傅 ${repair.technician} 未接手前，其他人不能接单` };
  }
  return { ok: true, name };
}

// 换人处理必须登记授权人，并留下交接记录
export function reassignRework(repair, next, authorizer, now = Date.now()) {
  const name = String(next || "").trim();
  const approver = String(authorizer || "").trim();
  if (!name) return { ok: false, message: "请填写新师傅姓名" };
  if (!approver) return { ok: false, message: "换人处理必须登记授权人" };
  if (repair.acceptedBy === name) return { ok: false, message: "该师傅已是当前接单人" };
  repair.handover = {
    from: repair.acceptedBy || repair.technician || "",
    to: name,
    authorizedBy: approver,
    at: now
  };
  repair.acceptedBy = name;
  return { ok: true, name, approver };
}

// 待返修挂在原单下，暂不计入未完成与预计费用
export function countUnfinished(repairs) {
  return repairs.filter((repair) => repair.status === "todo" || repair.status === "doing");
}

export function unfinishedCost(repairs) {
  return countUnfinished(repairs).reduce((total, repair) => total + Number(repair.cost || 0), 0);
}
