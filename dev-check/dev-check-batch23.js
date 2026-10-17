// ==================== dev-check-batch23.js ====================
// 施工批次23（构建批次38）回归：第 7 套主题「极光光谱 aurora-spectrum」+ 第 8 套主题「极光静奢 aurora-quiet」
// 命名口径（决策 #82）：dev-check 文件名与 AI 日志标题用「施工批次」，version.json 的 buildBatch 记「构建批次」。
// 运行：node dev-check-batch23.js
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
const configSrc = fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8");
const settingsSrc = fs.readFileSync(path.join(ROOT, "js/ui/settings.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const swSrc = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
const ver = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}

// ---------- 1. 主题清单：8 套，双主题在册 ----------
const orderLine = (configSrc.match(/const THEME_ORDER = \[([^\]]*)\]/) || [])[1] || "";
check("断言1 THEME_ORDER 共 8 套且新增两套在册",
  orderLine.split(",").length === 8
  && orderLine.indexOf('"aurora-spectrum"') !== -1
  && orderLine.indexOf('"aurora-quiet"') !== -1, true);

check("断言2 THEME_NAMES 有「极光光谱」「极光静奢」",
  settingsSrc.indexOf('"aurora-spectrum": "极光光谱"') !== -1
  && settingsSrc.indexOf('"aurora-quiet": "极光静奢"') !== -1, true);

check("断言3 THEME_PREVIEW_COLORS 双主题 8 字段齐全",
  /"aurora-spectrum":\s*\{[^}]*bg:[^}]*accent2:[^}]*normal:[^}]*warning:[^}]*text:[^}]*scheme:[^}]*\}/.test(settingsSrc)
  && /"aurora-quiet":\s*\{[^}]*bg:[^}]*accent2:[^}]*normal:[^}]*warning:[^}]*text:[^}]*scheme:[^}]*\}/.test(settingsSrc), true);

check("断言4 applyTheme 同步手机状态栏 theme-color",
  settingsSrc.indexOf("THEME_META_COLORS") !== -1
  && settingsSrc.indexOf('document.querySelector(\'meta[name="theme-color"]\')') !== -1, true);

// ---------- 2. style.css：主题块与令牌 ----------
check("断言5 两套主题块存在且 bg 正确",
  css.indexOf('body[data-theme="aurora-spectrum"] {\n  color-scheme: dark;\n  --bg-page: #05070e;') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] {\n  color-scheme: dark;\n  --bg-page: #07080c;') !== -1, true);

check("断言6 光谱主题主色=青 + 三色渐变",
  css.indexOf('--purple-500: #22d3ee;') !== -1
  && css.indexOf('--gradient-purple: linear-gradient(135deg, #22d3ee 0%, #818cf8 48%, #e879f9 100%);') !== -1, true);

check("断言7 静奢主题主色=冰青 + 香槟金强调",
  css.indexOf('--purple-500: #9cc7db;') !== -1
  && css.indexOf('--status-warning: #d9c39a;') !== -1, true);

// ---------- 3. 热力图四阶 / 图例 / 气泡 / 饼图 ----------
check("断言8 光谱主题热力图四色光谱（蓝青紫粉）",
  css.indexOf('body[data-theme="aurora-spectrum"] .heatmap-l1 { fill: #1e3a8a; }') !== -1
  && css.indexOf('body[data-theme="aurora-spectrum"] .heatmap-l2 { fill: #0ea5e9; }') !== -1
  && css.indexOf('body[data-theme="aurora-spectrum"] .heatmap-l3 { fill: #a78bfa; }') !== -1
  && css.indexOf('body[data-theme="aurora-spectrum"] .heatmap-l4 { fill: #f472b6; }') !== -1, true);

check("断言9 静奢主题热力图单色冰蓝四阶",
  css.indexOf('body[data-theme="aurora-quiet"] .heatmap-l1 { fill: #22303f; }') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .heatmap-l2 { fill: #33566f; }') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .heatmap-l3 { fill: #5a8ba6; }') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .heatmap-l4 { fill: #9cbccd; }') !== -1, true);

check("断言10 两套热力图图例（各 5 条）",
  (css.match(/body\[data-theme="aurora-spectrum"\] \.year-heatmap-legend \.heatmap-\w+ \{ background:/g) || []).length === 5
  && (css.match(/body\[data-theme="aurora-quiet"\] \.year-heatmap-legend \.heatmap-\w+ \{ background:/g) || []).length === 5, true);

check("断言11 两套热力图气泡 + 饼图底圈",
  css.indexOf('body[data-theme="aurora-spectrum"] .heatmap-tooltip {') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .heatmap-tooltip {') !== -1
  && css.indexOf('body[data-theme="aurora-spectrum"] .pie-bg {') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .pie-bg {') !== -1, true);

check("断言12 静奢饼图三态（绿/香槟金/冰青）",
  css.indexOf('body[data-theme="aurora-quiet"] .pie-fill.status-normal') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .pie-fill.status-warning') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .pie-fill.status-danger') !== -1, true);

// ---------- 4. 批次 E 覆盖（紫色达标条不得回潮） ----------
check("断言13 两套达标进度条压过批次 E 紫色渐变",
  /body\[data-theme="aurora-spectrum"\] \.metric-bar-fill\.status-normal \{[^}]*linear-gradient\(90deg, #0ea5e9, #22d3ee, #a5b4fc\) !important/.test(css)
  && /body\[data-theme="aurora-quiet"\] \.metric-bar-fill\.status-normal \{[^}]*linear-gradient\(90deg, #33566f, #5a8ba6, #9cc7db\) !important/.test(css), true);

// ---------- 5. 背景层（压在批次 C 时间色温之后） ----------
check("断言14 两套背景光斑/网格令牌在册（文件末尾覆盖时间色温）",
  css.indexOf("--bg-spot-1: rgba(34, 211, 238, 0.20);") !== -1
  && css.indexOf("--bg-spot-1: rgba(143, 214, 232, 0.11);") !== -1
  && css.indexOf("background-size: auto, auto, 40px 40px, 40px 40px, auto, auto;") !== -1
  && css.indexOf("background-size: auto, auto, 44px 44px, 44px 44px, auto, auto;") !== -1, true);

check("断言15 静奢 9 个指标图标去饱和",
  (css.match(/body\[data-theme="aurora-quiet"\] \[data-metric="[a-z-]+"\] \.metric-icon/g) || []).length === 9, true);

// ---------- 6. HTML / 版本链 ----------
check("断言16 index.html 静态 theme-color 对齐暗紫底", html.indexOf('<meta name="theme-color" content="#0f0a1a">') !== -1, true);

check("断言17 版本三处同步（version.json / service-worker / 关于卡动态读）",
  ver.workbench === "v2.8" && ver.buildBatch.replace(/\s/g, "") === "批次39"
  && swSrc.indexOf('const CACHE_NAME = "study-dashboard-' + ver.cacheVersion + '";') !== -1
  && ver.cacheVersion === "v31", true);

// ---------- 7. 子页面写死紫色组件的主题对齐（批次38 补充） ----------
check("断言18 子页面 CTA（阶段回顾/返回/保存按钮）双主题重着色",
  css.indexOf('body[data-theme="aurora-spectrum"] .stage-review-back-btn,') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .stage-review-back-btn,') !== -1
  && css.indexOf('body[data-theme="aurora-spectrum"] .stage-review-open-btn {') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .stage-review-open-btn {') !== -1, true);

check("断言19 全局统计进度条/危险进度条 + KPTA 徽标双主题重着色",
  css.indexOf('body[data-theme="aurora-spectrum"] .global-stats-progress-fill,') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .global-stats-progress-fill,') !== -1
  && css.indexOf('body[data-theme="aurora-spectrum"] .metric-bar-fill.status-danger {') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .metric-bar-fill.status-danger {') !== -1
  && css.indexOf('body[data-theme="aurora-spectrum"] .kpta-try .kpta-badge {') !== -1
  && css.indexOf('body[data-theme="aurora-quiet"] .kpta-try .kpta-badge {') !== -1, true);

console.log(fail === 0 ? "回归通过 " + pass + "/" + (pass + fail) + " 项" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
