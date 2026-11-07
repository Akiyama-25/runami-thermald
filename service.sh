#!/system/bin/sh
# Runami Thermald - 开机启动服务
# 作者: 迷人の爱音

MODDIR=${0%/*}

# 开机重启清除旧运行日志与陈旧状态文件 (确保开机首轮状态绝对纯净)
DATADIR="/data/adb/runami_thermald"
rm -f "${DATADIR}/runami.log"* "${DATADIR}/state.json"* "${DATADIR}/runami_daemon.pid"* 2>/dev/null

# 等待系统完整就绪
until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 2
done

# 再等待 5 秒确保各 thermal hal 与 power supply 驱动加载完毕
sleep 5

# 启动核心守护进程
if [ -x "${MODDIR}/bin/runami_daemon" ]; then
    "${MODDIR}/bin/runami_daemon" --start
fi