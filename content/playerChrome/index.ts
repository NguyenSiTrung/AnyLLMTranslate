/**
 * In-player subtitle chrome lifecycle — floating/native button + mini studio.
 */

import { detectCurrentHandler } from '@/inject/subtitleHandlers/registry';
import { isContextInvalidated } from '@/lib/utils';
import { getFullscreenMountParent, isPlausibleControlBar, resolvePlayerTargets } from './host';
import { createFloatingShell, createNativeShell, type ChromeShell } from './mountFloating';
import { attachMiniStudio, type MiniStudioControllers } from './miniStudio';
import { subscribeFullscreenChange } from './fullscreen';
import { createVisibilityState, reduceVisibility, type VisibilityState } from './visibility';
const VIDEO_POLL_MS = 1000;
const IDLE_TICK_MS = 500;
const NATIVE_RECHECK_MS = 200;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isEligible(): boolean {
  if (isContextInvalidated()) return false;
  return detectCurrentHandler() != null;
}

export function startPlayerChrome(): () => void {
  let stopped = false;
  let shell: ChromeShell | null = null;
  let studio: MiniStudioControllers | null = null;
  let vis: VisibilityState = createVisibilityState(nowMs());
  let boundVideo: HTMLVideoElement | null = null;
  let boundRoot: HTMLElement | null = null;
  let pointerOverPlayer = false;
  let resizeObserver: ResizeObserver | null = null;
  let nativeObserver: MutationObserver | null = null;
  let remountTimer: ReturnType<typeof setTimeout> | null = null;

  const applyVisual = (): void => {
    if (!shell) return;
    const visible = vis.visual !== 'hidden' && !vis.destroyed;
    shell.setVisible(visible);
  };

  const dispatchVis = (event: Parameters<typeof reduceVisibility>[1]): void => {
    vis = reduceVisibility(vis, event);
    applyVisual();
  };

  const destroyShell = (): void => {
    studio?.destroy();
    studio = null;
    shell?.destroy();
    shell = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    nativeObserver?.disconnect();
    nativeObserver = null;
    boundVideo = null;
    boundRoot = null;
  };

  const onToggle = (): void => {
    if (!studio) return;
    if (studio.isOpen()) {
      studio.close();
    } else {
      void studio.open();
    }
  };

  const onOpenChange = (open: boolean): void => {
    shell?.setExpanded(open);
    if (open) {
      dispatchVis({ type: 'panelOpened' });
    } else {
      dispatchVis({
        type: 'panelClosed',
        pointerOverPlayer,
        nowMs: nowMs(),
      });
    }
  };

  const wireActivity = (playerRoot: HTMLElement, video: HTMLVideoElement): (() => void) => {
    const markActivity = (): void => {
      dispatchVis({ type: 'activity', nowMs: nowMs() });
    };
    const onEnter = (): void => {
      pointerOverPlayer = true;
      markActivity();
    };
    const onLeave = (): void => {
      pointerOverPlayer = false;
    };
    const onMove = (): void => {
      markActivity();
    };

    playerRoot.addEventListener('pointerenter', onEnter);
    playerRoot.addEventListener('pointerleave', onLeave);
    playerRoot.addEventListener('pointermove', onMove, { passive: true });
    video.addEventListener('play', markActivity);
    video.addEventListener('pause', markActivity);
    video.addEventListener('seeking', markActivity);

    return () => {
      playerRoot.removeEventListener('pointerenter', onEnter);
      playerRoot.removeEventListener('pointerleave', onLeave);
      playerRoot.removeEventListener('pointermove', onMove);
      video.removeEventListener('play', markActivity);
      video.removeEventListener('pause', markActivity);
      video.removeEventListener('seeking', markActivity);
    };
  };

  let unwireActivity: (() => void) | null = null;

  const mountShell = (): void => {
    if (stopped || !isEligible()) {
      destroyShell();
      return;
    }
    const { video, playerRoot, adapter } = resolvePlayerTargets(document);
    if (!video || !playerRoot) {
      destroyShell();
      return;
    }

    const fsParent = getFullscreenMountParent(document);
    const wasOpen = studio?.isOpen() ?? false;
    destroyShell();

    const nativeMount = adapter?.findNativeMount?.(document) ?? null;
    if (nativeMount && !fsParent && isPlausibleControlBar(nativeMount, video)) {
      shell = createNativeShell({ mountNode: nativeMount, onToggle });
      nativeObserver = new MutationObserver(() => {
        if (stopped) return;
        if (!nativeMount.isConnected) {
          scheduleRemount();
        }
      });
      nativeObserver.observe(nativeMount.parentElement ?? document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      shell = createFloatingShell({
        playerRoot,
        video,
        onToggle,
        mountParent: fsParent ?? document.body,
      });
    }

    studio = attachMiniStudio({
      shadow: shell.shadow,
      anchorButton: shell.button,
      panelSlot: shell.panelSlot,
      onOpenChange,
      setButtonState: shell.setButtonState,
    });

    boundVideo = video;
    boundRoot = playerRoot;
    unwireActivity?.();
    unwireActivity = wireActivity(playerRoot, video);

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        shell?.reposition();
      });
      resizeObserver.observe(video);
    }

    shell.reposition();
    // Show briefly on mount so users discover the control.
    dispatchVis({ type: 'activity', nowMs: nowMs() });

    if (wasOpen) {
      void studio.open();
    }

    // Adapter visibility signal when available
    if (adapter?.isControlsVisible) {
      const visible = adapter.isControlsVisible(document);
      if (typeof visible === 'boolean') {
        dispatchVis({ type: 'adapterVisible', visible, nowMs: nowMs() });
      }
    }
  };

  const scheduleRemount = (): void => {
    if (remountTimer != null) return;
    remountTimer = setTimeout(() => {
      remountTimer = null;
      if (!stopped) mountShell();
    }, NATIVE_RECHECK_MS);
  };

  const ensureMounted = (): void => {
    if (stopped) return;
    if (!isEligible()) {
      destroyShell();
      return;
    }
    const { video, playerRoot } = resolvePlayerTargets(document);
    if (!video || !playerRoot) {
      destroyShell();
      return;
    }
    if (shell && boundVideo === video && boundRoot === playerRoot && shell.host.isConnected) {
      shell.reposition();
      const adapter = resolvePlayerTargets(document).adapter;
      if (adapter?.isControlsVisible) {
        const visible = adapter.isControlsVisible(document);
        if (typeof visible === 'boolean' && !studio?.isOpen()) {
          dispatchVis({ type: 'adapterVisible', visible, nowMs: nowMs() });
        }
      }
      return;
    }
    mountShell();
  };

  const unsubFs = subscribeFullscreenChange(() => {
    scheduleRemount();
  });

  const pollId = window.setInterval(() => {
    if (stopped) return;
    ensureMounted();
  }, VIDEO_POLL_MS);

  const idleId = window.setInterval(() => {
    if (stopped || !shell) return;
    dispatchVis({ type: 'idleTick', nowMs: nowMs() });
  }, IDLE_TICK_MS);

  // Initial attempt
  ensureMounted();

  return () => {
    stopped = true;
    dispatchVis({ type: 'teardown' });
    if (remountTimer != null) clearTimeout(remountTimer);
    window.clearInterval(pollId);
    window.clearInterval(idleId);
    unsubFs();
    unwireActivity?.();
    unwireActivity = null;
    destroyShell();
  };
}
