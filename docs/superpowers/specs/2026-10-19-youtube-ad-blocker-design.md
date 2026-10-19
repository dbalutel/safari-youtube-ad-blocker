# Personal Safari YouTube ad blocker — design

Date: 2026-10-19
Status: awaiting approval

## Intent

One person watches YouTube in Safari on one MacBook. Before many videos they get one or two pre-roll ads in a row, served by Google. They want those ads to disappear automatically so the video just plays. This is a personal tool, not a product.

## What success looks like

- Open a YouTube video in Safari and the video starts without a pre-roll ad.
- Mid-roll ads do not interrupt playback.
- No clicking skip, no manual step beyond first-time setup.
- If the block stops working, the video still plays, ads and all.
- The extension can be turned off from Safari settings like any other extension.

## Scope

### In scope

- Ads that play inside the YouTube video player: pre-roll and mid-roll.
- `www.youtube.com` watch pages in Safari on this Mac.
- A local build the owner installs on their own machine.

### Out of scope

- Banner ads, feed ads, sponsored cards, and other page furniture.
- YouTube Music, YouTube TV, embeds on other sites, mobile, or other browsers.
- App Store distribution, notarization, auto-update, analytics, or a settings UI.
- Blocking YouTube ads at the network or DNS level.
- Any attempt to obtain Premium features or bypass paid content.

### Anti-goals

- A blank player, endless spinner, or “content unavailable” page.
- Blocking video or audio servers (`googlevideo.com`) and breaking playback.
- Auto-clicking ads, auto-seeking, or other tricks that can corrupt the player state.
- Silent failure: if it stops working, it should degrade to normal ad playback, not break the page.

## Decisions

These are the owner’s decisions, recorded here:

- **Personal use only.** No App Store, no signing for anyone else.
- **Fallback over force.** If the block stops working or risks playback, let the ad play. A working video is more important than a blocked ad.
- **Video ads only.** Page ads are not part of this tool.
- **Target machine.** macOS 27, Safari 27, Xcode already installed.

Choices made by the designer, open to correction:

- **Safari Web Extension**, wrapped in a small macOS container app, built with Xcode’s standard Safari extension tooling. This is Apple’s supported path and needs no third-party dependency.
- **No filter-list engine.** The current YouTube-specific tricks are implemented directly in one page script. A generic ad blocker would be far more work for one site.
- **No visible app UI.** Safari’s own Extensions settings provide the on/off switch.

## How it works

### Shape

A single Safari Web Extension in a container macOS app. The extension has one content script that runs on `www.youtube.com` at document start, plus one injected page script. The page script is where the YouTube-specific work happens.

### Why a page script

Safari content blockers and declarative network rules can hide page elements and block requests, but they cannot rewrite a response body. YouTube’s player receives an “instructions” response that says which ads to play. The reliable place to remove those instructions is in the page itself, before the player consumes them. This is the same broad technique Brave and uBlock Origin use for YouTube.

### Primary block: remove the ad instructions

At document start, before YouTube’s player code captures its own references, the extension installs thin wrappers around the page’s `fetch` and `XMLHttpRequest` calls. The wrappers only touch requests to YouTube’s player endpoints and the matching responses.

For the request, add the known ad-free `params` marker that makes YouTube treat the request as coming from an inline player (currently `yAEB`). For the response, remove the ad fields (`adPlacements`, `adSlots`, `playerAds`, and the related heartbeat parameter) before the player parses it. Everything else passes through byte-for-byte where possible, and the original response is returned untouched on any error.

Cold watch-page loads also embed the player response directly in the page as `ytInitialPlayerResponse`, before any request. The page script therefore installs a property setter for that global at document start and prunes the same ad fields when the page assigns it. If a cold load bypasses both paths, the circuit breaker below handles it.

The exact current fields and marker change over time. They live in one clearly named constant at the top of the page script, with a comment pointing at the maintained sources (uBlock Origin quick-fixes and Brave’s adblock resources). This is the part that will need occasional updating.

### No auto-skip

If an ad still reaches the player, it plays normally. The extension does not click skip, seek to the end, mute, or otherwise manipulate the player. That behavior is what creates the worst failures, and the owner chose the fallback.

### Circuit breaker: video always wins

Because YouTube actively changes its player and sometimes detects ad blocking, the extension includes a small safety net. It is a startup check, not a permanent watchdog, so it can never reload a video the owner is already watching:

- The check only arms after the extension has actually rewritten a player request or response for the current video, and only while that video is still at the start. A mid-roll rewrite cannot arm it.
- It disarms once the video has played continuously for 3 seconds.
- While armed, it treats two things as failure: a visible playback error, or 25 seconds of unpaused playback with no forward progress. The 25 seconds starts only once a video element exists, and is longer than YouTube’s 4–16 second SABR backoff, so normal backoff does not trip it.
- It ignores playback while an ad is showing, so an ad that slipped through is allowed to finish instead of triggering a reload.
- On failure, it records “disabled for this site” in tab-scoped storage and reloads the page exactly once.
- On that reload, and for the rest of the tab session, the page script does nothing. YouTube behaves as if no extension were installed, so ads play and the video works.
- A fresh tab starts with blocking enabled again. The user can also turn the extension off entirely in Safari settings.

The grace period and the one-reload limit are deliberate. They prevent a reload loop, which would be worse than an ad.

### SABR handling

YouTube now uses SABR streaming. If testing shows mid-roll ads still arrive through SABR, or shows the 4–16 second backoff spinner, Brave’s SABR handling (patching SABR control messages) becomes required before the work is considered done. It is not added speculatively.

## Build and install

- Generate the Xcode project with Apple’s Safari web extension converter from the extension folder.
- Build and run the container app once.
- In Safari settings, enable the extension and grant it access to `www.youtube.com`.
- Sign locally with Xcode’s development signing. If Safari refuses the unsigned build, enable “Allow Unsigned Extensions” in Safari’s Develop menu as a development-only fallback.

No Apple Developer Program membership is required for personal local use.

## Verification

Manual checks on this Mac, logged into YouTube:

1. Open five different videos with pre-roll ads. Each starts without an ad.
2. Watch a long video with a mid-roll ad. Playback is not interrupted.
3. Navigate between videos without a full page reload (YouTube’s client-side navigation). No ads appear.
4. Close and reopen Safari. Blocking still works after a fresh start.
5. Deliberately disable the page script. Ads play normally, confirming the fallback path.
6. Deliberately break the rule (for example, corrupt the marker). The video still plays, with ads, and no blank player or reload loop.
7. Turn the extension off in Safari settings. YouTube behaves normally.

The exact ad-blocking rules are only correct if test 1 passes on a real logged-in session. A synthetic page is not enough.

## Risks and limits

- **YouTube changes.** This is not a permanent fix. The request marker and response fields have changed several times in 2026. The tool is expected to need maintenance.
- **SABR and anti-adblock detection.** YouTube may delay or block playback when it detects tampering. The circuit breaker converts that into “ads play” rather than a broken page.
- **Safari injection timing.** The page script must run before YouTube’s player code. The implementation must verify that Safari 27’s main-world injection happens early enough on a real page load. If not, the design needs a second injection point.
- **Terms of service.** Blocking ads may conflict with YouTube’s terms. This is a personal-use tool; the owner accepts that risk.
- **No privacy impact.** The extension contacts no server and collects no data. It only reads and rewrites YouTube’s own responses in the page.

## Open questions for the builder

- Confirm the earliest reliable main-world injection point in Safari 27 and whether the content script needs a background relay.
- Confirm that the cold-load `ytInitialPlayerResponse` setter is installed before the inline page script assigns it.
- Confirm the current request marker and response fields on a real logged-in YouTube session before freezing the constants.
- Confirm whether mid-roll ads still arrive after the request marker is applied; if they do, implement SABR handling as described above.
