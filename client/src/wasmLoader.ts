import * as vscode from 'vscode';

// 声明全局 Go WASM 类型
declare global {
    class Go {
        importObject: WebAssembly.Imports;
        run(instance: WebAssembly.Instance): Promise<void>;
    }
}

/**
 * 加载 Go WASM 模块
 */
export async function loadGoWasm(context: vscode.ExtensionContext): Promise<void> {
    console.log('[XGo WASM] Starting WASM load...');
    const wasmPath = vscode.Uri.joinPath(context.extensionUri, 'wasm');

    // 1. 加载并执行 wasm_exec.js (Go 运行时)
    console.log('[XGo WASM] Loading wasm_exec.js...');
    const wasmExecPath = vscode.Uri.joinPath(wasmPath, 'wasm_exec.js');
    const wasmExecCode = await vscode.workspace.fs.readFile(wasmExecPath);
    console.log('[XGo WASM] wasm_exec.js loaded, size:', wasmExecCode.length);

    // 在全局作用域执行 Go 运行时代码
    const goRuntimeCode = new TextDecoder('utf-8').decode(wasmExecCode);
    const goRuntime = new Function(goRuntimeCode);
    goRuntime();
    console.log('[XGo WASM] Go runtime initialized');

    // 2. 加载 WASM 二进制
    console.log('[XGo WASM] Loading xgolsw.wasm...');
    const wasmFile = vscode.Uri.joinPath(wasmPath, 'xgolsw.wasm');
    const wasmBytes = await vscode.workspace.fs.readFile(wasmFile);
    console.log('[XGo WASM] WASM binary loaded, size:', wasmBytes.length);

    // 3. 初始化 Go 实例
    console.log('[XGo WASM] Compiling WASM module...');
    const go = new (globalThis as any).Go();
    const wasmModule = await WebAssembly.compile(new Uint8Array(wasmBytes));
    console.log('[XGo WASM] WASM module compiled');

    console.log('[XGo WASM] Instantiating WASM module...');
    const instance = await WebAssembly.instantiate(wasmModule, go.importObject);
    console.log('[XGo WASM] WASM module instantiated');

    // 4. 启动 Go 运行时（非阻塞）
    console.log('[XGo WASM] Starting Go runtime...');
    (go.run as any)(instance);
    console.log('[XGo WASM] Go runtime started (non-blocking)');

    // 5. 等待 Go 初始化完成（导出全局函数）
    console.log('[XGo WASM] Waiting for global functions to be exported...');
    await waitForGlobalFunction('NewXGoLanguageServer', 5000);
    console.log('[XGo WASM] Global functions exported successfully');
}

/**
 * 等待全局函数被导出
 */
function waitForGlobalFunction(name: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            if ((globalThis as any)[name]) {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                reject(new Error(`Timeout waiting for ${name} to be exported from WASM module`));
            }
        }, 50);
    });
}
