// ==================== dev-check-batch19.js ====================
// 批次19 回归：ESM-a 改造（js/三件 module 化 + bridge 挂 window）行为等价与锚点校验
// 运行：node dev-check-batch19.js
// 机制：剥皮（去 import/export）后 vm 实跑三件 + export 名单逐一存在性 + 文本锚点
// 批次20 整切适配：断言7/8/11/12 已改写为整切后形态（bridge/script.js 删除、index 单入口）

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, ".."); // 2026-10-17 整理：资源根恒为 工作台代码\，与脚本所在子目录无关
const vm = require("vm");

function loadModuleSource(f) {
  // 批次19（ESM-a）：剥掉 module 语法（import/export）后按经典脚本供 vm 实跑
  let src = fs.readFileSync(path.join(ROOT, f), "utf8");
  src = src.replace(/^import\s[\s\S]*?from\s*"[^"]+";[^\S\r\n]*(\r?\n)?/gm, "");
  src = src.replace(/^export\s*\{[\s\S]*?\};[^\S\r\n]*(\r?\n)?/gm, "");
  return src;
}

const store = {};
const localStorageStub = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function(k, v) { store[k] = String(v); },
  removeItem: function(k) { delete store[k]; }
};

const ctx = vm.createContext({ localStorage: localStorageStub, console: console });
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
function missingNames(list) { return list.filter(function(n) { return run("typeof " + n) === "undefined"; }); }

// ---- 断言1-3：三件剥皮跑通 + export 名单逐一存在（机器防漏名）----
const CONFIG_EXPORTS = ["STAGE0_START_DATE","MELTDOWN_THRESHOLD","STATUS_DROP_THRESHOLD","STAGES","QUOTAS","DEFAULT_CONFIGS","METRIC_CONFIGS","MILESTONES","MONTHLY_SUBJECTS","THEME_ORDER","SKIN_ORDER","CAPACITY_DAILY_THRESHOLD","SLEEP_PLAN","STAGE_CHECK_RULES"];
const STORAGE_EXPORTS = ["STORAGE_KEYS","loadData","saveData","CURRENT_SCHEMA_VERSION","getSchemaVersion","setSchemaVersion","migrateData","getLastBackupAt","setLastBackupAt","getLastBackupRemindAt","setLastBackupRemindAt","SOUND_STORAGE_KEY","isSoundEnabled","setSoundEnabled","TREND_HIDDEN_KEY","isTrendHidden","setTrendHidden","HISTORY_READONLY_KEY","isHistoryReadonly","setHistoryReadonly","WEEKLY_REVIEW_STORAGE_KEY","loadWeeklyReview","saveWeeklyReview","STAGE_REVIEW_STORAGE_KEY","getStageReviewNotes","saveStageReviewNotes","GLOBAL_STATS_GOAL_KEY","GLOBAL_STATS_DEFAULT_GOAL","getGlobalHoursGoal","setGlobalHoursGoal","THEME_STORAGE_KEY","getTheme","setTheme","SKIN_STORAGE_KEY","getSkin","setSkin","CUSTOM_CMD_STORAGE_KEY","getCustomCommands","saveCustomCommands","getCheckins","setCheckins","getCheckinsByStage","getRateForMetric","migrateCheckinRates","migrateActualToAdjustment","addCheckin","getCheckinRecord","getCheckinValue","hasCheckin","isProgressType","getTotalCompleted","getProgressIncrement","getValueBeforeDate","getDailyCards","setDailyCards","getDailyCardsByStage","getDailyCard","saveDailyCard","getDayDiaries","getDayDiary","saveDayDiary","getMonthlyScores","setMonthlyScores","addMonthlyScore","loadCustomGoals","saveCustomGoals","saveSettings","loadSettings","clearAllData","exportBackup","importBackup","STORAGE_REGISTRY"];
const AGGREGATION_EXPORTS = ["getDailyRecord","getCapacityMetricKeys","getCoeffEditableMetricKeys","getStageMetricHours","getDayCheckinEntries","getDailyContribution","getDailyAutoHours","getDailyHours","fmtHours","getRangeTotalHours","getWeeklyStats","getStageStats","getGlobalStats","getDailyTotalHours","getDailyHourContribution","getWeeklyTotalHours","getCompetitionHours","getGlobalHoursByMetric"];
const m1 = missingNames(CONFIG_EXPORTS);
check("断言1 config.js 14 导出名剥皮后全部存在（缺失：" + (m1.join(",") || "无") + "）", m1.length === 0 && CONFIG_EXPORTS.length === 14, true);
const m2 = missingNames(STORAGE_EXPORTS);
check("断言2 storage.js 72 导出名剥皮后全部存在（缺失：" + (m2.join(",") || "无") + "）", m2.length === 0 && STORAGE_EXPORTS.length === 72, true);
const m3 = missingNames(AGGREGATION_EXPORTS);
check("断言3 aggregation.js 18 导出名剥皮后全部存在（缺失：" + (m3.join(",") || "无") + "）", m3.length === 0 && AGGREGATION_EXPORTS.length === 18, true);

// ---- 断言4-8：文本锚点 ----
const cfgSrc = fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8");
const stgSrc = fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8");
const aggSrc = fs.readFileSync(path.join(ROOT, "js/aggregation.js"), "utf8");
check("断言4 三条 import 行锚点",
  stgSrc.indexOf('import { THEME_ORDER, SKIN_ORDER, METRIC_CONFIGS, DEFAULT_CONFIGS } from "./config.js";') !== -1 &&
  aggSrc.indexOf('import { STAGES, METRIC_CONFIGS, STAGE_CHECK_RULES, CAPACITY_DAILY_THRESHOLD } from "./config.js";') !== -1 &&
  aggSrc.indexOf('import { getCheckins, getDailyCard, getDailyCards, loadCustomGoals, getGlobalHoursGoal } from "./storage.js";') !== -1, true);
check("断言5 config METRIC_CONFIGS 已 const 化",
  cfgSrc.indexOf("const METRIC_CONFIGS = JSON.parse(JSON.stringify(DEFAULT_CONFIGS));") !== -1 && cfgSrc.indexOf("let METRIC_CONFIGS") === -1, true);
check("断言6 storage 重置已改原地 mutate",
  stgSrc.indexOf("Object.assign(METRIC_CONFIGS, JSON.parse(JSON.stringify(DEFAULT_CONFIGS)));") !== -1 && stgSrc.indexOf("METRIC_CONFIGS = JSON.parse(JSON.stringify(DEFAULT_CONFIGS));") === -1, true);
const bridgeSrc = null;
check("断言7 bridge.js 已删除（批次20 整切）", fs.existsSync(path.join(ROOT, "js/bridge.js")), false);
const idxSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
check("断言8 index 单入口整切：仅 main.js 一个 module 标签",
  idxSrc.indexOf('<script type="module" src="js/main.js"></script>') !== -1 &&
  idxSrc.indexOf('src="script.js"') === -1 &&
  idxSrc.indexOf('src="js/bridge.js"') === -1 &&
  idxSrc.indexOf('src="js/config.js"') === -1 &&
  (idxSrc.match(/<script type="module"/g) || []).length === 1, true);

// ---- 断言9-10：行为等价与 mutate 语义 ----
store["study_dashboard_schema_version"] = "6";
store["study_dashboard_checkins"] = JSON.stringify({
  "final-courses": [{ date: "2026-10-12", value: 4, isMakeup: false, stageId: "阶段0", createdAt: 1002, rate: 0.75 }]
});
check("断言9 行为等价：finalReviewHours 4×0.75=3 且日记写读往返",
  run('getWeeklyStats("2026-10-12").finalReviewHours') === 3 &&
  run('saveDayDiary("2026-10-12", "复盘A"), getDayDiary("2026-10-12")') === "复盘A", true);
store["study_dashboard_settings"] = JSON.stringify({ vocabulary: { dailyTarget: 99 } });
check("断言10 loadSettings 后 METRIC_CONFIGS 引用恒定且覆盖生效",
  run('(function(){ const ref = METRIC_CONFIGS; loadSettings(); return (ref === METRIC_CONFIGS) && METRIC_CONFIGS.vocabulary.dailyTarget === 99; })()'), true);

// ---- 断言11-13：SW / script.js / schema ----
const swSrc = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
const vjsonB19 = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));
check("断言11 SW 与 version.json 同步且整切资产在位",
  swSrc.indexOf('"study-dashboard-' + vjsonB19.cacheVersion + '"') !== -1 &&
  swSrc.indexOf('"./js/main.js"') !== -1 &&
  swSrc.indexOf('"./js/bridge.js"') === -1 &&
  swSrc.indexOf('"./script.js"') === -1, true);
const noBridge = ["js/config.js", "js/storage.js", "js/aggregation.js", "js/main.js"]
  .concat(fs.readdirSync(path.join(ROOT, "js", "ui")).map(function(f) { return "js/ui/" + f; }))
  .every(function(f) { return fs.readFileSync(path.join(ROOT, f), "utf8").indexOf("Object.assign(window,") === -1; });
check("断言12 script.js 已删且全站无 window 桥残留",
  !fs.existsSync(path.join(ROOT, "script.js")) && noBridge, true);
check("断言13 schema 常量=6", run("CURRENT_SCHEMA_VERSION"), 6);

console.log(fail === 0 ? "回归通过 " + pass + "/13" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
