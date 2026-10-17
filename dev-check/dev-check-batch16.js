// ==================== dev-check-batch16.js ====================
// 批次16 R-2b 回归：自定义目标hoursPerUnit产能计收/快照/清除 + 源码锚点(表单字段/趋势图/补记下拉)
// 运行：node dev-check-batch16.js
// 机制：localStorage 内存桩 + vm 实跑 config/storage/aggregation 三文件 + script/index 源码文本锚点

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

// 批次20（ESM-b）：script.js 已整切为 js/main.js + js/ui/*.js，锚点改扫拼接源
const UI_FILES = ["js/ui/base.js", "js/ui/daily-card.js", "js/ui/version.js", "js/ui/stage.js", "js/ui/checkin.js", "js/ui/charts.js", "js/ui/weekly.js", "js/ui/command.js", "js/ui/today.js", "js/ui/goals.js", "js/ui/dashboard.js", "js/ui/review.js", "js/ui/global-stats.js", "js/ui/settings.js", "js/main.js"];
const scriptSrc = UI_FILES.map(function(f) { return loadModuleSource(f); }).join("\n");
const indexSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}
function run(code) { return vm.runInContext(code, ctx); }

// 造数：schema v6；goal_g1 含系数0.5，goal_g2 无系数；goal_g1 一条 rate=0.5 快照记录
store["study_dashboard_schema_version"] = "6";
store["study_dashboard_custom_goals"] = JSON.stringify([
  { id: "goal_g1", name: "目标一", total: 100, unit: "个", daily: 2, deadline: "2026-12-31", hoursPerUnit: 0.5 },
  { id: "goal_g2", name: "目标二", total: 50, unit: "页", daily: 1, deadline: "2026-12-31" }
]);
store["study_dashboard_checkins"] = JSON.stringify({
  goal_g1: [{ date: "2026-10-12", value: 4, isMakeup: false, stageId: "阶段0", createdAt: 1001, rate: 0.5 }]
});

// ---- 数据层：hoursPerUnit 产能计收 ----
check("断言1 含系数目标 getRateForMetric=0.5", run('getRateForMetric("goal_g1")'), 0.5);
check("断言2 含系数目标入产能清单", run('getCapacityMetricKeys().indexOf("goal_g1") !== -1'), true);
check("断言3 无系数目标 getRateForMetric=null 且不入产能", run('getRateForMetric("goal_g2") === null && getCapacityMetricKeys().indexOf("goal_g2") === -1'), true);
check("断言4 快照计入日自动学时 4×0.5=2", run('getDailyAutoHours("2026-10-12")'), 2);
check("断言5 全局总学时计入目标贡献=2", run('getGlobalStats().totalHours'), 2);
run('addCheckin("goal_g1", 2, "2026-10-13", false)');
const g1List = JSON.parse(store["study_dashboard_checkins"]).goal_g1;
check("断言6 目标新打卡快照 rate=0.5", g1List[g1List.length - 1].rate, 0.5);

// ---- 源码锚点 ----
check("断言7 表单含 goal-rate 字段", indexSrc.indexOf('id="goal-rate"') !== -1, true);
check("断言8 自定义卡模板含趋势图容器", scriptSrc.indexOf('id="${goal.id}-trend"') !== -1, true);
check("断言9 renderCustomGoalTrend 已定义并被 renderAllTrendCharts 调用", scriptSrc.indexOf("function renderCustomGoalTrend(goal)") !== -1 && scriptSrc.indexOf("loadCustomGoals().forEach(renderCustomGoalTrend)") !== -1, true);
const makeupFn = scriptSrc.slice(scriptSrc.indexOf("function refreshMakeupDateOptions"), scriptSrc.indexOf("function createCustomGoalCardHTML"));
check("断言10 补记下拉刷新覆盖自定义卡", makeupFn.indexOf("loadCustomGoals()") !== -1, true);
check("断言11 新建提交接通 hoursPerUnit", scriptSrc.indexOf('document.getElementById("goal-rate")') !== -1 && scriptSrc.indexOf("goal.hoursPerUnit = parseFloat(rateRaw)") !== -1, true);
check("断言12 趋势双函数已支持 cfgOverride", scriptSrc.indexOf("function getTrendData(metricKey, cfgOverride)") !== -1 && scriptSrc.indexOf("function renderTrendChart(metricKey, cfgOverride)") !== -1, true);

check("断言13 schema 常量=6", run("CURRENT_SCHEMA_VERSION"), 6);

console.log(fail === 0 ? "回归通过 " + pass + "/13" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
