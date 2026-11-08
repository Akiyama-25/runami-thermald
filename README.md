<div align="center">

# Runami Thermald

**高级温控与充电调控守护程序（KernelSU 模块）**

**作者：迷人の爱音**

[![KernelSU WebUI](https://img.shields.io/badge/KernelSU-M3E%20WebUI%20(webroot)-2E7D32.svg)]()
[![System: HyperOS 3.0](https://img.shields.io/badge/System-HyperOS%203.0%20(Android%2016)-blue.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI: GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF.svg)]()

[特性](#核心特性) | [测试平台](#测试与适配环境) | [架构原理](#架构原理) | [WebUI 体验](#m3e-webui-设计) | [安装方法](#安装方法) | [命令行](#命令行工具) | [构建与发布](#编译与流水线) | [鸣谢](#鸣谢与协议)

</div>

---

## 测试与适配环境

本模块开发与全功能测试基准环境如下：

| 项目 | 测试基准配置 |
| :--- | :--- |
| **设备型号** | **Xiaomi 14（代号：houji）** |
| **处理器平台** | 高通骁龙 8 Gen 3（SM8650） |
| **系统版本** | **xiaomi.eu HyperOS 3.0.303.0.WNCCNXM（基于 Android 16.0 官方底包）** |
| **Root 运行环境** | KernelSU（支持 APatch 与 Magisk，WebUI 遵循 KernelSU `webroot` 标准） |

> **兼容性说明**：本模块算法与硬件控制逻辑基于高通骁龙 8 Gen 3 平台及小米 `mi_thermald` / `xm_power` 架构设计，在匹配平台设备上均可兼容运行。

---

## 核心特性

- 🌡️ **分态独立温度墙**：彻底打破传统温控一刀切。为**电竞游戏（独立温度墙）**、**亮屏日常**、**亮屏充电**、**熄屏快充**与**熄屏休眠**分别提供专属的起降温控阈值与迟滞回差。
- 🔒 **8 核全在线防拔核 (Anti-MONITOR-CCC)**：彻底封印官方温控在 50°C 强制关停超大核 Cortex-X4 与大核的粗暴机制，确保高负载游戏下帧率平稳不掉帧。
- ⚡ **xm_power 硬件级充电闭环稳充**：通过底层 `/sys/class/xm_power/charger/charger_thermal/` 节点解除官方温控降档，配合 `wired_ctrl_limit` 硬件档位闭环调节，支持 18W / 27W / 33W / 45W / 67W / 90W 自由限流稳充，告别亮屏充电断崖式降流与过热通断。
- 🎮 **Scene 游戏库自动秒级联动**：自动读取 Scene（`com.omarea.vtools`）标记的游戏列表，配合 `/dev/cpuset/top-app/cgroup.procs` 零开销毫秒级前台感知，0.3 秒内瞬间切入游戏专属温度墙，退出后带 5 秒防抖回退。
- 🎨 **Material 3 Expressive (M3E) 现代化 WebUI**：深度汲取 **FlClash** 设计精髓，采用曲奇多态形变徽章（ShapeBadge Cookie Morphing）、互联药丸分段按钮（Connected Pill Buttons）、等宽呼吸状态芯片与动态发光折线图。资源规范存放于 `webroot/`，完美兼容 KernelSU WebUI 规范。
- 🛡️ **硬件安全护盾 (Hardware Safety Guard)**：当检测到电池温度超过 48°C 或机身温度超过 55°C 时，看门狗自动秒级熔断回退官方原厂策略，安全无忧。

---

## 架构原理

```
                     [ 7-NTC 传感矩阵 ]
       (cpu_therm, quiet_therm, charger_therm0, battery, wifi, pa)
                              │
                              ▼
           [ 加权合成握持温度 + EMA 低通滤波 (α=0.25) ]
                              │
                              ▼
                 [ Runami Thermald 核心状态机 ]
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
 【Scene 游戏感知】       【屏幕 & 充电状态】      【安全熔断看门狗】
(games.xml + top-app)   (screen_state / status) (48°C / 55°C 熔断)
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
  【性能与温度墙执行器】                【充电功率闭环引擎】
  - 解密/重写 thermal-*.conf          - wired_thermal_remove = 1
  - 锁定 8 核 Online (防拔核)          - wired_ctrl_limit 动态档位调节
  - 无损写入覆盖目录热生效            - 18W ~ 90W 平滑稳流
```

---

## M3E WebUI 设计

本模块 WebUI 位于模块内部标准 `webroot/` 目录，完全契合 KernelSU Manager 原生 Web 界面规范：
1. **仪表盘**：直观展示板温、电池温度、实时充入功率、各 CPU 簇频点负载与动态波形。
2. **温度墙方案**：滑动调节起控阈值（Trip Temp）与解除死区（Hysteresis），一键热重载。
3. **充电调度**：药丸切换 18W~90W 目标功率档位，实时回显 xm_power 档位与充入电压/电流。
4. **Scene 联动**：自动同步并列出 Scene 勾选的游戏标签。
5. **日志与诊断**：一键节点自检与紧急回退官方温控。

---

## 安装方法

1. 在 GitHub Actions 的 Artifacts 中下载生成的 `Runami-Thermald-v1.0.0.zip`（已通过流水线直出单层标准模块压缩包，无需解压提取，下载即可直接刷入）。
2. 打开 KernelSU / APatch / Magisk 管理器，进入「模块」页面选择「从本地安装」。
3. 刷入完成后重启设备。
4. 重启后在 KernelSU 管理器模块列表中，点击模块卡片即可打开 M3E 控制面板（亦可通过卡片上的“执行操作”查看即时状态）。

---

## 命令行工具

模块自带便捷的 `runami_ctl` 终端管理工具（需要 root 权限）：

```sh
runami_ctl status           # 查看当前硬件状态与运行模式
runami_ctl set-power 45     # 设定充电目标功率为 45W 稳充
runami_ctl games            # 列出 Scene 识别到的电竞游戏
runami_ctl diagnose         # 一键诊断底层 xm_power 与 thermal 节点
runami_ctl restore          # 清除所有覆盖，彻底交回官方原厂温控
runami_ctl log              # 查看最近 50 条运行日志
```

---

## 编译与流水线

本项目使用 GitHub Actions 官方运行器（`ubuntu-latest`）进行自动化构建：

- **日常构建（`build.yml`）**：
  在代码 Push、PR 或手动触发时自动运行。执行脚本静态校验与 AES 引擎自检，将散装模块文件直接作为 Artifact 输出，由 GitHub Actions 自动包装为 `Runami-Thermald-v1.0.0.zip` 供下载，**杜绝双重压缩，下载即可直接刷入**；同时**绝不自动发布 Release**。
- **发布构建（`release.yml`）**：
  采用 **手动触发（`workflow_dispatch`）** 模式。在 GitHub Actions 页面点击“Run workflow”，将自动校验、打包并发布到 GitHub Releases，同时自动同步更新 `update.json`。

本地编译：
```bash
chmod +x build.sh
./build.sh --test       # 执行语法与 AES 引擎自检
./build.sh --package    # 打包产出 dist/Runami-Thermald-v1.0.1.zip
```

---

## 鸣谢与协议

- [AstraThermald](https://github.com/Baizhi-Zero/astra_thermald) - 7-NTC 传感矩阵加权与 EMA 平滑滤波算法、锁死 8 核全在线防拔核 (Anti-MONITOR-CCC) 逻辑
- [MiThermalScheduler](https://github.com/MiChongs/MiThermalScheduler) - 多级优先级调度裁决链、top-app 极速前台应用识别与覆盖目录热重载机制
- [chg_thermal_42c](https://github.com/763061952/chg_thermal_42c) - xm_power 硬件级有线充电温控解除与带死区容差的动态功率闭环稳充逻辑
- [FlClash](https://github.com/chen08209/FlClash) - Material 3 Expressive (M3E) 界面设计语言、曲奇多态形变徽章 (ShapeBadge) 与互联药丸分段按钮 (Connected Pill Buttons)
- [fas-rs](https://github.com/shadow3aaa/fas-rs) - Scene 游戏列表 XML (games.xml) 格式解析规范与联动机制

本项目遵循 [MIT](LICENSE) 开源协议。