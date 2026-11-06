/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

const { createTabMemory } = ChromeUtils.importESModule(
  "resource:///modules/TabMemory.sys.mjs"
);

function createTestEnvironment() {
  const records = new Map();
  let nextId = 1;
  const tabNotes = {
    isEligible(tab) {
      return Boolean(tab?.canonicalUrl && URL.canParse(tab.canonicalUrl));
    },
    async get(tab) {
      return records.get(tab.canonicalUrl);
    },
    async set(tab, text) {
      const record = {
        id: nextId++,
        canonicalUrl: tab.canonicalUrl,
        text,
      };
      records.set(tab.canonicalUrl, record);
      return record;
    },
    async delete(tab) {
      return records.delete(tab.canonicalUrl);
    },
    async search(query) {
      const term = query.toLocaleLowerCase();
      return Array.from(records.values())
        .filter(record => record.text.toLocaleLowerCase().includes(term));
    },
  };
  const privateBrowsingUtils = {
    isWindowPrivate(window) {
      return window.isPrivate;
    },
  };

  return {
    memory: createTabMemory({ tabNotes, privateBrowsingUtils }),
    createTab({
      isPrivate = false,
      url = "https://example.com/",
    } = {}) {
      return {
        ownerGlobal: { isPrivate },
        canonicalUrl: url,
      };
    },
  };
}

add_task(async function test_save_get_and_clear() {
  const { memory, createTab } = createTestEnvironment();
  const tab = createTab();

  Assert.isNull(await memory.get(tab), "A new tab has no saved memory");

  const saved = await memory.save(tab, "  Read this research later  ");
  Assert.equal(saved.text, "Read this research later", "Notes are trimmed");
  Assert.equal(
    (await memory.get(tab)).id,
    saved.id,
    "The note can be read back from native storage"
  );

  Assert.ok(await memory.clear(tab), "A normal tab can be cleared");
  Assert.isNull(await memory.get(tab), "Clearing removes the saved memory");
});

add_task(async function test_private_browsing_is_excluded() {
  const { memory, createTab } = createTestEnvironment();
  const tab = createTab({ isPrivate: true });

  await Assert.rejects(
    memory.save(tab, "private note"),
    /unavailable in private browsing/,
    "Saving is rejected in private browsing"
  );
  Assert.isNull(await memory.get(tab), "Private tabs never expose saved notes");
  Assert.ok(
    !(await memory.clear(tab)),
    "Private tabs cannot be cleared through this API"
  );
});

add_task(async function test_input_validation() {
  const { memory, createTab } = createTestEnvironment();
  const tab = createTab();

  await Assert.rejects(memory.save(null, "note"), /browser tab is required/);
  await Assert.rejects(memory.save(tab, 42), /must be a string/);
  await Assert.rejects(
    memory.save(tab, "x".repeat(1001)),
    /limited to 1000 characters/
  );
  await Assert.rejects(memory.save(tab, "  "), /cannot be empty/);
  await Assert.rejects(
    memory.search([], 42),
    /Search query must be a string/
  );
  Assert.deepEqual(
    await memory.search([], "  "),
    [],
    "An empty query has no results"
  );
});

add_task(async function test_search_matches_native_notes() {
  const { memory, createTab } = createTestEnvironment();
  const researchTab = createTab({ url: "https://example.com/research" });
  const otherTab = createTab({ url: "https://example.com/weather" });

  await memory.save(researchTab, "Review browser engine architecture");
  await memory.save(otherTab, "Check tomorrow's forecast");

  const results = await memory.search([researchTab, otherTab], "ENGINE");
  Assert.equal(results.length, 1, "Search is case-insensitive");
  Assert.equal(results[0].tab, researchTab, "The matching tab is returned");
  Assert.equal(
    results[0].memory.text,
    "Review browser engine architecture"
  );
});

add_task(async function test_search_ignores_private_tabs() {
  const { memory, createTab } = createTestEnvironment();
  const regularTab = createTab({ url: "https://example.com/regular" });
  const privateTab = createTab({
    isPrivate: true,
    url: "https://example.com/private",
  });

  await memory.save(regularTab, "shared research");
  const results = await memory.search([regularTab, privateTab], "research");

  Assert.equal(results.length, 1);
  Assert.equal(results[0].tab, regularTab);
});

add_task(async function test_search_returns_all_duplicate_open_tabs() {
  const { memory, createTab } = createTestEnvironment();
  const firstTab = createTab({ url: "https://example.com/shared" });
  const secondTab = createTab({ url: "https://example.com/shared" });

  await memory.save(firstTab, "keep this page for later");
  const results = await memory.search([firstTab, secondTab], "later");

  Assert.equal(results.length, 2, "Every open copy of a noted URL is returned");
  Assert.ok(
    results.some(result => result.tab === firstTab),
    "The first matching tab is included"
  );
  Assert.ok(
    results.some(result => result.tab === secondTab),
    "The second matching tab is included"
  );
});
