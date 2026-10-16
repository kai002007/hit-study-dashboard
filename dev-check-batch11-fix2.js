// ==================== dev-check-batch11-fix2.js ====================
// 批次11修正令2 回归：A草稿指纹再生 / B单词周一不跳过(分母7) / C byMetric口径注释 / D 未开始阶段热力图空态
// 运行：node dev-check-batch11-fix2.js
// 机制：localStorage+document 内存桩 + FakeDate 固定 2026-10-11(周日) + vm 按浏览器加载顺序实跑四文件

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const store = {};
const localStorageStub = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function(k, v) { store[k] = String(v); },
  removeItem: function(k) { delete store[k]; }
};
const heatmapEl = { innerHTML: "" };
const documentStub = {
  readyState: "loading",
  addEventListener: function() {},
  getElementById: function(id) { return id === "stage-review-heatmap-inner" ? heatmapEl : null; },
  querySelector: function() { return null; },
  querySelectorAll: function() { return []; },
  createElement: function() {
    return { innerHTML: "", style: {}, dataset: {},
             classList: { add: function() {}, remove: function() {}, toggle: function() {} },
             appendChild: function() {}, setAttribute: function() {} };
  },
  body: { dataset: {} }
};
const RealDate = Date;
class FakeDate extends RealDate {
  constructor() {
    if (arguments.length === 0) super("2026-10-11T12:00:00");
    else super(...arguments);
  }
  static now() { return new RealDate("2026-10-11T12:00:00").getTime(); }
}

const ctx = vm.createContext({ localStorage: localStorageStub, document: documentStub, console: console, Date: FakeDate });
// 批次19（ESM-a）：剥掉 module 语法（import/export）后按经典脚本供 vm 实跑
function loadModuleSource(f) {
  let src = fs.readFileSync(path.join(__dirname, f), "utf8");
  src = src.replace(/^import\s[\s\S]*?from\s*"[^"]+";[^\S\r\n]*(\r?\n)?/gm, "");
  src = src.replace(/^export\s*\{[\s\S]*?\};[^\S\r\n]*(\r?\n)?/gm, "");
  return src;
}

// 批次20（ESM-b）：script.js 已整切为 js/main.js + js/ui/*.js
const UI_FILES = ["js/ui/base.js", "js/ui/daily-card.js", "js/ui/version.js", "js/ui/stage.js", "js/ui/checkin.js", "js/ui/charts.js", "js/ui/weekly.js", "js/ui/command.js", "js/ui/today.js", "js/ui/goals.js", "js/ui/dashboard.js", "js/ui/review.js", "js/ui/global-stats.js", "js/ui/settings.js", "js/main.js"];

["js/config.js", "js/storage.js", "js/aggregation.js"].concat(UI_FILES).forEach(function(f) {
  vm.runInContext(loadModuleSource(f), ctx, { filename: f });
});

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}

// 造数：单词 10-05(周一)/10-06/10-07 各 50 词 → 本周有效记录 3 天(避开 KPTA 降级)
store["study_dashboard_checkins"] = JSON.stringify({
  vocabulary: [
    { date: "2026-10-05", value: 50, createdAt: 101 },
    { date: "2026-10-06", value: 50, createdAt: 102 },
    { date: "2026-10-07", value: 50, createdAt: 103 }
  ]
});
store["study_dashboard_custom_goals"] = JSON.stringify([]);

// ---- B：单词分母=7（周一不跳过）。修复前为 3/6，修复后为 3/7 ----
const kpta = vm.runInContext("buildKPTAItems()", ctx);
check("断言1 KPTA keep 含单词3/7", kpta.items[0].text.indexOf("3/7") >= 0, true);
const insights = vm.runInContext("generateWeeklyInsights()", ctx);
check("断言2 周报洞察 含3/7", insights.indexOf("3/7") >= 0, true);

// ---- A：草稿指纹机制 ----
vm.runInContext("renderWeeklyReview()", ctx);
const wk = vm.runInContext("getCurrentWeekKey()", ctx);
const rec1 = vm.runInContext("loadWeeklyReview(" + JSON.stringify(wk) + ")", ctx);
check("断言3 首渲染写指纹 draftKeep==keep 且非空", rec1.draftKeep === rec1.keep && rec1.keep.length > 0, true);

// 模拟人工编辑 keep（指纹不动），再补单词 10-08~10-11 → 草稿数据面变化
vm.runInContext("saveWeeklyReview(" + JSON.stringify(wk) + ", " + JSON.stringify({
  keep: "人工保留", problem: rec1.problem, try: "", plan: "",
  draftKeep: rec1.draftKeep, draftProblem: rec1.draftProblem
}) + ")", ctx);
const vocab2 = JSON.parse(store["study_dashboard_checkins"]);
["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"].forEach(function(ds, i) {
  vocab2.vocabulary.push({ date: ds, value: 50, createdAt: 200 + i });
});
store["study_dashboard_checkins"] = JSON.stringify(vocab2);
vm.runInContext("renderWeeklyReview()", ctx);
const rec2 = vm.runInContext("loadWeeklyReview(" + JSON.stringify(wk) + ")", ctx);
check("断言4 人工编辑的 keep 被锁定不被覆盖", rec2.keep, "人工保留");
check("断言5 未触碰的 problem 随数据重算并更新指纹", rec2.problem !== rec1.problem && rec2.draftProblem === rec2.problem, true);

// ---- C：byMetric 口径注释进 DOM ----
const barBox = { innerHTML: "" };
ctx.__box = barBox;
vm.runInContext("renderGlobalStatsMetricBars(__box, { metricList: [{ name: '单词', hours: 1 }] })", ctx);
check("断言6 口径注释进DOM", barBox.innerHTML.indexOf("当日调整额不摊入指标") >= 0, true);

// ---- D：未开始阶段空态 + 进行中阶段正常 ----
vm.runInContext('renderStageReviewHeatmap("阶段1")', ctx);
check("断言7 未开始阶段空态提示", heatmapEl.innerHTML.indexOf("阶段尚未开始") >= 0, true);
heatmapEl.innerHTML = "";
vm.runInContext('renderStageReviewHeatmap("阶段0")', ctx);
check("断言8 阶段0正常出svg且无负viewBox", heatmapEl.innerHTML.indexOf("<svg") >= 0 && !/viewBox="0 0 \d+ -/.test(heatmapEl.innerHTML), true);

// ---- 结构守卫 ----
const src = UI_FILES.map(function(f) { return loadModuleSource(f); }).join("\n");
check("断言9 单词例外恰好2处", (src.match(/key !== "vocabulary"/g) || []).length, 2);
const storageSrc = fs.readFileSync(path.join(__dirname, "js/storage.js"), "utf8");
check("断言10 storage指纹字段6处", (storageSrc.match(/draftK|draftP/g) || []).length, 6);

// ---- 批次11修正令4：单词7/7例外全量收编 + 周报文本人工栏注记 ----
const waV = vm.runInContext('getWeeklyAchievement("vocabulary")', ctx);
check("断言11 单词徽章7/7全勤(周一计入)", JSON.stringify(waV), JSON.stringify({ achieved: 7, total: 7 }));
const waL = vm.runInContext('getWeeklyAchievement("listening")', ctx);
check("断言12 听力徽章分母6(周一休息保留)", JSON.stringify(waL), JSON.stringify({ achieved: 0, total: 6 }));
const monV = vm.runInContext('getTrendData("vocabulary")', ctx).find(function(it) { return it.dateStr === "2026-10-05"; });
const monL = vm.runInContext('getTrendData("listening")', ctx).find(function(it) { return it.dateStr === "2026-10-05"; });
check("断言13 趋势图周一:单词非休息/听力休息", monV.isRestDay === false && monL.isRestDay === true, true);
const reportText = vm.runInContext("generateWeeklyReportText()", ctx);
check("断言14 周报文本含人工栏注记", reportText.indexOf("人工维护文本") >= 0, true);
check("断言15 metricKey单词例外恰好5处", (src.match(/metricKey !== "vocabulary"/g) || []).length, 5);

// ---- 批次12 TDZ专项：init 守卫归位 + 顶层可执行语句审计 ----
const trimmed = src.replace(/\s+$/, "");
check("断言16 init守卫为文件最后一个语句", trimmed.lastIndexOf('readyState === "loading"') > trimmed.lastIndexOf("function "), true);
const topLevelExec = src.split("\n").filter(function(l) { return /^[A-Za-z_$][\w$]*\(/.test(l) && l.indexOf("function") !== 0; });
check("断言17 顶层可执行语句归零", topLevelExec.length, 0);

console.log(fail === 0 ? "回归通过 " + pass + "/17" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);