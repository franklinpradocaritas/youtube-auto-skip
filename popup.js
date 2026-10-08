"use strict";

const toggle = document.querySelector("#enabled");
const ribbonToggle = document.querySelector("#show-ribbon");
const ribbonStatus = document.querySelector("#ribbon-status");
const slider = document.querySelector("#opacity");
const output = document.querySelector("#opacity-value");
const status = document.querySelector("#status");
const feedback = document.querySelector("#feedback");
let tabId;
let pending = Promise.resolve();
let latestRequest = 0;

function render(settings) {
    toggle.checked = settings.enabled;
    ribbonToggle.checked = settings.showRibbon;
    ribbonStatus.textContent = settings.showRibbon ? "ON" : "OFF";
    slider.disabled = !settings.showRibbon;
    slider.value = settings.opacity;
    output.textContent = `${settings.opacity}%`;
    status.textContent = settings.enabled ? "ON" : "OFF";
}

// Each input sends a partial update, preserving the other control's current value.
function save(patch) {
    const request = ++latestRequest;
    pending = pending.catch(() => { }).then(async () => {
        const response = await chrome.runtime.sendMessage({ type: "patchSettings", tabId, patch });
        if (response?.error) throw new Error(response.error);
        if (request === latestRequest) {
            render(response.settings);
            feedback.textContent = "Saved for this tab.";
        }
    }).catch(async error => {
        feedback.textContent = error.message;
        // Restore the real switch state if Chrome rejected debugger attachment.
        try {
            const response = await chrome.runtime.sendMessage({ type: "getSettings", tabId });
            if (response.settings && request === latestRequest) render(response.settings);
        } catch { }
    });
}

toggle.addEventListener("change", () => {
    status.textContent = toggle.checked ? "ON" : "OFF";
    save({ enabled: toggle.checked });
});

ribbonToggle.addEventListener("change", () => {
    ribbonStatus.textContent = ribbonToggle.checked ? "ON" : "OFF";
    slider.disabled = !ribbonToggle.checked;
    save({ showRibbon: ribbonToggle.checked });
});

slider.addEventListener("input", () => {
    output.textContent = `${slider.value}%`;
    save({ opacity: Number(slider.value) });
});

// Always read persisted settings when opening the popup; never assume OFF.
(async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = tab?.id;
        const response = await chrome.runtime.sendMessage({ type: "getSettings", tabId });
        if (response?.error) throw new Error(response.error);
        render(response.settings);
        toggle.disabled = ribbonToggle.disabled = false;
        feedback.textContent = "Ready.";
    } catch (error) { feedback.textContent = error.message; }
})();
