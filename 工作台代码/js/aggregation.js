// ==================== js/aggregation.js ====================
// 统一聚合引擎（批次9）：白皮书§2 出口函数 + 兼容层
// 所有"学时统计"的唯一入口；本文件禁止访问 DOM、禁止顶层执行语句
// 依赖：js/config.js（METRIC_CONFIGS/STAGES/CAPACITY_DAILY_THRESHOLD/STAGE_CHECK_RULES）
//       js/storage.js（getCheckins/getDailyCard/loadCustomGoals/getGlobalHoursGoal）
//       js/ui/base.js（parseDate/formatDateISO）、js/ui/stage.js（getStageIdByDate）（批次20 起 ESM import）
import { STAGES, METRIC_CONFIGS, STAGE_CHECK_RULES, CAPACITY_DAILY_THRESHOLD } from "./config.js";
import { getCheckins, getDailyCard, getDailyCards, loadCustomGoals, getGlobalHoursGoal } from "./storage.js";
import { parseDate, formatDateISO } from "./ui/base.js";
import { getStageIdByDate } from "./ui/stage.js";

// ==================== 1A. 引擎核心 ====================

// 日级去重读取（去重规则唯一实现点）：补记优先，同类多条取 createdAt 最新
function getDailyRecord(metricKey, dateStr) {
  const checkins = getCheckins();
  const list = (checkins[metricKey] || []).filter(c => c.date === dateStr);
  if (list.length === 0) return null;
  const makeups = list.filter(c => c.isMakeup);
  const pool = makeups.length > 0 ? makeups : list;
  return pool.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}

// 产能指标集唯一产出：固定卡 contributesToCapacity ∪ 已填 hoursPerUnit 的自定义目标
function getCapacityMetricKeys() {
  const keys = [];
  for (const key in METRIC_CONFIGS) {
    const cfg = METRIC_CONFIGS[key];
    if (cfg && cfg.contributesToCapacity) keys.push(key);
  }
  loadCustomGoals().forEach(g => {
    if (typeof g.hoursPerUnit === "number") keys.push(g.id);
  });
  return keys;
}

// 批次15（R-2a）：设置聚合页可编辑卡清单——hoursPerUnit 为数值的固定卡（sleep/周产能/周检天然排除）
function getCoeffEditableMetricKeys() {
  const keys = [];
  for (const key in METRIC_CONFIGS) {
    const cfg = METRIC_CONFIGS[key];
    if (cfg && typeof cfg.hoursPerUnit === "number") keys.push(key);
  }
  return keys;
}

// 批次17（R-4）：阶段内单指标折算工时（rate 快照口径，经 getDailyContribution）
function getStageMetricHours(metricKey, dates) {
  let total = 0;
  dates.forEach(d => { total += getDailyContribution(metricKey, d); });
  return total;
}

// 批次17（R-5a）：某日全部打卡明细（含自定义目标，取各卡当日最新一条，与全局统计同口径）
function getDayCheckinEntries(dateStr) {
  const checkins = getCheckins();
  const goals = loadCustomGoals();
  const entries = [];
  for (const key in checkins) {
    const rec = getDailyRecord(key, dateStr);
    if (!rec) continue;
    const cfg = METRIC_CONFIGS[key];
    const goal = key.startsWith("goal_") ? goals.find(g => g.id === key) : null;
    if (!cfg && !goal) continue;
    entries.push({
      key: key,
      name: cfg ? cfg.name : goal.name,
      value: rec.value,
      unit: cfg ? cfg.unit : goal.unit,
      hours: getDailyContribution(key, dateStr)
    });
  }
  return entries;
}

// 单指标日贡献（兼容 goal_*：计数器语义，value 即当日量，不走增量）
function getDailyContribution(metricKey, dateStr) {
  const rec = getDailyRecord(metricKey, dateStr);
  const value = rec ? (Number(rec.value) || 0) : 0;
  // 批次13（R-1）：rate 快照优先；无快照（未迁移旧记录）回退当前系数
  if (metricKey.startsWith("goal_")) {
    if (rec && typeof rec.rate === "number") return value * rec.rate;
    const goal = loadCustomGoals().find(g => g.id === metricKey);
    return goal && typeof goal.hoursPerUnit === "number" ? value * goal.hoursPerUnit : 0;
  }
  const cfg = METRIC_CONFIGS[metricKey];
  if (!cfg || !cfg.contributesToCapacity || !cfg.hoursPerUnit) return 0;
  const rate = rec && typeof rec.rate === "number" ? rec.rate : cfg.hoursPerUnit;
  return value * rate;
}

// 纯自动折算
function getDailyAutoHours(dateStr) {
  let total = 0;
  getCapacityMetricKeys().forEach(k => { total += getDailyContribution(k, dateStr); });
  return total;
}

// R-1 单一口径出口（批次13）：hours = autoHours + adjustment
// adjustment 由日卡"当日调整额"输入写入（默认 0、可负、仅当日生效；批次14b 起有 UI 消费方）
function getDailyHours(dateStr) {
  const autoHours = getDailyAutoHours(dateStr);
  const card = getDailyCard(dateStr);
  const adjustment = card && Number.isFinite(Number(card.adjustment)) ? Number(card.adjustment) : 0;
  return { hours: autoHours + adjustment, autoHours: autoHours, adjustment: adjustment };
}

// #68 舍入唯一化：fmtHours = 全站唯一显示层舍入实现点；引擎层去舍入随批次14b 落地
function fmtHours(h) {
  return Math.round((Number(h) || 0) * 10) / 10;
}

// 区间层（闭区间；opts.cutoffToday 默认 true，未来日不计）
function getRangeTotalHours(startStr, endStr, opts) {
  const cutoff = !opts || opts.cutoffToday !== false;
  const today = parseDate(formatDateISO(new Date()));
  const byDate = [];
  let total = 0, days = 0;
  for (let d = parseDate(startStr); d <= parseDate(endStr); d.setDate(d.getDate() + 1)) {
    if (cutoff && d > today) break;
    const ds = formatDateISO(d);
    const h = getDailyHours(ds);
    byDate.push({ date: ds, hours: h.hours, source: h.adjustment !== 0 ? "manual" : "auto" });
    total += h.hours; days++;
  }
  return { total: total, days: days, byDate: byDate };
}

// 周场景（weekStartStr 缺省=本周一）
function getWeeklyStats(weekStartStr) {
  let monday;
  if (weekStartStr) {
    monday = parseDate(weekStartStr);
  } else {
    monday = new Date();
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  }
  const weekStart = formatDateISO(monday);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const weekEnd = formatDateISO(sunday);
  const range = getRangeTotalHours(weekStart, weekEnd);

  // 竞赛专项学时：系数从 METRIC_CONFIGS 读（消灭旧硬编码 1.5/3 双源）
  let competitionHours = 0;
  const today = parseDate(formatDateISO(new Date()));
  for (let d = parseDate(weekStart); d <= parseDate(weekEnd) && d <= today; d.setDate(d.getDate() + 1)) {
    const ds = formatDateISO(d);
    const cmc = getDailyRecord("cmc", ds);
    const mock = getDailyRecord("mock-exams", ds);
    // 批次13（R-1）：rate 快照优先，无快照回退当前系数
    competitionHours += (cmc ? Number(cmc.value) || 0 : 0) * (cmc && typeof cmc.rate === "number" ? cmc.rate : (METRIC_CONFIGS["cmc"].hoursPerUnit || 0));
    competitionHours += (mock ? Number(mock.value) || 0 : 0) * (mock && typeof mock.rate === "number" ? mock.rate : (METRIC_CONFIGS["mock-exams"].hoursPerUnit || 0));
  }
  const achieveDays = range.byDate.filter(x => x.hours >= CAPACITY_DAILY_THRESHOLD).length;
  let vocabDays = 0;
  range.byDate.forEach(x => {
    const rec = getDailyRecord("vocabulary", x.date);
    if (rec && Number(rec.value) > 0) vocabDays++;
  });

  // 六级专项学时：listening 打卡折算（批次13 起 rate 快照优先，回退配置系数）
  let cet6Hours = 0;
  range.byDate.forEach(x => {
    const rec = getDailyRecord("listening", x.date);
    if (rec) cet6Hours += (Number(rec.value) || 0) * (typeof rec.rate === "number" ? rec.rate : (METRIC_CONFIGS["listening"].hoursPerUnit || 0));
  });
  // 期末复习学时：final-courses 卡折算（批次17 阶段1核对：修复 final-review 误代理 range.total 与同页第1项同源冗余）
  let finalReviewHours = 0;
  range.byDate.forEach(x => {
    const rec = getDailyRecord("final-courses", x.date);
    if (rec) finalReviewHours += (Number(rec.value) || 0) * (typeof rec.rate === "number" ? rec.rate : (METRIC_CONFIGS["final-courses"].hoursPerUnit || 0));
  });
  const rules = STAGE_CHECK_RULES[getStageIdByDate(weekStart)] || STAGE_CHECK_RULES["阶段0"] || [];
  const findRule = id => rules.find(r => r.id === id);
  const totalRule = findRule("total-hours"), investRule = findRule("weekly-invest");

  return {
    weekStart: weekStart,
    weekEnd: weekEnd,
    totalHours: range.total,
    achieveDays: achieveDays,
    competitionHours: competitionHours,
    vocabDays: vocabDays,
    cet6Hours: cet6Hours,
    finalReviewHours: finalReviewHours,
    bottomHours: totalRule ? totalRule.threshold : null,
    targetHours: investRule ? investRule.threshold : null,
    byDay: range.byDate,
    checkItems: rules.map(r => {
      const cur = r.id === "total-hours" ? range.total
                : r.id === "achieve-days" ? achieveDays
                : r.id === "competition" ? competitionHours
                : r.id === "weekly-invest" ? range.total
                : r.id === "final-review" ? finalReviewHours
                : r.id === "cet6" ? cet6Hours
                : r.id === "vocab" ? vocabDays : 0;
      return {
        id: r.id, label: r.label, threshold: r.threshold, unit: r.unit,
        current: cur,
        pass: typeof r.threshold === "number" && cur >= r.threshold
      };
    })
  };
}

// ==================== 1B. 阶段 / 全局统计 ====================

// 阶段统计：内部自实现日期遍历（不依赖 script.js 的 iterateStageDates）
function getStageStats(stageId) {
  const stage = STAGES.find(s => s.id === stageId);
  if (!stage) return null;

  const start = parseDate(stage.start);
  const end = parseDate(stage.end);
  const today = parseDate(formatDateISO(new Date()));
  const effectiveEnd = end < today ? end : today;

  // 阶段区间内的全部日期列表
  const dates = [];
  for (let d = new Date(start); d <= effectiveEnd; d.setDate(d.getDate() + 1)) {
    dates.push(formatDateISO(d));
  }

  // totalHours = 全区间（含未来日由 getRangeTotalHours 自身 cutoff 处理）
  const totalHours = getRangeTotalHours(stage.start, stage.end).total;

  // effectiveHours = 仅日卡 statusScore ≥ 3 的日期的 finalHours 求和
  let effectiveHours = 0;
  dates.forEach(ds => {
    const card = getDailyCard(ds);
    if (card && Number(card.statusScore) >= 3) {
      effectiveHours += getDailyHours(ds).hours;
    }
  });
  // checkinDays = 任一非 summary/auto-check 键（含 sleep 等习惯键与 goal_*）有记录的天数
  const capacityKeys = getCapacityMetricKeys();
  const checkinsAll = getCheckins();
  const allKeys = Object.keys(checkinsAll).filter(k => {
    if (k.startsWith("goal_")) return true;
    const cfg = METRIC_CONFIGS[k];
    return cfg && cfg.type !== "summary" && cfg.type !== "auto-check";
  });
  const checkinDaysSet = new Set();
  dates.forEach(ds => {
    for (const key of allKeys) {
      if (getDailyRecord(key, ds)) { checkinDaysSet.add(ds); break; }
    }
  });
  const checkinDays = checkinDaysSet.size;

  // longestStreak = checkinDays 中最长连续天数
  let longestStreak = 0;
  let curStreak = 0;
  dates.forEach(ds => {
    if (checkinDaysSet.has(ds)) {
      curStreak++;
      if (curStreak > longestStreak) longestStreak = curStreak;
    } else {
      curStreak = 0;
    }
  });

  // byMetric = 各产能键 Σ 去重 value × hoursPerUnit（goal_* 走其 hoursPerUnit）
  const byMetric = [];
  capacityKeys.forEach(key => {
    const isGoal = key.startsWith("goal_");
    const cfg = isGoal ? null : METRIC_CONFIGS[key];
    if (!isGoal && (!cfg || !cfg.hoursPerUnit || !cfg.contributesToCapacity)) return;
    const hoursPerUnit = isGoal
      ? ((loadCustomGoals().find(g => g.id === key) || {}).hoursPerUnit || 0)
      : cfg.hoursPerUnit;
    let total = 0;
    dates.forEach(ds => {
      const rec = getDailyRecord(key, ds);
      if (rec) total += (Number(rec.value) || 0) * hoursPerUnit;
    });
    if (total > 0) {
      byMetric.push({
        key,
        name: isGoal
          ? ((loadCustomGoals().find(g => g.id === key) || {}).name || key)
          : (cfg.name || key),
        hours: total
      });
    }
  });
  byMetric.sort((a, b) => b.hours - a.hours);

  // habitDays = 各习惯键区间内有记录天数
  const habitKeys = allKeys;
  const habitDays = [];
  habitKeys.forEach(key => {
    const isGoal = key.startsWith("goal_");
    const cfg = isGoal ? null : METRIC_CONFIGS[key];
    let count = 0;
    dates.forEach(ds => {
      if (getDailyRecord(key, ds)) count++;
    });
    if (count > 0) {
      habitDays.push({
        key,
        name: isGoal
          ? ((loadCustomGoals().find(g => g.id === key) || {}).name || key)
          : (cfg.name || key),
        days: count,
        total: dates.length
      });
    }
  });
  habitDays.sort((a, b) => b.days - a.days);

  return {
    stageId: stageId,
    dateRange: { start: stage.start, end: stage.end, effectiveEnd: formatDateISO(effectiveEnd) },
    totalHours: totalHours,
    effectiveHours: effectiveHours,
    checkinDays: checkinDays,
    longestStreak: longestStreak,
    byMetric: byMetric,
    habitDays: habitDays
  };
}

// 全局统计
function getGlobalStats() {
  // 日期全集 = 产能键出现日期 ∪ 日卡 adjustment≠0 的日期
  const dateSet = new Set();
  const checkins = getCheckins();
  const capacityKeys = getCapacityMetricKeys();
  Object.keys(checkins).forEach(key => {
    if (!capacityKeys.includes(key)) return;
    checkins[key].forEach(c => { if (c.date) dateSet.add(c.date); });
  });
  const cards = getDailyCards();
  Object.keys(cards).forEach(ds => {
    const adj = cards[ds] ? Number(cards[ds].adjustment) : 0;
    if (Number.isFinite(adj) && adj !== 0) dateSet.add(ds);
  });
  const dates = Array.from(dateSet).sort();

  // totalHours
  let totalHours = 0;
  dates.forEach(ds => { totalHours += getDailyHours(ds).hours; });
  // byStage（主阶段归因求和）
  const byStageMap = new Map();
  dates.forEach(ds => {
    const stageId = getStageIdByDate(ds);
    const h = getDailyHours(ds).hours;
    byStageMap.set(stageId, (byStageMap.get(stageId) || 0) + h);
  });
  const byStage = Array.from(byStageMap.entries()).map(([stageId, hours]) => ({
    stageId,
    hours: hours
  })).sort((a, b) => b.hours - a.hours);

  // byMetric（复用叛徒收编版 getGlobalHoursByMetric，含 goal_*）
  const byMetric = getGlobalHoursByMetric();

  // byMonth（YYYY-MM 分桶，按月份升序）
  const byMonthMap = new Map();
  dates.forEach(ds => {
    const ym = ds.slice(0, 7);
    const h = getDailyHours(ds).hours;
    byMonthMap.set(ym, (byMonthMap.get(ym) || 0) + h);
  });
  const byMonth = Array.from(byMonthMap.entries()).map(([month, hours]) => ({
    month,
    hours: hours
  })).sort((a, b) => a.month.localeCompare(b.month));

  return {
    totalHours: totalHours,
    byStage: byStage,
    byMetric: byMetric,
    byMonth: byMonth,
    daysWithData: dates.length
  };
}

// ==================== 1C. 兼容层（保旧名，UI 零改动） ====================

// 语义冻结：auto 口径
function getDailyTotalHours(dateStr) { return getDailyAutoHours(dateStr); }

// 语义冻结：仍只认 METRIC_CONFIGS 固定卡（不含 goal_*）
function getDailyHourContribution(metricKey, dateStr) {
  const cfg = METRIC_CONFIGS[metricKey];
  if (!cfg || !cfg.contributesToCapacity || !cfg.hoursPerUnit) return 0;
  const rec = getDailyRecord(metricKey, dateStr);
  return (rec ? Number(rec.value) || 0 : 0) * (rec && typeof rec.rate === "number" ? rec.rate : cfg.hoursPerUnit);
}

// 语义冻结：本周一→今天，auto 口径
function getWeeklyTotalHours() {
  const today = new Date();
  const diffToMonday = (today.getDay() + 6) % 7;
  let total = 0;
  for (let i = 0; i <= diffToMonday; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - diffToMonday + i);
    total += getDailyAutoHours(formatDateISO(d));
  }
  return total;
}

// 语义冻结：系数改从配置读（1.5/3 同值，零行为变化，消双源）
function getCompetitionHours(dateStr) {
  const cmc = getDailyRecord("cmc", dateStr);
  const mock = getDailyRecord("mock-exams", dateStr);
  const hours = (cmc ? Number(cmc.value) || 0 : 0) * (cmc && typeof cmc.rate === "number" ? cmc.rate : (METRIC_CONFIGS["cmc"].hoursPerUnit || 0))
              + (mock ? Number(mock.value) || 0 : 0) * (mock && typeof mock.rate === "number" ? mock.rate : (METRIC_CONFIGS["mock-exams"].hoursPerUnit || 0));
  return hours;
}

// 叛徒收编（裁决4）：增量+去重口径；输出结构不变（hours 降序、hours<=0 剔除）
function getGlobalHoursByMetric() {
  const result = [];
  const checkins = getCheckins();
  const keys = getCapacityMetricKeys();
  keys.forEach(key => {
    const isGoal = key.startsWith("goal_");
    const cfg = isGoal ? null : METRIC_CONFIGS[key];
    if (!isGoal && (!cfg || cfg.type === "summary" || cfg.type === "auto-check")) return;
    const list = checkins[key] || [];
    const dateSet = new Set();
    list.forEach(c => { if (c.date) dateSet.add(c.date); });
    let hours = 0;
    dateSet.forEach(dateStr => {
      const rec = getDailyRecord(key, dateStr);
      // 去重：每个日期只计入 getDailyRecord 判定的有效记录一次（补记优先 + createdAt 最新，规则唯一实现点 getDailyRecord）
      if (!rec) return;
      // 批次13（R-1）：rate 快照优先（rec 已在上方判空，此处安全）
      hours += (Number(rec.value) || 0) * (typeof rec.rate === "number" ? rec.rate : (isGoal
        ? ((loadCustomGoals().find(g => g.id === key) || {}).hoursPerUnit || 0)
        : cfg.hoursPerUnit));
    });
    if (hours <= 0) return;
    const name = isGoal
      ? ((loadCustomGoals().find(g => g.id === key) || {}).name || key)
      : (cfg.name || key);
    result.push({ key: key, name: name, hours: hours });
  });
  result.sort((a, b) => b.hours - a.hours);
  return result;
}

// ==================== ESM 导出（批次19） ====================
export {
  getDailyRecord,
  getCapacityMetricKeys,
  getCoeffEditableMetricKeys,
  getStageMetricHours,
  getDayCheckinEntries,
  getDailyContribution,
  getDailyAutoHours,
  getDailyHours,
  fmtHours,
  getRangeTotalHours,
  getWeeklyStats,
  getStageStats,
  getGlobalStats,
  getDailyTotalHours,
  getDailyHourContribution,
  getWeeklyTotalHours,
  getCompetitionHours,
  getGlobalHoursByMetric
};
