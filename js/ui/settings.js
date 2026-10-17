// ==================== js/ui/settings.js ====================
// 批次20（ESM-b）自 script.js 整切：设置页域（主题六套/CSV 导出/自定义命令/热力图气泡绑定）。函数体逐字节不变。
import { DAILY_CAP, METRIC_CONFIGS, SKIN_ORDER, THEME_ORDER } from "../config.js";
import { WEEKLY_REVIEW_STORAGE_KEY, getCheckins, getCustomCommands, getDailyCards, getSkin, getTheme, loadCustomGoals, loadData, saveCustomCommands, setSkin, setTheme } from "../storage.js";
import { getDailyHours } from "../aggregation.js";
import { SoundKit, bindClick, notify } from "./base.js";
import { getExportTimestamp } from "./command.js";
import { renderCoeffSettings } from "./checkin.js";

// ---------- 批次21 R1：导入导出 / 更多功能 / 系数三页开关（复用 global-stats 页模板） ----------
function openIoPage() {
  const page = document.getElementById("io-page");
  if (!page) return;
  page.style.display = "block";
  if (typeof SoundKit !== "undefined" && SoundKit.pop) SoundKit.pop();
}
function closeIoPage() {
  const page = document.getElementById("io-page");
  if (!page) return;
  page.style.display = "none";
  if (typeof SoundKit !== "undefined" && SoundKit.tick) SoundKit.tick();
}
function openMoreFeaturesPage() {
  const page = document.getElementById("more-features-page");
  if (!page) return;
  page.style.display = "block";
  if (typeof SoundKit !== "undefined" && SoundKit.pop) SoundKit.pop();
}
function closeMoreFeaturesPage() {
  const page = document.getElementById("more-features-page");
  if (!page) return;
  page.style.display = "none";
  if (typeof SoundKit !== "undefined" && SoundKit.tick) SoundKit.tick();
}
function openCoeffPage() {
  const page = document.getElementById("coeff-page");
  if (!page) return;
  page.style.display = "block";
  renderCoeffSettings();
  if (typeof SoundKit !== "undefined" && SoundKit.pop) SoundKit.pop();
}
function closeCoeffPage() {
  const page = document.getElementById("coeff-page");
  if (!page) return;
  page.style.display = "none";
  if (typeof SoundKit !== "undefined" && SoundKit.tick) SoundKit.tick();
}

// ==================== 20. 主题切换 + 热力图气泡（批次 10） ====================

// 已迁移至 js/storage.js（批次8）
// 配置常量已迁移至 js/config.js（批次7）
const THEME_NAMES = {
  "dark-purple": "暗紫",
  "midnight-blue": "午夜蓝",
  "cyber-cyan-purple": "赛博青紫",
  "warm-cream": "米黄",
  "matcha-green": "抹茶",
  "minimal-white": "极简白",
  "aurora-spectrum": "极光光谱",
  "aurora-quiet": "极光静奢"
};

// 批次 24：界面形态轴（形态=布局，主题=配色，两轴正交）
const SKIN_NAMES = {
  classic: "经典工作台",
  deck: "指挥舱"
};

const SKIN_DESCS = {
  classic: "现行排布 · 信息密度优先",
  deck: "卡片指挥台 · 模块分区"
};

// 批次 38：移动端浏览器顶栏/状态栏色随主题走（与 style.css 中主题 --bg-page 对齐）
const THEME_META_COLORS = {
  "dark-purple": "#0f0a1a",
  "midnight-blue": "#0a1020",
  "cyber-cyan-purple": "#0d0d18",
  "warm-cream": "#f5ecd7",
  "matcha-green": "#eef2e6",
  "minimal-white": "#fafafa",
  "aurora-spectrum": "#05070e",
  "aurora-quiet": "#07080c"
};

// 已迁移至 js/storage.js（批次8）

function applyTheme() {
  const theme = getTheme();
  if (theme === "dark-purple") {
    document.body.removeAttribute("data-theme");
  } else {
    document.body.dataset.theme = theme;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_META_COLORS[theme] || "#0f0a1a");
}

function renderThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  const title = document.getElementById("theme-toggle-title");
  const desc = btn ? btn.querySelector(".settings-action-desc") : null;
  if (!btn || !title) return;
  const theme = getTheme();
  const skin = getSkin();
  title.textContent = "主题与形态";
  if (desc) desc.textContent = `当前：${THEME_NAMES[theme] || "暗紫"} · ${SKIN_NAMES[skin] || "经典工作台"}`;
}

// 批次 24：形态应用（classic 移除 data-skin，CSS 里经典形态零规则命中）
function applySkin() {
  const skin = getSkin();
  if (skin === "classic") {
    document.body.removeAttribute("data-skin");
  } else {
    document.body.dataset.skin = skin;
  }
}

function handleThemeToggle() {
  openThemeModal();
}

// ---------- 主题选择弹窗（批次 16） ----------

const THEME_PREVIEW_COLORS = {
  "dark-purple":       { bg: "#0f0a1a", card: "#1b1226", accent: "#a855f7", accent2: "#7c3aed", normal: "#34d399", warning: "#fbbf24", text: "#ece9f2", scheme: "深色" },
  "midnight-blue":     { bg: "#0a1020", card: "#131b30", accent: "#5b7cfa", accent2: "#4f46e5", normal: "#34d399", warning: "#fbbf24", text: "#e8ecf5", scheme: "深色" },
  "cyber-cyan-purple": { bg: "#0d0d18", card: "#16162a", accent: "#22d3ee", accent2: "#a855f7", normal: "#34d399", warning: "#fbbf24", text: "#e8e8f8", scheme: "深色" },
  "warm-cream":        { bg: "#f5ecd7", card: "#fdf9ef", accent: "#b45309", accent2: "#d97706", normal: "#15803d", warning: "#b45309", text: "#3a2e1f", scheme: "浅色" },
  "matcha-green":      { bg: "#eef2e6", card: "#f7faf0", accent: "#4a7c59", accent2: "#3a6347", normal: "#4a7c59", warning: "#b8763a", text: "#2d3a2a", scheme: "浅色" },
  "minimal-white":     { bg: "#fafafa", card: "#ffffff", accent: "#7c3aed", accent2: "#6d28d9", normal: "#16a34a", warning: "#d97706", text: "#111111", scheme: "浅色" },
  "aurora-spectrum":   { bg: "#05070e", card: "#0b1220", accent: "#22d3ee", accent2: "#a78bfa", normal: "#34d399", warning: "#fbbf24", text: "#e8f0ff", scheme: "深色" },
  "aurora-quiet":      { bg: "#07080c", card: "#0c1018", accent: "#9cc7db", accent2: "#c9a86a", normal: "#8fbfa0", warning: "#d9c39a", text: "#e9edf4", scheme: "深色" }
};

function renderThemeOptions() {
  const grid = document.getElementById("theme-picker-grid");
  if (!grid) return;

  const current = getTheme();

  grid.innerHTML = THEME_ORDER.map(key => {
    const c = THEME_PREVIEW_COLORS[key] || { bg: "#333", card: "#444", accent: "#888", accent2: "#666", normal: "#34d399", warning: "#fbbf24", text: "#fff", scheme: "深色" };
    const name = THEME_NAMES[key] || key;
    const isActive = key === current;
    return `
      <button type="button" class="theme-picker-item${isActive ? " is-active" : ""}" data-theme-key="${key}">
        <div class="theme-picker-preview" style="background: ${c.bg};">
          <div class="theme-picker-mini-card" style="background: ${c.card}; border-color: ${c.accent}40;">
            <div class="theme-picker-mini-row">
              <span class="theme-picker-mini-dot" style="background: ${c.accent};"></span>
              <span class="theme-picker-mini-bar" style="background: ${c.text}; opacity: 0.55;"></span>
            </div>
            <div class="theme-picker-mini-progress" style="background: ${c.accent}25;">
              <div class="theme-picker-mini-progress-fill" style="background: linear-gradient(90deg, ${c.accent}, ${c.accent2});"></div>
            </div>
            <div class="theme-picker-mini-status">
              <span class="theme-picker-mini-pill" style="background: ${c.normal};"></span>
              <span class="theme-picker-mini-pill" style="background: ${c.warning};"></span>
              <span class="theme-picker-mini-bar" style="background: ${c.text}; opacity: 0.35; flex: 1;"></span>
            </div>
          </div>
        </div>
        <div class="theme-picker-label">
          <span>${name}<span class="theme-picker-scheme-tag">${c.scheme}</span></span>
          <span class="theme-picker-check">✓</span>
        </div>
      </button>
    `;
  }).join("");

  grid.querySelectorAll(".theme-picker-item").forEach(btn => {
    btn.addEventListener("click", () => {
      handleSelectTheme(btn.dataset.themeKey);
    });
  });
}

function handleSelectTheme(themeKey) {
  if (!THEME_ORDER.includes(themeKey)) return;
  const current = getTheme();
  if (themeKey === current) return;

  setTheme(themeKey);
  applyTheme();
  renderThemeToggle();
  renderThemeOptions();
  notify(`已切换到「${THEME_NAMES[themeKey]}」主题`, "success");
}

function openThemeModal() {
  const modal = document.getElementById("theme-modal");
  if (!modal) return;
  renderThemeOptions();
  renderSkinOptions();
  setAppearanceSegment("theme");
  modal.style.display = "flex";
  if (typeof SoundKit !== "undefined") SoundKit.pop();
}

// ---------- 形态选择（批次 24，与主题共用同一个弹窗） ----------

function renderSkinOptions() {
  const grid = document.getElementById("skin-picker-grid");
  if (!grid) return;
  const current = getSkin();
  const items = [
    { key: "classic", name: SKIN_NAMES.classic, desc: SKIN_DESCS.classic },
    { key: "deck", name: SKIN_NAMES.deck, desc: SKIN_DESCS.deck }
  ];
  grid.innerHTML = items.map(it => {
    const on = it.key === current;
    return `
      <button type="button" class="skin-picker-item${on ? " is-active" : ""}" data-skin-key="${it.key}">
        <div class="skin-picker-preview skin-preview-${it.key}">
          <span class="skin-blk skin-blk-nav"></span>
          <span class="skin-blk skin-blk-hero"></span>
          <span class="skin-line"><i></i><i></i></span>
          <span class="skin-line"><i></i><i></i></span>
          <span class="skin-blk skin-blk-wide"></span>
        </div>
        <div class="skin-picker-label">
          <span>${it.name}<span class="theme-picker-scheme-tag">${on ? "现行" : "可切换"}</span></span>
          <span class="theme-picker-check">✓</span>
        </div>
        <div class="skin-picker-desc">${it.desc}</div>
      </button>
    `;
  }).join("");

  grid.querySelectorAll(".skin-picker-item").forEach(btn => {
    btn.addEventListener("click", () => {
      handleSelectSkin(btn.dataset.skinKey);
    });
  });
}

function handleSelectSkin(skinKey) {
  if (!SKIN_ORDER.includes(skinKey)) return;
  if (skinKey === getSkin()) return;
  setSkin(skinKey);
  applySkin();
  renderThemeToggle();
  renderSkinOptions();
  notify(`已切换到「${SKIN_NAMES[skinKey]}」形态`, "success");
}

function setAppearanceSegment(seg) {
  const themeBtn = document.getElementById("appearance-segment-theme");
  const skinBtn = document.getElementById("appearance-segment-skin");
  const themePanel = document.getElementById("appearance-panel-theme");
  const skinPanel = document.getElementById("appearance-panel-skin");
  if (!themeBtn || !skinBtn || !themePanel || !skinPanel) return;
  const isTheme = seg !== "skin";
  themeBtn.classList.toggle("is-active", isTheme);
  skinBtn.classList.toggle("is-active", !isTheme);
  themePanel.style.display = isTheme ? "" : "none";
  skinPanel.style.display = isTheme ? "none" : "";
  if (!isTheme) renderSkinOptions();
}

function bindAppearanceSegments() {
  if (document._appearanceSegBound) return;
  document._appearanceSegBound = true;
  bindClick("appearance-segment-theme", () => setAppearanceSegment("theme"));
  bindClick("appearance-segment-skin", () => setAppearanceSegment("skin"));
}

function closeThemeModal() {
  const modal = document.getElementById("theme-modal");
  if (!modal) return;
  modal.style.display = "none";
}

function bindThemeModalEvents() {
  if (document._themeModalBound) return;
  document._themeModalBound = true;

  bindClick("theme-modal-close-btn", closeThemeModal);
  bindAppearanceSegments();

  const modal = document.getElementById("theme-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeThemeModal();
    });
  }
}

function bindHeatmapTooltip() {
  if (document._heatmapTooltipBound) return;
  document._heatmapTooltipBound = true;

  const tooltip = document.getElementById("heatmap-tooltip");
  if (!tooltip) return;

  document.addEventListener("mouseover", (e) => {
    const cell = e.target && e.target.closest ? e.target.closest("rect.heatmap-cell") : null;
    if (!cell) return;
    const date = cell.getAttribute("data-date") || "";
    if (!date) return;
    const isFuture = cell.getAttribute("data-future") === "1";
    const hours = cell.getAttribute("data-hours") || "0";

    let content = "";
    if (isFuture) {
      content = `<strong>${date}</strong><br>未来日期`;
    } else {
      const num = Number(hours);
      if (num > 0) {
        content = `<strong>${date}</strong><br>${hours} h`;
      } else {
        content = `<strong>${date}</strong><br>无记录`;
      }
    }
    tooltip.innerHTML = content;
    tooltip.classList.add("show");
  });

  document.addEventListener("mouseout", (e) => {
    const cell = e.target && e.target.closest ? e.target.closest("rect.heatmap-cell") : null;
    if (!cell) return;
    tooltip.classList.remove("show");
  });

  document.addEventListener("mousemove", (e) => {
    if (!tooltip.classList.contains("show")) return;
    const offset = 14;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let x = e.clientX + offset;
    let y = e.clientY + offset;
    if (x + tw > window.innerWidth - 8) x = e.clientX - tw - offset;
    if (y + th > window.innerHeight - 8) y = e.clientY - th - offset;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  });
}

// ==================== 21. CSV 导出（批次 12） ====================

function downloadCSVFile(filename, content) {
  // 加 UTF-8 BOM，Excel 打开中文不乱码
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSVCell(value) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // 包含逗号 / 引号 / 换行 / 回车时用双引号包裹，内部引号变双引号
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCSV(rows) {
  return rows.map(row => row.map(escapeCSVCell).join(",")).join("\r\n") + "\r\n";
}

function exportDailyCardsCSV() {
  const all = getDailyCards();
  const dates = Object.keys(all).sort();
  if (dates.length === 0) {
    notify("暂无日卡数据可导出");
    return;
  }

  const ts = getExportTimestamp();
  const rows = [
    ["日期", "上限h", "实际h", "比值", "状态分", "卡点"]
  ];

  dates.forEach(dateStr => {
    const c = all[dateStr];
    // 批次22 R3：计划h 口径废弃，改导出当日上限（DAILY_CAP 按星期几索引，周一=0）
    const cap = DAILY_CAP[(new Date(dateStr + "T00:00:00").getDay() + 6) % 7];
    const actual = getDailyHours(dateStr).hours;
    const ratio = cap > 0 ? (actual / cap).toFixed(2) : "";
    rows.push([
      dateStr,
      cap,
      actual,
      ratio,
      c.statusScore || "",
      c.blocker || ""
    ]);
  });

  const content = rowsToCSV(rows);
  downloadCSVFile(`学习工作台_日卡_${ts.fileSuffix}.csv`, content);
  notify(`已导出 ${dates.length} 天日卡 CSV`);
}

function exportWeeklyReviewsCSV() {
  const all = loadData(WEEKLY_REVIEW_STORAGE_KEY, {});
  const weeks = Object.keys(all).sort();
  if (weeks.length === 0) {
    notify("暂无周报数据可导出");
    return;
  }

  const ts = getExportTimestamp();
  const rows = [
    ["周次", "保持", "问题", "尝试", "下周预案"]
  ];

  weeks.forEach(wk => {
    const data = all[wk] || {};
    rows.push([
      wk,
      data.keep || "",
      data.problem || "",
      data.try || "",
      data.plan || ""
    ]);
  });

  const content = rowsToCSV(rows);
  downloadCSVFile(`学习工作台_周报_${ts.fileSuffix}.csv`, content);
  notify(`已导出 ${weeks.length} 周周报 CSV`);
}

function exportCheckinsCSV() {
  const checkins = getCheckins();
  const allGoals = loadCustomGoals();
  const rows = [
    ["指标名称", "日期", "数值", "单位", "是否补记"]
  ];

  let hasAny = false;

  const fixedKeys = ["vocabulary", "listening", "sleep", "cmc", "mock-exams", "advanced-math", "final-courses"];
  fixedKeys.forEach(key => {
    const cfg = METRIC_CONFIGS[key];
    if (!cfg) return;
    const list = (checkins[key] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    list.forEach(r => {
      hasAny = true;
      rows.push([
        cfg.name,
        r.date,
        r.value,
        cfg.unit || "",
        r.isMakeup ? "是" : "否"
      ]);
    });
  });

  allGoals.forEach(g => {
    const list = (checkins[g.id] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    list.forEach(r => {
      hasAny = true;
      rows.push([
        g.name,
        r.date,
        r.value,
        g.unit || "",
        r.isMakeup ? "是" : "否"
      ]);
    });
  });

  if (!hasAny) {
    notify("暂无打卡数据可导出");
    return;
  }

  const ts = getExportTimestamp();
  const content = rowsToCSV(rows);
  downloadCSVFile(`学习工作台_打卡明细_${ts.fileSuffix}.csv`, content);
  notify(`已导出打卡明细 CSV（共 ${rows.length - 1} 条）`);
}

// ==================== 22. 自定义命令（批次 13） ====================

// 已迁移至 js/storage.js（批次8）

function generateCmdId() {
  return "cmd_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
}

function addCustomCommand(cmd) {
  const list = getCustomCommands();
  list.push(cmd);
  saveCustomCommands(list);
}

function deleteCustomCommand(id) {
  const list = getCustomCommands().filter(c => c.id !== id);
  saveCustomCommands(list);
}

function renderCustomCommandsList() {
  const listEl = document.getElementById("custom-cmd-list");
  if (!listEl) return;
  const list = getCustomCommands();
  if (list.length === 0) {
    listEl.innerHTML = '<div class="delete-goal-empty">暂无自定义命令</div>';
    return;
  }
  listEl.innerHTML = list.map(c => `
    <div class="delete-goal-item" data-cmd-id="${c.id}">
      <div class="delete-goal-info">
        <span class="delete-goal-name">${c.label}</span>
        <span class="delete-goal-meta">${c.type} · ${c.payload}</span>
      </div>
      <button type="button" class="delete-goal-btn" data-cmd-id="${c.id}">删除</button>
    </div>
  `).join("");
  listEl.querySelectorAll(".delete-goal-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      deleteCustomCommand(btn.dataset.cmdId);
      renderCustomCommandsList();
      notify("已删除命令", "info");
    });
  });
}

function openManageCmdModal() {
  const modal = document.getElementById("manage-cmd-modal");
  if (!modal) return;
  renderCustomCommandsList();
  modal.style.display = "flex";
  SoundKit.pop();
}

function closeManageCmdModal() {
  const modal = document.getElementById("manage-cmd-modal");
  if (modal) modal.style.display = "none";
}

function handleAddCmdSubmit() {
  const labelEl = document.getElementById("cmd-label");
  const keywordsEl = document.getElementById("cmd-keywords");
  const typeEl = document.getElementById("cmd-type");
  const payloadEl = document.getElementById("cmd-payload");
  if (!labelEl || !typeEl || !payloadEl) return;

  const label = labelEl.value.trim();
  const keywords = keywordsEl ? keywordsEl.value.trim() : "";
  const type = typeEl.value;
  const payload = payloadEl.value.trim();

  if (!label) { notify("请填写命令名称", "warning"); return; }
  if (!payload) { notify("请填写目标", "warning"); return; }
  if (type === "url" && !/^https?:\/\//i.test(payload)) {
    notify("链接需以 http:// 或 https:// 开头", "warning");
    return;
  }

  addCustomCommand({ id: generateCmdId(), label, keywords, type, payload });
  labelEl.value = "";
  if (keywordsEl) keywordsEl.value = "";
  payloadEl.value = "";
  renderCustomCommandsList();
  notify("已添加命令", "success");
}


// ==================== ESM 导出（批次20） ====================
export {
  applySkin, applyTheme, bindHeatmapTooltip, bindThemeModalEvents, closeCoeffPage, closeIoPage, closeManageCmdModal, closeMoreFeaturesPage, exportCheckinsCSV,
    exportDailyCardsCSV, exportWeeklyReviewsCSV, handleAddCmdSubmit, handleThemeToggle, openCoeffPage, openIoPage, openManageCmdModal, openMoreFeaturesPage,
    renderThemeToggle
};
