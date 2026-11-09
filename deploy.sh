#!/bin/bash

# 服务器重启服务脚本
# 遇到错误立即退出
set -e

echo "====================================="
echo "🚀 开始部署 pic 项目..."
echo "====================================="

# 1. 拉取最新代码
echo "1️⃣ 正在拉取最新代码 (git pull)..."
git pull

# 2. 编译 Go 项目
echo "2️⃣ 正在编译项目 (go build)..."
go build -o pic-server ./cmd/api/
echo "✅ 编译成功！"

# 3. 重启 systemd 服务
echo "3️⃣ 正在重启服务 (systemctl restart pic)..."
systemctl restart pic

# 4. 等待几秒，检查服务状态
echo "4️⃣ 等待服务启动..."
sleep 3

if systemctl is-active --quiet pic; then
    echo "====================================="
    echo "🎉 部署成功！pic 服务正在运行。"
    echo "====================================="
else
    echo "====================================="
    echo "❌ 部署失败！服务未能正常启动。"
    echo "请执行以下命令查看错误日志："
    echo "journalctl -u pic -n 50 --no-pager"
    echo "====================================="
    exit 1
fi