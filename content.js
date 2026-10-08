(() => {
    "use strict";
    // Prevent duplicate listeners when the worker injects into an existing tab.
    const SLOT = "__youtubeAutoSkipV1";
    if (globalThis[SLOT]) return;
    globalThis[SLOT] = true;
    let settings = {
        enabled: false,
        opacity: 80,
        showRibbon: true,
        revision: -1
    };
    let disposed = false;
    let syncing = false;
    let host = null;

    function mountRibbon() {
        if (!settings.enabled || !settings.showRibbon || disposed) return;
        if (!host) {
            host = document.createElement("div");
            host.id = "youtube-auto-skip-ribbon";
            // host.style.cssText = "all:initial!important;position:fixed!important;top:72px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483647!important;width:max-content!important;max-width:calc(100vw - 24px)!important;display:block!important;";
            host.style.cssText = `
                all:initial!important;
                position:fixed!important;
                top:72px!important;
                left:50%!important;
                transform:translateX(-50%)!important;
                z-index:2147483647!important;
                width:max-content!important;
                max-width:calc(100vw - 24px)!important;
                display:block!important;
            `;
            // Encapsulate the UI so YouTube styles cannot alter the ribbon's controls.
            const shadow = host.attachShadow({ mode: "open" });
            const style = document.createElement("style");
            style.textContent = `
                .frame{
                    position:relative;
                    overflow:hidden;
                    border-radius:14px;
                    padding:3px;
                    box-shadow:0 10px 32px #0009,0 0 22px #8b5cf66b;
                    max-width:calc(100vw - 24px)
                }
                .frame::before{
                    content:"";
                    position:absolute;
                    inset:-400px;
                    background:conic-gradient(#ff4545,#ffae00,#f4ff00,#19e88b,#00baff,#7957ff,#ff4fce,#ff4545);
                    animation:rainbow-clockwise 2.5s linear infinite
                }
                @keyframes rainbow-clockwise{
                    from{
                        transform:rotate(0deg)
                    }to{
                        transform:rotate(360deg)
                    }
                }
                .ribbon{
                    position:relative;
                    display:flex;
                    align-items:center;
                    gap:14px;
                    padding:12px 18px;
                    background:#4c1d95;
                    color:#fff;
                    border-radius:11px;
                    font:600 14px/1.4 system-ui,sans-serif
                }
                .dot{
                    width:11px;
                    height:11px;
                    background:#a3e635;
                    border-radius:50%;
                    flex:none
                }
                strong{
                    display:block;
                    letter-spacing:.3px
                }
                small{
                    display:block;
                    font-size:12px;
                    font-weight:400;
                    color:#ede9fe
                }
                button{
                    font:600 13px system-ui,sans-serif;
                    background:#fff;
                    color:#4c1d95;
                    border:0;
                    border-radius:6px;
                    padding:9px 12px;
                    cursor:pointer;
                    flex:none
                }
                button:focus-visible{
                    outline:3px solid #a3e635;
                    outline-offset:3px
                }
                @media(max-width:480px){
                    .ribbon{
                        gap:8px;
                        padding:9px
                    }
                    strong{
                        font-size:12px
                    }
                }
                @media(prefers-reduced-motion:reduce){
                    .frame::before{
                        animation:none
                    }
                }
            `;
            const frame = document.createElement("div"); frame.className = "frame";
            const ribbon = document.createElement("div"); ribbon.className = "ribbon";
            ribbon.setAttribute("role", "region");
            ribbon.setAttribute("aria-label", "YouTube Auto Skip status");
            const dot = document.createElement("span"); dot.className = "dot";
            const text = document.createElement("div");
            const title = document.createElement("strong"); title.textContent = "YouTube Auto Skip · ON";
            const label = document.createElement("small"); label.textContent = "Debugger active · this tab";
            const stop = document.createElement("button"); stop.type = "button"; stop.textContent = "Disable";
            stop.addEventListener("click", async () => {
                try {
                    const response = await chrome.runtime.sendMessage({ type: "patchSettings", patch: { enabled: false } });
                    if (response.error) throw new Error(response.error);
                    applySettings(response.settings);
                } catch { dispose(); }
            });
            text.append(title, label); ribbon.append(dot, text, stop);
            frame.append(ribbon); shadow.append(style, frame);
        }
        // Opacity affects the whole ribbon, including the border and its shadow.
        host.style.setProperty("opacity", String(settings.opacity / 100), "important");
        const parent = document.fullscreenElement || document.documentElement;
        if (host.parentNode !== parent) parent.appendChild(host);
    }

    function removeRibbon() {
        host?.remove(); host = null;
    }

    function applySettings(next) {
        // Ignore stale responses from a heartbeat that started before a popup update.
        if (disposed || !next || next.revision < settings.revision) return;
        settings = next;
        if (!settings.enabled) {
            removeRibbon();
        } else {
            if (settings.showRibbon) mountRibbon(); else removeRibbon();
        }
    }

    function onMessage(message) {
        if (message.type === "settingsChanged") applySettings(message.settings);
    }
    function onPageHide() {
        removeRibbon();
        settings = { ...settings, enabled: false };
    }
    function onPageShow() { void sync(); }
    function dispose() {
        if (disposed) return;
        disposed = true;
        clearInterval(heartbeat); removeRibbon();
        document.removeEventListener("fullscreenchange", mountRibbon);
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("pageshow", onPageShow);
        try { chrome.runtime.onMessage.removeListener(onMessage); } catch { }
        delete globalThis[SLOT];
    }
    async function sync() {
        if (disposed || syncing) return;
        syncing = true;
        try {
            if (!chrome.runtime.id) { dispose(); return; }
            const response = await chrome.runtime.sendMessage({ type: "getSettings" });
            if (response?.error) throw new Error(response.error);
            applySettings(response.settings);
        } catch { dispose(); }
        finally { syncing = false; }
    }

    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener("fullscreenchange", mountRibbon);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    // Check the extension's health and state, including after it is disabled.
    const heartbeat = setInterval(() => { void sync(); }, 1000);
    void sync(); // Restore ribbon and badge immediately after a page reload.
})();
