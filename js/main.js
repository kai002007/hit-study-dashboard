// ==================== js/main.js ====================
// v2.0 ESM 整切单入口（批次20）：依赖序静态 import + init 守卫（批次12 铁律：守卫永不前移）
import { STAGES } from "./config.js";
import { loadSettings, migrateData } from "./storage.js";
import { applyTrendHiddenState, formatDateISO, renderSoundToggle, startTimePhaseTimer } from "./ui/base.js";
import { loadVersionInfo, renderAboutCard, renderBackupReminder, renderVersionStamp } from "./ui/version.js";
import { applyViewModeClass, getCurrentStage, renderHistoryReadonlyToggle, renderStageDrawerList } from "./ui/stage.js";
import { bindModuleListToggle, renderCoeffSettings, renderQuotas } from "./ui/checkin.js";
import { scrollDashboardChartsToRight } from "./ui/charts.js";
import { bindWeeklyReviewEvents } from "./ui/weekly.js";
import { updateAllCards } from "./ui/today.js";
import { bindAllEvents, renderAllCustomGoals } from "./ui/goals.js";
import { renderStageReviewPage } from "./ui/review.js";
import { renderGlobalStatsPage } from "./ui/global-stats.js";
import { applySkin, applyTheme, renderThemeToggle } from "./ui/settings.js";

// ==================== 14. 初始化 ====================

function initDashboard() {
  migrateData();
  console.log("[Dashboard] initDashboard 开始执行");
  loadSettings();
  const stageInfo = getCurrentStage(new Date());
  console.log("[Dashboard] 当前阶段信息：", stageInfo);

  if (!stageInfo.main) {
    console.warn("[Dashboard] 未匹配到当前阶段，使用兜底展示");
    const header = document.querySelector(".stage-header");
    if (header) {
      header.innerHTML = `
        <div class="stage-badge">
          <span class="stage-main">未知阶段</span>
        </div>
        <h1 class="stage-title">当前日期不在任何已定义阶段内</h1>
        <p class="stage-meta">请检查系统时间或 STAGES 表 · 当前日期 ${formatDateISO(new Date())}</p>
      `;
    }
  } else {
    renderQuotas(stageInfo);
  }

  bindAllEvents();
  bindWeeklyReviewEvents();
  bindModuleListToggle();
  renderAllCustomGoals();
  updateAllCards();
  renderBackupReminder();
  renderCoeffSettings();
  renderSoundToggle();
  applyTrendHiddenState();
  renderVersionStamp();
  renderAboutCard();
  loadVersionInfo();
  renderHistoryReadonlyToggle();
  renderStageDrawerList();
  applyViewModeClass();
  renderStageReviewPage();
  renderGlobalStatsPage();

  // 批次 10：应用保存的主题 + 更新主题切换卡片文案
  applyTheme();
  // 批次 24：应用保存的界面形态（classic 时移除 data-skin，经典形态零污染）
  applySkin();
  renderThemeToggle();

  // 批次 C：启动时间色温
  startTimePhaseTimer();

  console.log("[Dashboard] 初始化完成");
}

// init 守卫已移至文件末尾（批次12 TDZ专项；拆分方案§4.2③：守卫永远留在最后一个 script 的文件末尾）


// ==================== 17. App Tab 导航 ====================

(function initAppTabs() {
  function switchTab(tabId) {
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === "tab-" + tabId);
    });
    document.querySelectorAll(".nav-item").forEach(function (item) {
      item.classList.toggle("active", item.dataset.tab === tabId);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });

    // 切到进度看板时，让图表滚到最右
    if (tabId === "progress" && typeof scrollDashboardChartsToRight === "function") {
      setTimeout(scrollDashboardChartsToRight, 50);
    }
  }

  function bindNavItems() {
    document.querySelectorAll(".nav-item").forEach(function (item) {
      item.addEventListener("click", function () {
        switchTab(item.dataset.tab);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindNavItems();
      switchTab("today");
    });
  } else {
    bindNavItems();
    switchTab("today");
  }
})();


// ==================== 25. init 守卫（批次12 自 4072 区移至本文件末尾，永不前移） ====================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}
