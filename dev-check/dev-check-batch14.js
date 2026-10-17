// ==================== dev-check-batch14.js ====================
// 批次14 R-1b 回归（14b 重写）：schema 5→6 迁移/getDailyHours 单一口径/saveDailyCard/fmtHours/shim 拆除确认
// 运行：node dev-check-batch14.js
// 机制：localStorage 内存桩 + vm 实跑 config/storage/aggregation 三文件（harness 同 dev-check-r1a.js）
// #68：引擎层全精度，凡学时数值比较一律经 fmtHours

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, ".."); // 2026-10-17 整理：资源根恒为 工作台代码\，与脚本所在子目录无关
const vm = require("vm");

const store = {};
const localStorageStub = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function(k, v) { store[k] = String(v); },
  removeItem: function(k) { delete store[k]; }
};

const ctx = vm.createContext({ localStorage: localStorageStub, console: console });
// 批次19（ESM-a）：剥掉 module 语法（import/export）后按经典脚本供 vm 实跑
function loadModuleSource(f) {
  let src = fs.readFileSync(path.join(ROOT, f), "utf8");
  src = src.replace(/^import\s[\s\S]*?from\s*"[^"]+";[^\S\r\n]*(\r?\n)?/gm, "");
  src = src.replace(/^export\s*\{[\s\S]*?\};[^\S\r\n]*(\r?\n)?/gm, "");
  return src;
}

["js/config.js", "js/storage.js", "js/aggregation.js"].forEach(function(f) {
  vm.runInContext(loadModuleSource(f), ctx, { filename: f });
});
vm.runInContext([
  'function parseDate(str) { return new Date(str + "T00:00:00"); }',
  'function formatDateISO(date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0"); return y + "-" + m + "-" + d; }',
  'function getStageIdByDate(dateStr) { const d = parseDate(dateStr); for (const s of STAGES) { if (s.parentId) continue; if (d >= parseDate(s.start) && d <= parseDate(s.end)) return s.id; } return "未分类"; }'
].join("\n"), ctx, { filename: "stubs" });

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}
function run(code) { return vm.runInContext(code, ctx); }
function card(d) { return JSON.parse(store["study_dashboard_daily_cards"])[d]; }

// 造数：schema v5 旧格式（日卡仍 actualHours 手填覆盖语义；打卡已带 rate 快照）
store["study_dashboard_schema_version"] = "5";
store["study_dashboard_checkins"] = JSON.stringify({
  cmc: [
    { date: "2026-10-12", value: 2, isMakeup: false, stageId: "阶段0", createdAt: 1001, rate: 1.5 },
    { date: "2026-10-13", value: 4, isMakeup: false, stageId: "阶段0", createdAt: 1002, rate: 1.5 }
  ],
  vocabulary: [{ date: "2026-10-13", value: 50, isMakeup: false, stageId: "阶段0", createdAt: 1003, rate: 0.01 }]
});
store["study_dashboard_daily_cards"] = JSON.stringify({
  "2026-10-12": { planHours: 6, actualHours: 5, statusScore: 4, blocker: "", stageId: "阶段0", updatedAt: 1 },
  "2026-10-13": { planHours: 6, actualHours: 0, statusScore: 3, blocker: "", stageId: "阶段0", updatedAt: 2 },
  "2026-10-14": { planHours: 6, actualHours: 2.5, statusScore: 5, blocker: "", stageId: "阶段0", updatedAt: 3 }
});

// ---- 迁移 v5→v6 ----
run("migrateData()");
check("断言1 schema 已升 6", store["study_dashboard_schema_version"], "6");
check("断言2 10-12 卡 adjustment=5-3=2 且 actualHours 已删", card("2026-10-12").adjustment === 2 && !("actualHours" in card("2026-10-12")), true);
check("断言3 10-13 卡(actual=0) actualHours 已删且无 adjustment 字段", !("actualHours" in card("2026-10-13")) && !("adjustment" in card("2026-10-13")), true);
check("断言4 10-14 卡(无打卡纯手填) adjustment=2.5", card("2026-10-14").adjustment, 2.5);
const snap = store["study_dashboard_daily_cards"];
run("migrateActualToAdjustment()");
run("migrateData()");
check("断言5 迁移幂等(二次运行逐字节不变)", store["study_dashboard_daily_cards"] === snap, true);

// ---- 单一口径等价保持（迁移后数值 == 旧手填值）----
const dh = run('getDailyHours("2026-10-12")');
check("断言6 getDailyHours={hours:5,autoHours:3,adjustment:2}", dh.hours === 5 && dh.autoHours === 3 && dh.adjustment === 2, true);
const dh2 = run('getDailyHours("2026-10-13")');
check("断言7 无调整日 hours=6.5 且 adjustment=0", dh2.hours === 6.5 && dh2.adjustment === 0, true);
check("断言8 纯调整日(无打卡) hours=2.5", run('getDailyHours("2026-10-14")').hours, 2.5);

// ---- 全局统计（fmtHours 对账；dateSet 含 adjustment-only 日）----
check("断言9 fmtHours(getGlobalStats.totalHours)=14", run("fmtHours(getGlobalStats().totalHours)"), 14);

// ---- saveDailyCard 新口径 ----
run('saveDailyCard("2026-10-15", { planHours: 5, adjustment: 1.5, statusScore: 4, blocker: "" })');
check("断言10 saveDailyCard 写 adjustment 不写 actualHours", card("2026-10-15").adjustment === 1.5 && !("actualHours" in card("2026-10-15")), true);
check("断言11 新卡 hours=auto0+1.5=1.5", run('getDailyHours("2026-10-15")').hours, 1.5);

// ---- fmtHours 唯一显示层舍入点 ----
check("断言12 fmtHours(22.400000000000004)=22.4 且 fmtHours(0.30000000000000004)=0.3", run("fmtHours(22.400000000000004)") === 22.4 && run("fmtHours(0.30000000000000004)") === 0.3, true);

// ---- 区间层（fmtHours 对账）与 schema 常量 ----
check("断言13 fmtHours(getRangeTotalHours(10-12~14,cutoffToday:false).total)=14", run('fmtHours(getRangeTotalHours("2026-10-12", "2026-10-14", { cutoffToday: false }).total)'), 14);
check("断言14 schema 常量=6", run("CURRENT_SCHEMA_VERSION"), 6);

// ---- shim 拆除确认 ----
check("断言15 getDailyFinalHours 已不存在", run('typeof getDailyFinalHours'), "undefined");

console.log(fail === 0 ? "回归通过 " + pass + "/15" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);