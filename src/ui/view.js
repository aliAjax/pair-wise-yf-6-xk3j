// 页面层：只负责把状态渲染成 HTML，业务判断一律调用规则层。
import {
  REPAIR_STATUSES,
  REWORK_STATUSES,
  PRIORITIES,
  warrantyState,
  unfinishedCost,
  pendingReworkCount,
  filterRepairs
} from "../rules/warranty.js";

const FILTERS = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成",
  "pending-rework": "待返修",
  "warranty-expired": "已过保"
};

export function render(state, today) {
  const app = document.querySelector("#app");
  const repairs = filterRepairs(state.repairs, state.filter, today);
  const unfinished = state.repairs.filter((r) => r.status !== "done").length;
  const doing = state.repairs.filter((r) => r.status === "doing").length;
  const pendingRework = pendingReworkCount(state.repairs);
  const totalCost = unfinishedCost(state.repairs);

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修事项</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${unfinished}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doing}</strong></div>
          <div class="stat"><span>待返修</span><strong>${pendingRework}</strong></div>
          <div class="stat"><span>未完成预计费用</span><strong>¥${totalCost}</strong></div>
        </section>
      </header>

      ${state.notice ? `<div class="notice" id="notice">${escapeHtml(state.notice)}</div>` : ""}

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${options(PRIORITIES, "medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>处理状态<select name="status">${options(REPAIR_STATUSES, "todo", ["all"])}</select></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <p class="hint">同一位置在保修期内再报事，会自动挂到原完工单下记为“待返修”，暂不计入未完成费用。</p>
            <button class="primary" type="submit">保存事项</button>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(FILTERS)
              .map(([value, label]) =>
                `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`)
              .join("")}
          </div>
          <div class="repairs">
            ${repairs.length ? repairs.map((r) => renderRepair(r, today)).join("") : `<div class="empty">当前筛选下没有维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;
}

function renderRepair(repair, today) {
  const w = warrantyState(repair, today);
  return `
    <article class="repair" data-repair="${repair.id}">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${PRIORITIES[repair.priority] || repair.priority}</span>
          <span class="status ${repair.status}">${REPAIR_STATUSES[repair.status] || repair.status}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">预计 ¥${Number(repair.cost || 0)}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>

        ${renderWarranty(repair, w, today)}
        ${(repair.reworks || []).map((rw) => renderRework(repair, rw)).join("")}
        ${renderLogs(repair.logs)}

        <div class="actions">
          <select data-status="${repair.id}">${options(REPAIR_STATUSES, repair.status, ["all"])}</select>
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderWarranty(repair, w, today) {
  if (repair.status !== "done") {
    return w.active
      ? `<div class="warranty active"><span class="tag">保修中</span>师傅 ${escapeHtml(w.active ? repair.warranty.master : "")}，剩 ${w.daysLeft} 天（至 ${w.expireDate}）</div>`
      : "";
  }
  if (w.active) {
    return `
      <div class="warranty active">
        <span class="tag">保修中</span>
        师傅 ${escapeHtml(repair.warranty.master)} · 保修 ${repair.warranty.months} 个月 · 至 ${w.expireDate}（剩 ${w.daysLeft} 天）
      </div>`;
  }
  return `
    <div class="warranty expired">
      <span class="tag">已过保</span>${escapeHtml(w.reason)}
      <form class="inline-form" data-warranty="${repair.id}">
        <input name="months" type="number" min="1" step="1" placeholder="保修月数">
        <input name="master" placeholder="完工师傅">
        <input name="completedDate" type="date" value="${today}">
        <button class="ghost" type="submit">${repair.warranty ? "更新保修" : "补登保修"}</button>
      </form>
    </div>`;
}

function renderRework(repair, rework) {
  const master = repair.warranty ? repair.warranty.master : "";
  return `
    <div class="rework ${rework.status}">
      <div class="row">
        <span class="rework-tag">返修单</span>
        <span class="rework-status ${rework.status}">${REWORK_STATUSES[rework.status] || rework.status}</span>
        <span class="chip">报价 ¥${Number(rework.cost || 0)}${rework.status === "pending" ? "（待返修暂不计入未完成费用）" : ""}</span>
        ${rework.assignee ? `<span class="chip">处理人 ${escapeHtml(rework.assignee)}</span>` : ""}
        ${rework.authorizedBy ? `<span class="chip">授权人 ${escapeHtml(rework.authorizedBy)}</span>` : ""}
      </div>
      <p>${escapeHtml(rework.title)}</p>
      ${rework.note ? `<p class="muted">${escapeHtml(rework.note)}</p>` : ""}

      ${
        rework.status === "pending"
          ? `
        <form class="inline-form" data-assign="${rework.id}">
          <input name="worker" required placeholder="接单师傅（原师傅：${escapeHtml(master)}）">
          <input name="authorizedBy" placeholder="换人处理必填：授权人">
          <button class="primary small" type="submit">提交接单</button>
        </form>
        <p class="hint">原师傅 ${escapeHtml(master)} 未接手前，其他人接单会被退回（在途责任）；换人须登记授权人。</p>`
          : ""
      }
      ${rework.status === "doing" ? `<button class="ghost" data-complete-rework="${rework.id}">标记返修完成</button>` : ""}
      ${renderLogs(rework.logs)}
    </div>`;
}

function renderLogs(logs) {
  if (!logs || !logs.length) return "";
  const rows = logs
    .map((log) => `<li class="log ${log.kind}"><time>${formatTime(log.at)}</time>${escapeHtml(log.text)}</li>`)
    .join("");
  return `<ul class="logs">${rows}</ul>`;
}

function options(map, selected, exclude = []) {
  return Object.entries(map)
    .filter(([value]) => !exclude.includes(value))
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]
  );
}
