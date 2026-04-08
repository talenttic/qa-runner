import path from "node:path";
import { fileURLToPath } from "node:url";

export const uiVersion = "0.1.0";

export function getUiAssetDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "dist-ui");
}
