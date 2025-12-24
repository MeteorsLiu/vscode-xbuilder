import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions } from 'vscode-languageclient/node';
import { loadGoWasm } from './wasmLoader';
import { WasmLspTransport, XGoLanguageServer } from './wasmLspTransport';
import { FileSystemProvider } from './fileSystemProvider';

let client: LanguageClient | undefined;
let fsProvider: FileSystemProvider | undefined;

/**
 * 扩展激活入口
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('[XGo] Extension activating...');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        console.log('[XGo] No workspace folder found');
        vscode.window.showWarningMessage('No workspace folder found. XGo extension requires an open workspace.');
        return;
    }

    console.log('[XGo] Workspace folder:', workspaceFolder.uri.fsPath);

    try {
        // 1. 加载 Go WASM 运行时
        console.log('[XGo] Step 1: Loading WASM...');
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'XGo Language Server',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Loading WASM module...' });
            await loadGoWasm(context);
        });
        console.log('[XGo] WASM loaded successfully');

        // 2. 创建文件系统提供者
        console.log('[XGo] Step 2: Initializing file system...');
        fsProvider = new FileSystemProvider(workspaceFolder.uri);

        await fsProvider.initialize();
        const files = fsProvider.getFiles();
        console.log('[XGo] File system initialized, files found:', Object.keys(files).length);
        console.log('[XGo] Files:', Object.keys(files));

        // 3. 创建传输层
        console.log('[XGo] Step 3: Creating transport...');
        const transport = new WasmLspTransport();

        // 4. 创建 WASM Server 实例
        console.log('[XGo] Step 4: Creating WASM Server instance...');
        const NewXGoLanguageServer = (globalThis as any).NewXGoLanguageServer;
        if (!NewXGoLanguageServer) {
            throw new Error('NewXGoLanguageServer not found in global scope');
        }

        console.log('[XGo] Calling NewXGoLanguageServer...');

        const server = NewXGoLanguageServer(
            fsProvider.getFiles,
            transport.createMessageReplier()
        );

        if (server instanceof Error) {
            console.error('[XGo] Server creation failed:', server);
            throw server;
        }

        console.log('[XGo] Server created successfully');

        // 设置服务器实例
        transport.setServer(server as XGoLanguageServer);

        // 5. 配置 Language Client
        // 直接使用 transport 作为 reader/writer

        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                { scheme: 'file', language: 'xgo' },
                { scheme: 'file', pattern: '**/*.{spx,gmx,gox}' }
            ],
            synchronize: {
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{spx,gmx,gox}')
            },
            outputChannelName: 'XGo Language Server',
            revealOutputChannelOn: 2, // Show on Info (显示所有消息)
            traceOutputChannel: vscode.window.createOutputChannel('XGo Language Server Trace')
        };

        // 6. 创建并启动 Language Client
        console.log('[XGo] Step 5: Creating Language Client...');
        client = new LanguageClient(
            'xgo-lsp',
            'XGo Language Server',
            () => Promise.resolve({ reader: transport.reader, writer: transport.writer }),
            clientOptions
        );

        console.log('[XGo] Step 6: Starting Language Client...');
        await client.start();
        console.log('[XGo] Language Client started');

        // Debug: Print active document info
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            console.log('[XGo] Active document:', {
                fileName: activeEditor.document.fileName,
                languageId: activeEditor.document.languageId,
                uri: activeEditor.document.uri.toString()
            });
        }

        // Debug: Monitor document opens
        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(doc => {
                if (doc.fileName.endsWith('.spx') ||
                    doc.fileName.endsWith('.gmx') ||
                    doc.fileName.endsWith('.gox')) {
                    console.log('[XGo] Document opened:', {
                        fileName: doc.fileName,
                        languageId: doc.languageId,
                        uri: doc.uri.toString()
                    });
                    // 同步打开文档的内容到文件缓存
                    fsProvider?.updateFileContent(doc.uri, doc.getText());
                }
            })
        );

        // 同步编辑器中的实时内容到文件缓存
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const doc = event.document;
                if (doc.fileName.endsWith('.spx') ||
                    doc.fileName.endsWith('.gmx') ||
                    doc.fileName.endsWith('.gox')) {
                    // 更新文件缓存为编辑器中的实时内容
                    fsProvider?.updateFileContent(doc.uri, doc.getText());
                }
            })
        );

        // Auto-trigger signature help for bash-style function calls (e.g., "say ")
        // When user types a space after an identifier, trigger signature help
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(async (event) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor || event.document !== editor.document) {
                    return;
                }

                // Check if this is an XGo file
                if (!event.document.fileName.endsWith('.spx') &&
                    !event.document.fileName.endsWith('.gmx') &&
                    !event.document.fileName.endsWith('.gox')) {
                    return;
                }

                // Check if the last change was typing a space
                for (const change of event.contentChanges) {
                    if (change.text === ' ') {
                        const position = editor.selection.active;
                        const line = editor.document.lineAt(position.line);
                        const textBeforeCursor = line.text.substring(0, position.character);

                        // Check if there's an identifier before the space
                        // Match pattern: word characters followed by space
                        const match = textBeforeCursor.match(/\b([a-zA-Z_]\w*)\s+$/);
                        if (match) {
                            console.log('[XGo] Detected bash-style call, triggering signature help for:', match[1]);
                            // Trigger signature help
                            await vscode.commands.executeCommand('editor.action.triggerParameterHints');
                        }
                    }
                }
            })
        );

        // Debug: Register a manual completion command to test
        context.subscriptions.push(
            vscode.commands.registerCommand('xgo.testCompletion', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active editor');
                    return;
                }
                console.log('[XGo Test] Active editor info:', {
                    fileName: editor.document.fileName,
                    languageId: editor.document.languageId,
                    uri: editor.document.uri.toString(),
                    position: editor.selection.active
                });

                // Try to trigger completion manually
                await vscode.commands.executeCommand('editor.action.triggerSuggest');
            })
        );

        vscode.window.showInformationMessage('XGo Language Server started successfully! 🚀');

        // 7. 注册自定义命令
        console.log('[XGo] Step 7: Registering commands...');
        registerCommands(context);

        console.log('[XGo] Extension activation complete!');

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to start XGo Language Server: ${message}`);
        console.error('[XGo] Activation error:', error);
    }
}

/**
 * 注册扩展命令
 */
function registerCommands(context: vscode.ExtensionContext) {
    // Only register commands that aren't already registered
    vscode.commands.getCommands(true).then(commands => {
        if (!commands.includes('xgo.renameResource')) {
            const renameResourceCmd = vscode.commands.registerCommand('xgo.renameResource', async () => {
                if (!client) {
                    vscode.window.showErrorMessage('XGo Language Server is not running');
                    return;
                }

                // TODO: 实现资源重命名 UI
                vscode.window.showInformationMessage('XGo: Resource rename feature coming soon!');
            });

            context.subscriptions.push(renameResourceCmd);
        }
    });
}

/**
 * 扩展停用
 */
export async function deactivate() {
    if (client) {
        await client.stop();
    }
    if (fsProvider) {
        fsProvider.dispose();
    }
}
