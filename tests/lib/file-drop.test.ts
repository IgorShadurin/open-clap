import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import {
  extractFirstImagePathFromDropData,
  extractImagePathsFromDropData,
  hasImagePathDataTransfer,
  parseFileUriPath,
} from "../../src/lib/file-drop";

test("parseFileUriPath decodes unix file URIs", () => {
  assert.equal(
    parseFileUriPath("file:///Users/test/Pictures/screenshot%201.png"),
    "/Users/test/Pictures/screenshot 1.png",
  );
});

test("parseFileUriPath normalizes windows file URIs", () => {
  assert.equal(
    parseFileUriPath("file:///C:/Users/Test/Pictures/screenshot.png"),
    "C:/Users/Test/Pictures/screenshot.png",
  );
});

test("extractFirstImagePathFromDropData uses image file path from transfer files", () => {
  const result = extractFirstImagePathFromDropData({
    files: [
      {
        name: "screenshot.png",
        path: "/Users/test/Desktop/screenshot.png",
        type: "image/png",
      },
    ],
  });

  assert.equal(result, "/Users/test/Desktop/screenshot.png");
});

test("extractFirstImagePathFromDropData falls back to text/uri-list", () => {
  const result = extractFirstImagePathFromDropData({
    uriList: "file:///Users/test/Desktop/notes.txt\nfile:///Users/test/Desktop/shot.webp",
  });

  assert.equal(result, "/Users/test/Desktop/shot.webp");
});

test("extractFirstImagePathFromDropData accepts quoted absolute text paths", () => {
  const result = extractFirstImagePathFromDropData({
    text: "\"/Users/test/Desktop/shot.heic\"",
  });

  assert.equal(result, "/Users/test/Desktop/shot.heic");
});

test("extractFirstImagePathFromDropData ignores non-image drop data", () => {
  const result = extractFirstImagePathFromDropData({
    text: "/Users/test/Desktop/notes.txt",
    uriList: "file:///Users/test/Desktop/notes.md",
  });

  assert.equal(result, null);
});

test("extractImagePathsFromDropData returns multiple unique paths", () => {
  const result = extractImagePathsFromDropData({
    files: [
      {
        name: "a.png",
        path: "/Users/test/Desktop/a.png",
        type: "image/png",
      },
      {
        name: "a.png",
        path: "/Users/test/Desktop/a.png",
        type: "image/png",
      },
      {
        name: "doc.txt",
        path: "/Users/test/Desktop/doc.txt",
        type: "text/plain",
      },
    ],
    text: "\"/Users/test/Desktop/b.webp\"",
    uriList:
      "file:///Users/test/Desktop/c.heic\nfile:///Users/test/Desktop/notes.md",
  });

  assert.deepEqual(result, [
    "/Users/test/Desktop/a.png",
    "/Users/test/Desktop/c.heic",
    "/Users/test/Desktop/b.webp",
  ]);
});

test("hasImagePathDataTransfer detects uri-list drag payload", () => {
  const result = hasImagePathDataTransfer({
    types: ["text/uri-list"],
  } as Pick<DataTransfer, "types">);

  assert.equal(result, true);
});

test("extractImagePathsFromDropData ignores image filename when absolute path is hidden", () => {
  const result = extractImagePathsFromDropData({
    files: [
      {
        name: "Screenshot 2026-02-20 at 16.44.10.png",
        type: "image/png",
      },
    ],
  });

  assert.deepEqual(result, []);
});

test("extractImagePathsFromDropData extracts file paths from html payload", () => {
  const result = extractImagePathsFromDropData({
    text: '<img src="file:///Users/example/Desktop/shot%20from%20html.png" />',
  });

  assert.deepEqual(result, ["/Users/example/Desktop/shot from html.png"]);
});
