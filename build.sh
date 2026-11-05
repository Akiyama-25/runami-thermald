#!/bin/bash
# Runami Thermald 本地与 CI 构建打包脚本
set -e

VERSION=$(grep -E '^version=' module.prop | cut -d'=' -f2 | tr -d ' \r\n')
VERSION=${VERSION:-"v1.0.0"}
DIST_DIR="dist"
PACKAGE_DIR="${DIST_DIR}/package"
MODULE_ZIP="${DIST_DIR}/Runami-Thermald-${VERSION}.zip"

echo "=== 开始构建 Runami Thermald [${VERSION}] ==="

if [ "$1" == "--test" ]; then
    echo ">>> 1. 运行 Shell 脚本语法静态校验..."
    bash -n service.sh
    bash -n action.sh
    bash -n customize.sh
    bash -n uninstall.sh
    bash -n post-fs-data.sh
    bash -n bin/runami_daemon
    bash -n bin/runami_ctl
    echo "[√] 所有 Shell 脚本静态语法检查通过！"

    echo ">>> 2. 运行 AES-128-CBC 加解密引擎单元自检..."
    python3 -c "
import subprocess
test_data = '[SS-CPU7]\nalgo_type ss\nsensor VIRTUAL-SENSOR0\ndevice cpu7\ntrig 52000\nclr 49000\ntarget 3300000\n'
hex_in = test_data.encode().hex()

p1 = subprocess.Popen(['awk', '-f', 'bin/mtaes.awk'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
enc_out, _ = p1.communicate(input=hex_in)
enc_hex = enc_out.replace('\n', '').strip()

p2 = subprocess.Popen(['awk', '-f', 'bin/mtdec.awk'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
dec_out, _ = p2.communicate(input=enc_hex)
dec_hex = dec_out.replace('\n', '').strip()
dec_str = bytes.fromhex(dec_hex).decode('utf-8')

assert dec_str == test_data, 'AES 解密数据与原数据不匹配'
print('[√] AES-128-CBC (toybox awk) 往返加解密 100% 字节一致性测试通过！')
"
fi

if [ "$1" == "--package" ] || [ "$1" == "" ]; then
    echo ">>> 3. 准备模块打包目录结构 (${PACKAGE_DIR})..."
    rm -rf "${PACKAGE_DIR}"
    mkdir -p "${PACKAGE_DIR}"
    mkdir -p "${DIST_DIR}"
    rm -f "${MODULE_ZIP}"

    items_to_copy=(
        "module.prop"
        "action.sh"
        "update.json"
        "customize.sh"
        "service.sh"
        "post-fs-data.sh"
        "uninstall.sh"
        "webui.html"
        "bin"
        "config"
        "webroot"
        "webui"
    )

    for item in "${items_to_copy[@]}"; do
        if [ -e "$item" ]; then
            cp -r "$item" "${PACKAGE_DIR}/"
        fi
    done

    echo ">>> 4. 打包可刷入的 KernelSU / Magisk 模块压缩包..."
    python3 -c "
import zipfile, os

zip_path = '${MODULE_ZIP}'
pkg_dir = '${PACKAGE_DIR}'

with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, dirs, files in os.walk(pkg_dir):
        for f in files:
            if f.startswith('.') or f.endswith('.swp'):
                continue
            full_p = os.path.join(root, f)
            rel_p = os.path.relpath(full_p, pkg_dir)
            zf.write(full_p, rel_p)

print('Successfully created zip archive with', len(zf.namelist()), 'entries.')
"

    echo ">>> 5. 生成完整性 SHA256 校验码..."
    sha256sum "${MODULE_ZIP}" > "${MODULE_ZIP}.sha256"
    cat "${MODULE_ZIP}.sha256"
    echo ""
    echo "[√] 模块打包完成: ${MODULE_ZIP}"
    echo "[√] 散装模块目录就绪 (供给 GitHub Actions Artifact 免双重压缩): ${PACKAGE_DIR}"
fi