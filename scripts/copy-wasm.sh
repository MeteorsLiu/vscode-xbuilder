#!/bin/bash

# 从 xgolsw 项目复制 WASM 文件到扩展目录
# 使用方法: ./scripts/copy-wasm.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$(dirname "$SCRIPT_DIR")"
XGOLSW_DIR="$EXTENSION_DIR/../xgolsw"

echo "🔨 Building xgolsw WASM..."
cd "$XGOLSW_DIR"

# 生成包数据（可选）
echo "📦 Generating package data..."
go generate ./internal/pkgdata || echo "⚠️  Package data generation skipped"

# 编译 WASM
echo "🔧 Compiling WASM..."
GOOS=js GOARCH=wasm go build -trimpath -o xgolsw.wasm

# 创建目标目录
echo "📁 Creating wasm directory..."
mkdir -p "$EXTENSION_DIR/wasm"

# 复制文件
echo "📋 Copying files..."
cp xgolsw.wasm "$EXTENSION_DIR/wasm/"
cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" "$EXTENSION_DIR/wasm/"
cp index.d.ts "$EXTENSION_DIR/wasm/xgolsw.d.ts"

echo "✅ Done! WASM files copied to $EXTENSION_DIR/wasm/"
ls -lh "$EXTENSION_DIR/wasm/"
