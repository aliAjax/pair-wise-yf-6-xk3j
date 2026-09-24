// 数据层：只管读写与旧记录兼容，不放任何业务判断。
import { todayText } from "../rules/warranty.js";

const STORAGE_KEY = "zfl-14-repairs";

export function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const state = JSON.parse(saved);
    return {
      filter: state.filter || "all",
      notice: "",
      repairs: (state.repairs || []).map(normalizeRepair)
    };
  }
  return {
    filter: "all",
    notice: "",
    repairs: seedRepairs()
  };
}

export function saveState(state) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ filter: state.filter, repairs: state.repairs })
  );
}

// 旧记录归一化：没有保修资料的完工单保持 warranty 为空（规则层按已过保处理）。
function normalizeRepair(repair) {
  return {
    id: repair.id || crypto.randomUUID(),
    location: repair.location || "",
    title: repair.title || "",
    priority: repair.priority || "medium",
    cost: Number(repair.cost || 0),
    status: repair.status || "todo",
    photo: repair.photo || "",
    note: repair.note || "",
    warranty: repair.warranty || null,
    reworks: Array.isArray(repair.reworks) ? repair.reworks : [],
    logs: Array.isArray(repair.logs) ? repair.logs : []
  };
}

function seedRepairs() {
  const today = todayText();
  return [
    {
      id: crypto.randomUUID(),
      location: "厨房",
      title: "水槽下方渗水",
      priority: "high",
      cost: 260,
      status: "todo",
      photo: "",
      note: "先检查软管接口",
      warranty: null,
      reworks: [],
      logs: [{ at: new Date().toISOString(), kind: "info", text: "登记维修事项" }]
    },
    {
      id: crypto.randomUUID(),
      location: "卫生间",
      title: "花洒支架松动更换",
      priority: "medium",
      cost: 180,
      status: "done",
      photo: "",
      note: "保修期内留意同一位置",
      warranty: { months: 6, master: "王师傅", completedDate: today },
      reworks: [],
      logs: [{ at: new Date().toISOString(), kind: "info", text: "完工登记：师傅 王师傅，保修 6 个月" }]
    }
  ];
}
