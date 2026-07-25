(function (global) {
  const ROPE_MAX_RANGE = 280;
  const ROPE_MIN_LEN = 40;
  const ROPE_MAX_LEN = 260;
  const ROPE_PROJ_SPEED = 520;
  const ROPE_FIRE_COOLDOWN = 0.28;
  const GRAVITY = 1400;
  // Stronger player torque so swing builds momentum quickly
  const SWING_INPUT = 5.2;
  // Spin caps — base is safe; weaker/smaller targets allow a bit more kick (not uncapped).
  const MAX_OMEGA_BASE = 3.0;
  const MAX_OMEGA_BONUS = 1.7; // tiny+weak peak ≈ 4.7 rad/s
  const MAX_FLING_BASE = 420;
  const MAX_FLING_BONUS = 200; // peak ≈ 620 px/s
  const SIZE_MIN = 12;
  const SIZE_MAX = 26;
  // After a target snaps, gravity eases in so the player can re-shoot
  const SNAP_FALL_GRACE = 0.5;
  const SNAP_FALL_MIN_G = 0.1;

  function createRopeState() {
    return {
      aimAngle: -Math.PI / 4,
      aimX: 1,
      aimY: -1,
      projectile: null, // {x,y,vx,vy}
      attached: null, // {target, length, angle, omega, maxOmega, maxFling}
      cooldown: 0,
      lengthInput: 0, // -1 shorten, +1 lengthen
    };
  }

  // Angle is from downward vertical: pos = target + (sinθ·L, cosθ·L)
  // Tangent (d pos / dθ): (cosθ·L, -sinθ·L)
  function tangentialVelocity(angle, omega, length) {
    return {
      vx: Math.cos(angle) * omega * length,
      vy: -Math.sin(angle) * omega * length,
    };
  }

  function omegaFromVelocity(angle, length, vx, vy) {
    return (vx * Math.cos(angle) - vy * Math.sin(angle)) / Math.max(length, 1);
  }

  /** 0 = large+strong (least spin), 1 = small+weak (most spin). */
  function targetSpice(target) {
    if (!target) return 0;
    const sizeT = 1 - (Math.max(SIZE_MIN, Math.min(SIZE_MAX, target.radius)) - SIZE_MIN) / (SIZE_MAX - SIZE_MIN);
    const strengthT = target.tier === 'weak' ? 1 : target.tier === 'medium' ? 0.5 : 0;
    return Math.max(0, Math.min(1, 0.55 * sizeT + 0.45 * strengthT));
  }

  function limitsForTarget(target) {
    const spice = targetSpice(target);
    return {
      maxOmega: MAX_OMEGA_BASE + MAX_OMEGA_BONUS * spice,
      maxFling: MAX_FLING_BASE + MAX_FLING_BONUS * spice,
    };
  }

  function clampOmega(omega, maxOmega) {
    const cap = maxOmega != null ? maxOmega : MAX_OMEGA_BASE;
    if (omega > cap) return cap;
    if (omega < -cap) return -cap;
    return omega;
  }

  function clampFling(v, maxFling) {
    const cap = maxFling != null ? maxFling : MAX_FLING_BASE;
    const s = Math.hypot(v.vx, v.vy);
    if (s > cap && s > 0) {
      const k = cap / s;
      v.vx *= k;
      v.vy *= k;
    }
    return v;
  }

  function setAimFromDir(rope, dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    rope.aimX = dx / len;
    rope.aimY = dy / len;
    rope.aimAngle = Math.atan2(rope.aimY, rope.aimX);
  }

  function fire(rope, player) {
    if (rope.cooldown > 0 || rope.attached || rope.projectile) return false;
    rope.projectile = {
      x: player.x,
      y: player.y,
      vx: rope.aimX * ROPE_PROJ_SPEED,
      vy: rope.aimY * ROPE_PROJ_SPEED,
      traveled: 0,
    };
    rope.cooldown = ROPE_FIRE_COOLDOWN;
    return true;
  }

  function detach(rope, player) {
    if (!rope.attached) return false;
    const a = rope.attached;
    const v = clampFling(tangentialVelocity(a.angle, a.omega, a.length), a.maxFling);
    player.vx = v.vx;
    player.vy = v.vy;
    rope.attached = null;
    return true;
  }

  function attachTo(rope, player, target) {
    const dx = player.x - target.x;
    const dy = player.y - target.y;
    let length = Math.hypot(dx, dy);
    length = Math.max(ROPE_MIN_LEN, Math.min(ROPE_MAX_LEN, length));
    const angle = Math.atan2(dx, dy); // 0 = hanging straight down
    const lim = limitsForTarget(target);
    const omega = clampOmega(
      omegaFromVelocity(angle, length, player.vx, player.vy),
      lim.maxOmega
    );
    rope.attached = {
      target,
      length,
      angle,
      omega,
      maxOmega: lim.maxOmega,
      maxFling: lim.maxFling,
      onPlatform: false,
    };
    rope.projectile = null;
    player.vx = 0;
    player.vy = 0;
    player.fallGrace = 0;
  }

  function updateProjectile(rope, world, dt) {
    const p = rope.projectile;
    if (!p) return null;
    const step = ROPE_PROJ_SPEED * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += step;
    if (p.traveled > ROPE_MAX_RANGE) {
      rope.projectile = null;
      return null;
    }
    const hit = global.NinjaWorld.targetHit(world, p.x, p.y);
    if (hit) return hit;
    return null;
  }

  function beginSnapFall(rope, player, angle, omega, length, maxFling) {
    const v = clampFling(tangentialVelocity(angle, omega, length), maxFling);
    player.vx = v.vx;
    // Soften initial downward plunge so a re-shot is possible
    player.vy = Math.min(v.vy, 60);
    player.fallGrace = SNAP_FALL_GRACE;
    rope.attached = null;
    rope.cooldown = 0;
  }

  function updateAttached(rope, player, dt) {
    const a = rope.attached;
    if (!a || !a.target || a.target.broken) {
      rope.attached = null;
      return;
    }

    const maxOmega = a.maxOmega != null ? a.maxOmega : MAX_OMEGA_BASE;

    // Length change — shortening spins you up, but still within this target's omega cap
    if (rope.lengthInput !== 0) {
      const oldLen = a.length;
      a.length += rope.lengthInput * 140 * dt;
      a.length = Math.max(ROPE_MIN_LEN, Math.min(ROPE_MAX_LEN, a.length));
      if (a.length < oldLen && a.length > 0) {
        a.omega *= oldLen / a.length;
      }
      a.omega = clampOmega(a.omega, maxOmega);
    }

    // Pendulum: alpha = -(g/L) sin(theta) + input torque
    // While standing on a platform with rope live, only allow lift-off torque (no dig-in).
    const input = player.move * SWING_INPUT;
    const alpha = -(GRAVITY / a.length) * Math.sin(a.angle) + input;
    a.omega += alpha * dt;
    const spinRatio = Math.min(1, Math.abs(a.omega) / Math.max(0.001, maxOmega));
    const damp = 0.995 - 0.02 * spinRatio * spinRatio;
    a.omega *= Math.pow(damp, dt * 60);
    a.omega = clampOmega(a.omega, maxOmega);
    a.angle += a.omega * dt;

    player.x = a.target.x + Math.sin(a.angle) * a.length;
    player.y = a.target.y + Math.cos(a.angle) * a.length;
    a.onPlatform = false;

    a.target.durability -= dt;
    if (a.target.durability <= 0) {
      a.target.durability = 0;
      a.target.broken = true;
      a.target.brokenFor = 0;
      beginSnapFall(rope, player, a.angle, a.omega, a.length, a.maxFling);
    }
  }

  /**
   * One-way platform support while rope is live: land from above, pass through from below.
   * Keeps the rope attached and refits angle/length to the standing pose.
   */
  function resolveAttachedPlatform(rope, player, world, prevY, feet) {
    const a = rope.attached;
    if (!a || !a.target) return false;

    const prevFeet = prevY + feet;
    const feetY = player.y + feet;
    // Only when moving downward onto a surface
    if (feetY < prevFeet - 0.5) return false;

    const plat = global.NinjaWorld.platformAt(world, player.x, player.y, player.w || 12, feet);
    if (!plat) return false;

    // Must have been at/above the top before this frame (one-way from below)
    if (prevFeet > plat.y + 4) return false;
    if (feetY < plat.y - 2) return false;

    player.y = plat.y - feet;
    const dx = player.x - a.target.x;
    const dy = player.y - a.target.y;
    let length = Math.hypot(dx, dy);
    length = Math.max(ROPE_MIN_LEN, Math.min(ROPE_MAX_LEN, length));
    a.length = length;
    a.angle = Math.atan2(dx, dy);
    // Kill downward spin into the floor; keep a little horizontal carry
    a.omega *= 0.25;
    a.omega = clampOmega(a.omega, a.maxOmega);
    a.onPlatform = true;
    return true;
  }

  /** Gravity multiplier while fallGrace is active (ease-in from SNAP_FALL_MIN_G → 1). */
  function fallGravityScale(player) {
    if (!player.fallGrace || player.fallGrace <= 0) return 1;
    const t = 1 - player.fallGrace / SNAP_FALL_GRACE; // 0 at snap → 1 when done
    const eased = t * t;
    return SNAP_FALL_MIN_G + (1 - SNAP_FALL_MIN_G) * eased;
  }

  function tickFallGrace(player, dt) {
    if (player.fallGrace > 0) {
      player.fallGrace = Math.max(0, player.fallGrace - dt);
    }
  }

  function drawAim(ctx, rope, player, world, W) {
    const sx = global.NinjaWorld.worldToScreen(world, player.x);
    const sy = player.y;
    const ex = sx + rope.aimX * ROPE_MAX_RANGE;
    const ey = sy + rope.aimY * ROPE_MAX_RANGE;
    ctx.strokeStyle = 'rgba(240,217,168,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(216,162,58,0.8)';
    ctx.beginPath();
    ctx.arc(sx + rope.aimX * 40, sy + rope.aimY * 40, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRope(ctx, rope, player, world) {
    if (rope.projectile) {
      const sx = global.NinjaWorld.worldToScreen(world, rope.projectile.x);
      const sy = rope.projectile.y;
      const psx = global.NinjaWorld.worldToScreen(world, player.x);
      ctx.strokeStyle = 'rgba(216,162,58,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(psx, player.y);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.fillStyle = '#f0d9a8';
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (rope.attached && rope.attached.target) {
      const t = rope.attached.target;
      const sx = global.NinjaWorld.worldToScreen(world, t.x);
      const psx = global.NinjaWorld.worldToScreen(world, player.x);
      ctx.strokeStyle = 'rgba(216,162,58,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx, t.y);
      ctx.lineTo(psx, player.y);
      ctx.stroke();
    }
  }

  global.NinjaRope = {
    ROPE_MAX_RANGE,
    ROPE_MIN_LEN,
    ROPE_MAX_LEN,
    GRAVITY,
    SNAP_FALL_GRACE,
    createRopeState,
    setAimFromDir,
    fire,
    detach,
    attachTo,
    updateProjectile,
    updateAttached,
    resolveAttachedPlatform,
    fallGravityScale,
    tickFallGrace,
    drawAim,
    drawRope,
  };
})(window);
