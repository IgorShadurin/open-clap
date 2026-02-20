const IMAGE_FILE_NAME_PATTERN =
  /\.(apng|avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i;
const IMAGE_TEXT_TRANSFER_TYPES = [
  "text/uri-list",
  "public.file-url",
  "text/html",
  "text/x-moz-url",
  "text/plain",
] as const;

export interface TransferFileDescriptor {
  name: string;
  path?: string | null;
  type?: string;
  webkitRelativePath?: string | null;
}

interface DropPathExtractionInput {
  files?: readonly TransferFileDescriptor[];
  text?: string;
  uriList?: string;
}

function isImageMimeType(value: string): boolean {
  return value.toLowerCase().startsWith("image/");
}

function isImagePath(value: string): boolean {
  return IMAGE_FILE_NAME_PATTERN.test(value.trim());
}

export function isAbsoluteFilePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function normalizePossiblePath(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function hasFileDataTransfer(
  dataTransfer: Pick<DataTransfer, "types"> | null,
): boolean {
  if (!dataTransfer) {
    return false;
  }
  return Array.from(dataTransfer.types).includes("Files");
}

export function hasImagePathDataTransfer(
  dataTransfer: Pick<DataTransfer, "types"> | null,
): boolean {
  if (!dataTransfer) {
    return false;
  }

  const types = new Set(Array.from(dataTransfer.types));
  if (types.has("Files")) {
    return true;
  }

  return IMAGE_TEXT_TRANSFER_TYPES.some((type) => types.has(type));
}

export function parseFileUriPath(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed.toLowerCase().startsWith("file://")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "file:") {
      return null;
    }

    const decodedPath = decodeURIComponent(parsed.pathname);
    if (!decodedPath) {
      return null;
    }

    if (/^\/[A-Za-z]:\//.test(decodedPath)) {
      return decodedPath.slice(1);
    }

    return decodedPath;
  } catch {
    return null;
  }
}

function parseUriList(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function parsePlainTextCandidates(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeQuotedPath(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function extractImagePathsFromUris(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const paths: string[] = [];
  for (const uri of parseUriList(value)) {
    const parsedPath = parseFileUriPath(uri);
    if (parsedPath && isImagePath(parsedPath)) {
      paths.push(parsedPath);
    }
  }

  return paths;
}

function extractImagePathsFromText(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const paths: string[] = [];
  for (const rawLine of parsePlainTextCandidates(value)) {
    const line = normalizeQuotedPath(rawLine);
    const parsedFileUriPath = parseFileUriPath(line);
    if (parsedFileUriPath && isImagePath(parsedFileUriPath)) {
      paths.push(parsedFileUriPath);
      continue;
    }

    if (isAbsoluteFilePath(line) && isImagePath(line)) {
      paths.push(line);
    }
  }

  return paths;
}

function extractImagePathsFromHtml(value: string): string[] {
  const paths: string[] = [];

  const fileUriMatches = value.match(/file:\/\/[^\s"'<>]+/giu) ?? [];
  for (const fileUri of fileUriMatches) {
    const parsedPath = parseFileUriPath(fileUri);
    if (parsedPath && isImagePath(parsedPath)) {
      paths.push(parsedPath);
    }
  }

  const absolutePathMatches = value.match(
    /(?:[A-Za-z]:[\\/]|\/)[^"'<>\n\r\t ]+\.(?:apng|avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)/giu,
  ) ?? [];
  for (const candidate of absolutePathMatches) {
    const normalized = normalizeQuotedPath(candidate);
    if (normalized.includes("://")) {
      continue;
    }
    if (isAbsoluteFilePath(normalized) && isImagePath(normalized)) {
      paths.push(normalized);
    }
  }

  return paths;
}

export function extractImagePathsFromDropData(
  input: DropPathExtractionInput,
): string[] {
  const paths: string[] = [];

  for (const file of input.files ?? []) {
    const fileLooksLikeImage =
      isImageMimeType(file.type ?? "") ||
      isImagePath(file.name) ||
      isImagePath(file.path ?? "") ||
      isImagePath(file.webkitRelativePath ?? "");

    if (!fileLooksLikeImage) {
      continue;
    }

    const directPath = normalizePossiblePath(file.path);

    if (directPath && isAbsoluteFilePath(directPath)) {
      paths.push(directPath);
      continue;
    }
  }

  if (typeof input.text === "string" && /<[a-z][\s\S]*>/i.test(input.text)) {
    paths.push(...extractImagePathsFromHtml(input.text));
  }

  paths.push(...extractImagePathsFromUris(input.uriList));
  paths.push(...extractImagePathsFromText(input.text));

  const deduped = new Set<string>();
  for (const path of paths) {
    const trimmed = path.trim();
    if (trimmed.length < 1) {
      continue;
    }
    deduped.add(trimmed);
  }

  return [...deduped];
}

export function extractFirstImagePathFromDropData(
  input: DropPathExtractionInput,
): string | null {
  const paths = extractImagePathsFromDropData(input);
  return paths.length > 0 ? paths[0] : null;
}

function collectImageTextPayload(dataTransfer: DataTransfer): string {
  const chunks: string[] = [];

  for (const transferType of IMAGE_TEXT_TRANSFER_TYPES) {
    const value = dataTransfer.getData(transferType).trim();
    if (value.length > 0) {
      chunks.push(value);
    }
  }

  return chunks.join("\n");
}

export function extractDroppedImagePaths(dataTransfer: DataTransfer): string[] {
  const files: TransferFileDescriptor[] = Array.from(dataTransfer.files).map((file) => ({
    name: file.name,
    path: (file as File & { path?: string }).path,
    type: file.type,
    webkitRelativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath,
  }));

  return extractImagePathsFromDropData({
    files,
    text: collectImageTextPayload(dataTransfer),
    uriList:
      dataTransfer.getData("text/uri-list") ||
      dataTransfer.getData("public.file-url") ||
      undefined,
  });
}

export function extractFirstDroppedImagePath(
  dataTransfer: DataTransfer,
): string | null {
  const paths = extractDroppedImagePaths(dataTransfer);
  return paths.length > 0 ? paths[0] : null;
}
