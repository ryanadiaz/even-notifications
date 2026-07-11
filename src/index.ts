import {
  ImageRawDataUpdate,
  OsEventTypeList,
  type EvenAppBridge,
  type EvenHubEvent,
  type RebuildPageContainer,
} from '@evenrealities/even_hub_sdk';
import { buildPopupContainers, restoreContainers } from './containers.js';
import { getTemplate } from './templates/index.js';
import type { EvenNotificationOptions, NotificationHandle, NotificationTemplate } from './types.js';

export type {
  EvenNotificationOptions,
  NotificationHandle,
  NotificationTemplate,
  TemplateAsset,
  TemplateTile,
} from './types.js';

const DEFAULT_DURATION_MS = 4000;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Renders a notification popup on top of `currentPage` (the host app's
 * current container config), then restores `currentPage` automatically
 * after `durationMs`, on a double-click on the popup, or when the returned
 * handle's `dismiss()` is called — whichever comes first.
 */
export function showNotification(
  bridge: EvenAppBridge,
  currentPage: RebuildPageContainer,
  options: EvenNotificationOptions,
): NotificationHandle {
  const template = getTemplate(options.template);
  const { merged, imageTargets } = buildPopupContainers(currentPage, template);
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;

  let dismissed = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  const restore = async () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = undefined;
    }
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    await bridge.rebuildPageContainer(restoreContainers(currentPage));
    options.onDismiss?.();
  };

  const dismiss = async () => {
    if (dismissed) return;
    dismissed = true;
    await restore();
  };

  void (async () => {
    await bridge.rebuildPageContainer(merged);

    if (dismissed) {
      // dismiss() was called before the popup finished rendering — make sure
      // the final displayed state is the restored one, not the popup.
      await restore();
      return;
    }

    // Per the SDK's critical rules, updateImageRawData calls must be queued
    // and awaited one at a time — concurrent calls are not supported. Send
    // each tile in sequence rather than in parallel.
    for (const target of imageTargets) {
      await bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: target.containerId,
          containerName: target.containerName,
          imageData: base64ToBytes(target.pngBase64),
        }),
      );
      if (dismissed) return;
    }

    // A double-click while the popup owns isEventCapture arrives as a
    // top-level sysEvent (no containerID) rather than a container-scoped
    // textEvent — confirmed against the simulator. Since our capture
    // container is the exclusive event target for the duration of this
    // listener, any double-click received here unambiguously means "dismiss
    // the popup," regardless of which event wrapper it arrives in.
    unsubscribe = bridge.onEvenHubEvent((event: EvenHubEvent) => {
      const rawEvent = event.textEvent ?? event.listEvent ?? event.sysEvent;
      if (rawEvent?.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        void dismiss();
      }
    });

    timeoutId = setTimeout(() => {
      void dismiss();
    }, durationMs);
  })();

  return { dismiss };
}

let registeredBridge: EvenAppBridge | null = null;
let registeredGetCurrentPage: (() => RebuildPageContainer) | null = null;

/**
 * One-time setup for the simplified evenNotification() call below. Registers
 * the bridge and a callback that returns the host app's current container
 * config on demand — call this once, after your app's bridge and initial
 * page are ready. `getCurrentPage` is called fresh each time a notification
 * is shown, so it should return whatever the host is currently displaying,
 * not a stale snapshot taken at registration time.
 */
export function initEvenNotifications(bridge: EvenAppBridge, getCurrentPage: () => RebuildPageContainer): void {
  registeredBridge = bridge;
  registeredGetCurrentPage = getCurrentPage;
}

/**
 * Shows a notification using the bridge and current page registered via
 * initEvenNotifications(). Convenience wrapper around showNotification() for
 * callers that don't need per-call control over which bridge/page to use.
 */
export function evenNotification(
  template: NotificationTemplate,
  options: Omit<EvenNotificationOptions, 'template'> = {},
): NotificationHandle {
  if (!registeredBridge || !registeredGetCurrentPage) {
    throw new Error(
      'even-notifications: evenNotification() was called before initEvenNotifications(bridge, getCurrentPage). ' +
        'Call initEvenNotifications() once at startup, then evenNotification() can be called anywhere.',
    );
  }
  return showNotification(registeredBridge, registeredGetCurrentPage(), { template, ...options });
}
