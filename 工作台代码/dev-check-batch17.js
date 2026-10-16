// ==================== dev-check-batch17.js ====================
// 批次17 回归：getStageMetricHours/finalReviewHours解代理/getDayCheckinEntries/阶段1核对锚点/日历锚点
// 运行：node dev-check-batch17.js
// 机制：localStorage 内存桩 + vm 实跑 config/storage/aggregation 三文件 + script/index 源码文本锚点

const fs = require("fs");
const path = require("path");
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
  let src = fs.readFileSync(path.join(__dirname, f), "utf8");
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
const indexSrc = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const aggSrc = fs.readFileSync(path.join(__dirname, "js/aggregation.js"), "utf8");

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}
function run(code) { return vm.runInContext(code, ctx); }

// 造数：schema v6；2026-10-12 一天四 key（cmc/final-courses/goal_g1/孤儿key）
store["study_dashboard_schema_version"] = "6";
store["study_dashboard_custom_goals"] = JSON.stringify([
  { id: "goal_g1", name: "目标一", total: 100, unit: "个", daily: 2, deadline: "2026-12-31", hoursPerUnit: 0.5 }
]);
store["study_dashboard_checkins"] = JSON.stringify({
  cmc: [{ date: "2026-10-12", value: 2, isMakeup: false, stageId: "阶段0", createdAt: 1001, rate: 1.5 }],
  "final-courses": [{ date: "2026-10-12", value: 4, isMakeup: false, stageId: "阶段0", createdAt: 1002, rate: 0.75 }],
  goal_g1: [{ date: "2026-10-12", value: 4, isMakeup: false, stageId: "阶段0", createdAt: 1003, rate: 0.5 }],
  deleted_thing: [{ date: "2026-10-12", value: 9, isMakeup: false, stageId: "阶段0", createdAt: 1004 }]
});

// ---- R-4 数据层 ----
check("断言1 getStageMetricHours rate口径 2×1.5=3", run('getStageMetricHours("cmc", ["2026-10-12"])'), 3);

// ---- 阶段1核对：final-review 解代理 ----
check("断言2 周统计 finalReviewHours 4×0.75=3", run('getWeeklyStats("2026-10-12").finalReviewHours'), 3);
check("断言3 引擎不再用 range.total 代理 final-review", aggSrc.indexOf('"final-review" ? range.total') === -1 && aggSrc.indexOf('"final-review" ? finalReviewHours') !== -1, true);
check("断言4 显示层 final-review 接 ws.finalReviewHours", scriptSrc.indexOf('item("final-review", "期末复习≥10h", ws.finalReviewHours, lastWeek.finalReviewHours, "h")') !== -1, true);

// ---- R-5a 日历数据层 ----
const entries = run('getDayCheckinEntries("2026-10-12")');
check("断言5 当日明细=3条(孤儿key被排除)", entries.length, 3);
check("断言6 cmc 明细 hours=3", entries.filter(e => e.key === "cmc")[0].hours, 3);
check("断言7 自定义目标入明细 目标一 hours=2", entries.filter(e => e.key === "goal_g1" && e.name === "目标一")[0].hours, 2);
check("断言8 孤儿key不入明细", entries.filter(e => e.key === "deleted_thing").length, 0);

// ---- 阶段1核对：配置真值 ----
check("断言9 阶段1区间=2026-11-15→2027-01-10", run('(STAGES.find(s=>s.id==="阶段1")||{}).start + "|" + (STAGES.find(s=>s.id==="阶段1")||{}).end'), "2026-11-15|2027-01-10");
check("断言10 阶段1周检五项id序列", JSON.stringify(run('(STAGE_CHECK_RULES["阶段1"]||[]).map(r=>r.id)')), '["total-hours","achieve-days","final-review","cet6","vocab"]');

// ---- R-5a 日历 UI 锚点 ----
check("断言11 index 含日历页与入口", indexSrc.indexOf('id="calendar-page"') !== -1 && indexSrc.indexOf('id="calendar-open-btn"') !== -1, true);
check("断言12 日历六函数齐且已接线", ["function openCalendarPage", "function closeCalendarPage", "function renderCalendarPage", "function renderCalendarDayDetail", "function bindCalendarEvents", 'bindClick("calendar-open-btn", openCalendarPage)'].every(s => scriptSrc.indexOf(s) !== -1), true);

check("断言13 schema 常量=6", run("CURRENT_SCHEMA_VERSION"), 6);

console.log(fail === 0 ? "回归通过 " + pass + "/13" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
