import fs from "node:fs";
import path from "node:path";

const templateCache = new Map<string, string>();

function resolvePromptPath(relativePath: string): string {
  const customRoot = process.env.OPENCLAP_PROMPTS_DIR?.trim();
  const root = customRoot && customRoot.length > 0 ? customRoot : process.cwd();
  return path.resolve(root, relativePath);
}

export function loadPromptTemplate(relativePath: string): string {
  const cached = templateCache.get(relativePath);
  if (cached) {
    return cached;
  }

  const absolutePath = resolvePromptPath(relativePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = raw.trim();
  if (parsed.length < 1) {
    throw new Error(`Prompt template is empty: ${absolutePath}`);
  }

  templateCache.set(relativePath, parsed);
  return parsed;
}
