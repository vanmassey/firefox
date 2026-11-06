/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PrivateBrowsingUtils } from "resource://gre/modules/PrivateBrowsingUtils.sys.mjs";
import { SessionStore } from "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs";

const MEMORY_KEY = "firefox-tab-memory";
const MEMORY_VERSION = 1;
const MAX_NOTE_LENGTH = 4096;

/**
 * Create a Tab Memory API.
 *
 * Dependencies are injectable so the behaviour can be tested without
 * creating real browser windows or writing session state.
 *
 * @param {object} dependencies
 * @param {object} dependencies.sessionStore
 * @param {object} dependencies.privateBrowsingUtils
 * @returns {object}
 */
export function createTabMemory({ sessionStore, privateBrowsingUtils }) {
  if (!sessionStore || !privateBrowsingUtils) {
    throw new TypeError("Tab Memory requires SessionStore and PrivateBrowsingUtils");
  }

  function isUsableTab(tab) {
    return Boolean(tab?.ownerGlobal);
  }

  function isPrivate(tab) {
    return privateBrowsingUtils.isWindowPrivate(tab.ownerGlobal);
  }

  return Object.freeze({
    /**
     * Save a note on a tab. SessionStore persists the value with the tab.
     *
     * @param {MozTabbrowserTab} tab
     * @param {string} note
     * @returns {{ version: number, note: string, updatedAt: number }}
     */
    save(tab, note) {
      if (!isUsableTab(tab)) {
        throw new TypeError("A browser tab is required");
      }
      if (isPrivate(tab)) {
        throw new Error("Tab Memory is unavailable in private browsing");
      }
      if (typeof note !== "string") {
        throw new TypeError("A tab note must be a string");
      }

      const cleanedNote = note.trim();
      if (cleanedNote.length > MAX_NOTE_LENGTH) {
        throw new RangeError("Tab note exceeds the 4096-character limit");
      }

      const memory = {
        version: MEMORY_VERSION,
        note: cleanedNote,
        updatedAt: Date.now(),
      };

      sessionStore.setCustomTabValue(tab, MEMORY_KEY, JSON.stringify(memory));
      return memory;
    },

    /**
     * Read a tab's saved note.
     *
     * @param {MozTabbrowserTab} tab
     * @returns {{ version: number, note: string, updatedAt: number } | null}
     */
    get(tab) {
      if (!isUsableTab(tab) || isPrivate(tab)) {
        return null;
      }

      const stored = sessionStore.getCustomTabValue(tab, MEMORY_KEY);
      if (!stored) {
        return null;
      }

      try {
        const memory = JSON.parse(stored);
        if (
          memory?.version !== MEMORY_VERSION ||
          typeof memory.note !== "string" ||
          typeof memory.updatedAt !== "number" ||
          !Number.isFinite(memory.updatedAt)
        ) {
          return null;
        }
        return memory;
      } catch {
        return null;
      }
    },

    /**
     * Remove a tab's saved note.
     *
     * @param {MozTabbrowserTab} tab
     * @returns {boolean} Whether a tab was eligible for the operation.
     */
    clear(tab) {
      if (!isUsableTab(tab) || isPrivate(tab)) {
        return false;
      }

      sessionStore.deleteCustomTabValue(tab, MEMORY_KEY);
      return true;
    },

    /**
     * Find notes matching a query, including tab titles and URLs.
     *
     * @param {Iterable<MozTabbrowserTab>} tabs
     * @param {string} query
     * @returns {Array<{ tab: MozTabbrowserTab, memory: object }>}
     */
    search(tabs, query) {
      if (typeof query !== "string") {
        throw new TypeError("Search query must be a string");
      }

      const term = query.trim().toLocaleLowerCase();
      if (!term) {
        return [];
      }

      return Array.from(tabs, tab => ({
        tab,
        memory: this.get(tab),
        title: tab?.label || "",
        url: tab?.linkedBrowser?.currentURI?.spec || "",
      })).filter(({ memory, title, url }) => {
        if (!memory) {
          return false;
        }
        return [memory.note, title, url].some(value =>
          value.toLocaleLowerCase().includes(term)
        );
      }).map(({ tab, memory }) => ({ tab, memory }));
    },
  });
}

export const TabMemory = createTabMemory({
  sessionStore: SessionStore,
  privateBrowsingUtils: PrivateBrowsingUtils,
});
