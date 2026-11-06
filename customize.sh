#!/system/bin/sh
# Runami Thermald - 模块安装脚本
# 作者: 迷人の爱音

ui_print "****************************************"
ui_print "*         Runami Thermald v1.0.0       *"
ui_print "*      高级温控与充电调控守护程序      *"
ui_print "*             作者: 迷人の爱音         *"
ui_print "****************************************"

DEVICE=$(getprop ro.product.device)
MODEL=$(getprop ro.product.model)
BUILD_VER=$(getprop ro.build.version.incremental)

ui_print "- 正在检测设备硬件环境..."
ui_print "  设备代号: $DEVICE"
ui_print "  产品型号: $MODEL"
ui_print "  系统版本: $BUILD_VER"

if [ "$DEVICE" != "houji" ]; then
    ui_print "  [提示] 当前设备代号为 $DEVICE，测试基准平台为小米 14 (houji)。"
    ui_print "  [提示] 其它高通骁龙 8 Gen 3 (SM8650) 机型亦可兼容运行基础温控逻辑。"
else
    ui_print "  [√] 检测到匹配基准平台小米 14 (houji)！"
fi

# 检查内核 xm_power 充电控制支持
find_xm_charger() {
    for p in \
        "/sys/class/xm_power/charger/charger_thermal" \
        "/sys/class/xm_power/charger_thermal" \
        "/sys/class/xm_power/charge_interface" \
        "/sys/class/xm_power/charger/charge_interface" \
        "/sys/class/xm_power" \
        "/sys/class/power_supply/battery" \
        "/sys/class/qcom-battery"; do
        if [ -f "$p/wired_thermal_remove" ] || [ -f "$p/wired_ctrl_limit" ]; then
            echo "$p"
            return 0
        fi
    done
    if [ -d "/sys/class/xm_power/charger/charger_thermal" ]; then
        echo "/sys/class/xm_power/charger/charger_thermal"
        return 0
    fi
    if [ -d "/sys/class/xm_power" ]; then
        echo "/sys/class/xm_power"
        return 0
    fi
    return 1
}

XM_NODE=$(find_xm_charger 2>/dev/null)
if [ -n "$XM_NODE" ]; then
    ui_print "  [√] 检测到 xm_power 硬件充电控制节点: $XM_NODE"
elif [ -d "/sys/class/xm_power" ]; then
    ui_print "  [√] 检测到系统已挂载 xm_power 子系统！"
elif [ "$DEVICE" = "houji" ] || [ "$(getprop ro.product.manufacturer 2>/dev/null | tr '[:upper:]' '[:lower:]')" = "xiaomi" ]; then
    ui_print "  [i] 小米/红米平台环境已确认，xm_power 节点将在系统完整开机加载驱动后由守护进程自动接入。"
else
    ui_print "  [i] 未检测到专用 xm_power 节点，将以标准温控调度模式运行。"
fi

# 检查 Scene 游戏配置
if [ -f "/data/data/com.omarea.vtools/shared_prefs/games.xml" ] || [ -f "/data/user/0/com.omarea.vtools/shared_prefs/games.xml" ]; then
    ui_print "  [√] 发现已安装的 Scene (vtools) 应用，游戏列表联动已就绪！"
else
    ui_print "  [i] 未检测到 Scene 配置，可通过 WebUI 控制面板自定义添加游戏。"
fi

# 初始化持久化配置目录
DATADIR="/data/adb/runami_thermald"
mkdir -p "${DATADIR}"
mkdir -p "${DATADIR}/templates"
mkdir -p "/data/vendor/thermal/config"
chmod 0771 "/data/vendor/thermal/config" 2>/dev/null

if [ ! -f "${DATADIR}/config.json" ]; then
    cp -f "${MODPATH}/config/runami.conf" "${DATADIR}/config.json"
fi

# 设置可执行权限
set_perm "${MODPATH}/bin/runami_daemon" 0 0 0755
set_perm "${MODPATH}/bin/runami_ctl" 0 0 0755
set_perm "${MODPATH}/action.sh" 0 0 0755
set_perm "${MODPATH}/service.sh" 0 0 0755
set_perm "${MODPATH}/uninstall.sh" 0 0 0755
set_perm "${MODPATH}/post-fs-data.sh" 0 0 0755

# 导出终端命令软链接到系统路径
mkdir -p "${MODPATH}/system/bin"
ln -sf "${MODPATH}/bin/runami_ctl" "${MODPATH}/system/bin/runami_ctl"
set_perm "${MODPATH}/system/bin/runami_ctl" 0 0 0755

ui_print "- 核心守护进程与 KernelSU M3E WebUI (webroot) 资源部署完成！"
ui_print "- 重启设备后，在 KernelSU 管理器模块列表点击即可打开控制面板。"
ui_print "****************************************"