#!/usr/bin/env node
// 批次 6.5 版本号根治 预部署校验（Node 单文件、零依赖、同步 fs）
// 放在项目根目录（与 index.html / js/main.js / service-worker.js / version.json 同级）
// 运行方式：node predeploy-check.js
// 任一项 ✗ → process.exit(1)

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const FILES = {
  sw: path.join(ROOT, "service-worker.js"),
  vjson: path.join(ROOT, "version.json"),
  html: path.join(ROOT, "index.html")
};

// 批次20（ESM-b）：script.js 已整切为 js/main.js + js/ui/*.js，②④ 改扫运行时全集
const RUNTIME_JS = ["js/config.js", "js/storage.js", "js/aggregation.js", "js/main.js"];
try {
  fs.readdirSync(path.join(ROOT, "js", "ui")).forEach(function (f) {
    if (f.endsWith(".js")) RUNTIME_JS.push("js/ui/" + f);
  });
} catch (e) { /* ui 目录缺失时仅四件 */ }

let failures = 0;

function ok(label, detail) {
  const suffix = detail ? `（${detail}）` : "";
  console.log(`✓ ${label}${suffix}`);
}

function bad(label, detail) {
  const suffix = detail ? `（${detail}）` : "";
  console.error(`✗ ${label}${suffix}`);
  failures++;
}

function readText(filePath) {
  try {
    return { ok: true, text: fs.readFileSync(filePath, "utf8") };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const swFile = readText(FILES.sw);
const vjsonFile = readText(FILES.vjson);
const htmlFile = readText(FILES.html);

// ① service-worker.js 的 study-dashboard-v(\d+) 数字 == version.json 的 cacheVersion 数字
if (!swFile.ok) {
  bad("① service-worker.js 读取失败", swFile.error);
} else if (!vjsonFile.ok) {
  bad("① version.json 读取失败", vjsonFile.error);
} else {
  const swMatch = swFile.text.match(/study-dashboard-v(\d+)/);
  let vjsonData = null;
  let vjsonErr = null;
  try {
    vjsonData = JSON.parse(vjsonFile.text);
  } catch (e) {
    vjsonErr = e.message;
  }
  if (!swMatch) {
    bad("① service-worker.js 缺少 study-dashboard-v(\\d+) 形式的缓存名");
  } else if (vjsonErr) {
    bad("① version.json 解析失败", vjsonErr);
  } else if (!vjsonData || typeof vjsonData.cacheVersion !== "string") {
    bad("① version.json 缺少 cacheVersion 字符串字段");
  } else {
    const vjsonMatch = vjsonData.cacheVersion.match(/v(\d+)/);
    if (!vjsonMatch) {
      bad("① version.json cacheVersion 缺少 v(\\d+) 形式", vjsonData.cacheVersion);
    } else {
      const swNum = parseInt(swMatch[1], 10);
      const vjsonNum = parseInt(vjsonMatch[1], 10);
      if (swNum === vjsonNum) {
        ok("① SW 缓存版本号 == version.json cacheVersion", `v${swNum}`);
      } else {
        bad(
          "① SW 缓存版本号 != version.json cacheVersion",
          `sw v${swNum} vs version.json v${vjsonNum}`
        );
      }
    }
  }
}

// ② 运行时代码不含 cacheVersion 字面量（"v10"/"v11" 等）、不含 WORKBENCH_BUILD_BATCH 赋值
let runtimeBadFiles = [];
for (const rel of RUNTIME_JS) {
  const fp = path.join(ROOT, rel);
  const r = readText(fp);
  if (!r.ok) { runtimeBadFiles.push(rel + "(read-fail)"); continue; }
  const cacheVerLiteral = /cacheVersion\s*[:=]\s*["']v\d+["']/;
  if (cacheVerLiteral.test(r.text)) runtimeBadFiles.push(rel + "(cacheVersion)");
  if (/WORKBENCH_BUILD_BATCH\s*=/.test(r.text)) runtimeBadFiles.push(rel + "(WORKBENCH_BUILD_BATCH)");
}
if (runtimeBadFiles.length > 0) {
  bad("② 运行时代码含 cacheVersion 字面量或 WORKBENCH_BUILD_BATCH 赋值", runtimeBadFiles.join(", "));
} else {
  ok("② 运行时代码不含 cacheVersion 字面量 / WORKBENCH_BUILD_BATCH 赋值", RUNTIME_JS.length + " 个文件");
}

// ③ index.html 整切单入口锚点
if (!htmlFile.ok) {
  bad("③ index.html 读取失败", htmlFile.error);
} else {
  if (htmlFile.text.indexOf('src="js/main.js"') === -1) {
    bad("③ index.html 缺整切单入口 main.js");
  } else {
    ok("③ index.html 含整切单入口 main.js");
  }
  if (htmlFile.text.indexOf('src="script.js"') !== -1) {
    bad("③ index.html 仍含 script.js 经典脚本残留");
  } else {
    ok("③ index.html 不含 script.js 经典脚本残留");
  }
  if (/script\.js\?v=/.test(htmlFile.text)) {
    bad("③ index.html 仍含 script.js?v= 缓存破坏查询串");
  } else {
    ok("③ index.html 不含 script.js?v= 缓存破坏查询串");
  }
}

// ④ 运行时代码备份包不再硬编码 version: 3
let runtimeV3Files = [];
for (const rel of RUNTIME_JS) {
  const fp = path.join(ROOT, rel);
  const r = readText(fp);
  if (!r.ok) continue;
  if (/version:\s*3\b/.test(r.text)) runtimeV3Files.push(rel);
}
if (runtimeV3Files.length > 0) {
  bad("④ 运行时代码备份包仍硬编码 version: 3", runtimeV3Files.join(", "));
} else {
  ok("④ 运行时代码备份包已改为 CURRENT_SCHEMA_VERSION", RUNTIME_JS.length + " 个文件");
}

// ⑤ service-worker.js CORE_ASSETS 清单内文件全部存在于磁盘
if (!swFile.ok) {
  bad("⑤ service-worker.js 读取失败", swFile.error);
} else {
  const assetsMatch = swFile.text.match(/CORE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
  if (!assetsMatch) {
    bad("⑤ 未能解析 CORE_ASSETS 清单");
  } else {
    const assets = assetsMatch[1].match(/"([^"]+)"/g) || [];
    let missing = 0;
    assets.forEach(a => {
      const rel = a.replace(/^"/, "").replace(/"$/, "");
      if (rel === "./") return;
      const p = path.join(ROOT, rel.replace(/^\.\//, ""));
      if (!fs.existsSync(p)) {
        bad("⑤ CORE_ASSETS 文件缺失", rel);
        missing++;
      }
    });
    if (missing === 0) ok("⑤ CORE_ASSETS 清单内文件全部存在", assets.length + " 项");
  }
}

if (failures > 0) {
  console.error(`\n预部署校验失败：${failures} 项 ✗`);
  process.exit(1);
} else {
  console.log("\n预部署校验全部通过 ✓");
}
