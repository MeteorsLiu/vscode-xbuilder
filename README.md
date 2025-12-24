# VSCode XGo Extension

VSCode extension for [XGo](https://github.com/goplus/xgo) language support, powered by WebAssembly.

## Features

✨ **Full LSP Support** - Powered by [xgolsw](https://github.com/goplus/xgolsw)
- 🔍 Code completion
- 🎯 Go to definition/declaration/implementation
- 📖 Hover information
- 🔎 Find references
- 🎨 Semantic syntax highlighting
- 🐛 Real-time diagnostics
- ✏️ Symbol renaming
- 📝 Code formatting
- 💡 Signature help
- 🔗 Document links

## Requirements

- VSCode 1.100.0 or higher

## Installation

### From VSIX (Recommended)

1. Download the `.vsix` file from releases
2. In VSCode, run: `Extensions: Install from VSIX...`
3. Select the downloaded file

### From Source

1. Clone this repository
2. Build xgolsw WASM files (see below)
3. Install dependencies: `npm install`
4. Compile: `npm run compile`
5. Press F5 to run in development mode

## Building WASM Files

You need to build the xgolsw WebAssembly files first:

```bash
# Navigate to xgolsw directory
cd ../xgolsw

# Generate package data (optional)
go generate ./internal/pkgdata

# Build WASM
GOOS=js GOARCH=wasm go build -trimpath -o xgolsw.wasm

# Copy files to extension
mkdir -p ../vscode-xgo/wasm
cp xgolsw.wasm ../vscode-xgo/wasm/
cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" ../vscode-xgo/wasm/
cp index.d.ts ../vscode-xgo/wasm/xgolsw.d.ts
```

Or use the provided script:
```bash
./scripts/copy-wasm.sh
```

## Usage

1. Open a folder containing XGo files (`.spx`, `.gmx`)
2. The extension will automatically activate
3. Enjoy language features!

## Configuration

- `xgo.language`: Language for error messages (`en` or `zh`)
- `xgo.trace.server`: Trace LSP communication (for debugging)

## Architecture

This extension uses a unique architecture:

```
VSCode Extension (TypeScript)
    ↓
Custom LSP Transport (MessageTransport)
    ↓
xgolsw.wasm (Go WASM)
    ↓ Standard LSP JSON-RPC 2.0
LSP Server Implementation (Go)
```

The key insight is that xgolsw already speaks standard LSP protocol, so we only need a thin transport layer to bridge JavaScript function calls.

## Development

### Project Structure

```
vscode-xgo/
├── client/              # VSCode extension client
│   ├── src/
│   │   ├── extension.ts           # Entry point
│   │   ├── wasmLoader.ts          # WASM loader
│   │   ├── wasmLspTransport.ts    # LSP transport
│   │   └── fileSystemProvider.ts  # File system
│   └── package.json
├── wasm/                # WASM files (built from xgolsw)
│   ├── xgolsw.wasm
│   ├── wasm_exec.js
│   └── xgolsw.d.ts
├── syntaxes/            # Language grammar
└── package.json
```

### Build & Debug

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Debug in VSCode
# Press F5 to launch Extension Development Host
```

### Testing

1. Open this folder in VSCode
2. Press F5 to launch Extension Development Host
3. Open a folder with XGo files
4. Test language features

## Known Issues

- XGo resource renaming UI not implemented yet
- Only supports single workspace folder

## Contributing

Contributions welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Credits

- [xgolsw](https://github.com/goplus/xgolsw) - XGo Language Server in WebAssembly
- [xgo](https://github.com/goplus/xgo) - XGo Language
- [Go+](https://github.com/goplus/gop) - Go+ Language
