## Revision 1: 2026-04-17 - Add Priority Queue for Seek-Aware Translation
- **Trigger**: During implementation, we realized that if a user seeks ahead in a long video, they would have to wait a long time for the sequential translation loop to catch up to their new position.
- **Type**: Spec & Plan
- **Phase**: 2 (Implementation)
- **Changes Made**:
  - Added `PRIORITIZE_SUBTITLE_CHUNK` message to `ExtensionMessage` types.
  - Attached `seeked` event listener to video element to detect timeline jumps.
  - Implemented Priority Queue in the background script to dynamically move requested chunks to the front of the translation loop.
- **Rationale**: To provide instant, seamless translated subtitles even when skipping through long videos.
