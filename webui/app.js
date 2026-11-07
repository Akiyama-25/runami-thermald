// Runami Thermald - WebUI 交互、流体动效与硬件状态控制引擎
// 作者: 迷人の爱音 · 纯净实机质感重构

const DAEMON_CLI = "sh /data/adb/modules/runami_thermald/bin/runami_ctl";
let currentTab = "dashboard";
let currentProfile = "screen_on_game";
let appConfig = null;
let userApps = [];
let lastBoardTemp = 38;
let displayBoardTemp = 38;
let lastWatts = 0;
let displayWatts = 0;
let _cmdSeq = 0;

// Android 常用应用与知名手游中文友好识别字典
const APP_NAMES = {
  "com.miHoYo.Yuanshen": "原神",
  "com.miHoYo.hkrpg": "崩坏：星穹铁道",
  "com.miHoYo.Nap": "绝区零",
  "com.miHoYo.bh3.bilibili": "崩坏3",
  "com.miHoYo.enterprise.NGHSoD": "崩坏3",
  "com.tencent.tmgp.sgame": "王者荣耀",
  "com.tencent.tmgp.pubgmhd": "和平精英",
  "com.tencent.tmgp.cod": "使命召唤手游",
  "com.tencent.tmgp.cf": "穿越火线：枪战王者",
  "com.tencent.tmgp.speedmobile": "QQ飞车手游",
  "com.tencent.tmgp.dwrg": "第五人格",
  "com.tencent.lolm": "英雄联盟手游",
  "com.tencent.tmgp.tft": "金铲铲之战",
  "com.tencent.tmgp.hyrz": "火影忍者手游",
  "com.hypergryph.arknights": "明日方舟",
  "com.hypergryph.arknights.bilibili": "明日方舟 (B服)",
  "com.kurogame.kjz.aligames": "鸣潮",
  "com.kurogame.haru.aligames": "战双帕弥什",
  "com.bilibili.azurlane": "碧蓝航线",
  "com.bilibili.fatego": "Fate/Grand Order",
  "com.netease.yys": "阴阳师",
  "com.netease.party": "蛋仔派对",
  "com.netease.mrzh": "明日之后",
  "com.netease.nshm": "逆水寒手游",
  "com.moonton.mobilehero": "决胜巅峰",
  "com.papegames.lysk.cn": "恋与深空",
  "com.netease.sky": "光·遇",
  "com.mojang.minecraftpe": "我的世界 (Minecraft)",
  "com.roblox.client": "Roblox",
  "com.google.android.inputmethod.latin": "Gboard 谷歌输入法",
  "com.miui.home": "HyperOS 系统桌面",
  "com.android.launcher": "原生系统桌面",
  "com.android.systemui": "Android 系统界面",
  "com.tencent.mm": "微信",
  "com.tencent.mobileqq": "QQ",
  "com.netease.cloudmusic": "网易云音乐",
  "com.coolapk.market": "酷安",
  "com.omarea.vtools": "Scene 性能工具",
  "io.github.a13e300.ksu": "KernelSU 管理器",
  "me.bmax.apatch": "APatch 管理器"
};

// 1. KernelSU / APatch 异步非阻塞执行桥接
function ksuExec(cmd) {
  return new Promise((resolve) => {
    if (typeof window.ksu !== "undefined") {
      const cbName = `__ksu_cb_${Date.now()}_${_cmdSeq++}`;
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          delete window[cbName];
          try {
            const out = window.ksu.exec(cmd);
            if (typeof out === "string") {
              resolve({ code: 0, stdout: out, stderr: "" });
              return;
            }
          } catch (_) {}
          resolve({ code: -1, stdout: "", stderr: "Timeout" });
        }
      }, 4000);

      window[cbName] = (code, stdout, stderr) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          delete window[cbName];
          resolve({
            code: typeof code === "number" ? code : 0,
            stdout: stdout ?? "",
            stderr: stderr ?? ""
          });
        }
      };

      try {
        window.ksu.exec(cmd, "{}", cbName);
      } catch (e1) {
        try {
          window.ksu.exec(cmd, cbName);
        } catch (e2) {
          try {
            const out = window.ksu.exec(cmd);
            resolved = true;
            clearTimeout(timer);
            delete window[cbName];
            resolve({ code: 0, stdout: typeof out === "string" ? out : "", stderr: "" });
          } catch (e3) {
            resolved = true;
            clearTimeout(timer);
            delete window[cbName];
            resolve({ code: -1, stdout: "", stderr: String(e3) });
          }
        }
      }
      return;
    }

    // 浏览器开发者模拟调试环境
    console.log("[Dev Preview] Executing:", cmd);
    setTimeout(() => {
      if (cmd.includes("status-json")) {
        resolve({
          code: 0,
          stdout: JSON.stringify({
            running: true,
            device: "houji (Xiaomi 14)",
            activeProfile: "screen_on_game",
            activeProfileName: "电竞游戏模式",
            statusTitle: "游戏模式",
            currentWall: "52°C",
            coresLocked: true,
            topApp: "com.miHoYo.Yuanshen",
            isGame: true,
            gameSource: "custom",
            temps: { board: 41.5, battery: 35 },
            power: { charging: true, watts: 42, xmGear: 6, xmRemove: 1 },
            screenOn: true,
            cpus: { policy0: 1785, policy2: 2476, policy5: 2476, policy7: 3187, gpu: 770 },
            customGamesCount: 0,
            sceneGamesCount: 0
          }),
          stderr: ""
        });
      } else if (cmd.includes("get-config")) {
        resolve({
          code: 0,
          stdout: JSON.stringify({
            version: 1,
            enabled: true,
            device: "houji",
            profiles: {
              screen_on_game: { name: "游戏模式", thermal_wall: 52, clear_hysteresis: 3, charge_power_limit: 18, lock_cores_online: true },
              screen_on_daily: { name: "日常亮屏", thermal_wall: 46, clear_hysteresis: 2, charge_power_limit: 33, lock_cores_online: true },
              screen_on_charge: { name: "亮屏充电", thermal_wall: 44, clear_hysteresis: 2, charge_power_limit: 33, lock_cores_online: true },
              screen_off_charge: { name: "熄屏快充", thermal_wall: 45, clear_hysteresis: 2, charge_power_limit: 90, lock_cores_online: true },
              screen_off_idle: { name: "熄屏休眠", thermal_wall: 42, clear_hysteresis: 2, charge_power_limit: 18, lock_cores_online: false }
            },
            charge_control: { enabled: true, target_watts: 45, battery_protect_temp: 46 },
            custom_games: []
          }),
          stderr: ""
        });
      } else if (cmd.includes("list-user-apps")) {
        resolve({
          code: 0,
          stdout: [
            "com.miHoYo.Yuanshen",
            "com.miHoYo.hkrpg",
            "com.miHoYo.Nap",
            "com.tencent.tmgp.sgame",
            "com.tencent.tmgp.pubgmhd",
            "com.hypergryph.arknights",
            "com.kurogame.kjz.aligames",
            "com.coolapk.market",
            "com.netease.cloudmusic",
            "com.omarea.vtools",
            "com.google.android.inputmethod.latin"
          ].join("\n"),
          stderr: ""
        });
      } else if (cmd.includes("export-log")) {
        resolve({
          code: 0,
          stdout: "/sdcard/Download/runami_thermald_20261106_114500.log",
          stderr: ""
        });
      } else if (cmd.includes("log-full") || cmd.includes("log")) {
        resolve({
          code: 0,
          stdout: `[11-06 11:30:00] Runami Thermald 守护进程启动 (PID: 1234)...
[11-06 11:30:00] [屏幕状态] 初始检测: 亮屏
[11-06 11:30:01] [状态流转] [日常亮屏均衡] 日常温度墙 (46°C) | 目标温度墙: 46°C | 板温: 36°C, 电池: 32°C | 功率: 0W | 核心锁定: 是
[11-06 11:30:15] [前台应用] 切换至: com.miHoYo.Yuanshen (电竞游戏, 来源: 自定义)
[11-06 11:30:15] [状态流转] [电竞游戏模式] 游戏独立温度墙 (52°C) | 目标温度墙: 52°C | 板温: 37°C, 电池: 33°C | 功率: 0W | 核心锁定: 是
[11-06 11:32:40] [充电状态] 充电器接入 (状态: Charging, 功率: 42W)
[11-06 11:35:10] [前台应用] 退回系统桌面或待机
[11-06 11:35:20] [屏幕状态] 屏幕关闭 (熄屏/休眠/AOD)
[11-06 11:35:20] [状态流转] [熄屏快充模式] 熄屏快充 (45°C / 90W) | 目标温度墙: 45°C | 板温: 39°C, 电池: 35°C | 功率: 45W | 核心锁定: 是`,
          stderr: ""
        });
      } else {
        resolve({ code: 0, stdout: "Mock success", stderr: "" });
      }
    }, 60);
  });
}

// 2. 动态莫奈取色初始化 (主动加载 KernelSU /internal/colors.css)
async function initDynamicColors() {
  try {
    const res = await fetch("/internal/colors.css", { cache: "no-store" });
    if (res.ok) {
      const css = await res.text();
      if (css && css.trim().length > 0) {
        let tag = document.getElementById("m3e-monet-style");
        if (!tag) {
          tag = document.createElement("style");
          tag.id = "m3e-monet-style";
          document.head.appendChild(tag);
        }
        tag.textContent = css;
      }
    }
  } catch (_) {}
}

// 3. 浮动 Toast 提示
let snackTimer = null;
function showToast(msg) {
  const el = document.getElementById("m3e-snackbar");
  if (!el) return;
  const textEl = el.querySelector(".m3e-snackbar-text");
  if (textEl) textEl.innerText = msg;
  else el.innerText = msg;
  
  el.classList.add("show");
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2200);
}

// 4. 平滑药丸滑块位置更新
const TAB_ORDER = ["dashboard", "profiles", "charging", "games", "logs"];

function updateNavIndicator() {
  const activeBtn = document.querySelector(".nav-group .m3e-connected-btn.active");
  const indicator = document.getElementById("nav-indicator");
  if (!activeBtn || !indicator) return;

  const left = activeBtn.offsetLeft;
  const width = activeBtn.offsetWidth;
  indicator.style.transform = `translateX(${left}px)`;
  indicator.style.width = `${width}px`;
}

// 5. 选项卡切换处理
document.querySelectorAll(".nav-group .m3e-connected-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetTab = btn.getAttribute("data-tab");
    if (targetTab === currentTab) return;

    const oldIndex = TAB_ORDER.indexOf(currentTab);
    const newIndex = TAB_ORDER.indexOf(targetTab);
    const slideDirection = newIndex > oldIndex ? "slide-left" : "slide-right";

    document.querySelectorAll(".nav-group .m3e-connected-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    updateNavIndicator();

    document.querySelectorAll(".m3e-tab-content").forEach((tab) => {
      tab.classList.remove("active", "slide-left", "slide-right");
    });
    const nextTab = document.getElementById(`tab-${targetTab}`);
    if (nextTab) {
      nextTab.classList.add("active", slideDirection);
    }

    currentTab = targetTab;

    if (currentTab === "logs") {
      fetchLogs();
    } else if (currentTab === "games") {
      fetchUserApps();
      fetchSceneGames();
      renderCustomGames();
    }
  });
});

window.addEventListener("resize", () => {
  updateNavIndicator();
  resizeCanvas();
});

// 6. 从设备端读取持久化配置并初始化 UI
async function loadConfig() {
  const res = await ksuExec(`${DAEMON_CLI} get-config`);
  if (res.code === 0 && res.stdout) {
    try {
      appConfig = JSON.parse(res.stdout);
      if (!appConfig.custom_games) {
        appConfig.custom_games = [
          "com.miHoYo.Yuanshen",
          "com.miHoYo.hkrpg",
          "com.miHoYo.Nap",
          "com.tencent.tmgp.sgame",
          "com.tencent.tmgp.pubgmhd"
        ];
      }
      updateProfileEditor();
      renderCustomGames();

      const chgSwitch = document.getElementById("charge-control-switch");
      if (chgSwitch && appConfig.charge_control) {
        chgSwitch.checked = appConfig.charge_control.enabled !== false;
      }

      if (appConfig.charge_control && appConfig.charge_control.target_watts) {
        const w = appConfig.charge_control.target_watts;
        document.querySelectorAll(".wattage-group button").forEach((btn) => {
          btn.classList.toggle("active", btn.getAttribute("data-watts") == w);
        });
      }
    } catch (e) {
      console.warn("解析配置失败", e);
    }
  }
}

// 7. 保存并持久化配置到磁盘
async function saveConfigToDevice(tipMsg = "配置已保存") {
  if (!appConfig) return;
  try {
    const jsonStr = JSON.stringify(appConfig, null, 2);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    const res = await ksuExec(`${DAEMON_CLI} save-config ${b64}`);
    if (res.code === 0) {
      showToast(tipMsg);
    } else {
      showToast("保存失败: " + (res.stderr || "未知错误"));
    }
  } catch (err) {
    showToast("保存异常: " + err.message);
  }
}

// 8. 温度墙子方案切换
document.querySelectorAll(".profile-select-group .m3e-profile-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".profile-select-group .m3e-profile-pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentProfile = btn.getAttribute("data-profile");
    updateProfileEditor();
  });
});

// 9. 滑块微交互 (带动态高对比度轨道填充)
function setupSliderWithBubble(sliderId, displayId, bubbleId, unit = "°C") {
  const slider = document.getElementById(sliderId);
  const display = document.getElementById(displayId);
  const bubble = document.getElementById(bubbleId);
  if (!slider || !display || !bubble) return;

  function updateBubble() {
    const val = parseFloat(slider.value) || 0;
    display.innerText = `${val} ${unit}`;
    bubble.innerText = `${val}${unit}`;

    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const percent = Math.max(0, Math.min(1, (val - min) / (max - min)));
    const percentPct = percent * 100;
    slider.style.setProperty("--slider-pct", `${percentPct}%`);
    bubble.style.left = `${percentPct}%`;
  }

  slider.addEventListener("input", updateBubble);
  slider.addEventListener("change", updateBubble);
  slider.addEventListener("pointerdown", () => {
    updateBubble();
    bubble.classList.add("visible");
  });
  slider.addEventListener("pointerup", () => bubble.classList.remove("visible"));
  slider.addEventListener("pointercancel", () => bubble.classList.remove("visible"));
  slider.addEventListener("blur", () => bubble.classList.remove("visible"));
  updateBubble();
}

setupSliderWithBubble("profile-trip-slider", "profile-trip-display", "profile-trip-bubble", "°C");
setupSliderWithBubble("profile-hysteresis-slider", "profile-hysteresis-display", "profile-hysteresis-bubble", "°C");

// 10. 更新温度墙编辑器表单
function updateProfileEditor() {
  const tripSlider = document.getElementById("profile-trip-slider");
  const tripDisplay = document.getElementById("profile-trip-display");
  const hystSlider = document.getElementById("profile-hysteresis-slider");
  const hystDisplay = document.getElementById("profile-hysteresis-display");
  const lockCores = document.getElementById("profile-lock-cores");

  let tripVal = 48;
  let hystVal = 2;
  let lockVal = true;

  if (appConfig && appConfig.profiles && appConfig.profiles[currentProfile]) {
    const p = appConfig.profiles[currentProfile];
    tripVal = p.thermal_wall || 48;
    hystVal = p.clear_hysteresis || 2;
    lockVal = p.lock_cores_online !== false;
  } else {
    const presets = {
      screen_on_game: { trip: 52, hyst: 3, lock: true },
      screen_on_daily: { trip: 46, hyst: 2, lock: true },
      screen_on_charge: { trip: 44, hyst: 2, lock: true },
      screen_off_charge: { trip: 45, hyst: 2, lock: true },
      screen_off_idle: { trip: 42, hyst: 2, lock: false }
    };
    const val = presets[currentProfile] || { trip: 48, hyst: 2, lock: true };
    tripVal = val.trip;
    hystVal = val.hyst;
    lockVal = val.lock;
  }

  if (tripSlider) {
    tripSlider.value = tripVal;
    tripSlider.dispatchEvent(new Event("input"));
  }
  if (tripDisplay) tripDisplay.innerText = `${tripVal} °C`;
  if (hystSlider) {
    hystSlider.value = hystVal;
    hystSlider.dispatchEvent(new Event("input"));
  }
  if (hystDisplay) hystDisplay.innerText = `${hystVal} °C`;
  if (lockCores) lockCores.checked = lockVal;

  const activePill = document.querySelector(`.profile-select-group [data-profile="${currentProfile}"] .m3e-pill-temp`);
  if (activePill) activePill.innerText = `${tripVal}°C`;
}

// 11. 保存温度墙方案按钮绑定
document.getElementById("btn-save-profile")?.addEventListener("click", async () => {
  if (!appConfig) appConfig = {};
  if (!appConfig.profiles) appConfig.profiles = {};
  if (!appConfig.profiles[currentProfile]) appConfig.profiles[currentProfile] = {};

  const tripSlider = document.getElementById("profile-trip-slider");
  const hystSlider = document.getElementById("profile-hysteresis-slider");
  const lockCores = document.getElementById("profile-lock-cores");

  const p = appConfig.profiles[currentProfile];
  p.thermal_wall = parseInt(tripSlider.value, 10);
  p.clear_hysteresis = parseInt(hystSlider.value, 10);
  if (lockCores) {
    p.lock_cores_online = lockCores.checked;
  }

  const names = {
    screen_on_game: "游戏模式",
    screen_on_daily: "日常亮屏",
    screen_on_charge: "亮屏充电",
    screen_off_charge: "熄屏快充",
    screen_off_idle: "熄屏休眠"
  };
  const title = names[currentProfile] || currentProfile;

  const activePill = document.querySelector(`.profile-select-group [data-profile="${currentProfile}"] .m3e-pill-temp`);
  if (activePill) activePill.innerText = `${p.thermal_wall}°C`;

  await saveConfigToDevice(`已保存「${title}」(${p.thermal_wall}°C / 回差${p.clear_hysteresis}°C)`);
  fetchStatus();
});

// 12. 充电闭环总开关与瓦特档位绑定
document.getElementById("charge-control-switch")?.addEventListener("change", async (e) => {
  const on = e.target.checked;
  if (appConfig) {
    if (!appConfig.charge_control) appConfig.charge_control = {};
    appConfig.charge_control.enabled = on;
    await saveConfigToDevice(on ? "已启用充电闭环调控" : "已恢复官方充电控制");
  } else {
    await ksuExec(`${DAEMON_CLI} set-charge-switch ${on ? 1 : 0}`);
    showToast(on ? "已启用充电闭环调控" : "已恢复官方充电控制");
  }
  fetchStatus();
});

document.querySelectorAll(".wattage-group button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".wattage-group button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const watts = parseInt(btn.getAttribute("data-watts"), 10);
    if (appConfig) {
      if (!appConfig.charge_control) appConfig.charge_control = {};
      appConfig.charge_control.target_watts = watts;
      await saveConfigToDevice(`目标功率已设为 ${watts}W`);
    } else {
      await ksuExec(`${DAEMON_CLI} set-power ${watts}`);
      showToast(`目标功率已设为 ${watts}W`);
    }
    fetchStatus();
  });
});

// 13. 一键复制前台活动包名
document.getElementById("btn-copy-pkg")?.addEventListener("click", () => {
  const pkgEl = document.getElementById("val-top-app");
  if (!pkgEl) return;
  const pkg = pkgEl.innerText.trim();
  if (pkg && pkg !== "检测中..." && pkg !== "None") {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pkg).then(() => showToast(`已复制: ${pkg}`));
    } else {
      showToast(pkg);
    }
  }
});

// 14. 纯净折线图引擎 (HTML5 Canvas，无荧光滤镜)
const canvas = document.getElementById("trend-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;
let currentPoints = [36, 36.5, 37, 37.2, 38, 38.5, 39, 40, 40.5, 41, 41.2, 41.5];
let targetPoints = [...currentPoints];
let isAnimatingChart = false;

function resizeCanvas() {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  drawCanvasCurve();
}

function drawCanvasCurve() {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  const min = Math.min(...currentPoints, 32) - 1.5;
  const max = Math.max(...currentPoints, 48) + 1.5;
  const range = max - min || 1;

  const coords = currentPoints.map((v, i) => {
    const x = (i / (currentPoints.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 16) - 8;
    return { x, y };
  });

  if (coords.length < 2) return;

  // 渐变填充
  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? i : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(168, 199, 250, 0.22)");
  grad.addColorStop(1, "rgba(168, 199, 250, 0.0)");
  ctx.fillStyle = grad;
  ctx.fill();

  // 纯净线条
  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? i : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.lineWidth = 2.0;
  ctx.strokeStyle = "#a8c7fa";
  ctx.lineCap = "round";
  ctx.stroke();

  // 末端点
  const last = coords[coords.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

function animateChartStep() {
  let needsContinue = false;
  for (let i = 0; i < currentPoints.length; i++) {
    const diff = targetPoints[i] - currentPoints[i];
    if (Math.abs(diff) > 0.05) {
      currentPoints[i] += diff * 0.18;
      needsContinue = true;
    } else {
      currentPoints[i] = targetPoints[i];
    }
  }

  drawCanvasCurve();

  if (needsContinue) {
    requestAnimationFrame(animateChartStep);
  } else {
    isAnimatingChart = false;
  }
}

function pushChartTemp(val) {
  if (typeof val !== "number" || isNaN(val) || val <= 0) return;
  targetPoints.push(val);
  if (targetPoints.length > 16) targetPoints.shift();
  while (currentPoints.length < targetPoints.length) {
    currentPoints.push(val);
  }
  while (currentPoints.length > targetPoints.length) {
    currentPoints.shift();
  }

  const legendVal = document.getElementById("chart-latest-val");
  if (legendVal) legendVal.innerText = `${val.toFixed(1)} °C`;

  if (!isAnimatingChart) {
    isAnimatingChart = true;
    requestAnimationFrame(animateChartStep);
  }
}

// 15. 数值平滑过渡
function animateValue(el, start, end, duration = 280, isFloat = false) {
  if (!el) return;
  const startTime = performance.now();
  function update(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const cur = start + (end - start) * easeProgress;
    el.innerText = isFloat ? cur.toFixed(1) : Math.round(cur);
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

// 16. 刷新实时硬件读数与状态
async function fetchStatus() {
  const res = await ksuExec(`${DAEMON_CLI} status-json`);
  if (res.code === 0 && res.stdout) {
    try {
      const data = JSON.parse(res.stdout);

      // 机身温度 (已移除冗余描述)
      const boardEl = document.getElementById("val-board-temp");
      const curTemp = data.temps.board || 36;
      if (boardEl) {
        if (Math.abs(displayBoardTemp - curTemp) >= 0.5) {
          animateValue(boardEl, displayBoardTemp, curTemp, 280, true);
          displayBoardTemp = curTemp;
        } else {
          boardEl.innerText = curTemp.toFixed ? curTemp.toFixed(1) : curTemp;
        }
      }

      // 充电功率
      const wattsEl = document.getElementById("val-charge-watts");
      const curWatts = data.power.watts || 0;
      if (wattsEl) {
        if (Math.abs(displayWatts - curWatts) >= 1) {
          animateValue(wattsEl, displayWatts, curWatts, 280, false);
          displayWatts = curWatts;
        } else {
          wattsEl.innerText = curWatts;
        }
      }

      // 前台应用友好名
      const rawPkg = data.topApp || "系统桌面 (待机)";
      const topAppEl = document.getElementById("val-top-app");
      const friendlyEl = document.getElementById("val-top-app-friendly");
      if (topAppEl) topAppEl.innerText = rawPkg;
      if (friendlyEl) {
        friendlyEl.innerText = APP_NAMES[rawPkg] || (rawPkg.includes(".") ? rawPkg.split(".").pop() : rawPkg);
      }

      const chargeGear = document.getElementById("charge-gear-sub");
      if (chargeGear) {
        chargeGear.innerText = `硬件档位: ${data.power.xmGear} (${data.power.charging ? "充电中" : "未充电"})`;
      }

      const profileChip = document.getElementById("profile-chip");
      if (profileChip) {
        if (data.isGame) {
          profileChip.innerText = data.gameSource === "custom" ? "游戏模式 (自定义优先)" : "游戏模式 (Scene联动)";
          profileChip.className = "m3e-chip warn";
        } else if (data.activeProfile === "screen_off_idle") {
          profileChip.innerText = data.statusTitle || data.activeProfileName || "熄屏休眠";
          profileChip.className = "m3e-chip idle";
        } else if (data.activeProfile === "screen_off_charge" || data.activeProfile === "screen_on_charge") {
          profileChip.innerText = data.statusTitle || data.activeProfileName || "充电中";
          profileChip.className = "m3e-chip ok";
        } else {
          profileChip.innerText = data.statusTitle || data.activeProfileName || "日常亮屏";
          profileChip.className = "m3e-chip";
        }
      }

      const daemonChipText = document.getElementById("daemon-chip-text");
      if (daemonChipText) {
        daemonChipText.innerText = data.running ? "RUNNING" : "STANDBY";
      }

      // 防拔核状态 ("锁定全核心" / "未生效")
      const coresStatusEl = document.getElementById("val-cores-status");
      if (coresStatusEl) {
        const isLocked = data.running && data.coresLocked !== false;
        coresStatusEl.innerText = isLocked ? "锁定全核心" : "未生效";
        coresStatusEl.className = isLocked ? "m3e-row-value ok-text" : "m3e-row-value muted-text";
      }

      // 当前温控墙
      const wallEl = document.getElementById("val-thermal-wall");
      if (wallEl) {
        let wallStr = data.currentWall;
        if (!wallStr) {
          const prof = data.activeProfile || "screen_on_daily";
          const wallNum = appConfig?.profiles?.[prof]?.thermal_wall || 46;
          wallStr = `${wallNum} °C`;
        }
        wallEl.innerText = wallStr;
      }

      // CPU 4 簇频点
      const p7 = data.cpus.policy7 || 0;
      const p5 = data.cpus.policy5 || 0;
      const p2 = data.cpus.policy2 || 0;
      const p0 = data.cpus.policy0 || 0;

      document.getElementById("freq-cpu7").innerText = `${p7} MHz`;
      document.getElementById("bar-cpu7").style.width = `${Math.min(100, Math.max(8, (p7 / 3300) * 100))}%`;

      document.getElementById("freq-cpu5").innerText = `${p5} MHz`;
      document.getElementById("bar-cpu5").style.width = `${Math.min(100, Math.max(8, (p5 / 3150) * 100))}%`;

      document.getElementById("freq-cpu2").innerText = `${p2} MHz`;
      document.getElementById("bar-cpu2").style.width = `${Math.min(100, Math.max(8, (p2 / 3150) * 100))}%`;

      document.getElementById("freq-cpu0").innerText = `${p0} MHz`;
      document.getElementById("bar-cpu0").style.width = `${Math.min(100, Math.max(8, (p0 / 2265) * 100))}%`;

      pushChartTemp(curTemp);
    } catch (e) {
      console.warn("解析硬件状态失败", e);
    }
  }
}

// 17. 获取运行日志
async function fetchLogs() {
  const terminal = document.getElementById("log-terminal");
  if (!terminal) return;
  terminal.innerText = "正在读取最新运行日志...";
  const res = await ksuExec(`${DAEMON_CLI} log`);
  terminal.innerText = res.stdout || "暂无日志记录。";
  terminal.scrollTop = terminal.scrollHeight;
}

// 18. 获取用户空间已安装应用 (仅搜索用户空间应用 pm list packages -3)
async function fetchUserApps() {
  const res = await ksuExec(`${DAEMON_CLI} list-user-apps`);
  if (res.code === 0 && res.stdout) {
    userApps = res.stdout.split("\n").map(l => l.trim()).filter(l => l.length > 0 && l.includes("."));
  }
  if (!userApps || userApps.length === 0) {
    userApps = [];
  }
}

// 19. 获取 Scene 游戏列表 (次级备选)
async function fetchSceneGames() {
  const container = document.getElementById("scene-games-list");
  const countEl = document.getElementById("scene-game-count");
  if (!container) return;

  const res = await ksuExec(`${DAEMON_CLI} games`);
  if (res.stdout) {
    const lines = res.stdout.split("\n").filter((l) => l.trim().startsWith("-"));
    if (lines.length > 0) {
      if (countEl) countEl.innerText = `${lines.length} 款`;
      container.innerHTML = lines
        .map((l) => {
          const pkg = l.replace("-", "").trim();
          const friendly = APP_NAMES[pkg] ? `${APP_NAMES[pkg]} (${pkg})` : pkg;
          return `<span class="m3e-chip ok"><span class="m3e-dot"></span>${friendly}</span>`;
        })
        .join("");
      return;
    }
  }

  if (countEl) countEl.innerText = "0 款";
  container.innerHTML = `<span class="m3e-chip idle">未检测到 Scene 标记游戏</span>`;
}

// 20. 渲染与管理自定义游戏列表 (最高优先级)
function renderCustomGames() {
  const container = document.getElementById("custom-games-list");
  const countEl = document.getElementById("custom-game-count");
  if (!container) return;

  if (!appConfig || !Array.isArray(appConfig.custom_games)) {
    container.innerHTML = `<div class="m3e-empty-hint">暂无自定义游戏，可在上方搜索添加</div>`;
    if (countEl) countEl.innerText = "0 款";
    return;
  }

  const list = appConfig.custom_games;
  if (countEl) countEl.innerText = `${list.length} 款`;

  if (list.length === 0) {
    container.innerHTML = `<div class="m3e-empty-hint">暂无自定义游戏，可在上方搜索添加</div>`;
    return;
  }

  container.innerHTML = list
    .map((pkg) => {
      const name = APP_NAMES[pkg] || (pkg.includes(".") ? pkg.split(".").pop() : pkg);
      return `
        <div class="m3e-game-item">
          <div class="m3e-game-item-info">
            <div class="m3e-game-item-name">${name}</div>
            <div class="m3e-game-item-pkg mono">${pkg}</div>
          </div>
          <button class="m3e-btn-remove" data-pkg="${pkg}">移除</button>
        </div>
      `;
    })
    .join("");

  // 绑定移除事件
  container.querySelectorAll(".m3e-btn-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pkgToRemove = btn.getAttribute("data-pkg");
      removeCustomGame(pkgToRemove);
    });
  });
}

// 添加自定义游戏
async function addCustomGame(pkg) {
  if (!pkg || !pkg.trim()) return;
  pkg = pkg.trim();

  if (!appConfig) appConfig = {};
  if (!Array.isArray(appConfig.custom_games)) appConfig.custom_games = [];

  if (appConfig.custom_games.includes(pkg)) {
    showToast("该游戏已在自定义列表中");
    return;
  }

  appConfig.custom_games.unshift(pkg);
  renderCustomGames();
  const friendly = APP_NAMES[pkg] || pkg;
  await saveConfigToDevice(`已添加「${friendly}」至自定义游戏`);

  // 清空搜索框并收起下拉
  const searchInput = document.getElementById("game-search-input");
  const dropdown = document.getElementById("game-search-dropdown");
  if (searchInput) searchInput.value = "";
  if (dropdown) {
    dropdown.innerHTML = "";
    dropdown.classList.remove("show");
  }
}

// 移除自定义游戏
async function removeCustomGame(pkg) {
  if (!appConfig || !Array.isArray(appConfig.custom_games)) return;
  const idx = appConfig.custom_games.indexOf(pkg);
  if (idx !== -1) {
    appConfig.custom_games.splice(idx, 1);
    const friendly = APP_NAMES[pkg] || pkg;
    await saveConfigToDevice(`已移除「${friendly}」`);
    renderCustomGames();
  }
}

// 21. 快捷搜索应用并添加交互
function setupGameSearch() {
  const searchInput = document.getElementById("game-search-input");
  const dropdown = document.getElementById("game-search-dropdown");
  const addBtn = document.getElementById("btn-add-game");
  if (!searchInput || !dropdown) return;

  function doSearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      dropdown.innerHTML = "";
      dropdown.classList.remove("show");
      return;
    }

    const currentGames = appConfig?.custom_games || [];
    const matched = [];

    // 1. 在已加载的用户空间应用中筛选 (仅搜索用户空间应用)
    for (const pkg of userApps) {
      if (currentGames.includes(pkg)) continue;
      const friendly = APP_NAMES[pkg] || "";
      if (pkg.toLowerCase().includes(q) || (friendly && friendly.toLowerCase().includes(q))) {
        matched.push({ pkg, name: friendly || pkg.split(".").pop() });
        if (matched.length >= 8) break;
      }
    }

    // 2. 如果输入直接像一个完整包名且不在列表里，提供直接添加选项
    const isDirectPkg = q.includes(".") && !matched.some(m => m.pkg.toLowerCase() === q);

    let html = matched
      .map(item => `
        <div class="m3e-search-item" data-pkg="${item.pkg}">
          <div class="m3e-search-item-info">
            <span class="m3e-search-item-name">${item.name}</span>
            <span class="m3e-search-item-pkg mono">${item.pkg}</span>
          </div>
          <button class="m3e-btn-tag" data-pkg="${item.pkg}">添加</button>
        </div>
      `)
      .join("");

    if (isDirectPkg) {
      html += `
        <div class="m3e-search-item" data-pkg="${q}">
          <div class="m3e-search-item-info">
            <span class="m3e-search-item-name">添加自定义包名</span>
            <span class="m3e-search-item-pkg mono">${q}</span>
          </div>
          <button class="m3e-btn-tag" data-pkg="${q}">添加</button>
        </div>
      `;
    }

    if (!html) {
      html = `<div class="m3e-empty-hint">未找到匹配的用户应用</div>`;
    }

    dropdown.innerHTML = html;
    dropdown.classList.add("show");

    // 绑定下拉项点击添加
    dropdown.querySelectorAll(".m3e-btn-tag").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const p = btn.getAttribute("data-pkg");
        addCustomGame(p);
      });
    });

    dropdown.querySelectorAll(".m3e-search-item").forEach((item) => {
      item.addEventListener("click", () => {
        const p = item.getAttribute("data-pkg");
        addCustomGame(p);
      });
    });
  }

  searchInput.addEventListener("input", doSearch);
  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) doSearch();
  });

  // 直接点击“添加”按钮
  addBtn?.addEventListener("click", () => {
    const val = searchInput.value.trim();
    if (val) addCustomGame(val);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const val = searchInput.value.trim();
      if (val) addCustomGame(val);
    }
  });

  // 点击外部隐藏搜索下拉
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove("show");
    }
  });
}

// 22. 日志刷新、导出与恢复操作
document.getElementById("btn-refresh-log")?.addEventListener("click", () => {
  fetchLogs();
  showToast("日志已刷新");
});

async function exportLog() {
  showToast("正在导出运行日志...");

  // 1. 调用 CLI 导出至 /sdcard/Download
  let exportedPath = "";
  const res = await ksuExec(`${DAEMON_CLI} export-log`);
  if (res.code === 0 && res.stdout && res.stdout.includes(".log")) {
    exportedPath = res.stdout.trim();
  }

  // 2. 同时获取完整日志通过浏览器 Blob 触发文件保存/下载
  const fullLogRes = await ksuExec(`${DAEMON_CLI} log-full`);
  const logContent = fullLogRes.stdout || document.getElementById("log-terminal")?.innerText || "";

  if (logContent && logContent.trim() && !logContent.includes("暂无运行日志")) {
    try {
      const blob = new Blob([logContent], { type: "text/plain;charset=utf-8" });
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const filename = `runami_thermald_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.log`;

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (_) {}
  }

  if (exportedPath) {
    showToast(`已导出: ${exportedPath}`);
  } else {
    showToast("日志已导出下载");
  }
}

document.getElementById("btn-export-log")?.addEventListener("click", exportLog);
document.getElementById("btn-export-log-icon")?.addEventListener("click", exportLog);

document.getElementById("btn-diagnose")?.addEventListener("click", async () => {
  showToast("正在诊断节点...");
  const res = await ksuExec(`${DAEMON_CLI} diagnose`);
  alert(res.stdout || "诊断完成");
});

document.getElementById("btn-restore-stock")?.addEventListener("click", async () => {
  if (confirm("确认恢复官方温控策略？")) {
    await ksuExec(`${DAEMON_CLI} restore`);
    showToast("官方温控已恢复");
    fetchStatus();
  }
});

// 23. 启动初始化流程
(async function init() {
  await initDynamicColors();
  resizeCanvas();
  updateNavIndicator();
  await loadConfig();
  await fetchUserApps();
  setupGameSearch();
  await fetchStatus();
  setInterval(fetchStatus, 2000);
})();