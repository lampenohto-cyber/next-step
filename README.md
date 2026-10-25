# Next Step

A planner that breaks assignments into small steps. It started as a claude.ai artifact and now runs as a desktop app and as a Chrome or Edge extension.

## Layout

- `src/`: the page (`index.html`, `app.js`). `claude.js` handles Claude calls with your own API key and stores photos in IndexedDB. `vendor/` holds PDF.js. `src/` also has a web-app manifest and an offline service worker, for hosting it over https.
- `extension-src/`: the extension's `manifest.json` and `background.js`.
- `build.py`: copies `src/` into `dist/app` and `dist/extension`, and zips the extension.
- `install-app.ps1`: adds Start menu and desktop shortcuts that open `dist/app` in its own Edge window. `-Uninstall` removes them.

After editing `src/`, run `python build.py`.

## Desktop app

Run `powershell -File install-app.ps1`, then open **Next Step** from the Start menu or desktop.

## Extension (Chrome or Edge)

1. Open `chrome://extensions` or `edge://extensions` and turn on Developer mode.
2. Click **Load unpacked** and pick `dist/extension`.
3. Click the toolbar icon to open Next Step in the side panel. Right-click the icon to open it in a tab or a window.
4. To add an assignment from any page, select its text, right-click it and choose **Add "…" to Next Step**.
5. On MyCourses (mycourses.aalto.fi), activity pages show a small **Add to your plan?** card in the corner. This works for assignments, quizzes, workshops, Turnitin and similar. **Add** opens the side panel at the review step, with the title, course code, due date and time read from the page in English, Finnish or Swedish. No API key is needed for this. **Not now** hides the card until your next visit, and **Don't ask here** hides it for that page for good. The card doesn't appear once a submission is marked "Submitted for grading". `extension-src/mycourses.js` reads the page and `manifest.json` lists the site.

## Claude

"Read it" and "Break it down" need a Claude API key. Enter it under **Settings & backup** at the bottom of the page. The key is saved in that browser's local storage and is sent only to api.anthropic.com. Without a key you get the standard built-in breakdowns.

## Data

Data stays in the browser that runs the page. The desktop app and the extension each keep their own copy. To move data between them, use **Export data** and **Import data**.
