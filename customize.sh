#!/system/bin/sh
# Runami Thermald - 模块安装脚本
# 作者: 迷人の爱音

ui_print "****************************************"
ui_print "*         Runami Thermald v1.0.0       *"
ui_print "*   小米 14 (houji) 专属温控与充电调控  *"
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
    ui_print "  [提示] 当前设备代号为 $DEVICE，本模块深度针对小米 14 (houji) 优化。"
    ui_print "  [提示] 其它高通骁龙 8 Gen 3 (SM8650) 机型亦可兼容运行基础温控逻辑。"
else
    ui_print "  [√] 完美适配小米 14 (houji) 旗舰平台！"
fi

# 检查内核 xm_power 充电控制支持
if [ -d "/sys/class/xm_power/charger/charger_thermal" ]; then
    ui_print "  [√] 检测到底层 xm_power 澎湃秒充硬件控制节点！"
else
    ui_print "  [!] 未检测到 xm_power 硬件节点，充电功率控制将以标准 sysfs 回退模式运行。"
fi

# 检查 Scene 游戏配置
if [ -f "/data/data/com.omarea.vtools/shared_prefs/games.xml" ] || [ -f "/data/user/0/com.omarea.vtools/shared_prefs/games.xml" ]; then
    ui_print "  [√] 发现已安装的 Scene (vtools) 应用，游戏列表联动已就绪！"
else
    ui_print "  [i] 未检测到 Scene 配置，模块将内置王者荣耀/原神/崩铁等热门电竞列表。"
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
set_perm "${MODPATH}/service.sh" 0 0 0755
set_perm "${MODPATH}/uninstall.sh" 0 0 0755
set_perm "${MODPATH}/post-fs-data.sh" 0 0 0755

# 导出终端命令软链接到系统路径
mkdir -p "${MODPATH}/system/bin"
ln -sf "${MODPATH}/bin/runami_ctl" "${MODPATH}/system/bin/runami_ctl"
set_perm "${MODPATH}/system/bin/runami_ctl" 0 0 0755

ui_print "- 核心守护进程与 M3E WebUI 资源部署完成！"
ui_print "- 重启设备后，在 KernelSU 管理器模块列表点击即可打开控制面板。"
ui_print "****************************************"