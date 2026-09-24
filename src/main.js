import "./styles.css";
import { loadState, saveState } from "./data/store.js";
import { render } from "./ui/view.js";
import {
  todayText,
  planNewItem,
  reviewAssignment,
  completeRework,
  registerWarranty
} from "./rules/warranty.js";

let state = loadState();
let noticeTimer = null;

function rerender() {
  render(state, todayText());
  bindEvents();
}

function flashNotice(text) {
  state.notice = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    state.notice = "";
    rerender();
  }, 5000);
}

function bindEvents() {
  document.querySelector("#repair-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = normalizeForm(new FormData(event.target));
    const plan = planNewItem(state.repairs, data, todayText());

    if (plan.type === "rework") {
      plan.parent.reworks.push(plan.rework);
      state.filter = "pending-rework";
      flashNotice(`该位置在保修期内，已挂到“${plan.parent.location}·${plan.parent.warranty.master}”原单下，状态：待返修，暂不计入未完成费用。`);
    } else {
      state.repairs.unshift(plan.repair);
      flashNotice("已登记新维修事项。");
    }
    saveState();
    rerender();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      saveState();
      rerender();
    });
  });

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const repair = state.repairs.find((item) => item.id === select.dataset.status);
      if (!repair) return;
      repair.status = select.value;
      saveState();
      rerender();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.repairs = state.repairs.filter((repair) => repair.id !== button.dataset.delete);
      saveState();
      rerender();
    });
  });

  // 完工单补填保修月数和师傅
  document.querySelectorAll("[data-warranty]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repair = state.repairs.find((item) => item.id === form.dataset.warranty);
      if (!repair) return;
      const input = normalizeForm(new FormData(form));
      const result = registerWarranty(repair, input, todayText());
      if (!result.ok) {
        flashNotice(result.notice);
        return;
      }
      repair.status = result.status;
      repair.warranty = result.warranty;
      repair.logs.push(result.log);
      saveState();
      rerender();
    });
  });

  // 待返修接单：原师傅直接接手；其他人无授权人退回，登记授权人可换人
  document.querySelectorAll("[data-assign]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = normalizeForm(new FormData(form));
      const found = findRework(state.repairs, form.dataset.assign);
      if (!found) return;
      const result = reviewAssignment(found.rework, found.repair.warranty, input);

      if (result.rejected) {
        found.rework.logs.push(result.log);
        flashNotice(result.notice);
        saveState();
        rerender();
        return;
      }
      if (!result.ok) {
        flashNotice(result.notice);
        return;
      }
      found.rework.status = result.status;
      found.rework.assignee = result.assignee;
      found.rework.authorizedBy = result.authorizedBy;
      found.rework.logs.push(result.log);
      flashNotice(result.notice);
      saveState();
      rerender();
    });
  });

  document.querySelectorAll("[data-complete-rework]").forEach((button) => {
    button.addEventListener("click", () => {
      const found = findRework(state.repairs, button.dataset.completeRework);
      if (!found) return;
      const result = completeRework(found.rework);
      found.rework.status = result.status;
      found.rework.logs.push(result.log);
      saveState();
      rerender();
    });
  });
}

function findRework(repairs, reworkId) {
  for (const repair of repairs) {
    const rework = (repair.reworks || []).find((item) => item.id === reworkId);
    if (rework) return { repair, rework };
  }
  return null;
}

function normalizeForm(formData) {
  const data = Object.fromEntries(formData);
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
}

rerender();
