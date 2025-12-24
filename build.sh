#!/bin/bash
set -e

# 编译 VSCode XGo 扩展

echo "📦 Installing dependencies..."
npm --prefix /Users/haolan/project/t1/vscode-xgo/client install

echo "🔨 Compiling TypeScript..."
/Users/haolan/project/t1/vscode-xgo/client/node_modules/.bin/tsc -p /Users/haolan/project/t1/vscode-xgo/client/tsconfig.json

echo "✅ Build complete!"
echo "📁 Output directory: /Users/haolan/project/t1/vscode-xgo/client/out"
ls -lh /Users/haolan/project/t1/vscode-xgo/client/out/ 2>/dev/null || echo "Output directory will be created during compilation"
