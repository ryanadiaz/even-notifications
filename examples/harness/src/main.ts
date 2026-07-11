import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { initEvenNotifications, evenNotification } from 'even-notifications'

async function main() {
  const bridge = await waitForEvenAppBridge()

  const baseText = new TextContainerProperty({
    containerID: 1,
    containerName: 'base',
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 12,
    isEventCapture: 1,
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\nUt enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.\n\nDuis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  })

  await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [baseText],
    }),
  )

  // One-time setup: registers the bridge and a callback that returns
  // whatever this app currently has on screen, so evenNotification() can be
  // called anywhere below with just a template name.
  initEvenNotifications(bridge, () => new RebuildPageContainer({ containerTotalNum: 1, textObject: [baseText] }))

  console.log('[harness] base page rendered, showing notification in 2s')

  setTimeout(() => {
    console.log('[harness] evenNotification(incoming-email)')
    evenNotification('incoming-email', {
      durationMs: 8000,
      onDismiss: () => console.log('[harness] notification dismissed, base page restored'),
    })
  }, 2000)
}

main().catch((err) => console.error('[harness] init failed', err))
