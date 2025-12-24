import { EventEmitter, Disposable } from 'vscode';
import { Message, MessageReader, MessageWriter, DataCallback, PartialMessageInfo } from 'vscode-jsonrpc';

export interface XGoLanguageServer {
    handleMessage(message: any): Error | null;
}

/**
 * 将 Go WASM LSP Server 连接到 VSCode LanguageClient
 *
 * 这是一个薄薄的传输层，因为 xgolsw 本身使用标准 LSP JSON-RPC 2.0 协议，
 * 所以不需要任何消息格式转换，只需要桥接函数调用。
 */
export class WasmLspTransport {
    private readonly _onMessage = new EventEmitter<Message>();
    private readonly _onClose = new EventEmitter<void>();
    private readonly _onError = new EventEmitter<Error>();
    private readonly _onPartialMessage = new EventEmitter<PartialMessageInfo>();

    private wasmServer?: XGoLanguageServer;

    // 实现 MessageReader 接口
    public readonly reader: MessageReader = {
        onClose: this._onClose.event,
        onError: this._onError.event,
        onPartialMessage: this._onPartialMessage.event,
        listen: (callback: DataCallback): Disposable => {
            return this._onMessage.event((message) => {
                callback(message);
            });
        },
        dispose: (): void => this.dispose()
    };

    // MessageWriter 需要不同的 onError 类型
    private readonly _onWriterError = new EventEmitter<[Error, Message | undefined, number | undefined]>();

    // 实现 MessageWriter 接口
    public readonly writer: MessageWriter = {
        onClose: this._onClose.event,
        onError: this._onWriterError.event,
        write: (message: Message): Promise<void> => this.write(message),
        end: (): void => this.dispose(),
        dispose: (): void => this.dispose()
    };

    /**
     * 创建 messageReplier 回调函数
     * 在创建 WASM Server 实例时传入
     */
    public createMessageReplier() {
        return (message: any) => {
            // WASM Server → LanguageClient

            // For completion responses, log detailed info FIRST (before firing event)
            if (message.result !== undefined && message.id !== undefined) {
                // This is a response to a request
                if (Array.isArray(message.result)) {
                    console.log(`[XGo Transport] ← Response ID=${message.id}: array with ${message.result.length} items`);
                    if (message.result.length > 0) {
                        // Check what type of items these are
                        const firstItem = message.result[0];
                        if (firstItem.label !== undefined) {
                            console.log(`[XGo Transport] ✓ This is a COMPLETION response with CompletionItems`);
                            console.log('[XGo Transport] First 3 CompletionItems:', JSON.stringify(message.result.slice(0, 3), null, 2));
                        } else if (firstItem.range !== undefined && firstItem.target !== undefined) {
                            console.log(`[XGo Transport] ℹ️ This is a DOCUMENT LINK response (not completion)`);
                        } else {
                            console.log(`[XGo Transport] ℹ️ Unknown array item type:`, JSON.stringify(firstItem, null, 2));
                        }
                    } else {
                        console.log('[XGo Transport] ⚠️ Response is EMPTY ARRAY');
                    }
                } else if (message.result === null) {
                    console.log(`[XGo Transport] ⚠️ Response ID=${message.id}: NULL (this will cause errors!)`);
                } else if (typeof message.result === 'object') {
                    const resultPreview = JSON.stringify(message.result).substring(0, 200);
                    console.log(`[XGo Transport] ← Response ID=${message.id}: object - ${resultPreview}...`);
                } else {
                    console.log(`[XGo Transport] ← Response ID=${message.id}: ${typeof message.result}`);
                }
            } else {
                // Notification or other message
                const msgStr = JSON.stringify(message).substring(0, 200);
                console.log('[XGo Transport] ← Notification:', msgStr);
            }

            // 直接转发标准 LSP 消息，无需任何转换
            this._onMessage.fire(message);
        };
    }

    /**
     * 设置 WASM Server 实例
     */
    public setServer(server: XGoLanguageServer): void {
        this.wasmServer = server;
    }

    /**
     * 发送消息到 WASM Server
     */
    private write(message: Message): Promise<void> {
        const method = (message as any).method;
        const id = (message as any).id;

        // Log request details
        if (method === 'initialize') {
            const params = (message as any).params;
            console.log(`[XGo Transport] → Initialize request ID=${id}:`,
                `locale=${params?.locale}`,
                `rootUri=${params?.rootUri}`);
        } else if (method === 'textDocument/completion') {
            const params = (message as any).params;
            console.log(`[XGo Transport] → Completion request ID=${id} at position:`,
                `line ${params.position.line}, char ${params.position.character}`,
                `in file: ${params.textDocument.uri}`);
        } else if (method === 'textDocument/didChange') {
            const params = (message as any).params;
            const contentLen = params.contentChanges?.[0]?.text?.length ?? 0;
            console.log(`[XGo Transport] → didChange: version=${params.textDocument.version}, contentLen=${contentLen}, uri=${params.textDocument.uri}`);
        } else if (method === 'textDocument/didOpen') {
            const params = (message as any).params;
            console.log(`[XGo Transport] → didOpen: version=${params.textDocument.version}, uri=${params.textDocument.uri}`);
        }

        return new Promise((resolve, reject) => {
            if (!this.wasmServer) {
                const error = new Error('WASM Server not initialized');
                console.error('[XGo Transport] Error: WASM Server not initialized');
                this._onError.fire(error);
                reject(error);
                return;
            }

            try {
                // 直接传递标准 LSP 消息给 WASM
                const error = this.wasmServer.handleMessage(message);
                if (error) {
                    console.error('[XGo Transport] Error from WASM:', error);
                    this._onError.fire(error);
                    reject(error);
                } else {
                    resolve();
                }
            } catch (err) {
                const error = err as Error;
                console.error('[XGo Transport] Exception:', error);
                this._onError.fire(error);
                reject(err);
            }
        });
    }

    public dispose(): void {
        this._onClose.fire();
        this._onMessage.dispose();
        this._onClose.dispose();
        this._onError.dispose();
        this._onWriterError.dispose();
        this._onPartialMessage.dispose();
    }
}
