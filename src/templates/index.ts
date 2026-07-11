import type { NotificationTemplate, TemplateAsset } from '../types.js';
import { incomingCallTiles, incomingCallWidth, incomingCallHeight } from './incoming-call.js';
import { incomingEmailTiles, incomingEmailWidth, incomingEmailHeight } from './incoming-email.js';

export const templates: Record<NotificationTemplate, TemplateAsset> = {
  'incoming-call': {
    width: incomingCallWidth,
    height: incomingCallHeight,
    tiles: incomingCallTiles,
  },
  'incoming-email': {
    width: incomingEmailWidth,
    height: incomingEmailHeight,
    tiles: incomingEmailTiles,
  },
};

export function getTemplate(name: NotificationTemplate): TemplateAsset {
  const template = templates[name];
  if (!template) {
    throw new Error(`even-notifications: unknown template "${name}"`);
  }
  return template;
}
