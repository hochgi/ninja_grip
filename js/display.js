(function (global) {
  const ROOT_ID = 'game-container';

  function rootEl() {
    return document.getElementById(ROOT_ID);
  }

  function isFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );
  }

  function isLandscape() {
    if (screen.orientation && typeof screen.orientation.type === 'string') {
      return screen.orientation.type.startsWith('landscape');
    }
    return window.innerWidth >= window.innerHeight;
  }

  function isTouch() {
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
  }

  function requestFs(el) {
    if (!el) return Promise.resolve(false);
    const req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.webkitRequestFullScreen ||
      el.msRequestFullscreen;
    if (!req) return Promise.resolve(false);
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      return Promise.resolve(p).then(() => true).catch(() => false);
    } catch (_) {
      try {
        req.call(el);
        return Promise.resolve(true);
      } catch (e2) {
        return Promise.resolve(false);
      }
    }
  }

  function exitFs() {
    const exit =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.msExitFullscreen;
    if (!exit || !isFullscreen()) return Promise.resolve();
    try {
      return Promise.resolve(exit.call(document)).catch(() => {});
    } catch (_) {
      return Promise.resolve();
    }
  }

  function lockLandscape() {
    if (!screen.orientation || typeof screen.orientation.lock !== 'function') {
      return Promise.resolve(false);
    }
    return screen.orientation
      .lock('landscape')
      .then(() => true)
      .catch(() =>
        screen.orientation
          .lock('landscape-primary')
          .then(() => true)
          .catch(() => false)
      );
  }

  function unlockOrientation() {
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (_) {}
  }

  /**
   * Call from a user gesture (Play). Enters fullscreen and locks landscape when possible.
   */
  function enterPlayDisplay() {
    const el = rootEl();
    document.documentElement.classList.add('play-active');
    document.body.classList.add('play-active');
    return requestFs(el).then((fsOk) =>
      lockLandscape().then((lockOk) => {
        bumpLayout();
        return { fullscreen: fsOk, landscapeLock: lockOk };
      })
    );
  }

  function leavePlayDisplay() {
    document.documentElement.classList.remove('play-active');
    document.body.classList.remove('play-active');
    unlockOrientation();
    return exitFs().then(() => bumpLayout());
  }

  function bumpLayout() {
    // Force browsers to settle after chrome hide / rotate
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
    });
  }

  function updateRotateGate() {
    const gate = document.getElementById('rotateGate');
    if (!gate) return;
    const need = isTouch() && !isLandscape() && document.body.classList.contains('play-active');
    gate.classList.toggle('visible', need);
    gate.setAttribute('aria-hidden', need ? 'false' : 'true');
  }

  function onDisplayChange() {
    updateRotateGate();
    bumpLayout();
  }

  function bind() {
    document.addEventListener('fullscreenchange', onDisplayChange);
    document.addEventListener('webkitfullscreenchange', onDisplayChange);
    if (screen.orientation) {
      screen.orientation.addEventListener('change', onDisplayChange);
    }
    window.addEventListener('orientationchange', onDisplayChange);
    window.addEventListener('resize', updateRotateGate);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', bumpLayout);
      window.visualViewport.addEventListener('scroll', () => {
        // Keep page pinned; browser UI changes can shift visualViewport
        window.scrollTo(0, 0);
      });
    }
    updateRotateGate();
  }

  global.NinjaDisplay = {
    enterPlayDisplay,
    leavePlayDisplay,
    isFullscreen,
    isLandscape,
    isTouch,
    updateRotateGate,
    bumpLayout,
    bind,
  };
})(window);
