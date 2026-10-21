# YouTube Ad Blocker for Safari

A personal Safari extension that removes in-video YouTube ads on `www.youtube.com`: pre-roll and mid-roll. If the block stops working, it falls back to normal ad playback so the video still plays.

It deliberately does not block page ads, feed ads, ads on other sites, or YouTube ads in other browsers. It is a local build for one Mac, not an App Store product. It makes no network calls and collects no data.

## Build

From the repository root:

```bash
./build.sh
```

The script runs the tests, generates the Xcode project if it is missing, signs with an Apple Development certificate when one is available, and falls back to ad-hoc signing. It prints the built app path.

Manual build:

```bash
/Applications/Xcode.app/Contents/Developer/usr/bin/safari-web-extension-converter extension \
  --project-location . \
  --app-name "YouTube Ad Blocker" \
  --bundle-identifier com.personal.youtubeadblocker \
  --macos-only \
  --swift \
  --no-open --no-prompt --force

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project "YouTube Ad Blocker/YouTube Ad Blocker.xcodeproj" \
  -scheme "YouTube Ad Blocker" \
  -configuration Debug \
  -derivedDataPath build \
  CODE_SIGN_IDENTITY=- \
  build

open "build/Build/Products/Debug/YouTube Ad Blocker.app"
```

If signing fails, add `CODE_SIGNING_ALLOWED=NO` to the `xcodebuild` command.

## Enable

1. Launch the app once.
2. Open Safari → Settings → Extensions.
3. Enable **YouTube Ad Blocker** and allow access to `www.youtube.com`.
4. If Safari does not list it, enable Develop → **Allow Unsigned Extensions**, quit Safari, reopen it, and enable the extension again.

The extension starts working on the next YouTube page load. No further action is needed.

## Use

Open YouTube normally. If a cold-load pre-roll still reaches the player, the extension may briefly reload the player once with an ad-free session. It never does this mid-video and never more than once per video. If that still fails, the ad plays; the extension does not click skip or seek because that is what breaks players.

If a video fails after the block runs, the extension disables itself for that tab and reloads once. The page then plays with ads. Close the tab to start fresh with blocking enabled again.

## Test

```bash
npm test
```

## Maintenance

YouTube changes its player and anti-adblock behavior. The current ad-free request marker and ad field names are constants at the top of `extension/page.js`:

- `AD_FREE_PARAMS` — currently `yAEB`
- `AD_FIELDS` — currently `adPlacements`, `adSlots`, `playerAds`, `adBreakHeartbeatParams`

When ads return, compare those values with the maintained sources:

- uBlock Origin quick fixes: <https://github.com/uBlockOrigin/uAssetsCDN/blob/main/filters/quick-fixes.txt>
- Brave adblock resources: <https://github.com/brave/adblock-resources>

Rebuild and relaunch after changing them. If the page loads too late or the block needs SABR handling, the design document explains the limits.

## Limits

- Personal use only. No App Store distribution, signing for others, or auto-update.
- Blocking ads may conflict with YouTube's terms of service.
- YouTube can change the player at any time; this tool will need occasional maintenance.
- Only video ads are in scope.
