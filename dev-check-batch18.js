// ==================== dev-check-batch18.js ====================
// 批次18 回归：R-5b 日记（读写往返/空删语义/registry 17 键/schema 不变/UI 锚点）
// 运行：node dev-check-batch18.js
// 机制：localStorage 内存桩 + vm 实跑 config/storage/aggregation 三文件 + script/index/storage 源码文本锚点

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
const storageSrc = fs.readFileSync(path.join(__dirname, "js/storage.js"), "utf8");

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}
function run(code) { return vm.runInContext(code, ctx); }

store["study_dashboard_schema_version"] = "6";

// ---- R-5b 日记读写 ----
run('saveDayDiary("2026-10-12", "复盘A")');
check("断言1 写读往返", run('getDayDiary("2026-10-12")'), "复盘A");
run('saveDayDiary("2026-10-12", "复盘B")');
check("断言2 覆盖写", run('getDayDiary("2026-10-12")'), "复盘B");
run('saveDayDiary("2026-10-12", "   ")');
check("断言3 空白保存返回空串", run('getDayDiary("2026-10-12")'), "");
check("断言4 空白保存已删除该日键", run('Object.prototype.hasOwnProperty.call(getDayDiaries(), "2026-10-12")'), false);
check("断言5 无记录日期返回空串", run('getDayDiary("2026-10-13")'), "");
run('saveDayDiary("2026-10-14", "  带空白原文  ")');
check("断言6 非空内容按原文保存不修剪", run('getDayDiary("2026-10-14")'), "  带空白原文  ");

// ---- 存储层登记 ----
check("断言7 STORAGE_KEYS.dayDiary 键名", run("STORAGE_KEYS.dayDiary"), "study_dashboard_day_diary");
check("断言8 REGISTRY 含 dayDiary 且 object+backup", run('(function(){ const e = STORAGE_REGISTRY.find(x => x.id === "dayDiary"); return e ? e.type + "|" + e.backup : "missing"; })()'), "object|true");
check("断言9 REGISTRY 17 键", run("STORAGE_REGISTRY.length"), 17);

// ---- UI 锚点 ----
check("断言10 script 含日记函数与绑定", ["function handleSaveDayDiary", "cal-diary-input", 'bindClick("cal-diary-save-btn"'].every(s => scriptSrc.indexOf(s) !== -1), true);
check("断言11 index 零改动不含日记 id（全动态渲染）", indexSrc.indexOf("cal-diary-input") === -1, true);
check("断言12 storage 空删语义锚点", storageSrc.indexOf("delete all[dateStr]") !== -1, true);

check("断言13 schema 常量=6（新增键不迁移）", run("CURRENT_SCHEMA_VERSION"), 6);

console.log(fail === 0 ? "回归通过 " + pass + "/13" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
