// ==================== dev-check-batch21.js ====================
// 批次21 回归：R1 快捷区重构(搬家不改id) + R2 日历格高 + R4 月测分搬家 + R5 手机端两项 + R7 时间轴重排
// 运行：node dev-check-batch21.js
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
const reviewSrc = fs.readFileSync(path.join(__dirname, "js/ui/review.js"), "utf8");
const settingsSrc = fs.readFileSync(path.join(__dirname, "js/ui/settings.js"), "utf8");
const goalsSrc = fs.readFileSync(path.join(__dirname, "js/ui/goals.js"), "utf8");
const storageSrc = fs.readFileSync(path.join(__dirname, "js/storage.js"), "utf8");
const swSrc = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const ver = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8"));

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}
function inRegion(pageId, keyId) {
  const a = html.indexOf('id="' + pageId + '"');
  const b = html.indexOf('id="' + keyId + '"');
  const end = html.indexOf("global-stats-footer", a);
  return a !== -1 && end !== -1 && b > a && b < end;
}

check("断言1 快捷区5长条键+单列修饰class",
  ["global-stats-open-btn", "calendar-open-btn", "io-open-btn", "theme-toggle-btn", "more-open-btn"].every(id => html.indexOf('id="' + id + '"') !== -1)
  && html.indexOf("settings-actions-main") !== -1, true);

check("断言2 搬家不改id：17个旧id零丢失",
  ["backup-export-btn", "backup-import-btn", "manage-cmd-btn", "new-goal-btn-settings", "delete-goal-btn-settings",
   "export-checkins-md-btn", "export-daily-md-btn", "export-weekly-md-btn",
   "export-checkins-csv-btn", "export-daily-csv-btn", "export-weekly-csv-btn",
   "trend-toggle-btn", "sound-toggle-btn", "coeff-settings-list", "coeff-settings-save-btn",
   "backup-file-input", "backup-reminder-wrapper"].every(id => html.indexOf('id="' + id + '"') !== -1), true);

check("断言3 三聚合页在位", ["io-page", "more-features-page", "coeff-page"].every(id => html.indexOf('id="' + id + '"') !== -1), true);

check("断言4 键归属：10项在io页/6项在more页/2项在coeff页",
  ["backup-export-btn", "backup-import-btn", "export-checkins-md-btn", "export-daily-md-btn", "export-weekly-md-btn",
   "export-checkins-csv-btn", "export-daily-csv-btn", "export-weekly-csv-btn", "backup-file-input", "backup-reminder-wrapper"].every(id => inRegion("io-page", id))
  && ["coeff-open-btn", "new-goal-btn-settings", "delete-goal-btn-settings", "manage-cmd-btn", "trend-toggle-btn", "sound-toggle-btn"].every(id => inRegion("more-features-page", id))
  && ["coeff-settings-list", "coeff-settings-save-btn"].every(id => inRegion("coeff-page", id)), true);

check("断言5 快捷区净化：主题键在main grid内且导出键全部迁出",
  html.indexOf("settings-actions-main") !== -1
  && html.indexOf("settings-actions-main") < html.indexOf('id="theme-toggle-btn"')
  && html.indexOf('id="theme-toggle-btn"') < html.indexOf('id="io-page"'), true);

const iGrid = html.indexOf('id="progress-dashboard-grid"');
const iMonthly = html.indexOf('id="monthly-scores"');
const iTabWeekly = html.indexOf('id="tab-weekly"');
check("断言6 R4 月测分在看板页末尾", iGrid !== -1 && iMonthly > iGrid && iTabWeekly !== -1 && iMonthly < iTabWeekly, true);

check("断言7 R2 日历格定死高度且旧min-height清零",
  css.indexOf(".cal-cell { height: 64px;") !== -1 && css.indexOf(".cal-cell { height: 52px;") !== -1
  && css.indexOf(".cal-cell { min-height: 64px") === -1 && css.indexOf(".cal-cell { min-height: 52px") === -1, true);

check("断言8 R7 时间轴row1结构+卡点不截断+旧手机网格规则已删",
  reviewSrc.indexOf("stage-review-timeline-row1") !== -1 && reviewSrc.indexOf("slice(0, 60)") === -1
  && css.indexOf(".stage-review-timeline-row1") !== -1 && css.indexOf("grid-template-columns: 90px 1fr 50px") === -1, true);

check("断言9 R5② 格子data属性+详情条+幂等委托",
  reviewSrc.indexOf("data-sr-date") !== -1 && reviewSrc.indexOf("stage-review-heatmap-tip") !== -1 && reviewSrc.indexOf("inner.onclick") !== -1, true);

check("断言10 R5① 9卡label手机端防竖排",
  /stage-review-card-name\s*\{[^}]*white-space:\s*nowrap/.test(css), true);

check("断言11 六开关函数定义+export+绑定",
  ["openIoPage", "closeIoPage", "openMoreFeaturesPage", "closeMoreFeaturesPage", "openCoeffPage", "closeCoeffPage"]
    .every(n => settingsSrc.indexOf("function " + n) !== -1 && settingsSrc.split(n).length - 1 >= 2)
  && ["io-open-btn", "io-close-btn", "io-back-btn", "more-open-btn", "more-close-btn", "more-back-btn",
      "coeff-open-btn", "coeff-close-btn", "coeff-back-btn"].every(id => goalsSrc.indexOf('bindClick("' + id + '"') !== -1), true);

check("断言12 SW 与 version.json 版本同步（动态互查，禁止硬编码版本值）",
  typeof ver.cacheVersion === "string" && ver.cacheVersion.length > 0
  && swSrc.indexOf('"study-dashboard-' + ver.cacheVersion + '"') !== -1
  && typeof ver.buildBatch === "string" && /^批次 \d+$/.test(ver.buildBatch), true);

check("断言13 schema 常量=6", (storageSrc.match(/const CURRENT_SCHEMA_VERSION = (\d+)/) || [])[1], "6");

// ---- 修正令2 · 快捷区五键统一 + modal 层级 + 九卡两行式 + 日历导航防竖排 ----
check("断言14 modal 层级=3700", (css.match(/\.modal-overlay\s*\{[^}]*\}/) || [""])[0].indexOf("z-index: 3700") !== -1 && (css.match(/z-index:\s*2000/g) || []).length === 0, true);
check("断言15 旧排序/旧装饰清零", (css.match(/order:\s*-2/g) || []).length === 0 && (css.match(/order:\s*-1/g) || []).length === 0 && (css.match(/\{\s*order:\s*/g) || []).length === 0 && (css.match(/global-stats-card/g) || []).length === 0 && (css.match(/\.settings-actions-grid \.sound-toggle-card/g) || []).length === 0 && (css.match(/\.settings-action-card\.theme-toggle-card\s*\{/g) || []).length === 0, true);
check("断言16 快捷区 DOM 序", html.indexOf("io-open-btn") < html.indexOf("theme-toggle-btn") && html.indexOf("theme-toggle-btn") < html.indexOf("more-open-btn") && html.indexOf("global-stats-open-btn") < html.indexOf("calendar-open-btn") && html.indexOf("calendar-open-btn") < html.indexOf("io-open-btn"), true);
check("断言17 九卡两行式 + 日历导航锚点", css.indexOf(".stage-review-card-row { flex-direction: column") !== -1 && css.indexOf(".global-stats-header-actions .stage-review-back-btn") !== -1, true);

console.log(fail === 0 ? "回归通过 " + pass + "/17" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
