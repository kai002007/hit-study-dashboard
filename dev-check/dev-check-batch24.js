// ==================== dev-check-batch24.js ====================
// 施工批次24（构建批次39）回归：界面形态轴「指挥舱 deck」接入 + 双轴正交契约
// 运行：node dev-check-batch24.js
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
const configSrc = fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8");
const storageSrc = fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8");
const settingsSrc = fs.readFileSync(path.join(ROOT, "js/ui/settings.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(ROOT, "js/main.js"), "utf8");
const dashboardSrc = fs.readFileSync(path.join(ROOT, "js/ui/dashboard.js"), "utf8");
const chartsSrc = fs.readFileSync(path.join(ROOT, "js/ui/charts.js"), "utf8");
const globalStatsSrc = fs.readFileSync(path.join(ROOT, "js/ui/global-stats.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const swSrc = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
const ver = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log("✓ " + label + " = " + actual); }
  else { fail++; console.error("✗ " + label + " 期望 " + JSON.stringify(expected) + " 实测 " + JSON.stringify(actual)); }
}

// ---------- 1. 双轴注册：SKIN_ORDER 与独立存储键 ----------
check("断言1 SKIN_ORDER = [classic, deck] 且已导出",
  /const SKIN_ORDER = \["classic", "deck"\];/.test(configSrc)
  && /SKIN_ORDER,/.test(configSrc.split("export {")[1] || ""), true);

check("断言2 形态存储键与主题存储键相互独立",
  storageSrc.indexOf('const SKIN_STORAGE_KEY = "study_dashboard_skin";') !== -1
  && storageSrc.indexOf('const THEME_STORAGE_KEY = "study_dashboard_theme";') !== -1, true);

check("断言3 getSkin 默认 classic + 非法值回退 classic",
  /function getSkin\(\)[\s\S]*?return "classic";/.test(storageSrc)
  && storageSrc.indexOf("SKIN_ORDER.indexOf(raw) >= 0") !== -1, true);

check("断言4 setSkin 落盘 + SKIN_ORDER 导入",
  storageSrc.indexOf("localStorage.setItem(SKIN_STORAGE_KEY, skin);") !== -1
  && storageSrc.indexOf('import { THEME_ORDER, SKIN_ORDER, METRIC_CONFIGS, DEFAULT_CONFIGS } from "./config.js";') !== -1, true);

check("断言5 storage 导出 getSkin/setSkin（备份与运行时共用）",
  /getSkin,[\s\S]{0,80}setSkin,/.test(storageSrc.split("export {")[1] || ""), true);

// ---------- 2. 设置页：形态应用 + 弹窗双段 ----------
check("断言6 applySkin：classic 移除 data-skin，其余写 data-skin",
  settingsSrc.indexOf('if (skin === "classic") {\n    document.body.removeAttribute("data-skin");') !== -1
  && settingsSrc.indexOf("document.body.dataset.skin = skin;") !== -1, true);

check("断言7 形态清单与描述在册（经典工作台 / 指挥舱）",
  settingsSrc.indexOf('classic: "经典工作台"') !== -1
  && settingsSrc.indexOf('deck: "指挥舱"') !== -1, true);

check("断言8 形态预览卡由 SKIN_ORDER 之外的双卡数据渲染（data-skin-key）",
  settingsSrc.indexOf('data-skin-key="${it.key}"') !== -1
  && settingsSrc.indexOf("function renderSkinOptions()") !== -1
  && settingsSrc.indexOf("function handleSelectSkin(skinKey)") !== -1, true);

check("断言9 主题与形态共用弹窗：双主按钮 + 双面板显隐",
  settingsSrc.indexOf("function setAppearanceSegment(seg)") !== -1
  && settingsSrc.indexOf('themePanel.style.display = isTheme ? "" : "none";') !== -1
  && settingsSrc.indexOf('skinPanel.style.display = isTheme ? "none" : "";') !== -1, true);

check("断言10 设置卡改名「主题与形态」并显示双轴当前值",
  settingsSrc.indexOf('title.textContent = "主题与形态";') !== -1
  && settingsSrc.indexOf("当前：${THEME_NAMES[theme] || \"暗紫\"} · ${SKIN_NAMES[skin]") !== -1, true);

// ---------- 3. index.html / main.js ----------
check("断言11 index.html 弹窗双段结构（两个主按钮 + 两块面板 + 形态网格）",
  html.indexOf('id="appearance-segment-theme"') !== -1
  && html.indexOf('id="appearance-segment-skin"') !== -1
  && html.indexOf('id="appearance-panel-theme"') !== -1
  && html.indexOf('id="appearance-panel-skin"') !== -1
  && html.indexOf('id="skin-picker-grid"') !== -1
  && html.indexOf('class="modal-title">主题与形态<') !== -1, true);

check("断言12 启动时应用形态（main.js 导入并调用 applySkin）",
  mainSrc.indexOf("applySkin, applyTheme, renderThemeToggle") !== -1
  && mainSrc.indexOf("applySkin();") !== -1, true);

// ---------- 4. style.css 形态层：只许布局 + 中性叠层，禁止写死色值 ----------
const deckStart = css.indexOf("批次 24：界面形态轴");
// 形态层只截到「批次 24 补正7」之前：补正7 起是主题令牌层（允许十六进制主题色），不属于形态层
const deckEnd = css.indexOf("批次 24 补正7");
const deckCss = deckStart === -1 ? "" : css.slice(deckStart, deckEnd === -1 ? undefined : deckEnd);
check("断言13 形态层段落在册且规则量达标（>=60 条 deck 命中）",
  deckStart !== -1 && (deckCss.match(/body\[data-skin="deck"\]/g) || []).length >= 60, true);

check("断言14 形态层零十六进制色值（契约：颜色只走 token / 中性 rgba）",
  deckCss.length > 0 && !/#[0-9a-fA-F]{3,8}\b/.test(deckCss), true);

check("断言15 经典形态零规则命中（形态层无 classic 选择器）",
  deckCss.indexOf('data-skin="classic"') === -1, true);

check("断言16 进度看板：Hero 数字渐变 + 「核心指标」分隔线",
  deckCss.indexOf(".dashboard-summary-item strong {") !== -1
  && deckCss.indexOf("content: \"核心指标\";") !== -1
  && deckCss.indexOf('body[data-skin="deck"] .progress-dashboard {') !== -1, true);

check("断言17 今日作战：指挥条网格 + 配额单排两列（两形态同规则）",
  deckCss.indexOf('body[data-skin="deck"] .stage-header {') !== -1
  && /\.quota-cards\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/.test(css), true);

check("断言18 设置快捷操作 5 排单列 + 周报双栏 + 弹窗形态预览样式",
  deckCss.indexOf('body[data-skin="deck"] .settings-actions-grid.settings-actions-main {\n  display: grid;\n  grid-template-columns: 1fr;') !== -1
  && deckCss.indexOf('body[data-skin="deck"] .settings-actions-main .settings-action-card {') !== -1
  && deckCss.indexOf(".skin-picker-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }") !== -1
  && deckCss.indexOf(".appearance-segments {") !== -1, true);

// ---------- 5. 版本链与命名口径 ----------
check("断言19 版本三处同步 v2.8 / 批次39 / v31",
  ver.workbench === "v2.8" && ver.buildBatch.replace(/\s/g, "") === "批次39"
  && ver.cacheVersion === "v31"
  && swSrc.indexOf('const CACHE_NAME = "study-dashboard-v31";') !== -1, true);

check("断言20 施工批次命名对齐（batch23 在册、旧 batch38 已退役）",
  fs.existsSync(path.join(__dirname, "dev-check-batch23.js"))
  && !fs.existsSync(path.join(__dirname, "dev-check-batch38.js")), true);

// ---------- 6. 批次24 修正（用户 2026-10-17 追加指令） ----------
check("断言21 进度看板九卡：形态二改进度条卡、经典保留扇形图",
  dashboardSrc.indexOf('class="dashboard-card-bar"') !== -1
  && css.indexOf(".dashboard-card-bar { display: none; }") !== -1
  && deckCss.indexOf('body[data-skin="deck"] .dashboard-card-pie { display: none; }') !== -1
  && deckCss.indexOf('body[data-skin="deck"] .dashboard-card-bar {') !== -1, true);

check("断言22 形态二进度页顺序：概览头 → 核心指标(今日 Hero 在标签与九卡之间) → 热力 → 周趋势 → 月测",
  deckCss.indexOf('body[data-skin="deck"] .progress-dashboard > .dashboard-header { order: 1; }') !== -1
  && deckCss.indexOf('body[data-skin="deck"] .progress-dashboard > .dashboard-grid { order: 2; }') !== -1
  && deckCss.indexOf('body[data-skin="deck"] .dashboard-grid > .deck-today-hero { grid-column: 1 / -1; }') !== -1
  && deckCss.indexOf('body[data-skin="deck"] .progress-dashboard > .year-heatmap { order: 4; }') !== -1
  && deckCss.indexOf('body[data-skin="deck"] .progress-dashboard > .weekly-hours-trend { order: 5; }') !== -1
  && dashboardSrc.indexOf("grid.insertBefore(heroEl, grid.firstChild);") !== -1
  && dashboardSrc.indexOf("grid.parentElement.insertBefore(heroEl, grid);") !== -1, true);

// ---------- 7. 批次24 二次补正（用户 2026-10-17 15:44 追加指令） ----------
check("断言23 进度看板新增「今日有效时长」Hero（容器 + 渲染函数 + 经典隐藏）",
  html.indexOf('id="deck-today-hero"') !== -1
  && dashboardSrc.indexOf("function renderDeckTodayHero()") !== -1
  && dashboardSrc.indexOf("renderDeckTodayHero();") !== -1
  && css.indexOf(".deck-today-hero { display: none; }") !== -1, true);

check("断言24 指标卡收敛：更厚卡片 + 柔色进度条（长度恢复满宽）",
  deckCss.indexOf('body[data-skin="deck"] .dashboard-card {\n  padding: 16px;') !== -1
  && deckCss.indexOf("min-height: 152px;") !== -1
  && deckCss.indexOf(".dashboard-card-bar {\n  width: 100%;") !== -1
  && deckCss.indexOf("width: 62%;") === -1
  && deckCss.indexOf("filter: saturate(0.72);") !== -1, true);

check("断言25 今日汇总卡单列 + 周报单列堆叠 + KPTA 2×2 仅桌面端（手机回原样）",
  deckCss.indexOf(".metrics-grid .metric-card-summary { grid-column: 1 / -1; }") !== -1
  && deckCss.indexOf('@media (min-width: 900px) {\n  body[data-skin="deck"] .kpta-card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }') !== -1
  && deckCss.indexOf('body[data-skin="deck"] .weekly-form-grid { grid-template-columns: repeat(2') === -1, true);

// ---------- 8. 批次24 补正5/6（用户 2026-10-17 16:28 / 16:43 追加指令） ----------
check("断言26 今日作战：模块周配额 收起/展开（按钮 + 绑定调用 + 收起样式，两形态通用）",
  html.indexOf('id="module-list-toggle"') !== -1
  && html.indexOf('aria-controls="module-list-body"') !== -1
  && html.indexOf('<ul id="module-list-body">') !== -1
  && mainSrc.indexOf("bindModuleListToggle()") !== -1
  && css.indexOf(".module-list-header {\n  display: flex;") !== -1
  && css.indexOf(".module-list-toggle {\n  display: inline-flex;") !== -1
  && /\.module-list\.is-collapsed ul \{[^}]*display: none;/.test(css)
  && css.indexOf(".module-list.is-collapsed .module-list-header {") !== -1, true);

// ---------- 9. 批次24 补正7（用户 2026-10-17 20:53 第八轮 9 条：主题化收口） ----------
const orderMatch = (configSrc.match(/const THEME_ORDER = \[([^\]]*)\]/) || [])[1] || "";
check("断言27 主题卡顺序：极光光谱/极光静奢置顶，其余 6 套相对顺序不变",
  orderMatch.trim() === '"aurora-spectrum", "aurora-quiet", "dark-purple", "midnight-blue", "cyber-cyan-purple", "warm-cream", "matcha-green", "minimal-white"', true);

check("断言28 月测卡「撤回最近一次」：存储函数 + 导出 + 按钮/科目菜单/撤回逻辑",
  /function removeLastMonthlyScore\(subject\)/.test(storageSrc)
  && /removeLastMonthlyScore,/.test(storageSrc.split("export {")[1] || "")
  && chartsSrc.indexOf('id="monthly-undo-btn"') !== -1
  && chartsSrc.indexOf('data-subject="math"') !== -1
  && chartsSrc.indexOf('data-subject="english"') !== -1
  && chartsSrc.indexOf("removeLastMonthlyScore(subject)") !== -1, true);

check("断言29 主题化①：月度投入柱图渐变走主题令牌 + 子页面 CTA 走主题渐变（极简白保持原紫）",
  globalStatsSrc.indexOf('style="stop-color: var(--purple-300)"') !== -1
  && globalStatsSrc.indexOf("stop-color: var(--purple-600)") !== -1
  && css.indexOf(".stage-review-save-btn,\n.stage-review-back-btn,\n.global-stats-back-btn,\n.global-stats-save-btn {\n  background: var(--gradient-purple);") !== -1
  && css.indexOf('body[data-theme="minimal-white"] .stage-review-save-btn,') !== -1, true);

check("断言30 主题化②③：主题/形态卡窄屏 2 列适配 + 经典热力图图例四阶色卡尺寸",
  css.indexOf(".theme-picker-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }") !== -1
  && css.indexOf(".year-heatmap-legend .heatmap-l1,") !== -1
  && css.indexOf("width: 12px;\n  height: 12px;\n  border-radius: 2px;\n  flex: 0 0 auto;") !== -1, true);

check("断言31 主题化⑤⑥：周趋势两条悬浮标签跟随主题 + 日历四个按键跟随主题",
  css.indexOf(".weekly-hours-chart-label {\n  background: color-mix(in srgb, var(--purple-500) 20%, var(--bg-card));") !== -1
  && css.indexOf(".weekly-hours-chart-label-bottom {\n  background: color-mix(in srgb, var(--purple-300) 22%, var(--bg-card));") !== -1
  && css.indexOf(".global-stats-close-btn {\n  background: color-mix(in srgb, var(--purple-500) 14%, var(--bg-card));") !== -1, true);

check("断言32 主题化⑦：漏打卡提醒卡与「以总纲为宪法」子卡跟主题（保留警示左边条）",
  css.indexOf(".missed-banner {\n  background: linear-gradient(135deg,") !== -1
  && css.indexOf("border-left: 4px solid var(--status-warning);") !== -1
  && css.indexOf(".settings-docs-reminder {\n  background: linear-gradient(135deg,") !== -1, true);

check("断言33 主题化⑧：抹茶主题提高绿色占比与浓度（页面/卡片底纹更绿，不加深成深绿）",
  css.indexOf('body[data-theme="matcha-green"] {\n  --bg-page: #e2ead1;') !== -1
  && css.indexOf('body[data-theme="matcha-green"]::before { opacity: 0.09; }') !== -1
  && css.indexOf("body[data-theme=\"matcha-green\"] .today-line {") !== -1, true);

console.log(fail === 0 ? "回归通过 " + pass + "/" + (pass + fail) + " 项" : "回归失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
