// ==================== dev-check-batch15.js ====================
// 批次15 R-2a 设置聚合页回归：hoursPerUnit持久化/loadSettings应用/幂等/新打卡快照新系数/旧记录冻结/可编辑卡清单
// 运行：node dev-check-batch15.js
// 机制：localStorage 内存桩 + vm 实跑 config/storage/aggregation 三文件（harness 同 dev-check-r1a.js）

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

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}
function run(code) { return vm.runInContext(code, ctx); }

// 造数：schema v6 现行格式；一条 cmc 旧记录自带 rate=1.5 快照
store["study_dashboard_schema_version"] = "6";
store["study_dashboard_checkins"] = JSON.stringify({
  cmc: [{ date: "2026-10-12", value: 2, isMakeup: false, stageId: "阶段0", createdAt: 1001, rate: 1.5 }]
});

// ---- 可编辑卡清单 ----
check("断言1 可编辑卡清单=6张固定产能卡", JSON.stringify(run("getCoeffEditableMetricKeys()")), '["vocabulary","listening","cmc","mock-exams","advanced-math","final-courses"]');

// ---- 默认无 diff 不写设置 ----
run("loadSettings()");
run("saveSettings()");
check("断言2 默认无diff settings为空对象", store["study_dashboard_settings"], "{}");

// ---- 写入 diff ----
run('METRIC_CONFIGS.cmc.hoursPerUnit = 2; METRIC_CONFIGS.vocabulary.dailyTarget = 80; METRIC_CONFIGS.vocabulary.totalGoal = 6000; METRIC_CONFIGS.listening.hoursPerUnit = 0.05; saveSettings();');
const s1 = JSON.parse(store["study_dashboard_settings"]);
check("断言3 cmc.hoursPerUnit=2 已持久化", s1.cmc.hoursPerUnit, 2);
check("断言4 vocabulary daily/total 已持久化", s1.vocabulary.dailyTarget === 80 && s1.vocabulary.totalGoal === 6000, true);
check("断言5 listening 0.05 浮点精确持久化", s1.listening.hoursPerUnit, 0.05);
check("断言6 sleep 无 hoursPerUnit 不写入", s1.sleep, undefined);

// ---- loadSettings 应用 override + 重置机制 ----
run('METRIC_CONFIGS.cmc.totalGoal = 999;');
run("loadSettings()");
check("断言7 loadSettings 应用 override cmc=2", run("METRIC_CONFIGS.cmc.hoursPerUnit"), 2);
check("断言8 未持久化的脏改被重置 cmc.totalGoal=44", run("METRIC_CONFIGS.cmc.totalGoal"), 44);
check("断言9 vocabulary dailyTarget override=80", run("METRIC_CONFIGS.vocabulary.dailyTarget"), 80);

// ---- 幂等：load 后再 save 逐字节不变 ----
const snapshot = store["study_dashboard_settings"];
run("saveSettings()");
check("断言10 保存幂等(逐字节不变)", store["study_dashboard_settings"] === snapshot, true);

// ---- 系数语义：新打卡快照新系数，旧记录冻结 ----
check("断言11 getRateForMetric 反映新系数", run('getRateForMetric("cmc")'), 2);
run('addCheckin("cmc", 1, "2026-10-13", false)');
const cmcList = JSON.parse(store["study_dashboard_checkins"]).cmc;
check("断言12 新打卡快照新系数 rate=2", cmcList[cmcList.length - 1].rate, 2);
check("断言13 旧记录冻结仍按 rate=1.5 折算", run('getDailyContribution("cmc", "2026-10-12")'), 3);

check("断言14 schema 常量=6", run("CURRENT_SCHEMA_VERSION"), 6);

console.log(fail === 0 ? "回归通过 " + pass + "/14" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);