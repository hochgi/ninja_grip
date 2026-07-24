(function (global) {
  /**
   * Android-first motion controls.
   * - Tilt L/R (gamma) → swing / walk
   * - Tilt forward/back (beta) → shorten / lengthen rope
   * iOS permission is optional (nice-to-have).
   */
  const MOVE_DEAD = 7; // degrees from calibration
  const MOVE_ON = 12;
  const LEN_DEAD = 7;
  const LEN_ON = 14;

  const state = {
    active: false,
    calibrated: false,
    baseLr: 0,
    baseFb: 0,
    move: 0, // -1..1
    lengthInput: 0, // -1 shorten, +1 lengthen
    lastEventAt: 0,
  };

  function screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') {
      return screen.orientation.angle;
    }
    if (typeof window.orientation === 'number') return window.orientation;
    return 0;
  }

  /** Map device axes so L/R and forward/back match the screen, including landscape. */
  function axesFromEvent(e) {
    let lr = e.gamma || 0;
    let fb = e.beta || 0;
    const ang = ((screenAngle() % 360) + 360) % 360;
    if (ang === 90) {
      lr = e.beta || 0;
      fb = -(e.gamma || 0);
    } else if (ang === 270 || ang === -90) {
      lr = -(e.beta || 0);
      fb = e.gamma || 0;
    } else if (ang === 180) {
      lr = -(e.gamma || 0);
      fb = -(e.beta || 0);
    }
    return { lr, fb };
  }

  function onOrient(e) {
    if (!state.active) return;
    if (e.gamma == null && e.beta == null) return;
    const { lr, fb } = axesFromEvent(e);
    state.lastEventAt = performance.now();

    if (!state.calibrated) {
      state.baseLr = lr;
      state.baseFb = fb;
      state.calibrated = true;
    }

    const dlr = lr - state.baseLr;
    const dfb = fb - state.baseFb;

    if (Math.abs(dlr) < MOVE_DEAD) state.move = 0;
    else if (Math.abs(dlr) >= MOVE_ON) state.move = Math.sign(dlr);
    else state.move = Math.sign(dlr) * ((Math.abs(dlr) - MOVE_DEAD) / (MOVE_ON - MOVE_DEAD));

    // Tilt top of phone away from you (beta ↑ from baseline) → lengthen;
    // tilt top toward you → shorten (classic "pull in" feel).
    if (Math.abs(dfb) < LEN_DEAD) state.lengthInput = 0;
    else if (dfb <= -LEN_ON) state.lengthInput = -1;
    else if (dfb >= LEN_ON) state.lengthInput = 1;
    else state.lengthInput = 0;
  }

  function prefersTouch() {
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function attachListener() {
    window.addEventListener('deviceorientation', onOrient, true);
    state.active = true;
    state.calibrated = false;
  }

  function detachListener() {
    window.removeEventListener('deviceorientation', onOrient, true);
    state.active = false;
    state.move = 0;
    state.lengthInput = 0;
    state.calibrated = false;
  }

  /**
   * Enable motion. Resolves true if listening.
   * On iOS 13+ may prompt; failure still resolves false (tap controls remain).
   */
  function enable() {
    detachListener();
    const Doe = window.DeviceOrientationEvent;
    if (!Doe) return Promise.resolve(false);

    if (typeof Doe.requestPermission === 'function') {
      return Doe.requestPermission()
        .then((res) => {
          if (res === 'granted') {
            attachListener();
            return true;
          }
          return false;
        })
        .catch(() => false);
    }

    attachListener();
    return Promise.resolve(true);
  }

  function recalibrate() {
    state.calibrated = false;
  }

  function sample() {
    return {
      active: state.active,
      move: state.move,
      lengthInput: state.lengthInput,
      fresh: state.active && performance.now() - state.lastEventAt < 800,
    };
  }

  global.NinjaMotion = {
    prefersTouch,
    isAndroid,
    enable,
    disable: detachListener,
    recalibrate,
    sample,
  };
})(window);
