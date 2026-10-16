// ==================== dev-check-batch22.js ====================
// 批次22 回归：R3 日卡重构（DAILY_CAP 上限口径）+ 真机复验三项（日历header/日历格/io页）+ 挂账清账四项 + 热力图默认13周
// 运行：node dev-check-batch22.js
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
const configSrc = fs.readFileSync(path.join(__dirname, "js/config.js"), "utf8");
const dailySrc = fs.readFileSync(path.join(__dirname, "js/ui/daily-card.js"), "utf8");
const settingsSrc = fs.readFileSync(path.join(__dirname, "js/ui/settings.js"), "utf8");
const commandSrc = fs.readFileSync(path.join(__dirname, "js/ui/command.js"), "utf8");
const chartsSrc = fs.readFileSync(path.join(__dirname, "js/ui/charts.js"), "utf8");
const gsSrc = fs.readFileSync(path.join(__dirname, "js/ui/global-stats.js"), "utf8");
const storageSrc = fs.readFileSync(path.join(__dirname, "js/storage.js"), "utf8");
const swSrc = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const ver = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8"));

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}

check("断言1 DAILY_CAP 七值与导出",
  configSrc.indexOf("const DAILY_CAP = [2.5, 6.0, 5.5, 5.0, 6.5, 8.0, 6.5];") !== -1
  && /export \{[\s\S]*DAILY_CAP/.test(configSrc), true);

check("断言2 日卡 HTML：计划h输入已删，三只读域+调整额在位",
  html.indexOf('id="daily-plan-hours"') === -1
  && html.indexOf('id="daily-today-hours"') !== -1
  && html.indexOf('id="daily-cap"') !== -1
  && html.indexOf('id="daily-ratio"') !== -1
  && html.indexOf('id="daily-actual-hours"') !== -1, true);

check("断言3 daily-card.js：plan 引用清零，DAILY_CAP 接线",
  dailySrc.indexOf("daily-plan-hours") === -1 && dailySrc.indexOf("planInput") === -1
  && dailySrc.indexOf('DAILY_CAP } from "../config.js"') !== -1
  && dailySrc.indexOf("getDailyHours(todayStr)") !== -1
  && dailySrc.indexOf("planHours: 0") !== -1, true);

check("断言4 新比值口径=今日÷上限百分比",
  dailySrc.indexOf("hours / cap") !== -1 && dailySrc.indexOf('Math.round(ratio * 100) + "%"') !== -1, true);

check("断言5 两处导出表头=上限h，数据源=DAILY_CAP按星期",
  settingsSrc.indexOf('"上限h"') !== -1 && settingsSrc.indexOf('"计划h"') === -1
  && commandSrc.indexOf("| 上限h |") !== -1 && commandSrc.indexOf("| 计划h |") === -1
  && settingsSrc.indexOf('DAILY_CAP[(new Date(dateStr + "T00:00:00").getDay() + 6) % 7]') !== -1
  && commandSrc.indexOf('DAILY_CAP[(new Date(dateStr + "T00:00:00").getDay() + 6) % 7]') !== -1, true);

check("断言6 storage planHours 落库保留（旧备份兼容）",
  storageSrc.indexOf("planHours: Number(data.planHours) || 0") !== -1, true);

check("断言7 日历格：工时项数合并+阶段去前缀",
  gsSrc.indexOf('.replace(/^阶段/, "")') !== -1 && gsSrc.indexOf("cal-count") === -1, true);

check("断言8 日历页窄屏 header 锚点（X钉右上+导航等分）",
  css.indexOf("#calendar-page .global-stats-close-btn { position: absolute; top: 12px; right: 12px; }") !== -1
  && css.indexOf("#calendar-page .global-stats-header-actions .stage-review-back-btn { flex: 1;") !== -1, true);

check("断言9 io页8键统一覆盖块",
  css.indexOf("#io-page .settings-action-card { background: var(--bg-card); border-color: var(--border-subtle);") !== -1
  && css.indexOf("#io-page .settings-action-card svg { stroke: var(--purple-400); }") !== -1, true);

check("断言10 月测分留距+双线区分",
  /margin-top: 16px; \/\* 批次22 ⑫/.test(css)
  && css.indexOf(".monthly-track-chart .ref-line-fallback { stroke: #f59e0b;") !== -1
  && chartsSrc.indexOf('ref-label-fallback" x="${padL}" y="${yFallback - 3}" text-anchor="start"') !== -1, true);

check("断言11 系数页呼吸感+热力图默认13周",
  css.indexOf("#coeff-page .global-stats-goal-input { max-width: 260px; }") !== -1
  && chartsSrc.indexOf("let heatmapFullView = false;") !== -1, true);

check("断言12 SW 与 version.json 版本同步（动态互查，禁止硬编码版本值）",
  swSrc.indexOf('study-dashboard-' + ver.cacheVersion) !== -1
  && ver.buildBatch.replace(/\s/g, "") === "批次37", true);

check("断言13 schema 常量=6（本批零迁移）", (storageSrc.match(/const CURRENT_SCHEMA_VERSION = (\d+)/) || [])[1], "6");

check("断言14 io页六导出键终审排序+统一形状+提醒卡跨列",
  (() => {
    const order = ["backup-export-btn", "backup-import-btn", "export-daily-md-btn", "export-daily-csv-btn",
      "export-weekly-md-btn", "export-weekly-csv-btn", "export-checkins-md-btn", "export-checkins-csv-btn",
      "backup-reminder-wrapper"].map(id => html.indexOf('id="' + id + '"'));
    return order.every(i => i !== -1) && order.every((v, i) => i === 0 || v > order[i - 1]);
  })()
  && css.indexOf("#io-page .md-export-card, #io-page .csv-export-card { min-height: 104px; }") !== -1
  && css.indexOf("#io-page #backup-reminder-wrapper { grid-column: 1 / -1; }") !== -1, true);

console.log(fail === 0 ? "回归通过 " + pass + "/14" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
