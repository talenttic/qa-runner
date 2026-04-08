export type FileSystemAdapter = {
    readFile(path: string): Promise<string> | string;
    writeFile(path: string, content: string): Promise<void> | void;
    exists(path: string): Promise<boolean> | boolean;
    ensureDir(path: string): Promise<void> | void;
};
export type GitAdapter = {
    diff(base: string, head: string): Promise<string> | string;
    changedFiles(base: string, head: string): Promise<string[]> | string[];
};
export type ModelAdapter = {
    generate(prompt: string, context?: Record<string, unknown>): Promise<string> | string;
};
export type ClockAdapter = {
    now(): number;
};
//# sourceMappingURL=types.d.ts.map