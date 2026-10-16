// ==================== dev-check-aggregation.js ====================
// getGlobalHoursByMetric 恒空缺陷回归（批次9 修正令2 配套）
// 运行：node dev-check-aggregation.js
// 机制：localStorage 内存桩 + vm 按浏览器加载顺序实跑 config/storage/aggregation
// 本文件仅供开发回归，不入 CORE_ASSETS，不被 index.html 引用

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

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + expected + " 实测 " + actual); }
}

function cmcHours() {
  const list = vm.runInContext("getGlobalHoursByMetric()", ctx);
  const hit = list.find(function(e) { return e.key === "cmc"; });
  return hit ? hit.hours : null;
}

function seed(list) {
  store["study_dashboard_checkins"] = JSON.stringify({ cmc: list });
  store["study_dashboard_custom_goals"] = JSON.stringify([]);
}

// 断言1：普通打卡两天（8+2），cmc hours = (8+2)×1.5 = 15（修复前 metricList 恒空，此断言必挂）
seed([
  { date: "2026-10-08", value: 8, createdAt: 100 },
  { date: "2026-10-09", value: 2, createdAt: 200 }
]);
check("断言1 普通2天 (8+2)×1.5", cmcHours(), 15);

// 断言2：同日追加补记（isMakeup，createdAt 最新）→ 补记优先且该日只计一次：(8+1)×1.5 = 13.5
seed([
  { date: "2026-10-08", value: 8, createdAt: 100 },
  { date: "2026-10-09", value: 2, createdAt: 200 },
  { date: "2026-10-09", value: 1, isMakeup: true, createdAt: 300 }
]);
check("断言2 补记优先单日单计 (8+1)×1.5", cmcHours(), 13.5);

// 断言3：同日两条普通，createdAt 最新者生效：(3+2)×1.5 = 7.5
seed([
  { date: "2026-10-08", value: 8, createdAt: 100 },
  { date: "2026-10-08", value: 3, createdAt: 400 },
  { date: "2026-10-09", value: 2, createdAt: 200 }
]);
check("断言3 createdAt最新生效 (3+2)×1.5", cmcHours(), 7.5);

console.log(fail === 0 ? "回归通过 " + pass + "/3" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
