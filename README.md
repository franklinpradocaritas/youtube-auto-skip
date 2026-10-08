# YouTube Auto Skip

A local Chrome extension that clicks **Skip** when an ad's skip button is visible and can receive mouse input. It uses `chrome.debugger` and the Chrome DevTools Protocol (CDP) to send mouse input through the browser.

No Node.js, Playwright, or Tampermonkey installation is required. Non-skippable ads must finish: the extension cannot create a skip option that YouTube does not provide.

## Requirements

- **Google Chrome 118 or later** on a desktop computer.
- Windows, macOS, or Linux.
- Access to `chrome://extensions` and permission to load unpacked extensions. Managed devices may restrict these options.

This guide covers the version with debugger clicks and popup controls. The installation instructions and commands target desktop Chrome, not Chrome on iPhone or Android.

## Installation

1. Extract the extension package into a permanent folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Open the extensions menu—the puzzle-piece icon—and pin **YouTube Auto Skip**.
6. Reload your YouTube tab and close its Developer Tools (DevTools).
7. Click the extension icon to open the popup.
8. Turn **Auto skip** ON.

Disable previous versions to prevent multiple copies from trying to control the same tab. Keep the installed folder in its original location.

## Controls

| Control                                 | Purpose                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Auto skip ON/OFF**                    | Attaches or detaches the debugger from the selected YouTube tab.                                            |
| **Show ribbon ON/OFF**                  | Shows or hides the ribbon. Hiding it does not stop automatic clicks.                                        |
| **Ribbon opacity**                      | Adjusts opacity from 20% to 100%, with a default of 80%. The slider is enabled only when Show ribbon is ON. |
| **Disable** , on the ribbon.            | Turns Auto skip OFF and detaches the debugger.                                                              |
| **ON/OFF badge**, on the extension icon | Shows the Auto skip state for the tab.                                                                      |

The ribbon includes a shadow and an animated rainbow border that rotates clockwise. The animation stops when the operating system requests reduced motion.

Settings are stored per tab during the Chrome session and survive page reloads. When the page starts, the extension restores the settings and badge. After restarting Chrome or reloading/disabling the extension, check the popup and enable Auto skip again if needed.

## Chrome's debugging notice

When Auto skip is enabled, Chrome may display a banner such as **“YouTube Auto Skip is debugging this browser.”** This is a browser notice, separate from the extension's ribbon. It may appear in other tabs even though the extension only attaches to the YouTube tab you enabled.

**Canceling this notice detaches the debugger and turns Auto skip OFF.** Turning Show ribbon OFF does not hide Chrome's native notice.

### Launching Chrome without the notice

The current Chromium source supports this launch argument:

```text
--silent-debugger-extension-api
```

The extension cannot set this argument itself. **The command does not remove the notice from an already-running session:** you must fully quit Chrome and relaunch it with the argument.

1. Save your work in any open tabs.
2. Fully quit Chrome; do not just close one window.
3. Make sure no Chrome processes remain running in the background.
4. Run the command for your platform below.
5. Open YouTube and enable Auto skip again in the popup.

> This argument suppresses the notice for all extensions using the debugger API in that Chrome process. It does not restrict their debugging permissions. Availability may change across versions or distributions. If Chrome ignores the argument, the extension can still work with the notice visible.

### macOS

Quit Chrome with **⌘ + Q**. Open Terminal and run:

```bash
open -a "Google Chrome" --args --silent-debugger-extension-api
```

If Chrome is still running, it may reuse the existing process without applying the argument. Check **Activity Monitor** if the notice remains visible.

### Windows: PowerShell

Exit Chrome using its **Exit** menu option. If it is still running, check **Task Manager**. Save your work before ending any processes.

For a typical installation in `Program Files`, run:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" --silent-debugger-extension-api
```

For a per-user installation, use:

```powershell
& "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" --silent-debugger-extension-api
```

For a 32-bit installation in `Program Files (x86)`, use:

```powershell
& "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe" --silent-debugger-extension-api
```

Run only the variant matching your installation. If Chrome is installed elsewhere, locate `chrome.exe` through your shortcut's properties and adjust the command.

You can also create a dedicated shortcut and append the argument to its **Target** field, outside the quotation marks:

```text
"C:\Program Files\Google\Chrome\Application\chrome.exe" --silent-debugger-extension-api
```

The shortcut also requires that no Chrome process is already running without the argument.

### Linux

Fully quit Chrome. In a terminal, run the executable available on your distribution:

```bash
google-chrome --silent-debugger-extension-api
```

Some installations use:

```bash
google-chrome-stable --silent-debugger-extension-api
```

To check which executable is installed:

```bash
command -v google-chrome
command -v google-chrome-stable
```

For Chromium, the executable may be named `chromium` or `chromium-browser`. Adjust the executable and verify that your distribution supports both the extension and the argument. These instructions do not constitute verification on every distribution.

### Checking that the argument was applied

1. Open `chrome://version`.
2. Find **Command Line**.
3. Check that `--silent-debugger-extension-api` is listed.

If it is missing, Chrome probably reused an existing process or was opened through a different shortcut. If it is listed but the notice remains visible, your version may not honor the argument.

### Restoring the notice

Fully quit Chrome and open it normally, without the argument. If you modified a shortcut, remove the argument from its **Target** field. This restores the usual behavior without changing the extension files.

## Updating the extension

1. Turn Auto skip OFF in the popup.
2. Replace the files in the installed folder.
3. Open `chrome://extensions` and click **Reload** for YouTube Auto Skip.
4. Accept any new permissions if Chrome prompts you.
5. Reload YouTube and check the popup controls.

## Troubleshooting

| Problem                                        | What to check                                                                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The icon is missing                            | Pin the extension from the puzzle-piece menu.                                                                                                                   |
| Auto skip will not turn ON                     | Use a YouTube tab, close DevTools, and check that another extension is not debugging the same tab. The popup displays errors.                                   |
| The notice appears in other tabs               | This is Chrome's interface; it does not mean the extension has attached to every tab. See the launch instructions above.                                        |
| The command does not hide the notice           | Close all Chrome processes and check `chrome://version`.                                                                                                        |
| No Skip button is available                    | The ad may be non-skippable, or the skip option may not be available yet.                                                                                       |
| A click is sent but the ad continues           | The log confirms input was sent, not that the ad was skipped. Check that the button can receive mouse input and that the selectors match the current interface. |
| The badge or ribbon is outdated                | Reload YouTube and reopen the popup. Disable older copies if multiple versions are installed.                                                                   |
| A ribbon remains after disabling the extension | Reload the page. Chrome may delay cleanup of background scripts.                                                                                                |

To view logs, open `chrome://extensions` and click this extension's **service worker** link. The `CDP click sent` message confirms that mouse input commands were sent.

## Project structure

| File                                  | Responsibility                                                       |
| ------------------------------------- | -------------------------------------------------------------------- |
| `manifest.json`                       | Extension name, version, permissions, popup, and icons.              |
| `background.js`                       | Per-tab settings, messaging, and badge synchronization.              |
| `debugger.js`                         | CDP connection, skip-button detection, and mouse input.              |
| `content.js`                          | Ribbon and in-page controls; it does not perform ad-skipping clicks. |
| `popup.html`, `popup.css`, `popup.js` | Popup interface and settings updates.                                |
| `icons/`                              | PNG icons in different sizes.                                        |
| `README.md`                           | Installation, usage, and troubleshooting guides.                     |

The engine checks for the button every **700 ms** and waits at least **1500 ms** between attempts. It calculates the button's center, checks that it is not covered, and sends `mouseMoved`, `mousePressed`, and `mouseReleased`. Code comments are in English.

## Permissions

- `debugger`: tab inspection and input through CDP.
- `activeTab` and `scripting`: tab access and ribbon injection.
- `storage`: settings retained during the session.
- Access to the YouTube domains listed in the manifest: content script loading during navigation and reloads.

The extension does not include requests to external servers. The debugger permission is broad; the code limits attachment to the selected YouTube tab.

## Verification and scope

Syntax checks and mocked Chrome/CDP tests cover input order and coordinates, click cooldown, badge restoration, hidden-ribbon behavior, disconnection, and attachment failures. Actual ad skipping and platform-specific launch commands require verification in the respective browsers.

## References

- [Chromium: running the browser with command-line arguments](https://www.chromium.org/developers/how-tos/run-chromium-with-flags/).
- [Chromium source: condition that suppresses the debugger notice](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/extensions/api/debugger/debugger_api.cc).
- [chrome.debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger).
