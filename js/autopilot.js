/**
 * Dev-only autopilot for testing long runs / hard sections.
 * Unlock: ?dev=1 in the URL, or type the word "pilot" (with the game focused).
 * Toggle via the AUTO / MANUAL button once unlocked.
 */
(function (global) {
  const STORAGE_KEY = 'ninjaGripDevUnlock';
  const LOG_MAX = 2500;
  let unlocked = false;
  let active = false;
  let buffer = '';
  let bufferT = 0;
  let leapCooldown = 0;
  let fireCooldown = 0;
  let log = [];
  let lastState = '';
  let sampleAcc = 0;
  let runId = 0;

  function fromQuery() {
    try {
      const q = new URLSearchParams(global.location.search);
      return q.get('dev') === '1' || q.get('autopilot') === '1';
    } catch (_) {
      return false;
    }
  }

  function init() {
    unlocked = fromQuery() || global.sessionStorage.getItem(STORAGE_KEY) === '1';
    if (fromQuery()) {
      try {
        global.sessionStorage.setItem(STORAGE_KEY, '1');
      } catch (_) {}
      unlocked = true;
    }
    syncButton();
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try {
      global.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch (_) {}
    syncButton();
  }

  function isUnlocked() {
    return unlocked;
  }

  function isActive() {
    return unlocked && active;
  }

  function setActive(on) {
    if (!unlocked) return;
    active = !!on;
    leapCooldown = 0;
    fireCooldown = 0;
    pushLog(active ? 'auto_on' : 'auto_off', {});
    syncButton();
  }

  function toggle() {
    if (!unlocked) return;
    setActive(!active);
  }

  function syncButton() {
    const btn = document.getElementById('autopilotBtn');
    if (btn) {
      btn.classList.toggle('hidden', !unlocked);
      btn.classList.toggle('on', active);
      btn.textContent = active ? 'AUTO' : 'MANUAL';
      btn.title = active ? 'Autopilot on — click for manual' : 'Manual — click for autopilot';
    }
    const logBtn = document.getElementById('autopilotLogBtn');
    if (logBtn) {
      logBtn.classList.toggle('hidden', !unlocked);
      logBtn.title = 'Copy session log to clipboard (also downloads .json)';
    }
  }

  function pushLog(type, data) {
    if (!unlocked) return;
    log.push({
      t: Date.now(),
      run: runId,
      type,
      auto: active,
      ...(data || {}),
    });
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  }

  function beginRun(meta) {
    runId += 1;
    lastState = '';
    sampleAcc = 0;
    pushLog('run_start', meta || {});
  }

  function endRun(meta) {
    pushLog('run_end', meta || {});
  }

  function note(type, data) {
    pushLog(type, data);
  }

  /** Periodic + state-change samples while unlocked (manual or auto). */
  function sample(ctx, dt) {
    if (!unlocked) return;
    const { state, player, world, W, H } = ctx;
    if (state && state !== lastState) {
      pushLog('state', {
        from: lastState || null,
        to: state,
        x: Math.round(player.x),
        y: Math.round(player.y),
        dist: Math.round(world.distance),
        sx: Math.round(player.x - world.cameraX),
      });
      lastState = state;
    }
    sampleAcc += dt || 0;
    if (sampleAcc < 0.5) return;
    sampleAcc = 0;
    const sx = player.x - world.cameraX;
    pushLog('sample', {
      state,
      x: Math.round(player.x),
      y: Math.round(player.y),
      vx: Math.round(player.vx),
      vy: Math.round(player.vy),
      dist: Math.round(world.distance),
      cam: Math.round(world.cameraX),
      sx: Math.round(sx),
      W,
      H,
      scroll: !!world.scrollUnlocked,
      handles: world.handles.length,
      plats: world.platforms.length,
      targets: world.targets.filter((t) => t.durability > 0.2).length,
      ladders: world.ladders.length,
    });
  }

  function getLog() {
    return {
      version: 1,
      unlocked,
      active,
      runId,
      exportedAt: new Date().toISOString(),
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      events: log.slice(),
    };
  }

  function formatLogText() {
    const payload = getLog();
    return JSON.stringify(payload, null, 2);
  }

  function downloadLog() {
    const text = formatLogText();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ninja-grip-session-${runId || 0}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return text;
  }

  async function copyLog() {
    const text = formatLogText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch (_) {}
    downloadLog();
    pushLog('log_export', { events: log.length });
    const logBtn = document.getElementById('autopilotLogBtn');
    if (logBtn) {
      const prev = logBtn.textContent;
      logBtn.textContent = 'COPIED';
      setTimeout(() => {
        logBtn.textContent = prev;
      }, 1200);
    }
    return text;
  }

  /** Eat keystrokes for the "pilot" cheat (call from keydown). */
  function onKey(e) {
    if (!e || !e.key || e.key.length !== 1) return;
    const ch = e.key.toLowerCase();
    if (!/[a-z]/.test(ch)) return;
    buffer += ch;
    bufferT = 2.5;
    if (buffer.length > 16) buffer = buffer.slice(-16);
    if (buffer.indexOf('pilot') >= 0) {
      buffer = '';
      unlock();
      setActive(true);
      pushLog('cheat_unlock', { via: 'pilot' });
    }
  }

  function tickTimers(dt) {
    if (bufferT > 0) {
      bufferT -= dt;
      if (bufferT <= 0) buffer = '';
    }
    if (leapCooldown > 0) leapCooldown -= dt;
    if (fireCooldown > 0) fireCooldown -= dt;
  }

  function usableTarget(t) {
    return t && !t.removed && t.durability > 0.25;
  }

  function nearestTarget(world, player, aheadOnly) {
    let best = null;
    let bestD = Infinity;
    for (const t of world.targets) {
      if (!usableTarget(t)) continue;
      const dx = t.x - player.x;
      const dy = t.y - player.y;
      if (aheadOnly && dx < -20) continue;
      const d = Math.hypot(dx, dy);
      if (d < 40 || d > 270) continue;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  function nextHandle(world, player, ignore) {
    let best = null;
    let bestDx = Infinity;
    for (const h of world.handles) {
      if (h === ignore) continue;
      const dx = h.x - player.x;
      if (dx < 20 || dx > 140) continue;
      const dy = Math.abs(h.y - (player.y - 8));
      if (dy > 90) continue;
      if (dx < bestDx) {
        bestDx = dx;
        best = h;
      }
    }
    return best;
  }

  function platformUnder(world, x, y, feet) {
    return global.NinjaWorld.platformAt(world, x, y, 12, feet);
  }

  function gapAhead(world, player) {
    const plat = platformUnder(world, player.x, player.y, player.feet);
    if (!plat) return true;
    const edge = plat.x + plat.w;
    return player.x > edge - 36;
  }

  function ladderAhead(world, player) {
    let best = null;
    let bestDx = Infinity;
    for (const l of world.ladders) {
      const dx = l.x - player.x;
      if (dx < -20 || dx > 80) continue;
      if (player.y + player.feet < l.topY - 10) continue;
      if (player.y - 20 > l.bottomY) continue;
      if (Math.abs(dx) < bestDx) {
        bestDx = Math.abs(dx);
        best = l;
      }
    }
    return best;
  }

  function aimAt(input, player, world, tx, ty) {
    const dx = tx - player.x;
    const dy = ty - player.y;
    const len = Math.hypot(dx, dy) || 1;
    input.aimDX = dx / len;
    input.aimDY = dy / len;
    input.aiming = true;
  }

  /**
   * Overwrite input for this frame. Call after human/tilt sampling.
   * ctx: { state, player, world, rope, W, H, input, attachedHandle, dt }
   */
  function tick(ctx) {
    if (!isActive()) return;
    const { state, player, world, rope, W, input, attachedHandle, dt } = ctx;
    tickTimers(dt || 0);

    // Reset continuous axes; one-shots cleared by main after consume
    input.move = 0;
    input.shorten = false;
    input.lengthen = false;

    const sx = player.x - world.cameraX;
    const dangerLeft = world.scrollUnlocked && sx < W * 0.28;
    const preferRight = !world.scrollUnlocked || sx < W * 0.58 || dangerLeft;

    if (state === 'rope_attached' && rope.attached) {
      const a = rope.attached;
      input.move = 1;
      if (player.y > (ctx.H || 600) * 0.62) input.shorten = true;
      if (a.length > 200) input.shorten = true;
      if (a.length < 70 && player.y < 120) input.lengthen = true;
      // Release on a forward swing toward the right
      const goodAngle = a.angle > 0.45 && a.angle < 1.35 && a.omega > 0.35;
      const mustBail = a.target.durability < 1.0 || dangerLeft;
      if ((goodAngle || mustBail) && leapCooldown <= 0) {
        input.detach = true;
        leapCooldown = 0.35;
      }
      return;
    }

    if (state === 'handle') {
      input.move = 1;
      if (leapCooldown <= 0) {
        input.detach = true;
        leapCooldown = 0.4;
      }
      return;
    }

    if (state === 'ladder') {
      input.shorten = true; // climb up (shared ↑)
      input.move = 0;
      return;
    }

    if (state === 'rope_fly') {
      input.move = preferRight ? 1 : 0;
      return;
    }

    // GROUND / AIR — stay ahead, jump gaps, hang, rope, climb
    input.move = preferRight ? 1 : sx > W * 0.72 ? -1 : 1;

    const lad = ladderAhead(world, player);
    if (lad && state === 'ground' && Math.abs(lad.x - player.x) < 28) {
      input.shorten = true; // mount
      return;
    }
    if (lad && lad.x > player.x && lad.x - player.x < 70) {
      input.move = 1;
      return;
    }

    const nh = nextHandle(world, player, attachedHandle);
    if (nh && state === 'ground' && nh.x - player.x < 95 && leapCooldown <= 0) {
      input.detach = true;
      leapCooldown = 0.35;
      return;
    }
    if (nh && state === 'air' && nh.x > player.x) {
      input.move = 1;
      return;
    }

    if (state === 'ground' && gapAhead(world, player) && leapCooldown <= 0) {
      // Prefer rope over blind jump when a target is in range
      const t = nearestTarget(world, player, true);
      if (t && fireCooldown <= 0 && !rope.projectile && !rope.attached) {
        aimAt(input, player, world, t.x, t.y);
        input.fire = true;
        fireCooldown = 0.45;
        pushLog('auto_fire', { reason: 'gap', tx: Math.round(t.x), ty: Math.round(t.y) });
      } else {
        input.detach = true;
        leapCooldown = 0.3;
        pushLog('auto_jump', { reason: 'gap' });
      }
      return;
    }

    // Opportunistic rope toward forward/up target when safe or in air
    if (
      fireCooldown <= 0 &&
      !rope.projectile &&
      !rope.attached &&
      (state === 'ground' || state === 'air')
    ) {
      const t = nearestTarget(world, player, true);
      if (t) {
        const falling = state === 'air' && player.vy > 80;
        const low = player.y > (ctx.H || 600) * 0.55;
        if (falling || low || dangerLeft || (state === 'ground' && sx > W * 0.4)) {
          aimAt(input, player, world, t.x, t.y);
          input.fire = true;
          fireCooldown = 0.5;
        }
      }
    }
  }

  global.NinjaAutopilot = {
    init,
    unlock,
    isUnlocked,
    isActive,
    setActive,
    toggle,
    onKey,
    tick,
    sample,
    beginRun,
    endRun,
    note,
    getLog,
    copyLog,
    downloadLog,
    syncButton,
  };
})(window);
