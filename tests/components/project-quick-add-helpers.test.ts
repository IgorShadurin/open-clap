import assert from "node:assert/strict";
import test from "node:test";

import { formatProjectNameFromPath } from "../../src/components/quick-add/project-quick-add-helpers";

test("formatProjectNameFromPath derives title name from kebab path segment", () => {
  assert.equal(
    formatProjectNameFromPath("/Users/test/XCodeProjects/video-downloader"),
    "Video Downloader",
  );
});

test("formatProjectNameFromPath splits camel case and underscores", () => {
  assert.equal(
    formatProjectNameFromPath("/Users/test/XCodeProjects/VideoDownloader_App"),
    "Video Downloader App",
  );
});

test("formatProjectNameFromPath returns empty string for invalid segment", () => {
  assert.equal(formatProjectNameFromPath("////"), "");
});
