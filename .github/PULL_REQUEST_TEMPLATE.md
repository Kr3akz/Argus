<!--
Danke fuers Mitmachen. Die Punkte unten sind die, an denen ein PR hier
sonst haengen bleibt - siehe CONTRIBUTING.md.
-->

## What does this change?

<!-- One or two sentences. What did you fix or add, and why? -->

## What did you try that did not work?

<!-- Optional, but for anything non-obvious this is worth more than the diff.
     It also keeps the next person from repeating it. -->

## How did you test it?

<!-- Which tab, which action, which data. "Fetched the inventory twice and the
     arcane count matched the game" beats "works on my machine". -->

## Checklist

- [ ] Nothing here writes to the game process, automates it, or reads its network traffic
- [ ] Comments are in German, interface text and documentation in English
- [ ] No files from `data/` are in the diff
- [ ] New shipped files are listed in `files:` in `electron-builder.yml` (it is a positive list)
- [ ] `src/core/` still uses neither Electron nor the DOM
- [ ] `node src/cli/dashboard-test.js` still runs through
