// Runami Thermald - WebUI 交互与状态控制逻辑
// 作者: 迷人の爱音

const DAEMON_CLI = "sh /data/adb/modules/runami_thermald/bin/runami_ctl";
let currentTab = "dashboard";
let currentProfile = "screen_on_game";
let trendData = [36, 37, 37, 38, 38, 39, 40, 41, 41, 42, 41, 42];
let appConfig = null;
let lastBoardTemp = null;
let lastWatts = null;
let _cmdSeq = 0;

// 1. 完善的 KernelSU / APatch 异步非阻塞执行桥接
function ksuExec(cmd) {
  return new Promise((resolve) => {
    if (typeof window.ksu !== "undefined") {
      const cbName = `__ksu_cb_${Date.now()}_${_cmdSeq++}`;
      let resolved = false;

      // 4 秒看门狗防卡死超时保护
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          delete window[cbName];
          try {
            // 尝试单参数同步兜底
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
        // KernelSU 标准回调接口: exec(cmd, options, callbackName)
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
            activeProfileName: "电竞游戏模式 (52°C)",
            statusTitle: "游戏温度墙生效中",
            topApp: "com.miHoYo.Yuanshen",
            isGame: true,
            temps: { board: 41, battery: 35 },
            power: { charging: true, watts: 42, xmGear: 6, xmRemove: 1 },
            screenOn: true,
            cpus: { policy0: 1785, policy2: 2476, policy5: 2476, policy7: 3187, gpu: 770 },
            sceneGamesCount: 5
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
              screen_on_game: { name: "电竞游戏模式", thermal_wall: 52, clear_hysteresis: 3, charge_power_limit: 18, lock_cores_online: true },
              screen_on_daily: { name: "日常亮屏模式", thermal_wall: 46, clear_hysteresis: 2, charge_power_limit: 33, lock_cores_online: true },
              screen_on_charge: { name: "亮屏充电模式", thermal_wall: 44, clear_hysteresis: 2, charge_power_limit: 33, lock_cores_online: true },
              screen_off_charge: { name: "熄屏快充模式", thermal_wall: 45, clear_hysteresis: 2, charge_power_limit: 90, lock_cores_online: true },
              screen_off_idle: { name: "熄屏休眠模式", thermal_wall: 42, clear_hysteresis: 2, charge_power_limit: 18, lock_cores_online: false }
            },
            charge_control: { enabled: true, target_watts: 45, battery_protect_temp: 46 }
          }),
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
        console.log("KernelSU 动态莫奈取色已注入");
      }
    }
  } catch (e) {
    console.warn("未获取到 /internal/colors.css, 使用原生内置 M3 调色盘");
  }
}

// 3. 浮动 Toast 提示
let snackTimer = null;
function showToast(msg) {
  const el = document.getElementById("m3e-snackbar");
  if (!el) return;
  el.innerText = msg;
  el.classList.add("show");
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2400);
}

// 4. 从设备端读取持久化配置并初始化 UI
async function loadConfig() {
  const res = await ksuExec(`${DAEMON_CLI} get-config`);
  if (res.code === 0 && res.stdout) {
    try {
      appConfig = JSON.parse(res.stdout);
      console.log("配置已加载:", appConfig);
      updateProfileEditor();

      // 还原充电闭环开关
      const chgSwitch = document.getElementById("charge-control-switch");
      if (chgSwitch && appConfig.charge_control) {
        chgSwitch.checked = appConfig.charge_control.enabled !== false;
      }

      // 还原当前选中瓦特按钮
      if (appConfig.charge_control && appConfig.charge_control.target_watts) {
        const w = appConfig.charge_control.target_watts;
        document.querySelectorAll(".wattage-group .m3e-connected-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.getAttribute("data-watts") == w);
        });
      }
    } catch (e) {
      console.warn("解析配置失败", e);
    }
  }
}

// 5. 保存并持久化配置到磁盘
async function saveConfigToDevice(tipMsg = "配置已保存") {
  if (!appConfig) return;
  try {
    const jsonStr = JSON.stringify(appConfig, null, 2);
    // 采用 base64 传输，杜绝 shell 特殊字符与转义问题
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

// 6. 选项卡切换处理与平滑入场
document.querySelectorAll(".nav-group .m3e-connected-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-group .m3e-connected-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    
    currentTab = btn.getAttribute("data-tab");
    document.querySelectorAll(".m3e-tab-content").forEach((tab) => tab.classList.remove("active"));
    const activeTab = document.getElementById(`tab-${currentTab}`);
    if (activeTab) {
      activeTab.classList.add("active");
    }

    if (currentTab === "logs") {
      fetchLogs();
    } else if (currentTab === "scene") {
      fetchSceneGames();
    }
  });
});

// 7. 温度墙子方案切换
document.querySelectorAll(".profile-select-group .m3e-connected-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".profile-select-group .m3e-connected-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentProfile = btn.getAttribute("data-profile");
    updateProfileEditor();
  });
});

// 8. 滑块数值与显示联动
const tripSlider = document.getElementById("profile-trip-slider");
const tripDisplay = document.getElementById("profile-trip-display");
tripSlider.addEventListener("input", () => {
  tripDisplay.innerText = `${tripSlider.value} °C`;
});

const hystSlider = document.getElementById("profile-hysteresis-slider");
const hystDisplay = document.getElementById("profile-hysteresis-display");
hystSlider.addEventListener("input", () => {
  hystDisplay.innerText = `${hystSlider.value} °C`;
});

// 9. 更新温度墙编辑器表单（优先读取当前配置）
function updateProfileEditor() {
  if (appConfig && appConfig.profiles && appConfig.profiles[currentProfile]) {
    const p = appConfig.profiles[currentProfile];
    tripSlider.value = p.thermal_wall || 48;
    tripDisplay.innerText = `${tripSlider.value} °C`;
    hystSlider.value = p.clear_hysteresis || 2;
    hystDisplay.innerText = `${hystSlider.value} °C`;
    const lockCores = document.getElementById("profile-lock-cores");
    if (lockCores) {
      lockCores.checked = p.lock_cores_online !== false;
    }
    return;
  }
  // 默认预设回退
  const presets = {
    screen_on_game: { trip: 52, hyst: 3, lock: true },
    screen_on_daily: { trip: 46, hyst: 2, lock: true },
    screen_on_charge: { trip: 44, hyst: 2, lock: true },
    screen_off_charge: { trip: 45, hyst: 2, lock: true },
    screen_off_idle: { trip: 42, hyst: 2, lock: false }
  };
  const val = presets[currentProfile] || { trip: 48, hyst: 2, lock: true };
  tripSlider.value = val.trip;
  tripDisplay.innerText = `${val.trip} °C`;
  hystSlider.value = val.hyst;
  hystDisplay.innerText = `${val.hyst} °C`;
  const lockCores = document.getElementById("profile-lock-cores");
  if (lockCores) lockCores.checked = val.lock;
}

// 10. 保存温度墙方案按钮绑定
document.getElementById("btn-save-profile")?.addEventListener("click", async () => {
  if (!appConfig) appConfig = {};
  if (!appConfig.profiles) appConfig.profiles = {};
  if (!appConfig.profiles[currentProfile]) appConfig.profiles[currentProfile] = {};

  const p = appConfig.profiles[currentProfile];
  p.thermal_wall = parseInt(tripSlider.value, 10);
  p.clear_hysteresis = parseInt(hystSlider.value, 10);
  const lockCores = document.getElementById("profile-lock-cores");
  if (lockCores) {
    p.lock_cores_online = lockCores.checked;
  }

  const names = {
    screen_on_game: "电竞游戏模式",
    screen_on_daily: "亮屏日常模式",
    screen_on_charge: "亮屏充电模式",
    screen_off_charge: "熄屏快充模式",
    screen_off_idle: "熄屏休眠模式"
  };
  const title = names[currentProfile] || currentProfile;
  await saveConfigToDevice(`已保存「${title}」(${p.thermal_wall}°C / 回差${p.clear_hysteresis}°C)`);
  fetchStatus();
});

// 11. 充电闭环总开关与瓦特档位绑定
document.getElementById("charge-control-switch")?.addEventListener("change", async (e) => {
  const on = e.target.checked;
  if (appConfig) {
    if (!appConfig.charge_control) appConfig.charge_control = {};
    appConfig.charge_control.enabled = on;
    await saveConfigToDevice(on ? "已启用 xm_power 充电闭环管理" : "已停用充电闭环，恢复官方模式");
  } else {
    await ksuExec(`${DAEMON_CLI} set-charge-switch ${on ? 1 : 0}`);
    showToast(on ? "已启用充电闭环调控" : "已恢复官方充电控制");
  }
  fetchStatus();
});

document.querySelectorAll(".wattage-group .m3e-connected-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".wattage-group .m3e-connected-btn").forEach((b) => b.classList.remove("active"));
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

// 12. 绘制动态发光折线图
function renderChart(temp) {
  if (typeof temp === "number" && temp > 0) {
    trendData.push(temp);
    if (trendData.length > 20) trendData.shift();
  }

  const min = Math.min(...trendData, 30) - 2;
  const max = Math.max(...trendData, 48) + 2;
  const range = max - min || 1;
  const w = 300;
  const h = 75;

  const points = trendData.map((v, i) => {
    const x = (i / (trendData.length - 1)) * w;
    const y = h - ((v - min) / range) * h + 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `M 0,${h + 10} L ${points.join(" L ")} L ${w},${h + 10} Z`;

  const lineEl = document.getElementById("chart-line");
  const areaEl = document.getElementById("chart-area");
  if (lineEl) lineEl.setAttribute("d", linePath);
  if (areaEl) areaEl.setAttribute("d", areaPath);
}

// 13. 刷新实时硬件读数与状态
async function fetchStatus() {
  const res = await ksuExec(`${DAEMON_CLI} status-json`);
  if (res.code === 0 && res.stdout) {
    try {
      const data = JSON.parse(res.stdout);

      // 板温数字动态跳动与高亮
      const boardEl = document.getElementById("val-board-temp");
      if (boardEl) {
        const curTemp = data.temps.board || 36;
        boardEl.innerText = curTemp;
        if (lastBoardTemp !== null && lastBoardTemp !== curTemp) {
          boardEl.classList.add("pulse");
          setTimeout(() => boardEl.classList.remove("pulse"), 400);
        }
        lastBoardTemp = curTemp;
      }

      // 充电功率数字动态跳动
      const wattsEl = document.getElementById("val-charge-watts");
      if (wattsEl) {
        const curWatts = data.power.watts || 0;
        wattsEl.innerText = curWatts;
        if (lastWatts !== null && lastWatts !== curWatts) {
          wattsEl.classList.add("pulse");
          setTimeout(() => wattsEl.classList.remove("pulse"), 400);
        }
        lastWatts = curWatts;
      }

      document.getElementById("val-top-app").innerText = data.topApp || "系统桌面 (待机)";
      document.getElementById("charge-gear-sub").innerText = `xm_power 硬件档位: ${data.power.xmGear} (${data.power.charging ? "充电中" : "未充电"})`;
      document.getElementById("profile-chip").innerText = data.statusTitle || data.activeProfileName || "运行中";

      const daemonChipText = document.getElementById("daemon-chip-text");
      if (daemonChipText) {
        daemonChipText.innerText = data.running ? "RUNNING" : "STANDBY";
      }

      // CPU 4 簇频点负载更新
      const p7 = data.cpus.policy7 || 0;
      const p5 = data.cpus.policy5 || 0;
      const p2 = data.cpus.policy2 || 0;
      const p0 = data.cpus.policy0 || 0;

      document.getElementById("freq-cpu7").innerText = `${p7} MHz`;
      document.getElementById("bar-cpu7").style.width = `${Math.min(100, Math.max(10, (p7 / 3300) * 100))}%`;

      document.getElementById("freq-cpu5").innerText = `${p5} MHz`;
      document.getElementById("bar-cpu5").style.width = `${Math.min(100, Math.max(10, (p5 / 3150) * 100))}%`;

      document.getElementById("freq-cpu2").innerText = `${p2} MHz`;
      document.getElementById("bar-cpu2").style.width = `${Math.min(100, Math.max(10, (p2 / 3150) * 100))}%`;

      document.getElementById("freq-cpu0").innerText = `${p0} MHz`;
      document.getElementById("bar-cpu0").style.width = `${Math.min(100, Math.max(10, (p0 / 2265) * 100))}%`;

      renderChart(data.temps.board);
    } catch (e) {
      console.warn("解析硬件状态失败", e);
    }
  }
}

// 14. 获取运行日志
async function fetchLogs() {
  const terminal = document.getElementById("log-terminal");
  if (!terminal) return;
  terminal.innerText = "正在读取最新运行日志...";
  const res = await ksuExec(`${DAEMON_CLI} log`);
  terminal.innerText = res.stdout || "暂无日志记录。";
  terminal.scrollTop = terminal.scrollHeight;
}

// 15. 获取 Scene 游戏列表
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
          return `<span class="m3e-chip ok"><span class="m3e-dot"></span>${pkg}</span>`;
        })
        .join("");
      return;
    }
  }

  if (countEl) countEl.innerText = "内置预设";
  container.innerHTML = `
    <span class="m3e-chip ok"><span class="m3e-dot"></span>原神 (com.miHoYo.Yuanshen)</span>
    <span class="m3e-chip ok"><span class="m3e-dot"></span>崩坏：星穹铁道 (com.miHoYo.hkrpg)</span>
    <span class="m3e-chip ok"><span class="m3e-dot"></span>绝区零 (com.miHoYo.Nap)</span>
    <span class="m3e-chip ok"><span class="m3e-dot"></span>王者荣耀 (com.tencent.tmgp.sgame)</span>
  `;
}

// 16. 诊断与恢复操作
document.getElementById("btn-refresh-log")?.addEventListener("click", () => {
  fetchLogs();
  showToast("日志已刷新");
});

document.getElementById("btn-diagnose")?.addEventListener("click", async () => {
  showToast("正在执行节点全面诊断...");
  const res = await ksuExec(`${DAEMON_CLI} diagnose`);
  alert(res.stdout || "诊断完成");
});

document.getElementById("btn-restore-stock")?.addEventListener("click", async () => {
  if (confirm("确认彻底清除所有温控修改并恢复官方原厂策略？")) {
    await ksuExec(`${DAEMON_CLI} restore`);
    showToast("官方原厂温控已完全恢复");
    fetchStatus();
  }
});

// 17. 启动初始化流程
(async function init() {
  await initDynamicColors();
  await loadConfig();
  await fetchStatus();
  renderChart(38);
  setInterval(fetchStatus, 2000);
})();