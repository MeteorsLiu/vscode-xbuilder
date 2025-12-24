import * as vscode from 'vscode';

export interface Files {
    [path: string]: {
        content: Uint8Array;
        modTime: number;
    } | undefined;
}

/**
 * 文件系统提供者
 * 实现 xgolsw 需要的 filesProvider 接口
 */
export class FileSystemProvider {
    private fileCache: Files = {};
    private watchers: vscode.FileSystemWatcher[] = [];

    constructor(private workspaceRoot: vscode.Uri) {}

    /**
     * filesProvider 回调函数
     * 返回所有工作区文件的映射
     */
    public getFiles = (): Files => {
        return this.fileCache;
    };

    /**
     * 初始化：扫描工作区所有 XGo 文件
     */
    public async initialize(): Promise<void> {
        console.log('[XGo FileSystem] Initializing...');
        // 查找所有 XGo 文件（.spx, .gmx, .gox）
        const patterns = ['**/*.spx', '**/*.gmx', '**/*.gox'];

        for (const pattern of patterns) {
            console.log('[XGo FileSystem] Searching for:', pattern);
            const files = await vscode.workspace.findFiles(
                pattern,
                '**/node_modules/**'
            );
            console.log('[XGo FileSystem] Found', files.length, 'files for pattern:', pattern);
            await Promise.all(files.map(uri => this.loadFile(uri)));
        }

        console.log('[XGo FileSystem] Total files loaded:', Object.keys(this.fileCache).length);

        // 设置文件监听器
        this.setupWatchers();
        console.log('[XGo FileSystem] Watchers set up');
    }

    /**
     * 加载单个文件到缓存
     */
    private async loadFile(uri: vscode.Uri): Promise<void> {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            const stat = await vscode.workspace.fs.stat(uri);
            const relativePath = vscode.workspace.asRelativePath(uri, false);

            this.fileCache[relativePath] = {
                content: content,
                modTime: stat.mtime
            };

            console.log(`[XGo] Loaded file: ${relativePath}`);
        } catch (err) {
            console.error(`[XGo] Failed to load file ${uri}:`, err);
        }
    }

    /**
     * 从缓存中删除文件
     */
    private removeFile(uri: vscode.Uri): void {
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        delete this.fileCache[relativePath];
        console.log(`[XGo] Removed file: ${relativePath}`);
    }

    /**
     * 更新文件内容（从编辑器实时内容）
     * 用于同步编辑器中未保存的更改
     */
    public updateFileContent(uri: vscode.Uri, content: string): void {
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        const encoder = new TextEncoder();
        this.fileCache[relativePath] = {
            content: encoder.encode(content),
            modTime: Date.now()
        };
    }

    /**
     * 监听文件系统变化
     */
    private setupWatchers(): void {
        const patterns = ['**/*.spx', '**/*.gmx', '**/*.gox'];

        for (const pattern of patterns) {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);

            watcher.onDidCreate(uri => {
                this.loadFile(uri);
            });

            watcher.onDidChange(uri => {
                this.loadFile(uri);
            });

            watcher.onDidDelete(uri => {
                this.removeFile(uri);
            });

            this.watchers.push(watcher);
        }
    }

    public dispose(): void {
        this.watchers.forEach(w => w.dispose());
    }
}
