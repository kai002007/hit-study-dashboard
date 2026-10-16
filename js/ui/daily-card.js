// ==================== js/ui/daily-card.js ====================
// 批次20（ESM-b）自 script.js 整切：日卡系统域（S4-1 状态分/渲染/保存/事件）。函数体逐字节不变。
import { MELTDOWN_THRESHOLD, STAGE0_START_DATE, STATUS_DROP_THRESHOLD } from "../config.js";
import { STORAGE_KEYS, getDailyCard, getDailyCards, saveDailyCard } from "../storage.js";
import { fmtHours, getDailyHours } from "../aggregation.js";
import { bindClick, daysBetween, formatDateISO, getToday, notify, parseDate, pushUndo } from "./base.js";

// ==================== 0.3 日卡系统（S4-1） ====================

// 配置常量已迁移至 js/config.js（批次7）

// 已迁移至 js/storage.js（批次8）

function getStatusScore(dateStr) {
  const card = getDailyCard(dateStr);
  return card && card.statusScore > 0 ? card.statusScore : null;
}

function getStatusScoreRange(days, offset) {
  // 返回最近 days 天（可加 offset 偏移，用于对比前一周期）的状态分数组，仅含有效记录
  const scores = [];
  const today = new Date();
  const off = offset || 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i - off * days);
    const ds = formatDateISO(d);
    const s = getStatusScore(ds);
    if (s !== null) scores.push(s);
  }
  return scores;
}

function getStatusScoreAvg(days, offset) {
  const scores = getStatusScoreRange(days, offset);
  if (scores.length === 0) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

function getStatusScoreTrend() {
  const recent = getStatusScoreAvg(7, 0);
  const previous = getStatusScoreAvg(7, 1);
  if (recent === null || previous === null) {
    return { recent, previous, diff: null, hasTrend: false };
  }
  const diff = Math.round((recent - previous) * 10) / 10;
  return { recent, previous, diff, hasTrend: true };
}

function isReduceWeek() {
  // 阶段0 起点起算，每第 6、12、18……周为减量周
  const daysSinceStart = daysBetween(parseDate(STAGE0_START_DATE), new Date());
  if (daysSinceStart < 0) return false;
  const weekIndex = Math.floor(daysSinceStart / 7);
  return (weekIndex + 1) % 6 === 0;
}

function isSundayAfternoon() {
  const now = new Date();
  return now.getDay() === 0 && now.getHours() >= 12;
}

function renderDailyCard() {
  const el = document.getElementById("daily-card");
  if (!el) return;

  const todayStr = getToday();
  const card = getDailyCard(todayStr);

  const planInput = document.getElementById("daily-plan-hours");
  const actualInput = document.getElementById("daily-actual-hours");
  const blockerInput = document.getElementById("daily-blocker");

  if (planInput && !planInput.dataset.userEdited) {
    planInput.value = card && card.planHours ? card.planHours : "";
  }
  if (actualInput && !actualInput.dataset.userEdited) {
    const prevAdj = card && Number.isFinite(Number(card.adjustment)) ? Number(card.adjustment) : 0;
    actualInput.value = prevAdj !== 0 ? prevAdj : "";
  }
  if (blockerInput && !blockerInput.dataset.userEdited) {
    blockerInput.value = card ? card.blocker : "";
  }

  // 比值
  const ratioEl = document.getElementById("daily-ratio");
  if (ratioEl) {
    const plan = Number(planInput ? planInput.value : 0) || 0;
    const actual = Number(actualInput ? actualInput.value : 0) || 0;
    if (plan > 0) {
      const ratio = actual / plan;
      ratioEl.textContent = ratio.toFixed(2);
      ratioEl.className = "daily-ratio-display";
      if (ratio >= 0.9) ratioEl.classList.add("ratio-good");
      else if (ratio >= 0.6) ratioEl.classList.add("ratio-ok");
      else ratioEl.classList.add("ratio-bad");
    } else {
      ratioEl.textContent = "--";
      ratioEl.className = "daily-ratio-display";
    }
  }

  // 状态分按钮高亮
  const picker = document.getElementById("status-score-picker");
  if (picker) {
    picker.querySelectorAll(".status-score-btn").forEach(btn => {
      const s = Number(btn.dataset.score);
      btn.classList.toggle("active", card && card.statusScore === s);
    });
  }

  // 标签行
  const tagsEl = document.getElementById("daily-card-tags");
  if (tagsEl) {
    const tags = [];
    if (isReduceWeek()) tags.push('<span class="daily-tag daily-tag-reduce-week">减量周</span>');
    if (isSundayAfternoon()) tags.push('<span class="daily-tag daily-tag-sunday-rest">下午半天休</span>');

    const dhToday = getDailyHours(todayStr);
    if (dhToday.adjustment !== 0) {
      tags.push(`<span class="daily-tag daily-tag-diff">折算 ${fmtHours(dhToday.autoHours)}h，手动调整 ${dhToday.adjustment > 0 ? "+" : ""}${dhToday.adjustment}h</span>`);
    }

    const trend = getStatusScoreTrend();
    if (trend.hasTrend && trend.recent !== null && trend.recent < MELTDOWN_THRESHOLD) {
      tags.push('<span class="daily-tag daily-tag-meltdown">熔断预警</span>');
    }

    tagsEl.innerHTML = tags.join("");
  }

  // 洞察行
  const insightEl = document.getElementById("daily-card-insight");
  if (insightEl) {
    const recent = getStatusScoreAvg(7, 0);
    const trend = getStatusScoreTrend();
    let text = "";
    let cls = "daily-card-insight";

    if (recent === null) {
      text = `近 7 天状态分均值：<strong>暂无记录</strong>`;
    } else {
      text = `近 7 天状态分均值：<strong>${recent}</strong>`;
      if (trend.hasTrend && trend.diff !== null) {
        const arrow = trend.diff > 0 ? "↑" : (trend.diff < 0 ? "↓" : "→");
        const sign = trend.diff > 0 ? "+" : "";
        text += ` · 环比上周 ${arrow} <strong>${sign}${trend.diff}</strong>`;
      }
      if (recent < MELTDOWN_THRESHOLD) {
        text += ` · <strong>低于熔断线 3.5，考虑切 A 案（23:00 睡 7:30 起）</strong>`;
        cls += " insight-danger";
      } else if (trend.hasTrend && trend.diff !== null && trend.diff <= -STATUS_DROP_THRESHOLD) {
        text += ` · <strong>下滑 ≥ ${STATUS_DROP_THRESHOLD}，下周注意减量</strong>`;
        cls += " insight-warning";
      }
    }

    insightEl.innerHTML = text;
    insightEl.className = cls;
  }
}

function handleSaveDailyCard() {
  const todayStr = getToday();
  const planInput = document.getElementById("daily-plan-hours");
  const actualInput = document.getElementById("daily-actual-hours");
  const blockerInput = document.getElementById("daily-blocker");
  const picker = document.getElementById("status-score-picker");

  const activeBtn = picker ? picker.querySelector(".status-score-btn.active") : null;
  const statusScore = activeBtn ? Number(activeBtn.dataset.score) : 0;

  if (statusScore <= 0) {
    notify("请先选择状态分（1–5）");
    return;
  }

  // 白皮书§4.3（批次14b 定稿）：输入框语义=当日调整额（默认 0、可负、仅当日生效）；编辑过即落盘，未编辑保留原 adjustment
  const prevCard = getDailyCard(todayStr);
  const actualEdited = !!(actualInput && actualInput.dataset.userEdited === "true");
  const prevAdj = prevCard && Number.isFinite(Number(prevCard.adjustment)) ? Number(prevCard.adjustment) : 0;
  const data = {
    planHours: planInput ? Number(planInput.value) || 0 : 0,
    adjustment: actualEdited
      ? (actualInput ? Number(actualInput.value) || 0 : 0)
      : prevAdj,
    statusScore: statusScore,
    blocker: blockerInput ? blockerInput.value : ""
  };

  const before = getDailyCards();
  saveDailyCard(todayStr, data);
  pushUndo("保存日卡", { [STORAGE_KEYS.dailyCards]: before });

  // 熔断提示：状态分 ≤2 时按总纲规则进入轻量模式
  if (statusScore <= 2) {
    setTimeout(() => {
      notify(
        `状态分 ${statusScore} ≤ 2，按方案规则进入熔断：只做单词+错题翻看，双线全停，不补课不愧疚`,
        "warning"
      );
    }, 400);
  }

  const saveBtn = document.getElementById("daily-save-btn");
  if (saveBtn) {
    saveBtn.classList.add("saved");
    saveBtn.textContent = "已保存 ✓";
    setTimeout(() => {
      saveBtn.classList.remove("saved");
      saveBtn.textContent = "保存日卡";
    }, 1500);
  }

  renderDailyCard();
}

function bindDailyCardEvents() {
  const picker = document.getElementById("status-score-picker");
  if (picker && !picker.dataset.bound) {
    picker.dataset.bound = "1";
    picker.querySelectorAll(".status-score-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        picker.querySelectorAll(".status-score-btn").forEach(b => b.classList.remove("active"));
        this.classList.add("active");
      });
    });
  }

  const planInput = document.getElementById("daily-plan-hours");
  const actualInput = document.getElementById("daily-actual-hours");
  const blockerInput = document.getElementById("daily-blocker");

  function updateRatio() {
    const plan = Number(planInput ? planInput.value : 0) || 0;
    const actual = Number(actualInput ? actualInput.value : 0) || 0;
    const ratioEl = document.getElementById("daily-ratio");
    if (!ratioEl) return;
    if (plan > 0) {
      const ratio = actual / plan;
      ratioEl.textContent = ratio.toFixed(2);
      ratioEl.className = "daily-ratio-display";
      if (ratio >= 0.9) ratioEl.classList.add("ratio-good");
      else if (ratio >= 0.6) ratioEl.classList.add("ratio-ok");
      else ratioEl.classList.add("ratio-bad");
    } else {
      ratioEl.textContent = "--";
      ratioEl.className = "daily-ratio-display";
    }
  }

  [planInput, actualInput, blockerInput].forEach(inp => {
    if (inp && !inp.dataset.bound) {
      inp.dataset.bound = "1";
      inp.addEventListener("input", function() {
        this.dataset.userEdited = "true";
        updateRatio();
      });
    }
  });

  bindClick("daily-save-btn", handleSaveDailyCard);
}


// ==================== ESM 导出（批次20） ====================
export {
  bindDailyCardEvents, getStatusScoreTrend, handleSaveDailyCard, isReduceWeek, isSundayAfternoon, renderDailyCard
};
