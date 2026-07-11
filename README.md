# even-notifications

Draw a notification popup overlay on top of an Even Realities G2 smart glasses app (Even Hub SDK), then automatically restore the app's original screen.

Consume it from another Even Hub app via a local dependency.

## Usage

`@evenrealities/even_hub_sdk` (>=0.0.10) is a peer dependency — your host app must already depend on it.

Call `initEvenNotifications()` once, after your app's bridge and initial page are ready. After that, `evenNotification()` can be called anywhere with just a template name:

```ts
import { waitForEvenAppBridge, RebuildPageContainer, TextContainerProperty } from '@evenrealities/even_hub_sdk'
import { initEvenNotifications, evenNotification } from 'even-notifications'

const bridge = await waitForEvenAppBridge()

// ... your app creates its own containers/page as usual (createStartUpPageContainer, etc.) ...

// One-time setup. getCurrentPage is a callback, not a static value — it's
// re-invoked fresh every time a notification is shown, so it should always
// return whatever your app currently has on screen, not a stale snapshot.
initEvenNotifications(bridge, () => new RebuildPageContainer({
  containerTotalNum: 1,
  textObject: [myMainContainer],
}))

// Anywhere else in your app:
evenNotification('incoming-call')

// With options:
evenNotification('incoming-email', {
  durationMs: 6000, // optional, default 4000
  onDismiss: () => console.log('notification dismissed'),
})
```

The popup auto-dismisses after `durationMs`, or immediately if the user double-clicks the glasses touchpad while it's showing. Either way, your app's screen (whatever `getCurrentPage()` returns at that moment) is redrawn afterward exactly as-is — `even-notifications` never mutates your containers.

### Advanced: explicit bridge/page per call

If you need per-call control over which bridge or page to restore to (e.g. multiple bridges, or you don't want a global registration), use `showNotification()` directly instead of the `init`/`evenNotification` pair:

```ts
import { showNotification } from 'even-notifications'

const notification = showNotification(bridge, currentPage, {
  template: 'incoming-call',
  durationMs: 4000,
  onDismiss: () => console.log('notification dismissed'),
})

// Optional: dismiss early (e.g. from your own UI)
// await notification.dismiss()
```

`evenNotification(template, options)` is just `showNotification(registeredBridge, registeredGetCurrentPage(), { template, ...options })` under the hood — both return the same `{ dismiss }` handle.

## Available templates

- `incoming-call` — phone icon, title, caller name, timestamp. Source design: `Dashboard-notification-popup.png`.
- `incoming-email` — mail icon (top-left, aligned with the heading), sender/subject line, wrapped body preview, timestamp. Source design: `Gmail-notification-popup-highres.png`.

## How it works

- Each **template** is a pre-baked raster image (border, icon, and text all baked into the pixels). Since a single `ImageContainerProperty` caps at 288×144 — well under the 576×288 canvas — larger templates are split into a **grid of tiles** (each ≤288×144, up to 4 total) that get positioned edge-to-edge at render time. Both current templates use 2 horizontal tiles to span most of the screen width.
- Showing a notification merges **N+1 containers** on top of your app's existing ones: one image container per tile, plus one invisible `TextContainerProperty` sized to the whole assembled popup (image containers can't hold `isEventCapture`, so this is what catches the dismiss double-click). Container IDs are auto-allocated above whatever IDs your app already uses, so there's no need to reserve IDs up front.
- Your app's container budget (12 total / 8 text / 4 image, shared with the popup) must have room for the popup's tiles + 1 text container while a notification is showing. `showNotification`/`evenNotification` throw a descriptive error if the merge would exceed those limits.
- `updateImageRawData` calls are sent serially (one tile at a time, awaited) per the SDK's requirement that these calls not run concurrently.

## Adding a new template

1. Design the popup (any layout/size), export as a PNG matching the source-asset convention: monochrome green foreground, alpha channel encoding brightness, transparent background (see `Dashboard-notification-popup.png` or `Gmail-notification-popup-highres.png` for reference). A quick way to produce this without an external image editor: draw it on an HTML `<canvas>` in a browser (text + shapes, no external images so the canvas doesn't taint), export via `canvas.toDataURL('image/png')`, then convert opaque RGB → green+alpha using green-channel-as-luminance.
2. Run the generator, passing the assembled width/height you want (it will split into tiles automatically, and will never upscale a source smaller than requested):
   ```bash
   npm run generate:template -- <name> <path-to-source.png> [targetWidth] [targetHeight]
   ```
   Defaults to targeting 560×120 if omitted. This box-downsamples the source (preserving thin lines/small text better than nearest-neighbor), quantizes it to the SDK's 4-bit greyscale format, splits it into a tile grid (erroring if the requested size would need more than 4 tiles), and writes `src/templates/<name>.ts`.
3. Add the new entry to the `templates` map in `src/templates/index.ts` and extend the `NotificationTemplate` union in `src/types.ts`.
4. `npm run build`.

## Scripts

- `npm run build` — type-check and compile `src/` to `dist/`.
- `npm run generate:template -- <name> <sourcePng> [targetWidth] [targetHeight]` — dev-only asset generator (not shipped in `dist/`).
