import {
  ImageContainerProperty,
  ListContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk';
import type { TemplateAsset } from './types.js';

const CANVAS_WIDTH = 576;
const TOP_MARGIN = 12;

const MAX_CONTAINERS_TOTAL = 12;
const MAX_TEXT_CONTAINERS = 8;
const MAX_IMAGE_CONTAINERS = 4;

function collectContainerIds(page: RebuildPageContainer): number[] {
  const ids: number[] = [];
  for (const c of page.textObject ?? []) if (typeof c.containerID === 'number') ids.push(c.containerID);
  for (const c of page.listObject ?? []) if (typeof c.containerID === 'number') ids.push(c.containerID);
  for (const c of page.imageObject ?? []) if (typeof c.containerID === 'number') ids.push(c.containerID);
  return ids;
}

/** Returns `count` container IDs guaranteed not to collide with any ID already used in `page`. */
export function findNextContainerIds(page: RebuildPageContainer, count: number): number[] {
  const ids = collectContainerIds(page);
  const max = ids.length ? Math.max(...ids) : 0;
  return Array.from({ length: count }, (_, i) => max + i + 1);
}

export interface PopupImageTarget {
  containerId: number;
  containerName: string;
  pngBase64: string;
}

export interface PopupContainers {
  merged: RebuildPageContainer;
  /** One entry per tile, in template.tiles order — used to send each tile's pixel data after the merge. */
  imageTargets: PopupImageTarget[];
}

/**
 * Merges a notification popup (one image container per tile, positioned
 * edge-to-edge to reassemble the template, plus one invisible event-capture
 * text container spanning the whole assembled area — per the SDK's "images
 * can't capture events" rule) on top of the host app's current containers.
 * Any container that currently holds isEventCapture is turned off so the
 * popup's capture container is the sole event target while shown.
 */
export function buildPopupContainers(currentPage: RebuildPageContainer, template: TemplateAsset): PopupContainers {
  const ids = findNextContainerIds(currentPage, template.tiles.length + 1);
  const tileContainerIds = ids.slice(0, template.tiles.length);
  const captureContainerId = ids[ids.length - 1]!;

  const width = template.width;
  const height = template.height;
  const x = Math.max(0, Math.round((CANVAS_WIDTH - width) / 2));
  const y = TOP_MARGIN;

  const textObject = (currentPage.textObject ?? []).map((t) =>
    t.isEventCapture ? new TextContainerProperty({ ...t, isEventCapture: 0 }) : t,
  );
  const listObject = (currentPage.listObject ?? []).map((l) =>
    l.isEventCapture ? new ListContainerProperty({ ...l, isEventCapture: 0 }) : l,
  );
  const imageObject = [...(currentPage.imageObject ?? [])];

  textObject.push(
    new TextContainerProperty({
      xPosition: x,
      yPosition: y,
      width,
      height,
      borderWidth: 0,
      borderColor: 0,
      borderRadius: 0,
      paddingLength: 0,
      containerID: captureContainerId,
      containerName: 'evenNotificationsCapture',
      isEventCapture: 1,
      content: '',
    }),
  );

  const imageTargets: PopupImageTarget[] = template.tiles.map((tile, i) => {
    const containerId = tileContainerIds[i]!;
    const containerName = `evenNotificationsPopup${i}`;
    imageObject.push(
      new ImageContainerProperty({
        xPosition: x + tile.xOffset,
        yPosition: y + tile.yOffset,
        width: tile.width,
        height: tile.height,
        containerID: containerId,
        containerName,
      }),
    );
    return { containerId, containerName, pngBase64: tile.pngBase64 };
  });

  if (textObject.length > MAX_TEXT_CONTAINERS) {
    throw new Error(
      `even-notifications: host app + popup would use ${textObject.length} text containers, exceeding the SDK's max of ${MAX_TEXT_CONTAINERS}`,
    );
  }
  if (imageObject.length > MAX_IMAGE_CONTAINERS) {
    throw new Error(
      `even-notifications: host app + popup would use ${imageObject.length} image containers, exceeding the SDK's max of ${MAX_IMAGE_CONTAINERS}`,
    );
  }
  const total = textObject.length + listObject.length + imageObject.length;
  if (total > MAX_CONTAINERS_TOTAL) {
    throw new Error(
      `even-notifications: host app + popup would use ${total} containers, exceeding the SDK's max of ${MAX_CONTAINERS_TOTAL}`,
    );
  }

  const merged = new RebuildPageContainer({
    containerTotalNum: total,
    textObject,
    ...(listObject.length ? { listObject } : {}),
    imageObject,
  });

  return { merged, imageTargets };
}

/** The host's original container config is never mutated, so restoring is just handing it back. */
export function restoreContainers(currentPage: RebuildPageContainer): RebuildPageContainer {
  return currentPage;
}
