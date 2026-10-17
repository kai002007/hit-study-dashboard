// ==================== js/storage.js ====================
// 数据层（批次8 从 script.js 抽取）：键注册表/读写/schema迁移/备份导入导出
// 本文件禁止访问 DOM（notify 等 UI 函数仅作运行时调用，批次20 起经 ESM import 引入）
// 依赖：js/config.js（批次19 起 ESM import）
import { THEME_ORDER, SKIN_ORDER, METRIC_CONFIGS, DEFAULT_CONFIGS } from "./config.js";
import { notify } from "./ui/base.js";
import { getDailyAutoHours } from "./aggregation.js";
import { formatDateISO } from "./ui/base.js";
import { getStageIdByDate } from "./ui/stage.js";

// ==================== 存储键总表（核心 8 键 + 8 偏好键） ====================

const STORAGE_KEYS = {
  checkins: "study_dashboard_checkins",
  settings: "study_dashboard_settings",
  customGoals: "study_dashboard_custom_goals",
  schemaVersion: "study_dashboard_schema_version",
  lastBackupAt: "study_dashboard_last_backup_at",
  lastBackupRemindAt: "study_dashboard_last_backup_remind_at",
  dailyCards: "study_dashboard_daily_cards",
  monthlyScores: "study_dashboard_monthly_scores",
  dayDiary: "study_dashboard_day_diary"
};

// ==================== 通用读写（loadData / saveData） ====================

function loadData(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    console.warn("[Storage] 读取失败", key, e);
    return defaultValue;
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("[Storage] 保存失败", key, e);
  }
}

// ==================== Schema 版本（批次8 抽离自 script.js） ====================

// 当前数据 schema 版本号（每次数据结构变更时递增）
const CURRENT_SCHEMA_VERSION = 6;

function getSchemaVersion() {
  const raw = localStorage.getItem(STORAGE_KEYS.schemaVersion);
  if (raw === null) return null;
  const num = parseInt(raw, 10);
  return isNaN(num) ? null : num;
}

function setSchemaVersion(v) {
  try {
    localStorage.setItem(STORAGE_KEYS.schemaVersion, String(v));
  } catch (e) {
    console.warn("[Schema] 版本号写入失败", e);
  }
}

function migrateData() {
  const currentVersion = getSchemaVersion();

  if (currentVersion === null) {
    setSchemaVersion(CURRENT_SCHEMA_VERSION);
    console.log("[Schema] 首次运行，版本号设为", CURRENT_SCHEMA_VERSION);
    return;
  }

  if (currentVersion === CURRENT_SCHEMA_VERSION) {
    console.log("[Schema] 版本号已是", CURRENT_SCHEMA_VERSION, "无需迁移");
    return;
  }

  if (currentVersion < CURRENT_SCHEMA_VERSION) {
    console.log("[Schema] 检测到旧版本", currentVersion, "，待迁移到", CURRENT_SCHEMA_VERSION);
    if (currentVersion < 5) migrateCheckinRates(); // 批次13（R-1）：schema 4→5 存量打卡补写 rate 系数快照
    if (currentVersion < 6) migrateActualToAdjustment(); // 批次14a（R-1b）：schema 5→6 日卡 actualHours 转 adjustment
    setSchemaVersion(CURRENT_SCHEMA_VERSION);
  }

  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    console.warn("[Schema] 版本号", currentVersion, "高于当前代码版本", CURRENT_SCHEMA_VERSION);
  }
}

// ==================== 备份时间戳 IO ====================

function getLastBackupAt() {
  const raw = localStorage.getItem(STORAGE_KEYS.lastBackupAt);
  if (!raw) return null;
  const num = parseInt(raw, 10);
  return isNaN(num) ? null : num;
}

function setLastBackupAt(timestamp) {
  try {
    localStorage.setItem(STORAGE_KEYS.lastBackupAt, String(timestamp));
  } catch (e) {
    console.warn("[Backup] 时间戳写入失败", e);
  }
}

function getLastBackupRemindAt() {
  const raw = localStorage.getItem(STORAGE_KEYS.lastBackupRemindAt);
  if (!raw) return null;
  const num = parseInt(raw, 10);
  return isNaN(num) ? null : num;
}

function setLastBackupRemindAt(ts) {
  try {
    localStorage.setItem(STORAGE_KEYS.lastBackupRemindAt, String(ts));
  } catch (e) {
    console.warn("[Backup] 提醒时间戳写入失败", e);
  }
}

// ==================== 偏好键：UI 音效系统（S9-1） ====================

const SOUND_STORAGE_KEY = "study_dashboard_sound_enabled";

function isSoundEnabled() {
  const raw = localStorage.getItem(SOUND_STORAGE_KEY);
  if (raw === null) return true;  // 默认开启
  return raw === "true";
}

function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "true" : "false");
  } catch (e) {
    console.warn("[Sound] 保存失败", e);
  }
}

// ==================== 偏好键：趋势图显隐开关（S10-5） ====================

const TREND_HIDDEN_KEY = "study_dashboard_trend_hidden";

function isTrendHidden() {
  try {
    return localStorage.getItem(TREND_HIDDEN_KEY) === "true";
  } catch (e) {
    return false;
  }
}

function setTrendHidden(hidden) {
  try {
    localStorage.setItem(TREND_HIDDEN_KEY, hidden ? "true" : "false");
  } catch (e) {
    console.warn("[Trend] 保存开关失败", e);
  }
}

// ==================== 偏好键：阶段切换抽屉只读开关（批次 2） ====================

const HISTORY_READONLY_KEY = "study_dashboard_history_readonly";

function isHistoryReadonly() {
  try {
    const raw = localStorage.getItem(HISTORY_READONLY_KEY);
    if (raw === null) return true;  // 默认只读
    return raw === "true";
  } catch (e) {
    return true;
  }
}

function setHistoryReadonly(v) {
  try {
    localStorage.setItem(HISTORY_READONLY_KEY, v ? "true" : "false");
  } catch (e) {
    console.warn("[Stage] 只读开关保存失败", e);
  }
}

// ==================== 偏好键：周报复盘笔记 ====================

const WEEKLY_REVIEW_STORAGE_KEY = "study_dashboard_weekly_reviews";

function loadWeeklyReview(weekKey) {
  const all = loadData(WEEKLY_REVIEW_STORAGE_KEY, {});
  return all[weekKey] || { keep: "", problem: "", try: "", plan: "", draftKeep: "", draftProblem: "" };
}

function saveWeeklyReview(weekKey, data) {
  const all = loadData(WEEKLY_REVIEW_STORAGE_KEY, {});
  all[weekKey] = {
    keep: data.keep || "",
    problem: data.problem || "",
    try: data.try || "",
    plan: data.plan || "",
    draftKeep: data.draftKeep || "",
    draftProblem: data.draftProblem || "",
    updatedAt: Date.now()
  };
  saveData(WEEKLY_REVIEW_STORAGE_KEY, all);
}

// ==================== 偏好键：阶段回顾笔记 ====================

const STAGE_REVIEW_STORAGE_KEY = "study_dashboard_stage_review_notes";

function getStageReviewNotes() {
  try {
    const raw = localStorage.getItem(STAGE_REVIEW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveStageReviewNotes(stageId, data) {
  const all = getStageReviewNotes();
  all[stageId] = {
    baselineScore: String(data.baselineScore || ""),
    aiChecklist: String(data.aiChecklist || ""),
    experience: String(data.experience || ""),
    updatedAt: Date.now()
  };
  try {
    localStorage.setItem(STAGE_REVIEW_STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn("[StageReview] 笔记保存失败", e);
  }
}

// ==================== 偏好键：全局累计学时目标（批次 5） ====================

const GLOBAL_STATS_GOAL_KEY = "study_dashboard_global_hours_goal";
const GLOBAL_STATS_DEFAULT_GOAL = 4000;

function getGlobalHoursGoal() {
  try {
    const raw = localStorage.getItem(GLOBAL_STATS_GOAL_KEY);
    if (!raw) return GLOBAL_STATS_DEFAULT_GOAL;
    const num = parseInt(raw, 10);
    return isNaN(num) || num < 100 ? GLOBAL_STATS_DEFAULT_GOAL : num;
  } catch (e) {
    return GLOBAL_STATS_DEFAULT_GOAL;
  }
}

function setGlobalHoursGoal(hours) {
  try {
    const num = Number(hours);
    if (isNaN(num) || num < 100) return false;
    localStorage.setItem(GLOBAL_STATS_GOAL_KEY, String(num));
    return true;
  } catch (e) {
    console.warn("[GlobalStats] 目标学时保存失败", e);
    return false;
  }
}

// ==================== 偏好键：主题切换（批次 10） ====================

const THEME_STORAGE_KEY = "study_dashboard_theme";

function getTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw && THEME_ORDER.indexOf(raw) >= 0) return raw;
  } catch (e) { /* ignore */ }
  return "dark-purple";
}

function setTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.warn("[Theme] 保存失败", e);
  }
}

// ==================== 偏好键：界面形态切换（批次 24） ====================
// 与主题轴独立存储、独立回退：非法值一律回落到经典形态，保证存量用户零感知。
const SKIN_STORAGE_KEY = "study_dashboard_skin";

function getSkin() {
  try {
    const raw = localStorage.getItem(SKIN_STORAGE_KEY);
    if (raw && SKIN_ORDER.indexOf(raw) >= 0) return raw;
  } catch (e) { /* ignore */ }
  return "classic";
}

function setSkin(skin) {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch (e) {
    console.warn("[Skin] 保存失败", e);
  }
}

// ==================== 偏好键：自定义命令（批次 13） ====================

const CUSTOM_CMD_STORAGE_KEY = "study_dashboard_custom_commands";

function getCustomCommands() {
  try {
    const raw = localStorage.getItem(CUSTOM_CMD_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveCustomCommands(list) {
  try {
    localStorage.setItem(CUSTOM_CMD_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("[CustomCmd] 保存失败", e);
  }
}

// ==================== 打卡数据访问层（11 函数） ====================

function getCheckins() {
  return loadData(STORAGE_KEYS.checkins, {});
}

function setCheckins(data) {
  saveData(STORAGE_KEYS.checkins, data);
}

function getCheckinsByStage(stageId) {
  const all = getCheckins();
  const result = {};
  for (const key in all) {
    const filtered = all[key].filter(c => c.stageId === stageId);
    if (filtered.length > 0) result[key] = filtered;
  }
  return result;
}

// 批次13（R-1）：指标写入时折算系数。固定卡=contributesToCapacity 且 hoursPerUnit 为数值；
// 自定义目标=hoursPerUnit 为数值；其余（睡眠/周产能/周检等）返回 null 不写 rate
function getRateForMetric(metricKey) {
  if (metricKey.startsWith("goal_")) {
    const goal = loadCustomGoals().find(g => g.id === metricKey);
    return goal && typeof goal.hoursPerUnit === "number" ? goal.hoursPerUnit : null;
  }
  const cfg = METRIC_CONFIGS[metricKey];
  if (!cfg || !cfg.contributesToCapacity || typeof cfg.hoursPerUnit !== "number") return null;
  return cfg.hoursPerUnit;
}

// 批次13（R-1）：schema 4→5 迁移，存量打卡补写 rate 快照（幂等：已有 rate 的记录跳过）
function migrateCheckinRates() {
  const checkins = getCheckins();
  let changed = false;
  for (const key in checkins) {
    const rate = getRateForMetric(key);
    if (rate === null) continue;
    checkins[key].forEach(c => {
      if (typeof c.rate !== "number") { c.rate = rate; changed = true; }
    });
  }
  if (changed) setCheckins(checkins);
}

// 批次14a（R-1b）：schema 5→6 迁移，日卡 actualHours（手填覆盖）转 adjustment（当日调整额）
// adjustment = actualHours − 迁移当时 getDailyAutoHours()（0.01 精度封存），actualHours 字段删除；幂等（无 actualHours 字段即跳过）
function migrateActualToAdjustment() {
  const cards = getDailyCards();
  let changed = false;
  for (const dateStr in cards) {
    const c = cards[dateStr];
    if (!("actualHours" in c)) continue;
    const actual = Number(c.actualHours) || 0;
    if (actual > 0) {
      c.adjustment = Math.round((actual - getDailyAutoHours(dateStr)) * 100) / 100;
    }
    delete c.actualHours;
    changed = true;
  }
  if (changed) setDailyCards(cards);
}

function addCheckin(metricKey, value, dateStr, isMakeup) {
  const checkins = getCheckins();
  if (!checkins[metricKey]) checkins[metricKey] = [];

  const existingIndex = checkins[metricKey].findIndex(
    c => c.date === dateStr && !c.isMakeup === !isMakeup
  );
  const record = { date: dateStr, value, isMakeup: !!isMakeup, stageId: getStageIdByDate(dateStr), createdAt: Date.now() };
  // 批次13（R-1）：写入时快照折算系数，历史永不随系数调整回溯（#65）
  const rate = getRateForMetric(metricKey);
  if (rate !== null) record.rate = rate;

  if (existingIndex >= 0) {
    checkins[metricKey][existingIndex] = record;
  } else {
    checkins[metricKey].push(record);
  }

  setCheckins(checkins);
}

function getCheckinRecord(metricKey, dateStr) {
  const checkins = getCheckins();
  const list = checkins[metricKey] || [];
  const matched = list.filter(c => c.date === dateStr);
  if (matched.length === 0) return null;
  if (matched.length === 1) return matched[0];
  // 同日多条：优先返回补记（isMakeup=true），保证补记覆盖当日普通打卡的展示
  const makeup = matched.find(c => c.isMakeup);
  return makeup || matched[0];
}

function getCheckinValue(metricKey, dateStr) {
  const record = getCheckinRecord(metricKey, dateStr);
  if (!record) return metricKey === "sleep" ? "" : 0;
  return record.value;
}

function hasCheckin(metricKey, dateStr) {
  const value = getCheckinValue(metricKey, dateStr);
  if (metricKey === "sleep") return value !== "" && value !== null && value !== undefined;
  return Number(value) > 0;
}

function isProgressType(metricKey) {
  if (metricKey.startsWith("goal_")) return true;
  const config = METRIC_CONFIGS[metricKey];
  return config && config.type === "progress";
}

function getTotalCompleted(metricKey) {
  const checkins = getCheckins();
  const list = checkins[metricKey] || [];

  if (isProgressType(metricKey)) {
    // 进度型：所有记录的 value 求和（value 即每日增量）
    return list.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
  }

  return list.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
}

function getProgressIncrement(metricKey, dateStr) {
  // 增量存储后，该日期的 value 本身就是当日增量
  const value = getCheckinValue(metricKey, dateStr);
  return Number(value) || 0;
}

function getValueBeforeDate(metricKey, dateStr) {
  const checkins = getCheckins();
  const list = checkins[metricKey] || [];
  const before = list.filter(c => c.date < dateStr);
  // 进度型：累加该日期之前所有记录的增量
  return before.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
}

// ==================== 日卡读写（5 函数） ====================

function getDailyCards() {
  return loadData(STORAGE_KEYS.dailyCards, {});
}

function setDailyCards(data) {
  saveData(STORAGE_KEYS.dailyCards, data);
}

function getDailyCardsByStage(stageId) {
  const all = getDailyCards();
  const result = {};
  for (const dateStr in all) {
    if (all[dateStr].stageId === stageId) {
      result[dateStr] = all[dateStr];
    }
  }
  return result;
}

function getDailyCard(dateStr) {
  const all = getDailyCards();
  return all[dateStr] || null;
}

function saveDailyCard(dateStr, data) {
  const all = getDailyCards();
  all[dateStr] = {
    planHours: Number(data.planHours) || 0,
    adjustment: Number(data.adjustment) || 0,
    statusScore: Number(data.statusScore) || 0,
    blocker: String(data.blocker || ""),
    stageId: getStageIdByDate(dateStr),
    updatedAt: Date.now()
  };
  setDailyCards(all);
}

// ==================== 日记读写（批次18 R-5b，3 函数） ====================

function getDayDiaries() {
  return loadData(STORAGE_KEYS.dayDiary, {});
}

function getDayDiary(dateStr) {
  const all = getDayDiaries();
  const entry = all[dateStr];
  return entry && typeof entry.text === "string" ? entry.text : "";
}

function saveDayDiary(dateStr, text) {
  const all = getDayDiaries();
  const trimmed = String(text == null ? "" : text).trim();
  if (trimmed === "") {
    delete all[dateStr];
  } else {
    all[dateStr] = { text: String(text), updatedAt: Date.now() };
  }
  saveData(STORAGE_KEYS.dayDiary, all);
}

// ==================== 月测分读写（3 函数） ====================

function getMonthlyScores() {
  return loadData(STORAGE_KEYS.monthlyScores, { math: [], english: [] });
}

function setMonthlyScores(data) {
  saveData(STORAGE_KEYS.monthlyScores, data);
}

function addMonthlyScore(subject, dateStr, score, note) {
  const all = getMonthlyScores();
  if (!all[subject]) all[subject] = [];
  all[subject].push({
    date: dateStr,
    score: Number(score),
    note: note || "",
    createdAt: Date.now()
  });
  all[subject].sort((a, b) => a.date.localeCompare(b.date));
  setMonthlyScores(all);
}

// ==================== 自定义学习目标（2 函数） ====================

function loadCustomGoals() {
  return loadData(STORAGE_KEYS.customGoals, []);
}

function saveCustomGoals(goals) {
  saveData(STORAGE_KEYS.customGoals, goals);
}

// ==================== 设置读写（2 函数） ====================

function saveSettings() {
  const settings = {};
  for (const key in METRIC_CONFIGS) {
    const cfg = METRIC_CONFIGS[key];
    const def = DEFAULT_CONFIGS[key];
    if (!def) continue;
    if (cfg.totalGoal !== undefined && def.totalGoal !== undefined && cfg.totalGoal !== def.totalGoal) {
      if (!settings[key]) settings[key] = {};
      settings[key].totalGoal = cfg.totalGoal;
    }
    if (typeof cfg.dailyTarget === "number" && typeof def.dailyTarget === "number" && cfg.dailyTarget !== def.dailyTarget) {
      if (!settings[key]) settings[key] = {};
      settings[key].dailyTarget = cfg.dailyTarget;
    }
    if (typeof cfg.hoursPerUnit === "number" && typeof def.hoursPerUnit === "number" && cfg.hoursPerUnit !== def.hoursPerUnit) {
      if (!settings[key]) settings[key] = {};
      settings[key].hoursPerUnit = cfg.hoursPerUnit;
    }
  }
  saveData(STORAGE_KEYS.settings, settings);
}

function loadSettings() {
  // 先把运行时配置重置为默认值，避免多次调用时脏读
  for (const k in METRIC_CONFIGS) delete METRIC_CONFIGS[k];
  Object.assign(METRIC_CONFIGS, JSON.parse(JSON.stringify(DEFAULT_CONFIGS)));
  const settings = loadData(STORAGE_KEYS.settings, {});
  for (const key in METRIC_CONFIGS) {
    const cfg = METRIC_CONFIGS[key];
    // 兼容旧版扁平格式（keyGoal、keyDaily）
    if (settings[`${key}Goal`] !== undefined && cfg.totalGoal !== undefined) {
      cfg.totalGoal = settings[`${key}Goal`];
    }
    if (settings[`${key}Daily`] !== undefined && typeof cfg.dailyTarget === "number") {
      cfg.dailyTarget = settings[`${key}Daily`];
    }
    // 新版嵌套格式：settings[key] = { totalGoal, dailyTarget }
    if (settings[key] && typeof settings[key] === "object") {
      if (settings[key].totalGoal !== undefined && cfg.totalGoal !== undefined) {
        cfg.totalGoal = settings[key].totalGoal;
      }
      if (settings[key].dailyTarget !== undefined && typeof cfg.dailyTarget === "number") {
        cfg.dailyTarget = settings[key].dailyTarget;
      }
      if (settings[key].hoursPerUnit !== undefined && typeof cfg.hoursPerUnit === "number") {
        cfg.hoursPerUnit = settings[key].hoursPerUnit;
      }
    }
  }
}

// ==================== 清空数据（仅 4 键，保留设置） ====================

function clearAllData() {
  const msg = "⚠️ 确定要清空所有数据吗？\n\n" +
    "将删除：所有打卡记录、所有自定义目标\n" +
    "保留：设置项（目标总量、每日目标等）\n\n" +
    "此操作不可恢复！";
  if (!confirm(msg)) return;
  if (!confirm("再次确认：你真的要清空所有数据吗？")) return;

  try {
    localStorage.removeItem(STORAGE_KEYS.checkins);
    localStorage.removeItem(STORAGE_KEYS.customGoals);
    localStorage.removeItem(STORAGE_KEYS.dailyCards);
    localStorage.removeItem(STORAGE_KEYS.monthlyScores);
    console.log("[Settings] 已清空 checkins 和 customGoals");
    notify("数据已清空，页面即将刷新");
    window.location.reload();
  } catch (e) {
    console.error("[Settings] 清空数据失败", e);
    notify("清空数据失败，请重试");
  }
}

// ==================== 备份导出（注册表驱动） ====================

function exportBackup() {
  const data = {};
  STORAGE_REGISTRY.forEach(entry => {
    if (!entry.backup) return;
    const raw = localStorage.getItem(entry.key);
    if (raw === null) return;  // 不存在的键不导出
    if (entry.type === "string") {
      data[entry.id] = raw;  // string 型键：裸值写入
    } else {
      try {
        data[entry.id] = JSON.parse(raw);
      } catch (e) {
        data[entry.id] = raw;  // 解析失败兜底为裸字符串
      }
    }
  });
  const backup = {
    version: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: data
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dateStr = formatDateISO(new Date()).replace(/-/g, "");
  const filename = `学习工作台备份_${dateStr}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  setLastBackupAt(Date.now());
  console.log("[Backup] 已导出：", filename);
}

// ==================== 备份导入（注册表驱动 + 版本校验 + 类型校验 + 快照回滚） ====================

function importBackup(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    let backup;
    try {
      backup = JSON.parse(e.target.result);
    } catch (err) {
      notify("导入失败：文件不是有效的 JSON");
      return;
    }
    if (!backup.data) {
      notify("备份文件格式不正确，缺少 data 字段");
      return;
    }

    // 1. 版本校验
    const verNum = Number(backup.version);
    if (!Number.isFinite(verNum) || verNum < 1 || verNum > CURRENT_SCHEMA_VERSION) {
      notify("备份版本不受支持：version=" + backup.version + "，当前代码要求 ≤ v" + CURRENT_SCHEMA_VERSION);
      return;
    }

    // 2. 逐键类型校验（任一不符 → 未写入任何数据，直接返回）
    for (const entry of STORAGE_REGISTRY) {
      if (!entry.backup) continue;
      if (backup.data[entry.id] === undefined) continue;
      const v = backup.data[entry.id];
      if (entry.type === "array") {
        if (!Array.isArray(v)) {
          notify("备份数据格式错误：键 " + entry.id + " 应为数组");
          return;
        }
      } else if (entry.type === "object") {
        if (!v || typeof v !== "object" || Array.isArray(v)) {
          notify("备份数据格式错误：键 " + entry.id + " 应为对象");
          return;
        }
      } else if (entry.type === "string") {
        if (typeof v !== "string") {
          notify("备份数据格式错误：键 " + entry.id + " 应为字符串");
          return;
        }
      }
    }

    // 3. 写入前内存快照（裸值，原为 null 则稍后 removeItem）
    const snapshot = {};
    STORAGE_REGISTRY.forEach(entry => {
      if (!entry.backup) return;
      snapshot[entry.key] = localStorage.getItem(entry.key);
    });

    // 4. 写入（string 裸 setItem；object/array 走 saveData；仅写 backup.data 中存在的键）
    try {
      STORAGE_REGISTRY.forEach(entry => {
        if (!entry.backup) return;
        if (backup.data[entry.id] === undefined) return;
        if (entry.type === "string") {
          localStorage.setItem(entry.key, backup.data[entry.id]);
        } else {
          saveData(entry.key, backup.data[entry.id]);
        }
      });

      // 5. stageId 补齐迁移（原有 IIFE 原样保留）
      (function migrateCheckinStageIds() {
        const checkins = getCheckins();
        let modified = false;
        for (const key in checkins) {
          checkins[key].forEach(c => {
            if (!c.stageId) {
              c.stageId = getStageIdByDate(c.date);
              modified = true;
            }
          });
        }
        if (modified) {
          setCheckins(checkins);
          console.log("[Migration] 已为旧打卡记录补 stageId");
        }
      })();

      (function migrateDailyCardStageIds() {
        const cards = getDailyCards();
        let modified = false;
        for (const dateStr in cards) {
          if (!cards[dateStr].stageId) {
            cards[dateStr].stageId = getStageIdByDate(dateStr);
            modified = true;
          }
        }
        if (modified) {
          setDailyCards(cards);
          console.log("[Migration] 已为旧日卡补 stageId");
        }
      })();

      console.log("[Backup] 已导入，即将刷新页面");
      window.location.reload();
    } catch (err) {
      // 6. 任一写入异常 → 按快照整体回滚
      console.error("[Backup] 导入失败，回滚中", err);
      STORAGE_REGISTRY.forEach(entry => {
        if (!entry.backup) return;
        const v = snapshot[entry.key];
        if (v === null) {
          localStorage.removeItem(entry.key);
        } else {
          localStorage.setItem(entry.key, v);
        }
      });
      notify("导入失败，已回滚到导入前状态");
    }
  };
  reader.onerror = function() {
    notify("读取文件失败");
  };
  reader.readAsText(file);
}

// ==================== 备份键注册表（白皮书§1.3） ====================
// backup:false 的两个时间戳属设备本地状态，不导出

const STORAGE_REGISTRY = [
  { id: "checkins",           key: "study_dashboard_checkins",               type: "object", backup: true  },
  { id: "settings",           key: "study_dashboard_settings",               type: "object", backup: true  },
  { id: "customGoals",        key: "study_dashboard_custom_goals",           type: "array",  backup: true  },
  { id: "schemaVersion",      key: "study_dashboard_schema_version",         type: "string", backup: true  },
  { id: "lastBackupAt",       key: "study_dashboard_last_backup_at",         type: "string", backup: false },
  { id: "lastBackupRemindAt", key: "study_dashboard_last_backup_remind_at",  type: "string", backup: false },
  { id: "dailyCards",         key: "study_dashboard_daily_cards",            type: "object", backup: true  },
  { id: "monthlyScores",      key: "study_dashboard_monthly_scores",         type: "object", backup: true  },
  { id: "soundEnabled",       key: "study_dashboard_sound_enabled",          type: "string", backup: true  },
  { id: "trendHidden",        key: "study_dashboard_trend_hidden",           type: "string", backup: true  },
  { id: "historyReadonly",    key: "study_dashboard_history_readonly",       type: "string", backup: true  },
  { id: "weeklyReviews",      key: "study_dashboard_weekly_reviews",         type: "object", backup: true  },
  { id: "stageReviewNotes",   key: "study_dashboard_stage_review_notes",     type: "object", backup: true  },
  { id: "globalHoursGoal",    key: "study_dashboard_global_hours_goal",      type: "string", backup: true  },
  { id: "theme",              key: "study_dashboard_theme",                  type: "string", backup: true  },
  { id: "customCommands",     key: "study_dashboard_custom_commands",        type: "array",  backup: true  },
  { id: "dayDiary",           key: "study_dashboard_day_diary",              type: "object", backup: true  }
];

// ==================== ESM 导出（批次19） ====================
export {
  STORAGE_KEYS,
  loadData,
  saveData,
  CURRENT_SCHEMA_VERSION,
  getSchemaVersion,
  setSchemaVersion,
  migrateData,
  getLastBackupAt,
  setLastBackupAt,
  getLastBackupRemindAt,
  setLastBackupRemindAt,
  SOUND_STORAGE_KEY,
  isSoundEnabled,
  setSoundEnabled,
  TREND_HIDDEN_KEY,
  isTrendHidden,
  setTrendHidden,
  HISTORY_READONLY_KEY,
  isHistoryReadonly,
  setHistoryReadonly,
  WEEKLY_REVIEW_STORAGE_KEY,
  loadWeeklyReview,
  saveWeeklyReview,
  STAGE_REVIEW_STORAGE_KEY,
  getStageReviewNotes,
  saveStageReviewNotes,
  GLOBAL_STATS_GOAL_KEY,
  GLOBAL_STATS_DEFAULT_GOAL,
  getGlobalHoursGoal,
  setGlobalHoursGoal,
  THEME_STORAGE_KEY,
  getTheme,
  setTheme,
  SKIN_STORAGE_KEY,
  getSkin,
  setSkin,
  CUSTOM_CMD_STORAGE_KEY,
  getCustomCommands,
  saveCustomCommands,
  getCheckins,
  setCheckins,
  getCheckinsByStage,
  getRateForMetric,
  migrateCheckinRates,
  migrateActualToAdjustment,
  addCheckin,
  getCheckinRecord,
  getCheckinValue,
  hasCheckin,
  isProgressType,
  getTotalCompleted,
  getProgressIncrement,
  getValueBeforeDate,
  getDailyCards,
  setDailyCards,
  getDailyCardsByStage,
  getDailyCard,
  saveDailyCard,
  getDayDiaries,
  getDayDiary,
  saveDayDiary,
  getMonthlyScores,
  setMonthlyScores,
  addMonthlyScore,
  loadCustomGoals,
  saveCustomGoals,
  saveSettings,
  loadSettings,
  clearAllData,
  exportBackup,
  importBackup,
  STORAGE_REGISTRY
};
