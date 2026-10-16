// ==================== dev-check-batch11.js ====================
// 批次11 全站单一口径对账回归（批次14b 重写）：周趋势/主热力图/全局统计/周报洞察/KPTA 统一出口对账
// 运行：node dev-check-batch11.js
// 机制：localStorage 内存桩 + document 最小桩(readyState=loading,init守卫不触发,migrateData 不跑)
//       + vm 按浏览器加载顺序实跑 config/storage/aggregation + js/ui 十四件 + main（批次20 整切后）
// 测试周固定为 2026-09-28~10-04（恒为过去周，cutoffToday 不影响；该周属主阶段"阶段0·前段"）
// #68：引擎层全精度，凡学时数值比较一律经 fmtHours

const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

// 造数（与 dev-check-weekly.js 同周同义）：单词 09-28~10-04 全勤(0.5h/天)；cmc 10-01 记4(6h)；
// listening 09-29=120min(2h) / 10-02=60min(1h) 计入产能；日卡 adjustment 09-29=+2.5(auto2.5→5) / 09-30=+2.4(auto0.5→2.9) / 10-01=−3.5(auto6.5→3) / 10-02=+8.5(auto1.5→10)
const vocab = [];
["2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02","2026-10-03","2026-10-04"]
  .forEach(function(ds, i) { vocab.push({ date: ds, value: 50, createdAt: 100 + i }); });
store["study_dashboard_checkins"] = JSON.stringify({
  vocabulary: vocab,
  cmc: [{ date: "2026-10-01", value: 4, createdAt: 200 }],
  listening: [{ date: "2026-09-29", value: 120, createdAt: 300 },
              { date: "2026-10-02", value: 60, createdAt: 301 }]
});
store["study_dashboard_custom_goals"] = JSON.stringify([]);
store["study_dashboard_daily_cards"] = JSON.stringify({
  "2026-09-29": { adjustment: 2.5, statusScore: 4 },
  "2026-09-30": { adjustment: 2.4, statusScore: 4 },
  "2026-10-01": { adjustment: -3.5, statusScore: 4 },
  "2026-10-02": { adjustment: 8.5, statusScore: 4 }
});

const ws = vm.runInContext('getWeeklyStats("2026-09-28")', ctx);
check("断言1 cet6Hours(fmtHours)", vm.runInContext('fmtHours(getWeeklyStats("2026-09-28").cet6Hours)', ctx), 3);

// 周趋势：09-28 周格子 == getWeeklyStats 同周（fmtHours 对账）
const trend = vm.runInContext("getWeeklyHoursTrendData()", ctx);
const trendWeek = trend.find(function(w) {
  return vm.runInContext("formatDateISO", ctx)(w.monday) === "2026-09-28";
});
check("断言2 周趋势该周hours(fmtHours)", trendWeek ? vm.runInContext("fmtHours", ctx)(trendWeek.hours) : null, 22.4);
check("断言3 周趋势==getWeeklyStats(fmtHours)", trendWeek ? vm.runInContext("fmtHours", ctx)(trendWeek.hours) : null, vm.runInContext("fmtHours", ctx)(ws.totalHours));

// 主热力图：逐格 == getDailyHours 同日
const heat = vm.runInContext("getYearHeatmapData()", ctx);
const flat = [];
heat.forEach(function(w) { w.forEach(function(c) { flat.push(c); }); });
const c1 = flat.find(function(c) { return c.dateStr === "2026-09-29"; });
const c2 = flat.find(function(c) { return c.dateStr === "2026-10-01"; });
check("断言4 热力图09-29(auto2.5+adj2.5=5)", c1 ? vm.runInContext("fmtHours", ctx)(c1.hours) : null, 5);
check("断言5 热力图10-01(auto6.5+adj−3.5=3)", c2 ? vm.runInContext("fmtHours", ctx)(c2.hours) : null, 3);

// 全局统计：收编三函数 == getGlobalStats（fmtHours 对账）
const gs = vm.runInContext("getGlobalStats()", ctx);
check("断言6 getGlobalTotalHours(fmtHours)", vm.runInContext("fmtHours", ctx)(vm.runInContext("getGlobalTotalHours()", ctx)), 22.4);
check("断言7 getGlobalTotalHours==getGlobalStats(严格)", vm.runInContext("getGlobalTotalHours()", ctx) === gs.totalHours, true);

const stats = vm.runInContext("getGlobalStatsStats()", ctx);
const monthlyMapped = vm.runInContext("fmtHours", ctx) ? stats.monthlyList.map(function(m) { return { month: m.month, hours: vm.runInContext("fmtHours", ctx)(m.hours) }; }) : null;
check("断言8 月度拆分(fmtHours)", JSON.stringify(monthlyMapped), JSON.stringify([{ month: "2026-09", hours: 8.4 }, { month: "2026-10", hours: 14 }]));
check("断言9 metricList==byMetric(严格)", JSON.stringify(stats.metricList), JSON.stringify(gs.byMetric));
const stageSum = vm.runInContext("fmtHours", ctx)(stats.stageList.reduce(function(a, s) { return a + s.hours; }, 0));
check("断言10 阶段列表合计==总学时(fmtHours)", stageSum, vm.runInContext("fmtHours", ctx)(stats.totalHours));
const q0 = stats.stageList.find(function(s) { return s.id === "阶段0·前段"; });
check("断言11 阶段0·前段归集(fmtHours)", q0 ? vm.runInContext("fmtHours", ctx)(q0.hours) : null, 22.4);
const byStageMapped = gs.byStage.map(function(x) { return { stageId: x.stageId, hours: vm.runInContext("fmtHours", ctx)(x.hours) }; });
check("断言12 byStage归集(fmtHours)", JSON.stringify(byStageMapped), JSON.stringify([{ stageId: "阶段0·前段", hours: 22.4 }]));

// 周报洞察/KPTA 冒烟（当前周无数据，应返回 string/object 不抛错）
let smoke1 = false, smoke2 = false;
try { const r1 = vm.runInContext("generateWeeklyInsights()", ctx); smoke1 = typeof r1 === "string"; } catch (e) { console.error("generateWeeklyInsights 抛错:", e.message); }
try { const r2 = vm.runInContext("buildKPTAItems()", ctx); smoke2 = typeof r2 === "object" && r2 !== null && Array.isArray(r2.items); } catch (e) { console.error("buildKPTAItems 抛错:", e.message); }
check("断言13 generateWeeklyInsights 冒烟(返回string)", smoke1, true);
check("断言14 buildKPTAItems 冒烟(返回{sufficient,items})", smoke2, true);

// 结构守卫：单一口径后 UI 层不再调用 auto 兼容层与 final shim（批次20：改扫整切后拼接源）
const src = UI_FILES.map(function(f) { return loadModuleSource(f); }).join("\n");
check("断言15 script.js无getDailyTotalHours调用", (src.match(/getDailyTotalHours\(/g) || []).length, 0);
check("断言16 script.js无getWeeklyTotalHours调用", (src.match(/getWeeklyTotalHours\(/g) || []).length, 0);
check("断言17 script.js无getDailyFinalHours调用(shim已拆)", (src.match(/getDailyFinalHours\(/g) || []).length, 0);

console.log(fail === 0 ? "回归通过 " + pass + "/17" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);