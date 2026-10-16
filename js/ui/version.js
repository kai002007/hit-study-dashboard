// ==================== js/ui/version.js ====================
// 批次20（ESM-b）自 script.js 整切：版本信息域（VERSION_INFO/新版本检测/关于卡/备份提醒）。函数体逐字节不变。
import { CURRENT_SCHEMA_VERSION, exportBackup, getLastBackupAt, getLastBackupRemindAt, setLastBackupRemindAt } from "../storage.js";
import { bindClick, notify, showToast } from "./base.js";

// ==================== 1. 数据常量（由 CSV 转写） ====================

// 配置常量已迁移至 js/config.js（批次7）

// 配置常量已迁移至 js/config.js（批次7）

// ==================== 2. 指标配置（9张卡） ====================

// 配置常量已迁移至 js/config.js（批次7）

// ==================== 3. localStorage 数据层 ====================

// 已迁移至 js/storage.js（批次8）

let VERSION_INFO = null;

function loadVersionInfo() {
  if (typeof fetch !== "function") return;
  fetch("version.json", { cache: "no-cache" })
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(data => {
      if (!data || typeof data !== "object") return;
      VERSION_INFO = {
        workbench: data.workbench || "未知",
        buildDate: data.buildDate || "未知",
        buildBatch: data.buildBatch || "未知",
        cacheVersion: data.cacheVersion || "未知",
        configVersions: data.configVersions || "未知",
        configSyncDate: data.configSyncDate || "未知"
      };
      // 重新渲染两处 UI
      renderVersionStamp();
      renderAboutCard();
      // 批次 H：检测是否有新版本已部署（对比 version.json 与本地 SW 缓存版本）
      if (data.cacheVersion) checkNewVersionDeployed(data.cacheVersion);
    })
    .catch(err => {
      console.warn("[Version] 读取 version.json 失败，版本信息不可用", err);
    });
}

// ==================== 25. 新版本检测（批次 H） ====================

function checkNewVersionDeployed(serverCacheVersion) {
  if (VERSION_INFO === null) return;
  // 1. 环境检查：file:// 或旧浏览器无 caches API → 直接跳过
  if (typeof caches === "undefined" || !caches.keys) return;

  // 2. 解析服务器端版本号："v11" → 11
  const serverNum = parseInt(String(serverCacheVersion).replace(/\D/g, ""), 10);
  if (isNaN(serverNum) || serverNum <= 0) return;

  // 3. 读取本地已激活的 SW 缓存名，找最大版本号
  caches.keys().then(keys => {
    let maxLocalNum = 0;
    keys.forEach(k => {
      const m = k.match(/study-dashboard-v(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > maxLocalNum) maxLocalNum = n;
      }
    });

    // 4. 本地没缓存（首次访问）→ 不弹
    if (maxLocalNum === 0) return;

    // 5. 服务器版本 > 本地版本 → 有新版本
    if (serverNum > maxLocalNum) {
      showNewVersionToast(maxLocalNum, serverNum);
    }
  }).catch(() => { /* 静默失败 */ });
}

function showNewVersionToast(localNum, serverNum) {
  // 同一会话只弹一次（用 sessionStorage 记录，关闭标签页后重置）
  try {
    if (sessionStorage.getItem("version_toast_shown") === "1") return;
    sessionStorage.setItem("version_toast_shown", "1");
  } catch (e) { /* sessionStorage 不可用时忽略 */ }

  // 复用已有 showToast，duration 15 秒（给用户时间点"刷新"）
  showToast(
    `检测到新版本 v${serverNum} 已部署（当前 v${localNum}）`,
    "info",
    15000,
    {
      label: "刷新",
      handler: () => {
        // 尝试更新 SW 注册，再刷新页面
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
          navigator.serviceWorker.getRegistration().then(reg => {
            if (reg && reg.update) {
              reg.update().catch(() => {});
            }
            setTimeout(() => window.location.reload(), 300);
          }).catch(() => {
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
      }
    }
  );
}

function renderVersionStamp() {
  const footer = document.querySelector(".sidebar-footer");
  if (!footer) return;
  if (VERSION_INFO === null) {
    footer.innerHTML = `<span class="sidebar-footer-brand">学习目标管理台 版本信息不可用</span>`;
    return;
  }

  footer.innerHTML = `
    <span class="sidebar-footer-brand">学习目标管理台 ${VERSION_INFO.workbench}</span>
    <span class="sidebar-footer-meta">基于 ${VERSION_INFO.configVersions} · 同步于 ${VERSION_INFO.configSyncDate} · 构建 ${VERSION_INFO.buildDate}</span>
  `;
}

function renderAboutCard() {
  const el = document.getElementById("about-workbench-card");
  if (!el) return;
  if (VERSION_INFO === null) {
    el.innerHTML = `<ul class="about-list"><li class="about-row"><span class="about-label">版本信息</span><span class="about-value">版本信息不可用</span></li></ul>`;
    return;
  }

  const rows = [
    { label: "工作台版本", value: VERSION_INFO.workbench },
    { label: "构建日期", value: VERSION_INFO.buildDate },
    { label: "构建批次", value: VERSION_INFO.buildBatch },
    { label: "数据 schema", value: "v" + CURRENT_SCHEMA_VERSION },
    { label: "PWA 缓存", value: VERSION_INFO.cacheVersion },
    { label: "根基文件", value: VERSION_INFO.configVersions },
    { label: "文件同步日", value: VERSION_INFO.configSyncDate }
  ];

  el.innerHTML = `
    <ul class="about-list">
      ${rows.map(r => `
        <li class="about-row">
          <span class="about-label">${r.label}</span>
          <span class="about-value">${r.value}</span>
        </li>
      `).join("")}
    </ul>
  `;
}

// 已迁移至 js/storage.js（批次8）

// 已迁移至 js/storage.js（批次8）

function renderBackupReminder() {
  const wrapper = document.getElementById("backup-reminder-wrapper");
  if (!wrapper) return;

  const lastAt = getLastBackupAt();
  let isWarning = false;

  if (lastAt === null) {
    isWarning = true;
    wrapper.innerHTML = `
      <div class="backup-reminder backup-reminder-warning">
        <span class="backup-reminder-text">尚未备份过 · 建议每周日晚周检时导出一次</span>
        <button class="backup-reminder-btn" id="backup-reminder-btn">立即备份</button>
      </div>
    `;
  } else {
    const daysAgo = Math.floor((Date.now() - lastAt) / (1000 * 60 * 60 * 24));
    isWarning = daysAgo > 7;
    const cls = isWarning ? "backup-reminder-warning" : "backup-reminder-ok";
    wrapper.innerHTML = `
      <div class="backup-reminder ${cls}">
        <span class="backup-reminder-text">距上次备份 ${daysAgo} 天${isWarning ? " · 建议尽快导出一次" : ""}</span>
        <button class="backup-reminder-btn" id="backup-reminder-btn">立即备份</button>
      </div>
    `;
  }

  bindClick("backup-reminder-btn", () => {
    exportBackup();
    renderBackupReminder();
  });

  // 每天最多主动提醒一次
  if (isWarning) {
    const lastRemindAt = getLastBackupRemindAt();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartTs = todayStart.getTime();

    if (lastRemindAt === null || lastRemindAt < todayStartTs) {
      setLastBackupRemindAt(Date.now());
      setTimeout(() => {
        notify("距上次备份已超过 7 天，建议现在导出一次", "warning");
      }, 800);
    }
  }
}

// 已迁移至 js/storage.js（批次8）


// ==================== ESM 导出（批次20） ====================
export {
  loadVersionInfo, renderAboutCard, renderBackupReminder, renderVersionStamp
};
