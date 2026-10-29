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

const platformHelp = {
    macos: {
        command: 'open -a "Google Chrome" --args --silent-debugger-extension-api',
        message: "On macOS, launch Google Chrome from Terminal with this command to silence the debugger warning:",
    },
    win: {
        command: '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --silent-debugger-extension-api',
        message: "On Windows, launch Google Chrome from Command Prompt with this command to silence the debugger warning:",
    },
    linux: {
        command: "google-chrome --silent-debugger-extension-api",
        message: "On Linux, launch Google Chrome from a terminal with this command to silence the debugger warning:",
    },
};
const platformButtons = document.querySelectorAll("[data-platform]");

function selectPlatform(platform) {
    const help = platformHelp[platform];
    document.querySelector("#debugger-command").textContent = help.command;
    document.querySelector("#debugger-instructions").textContent = help.message;
    document.querySelector("#copy-feedback").textContent = "";
    platformButtons.forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.platform === platform));
    });
}

platformButtons.forEach(button => {
    button.addEventListener("click", () => selectPlatform(button.dataset.platform));
});

const systemPlatform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
selectPlatform(/win/i.test(systemPlatform) ? "win" : /mac/i.test(systemPlatform) ? "macos" : "linux");

document.querySelector("#copy-command").addEventListener("click", async () => {
    const copyFeedback = document.querySelector("#copy-feedback");
    try {
        await navigator.clipboard.writeText(document.querySelector("#debugger-command").textContent);
        copyFeedback.textContent = "Command copied.";
    } catch {
        copyFeedback.textContent = "Could not copy. Select and copy the command manually.";
    }
});

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
