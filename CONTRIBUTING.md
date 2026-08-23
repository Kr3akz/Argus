# Contributing

Thanks for looking. This is a hobby project maintained by one person, so the process is
short — but a few things are worth knowing before you spend an evening on a pull request.

## The one hard rule

**Argus does not touch the game.** No injection, no DLL hooks, no write access to the
game process, no input simulation, no network interception, no automation of any kind.
Some of that is expressly forbidden by Warframe's EULA; the rest is a line this project
does not cross on purpose.

A pull request that adds any of it will be closed, however well it works. If you are
unsure whether an idea falls on the wrong side of that line, open an issue and ask first
— that costs you a message instead of an evening.

## German comments, English interface

This trips people up, so it is not an accident:

- **Comments and commit messages: German.**
- **Interface text, documentation and this file: English.**

The reasoning is that the code is read by the person maintaining it, and the app is used
by people who mostly do not speak German. Please keep both sides as they are rather than
unifying them.

Comments here explain **why**, not what. `src/core/paths.js` or `electron-builder.yml`
are a fair sample of the tone: they answer the question you would actually have in six
months, and they say what was tried and rejected. A comment restating the line below it
is worse than no comment.

## Never commit `data/`

`data/` holds an account ID, a full inventory and a cached profile. The whole directory
is ignored and single files are allowed back in — not the other way round. If you add a
new cache file, it is ignored automatically. Keep it that way.

The same applies to `electron-builder.yml`: the `files:` list is a **positive** list. A
new file ships only if someone puts it there deliberately.

## Getting set up

```bash
git clone https://github.com/Kr3akz/Argus.git
cd Argus
npm install
npm start
```

Node 20 or newer, Windows only. `ARGUS_DATA_DIR` points the app at a different data
folder, which is the comfortable way to work without touching your real goals and
inventory:

```bash
ARGUS_DATA_DIR=./scratch-data npm start
```

There is more in [Building from source](docs/development.md), including how the packaging
works and what lives where in `src/`.

## Before you open a pull request

- **`src/core/` knows neither Electron nor the DOM.** That is what keeps the logic usable
  from `src/cli/`. If your change needs `app` or `document` in there, it probably belongs
  in `src/main/` or `src/renderer/` instead.
- **Run the checks that exist.** There is no test framework, but there are scripts that
  exercise the real data chain:
  ```bash
  node src/cli/dashboard-test.js
  npm run check-farm
  ```
- **Keep the diff about one thing.** A pull request that fixes a bug and also reformats
  four files is hard to judge and slow to merge.
- **Say what you tried and what you ruled out.** For anything non-obvious that context is
  worth more than the diff itself.

## Reporting bugs

Open an [issue](https://github.com/Kr3akz/Argus/issues/new/choose). The template asks for
your version and what the app was doing — both are under **Settings → About Argus**,
which shows the exact commit the build came from.

**Security problems do not go into an issue.** See [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your work is published under the [MIT licence](LICENSE),
like the rest of the project.
