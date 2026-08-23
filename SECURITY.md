# Security policy

Argus reads the memory of another process, downloads an executable and runs it, and
handles a warframe.market session. Those are three places where a mistake would matter,
so this file says plainly how to report one and what the current guarantees are.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private reporting instead:

**[→ Report a vulnerability](https://github.com/Kr3akz/Argus/security/advisories/new)**

If that is not available to you, write to the address on the
[maintainer's GitHub profile](https://github.com/Kr3akz) with `Argus security` in the
subject.

This is a hobby project maintained by one person, so there is no response-time promise.
Expect an acknowledgement within a week or so. If a report turns out to be valid, the
fix ships in the next release and the advisory credits you unless you would rather stay
anonymous.

## Supported versions

Only the **latest release** is supported. There are no backports — if you are on an older
version, updating is the fix. The app checks for updates once an hour and tells you when
one exists (see [Updates](README.md#updates)).

## What is in scope

| Area | Why it matters |
|---|---|
| **The update mechanism** (`src/core/updates.js`) | It downloads and executes a file. Anything that gets an unverified or substituted binary past the SHA256 check, or makes the app run a file from outside the project's releases, is a serious finding. |
| **The memory read** (`src/core/gamecreds.js`, `src/core/procmem.js`) | It opens the Warframe process with `PROCESS_VM_READ`. Anything that turns this into a write, escalates the handle, or leaks the session key it finds. |
| **Credential handling** (`src/core/wfm-auth.js`) | The warframe.market password passes through once and is never stored. Anything that writes it to disk, logs it, or exposes it to the renderer. |
| **The account ID and session key** | Both are supposed to stay in the main process. Anything that surfaces them through `preload.cjs`, a log file, or an outbound request other than to Warframe's own API. |
| **The renderer boundary** (`src/main/preload.cjs`) | `contextIsolation` is on and the renderer has no Node access. Anything that breaks out of that, or any injection into the interface from data fetched off the network. |

## What is not in scope

- **SmartScreen and antivirus warnings.** The releases are unsigned; a certificate costs
  a few hundred euros a year. This is known and documented, not a vulnerability.
- **The memory read itself.** That it reads the game's process is the entire point of the
  feature. It is off by default, documented in detail under
  [Is this safe?](docs/security.md), and switchable at any time. Reports arguing that the
  feature should not exist are a design disagreement, not a security issue — open a
  normal issue for that.
- **Rate limits on third-party APIs.** Hitting DE's per-IP throttle is a documented
  hazard with a documented mitigation (see [Known limits](docs/limits.md)).
- **Anything requiring an attacker who already has code execution on the machine.** If
  they can run their own code as your user, they do not need Argus.

## What the app guarantees

These are the promises the code is written to keep. A report that shows one of them
broken is by definition in scope:

1. **Nothing is written to the game process.** Read-only handles, no injection, no DLL,
   no hooks, no input simulation, no traffic interception.
2. **The session key never reaches disk** and never leaves the main process.
3. **No downloaded file is executed without a matching SHA256** from the `SHA256SUMS.txt`
   of the same release. A mismatch deletes the file.
4. **The renderer cannot choose what gets downloaded or run.** It passes no URL and no
   path; both come from the main process's own last query.
5. **Only two requests happen without a button press:** the world-state poll and the
   hourly update check. Both are switchable.
