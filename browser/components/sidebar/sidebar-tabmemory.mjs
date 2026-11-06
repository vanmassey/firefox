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

function setStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

function makeButton(label, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}

function makeStoredTab(url) {
  return Object.assign(new EventTarget(), { canonicalUrl: url });
}

async function refresh() {
  notes.replaceChildren();
  if (PrivateBrowsingUtils.isWindowPrivate(chromeWindow)) {
    setStatus(await strings.formatValue("sidebar-tabmemory-private"));
    return;
  }
  const query = search.value.trim();
  const records = query ? await TabNotes.search(query) : await TabNotes.list();
  setStatus(records.length ? "" : await strings.formatValue("sidebar-tabmemory-empty"));
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
      makeButton(await strings.formatValue("sidebar-tabmemory-open"), () => {
        chromeWindow.openTrustedLinkIn(record.canonicalUrl, "tab");
      }),
      makeButton(await strings.formatValue("sidebar-tabmemory-edit"), async () => {
        const updated = chromeWindow.prompt("Edit tab memory", record.text);
        if (updated === null || !updated.trim()) {
          return;
        }
        await TabNotes.set(makeStoredTab(record.canonicalUrl), updated.trim());
        await refresh();
      }),
      makeButton(await strings.formatValue("sidebar-tabmemory-delete"), async () => {
        if (!chromeWindow.confirm("Delete this saved tab memory?")) {
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

search.addEventListener("input", () => refresh().catch(console.error));
refresh().catch(error => {
  console.error("Unable to load Tab Memory", error);
  setStatus(error.message);
});
