// ==================== dev-check-weekly.js ====================
// getWeeklyStats 周检口径回归（批次14b 重写）：单一口径(auto+adjustment)/3h达标天/单词7/7/竞赛系数/checkItems pass
// 运行：node dev-check-weekly.js
// 机制：localStorage 内存桩 + vm 按浏览器加载顺序实跑 config/storage/aggregation，
//       js/ui/base.js 的 parseDate/formatDateISO、js/ui/stage.js 的 getStageIdByDate 以同语义桩补齐（批次20 整切后）
// 测试周固定为 2026-09-28~10-04（恒为过去周，cutoffToday 不影响，任何日期运行结果一致）
// #68：引擎层全精度，学时比较一律经 fmtHours（显示层对账即口径对账）

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

// UI 层运行时依赖桩（与 js/ui/base.js parseDate/formatDateISO、js/ui/stage.js getStageIdByDate 同语义）
vm.runInContext([
  'function parseDate(str) { return new Date(str + "T00:00:00"); }',
  'function formatDateISO(date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0"); return y + "-" + m + "-" + d; }',
  'function getStageIdByDate(dateStr) { const d = parseDate(dateStr); for (const s of STAGES) { if (s.parentId) continue; if (d >= parseDate(s.start) && d <= parseDate(s.end)) return s.id; } return "未分类"; }'
].join("\n"), ctx, { filename: "stubs" });

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + expected + " 实测 " + actual); }
}

// 造数：单词 09-28(周一)~10-04 全勤(50词×0.01=0.5h/天)；cmc 10-01 记4(×1.5=6h)；
// 日卡 adjustment：09-29=+4.5(auto0.5→5) / 09-30=+2.4(→2.9) / 10-01=−3.5(auto6.5→3) / 10-02=+9.5(→10)
const vocab = [];
["2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02","2026-10-03","2026-10-04"]
  .forEach(function(ds, i) { vocab.push({ date: ds, value: 50, createdAt: 100 + i }); });
store["study_dashboard_checkins"] = JSON.stringify({
  vocabulary: vocab,
  cmc: [{ date: "2026-10-01", value: 4, createdAt: 200 }]
});
store["study_dashboard_custom_goals"] = JSON.stringify([]);
store["study_dashboard_daily_cards"] = JSON.stringify({
  "2026-09-29": { adjustment: 4.5, statusScore: 4 },
  "2026-09-30": { adjustment: 2.4, statusScore: 4 },
  "2026-10-01": { adjustment: -3.5, statusScore: 4 },
  "2026-10-02": { adjustment: 9.5, statusScore: 4 }
});

const ws = vm.runInContext('getWeeklyStats("2026-09-28")', ctx);
const byId = {};
ws.checkItems.forEach(function(ci) { byId[ci.id] = ci; });

// 日级：10-01 auto 6.5 + adjustment −3.5 = 3；adjustment≠0 即 badge 触发
const f = vm.runInContext('getDailyHours("2026-10-01")', ctx);
check("断言1 单一口径 hours=auto6.5−3.5", f.hours, 3);
check("断言2 adjustment=-3.5", f.adjustment, -3.5);
check("断言3 badge触发条件(adjustment≠0)", f.adjustment !== 0, true);

// 周级：0.5+5+2.9+3+10+0.5+0.5=22.4（单一口径含 adjustment）
check("断言4 周总(fmtHours)", vm.runInContext('fmtHours(getWeeklyStats("2026-09-28").totalHours)', ctx), 22.4);
check("断言5 达标天(3h阈值,2.9不计)", ws.achieveDays, 3);
check("断言6 单词7/7(周一不跳过)", ws.vocabDays, 7);
check("断言7 竞赛学时(fmtHours)", vm.runInContext('fmtHours(getWeeklyStats("2026-09-28").competitionHours)', ctx), 6);

// checkItems pass 判定（阈值读 STAGE_CHECK_RULES 兜底阶段0集）
check("断言8 total-hours.pass", byId["total-hours"].pass, true);
check("断言9 achieve-days.pass", byId["achieve-days"].pass, false);
check("断言10 competition.pass", byId["competition"].pass, false);
check("断言11 weekly-invest.pass", byId["weekly-invest"].pass, false);
check("断言12 vocab.pass", byId["vocab"].pass, true);

// 对账：区间层与周层同源相等（白皮书§8对账思想；同计算路径严格相等）
const range = vm.runInContext('getRangeTotalHours("2026-09-28","2026-10-04")', ctx);
check("断言13 周层==区间层(严格)", range.total === ws.totalHours, true);

console.log(fail === 0 ? "回归通过 " + pass + "/13" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);