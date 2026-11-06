/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PrivateBrowsingUtils } from "resource://gre/modules/PrivateBrowsingUtils.sys.mjs";
import { TabNotes } from "moz-src:///browser/components/tabnotes/TabNotes.sys.mjs";

/**
 * Tab Memory builds cross-tab retrieval on top of Firefox's native Tab Notes
 * database. Notes remain owned by TabNotes; this module adds a focused search
 * API and applies private-browsing restrictions.
 *
 * @param {object} dependencies
 * @param {object} dependencies.tabNotes
 * @param {object} dependencies.privateBrowsingUtils
 * @returns {object}
 */
export function createTabMemory({ tabNotes, privateBrowsingUtils }) {
  if (!tabNotes || !privateBrowsingUtils) {
    throw new TypeError("Tab Memory requires TabNotes and PrivateBrowsingUtils");
  }

  function isUsableTab(tab) {
    return Boolean(tab?.ownerGlobal && tabNotes.isEligible(tab));
  }

  function isPrivate(tab) {
    return privateBrowsingUtils.isWindowPrivate(tab.ownerGlobal);
  }

  return Object.freeze({
    /**
     * Save context using Firefox's existing native tab-note database.
     *
     * @param {MozTabbrowserTab} tab
     * @param {string} note
     * @returns {Promise<TabNoteRecord>}
     */
    async save(tab, note) {
      if (!tab?.ownerGlobal) {
        throw new TypeError("A browser tab is required");
      }
      if (isPrivate(tab)) {
        throw new Error("Tab Memory is unavailable in private browsing");
      }
      if (!isUsableTab(tab)) {
        throw new TypeError("This tab cannot store memory");
      }
      if (typeof note !== "string") {
        throw new TypeError("A tab memory note must be a string");
      }

      const cleanedNote = note.trim();
      if (!cleanedNote) {
        throw new TypeError("A tab memory note cannot be empty");
      }
      if (cleanedNote.length > 1000) {
        throw new RangeError("Tab memory notes are limited to 1000 characters");
      }

      return tabNotes.set(tab, cleanedNote);
    },

    /**
     * Retrieve the note associated with a tab.
     *
     * @param {MozTabbrowserTab} tab
     * @returns {Promise<TabNoteRecord|null>}
     */
    async get(tab) {
      if (!tab?.ownerGlobal || isPrivate(tab) || !isUsableTab(tab)) {
        return null;
      }
      return (await tabNotes.get(tab)) ?? null;
    },

    /**
     * Remove a tab's saved memory.
     *
     * @param {MozTabbrowserTab} tab
     * @returns {Promise<boolean>}
     */
    async clear(tab) {
      if (!tab?.ownerGlobal || isPrivate(tab) || !isUsableTab(tab)) {
        return false;
      }
      return tabNotes.delete(tab);
    },

    /**
     * Search saved notes and return the matching open tabs.
     *
     * @param {Iterable<MozTabbrowserTab>} tabs
     * @param {string} query
     * @returns {Promise<Array<{tab: MozTabbrowserTab, memory: TabNoteRecord}>>}
     */
    async search(tabs, query) {
      if (typeof query !== "string") {
        throw new TypeError("Search query must be a string");
      }

      const term = query.trim();
      if (!term) {
        return [];
      }

      const records = await tabNotes.search(term);
      const tabsByURL = new Map();
      for (const tab of tabs) {
        if (!isUsableTab(tab) || isPrivate(tab)) {
          continue;
        }
        const matchingTabs = tabsByURL.get(tab.canonicalUrl) ?? [];
        matchingTabs.push(tab);
        tabsByURL.set(tab.canonicalUrl, matchingTabs);
      }

      return records.flatMap(memory =>
        (tabsByURL.get(memory.canonicalUrl) ?? []).map(tab => ({
          tab,
          memory,
        }))
      );
    },
  });
}

export const TabMemory = createTabMemory({
  tabNotes: TabNotes,
  privateBrowsingUtils: PrivateBrowsingUtils,
});
