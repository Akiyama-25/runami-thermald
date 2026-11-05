// Runami Thermald - WebUI 交互与状态控制逻辑
// 作者: 迷人の爱音

const DAEMON_CLI = "/data/adb/modules/runami_thermald/bin/runami_ctl";
let currentTab = "dashboard";
let currentProfile = "screen_on_game";
let trendData = [36, 37, 38, 38, 39, 41, 40, 42, 43, 42, 41, 42];

// KernelSU / APatch 执行桥接
function ksuExec(cmd) {
  return new Promise((resolve) => {
    if (window.ksu && typeof window.ksu.exec === "function") {
      window.ksu.exec(cmd, (code, stdout, stderr) => {
        resolve({ code, stdout, stderr });
      });
    } else {
      // 浏览器预览模拟环境
      console.log("[Mock Exec]", cmd);
      if (cmd.includes("--status-json")) {
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
            temps: { board: 42, battery: 36 },
            power: { charging: true, watts: 43, xmGear: 6, xmRemove: 1 },
            screenOn: true,
            cpus: { policy0: 1785, policy2: 2476, policy5: 2476, policy7: 3187, gpu: 770 },
            sceneGamesCount: 4
          }),
          stderr: ""
        });
      } else {
        resolve({ code: 0, stdout: "Mock success", stderr: "" });
      }
    }
  });
}

// 选项卡切换处理
document.querySelectorAll(".nav-group .m3e-connected-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-group .m3e-connected-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    
    currentTab = btn.getAttribute("data-tab");
    document.querySelectorAll(".m3e-tab-content").forEach((tab) => tab.classList.remove("active"));
    const activeTab = document.getElementById(`tab-${currentTab}`);
    if (activeTab) activeTab.classList.add("active");

    if (currentTab === "logs") {
      fetchLogs();
    } else if (currentTab === "scene") {
      fetchSceneGames();
    }
  });
});

// 温度墙子方案切换
document.querySelectorAll(".profile-select-group .m3e-connected-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".profile-select-group .m3e-connected-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentProfile = btn.getAttribute("data-profile");
    updateProfileEditor();
  });
});

// 滑块数值联动
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

// 充电功率预设档位选择
document.querySelectorAll(".wattage-group .m3e-connected-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".wattage-group .m3e-connected-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const watts = btn.getAttribute("data-watts");
    btn.innerText = `设定中...`;
    await ksuExec(`${DAEMON_CLI} set-power ${watts}`);
    btn.innerText = `${watts}W`;
    fetchStatus();
  });
});

// 绘制动态折线图
function renderChart(temp) {
  trendData.push(temp);
  if (trendData.length > 20) trendData.shift();

  const min = Math.min(...trendData, 30) - 2;
  const max = Math.max(...trendData, 50) + 2;
  const range = max - min || 1;
  const w = 300;
  const h = 70;

  const points = trendData.map((v, i) => {
    const x = (i / (trendData.length - 1)) * w;
    const y = h - ((v - min) / range) * h + 5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `M 0,${h + 10} L ${points.join(" L ")} L ${w},${h + 10} Z`;

  const lineEl = document.getElementById("chart-line");
  const areaEl = document.getElementById("chart-area");
  if (lineEl) lineEl.setAttribute("d", linePath);
  if (areaEl) areaEl.setAttribute("d", areaPath);
}

// 刷新硬件状态
async function fetchStatus() {
  const res = await ksuExec(`${DAEMON_CLI} status-json`);
  if (res.code === 0 && res.stdout) {
    try {
      const data = JSON.parse(res.stdout);
      
      document.getElementById("val-board-temp").innerText = data.temps.board || "--";
      document.getElementById("val-charge-watts").innerText = data.power.watts || "--";
      document.getElementById("val-top-app").innerText = data.topApp || "系统桌面 (待机)";
      document.getElementById("charge-gear-sub").innerText = `xm_power 硬件档位: ${data.power.xmGear} (${data.power.charging ? "充电中" : "未充电"})`;
      document.getElementById("profile-chip").innerText = data.activeProfileName || "标准模式";

      // 更新 CPU 频点进度条
      const p7 = data.cpus.policy7 || 0;
      const p5 = data.cpus.policy5 || 0;
      const p2 = data.cpus.policy2 || 0;
      const p0 = data.cpus.policy0 || 0;

      document.getElementById("freq-cpu7").innerText = `${p7} MHz`;
      document.getElementById("bar-cpu7").style.width = `${Math.min(100, (p7 / 3300) * 100)}%`;

      document.getElementById("freq-cpu5").innerText = `${p5} MHz`;
      document.getElementById("bar-cpu5").style.width = `${Math.min(100, (p5 / 3150) * 100)}%`;

      document.getElementById("freq-cpu2").innerText = `${p2} MHz`;
      document.getElementById("bar-cpu2").style.width = `${Math.min(100, (p2 / 3150) * 100)}%`;

      document.getElementById("freq-cpu0").innerText = `${p0} MHz`;
      document.getElementById("bar-cpu0").style.width = `${Math.min(100, (p0 / 2265) * 100)}%`;

      renderChart(data.temps.board || 38);
    } catch (e) {
      console.warn("解析状态失败", e);
    }
  }
}

// 获取日志
async function fetchLogs() {
  const terminal = document.getElementById("log-terminal");
  const res = await ksuExec(`${DAEMON_CLI} log`);
  if (terminal) {
    terminal.innerText = res.stdout || "暂无日志记录。";
    terminal.scrollTop = terminal.scrollHeight;
  }
}

// 获取 Scene 游戏列表
async function fetchSceneGames() {
  const container = document.getElementById("scene-games-list");
  const countEl = document.getElementById("scene-game-count");
  const res = await ksuExec(`${DAEMON_CLI} games`);
  
  if (container && res.stdout) {
    const lines = res.stdout.split("\n").filter((l) => l.trim().startsWith("-"));
    if (lines.length > 0) {
      if (countEl) countEl.innerText = `${lines.length} 款`;
      container.innerHTML = lines
        .map((l) => {
          const pkg = l.replace("-", "").trim();
          return `<span class="m3e-chip ok"><span class="m3e-dot"></span>${pkg}</span>`;
        })
        .join("");
    } else {
      if (countEl) countEl.innerText = "内置预设";
      container.innerHTML = `
        <span class="m3e-chip ok">原神 (com.miHoYo.Yuanshen)</span>
        <span class="m3e-chip ok">崩坏：星穹铁道 (com.miHoYo.hkrpg)</span>
        <span class="m3e-chip ok">绝区零 (com.miHoYo.Nap)</span>
        <span class="m3e-chip ok">王者荣耀 (com.tencent.tmgp.sgame)</span>
      `;
    }
  }
}

// 诊断与紧急恢复
document.getElementById("btn-refresh-log")?.addEventListener("click", fetchLogs);
document.getElementById("btn-diagnose")?.addEventListener("click", async () => {
  const res = await ksuExec(`${DAEMON_CLI} diagnose`);
  alert(res.stdout || "诊断完成");
});

document.getElementById("btn-restore-stock")?.addEventListener("click", async () => {
  if (confirm("确认彻底清除所有温控修改并恢复官方原厂策略？")) {
    await ksuExec(`${DAEMON_CLI} restore`);
    alert("官方原厂温控已完全恢复！");
    fetchStatus();
  }
});

function updateProfileEditor() {
  const presets = {
    screen_on_game: { trip: 52, hyst: 3 },
    screen_on_daily: { trip: 46, hyst: 2 },
    screen_on_charge: { trip: 44, hyst: 2 },
    screen_off_charge: { trip: 45, hyst: 2 },
    screen_off_idle: { trip: 42, hyst: 2 }
  };
  const val = presets[currentProfile] || { trip: 48, hyst: 2 };
  tripSlider.value = val.trip;
  tripDisplay.innerText = `${val.trip} °C`;
  hystSlider.value = val.hyst;
  hystDisplay.innerText = `${val.hyst} °C`;
}

// 循环轮询
fetchStatus();
setInterval(fetchStatus, 2000);