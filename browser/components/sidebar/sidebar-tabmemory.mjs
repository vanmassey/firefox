/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { TabNotes } from "moz-src:///browser/components/tabnotes/TabNotes.sys.mjs";
import { PrivateBrowsingUtils } from "resource://gre/modules/PrivateBrowsingUtils.sys.mjs";

const search = document.getElementById("search");
const notes = document.getElementById("notes");
const status = document.getElementById("status");
const strings = new Localization(["browser/sidebar.ftl"], true);
const chromeWindow = window.top;
let refreshGeneration = 0;

function setStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

async function localized(id) {
  return strings.formatValue(id);
}

function makeButton(label, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await callback();
    } catch (error) {
      console.error("Tab Memory action failed", error);
      setStatus(await localized("sidebar-tabmemory-error"));
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function makeStoredTab(url) {
  // TabNotes uses the tab's canonical URL and dispatches its change event.
  // An EventTarget is sufficient for notes belonging to tabs that are closed.
  return Object.assign(new EventTarget(), { canonicalUrl: url });
}

async function refresh() {
  const generation = ++refreshGeneration;
  notes.replaceChildren();

  if (PrivateBrowsingUtils.isWindowPrivate(chromeWindow)) {
    setStatus(await localized("sidebar-tabmemory-private"));
    search.disabled = true;
    return;
  }
  search.disabled = false;

  const query = search.value.trim();
  const records = query ? await TabNotes.search(query) : await TabNotes.list();
  if (generation !== refreshGeneration) {
    return;
  }

  setStatus(records.length ? "" : await localized("sidebar-tabmemory-empty"));
  const labels = {
    open: await localized("sidebar-tabmemory-open"),
    edit: await localized("sidebar-tabmemory-edit"),
    delete: await localized("sidebar-tabmemory-delete"),
  };

  for (const record of records) {
    const item = document.createElement("li");
    item.className = "tabmemory-note";

    const address = document.createElement("div");
    address.className = "tabmemory-url";
    address.textContent = record.canonicalUrl;

    const preview = document.createElement("p");
    preview.textContent = record.text;

    const actions = document.createElement("div");
    actions.className = "tabmemory-actions";
    actions.append(
      makeButton(labels.open, () => {
        chromeWindow.openTrustedLinkIn(record.canonicalUrl, "tab");
      }),
      makeButton(labels.edit, async () => {
        const input = { value: record.text };
        const accepted = Services.prompt.prompt(
          chromeWindow,
          await localized("sidebar-tabmemory-edit-title"),
          await localized("sidebar-tabmemory-edit-prompt"),
          input,
          null,
          { value: false }
        );
        if (!accepted || !input.value.trim()) {
          return;
        }
        await TabNotes.set(
          makeStoredTab(record.canonicalUrl),
          input.value.trim()
        );
        await refresh();
      }),
      makeButton(labels.delete, async () => {
        if (
          !Services.prompt.confirm(
            chromeWindow,
            await localized("sidebar-tabmemory-delete-title"),
            await localized("sidebar-tabmemory-delete-prompt")
          )
        ) {
          return;
        }
        await TabNotes.delete(makeStoredTab(record.canonicalUrl));
        await refresh();
      })
    );

    item.append(address, preview, actions);
    notes.append(item);
  }
}

search.addEventListener("input", () => {
  refresh().catch(error => {
    console.error("Unable to search Tab Memory", error);
    setStatus(error.message || "Tab Memory could not be loaded.");
  });
});

refresh().catch(error => {
  console.error("Unable to load Tab Memory", error);
  setStatus(error.message || "Tab Memory could not be loaded.");
});
