"use strict";

// Coordinate inspection is extracted from the user's working debugger version.
// This function runs inside the page, so it must not reference worker variables.
function inspectButton() {
    if (
        location.protocol !== 'https:' ||
        !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(
            location.hostname,
        )
    ) {
        return { outside: true };
    }
    const player = document.querySelector('#movie_player');
    if (!player) return null;
    const selectors =
        'button.ytp-skip-ad-button, button.ytp-ad-skip-button-modern, button.ytp-ad-skip-button';
    for (const button of player.querySelectorAll(selectors)) {
        const r = button.getBoundingClientRect();
        const s = getComputedStyle(button);
        if (
            !r.width ||
            !r.height ||
            s.visibility !== 'visible' ||
            s.display === 'none' ||
            Number(s.opacity) === 0 ||
            s.pointerEvents === 'none' ||
            button.disabled ||
            button.getAttribute('aria-disabled') === 'true'
        )
            continue;
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === button || button.contains(hit))) return { x, y };
    }
    return null;
}


const debuggerSessions = new Map();
const CHECK_INTERVAL_MS = 700;
const CLICK_COOLDOWN_MS = 1500;

function discardDebuggerSession(tabId) {
    const session = debuggerSessions.get(tabId);
    if (session) clearInterval(session.timer);
    debuggerSessions.delete(tabId);
}

async function stopDebugger(tabId) {
    // Remove the session first so onDetach does not interpret our OFF as a failure.
    discardDebuggerSession(tabId);
    await chrome.debugger.detach({ tabId }).catch(() => { });
}

async function startDebugger(tabId) {
    if (debuggerSessions.has(tabId)) return;
    await chrome.debugger.attach({ tabId }, "1.3");
    const session = { timer: null, busy: false, lastClick: 0 };
    debuggerSessions.set(tabId, session);
    session.timer = setInterval(() => { void debuggerTick(tabId, session); }, CHECK_INTERVAL_MS);
    void debuggerTick(tabId, session);
}

// Persist OFF and notify the UI after cancellation, navigation or a CDP failure.
function disableAfterDisconnect(tabId, error) {
    void serialize(tabId, async () => {
        if (debuggerSessions.has(tabId)) return; // A newer activation owns this tab.
        const current = await readSettings(tabId);
        const settings = { ...current, enabled: false, revision: current.revision + 1 };
        await chrome.storage.session.set({ [settingsKey(tabId)]: settings });
        await updateBadge(tabId, settings);
        await notifyPage(tabId, settings).catch(() => { });
        if (error) console.warn("[YouTube Auto Skip]", error);
    }).catch(() => { });
}

async function debuggerTick(tabId, session) {
    if (session.busy || debuggerSessions.get(tabId) !== session) return;
    session.busy = true;
    const stillActive = () => debuggerSessions.get(tabId) === session;
    try {
        const target = { tabId };
        const response = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
            expression: `(${inspectButton.toString()})()`, returnByValue: true
        });
        if (!stillActive()) return;
        // A reload can temporarily destroy the page's execution context.
        if (response.exceptionDetails) return;
        const point = response.result?.value;
        if (point?.outside) {
            await stopDebugger(tabId); disableAfterDisconnect(tabId); return;
        }
        if (!point || Date.now() - session.lastClick < CLICK_COOLDOWN_MS) return;
        session.lastClick = Date.now();
        const coordinates = { x: point.x, y: point.y };
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
            type: "mouseMoved", ...coordinates, button: "none", buttons: 0
        });
        if (!stillActive()) return;
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
            type: "mousePressed", ...coordinates, button: "left", buttons: 1, clickCount: 1
        });
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
            type: "mouseReleased", ...coordinates, button: "left", buttons: 0, clickCount: 1
        });
        console.info("[YouTube Auto Skip] CDP click sent", { tabId, ...coordinates });
    } catch (error) {
        if (!stillActive()) return;
        // Navigation errors are transient; retain the user's ON state and retry.
        if (/execution context|context.*destroyed|cannot find context/i.test(error.message)) return;
        await stopDebugger(tabId);
        disableAfterDisconnect(tabId, error.message);
    } finally { session.busy = false; }
}

chrome.debugger.onDetach.addListener(source => {
    if (!debuggerSessions.has(source.tabId)) return;
    discardDebuggerSession(source.tabId);
    disableAfterDisconnect(source.tabId, "Debugger disconnected. Auto skip is OFF.");
});
