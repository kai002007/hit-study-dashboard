// ==================== dev-check-batch20.js ====================
// 批次20 回归：ESM-b 整切（script.js → js/main.js + js/ui/*.js 单入口）静态闭包 + 行为等价校验
// 运行：node dev-check-batch20.js
// 机制：①静态扫描建全站符号表，逐文件校验"跨文件引用必有 import、被 import 必有 export"（机器防漏）
//       ②剥皮后 vm 按依赖序实跑全部 18 个运行时代码文件，行为等价数值断言

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadModuleSource(f) {
  // 批次19/20 共用：剥掉 module 语法（import/export）后按经典脚本供 vm 实跑
  let src = fs.readFileSync(path.join(__dirname, f), "utf8");
  src = src.replace(/^import\s[\s\S]*?from\s*"[^"]+";[^\S\r\n]*(\r?\n)?/gm, "");
  src = src.replace(/^export\s*\{[\s\S]*?\};[^\S\r\n]*(\r?\n)?/gm, "");
  return src;
}

const UI_FILES = ["js/ui/base.js", "js/ui/daily-card.js", "js/ui/version.js", "js/ui/stage.js", "js/ui/checkin.js", "js/ui/charts.js", "js/ui/weekly.js", "js/ui/command.js", "js/ui/today.js", "js/ui/goals.js", "js/ui/dashboard.js", "js/ui/review.js", "js/ui/global-stats.js", "js/ui/settings.js"];
const RUNTIME_FILES = ["js/config.js", "js/storage.js", "js/aggregation.js"].concat(UI_FILES, ["js/main.js"]);

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}

// ---- 断言1：整切后文件存在性（18 在位 + 2 删除）----
check("断言1 十八运行时在位且 bridge/script 已删",
  RUNTIME_FILES.every(function(f) { return fs.existsSync(path.join(__dirname, f)); }) &&
  !fs.existsSync(path.join(__dirname, "js/bridge.js")) &&
  !fs.existsSync(path.join(__dirname, "script.js")), true);

// ---- 断言2/3：静态闭包校验（机器防漏名 / 防漏 export）----
const declRe = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/;
const owner = {};
const stripped = {};
const raw = {};
for (const f of RUNTIME_FILES) {
  raw[f] = fs.readFileSync(path.join(__dirname, f), "utf8");
  stripped[f] = loadModuleSource(f);
}
function stripComments(s) {
  // 批次20 修正令：剥整行注释与块注释，防注释误报（行内 code//comment 不剥，字符串不受影响）
  return s.replace(/^[ \t]*\/\/[^\n]*(\r?\n)?/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
const noComment = {};
for (const f of RUNTIME_FILES) {
  noComment[f] = stripComments(stripped[f]);
  for (const line of noComment[f].split("\n")) {
    const d = line.match(declRe);
    if (d) { const n = d[1] || d[2]; if (!owner[n]) owner[n] = f; }
  }
}
function importedNames(f) {
  const set = new Set();
  const re = /^import\s*\{([^}]*)\}\s*from\s*"[^"]+";/gm;
  let m;
  while ((m = re.exec(raw[f]))) {
    m[1].split(",").forEach(function(n) { n = n.trim(); if (n) set.add(n); });
  }
  return set;
}
const missImport = [];
for (const f of RUNTIME_FILES) {
  const ownDecls = new Set();
  for (const line of noComment[f].split("\n")) { const d = line.match(declRe); if (d) ownDecls.add(d[1] || d[2]); }
  const imported = importedNames(f);
  for (const n of Object.keys(owner)) {
    if (ownDecls.has(n) || owner[n] === f) continue;
    const re = new RegExp("(?<![.\\w$])" + n.replace(/[$]/g, "\\$") + "(?![\\w$])");
    if (re.test(noComment[f]) && !imported.has(n)) missImport.push(f + " 漏 " + n + "(来自 " + owner[n] + ")");
  }
}
check("断言2 跨文件引用全部有 import（缺失：" + (missImport.join("；") || "无") + "）", missImport.length, 0);
const missExport = [];
for (const f of RUNTIME_FILES) {
  const expM = raw[f].match(/^export\s*\{([\s\S]*?)\};/m);
  const expSet = new Set(expM ? expM[1].split(",").map(function(s) { return s.trim(); }).filter(Boolean) : []);
  const base = path.basename(f).replace(/\./g, "\\.");
  for (const g of RUNTIME_FILES) {
    if (g === f) continue;
    const re = new RegExp("^import\\s*\\{([^}]*)\\}\\s*from\\s*\"[^\"]*" + base + "\";", "gm");
    let m;
    while ((m = re.exec(raw[g]))) {
      m[1].split(",").forEach(function(n) { n = n.trim(); if (n && !expSet.has(n)) missExport.push(g + " 向 " + f + " 取了未导出的 " + n); });
    }
  }
}
check("断言3 全部被 import 的名字均有 export（缺失：" + (missExport.join("；") || "无") + "）", missExport.length, 0);

// ---- 断言4：vm 行为等价（剥皮按序实跑 18 文件）----
const store = {};
const localStorageStub = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function(k, v) { store[k] = String(v); },
  removeItem: function(k) { delete store[k]; }
};
const documentStub = {
  readyState: "loading",
  addEventListener: function() {},
  getElementById: function() { return null; },
  querySelector: function() { return null; },
  querySelectorAll: function() { return []; },
  createElement: function() {
    return { innerHTML: "", style: {}, dataset: {},
             classList: { add: function() {}, remove: function() {}, toggle: function() {} },
             appendChild: function() {}, setAttribute: function() {} };
  },
  body: { dataset: {} }
};
const ctx = vm.createContext({ localStorage: localStorageStub, document: documentStub, console: console });
RUNTIME_FILES.forEach(function(f) { vm.runInContext(loadModuleSource(f), ctx, { filename: f }); });
function run(code) { return vm.runInContext(code, ctx); }
store["study_dashboard_schema_version"] = "6";
store["study_dashboard_checkins"] = JSON.stringify({
  "final-courses": [{ date: "2026-10-12", value: 4, isMakeup: false, stageId: "阶段0", createdAt: 1002, rate: 0.75 }]
});
check("断言4 行为等价：finalReviewHours=3 + 日记往返 + 阶段判断 + 日期工具",
  run('getWeeklyStats("2026-10-12").finalReviewHours') === 3 &&
  run('saveDayDiary("2026-10-12", "复盘A"), getDayDiary("2026-10-12")') === "复盘A" &&
  run('getStageIdByDate("2026-10-12")') === "阶段0" &&
  run('formatDateISO(parseDate("2026-10-12"))') === "2026-10-12", true);

// ---- 断言5：index.html 单入口整切 ----
const idxSrc = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
check("断言5 index 仅 main.js 一个 module 标签",
  idxSrc.indexOf('<script type="module" src="js/main.js"></script>') !== -1 &&
  idxSrc.indexOf('src="script.js"') === -1 &&
  idxSrc.indexOf('src="js/bridge.js"') === -1 &&
  (idxSrc.match(/<script type="module"/g) || []).length === 1, true);

// ---- 断言6：SW 整切资产（动态对齐 version.json）----
const swSrc = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const vjson = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8"));
check("断言6 SW 同步且 22 项资产整切在位",
  swSrc.indexOf('"study-dashboard-' + vjson.cacheVersion + '"') !== -1 &&
  swSrc.indexOf('"./js/main.js"') !== -1 &&
  UI_FILES.every(function(f) { return swSrc.indexOf('"./' + f + '"') !== -1; }) &&
  swSrc.indexOf('"./js/bridge.js"') === -1 &&
  swSrc.indexOf('"./script.js"') === -1, true);

// ---- 断言7：版本同步（批次21修正令1 起动态互查，禁止硬编码版本值）----
check("断言7 version.json 与 SW CACHE_NAME 版本同步",
  typeof vjson.cacheVersion === "string" && vjson.cacheVersion.length > 0
  && swSrc.indexOf('"study-dashboard-' + vjson.cacheVersion + '"') !== -1
  && typeof vjson.buildBatch === "string" && /^批次 \d+$/.test(vjson.buildBatch), true);

// ---- 断言8：数据层新 import 锚点 ----
const stgSrc = raw["js/storage.js"];
const aggSrc = raw["js/aggregation.js"];
check("断言8 storage/aggregation 接入 ui 层 import",
  stgSrc.indexOf('import { notify } from "./ui/base.js";') !== -1 &&
  aggSrc.indexOf('import { parseDate, formatDateISO } from "./ui/base.js";') !== -1 &&
  aggSrc.indexOf('import { getStageIdByDate } from "./ui/stage.js";') !== -1, true);

// ---- 断言9：两 let 搬迁落位（赋值唯一性）----
const stageSrc = raw["js/ui/stage.js"], chartsSrc = raw["js/ui/charts.js"], dashSrc = raw["js/ui/dashboard.js"];
check("断言9 跨模块可变状态归位（批次22 R3 起热力图默认近13周，初值有意改 false）",
  stageSrc.indexOf("let currentViewStageId = null;") !== -1 &&
  chartsSrc.indexOf("let heatmapFullView = false;") !== -1 &&
  dashSrc.indexOf("currentViewStageId") === -1 && dashSrc.indexOf("heatmapFullView") === -1 &&
  (stageSrc.match(/currentViewStageId =[^=]/g) || []).length === 4 &&
  (chartsSrc.match(/heatmapFullView =[^=]/g) || []).length === 2, true);

// ---- 断言10：init 守卫守尾 + IIFE 在位 ----
const mainSrc = raw["js/main.js"];
const tail = mainSrc.trim().split("\n").slice(-6).join("\n");
check("断言10 init 守卫守尾且 IIFE 在位",
  tail.indexOf('document.readyState === "loading"') !== -1 &&
  tail.indexOf("initDashboard") !== -1 &&
  mainSrc.indexOf("(function initAppTabs()") !== -1, true);

// ---- 断言11：import 行数抽查（^import 行数口径）----
function importCount(f) { return (raw[f].match(/^import /gm) || []).length; }
check("断言11 import 行数 checkin=6/goals=12/main=13/base=2",
  [importCount("js/ui/checkin.js"), importCount("js/ui/goals.js"), importCount("js/main.js"), importCount("js/ui/base.js")].join(","), "6,12,13,2");

// ---- 断言12：无 window 桥残留 ----
check("断言12 全站无 window 桥残留",
  RUNTIME_FILES.every(function(f) { return raw[f].indexOf("Object.assign(window,") === -1 && raw[f].indexOf("bridge.js") === -1; }), true);

// ---- 断言13：schema 不变 ----
check("断言13 schema 常量=6", run("CURRENT_SCHEMA_VERSION"), 6);

// ---- 断言14：import 路径存在性机器校验（批次20 修正令2 新增）----
// 防线定位：node --check 只查语法、vm 剥皮后 import 行已删、断言2/3 仅按符号名匹配——"符号对而路径错"仅浏览器可见，必须纳入机器防线
let importTotal = 0;
const badPath = [];
const importRe = /^import\s[\s\S]*?from\s*"([^"]+)";/gm;
for (const f of RUNTIME_FILES) {
  let m;
  while ((m = importRe.exec(raw[f]))) {
    importTotal++;
    if (!fs.existsSync(path.resolve(__dirname, path.dirname(f), m[1]))) badPath.push(f + " → " + m[1]);
  }
}
check("断言14 import 路径存在性（共 " + importTotal + " 条，缺失：" + (badPath.join("；") || "无") + "）", badPath.length, 0);

console.log(fail === 0 ? "回归通过 " + pass + "/14" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
