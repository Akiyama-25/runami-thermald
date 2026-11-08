#!/system/bin/sh
# Runami Thermald - 卸载与清理脚本
# 作者: 迷人の爱音

MODDIR=${0%/*}

# 1. 终止后台守护进程
if [ -x "${MODDIR}/bin/runami_daemon" ]; then
    "${MODDIR}/bin/runami_daemon" --stop 2>/dev/null
fi
killall -9 runami_daemon 2>/dev/null

# 2. 彻底交回 xm_power 官方充电控制
for p in \
    "/sys/class/xm_power/charger/charger_thermal" \
    "/sys/class/xm_power/charger_thermal" \
    "/sys/class/xm_power/charge_interface" \
    "/sys/class/xm_power/charger/charge_interface" \
    "/sys/class/xm_power" \
    "/sys/class/power_supply/battery"; do
    if [ -f "$p/wired_thermal_remove" ]; then
        echo 0 > "$p/wired_thermal_remove" 2>/dev/null
    fi
    if [ -f "$p/wired_ctrl_limit" ]; then
        echo 0 > "$p/wired_ctrl_limit" 2>/dev/null
    fi
done

# 3. 清理 /data/vendor/thermal/config 覆盖文件并重启原厂 mi_thermald
rm -rf /data/vendor/thermal/config/* 2>/dev/null
setprop ctl.restart mi_thermald 2>/dev/null

# 4. 清理运行时日志与临时配置
rm -rf /data/adb/runami_thermald 2>/dev/null