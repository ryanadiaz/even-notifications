import type { RebuildPageContainer } from '@evenrealities/even_hub_sdk';

export type NotificationTemplate = 'incoming-call' | 'incoming-email';

export interface EvenNotificationOptions {
  /** Which pre-baked popup template to show. */
  template: NotificationTemplate;
  /** Auto-dismiss delay in ms. Defaults to 4000. */
  durationMs?: number;
  /** Called once the popup has been dismissed (by timeout, double-click, or manual dismiss()). */
  onDismiss?: () => void;
}

export interface NotificationHandle {
  /** Dismiss the popup early and restore the host app's original screen. */
  dismiss: () => Promise<void>;
}

/**
 * One image-container-sized piece of an assembled popup. A single
 * ImageContainerProperty caps at 288x144, so popups larger than that are
 * split into a grid of tiles positioned edge-to-edge (xOffset/yOffset are
 * relative to the assembled popup's top-left corner).
 */
export interface TemplateTile {
  pngBase64: string;
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
}

export interface TemplateAsset {
  /** Total assembled width/height across all tiles. */
  width: number;
  height: number;
  tiles: TemplateTile[];
}

/** Re-exported for convenience so consumers don't need a separate import for the merge input type. */
export type { RebuildPageContainer };
