// 数据层：localStorage 读写、旧记录字段补全、初始示例数据
const STORAGE_KEY = "zfl-14-repairs";

export function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    return {
      filter: parsed.filter || "all",
      repairs: (parsed.repairs || []).map(normalizeRepair)
    };
  }
  return { filter: "all", repairs: seedRepairs() };
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 旧记录没有保修资料时补默认值，规则层会按已过保处理
function normalizeRepair(repair) {
  return {
    photo: "",
    note: "",
    technician: "",
    warrantyMonths: null,
    completedAt: null,
    parentId: null,
    acceptedBy: "",
    handover: null,
    ...repair
  };
}

function seedRepairs() {
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
      technician: "",
      warrantyMonths: null,
      completedAt: null,
      parentId: null,
      acceptedBy: "",
      handover: null
    },
    {
      id: crypto.randomUUID(),
      location: "卫生间",
      title: "花洒接口漏水，已更换阀芯",
      priority: "medium",
      cost: 180,
      status: "done",
      photo: "",
      note: "",
      technician: "张师傅",
      warrantyMonths: 12,
      completedAt: Date.now() - 30 * 24 * 3600 * 1000,
      parentId: null,
      acceptedBy: "",
      handover: null
    }
  ];
}
