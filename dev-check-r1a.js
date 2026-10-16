// ==================== dev-check-r1a.js ====================
// 批次13 R-1a 数据层回归：rate快照写入/存量迁移/幂等/封存生效/getDailyHours新出口/schema v5
// 运行：node dev-check-r1a.js
// 机制：localStorage 内存桩 + vm 实跑 config/storage/aggregation 三文件（harness 同 dev-check-weekly.js）

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
function rec(key, i) { return JSON.parse(store["study_dashboard_checkins"])[key][i]; }

// 造数：schema v4 旧格式（全部无 rate 字段）
store["study_dashboard_schema_version"] = "4";
store["study_dashboard_custom_goals"] = JSON.stringify([
  { id: "goal_g1", name: "目标一", total: 100, unit: "个", hoursPerUnit: 0.5 },
  { id: "goal_g2", name: "目标二", total: 50, unit: "页" }
]);
store["study_dashboard_checkins"] = JSON.stringify({
  cmc: [{ date: "2026-10-12", value: 2, isMakeup: false, stageId: "阶段0", createdAt: 1001 }],
  vocabulary: [{ date: "2026-10-12", value: 50, isMakeup: false, stageId: "阶段0", createdAt: 1002 }],
  sleep: [{ date: "2026-10-12", value: "23:30", isMakeup: false, stageId: "阶段0", createdAt: 1003 }],
  goal_g1: [{ date: "2026-10-12", value: 4, isMakeup: false, stageId: "阶段0", createdAt: 1004 }],
  goal_g2: [{ date: "2026-10-12", value: 7, isMakeup: false, stageId: "阶段0", createdAt: 1005 }]
});

// ---- 系数解析 ----
check("断言1 固定卡系数 cmc=1.5", run('getRateForMetric("cmc")'), 1.5);
check("断言2 非产能卡 sleep=null", run('getRateForMetric("sleep")'), null);
check("断言3 目标含系数 goal_g1=0.5", run('getRateForMetric("goal_g1")'), 0.5);
check("断言4 目标无系数 goal_g2=null", run('getRateForMetric("goal_g2")'), null);

// ---- 迁移 v4→v5 ----
run("migrateData()");
check("断言5 迁移后 cmc 记录 rate=1.5", rec("cmc", 0).rate, 1.5);
check("断言6 迁移后 vocabulary 记录 rate=0.01", rec("vocabulary", 0).rate, 0.01);
check("断言7 迁移后 goal_g1 记录 rate=0.5", rec("goal_g1", 0).rate, 0.5);
check("断言8 goal_g2/sleep 不写 rate", ("rate" in rec("goal_g2", 0)) === false && ("rate" in rec("sleep", 0)) === false, true);
const snapshot = store["study_dashboard_checkins"];
run("migrateCheckinRates()"); // 直接再跑一次迁移函数本体
check("断言9 迁移幂等(二次运行逐字节不变)", store["study_dashboard_checkins"] === snapshot, true);
check("断言10 schema 已升 6", store["study_dashboard_schema_version"], "6");

// ---- 新打卡写入快照 ----
run('addCheckin("cmc", 3, "2026-10-13", false)');
const cmcList = JSON.parse(store["study_dashboard_checkins"]).cmc;
check("断言11 新打卡自带 rate=1.5", cmcList[cmcList.length - 1].rate, 1.5);

// ---- rate 封存生效（篡改快照后统计跟快照走，不跟配置走）----
const tampered = JSON.parse(store["study_dashboard_checkins"]);
tampered.cmc[0].rate = 99;
store["study_dashboard_checkins"] = JSON.stringify(tampered);
check("断言12 rate封存生效 auto=2×99+50×0.01+4×0.5", run('getDailyAutoHours("2026-10-12")'), 200.5);

// ---- getDailyHours 新出口 ----
const dh1 = run('getDailyHours("2026-10-12")');
check("断言13 无调整额 hours==autoHours", dh1.hours === 200.5 && dh1.adjustment === 0, true);
store["study_dashboard_daily_cards"] = JSON.stringify({ "2026-10-12": { adjustment: -0.5, statusScore: 4 } });
check("断言14 adjustment 仅当日单次累加 hours=200", run('getDailyHours("2026-10-12")').hours, 200);

check("断言15 schema 常量=6", run("CURRENT_SCHEMA_VERSION"), 6);

console.log(fail === 0 ? "回归通过 " + pass + "/15" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);