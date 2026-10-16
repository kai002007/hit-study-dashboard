// ==================== js/ui/goals.js ====================
// 批次20（ESM-b）自 script.js 整切：自定义目标域（目标CRUD/补记下拉/新目标模态/删除目标/全局事件绑定 bindAllEvents）。函数体逐字节不变。
import { STORAGE_KEYS, addCheckin, clearAllData, exportBackup, getCheckins, getTotalCompleted, importBackup, loadCustomGoals, loadData, saveCustomGoals, setCheckins, setHistoryReadonly } from "../storage.js";
import { SoundKit, animateNumber, applyTrendHiddenState, bindClick, bindSoundOnButtons, bindUndoShortcut, daysBetween, formatDateCN, formatDateISO, getToday, handleSoundToggle, handleTrendToggle, notify, parseDate, pushUndo, renderSoundToggle, setClass, setRingProgress, setText } from "./base.js";
import { bindDailyCardEvents } from "./daily-card.js";
import { applyViewModeClass, closeStageDrawer, openStageDrawer } from "./stage.js";
import { getRecentAverage, handleCheckin, handleMakeup, handleProgressCheckin, handleProgressMakeup, handleQuickCheckin, handleSaveCoeffSettings, openAdjustPlan, toggleMakeup, updateWeeklyCapacityCard, updateWeeklyCheckCard } from "./checkin.js";
import { renderCustomGoalTrend } from "./charts.js";
import { attachCmdPaletteHint, bindCommandPalette, bindTabNumberShortcut, exportCheckinsMarkdown, exportDailyCardsMarkdown, exportWeeklyReviewsMarkdown } from "./command.js";
import { updateAllCards } from "./today.js";
import { renderProgressDashboard } from "./dashboard.js";
import { bindStageReviewEvents } from "./review.js";
import { bindCalendarEvents, bindGlobalStatsEvents } from "./global-stats.js";
import { bindHeatmapTooltip, bindThemeModalEvents, closeCoeffPage, closeIoPage, closeManageCmdModal, closeMoreFeaturesPage, exportCheckinsCSV, exportDailyCardsCSV, exportWeeklyReviewsCSV, handleAddCmdSubmit, handleThemeToggle, openCoeffPage, openIoPage, openManageCmdModal, openMoreFeaturesPage } from "./settings.js";

// ==================== 14. 自定义学习目标 ====================

// 已迁移至 js/storage.js（批次8）

// ==================== 14.5 删除学习目标（S10-4） ====================

function renderDeleteGoalList() {
  const list = document.getElementById("delete-goal-list");
  if (!list) return;

  const goals = loadCustomGoals();
  if (goals.length === 0) {
    list.innerHTML = '<div class="delete-goal-empty">暂无自定义目标</div>';
    return;
  }

  list.innerHTML = goals.map(g => `
    <div class="delete-goal-item" data-goal-id="${g.id}">
      <div class="delete-goal-info">
        <span class="delete-goal-name">${g.name}</span>
        <span class="delete-goal-meta">共 ${g.total} ${g.unit} · 截止 ${formatDateCN(g.deadline)}</span>
      </div>
      <button type="button" class="delete-goal-btn" data-goal-id="${g.id}">删除</button>
    </div>
  `).join("");

  list.querySelectorAll(".delete-goal-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      handleDeleteGoal(btn.dataset.goalId);
    });
  });
}

function handleDeleteGoal(goalId) {
  const goals = loadCustomGoals();
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;

  if (!confirm(`确定要删除「${goal.name}」吗？\n\n将同时删除该目标的所有打卡记录。\n此操作可在 60 秒内通过撤销或 Ctrl+Z 恢复。`)) return;

  const beforeGoals = JSON.parse(JSON.stringify(loadData(STORAGE_KEYS.customGoals, [])));
  const beforeCheckins = JSON.parse(JSON.stringify(getCheckins()));

  // 删除目标定义
  const newGoals = goals.filter(g => g.id !== goalId);
  saveCustomGoals(newGoals);

  // 删除该目标的打卡记录
  const newCheckins = JSON.parse(JSON.stringify(beforeCheckins));
  delete newCheckins[goalId];
  setCheckins(newCheckins);

  pushUndo("删除学习目标", {
    [STORAGE_KEYS.customGoals]: beforeGoals,
    [STORAGE_KEYS.checkins]: beforeCheckins
  });

  // 刷新弹窗列表
  renderDeleteGoalList();

  // 刷新主界面
  renderAllCustomGoals();
  updateAllCards();
  renderProgressDashboard();
}

function openDeleteGoalModal() {
  const modal = document.getElementById("delete-goal-modal");
  if (!modal) return;
  renderDeleteGoalList();
  modal.style.display = "flex";
  SoundKit.pop();
}

function closeDeleteGoalModal() {
  const modal = document.getElementById("delete-goal-modal");
  if (modal) modal.style.display = "none";
}

// 已迁移至 js/storage.js（批次8）

function generateGoalId() {
  return "goal_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

function getLast6DaysOptionsHTML() {
  let html = "";
  for (let i = 1; i <= 6; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = formatDateISO(d);
    html += `<option value="${ds}">${formatDateCN(ds)}</option>`;
  }
  return html;
}

function refreshMakeupDateOptions() {
  const keys = ["vocabulary", "listening", "sleep", "cmc", "mock-exams", "advanced-math", "final-courses"];
  keys.forEach(key => {
    const sel = document.getElementById(`${key}-makeup-date`);
    if (sel) {
      const currentValue = sel.value;
      sel.innerHTML = getLast6DaysOptionsHTML();
      if (currentValue) sel.value = currentValue;
    }
  });
  // 自定义目标卡同样刷新（批次16：跨午夜后补记下拉不陈旧）
  loadCustomGoals().forEach(g => {
    const sel = document.getElementById(`${g.id}-makeup-date`);
    if (sel) {
      const currentValue = sel.value;
      sel.innerHTML = getLast6DaysOptionsHTML();
      if (currentValue) sel.value = currentValue;
    }
  });
}

function createCustomGoalCardHTML(goal) {
  const strategy = goal.obstacle
    ? `<div class="goal-strategy"><strong>障碍：</strong>${goal.obstacle}<br><strong>对策：</strong>${goal.counter || "暂无"}</div>`
    : "";

  return `
    <article class="metric-card metric-card-bar" data-metric="${goal.id}">
      <div class="metric-bar-grid">
        <div class="metric-bar-info">
          <h3 class="metric-name">
            <span class="metric-icon"><svg class="metric-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span>
            ${goal.name}
          </h3>
          <div class="metric-bar-info-meta">
            <span class="metric-status status-danger" id="${goal.id}-status">未开始</span>
          </div>
        </div>

        <div class="metric-bar-content">
          <div class="metric-bar-numbers">
            <span class="metric-current" id="${goal.id}-current">0</span>
            <span class="metric-separator">/</span>
            <span class="metric-target" id="${goal.id}-target">${goal.total} ${goal.unit}</span>
            <span class="metric-bar-percent" id="${goal.id}-percent">0%</span>
          </div>
          <div class="metric-bar-track">
            <div class="metric-bar-fill status-danger" id="${goal.id}-progress"></div>
          </div>
          <div class="metric-bar-subline">
            <span class="checkin-suggest" id="${goal.id}-suggest">建议今日推进：${goal.daily} ${goal.unit}</span>
            <span id="${goal.id}-percent-text">完成度 0%</span>
            <span class="metric-estimate estimate-none" id="${goal.id}-estimate">预计完成日：暂无推算</span>
          </div>
          ${strategy}
        </div>

        <div class="metric-bar-actions">
          <input type="number" class="checkin-input" id="${goal.id}-input" placeholder="本次推进量" min="0">
          <div class="metric-bar-action-btns">
            <button class="checkin-btn" id="${goal.id}-btn">更新进度</button>
            <button class="checkin-btn checkin-btn-quick" id="${goal.id}-quick-btn">一键打卡</button>
          </div>
        </div>
      </div>

      <div class="metric-bar-footer">
        <div class="trend-chart" id="${goal.id}-trend"></div>
        <div class="metric-bar-footer-actions">
          <div class="makeup-panel">
            <button class="makeup-toggle" id="${goal.id}-makeup-toggle">补记最近6天</button>
            <div class="makeup-form" id="${goal.id}-makeup-form" style="display:none;">
              <select class="makeup-select" id="${goal.id}-makeup-date">
                ${getLast6DaysOptionsHTML()}
              </select>
              <input type="number" class="checkin-input" id="${goal.id}-makeup-input" placeholder="补记数量" min="0">
              <button class="checkin-btn checkin-btn-makeup" id="${goal.id}-makeup-btn">补记</button>
            </div>
          </div>
          <div class="adjust-plan-row">
            <button class="adjust-plan-btn" id="${goal.id}-adjust-btn">调整计划</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function updateCustomGoalCard(goal) {
  const completed = getTotalCompleted(goal.id);
  const percent = Math.min(100, Math.round((completed / goal.total) * 100));
  const remaining = Math.max(0, goal.total - completed);
  const remainingDays = Math.max(1, daysBetween(new Date(), parseDate(goal.deadline)));
  const suggested = Math.round(remaining / remainingDays);

  let statusClass, statusText;
  if (percent >= 100) {
    statusClass = "status-normal";
    statusText = "已完成";
  } else if (percent >= 80) {
    statusClass = "status-warning";
    statusText = "进行中";
  } else {
    statusClass = "status-danger";
    statusText = "落后";
  }

  setText(`${goal.id}-status`, statusText);
  setClass(`${goal.id}-status`, `metric-status ${statusClass}`);
  if (typeof animateNumber === "function") {
    animateNumber(`${goal.id}-current`, completed);
  } else {
    setText(`${goal.id}-current`, completed);
  }
  setRingProgress(goal.id, percent, statusClass);
  setText(`${goal.id}-percent-text`, `完成度 ${percent}%`);
  setText(`${goal.id}-target`, `${goal.total} ${goal.unit}`);
  setText(`${goal.id}-suggest`, `建议今日推进：${suggested} ${goal.unit}`);

  const est = document.getElementById(`${goal.id}-estimate`);
  if (est) {
    const recent = getRecentAverage(goal.id, 7);
    if (recent.sampleDays >= 3 && recent.average > 0) {
      const daysNeeded = remaining / recent.average;
      const estimated = new Date();
      estimated.setDate(estimated.getDate() + Math.ceil(daysNeeded));
      const estimatedStr = formatDateISO(estimated);
      const diff = daysBetween(estimated, parseDate(goal.deadline));
      const onTrack = diff >= 0;
      const diffText = onTrack ? `预计提前 ${diff} 天完成` : `预计拖后 ${Math.abs(diff)} 天`;
      est.textContent = `预计完成日：${formatDateCN(estimatedStr)} · ${diffText}`;
      est.className = `metric-estimate ${onTrack ? "estimate-early" : "estimate-late"}`;
    } else {
      est.textContent = "预计完成日：暂无推算（样本不足3天）";
      est.className = "metric-estimate estimate-none";
    }
  }

  renderCustomGoalTrend(goal);
}

function renderAllCustomGoals() {
  const goals = loadCustomGoals();
  const grid = document.getElementById("metrics-grid");
  if (!grid) return;

  // 先移除旧的自定义卡片（按 DOM 现状清扫，含已删除目标的残留卡）
  grid.querySelectorAll('[data-metric^="goal_"]').forEach(el => el.remove());

  // 重新追加
  goals.forEach(goal => {
    const temp = document.createElement("div");
    temp.innerHTML = createCustomGoalCardHTML(goal);
    const card = temp.firstElementChild;
    grid.appendChild(card);
    updateCustomGoalCard(goal);
    bindCustomGoalEvents(goal);
  });
}

function handleCustomProgressCheckin(goal) {
  const input = document.getElementById(`${goal.id}-input`);
  if (!input) return;
  const increment = parseFloat(input.value);
  if (isNaN(increment) || increment < 0) {
    notify("请输入有效数量");
    return;
  }
  const before = getCheckins();
  addCheckin(goal.id, increment, getToday(), false);
  pushUndo("自定义目标打卡", { [STORAGE_KEYS.checkins]: before });
  input.value = "";
  updateCustomGoalCard(goal);
  updateWeeklyCapacityCard();
  updateWeeklyCheckCard();
  renderProgressDashboard();
}

function handleCustomMakeup(goal) {
  const dateSelect = document.getElementById(`${goal.id}-makeup-date`);
  const input = document.getElementById(`${goal.id}-makeup-input`);
  if (!dateSelect || !input) return;
  const dateStr = dateSelect.value;
  const increment = parseFloat(input.value);
  if (isNaN(increment) || increment < 0) {
    notify("请输入有效数量");
    return;
  }
  const before = getCheckins();
  addCheckin(goal.id, increment, dateStr, true);
  pushUndo("自定义目标补记", { [STORAGE_KEYS.checkins]: before });
  input.value = "";
  updateCustomGoalCard(goal);
  updateWeeklyCapacityCard();
  updateWeeklyCheckCard();
  renderProgressDashboard();
}

function bindCustomGoalEvents(goal) {
  bindClick(`${goal.id}-btn`, () => handleCustomProgressCheckin(goal));

  // 一键打卡：按剩余量 / 剩余天数自动填充建议量，然后触发更新
  bindClick(`${goal.id}-quick-btn`, () => {
    const completed = getTotalCompleted(goal.id);
    const remaining = Math.max(0, goal.total - completed);
    const remainingDays = Math.max(1, daysBetween(new Date(), parseDate(goal.deadline)));
    const suggested = Math.max(1, Math.round(remaining / remainingDays));
    const input = document.getElementById(`${goal.id}-input`);
    if (input) {
      input.value = suggested;
      input.dataset.userEdited = "true";
    }
    handleCustomProgressCheckin(goal);
  });

  bindClick(`${goal.id}-makeup-toggle`, () => toggleMakeup(goal.id));
  bindClick(`${goal.id}-makeup-btn`, () => handleCustomMakeup(goal));

  bindClick(`${goal.id}-adjust-btn`, () => {
    const newTotal = prompt(`调整「${goal.name}」总目标（当前 ${goal.total} ${goal.unit}）：`, goal.total);
    if (newTotal === null) return;
    const num = parseFloat(newTotal);
    if (isNaN(num) || num < 1) {
      notify("请输入有效数字");
      return;
    }
    goal.total = num;
    const newRate = prompt(`调整「${goal.name}」每单位折算时长（小时），当前：${goal.hoursPerUnit !== undefined ? goal.hoursPerUnit : "未设置（不计入学时）"}；留空保持不变，输入 0 清除：`, goal.hoursPerUnit !== undefined ? goal.hoursPerUnit : "");
    if (newRate !== null && newRate.trim() !== "") {
      const rv = parseFloat(newRate);
      if (isNaN(rv) || rv < 0) {
        notify("折算时长须为非负数字");
        return;
      }
      if (rv === 0) { delete goal.hoursPerUnit; } else { goal.hoursPerUnit = rv; }
    }
    const goals = loadCustomGoals();
    const idx = goals.findIndex(g => g.id === goal.id);
    if (idx >= 0) {
      goals[idx] = goal;
      saveCustomGoals(goals);
    }
    updateCustomGoalCard(goal);
    renderProgressDashboard();
  });
}

function openNewGoalModal() {
  const modal = document.getElementById("new-goal-modal");
  if (modal) {
    modal.style.display = "flex";
    const nameInput = document.getElementById("goal-name");
    if (nameInput) nameInput.focus();
    SoundKit.pop();
  }
}

function closeNewGoalModal() {
  const modal = document.getElementById("new-goal-modal");
  if (modal) modal.style.display = "none";
  const form = document.getElementById("new-goal-form");
  if (form) form.reset();
}

function handleNewGoalSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("goal-name")?.value.trim();
  const total = parseFloat(document.getElementById("goal-total")?.value);
  const unit = document.getElementById("goal-unit")?.value;
  const deadline = document.getElementById("goal-deadline")?.value;
  const daily = parseFloat(document.getElementById("goal-daily")?.value);
  const obstacle = document.getElementById("goal-obstacle")?.value.trim();
  const counter = document.getElementById("goal-counter")?.value.trim();
  const rateRaw = document.getElementById("goal-rate")?.value.trim();

  if (!name || isNaN(total) || total < 1 || !deadline || isNaN(daily) || daily < 1) {
    notify("请填写完整的目标信息");
    return;
  }
  if (rateRaw) {
    const rv = parseFloat(rateRaw);
    if (isNaN(rv) || rv <= 0) {
      notify("每单位折算时长须为正数（小时）");
      return;
    }
  }

  const goal = {
    id: generateGoalId(),
    name,
    total,
    unit,
    deadline,
    daily,
    obstacle,
    counter,
    createdAt: Date.now()
  };
  if (rateRaw) goal.hoursPerUnit = parseFloat(rateRaw);

  const goals = loadCustomGoals();
  goals.push(goal);
  saveCustomGoals(goals);

  const grid = document.getElementById("metrics-grid");
  if (grid) {
    const temp = document.createElement("div");
    temp.innerHTML = createCustomGoalCardHTML(goal);
    const card = temp.firstElementChild;
    grid.appendChild(card);
    updateCustomGoalCard(goal);
    bindCustomGoalEvents(goal);
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  renderProgressDashboard();
  closeNewGoalModal();
}

function bindAllEvents() {
  // 习惯卡主按钮
  bindClick("vocabulary-btn", () => handleCheckin("vocabulary"));
  bindClick("listening-btn", () => handleCheckin("listening"));
  bindClick("sleep-btn", () => handleCheckin("sleep"));

  // 进度卡主按钮
  bindClick("cmc-btn", () => handleProgressCheckin("cmc"));
  bindClick("mock-exams-btn", () => handleProgressCheckin("mock-exams"));
  bindClick("advanced-math-btn", () => handleProgressCheckin("advanced-math"));
  bindClick("final-courses-btn", () => handleProgressCheckin("final-courses"));

  // 一键按建议量打卡（S1-1）
  bindClick("vocabulary-quick-btn", () => handleQuickCheckin("vocabulary"));
  bindClick("listening-quick-btn", () => handleQuickCheckin("listening"));
  bindClick("sleep-quick-btn", () => handleQuickCheckin("sleep"));
  bindClick("cmc-quick-btn", () => handleQuickCheckin("cmc"));
  bindClick("mock-exams-quick-btn", () => handleQuickCheckin("mock-exams"));
  bindClick("advanced-math-quick-btn", () => handleQuickCheckin("advanced-math"));
  bindClick("final-courses-quick-btn", () => handleQuickCheckin("final-courses"));

  // 补记切换
  ["vocabulary", "listening", "sleep", "cmc", "mock-exams", "advanced-math", "final-courses"].forEach(key => {
    bindClick(`${key}-makeup-toggle`, () => toggleMakeup(key));
  });

  // 补记提交
  bindClick("vocabulary-makeup-btn", () => handleMakeup("vocabulary"));
  bindClick("listening-makeup-btn", () => handleMakeup("listening"));
  bindClick("sleep-makeup-btn", () => handleMakeup("sleep"));
  bindClick("cmc-makeup-btn", () => handleProgressMakeup("cmc"));
  bindClick("mock-exams-makeup-btn", () => handleProgressMakeup("mock-exams"));
  bindClick("advanced-math-makeup-btn", () => handleProgressMakeup("advanced-math"));
  bindClick("final-courses-makeup-btn", () => handleProgressMakeup("final-courses"));

  // 调整计划
  bindClick("vocabulary-adjust-btn", () => openAdjustPlan("vocabulary"));
  bindClick("listening-adjust-btn", () => openAdjustPlan("listening"));
  bindClick("cmc-adjust-btn", () => openAdjustPlan("cmc"));
  bindClick("mock-exams-adjust-btn", () => openAdjustPlan("mock-exams"));
  bindClick("advanced-math-adjust-btn", () => openAdjustPlan("advanced-math"));
  bindClick("final-courses-adjust-btn", () => openAdjustPlan("final-courses"));

  // 输入框被用户修改后，不再自动覆盖
  ["vocabulary", "listening", "sleep", "cmc", "mock-exams", "advanced-math", "final-courses"].forEach(key => {
    const input = document.getElementById(`${key}-input`);
    if (input) {
      input.addEventListener("input", function() {
        this.dataset.userEdited = "true";
      });
    }
  });

  // 备份按钮
  bindClick("backup-export-btn", exportBackup);

  // 卡片系数与目标设置（批次15 R-2a）
  bindClick("coeff-settings-save-btn", handleSaveCoeffSettings);

  const importBtn = document.getElementById("backup-import-btn");
  const fileInput = document.getElementById("backup-file-input");
  if (importBtn && fileInput) {
    importBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importBackup(file);
      fileInput.value = "";
    });
  }

  // 新建学习目标弹窗（支持 Tab 1 和设置页两个按钮）
  document.querySelectorAll(".new-goal-btn").forEach(btn => {
    btn.addEventListener("click", openNewGoalModal);
  });
  bindClick("new-goal-btn-settings", openNewGoalModal);
  bindClick("modal-close-btn", closeNewGoalModal);
  bindClick("modal-cancel-btn", closeNewGoalModal);

  // 删除学习目标弹窗（S10-4）
  bindClick("delete-goal-btn-settings", openDeleteGoalModal);
  bindClick("delete-goal-close-btn", closeDeleteGoalModal);
  bindClick("delete-goal-cancel-btn", closeDeleteGoalModal);

  const deleteModal = document.getElementById("delete-goal-modal");
  if (deleteModal) {
    deleteModal.addEventListener("click", (e) => {
      if (e.target === deleteModal) closeDeleteGoalModal();
    });
  }

  // 清空数据
  bindClick("clear-data-btn", clearAllData);

  const modal = document.getElementById("new-goal-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeNewGoalModal();
    });
  }

  const goalForm = document.getElementById("new-goal-form");
  if (goalForm) {
    goalForm.addEventListener("submit", handleNewGoalSubmit);
  }

  // 绑定日卡事件（S4-1）
  bindDailyCardEvents();

  // 绑定 Ctrl+Z 撤销快捷键（S5-1）
  bindUndoShortcut();

  // 绑定 Command Palette（S8-1）
  bindCommandPalette();
  attachCmdPaletteHint();

  // 绑定数字键切 Tab（S8-2）
  bindTabNumberShortcut();

  // 绑定 Markdown 导出按钮（S8-3）
  bindClick("export-daily-md-btn", exportDailyCardsMarkdown);
  bindClick("export-weekly-md-btn", exportWeeklyReviewsMarkdown);
  bindClick("export-checkins-md-btn", exportCheckinsMarkdown);

  // 绑定音效系统（S9-1）
  bindSoundOnButtons();
  bindClick("sound-toggle-btn", handleSoundToggle);
  renderSoundToggle();

  // 绑定趋势图显隐开关（S10-5）
  bindClick("trend-toggle-btn", handleTrendToggle);
  applyTrendHiddenState();

  // 绑定所有已有自定义卡片的事件
  const customGoals = loadCustomGoals();
  customGoals.forEach(goal => bindCustomGoalEvents(goal));

  // 阶段切换抽屉
  bindClick("stage-switcher-btn", openStageDrawer);
  bindClick("stage-drawer-close", closeStageDrawer);
  const stageOverlay = document.getElementById("stage-drawer-overlay");
  if (stageOverlay) {
    stageOverlay.addEventListener("click", (e) => {
      if (e.target === stageOverlay) closeStageDrawer();
    });
  }
  const readonlyCb = document.getElementById("history-readonly-toggle");
  if (readonlyCb) {
    readonlyCb.addEventListener("change", (e) => {
      setHistoryReadonly(e.target.checked);
      applyViewModeClass();
      notify(e.target.checked ? "历史阶段将只读" : "历史阶段可编辑", "info");
    });
  }

  // 阶段回顾页（批次 4）
  bindStageReviewEvents();

  // 全局累计统计页（批次 5）
  bindGlobalStatsEvents();

  // 日历视图（批次17 R-5a）
  bindCalendarEvents();

  // 批次 10：主题切换 + 热力图气泡
  bindClick("theme-toggle-btn", handleThemeToggle);
  bindHeatmapTooltip();

  // 批次 16：主题选择弹窗
  bindThemeModalEvents();

  // 批次 12：CSV 导出
  bindClick("export-daily-csv-btn", exportDailyCardsCSV);
  bindClick("export-weekly-csv-btn", exportWeeklyReviewsCSV);
  bindClick("export-checkins-csv-btn", exportCheckinsCSV);

  // 批次 13：自定义命令
  bindClick("manage-cmd-btn", openManageCmdModal);
  bindClick("io-open-btn", openIoPage);
  bindClick("io-close-btn", closeIoPage);
  bindClick("io-back-btn", closeIoPage);
  bindClick("more-open-btn", openMoreFeaturesPage);
  bindClick("more-close-btn", closeMoreFeaturesPage);
  bindClick("more-back-btn", closeMoreFeaturesPage);
  bindClick("coeff-open-btn", openCoeffPage);
  bindClick("coeff-close-btn", closeCoeffPage);
  bindClick("coeff-back-btn", closeCoeffPage);
  bindClick("manage-cmd-close-btn", closeManageCmdModal);
  const manageModal = document.getElementById("manage-cmd-modal");
  if (manageModal) {
    manageModal.addEventListener("click", (e) => {
      if (e.target === manageModal) closeManageCmdModal();
    });
  }
  bindClick("cmd-add-btn", handleAddCmdSubmit);
}


// ==================== ESM 导出（批次20） ====================
export {
  bindAllEvents, openNewGoalModal, refreshMakeupDateOptions, renderAllCustomGoals, updateCustomGoalCard
};
