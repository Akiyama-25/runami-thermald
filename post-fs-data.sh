#!/system/bin/sh
# Runami Thermald - post-fs-data 阶段挂载准备
# 作者: 迷人の爱音

MODDIR=${0%/*}

# 开机阶段清除上一轮运行日志与状态缓存
rm -f /data/adb/runami_thermald/runami.log* /data/adb/runami_thermald/state.json* /data/adb/runami_thermald/runami_daemon.pid* 2>/dev/null

# 确保 mi_thermald 覆盖目录存在且具备 system 读写权限
if [ ! -d "/data/vendor/thermal/config" ]; then
    mkdir -p "/data/vendor/thermal/config"
    chmod 0771 "/data/vendor/thermal/config"
    chown root:system "/data/vendor/thermal/config" 2>/dev/null
fi