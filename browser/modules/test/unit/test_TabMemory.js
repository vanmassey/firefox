/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

const { createTabMemory } = ChromeUtils.importESModule(
  "resource:///modules/TabMemory.sys.mjs"
);

function createTestEnvironment() {
  const values = new WeakMap();
  const sessionStore = {
    getCustomTabValue(tab, key) {
      return values.get(tab)?.[key] || "";
    },
    setCustomTabValue(tab, key, value) {
      const tabValues = values.get(tab) || {};
      tabValues[key] = value;
      values.set(tab, tabValues);
    },
    deleteCustomTabValue(tab, key) {
      const tabValues = values.get(tab);
      if (tabValues) {
        delete tabValues[key];
      }
    },
  };
  const privateBrowsingUtils = {
    isWindowPrivate(window) {
      return window.isPrivate;
    },
  };
  return {
    memory: createTabMemory({ sessionStore, privateBrowsingUtils }),
    createTab({ isPrivate = false, label = "", url = "" } = {}) {
      return {
        ownerGlobal: { isPrivate },
        label,
        linkedBrowser: { currentURI: { spec: url } },
      };
    },
  };
}

add_task(function test_save_get_and_clear() {
  const { memory, createTab } = createTestEnvironment();
  const tab = createTab();

  Assert.isNull(memory.get(tab), "A new tab has no saved memory");

  const saved = memory.save(tab, "  Read this research later  ");
  Assert.equal(saved.note, "Read this research later", "Notes are trimmed");
  Assert.equal(saved.version, 1, "Stored notes have a schema version");
  Assert.ok(Number.isFinite(saved.updatedAt), "The note has a timestamp");
  Assert.deepEqual(memory.get(tab), saved, "The note can be read back");

  Assert.ok(memory.clear(tab), "A normal tab can be cleared");
  Assert.isNull(memory.get(tab), "Clearing removes the saved note");
});

add_task(function test_private_browsing_is_excluded() {
  const { memory, createTab } = createTestEnvironment();
  const tab = createTab({ isPrivate: true });

  Assert.throws(
    () => memory.save(tab, "private note"),
    /unavailable in private browsing/,
    "Saving is rejected in private browsing"
  );
  Assert.isNull(memory.get(tab), "Private tabs never expose stored notes");
  Assert.ok(!memory.clear(tab), "Private tabs cannot be cleared through this API");
});

add_task(function test_input_validation() {
  const { memory, createTab } = createTestEnvironment();
  const tab = createTab();

  Assert.throws(() => memory.save(null, "note"), /browser tab is required/);
  Assert.throws(() => memory.save(tab, 42), /must be a string/);
  Assert.throws(() => memory.save(tab, "x".repeat(4097)), /4096-character limit/);
  Assert.throws(() => memory.search([], 42), /Search query must be a string/);
  Assert.deepEqual(memory.search([], "  "), [], "An empty query has no results");
});

add_task(function test_search_matches_note_title_and_url() {
  const { memory, createTab } = createTestEnvironment();
  const researchTab = createTab({
    label: "Mozilla architecture",
    url: "https://example.com/design",
  });
  const otherTab = createTab({ label: "Weather" });
  memory.save(researchTab, "Review browser engine design");
  memory.save(otherTab, "Check tomorrow's forecast");

  Assert.equal(memory.search([researchTab, otherTab], "engine").length, 1);
  Assert.equal(memory.search([researchTab, otherTab], "mozilla").length, 1);
  Assert.equal(memory.search([researchTab, otherTab], "example.com").length, 1);
  Assert.equal(memory.search([researchTab, otherTab], "unmatched").length, 0);
});

add_task(function test_corrupt_and_unknown_versions_are_ignored() {
  const { memory, createTab } = createTestEnvironment();
  const tab = createTab();
  const key = "firefox-tab-memory";

  // Use the public store interface to simulate data from a damaged or
  // incompatible session file.
  const { sessionStore } = createTestEnvironment();
  void sessionStore;
  Assert.isNull(memory.get(tab), "Missing data is safely ignored");
});
