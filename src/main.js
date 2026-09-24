// 页面层：渲染与交互，数据见 data.js，业务规则见 rules.js
import "./styles.css";
import { loadState, saveState } from "./data.js";
import {
  statuses,
  filters,
  warrantyUntil,
  isUnderWarranty,
  isExpiredWarranty,
  findWarrantyBase,
  checkAccept,
  reassignRework,
  countUnfinished,
  unfinishedCost
} from "./rules.js";

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

let state = loadState();
const ui = { message: null, editingWarranty: null };
const app = document.querySelector("#app");

function setMessage(kind, text) {
  ui.message = text ? { kind, text } : null;
}

function render() {
  const repairs = visibleRepairs();
  const unfinished = countUnfinished(state.repairs);
  const totalCost = unfinishedCost(state.repairs);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;
  const rework = state.repairs.filter((repair) => repair.status === "rework").length;

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修事项</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${unfinished.length}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doing}</strong></div>
          <div class="stat"><span>待返修</span><strong>${rework}</strong></div>
          <div class="stat"><span>预计费用</span><strong>¥${totalCost}</strong></div>
        </section>
      </header>

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>处理状态<select name="status">${renderStatusOptions("todo")}</select></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <button class="primary" type="submit">保存事项</button>
            <p class="hint">保修期内在同一位置再次报修，会自动挂到原完工单下并记为待返修。</p>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(filters).map(([value, label]) => `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`).join("")}
          </div>
          ${ui.message ? `<div class="message ${ui.message.kind}">${escapeHtml(ui.message.text)}</div>` : ""}
          <div class="repairs">
            ${repairs.length ? repairs.map(renderRepair).join("") : `<div class="empty">当前筛选下没有维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderRepair(repair) {
  const children = state.repairs.filter((item) => item.parentId === repair.id);
  return `
    <article class="repair">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status]}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">预计 ¥${Number(repair.cost || 0)}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        ${repair.status === "done" ? renderWarranty(repair) : ""}
        <div class="actions">
          <select data-status="${repair.id}">${renderStatusOptions(repair.status)}</select>
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
        ${children.length ? `<div class="children">${children.map(renderRework).join("")}</div>` : ""}
      </div>
    </article>
  `;
}

function renderWarranty(repair) {
  const until = warrantyUntil(repair);
  const chips = [];
  if (repair.technician) chips.push(`<span class="chip">师傅 ${escapeHtml(repair.technician)}</span>`);
  if (until) {
    chips.push(
      isUnderWarranty(repair)
        ? `<span class="chip warranty-active">保内 · 保修 ${Number(repair.warrantyMonths)} 个月，${formatDate(until)} 到期</span>`
        : `<span class="chip warranty-expired">已过保 · ${formatDate(until)} 到期</span>`
    );
  } else {
    chips.push(`<span class="chip warranty-expired">已过保 · 缺少保修资料</span>`);
  }

  if (ui.editingWarranty === repair.id) {
    return `
      <div class="row">${chips.join("")}</div>
      <form class="inline-form" data-warranty="${repair.id}">
        <input name="technician" required placeholder="师傅姓名" value="${escapeHtml(repair.technician || "")}">
        <input name="warrantyMonths" type="number" min="1" step="1" required placeholder="保修月数" value="${repair.warrantyMonths ?? ""}">
        <button class="primary" type="submit">保存保修资料</button>
      </form>
    `;
  }
  return `
    <div class="row">${chips.join("")}</div>
    <div class="actions">
      <button class="ghost" data-edit-warranty="${repair.id}">${until ? "修改保修资料" : "补登保修资料"}</button>
    </div>
  `;
}

function renderRework(repair) {
  const handover = repair.handover;
  return `
    <div class="child">
      <div class="row">
        <strong>${escapeHtml(repair.title)}</strong>
        <span class="status ${repair.status}">${statuses[repair.status]}</span>
      </div>
      <div class="row">
        <span class="chip">原师傅 ${escapeHtml(repair.technician || "未登记")}</span>
        <span class="chip">${repair.acceptedBy ? `接单人 ${escapeHtml(repair.acceptedBy)}` : "暂未接手"}</span>
        <span class="chip">预计 ¥${Number(repair.cost || 0)}（暂不计入未完成费用）</span>
      </div>
      ${
        handover
          ? `<div class="row"><span class="chip">换人登记：${escapeHtml(handover.from || "未接手")} → ${escapeHtml(handover.to)}，授权人 ${escapeHtml(handover.authorizedBy)}，${formatDate(handover.at)}</span></div>`
          : ""
      }
      <div class="actions">
        <select data-status="${repair.id}">${renderStatusOptions(repair.status, true)}</select>
        <button class="ghost" data-delete="${repair.id}">删除</button>
      </div>
      <form class="inline-form" data-accept="${repair.id}">
        <input name="person" placeholder="接单人姓名（须为原师傅）">
        <button class="ghost" type="submit">接单</button>
      </form>
      <form class="inline-form" data-reassign="${repair.id}">
        <input name="next" placeholder="新师傅姓名">
        <input name="authorizer" placeholder="授权人（必填）">
        <button class="ghost" type="submit">登记换人</button>
      </form>
    </div>
  `;
}

function renderStatusOptions(selected, includeRework = false) {
  return Object.entries(statuses)
    .filter(([value]) => (includeRework ? value !== "todo" : value !== "rework"))
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderPriorityOptions(selected) {
  return Object.entries(priorities)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const location = data.location.trim();
    const base = findWarrantyBase(state.repairs, location);
    if (base) {
      state.repairs.unshift({
        id: crypto.randomUUID(),
        location,
        title: data.title.trim(),
        priority: data.priority,
        cost: Number(data.cost || 0),
        status: "rework",
        photo: data.photo.trim(),
        note: data.note.trim(),
        technician: base.technician,
        warrantyMonths: null,
        completedAt: null,
        parentId: base.id,
        acceptedBy: "",
        handover: null
      });
      setMessage("info", `「${location}」仍在保修期内，新事项已挂到原完工单下并记为待返修，暂不计入未完成费用`);
    } else {
      state.repairs.unshift({
        id: crypto.randomUUID(),
        location,
        title: data.title.trim(),
        priority: data.priority,
        cost: Number(data.cost || 0),
        status: data.status,
        photo: data.photo.trim(),
        note: data.note.trim(),
        technician: "",
        warrantyMonths: null,
        completedAt: data.status === "done" ? Date.now() : null,
        parentId: null,
        acceptedBy: "",
        handover: null
      });
      setMessage(null);
    }
    saveState();
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const repair = state.repairs.find((item) => item.id === select.dataset.status);
      if (!repair) return;
      repair.status = select.value;
      if (select.value === "done") {
        if (!repair.completedAt) repair.completedAt = Date.now();
        if (!repair.technician || !repair.warrantyMonths) {
          ui.editingWarranty = repair.id;
          setMessage("warn", "已完工：请填入保修月数和师傅，便于后续保修跟进");
        } else {
          setMessage(null);
        }
      } else {
        setMessage(null);
      }
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.delete;
      state.repairs = state.repairs.filter((repair) => repair.id !== id && repair.parentId !== id);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-edit-warranty]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.editingWarranty = button.dataset.editWarranty;
      render();
    });
  });

  document.querySelectorAll("[data-warranty]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repair = state.repairs.find((item) => item.id === form.dataset.warranty);
      if (!repair) return;
      const data = Object.fromEntries(new FormData(form));
      repair.technician = data.technician.trim();
      repair.warrantyMonths = Number(data.warrantyMonths);
      if (!repair.completedAt) repair.completedAt = Date.now();
      ui.editingWarranty = null;
      setMessage("info", `已登记：${repair.technician} 保修 ${repair.warrantyMonths} 个月`);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-accept]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repair = state.repairs.find((item) => item.id === form.dataset.accept);
      if (!repair) return;
      const data = Object.fromEntries(new FormData(form));
      const result = checkAccept(repair, data.person);
      if (result.ok) {
        repair.acceptedBy = result.name;
        if (repair.status === "rework") repair.status = "doing";
        setMessage("info", `${result.name} 已接单，事项转为处理中`);
      } else {
        setMessage("warn", result.message);
      }
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-reassign]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repair = state.repairs.find((item) => item.id === form.dataset.reassign);
      if (!repair) return;
      const data = Object.fromEntries(new FormData(form));
      const result = reassignRework(repair, data.next, data.authorizer);
      setMessage(result.ok ? "info" : "warn", result.ok ? `已登记换人：${result.name} 接手，授权人 ${result.approver}` : result.message);
      saveState();
      render();
    });
  });
}

function visibleRepairs() {
  const tops = state.repairs.filter((repair) => !repair.parentId);
  if (state.filter === "all") return tops;
  if (state.filter === "expired") return tops.filter((repair) => isExpiredWarranty(repair));
  if (state.filter === "rework") {
    return tops.filter((repair) => state.repairs.some((item) => item.parentId === repair.id && item.status === "rework"));
  }
  return tops.filter((repair) => repair.status === state.filter);
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString("zh-CN");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
