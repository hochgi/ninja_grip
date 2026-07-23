(function () {
  const BATTLE_ENEMIES = [
    { nameKey: 'battle.enemy', name: 'Dojo Guard', hp: 4, speed: 130, atkInterval: 2.2, reward: 25, color: '#c44b3a' },
    { nameKey: 'battle.enemy', name: 'Shadow Warrior', hp: 6, speed: 160, atkInterval: 1.8, reward: 50, color: '#8a4fc4' },
    { nameKey: 'battle.enemy', name: 'Battle Master', hp: 9, speed: 190, atkInterval: 1.4, reward: 80, color: '#3a7dc4' },
    { nameKey: 'battle.enemy', name: 'Shadow Lord', hp: 14, speed: 220, atkInterval: 1.0, reward: 150, color: '#c4302a' },
    { nameKey: 'battle.enemy', name: 'Black Dragon', hp: 20, speed: 260, atkInterval: 0.7, reward: 250, color: '#ffd454' },
  ];

  // Localized names via he/en simple map
  const NAMES = {
    'he-IL': ['שומר הדוג\'ו', 'לוחם הצללים', 'מאסטר הקרב', 'שר הצל', 'הדרקון השחור'],
    'en-US': ['Dojo Guard', 'Shadow Warrior', 'Battle Master', 'Shadow Lord', 'Black Dragon'],
  };

  let battleStageNum = 0;
  let battleRaf = null;
  let boundOnce = false;

  function enemyName(idx) {
    const lng = (window.NinjaI18n && NinjaI18n.language) || 'he-IL';
    const list = NAMES[lng] || NAMES['en-US'];
    return list[Math.min(idx, list.length - 1)];
  }

  function startBattle() {
    if (window.NinjaGrip) NinjaGrip.setPaused(true);
    document.getElementById('battleOverlay').classList.remove('hidden');
    runBattleStage(battleStageNum);
  }

  function runBattleStage(stageIdx) {
    if (window.__battleCleanup) window.__battleCleanup();

    const bc = document.getElementById('battleCanvas');
    const bctx = bc.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let BW = window.innerWidth;
    let BH = window.innerHeight;
    bc.width = BW * dpr;
    bc.height = BH * dpr;
    bc.style.width = BW + 'px';
    bc.style.height = BH + 'px';
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const enemyDef = BATTLE_ENEMIES[Math.min(stageIdx, BATTLE_ENEMIES.length - 1)];
    document.getElementById('battleStageLabel').textContent = NinjaI18n.t('battle.stage', { n: stageIdx + 1 });
    document.getElementById('enemyNameDisplay').textContent = enemyName(stageIdx);

    let bEnemyHp = enemyDef.hp;
    let bPlayerHp = 3;
    let playerX = BW * 0.2;
    let playerY = BH * 0.65;
    let playerVY = 0;
    let moveLeft = false;
    let moveRight = false;
    let isJumping = false;
    const groundY = BH * 0.72;
    let bEnemyX = BW * 0.75;
    const bEnemyY = groundY;
    let atkTimer = enemyDef.atkInterval;
    let bAttacks = [];
    let bSwords = [];
    let attackCooldown = 0;
    let hitFlash = 0;
    let enemyHitFlash = 0;
    let lastBt = 0;
    let gameEnded = false;
    const listeners = [];

    document.getElementById('enemyHpBar').style.width = '100%';
    document.getElementById('battlePlayerHpDisplay').textContent = '❤️ '.repeat(bPlayerHp);

    function updateHpBar() {
      document.getElementById('enemyHpBar').style.width =
        Math.max(0, (bEnemyHp / enemyDef.hp) * 100) + '%';
      document.getElementById('battlePlayerHpDisplay').textContent = '❤️ '.repeat(Math.max(0, bPlayerHp));
    }

    function endBattle(won) {
      gameEnded = true;
      cancelAnimationFrame(battleRaf);
      setTimeout(() => {
        document.getElementById('battleOverlay').classList.add('hidden');
        document.getElementById('battleResultOverlay').style.display = 'flex';
        const resultBtn = document.getElementById('battleResultBtn');
        resultBtn.style.pointerEvents = 'none';
        setTimeout(() => {
          resultBtn.style.pointerEvents = '';
        }, 600);
        if (won) {
          document.getElementById('battleResultSub').textContent = NinjaI18n.t('battle.winSub');
          document.getElementById('battleResultTitle').textContent = '🏆';
          const reward = enemyDef.reward;
          if (window.NinjaGrip) NinjaGrip.addCoins(reward);
          document.getElementById('battleResultMsg').textContent = NinjaI18n.t('battle.winMsg', {
            reward,
          });
          battleStageNum = Math.min(stageIdx + 1, BATTLE_ENEMIES.length - 1);
          document.getElementById('battleBtnLabel').textContent = NinjaI18n.t('battle.stage', {
            n: battleStageNum + 1,
          });
          resultBtn.textContent = NinjaI18n.t('battle.next');
        } else {
          document.getElementById('battleResultSub').textContent = NinjaI18n.t('battle.loseSub');
          document.getElementById('battleResultTitle').textContent = '💀';
          document.getElementById('battleResultMsg').textContent = NinjaI18n.t('battle.loseMsg');
          resultBtn.textContent = NinjaI18n.t('battle.back');
        }
      }, 80);
    }

    function battleLoop(ts) {
      if (!lastBt) lastBt = ts;
      const dt = Math.min((ts - lastBt) / 1000, 0.033);
      lastBt = ts;
      if (gameEnded) return;

      playerVY += 900 * dt;
      playerY += playerVY * dt;
      if (playerY >= groundY) {
        playerY = groundY;
        playerVY = 0;
        isJumping = false;
      }
      const playerVX = moveLeft ? -220 : moveRight ? 220 : 0;
      playerX += playerVX * dt;
      playerX = Math.max(20, Math.min(BW - 20, playerX));

      const ex = bEnemyX - playerX;
      if (Math.abs(ex) > 80) bEnemyX -= Math.sign(ex) * enemyDef.speed * dt;

      atkTimer -= dt;
      if (atkTimer <= 0) {
        atkTimer = enemyDef.atkInterval;
        const dir = playerX < bEnemyX ? -1 : 1;
        if (stageIdx < 2) {
          bAttacks.push({ x: bEnemyX, y: bEnemyY - 20, vx: dir * 350, type: 'slash', life: 1 });
        } else {
          bAttacks.push({
            x: bEnemyX,
            y: groundY - 30,
            vx: dir * 320,
            type: 'shuriken',
            angle: 0,
            life: 1,
          });
          if (stageIdx >= 3) {
            bAttacks.push({
              x: bEnemyX,
              y: groundY - 80,
              vx: dir * 320,
              type: 'shuriken',
              angle: 0,
              life: 1,
            });
          }
        }
      }

      for (const a of bAttacks) {
        a.x += a.vx * dt;
        if (a.type === 'shuriken') a.angle = (a.angle || 0) + dt * 10;
        a.life -= dt * 0.5;
        if (a.life > 0 && Math.abs(a.x - playerX) < 30 && Math.abs(a.y - playerY) < 40) {
          a.life = 0;
          bPlayerHp--;
          hitFlash = 0.4;
          updateHpBar();
          if (bPlayerHp <= 0) {
            endBattle(false);
            return;
          }
        }
      }
      bAttacks = bAttacks.filter((a) => a.life > 0 && a.x > -50);

      attackCooldown -= dt;
      for (const s of bSwords) {
        s.x += 400 * dt;
        s.life -= dt * 1.5;
        if (Math.abs(s.x - bEnemyX) < 80 && Math.abs(s.y - bEnemyY) < 90 && !s.hit) {
          s.hit = true;
          bEnemyHp--;
          enemyHitFlash = 0.3;
          updateHpBar();
          if (bEnemyHp <= 0) {
            endBattle(true);
            return;
          }
        }
      }
      bSwords = bSwords.filter((s) => s.life > 0 && !s.hit);
      if (hitFlash > 0) hitFlash -= dt;
      if (enemyHitFlash > 0) enemyHitFlash -= dt;

      bctx.clearRect(0, 0, BW, BH);
      const bg = bctx.createLinearGradient(0, 0, 0, BH);
      bg.addColorStop(0, '#1a0a0a');
      bg.addColorStop(1, '#0a0505');
      bctx.fillStyle = bg;
      bctx.fillRect(0, 0, BW, BH);
      bctx.fillStyle = '#2a1010';
      bctx.fillRect(0, groundY + 10, BW, BH - groundY);
      bctx.strokeStyle = '#c44b3a';
      bctx.lineWidth = 2;
      bctx.beginPath();
      bctx.moveTo(0, groundY + 10);
      bctx.lineTo(BW, groundY + 10);
      bctx.stroke();

      bctx.save();
      bctx.translate(playerX, playerY);
      if (hitFlash > 0) bctx.globalAlpha = 0.5 + Math.sin(hitFlash * 30) * 0.5;
      const skin = NinjaSkins.getCurrentSkin();
      bctx.fillStyle = skin.body;
      bctx.beginPath();
      bctx.ellipse(0, -16, 9, 14, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.fillStyle = skin.sash;
      bctx.beginPath();
      bctx.ellipse(0, -14, 4, 9, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.fillStyle = skin.body;
      bctx.beginPath();
      bctx.arc(0, -34, 8, 0, Math.PI * 2);
      bctx.fill();
      bctx.fillStyle = skin.eyes;
      bctx.beginPath();
      bctx.ellipse(-3, -35, 1.5, 1, 0, 0, Math.PI * 2);
      bctx.ellipse(3, -35, 1.5, 1, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.fillStyle = skin.headband;
      bctx.fillRect(-8, -38, 16, 3);
      bctx.restore();

      bctx.save();
      bctx.translate(bEnemyX, bEnemyY);
      if (enemyHitFlash > 0) bctx.globalAlpha = 0.4 + Math.sin(enemyHitFlash * 30) * 0.6;
      bctx.fillStyle = enemyDef.color;
      bctx.beginPath();
      bctx.ellipse(0, -16, 11, 16, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.fillStyle = '#1a0808';
      bctx.beginPath();
      bctx.arc(0, -36, 10, 0, Math.PI * 2);
      bctx.fill();
      bctx.fillStyle = '#ff3030';
      bctx.beginPath();
      bctx.ellipse(-3, -37, 2, 1.5, 0, 0, Math.PI * 2);
      bctx.ellipse(3, -37, 2, 1.5, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.restore();

      for (const a of bAttacks) {
        bctx.save();
        bctx.translate(a.x, a.y);
        if (a.type === 'shuriken') {
          bctx.rotate(a.angle);
          bctx.fillStyle = '#c0c0c0';
          for (let i = 0; i < 4; i++) {
            bctx.rotate(Math.PI / 2);
            bctx.beginPath();
            bctx.moveTo(0, 0);
            bctx.lineTo(3, -10);
            bctx.lineTo(0, -6);
            bctx.lineTo(-3, -10);
            bctx.closePath();
            bctx.fill();
          }
        } else {
          bctx.strokeStyle = '#ff6a3a';
          bctx.lineWidth = 3;
          bctx.beginPath();
          bctx.moveTo(-20, 0);
          bctx.lineTo(20, 0);
          bctx.stroke();
        }
        bctx.restore();
      }
      for (const s of bSwords) {
        bctx.save();
        bctx.translate(s.x, s.y);
        bctx.globalAlpha = Math.max(0, s.life);
        bctx.strokeStyle = '#7ad4e8';
        bctx.lineWidth = 3;
        bctx.beginPath();
        bctx.moveTo(-18, 0);
        bctx.lineTo(18, 0);
        bctx.stroke();
        bctx.restore();
      }

      battleRaf = requestAnimationFrame(battleLoop);
    }

    function addBtnControl(id, onDown, onUp) {
      const btn = document.getElementById(id);
      if (!btn) return;
      const down = (e) => {
        e.preventDefault();
        if (!gameEnded) onDown();
      };
      const up = (e) => {
        e.preventDefault();
        if (onUp) onUp();
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      listeners.push([btn, 'pointerdown', down], [btn, 'pointerup', up], [btn, 'pointercancel', up]);
    }

    addBtnControl(
      'battleLeft',
      () => {
        moveLeft = true;
      },
      () => {
        moveLeft = false;
      }
    );
    addBtnControl(
      'battleRight',
      () => {
        moveRight = true;
      },
      () => {
        moveRight = false;
      }
    );
    addBtnControl('battleJump', () => {
      if (!isJumping) {
        playerVY = -520;
        isJumping = true;
      }
    });
    addBtnControl('battleAttack', () => {
      if (attackCooldown <= 0) {
        bSwords.push({ x: playerX + 20, y: playerY - 20, life: 1, hit: false });
        attackCooldown = 0.35;
      }
    });

    battleRaf = requestAnimationFrame(battleLoop);

    window.__battleCleanup = () => {
      gameEnded = true;
      moveLeft = false;
      moveRight = false;
      cancelAnimationFrame(battleRaf);
      for (const [el, type, fn] of listeners) el.removeEventListener(type, fn);
      listeners.length = 0;
    };
  }

  document.getElementById('battleBtn').addEventListener('click', startBattle);
  document.getElementById('battleResultBtn').addEventListener('click', () => {
    document.getElementById('battleResultOverlay').style.display = 'none';
    if (window.__battleCleanup) window.__battleCleanup();
    if (window.NinjaGrip) NinjaGrip.setPaused(false);
  });
})();
