"use strict";

// Load the CDP engine into the same service worker scope.
importScripts("debugger.js");

// Settings are scoped to a tab and survive page reloads during this Chrome session.
const queues = new Map();
const settingsKey = tabId => `settings:${tabId}`;
const DEFAULT_SETTINGS = {
    enabled: false,
    opacity: 80,
    showRibbon: true,
    revision: 0
};

function isYouTube(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" &&
            ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(parsed.hostname);
    } catch { return false; }
}

// Serialize reads and writes so rapid slider changes cannot overwrite newer settings.
function serialize(tabId, task) {
    const next = (queues.get(tabId) || Promise.resolve()).catch(() => { }).then(task);
    queues.set(tabId, next);
    next.finally(() => {
        if (queues.get(tabId) === next) queues.delete(tabId);
    }).catch(() => { });
    return next;
}

async function readSettings(tabId) {
    const stored = (await chrome.storage.session.get(settingsKey(tabId)))[settingsKey(tabId)];
    return { ...DEFAULT_SETTINGS, ...stored };
}

async function updateBadge(tabId, settings) {
    await Promise.all([
        chrome.action.setBadgeText({ tabId, text: settings.enabled ? "ON" : "OFF" }),
        chrome.action.setBadgeTextColor({ color: "#ffffff" }),
        chrome.action.setBadgeBackgroundColor({ tabId, color: settings.enabled ? "#0db249" : "#e75405" }),
        chrome.action.setTitle({ tabId, title: `YouTube Auto Skip: ${settings.enabled ? "ON" : "OFF"}` })
    ]).catch(() => { }); // A tab may close while its badge is being updated.
}

async function notifyPage(tabId, settings) {
    try {
        await chrome.tabs.sendMessage(tabId, { type: "settingsChanged", settings });
    } catch {
        // Inject into tabs that were already open when the extension was installed.
        await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
        await chrome.tabs.sendMessage(tabId, { type: "settingsChanged", settings });
    }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!["getSettings", "patchSettings"].includes(message?.type)) return;
    // Content scripts use their own tab ID; the popup supplies the selected tab ID.
    const tabId = sender.tab?.id ?? message.tabId;
    if (!Number.isInteger(tabId)) { respond({ error: "No tab selected." }); return; }
    serialize(tabId, async () => {
        const tab = await chrome.tabs.get(tabId);
        if (!isYouTube(tab.url)) throw new Error("Open a YouTube tab to use this extension.");
        let settings = await readSettings(tabId);
        if (message.type === "patchSettings") {
            const patch = message.patch || {};
            if (Object.hasOwn(patch, "enabled") && typeof patch.enabled !== "boolean") {
                throw new Error("The \"enabled\" setting must be a boolean.");
            }
            if (Object.hasOwn(patch, "opacity") &&
                (typeof patch.opacity !== "number" || !Number.isFinite(patch.opacity))) {
                throw new Error("The \"opacity\" setting must be a finite number.");
            }
            if (Object.hasOwn(patch, "showRibbon") && typeof patch.showRibbon !== "boolean") {
                throw new Error("The \"showRibbon\" setting must be a boolean.");
            }
            settings = {
                enabled: patch.enabled ?? settings.enabled,
                showRibbon: patch.showRibbon ?? settings.showRibbon,
                opacity: Math.max(20, Math.min(100, Math.round(patch.opacity ?? settings.opacity))),
                revision: settings.revision + 1
            };
            // Only the Auto skip setting controls the debugger connection.
            // Ribbon visibility and opacity never detach an active session.
            if (settings.enabled) await startDebugger(tabId);
            else await stopDebugger(tabId);
            await chrome.storage.session.set({ [settingsKey(tabId)]: settings });
            await updateBadge(tabId, settings);
            await notifyPage(tabId, settings).catch(error => console.warn("Ribbon notification:", error));
        } else {
            if (settings.enabled) {
                try { await startDebugger(tabId); }
                catch (error) {
                    settings = { ...settings, enabled: false, revision: settings.revision + 1 };
                    await chrome.storage.session.set({ [settingsKey(tabId)]: settings });
                    console.warn("Debugger activation:", error);
                }
            }
            // Startup handshakes also repair the badge after Chrome resets it on navigation.
            await updateBadge(tabId, settings);
        }
        return { settings };
    }).then(respond).catch(error => respond({ error: error.message }));
    return true; // Keep the response channel open for asynchronous work.
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (!change.status && !change.url) return;
    void serialize(tabId, async () => {
        const tab = await chrome.tabs.get(tabId);
        if (isYouTube(tab.url)) await updateBadge(tabId, await readSettings(tabId));
        else {
            await stopDebugger(tabId);
            const current = await readSettings(tabId);
            await chrome.storage.session.set({ [settingsKey(tabId)]: { ...current, enabled: false, revision: current.revision + 1 } });
            await chrome.action.setBadgeText({ tabId, text: "" });
        }
    }).catch(() => { });
});

chrome.tabs.onRemoved.addListener(tabId => {
    discardDebuggerSession(tabId);
    void serialize(tabId, () => chrome.storage.session.remove(settingsKey(tabId))).catch(() => { });
});
