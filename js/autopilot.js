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

  function nextPlatform(world, player) {
    let best = null;
    let bestDx = Infinity;
    for (const p of world.platforms) {
      const dx = p.x - player.x;
      if (dx < 10 || dx > 220) continue;
      if (Math.abs(p.y - (player.y + player.feet)) > 110) continue;
      if (dx < bestDx) {
        bestDx = dx;
        best = p;
      }
    }
    return best;
  }

  function hasLandingAhead(world, player, minX, maxX) {
    for (const p of world.platforms) {
      if (p.x + p.w < minX || p.x > maxX) continue;
      if (Math.abs(p.y - (player.y + (player.feet || 24))) < 120) return true;
    }
    for (const h of world.handles) {
      if (h.x < minX || h.x > maxX) continue;
      if (Math.abs(h.y - player.y) < 100) return true;
    }
    return false;
  }

  /**
   * Overwrite input for this frame. Call after human/tilt sampling.
   * ctx: { state, player, world, rope, W, H, input, attachedHandle, dt }
   */
  function tick(ctx) {
    if (!isActive()) return;
    const { state, player, world, rope, W, input, attachedHandle, dt } = ctx;
    tickTimers(dt || 0);

    input.move = 0;
    input.shorten = false;
    input.lengthen = false;

    const H = ctx.H || 600;
    const sx = player.x - world.cameraX;
    const dangerLeft = world.scrollUnlocked && sx < W * 0.28;
    const preferRight = !world.scrollUnlocked || sx < W * 0.6 || dangerLeft;

    if (state === 'rope_attached' && rope.attached) {
      const a = rope.attached;
      // Standing with live rope: walk right, only leave when near lip or must bail
      if (a.onPlatform) {
        input.move = 1;
        const plat = platformUnder(world, player.x, player.y, player.feet);
        const nearEdge = plat && player.x > plat.x + plat.w - 42;
        const mustBail = a.target.durability < 1.2 || dangerLeft;
        if (nearEdge || mustBail) {
          // Prefer walking onto next pad / swinging off rather than blind detach
          const np = nextPlatform(world, player);
          const nh = nextHandle(world, player, null);
          if (np && np.x - player.x < 100 && leapCooldown <= 0) {
            // walk off into short hop — detach with rightward intent
            input.detach = true;
            leapCooldown = 0.35;
            pushLog('auto_detach', { reason: 'plat_edge_walk' });
          } else if ((nh || hasLandingAhead(world, player, player.x + 40, player.x + 200)) && leapCooldown <= 0) {
            input.detach = true;
            leapCooldown = 0.35;
            pushLog('auto_detach', { reason: 'plat_edge_land' });
          } else if (mustBail && leapCooldown <= 0) {
            input.detach = true;
            leapCooldown = 0.4;
            pushLog('auto_detach', { reason: 'durability' });
          } else if (!nearEdge) {
            input.move = 1;
          }
        }
        return;
      }

      // Air swing: build rightward arc, detach only into a landing
      input.move = 1;
      if (player.y > H * 0.65 || a.length > 210) input.shorten = true;
      if (a.length < 75 && player.y < 140) input.lengthen = true;
      const goodAngle = a.angle > 0.55 && a.angle < 1.25 && a.omega > 0.55;
      const landOk = hasLandingAhead(world, player, player.x + 30, player.x + 220);
      const mustBail = a.target.durability < 0.9 || dangerLeft;
      if (((goodAngle && landOk) || (mustBail && landOk) || (mustBail && dangerLeft)) && leapCooldown <= 0) {
        input.detach = true;
        leapCooldown = 0.4;
        pushLog('auto_detach', { reason: mustBail ? 'bail' : 'swing', angle: +a.angle.toFixed(2) });
      }
      return;
    }

    if (state === 'handle') {
      input.move = 1;
      const nh = nextHandle(world, player, attachedHandle);
      const np = nextPlatform(world, player);
      // Wait for a reachable next hang/pad before leaping
      if (leapCooldown <= 0 && (nh || (np && np.x - player.x < 130))) {
        input.detach = true;
        leapCooldown = 0.45;
        pushLog('auto_leap', { reason: nh ? 'handle' : 'platform' });
      }
      return;
    }

    if (state === 'ladder') {
      input.shorten = true;
      return;
    }

    if (state === 'rope_fly') {
      input.move = preferRight ? 1 : 0;
      return;
    }

    // GROUND / AIR
    input.move = preferRight ? 1 : sx > W * 0.75 ? -1 : 1;

    const lad = ladderAhead(world, player);
    if (lad && state === 'ground' && Math.abs(lad.x - player.x) < 28) {
      input.shorten = true;
      return;
    }
    if (lad && lad.x > player.x && lad.x - player.x < 80) {
      input.move = 1;
      return;
    }

    const nh = nextHandle(world, player, attachedHandle);
    if (nh && state === 'ground' && nh.x - player.x < 90 && leapCooldown <= 0) {
      input.detach = true;
      leapCooldown = 0.35;
      return;
    }
    if (nh && state === 'air') {
      input.move = nh.x >= player.x ? 1 : -1;
      // Grab will happen via tryGrabHandle; if falling past, shoot rope
      if (player.vy > 120 && fireCooldown <= 0 && !rope.projectile) {
        const t = nearestTarget(world, player, true);
        if (t) {
          aimAt(input, player, world, t.x, t.y);
          input.fire = true;
          fireCooldown = 0.45;
          pushLog('auto_fire', { reason: 'air_fall' });
        }
      }
      return;
    }

    if (state === 'ground' && gapAhead(world, player) && leapCooldown <= 0) {
      const np = nextPlatform(world, player);
      const t = nearestTarget(world, player, true);
      // Jump if next pad is close; else rope
      if (np && np.x - player.x < 130) {
        input.detach = true;
        leapCooldown = 0.3;
        pushLog('auto_jump', { reason: 'gap_pad' });
      } else if (t && fireCooldown <= 0 && !rope.projectile && !rope.attached) {
        aimAt(input, player, world, t.x, t.y);
        input.fire = true;
        fireCooldown = 0.5;
        pushLog('auto_fire', { reason: 'gap_rope' });
      } else {
        input.detach = true;
        leapCooldown = 0.3;
        pushLog('auto_jump', { reason: 'gap_blind' });
      }
      return;
    }

    // On solid ground with runway ahead: just walk — don't rope spam
    if (state === 'ground') {
      const plat = platformUnder(world, player.x, player.y, player.feet);
      if (plat && player.x < plat.x + plat.w - 50) {
        input.move = 1;
        return;
      }
    }

    // Emergency rope only when falling / low / left danger
    if (
      fireCooldown <= 0 &&
      !rope.projectile &&
      !rope.attached &&
      (state === 'air' || dangerLeft)
    ) {
      const t = nearestTarget(world, player, true);
      if (t) {
        const falling = state === 'air' && player.vy > 60;
        const low = player.y > H * 0.58;
        if (falling || low || dangerLeft) {
          aimAt(input, player, world, t.x, t.y);
          input.fire = true;
          fireCooldown = 0.55;
          pushLog('auto_fire', { reason: dangerLeft ? 'danger' : 'rescue' });
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
