(function () {
  let __hsReady = false;
  function __startHideSeek() {
    if (__hsReady) return;
    __hsReady = true;
(function() {
  const canvas = document.getElementById('hs_gameCanvas');
  const ctx = canvas.getContext('2d');
  let W, H, DPR;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Map ----
  const TILE = 48;
  const MAP_W = 28, MAP_H = 22;

  // 0=floor, 1=wall, 2=crate(cover), 3=bush(soft cover)
  function buildMap() {
    let m = [];
    for (let y = 0; y < MAP_H; y++) {
      m.push([]);
      for (let x = 0; x < MAP_W; x++) {
        if (x === 0 || y === 0 || x === MAP_W-1 || y === MAP_H-1) m[y].push(1);
        else m[y].push(0);
      }
    }
    // Add walls/rooms
    const walls = [
      [3,2,1,5],[3,3,1,3],[8,2,5,1],[8,3,1,3],[14,1,1,4],[14,2,4,1],
      [20,2,1,4],[20,3,4,1],[24,2,1,5],[5,8,1,5],[10,7,5,1],[10,8,1,4],
      [16,7,6,1],[16,8,1,4],[22,8,1,5],[3,12,5,1],[3,13,1,4],[8,12,1,5],
      [13,12,5,1],[13,13,1,3],[19,12,1,5],[24,12,1,5],[5,17,6,1],[5,18,1,3],
      [12,17,5,1],[12,18,1,3],[18,17,6,1],[18,18,1,3],
    ];
    for (let [wx,wy,ww,wh] of walls) {
      for (let dy=0;dy<wh;dy++) for (let dx=0;dx<ww;dx++) {
        if (wy+dy<MAP_H-1 && wx+dx<MAP_W-1) m[wy+dy][wx+dx]=1;
      }
    }
    // Crates
    const crates = [
      [5,4],[6,4],[11,4],[12,4],[17,4],[18,4],[23,4],
      [5,10],[6,10],[11,10],[12,10],[17,10],[18,10],[23,10],
      [5,15],[6,15],[11,15],[12,15],[17,15],[22,15],
      [7,19],[8,19],[15,19],[16,19],[21,19],[22,19],
    ];
    for (let [cx,cy] of crates) { if (m[cy][cx]===0) m[cy][cx]=2; }
    // Bushes
    const bushes = [
      [9,5],[10,5],[15,5],[16,5],[21,5],[22,5],
      [3,9],[4,9],[9,9],[14,9],[15,9],[20,9],[25,9],
      [3,15],[9,14],[14,14],[20,14],[25,14],
      [10,18],[11,18],[17,18],[18,18],[24,18],
    ];
    for (let [bx,by] of bushes) { if (m[by][bx]===0) m[by][bx]=3; }
    return m;
  }

  const MAP = buildMap();

  function tileAt(tx,ty) {
    if (tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) return 1;
    return MAP[ty][tx];
  }
  function isSolid(tx,ty) { return tileAt(tx,ty)===1 || tileAt(tx,ty)===2; }
  function isHiding(tx,ty) { return tileAt(tx,ty)===3 || tileAt(tx,ty)===2; }

  // ---- Camera ----
  let camX=0, camY=0;

  // ---- Player (hunter) ----
  let hunter = {
    x: TILE*13.5, y: TILE*10.5,
    vx:0, vy:0,
    angle:0,
    color:'#d8742a'
  };
  const SPEED = 160;

  // ---- Bots ----
  const BOT_COLORS = ['#3a9d6e','#3a7dc4','#8a4fc4','#c44b3a','#e8b454','#7ad4e8','#e88fa8','#6dbf3a','#c0c0c0'];
  let bots = [];

  function spawnBots() {
    bots = [];
    const HIDE_SPOTS = [
      [4,3],[9,3],[15,3],[21,3],[26,3],
      [4,9],[9,9],[15,9],[21,9],
      [4,14],[9,14],[15,14],[21,14],[26,14],
      [4,19],[9,19],[15,19],[21,19],[26,19],
    ];
    let used = new Set();
    for (let i=0; i<9; i++) {
      let spot;
      do {
        spot = HIDE_SPOTS[Math.floor(Math.random()*HIDE_SPOTS.length)];
      } while (used.has(spot[0]+','+spot[1]));
      used.add(spot[0]+','+spot[1]);
      bots.push({
        x: spot[0]*TILE + TILE/2,
        y: spot[1]*TILE + TILE/2,
        color: BOT_COLORS[i],
        found: false,
        hiding: true,
        vx:0, vy:0,
        fleeTimer:0,
        wobble: Math.random()*Math.PI*2
      });
    }
  }

  // ---- Bullets ----
  let bullets = [];
  let ammo = 12;

  // ---- Game state ----
  let gameState = 'menu'; // menu, playing, over
  let timeLeft = 60;
  let foundCount = 0;
  let lastTime = 0;
  let raf = null;

  // Let the outer UI pause us when the player closes this screen,
  // so update()/draw() stop running (and the rAF loop is cancelled)
  // instead of ticking forever in the background.
  window.__pauseHideSeek = function() {
    if (gameState === 'playing') gameState = 'menu';
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  };
  window.__resumeHideSeek = function() {
    if (!raf) { lastTime = 0; raf = requestAnimationFrame(loop); }
  };

  // ---- Input ----
  let keys = { up:false, down:false, left:false, right:false };

  function addBtn(id, key) {
    const btn = document.getElementById(id);
    btn.addEventListener('pointerdown', e => { e.preventDefault(); keys[key]=true; });
    btn.addEventListener('pointerup', e => { e.preventDefault(); keys[key]=false; });
    btn.addEventListener('pointercancel', e => { keys[key]=false; });
  }
  addBtn('hs_btnUp','up'); addBtn('hs_btnDown','down');
  addBtn('hs_btnLeft','left'); addBtn('hs_btnRight','right');

  document.getElementById('hs_btnShoot').addEventListener('pointerdown', e => {
    e.preventDefault();
    shoot();
  });

  window.addEventListener('keydown', e => {
    if (e.code==='ArrowUp'||e.code==='KeyW') keys.up=true;
    if (e.code==='ArrowDown'||e.code==='KeyS') keys.down=true;
    if (e.code==='ArrowLeft'||e.code==='KeyA') keys.left=true;
    if (e.code==='ArrowRight'||e.code==='KeyD') keys.right=true;
    if (e.code==='Space') { e.preventDefault(); shoot(); }
  });
  window.addEventListener('keyup', e => {
    if (e.code==='ArrowUp'||e.code==='KeyW') keys.up=false;
    if (e.code==='ArrowDown'||e.code==='KeyS') keys.down=false;
    if (e.code==='ArrowLeft'||e.code==='KeyA') keys.left=false;
    if (e.code==='ArrowRight'||e.code==='KeyD') keys.right=false;
  });

  function shoot() {
    if (gameState !== 'playing' || ammo <= 0) return;
    ammo--;
    document.getElementById('hs_ammoCount').textContent = ammo;
    bullets.push({
      x: hunter.x, y: hunter.y,
      vx: Math.cos(hunter.angle)*380,
      vy: Math.sin(hunter.angle)*380,
      life: 1.2
    });
  }

  // ---- Move with collision ----
  function moveEntity(ent, dx, dy) {
    let nx = ent.x + dx;
    let ny = ent.y + dy;
    let r = 14;
    let txL = Math.floor((nx-r)/TILE), txR = Math.floor((nx+r-1)/TILE);
    let tyT = Math.floor((ent.y-r)/TILE), tyB = Math.floor((ent.y+r-1)/TILE);
    if (!isSolid(txL,tyT)&&!isSolid(txR,tyT)&&!isSolid(txL,tyB)&&!isSolid(txR,tyB)) ent.x=nx;
    txL=Math.floor((ent.x-r)/TILE); txR=Math.floor((ent.x+r-1)/TILE);
    let tyT2=Math.floor((ny-r)/TILE), tyB2=Math.floor((ny+r-1)/TILE);
    if (!isSolid(txL,tyT2)&&!isSolid(txR,tyT2)&&!isSolid(txL,tyB2)&&!isSolid(txR,tyB2)) ent.y=ny;
  }

  // ---- Line of sight ----
  function hasLOS(ax,ay,bx,by) {
    let dx=bx-ax, dy=by-ay, dist=Math.sqrt(dx*dx+dy*dy);
    let steps=Math.ceil(dist/12);
    for (let i=1;i<steps;i++) {
      let tx=Math.floor((ax+dx*i/steps)/TILE);
      let ty=Math.floor((ay+dy*i/steps)/TILE);
      if (tileAt(tx,ty)===1||tileAt(tx,ty)===2) return false;
    }
    return true;
  }

  // ---- Update ----
  function update(dt) {
    timeLeft -= dt;
    document.getElementById('hs_timerChip').textContent = '⏱ ' + Math.max(0,Math.ceil(timeLeft));
    if (timeLeft <= 0) { endGame(); return; }

    // Hunter movement
    let dx=0, dy=0;
    if (keys.up) dy=-1;
    if (keys.down) dy=1;
    if (keys.left) dx=-1;
    if (keys.right) dx=1;
    if (dx||dy) {
      let len=Math.sqrt(dx*dx+dy*dy);
      dx/=len; dy/=len;
      hunter.angle=Math.atan2(dy,dx);
      moveEntity(hunter, dx*SPEED*dt, dy*SPEED*dt);
    }

    // Update bullets
    for (let b of bullets) {
      b.x += b.vx*dt; b.y += b.vy*dt; b.life -= dt;
      let tx=Math.floor(b.x/TILE), ty=Math.floor(b.y/TILE);
      if (isSolid(tx,ty)) b.life=0;
      // check bot hits
      for (let bot of bots) {
        if (bot.found) continue;
        let ddx=b.x-bot.x, ddy=b.y-bot.y;
        if (ddx*ddx+ddy*ddy < 18*18) {
          bot.found=true; b.life=0;
          foundCount++;
          document.getElementById('hs_foundCount').textContent=foundCount;
          if (foundCount>=9) { endGame(); return; }
        }
      }
    }
    bullets=bullets.filter(b=>b.life>0);

    // Bot AI - flee when spotted
    for (let bot of bots) {
      if (bot.found) continue;
      bot.wobble += dt*2;
      let ddx=hunter.x-bot.x, ddy=hunter.y-bot.y;
      let dist=Math.sqrt(ddx*ddx+ddy*ddy);
      // Check if hunter can see bot
      let visible = dist < TILE*7 && hasLOS(hunter.x,hunter.y,bot.x,bot.y);
      let inBush = isHiding(Math.floor(bot.x/TILE), Math.floor(bot.y/TILE));
      if (visible && !inBush) {
        // flee
        bot.fleeTimer = 1.5;
      }
      if (bot.fleeTimer > 0) {
        bot.fleeTimer -= dt;
        // run away from hunter
        let fx = bot.x-hunter.x, fy = bot.y-hunter.y;
        let fl = Math.sqrt(fx*fx+fy*fy)+0.001;
        moveEntity(bot, (fx/fl)*100*dt, (fy/fl)*100*dt);
      }
    }

    // Camera follows hunter
    camX = hunter.x - W/2;
    camY = hunter.y - H/2;
    camX = Math.max(0, Math.min(MAP_W*TILE-W, camX));
    camY = Math.max(0, Math.min(MAP_H*TILE-H, camY));
  }

  // ---- Draw ----
  function drawMap() {
    let startX=Math.floor(camX/TILE), endX=Math.min(MAP_W,startX+Math.ceil(W/TILE)+2);
    let startY=Math.floor(camY/TILE), endY=Math.min(MAP_H,startY+Math.ceil(H/TILE)+2);
    for (let ty=startY;ty<endY;ty++) {
      for (let tx=startX;tx<endX;tx++) {
        let sx=tx*TILE-camX, sy=ty*TILE-camY;
        let t=tileAt(tx,ty);
        if (t===0) {
          ctx.fillStyle=(tx+ty)%2===0?'#1a1820':'#1e1c24';
          ctx.fillRect(sx,sy,TILE,TILE);
        } else if (t===1) {
          ctx.fillStyle='#0d0b14';
          ctx.fillRect(sx,sy,TILE,TILE);
          ctx.fillStyle='#2a2438';
          ctx.fillRect(sx+2,sy+2,TILE-4,TILE-4);
        } else if (t===2) {
          ctx.fillStyle='#1a1820';
          ctx.fillRect(sx,sy,TILE,TILE);
          ctx.fillStyle='#5a3a1a';
          ctx.fillRect(sx+4,sy+4,TILE-8,TILE-8);
          ctx.fillStyle='#7a5a2a';
          ctx.fillRect(sx+8,sy+8,TILE-16,TILE-16);
        } else if (t===3) {
          ctx.fillStyle='#1a2214';
          ctx.fillRect(sx,sy,TILE,TILE);
          // Bush circles
          ctx.fillStyle='#2a4a1a';
          ctx.beginPath(); ctx.arc(sx+TILE/2,sy+TILE/2,TILE/2-4,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#3a6a2a';
          ctx.beginPath(); ctx.arc(sx+TILE/2-5,sy+TILE/2,TILE/3,0,Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(sx+TILE/2+5,sy+TILE/2,TILE/3,0,Math.PI*2); ctx.fill();
        }
      }
    }
  }

  function drawNinja(x, y, color, angle, alpha) {
    let sx=x-camX, sy=y-camY;
    ctx.save();
    ctx.globalAlpha = alpha||1;
    ctx.translate(sx,sy);
    ctx.rotate(angle);
    // body
    ctx.fillStyle=color;
    ctx.beginPath(); ctx.ellipse(0,2,8,11,0,0,Math.PI*2); ctx.fill();
    // head
    ctx.fillStyle='#161412';
    ctx.beginPath(); ctx.arc(0,-10,7,0,Math.PI*2); ctx.fill();
    // eyes
    ctx.fillStyle='#f0d9a8';
    ctx.beginPath();
    ctx.ellipse(3,-10,1.5,1,0,0,Math.PI*2);
    ctx.ellipse(-3,-10,1.5,1,0,0,Math.PI*2);
    ctx.fill();
    // headband
    ctx.fillStyle=color;
    ctx.fillRect(-7,-13,14,3);
    ctx.restore();
  }

  function drawHunter() {
    drawNinja(hunter.x, hunter.y, '#d8742a', hunter.angle);
    // aim line
    ctx.save();
    ctx.strokeStyle='rgba(255,100,50,0.4)';
    ctx.lineWidth=1.5;
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    let sx=hunter.x-camX, sy=hunter.y-camY;
    ctx.moveTo(sx,sy);
    ctx.lineTo(sx+Math.cos(hunter.angle)*120, sy+Math.sin(hunter.angle)*120);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawBots() {
    for (let bot of bots) {
      if (bot.found) continue;
      let inBush = isHiding(Math.floor(bot.x/TILE), Math.floor(bot.y/TILE));
      let ddx=hunter.x-bot.x, ddy=hunter.y-bot.y;
      let dist=Math.sqrt(ddx*ddx+ddy*ddy);
      let visible = dist < TILE*7 && hasLOS(hunter.x,hunter.y,bot.x,bot.y);
      // show if visible and not in bush
      if (inBush) {
        // barely visible - just a wiggle
        if (visible && dist < TILE*3) {
          let sx=bot.x-camX+Math.sin(bot.wobble)*3, sy=bot.y-camY-12;
          ctx.fillStyle=bot.color;
          ctx.globalAlpha=0.3;
          ctx.beginPath(); ctx.arc(sx,sy,4,0,Math.PI*2); ctx.fill();
          ctx.globalAlpha=1;
        }
      } else {
        let alpha = visible ? 1 : 0;
        // always show if very close
        if (dist < TILE*1.5) alpha=1;
        if (alpha>0) drawNinja(bot.x, bot.y, bot.color, Math.atan2(hunter.y-bot.y,hunter.x-bot.x)+Math.PI, alpha);
      }
    }
  }

  function drawBullets() {
    for (let b of bullets) {
      ctx.fillStyle='#ffee44';
      ctx.shadowColor='#ffaa00'; ctx.shadowBlur=6;
      ctx.beginPath();
      ctx.arc(b.x-camX,b.y-camY,4,0,Math.PI*2);
      ctx.fill();
      ctx.shadowBlur=0;
    }
  }

  function drawFoundEffect() {
    for (let bot of bots) {
      if (!bot.found) continue;
      let sx=bot.x-camX, sy=bot.y-camY;
      ctx.save();
      ctx.globalAlpha=0.6;
      ctx.fillStyle=bot.color;
      ctx.font='bold 16px Segoe UI';
      ctx.textAlign='center';
      ctx.fillText('✓',sx,sy-5);
      ctx.restore();
    }
  }

  function draw() {
    ctx.clearRect(0,0,W,H);
    drawMap();
    drawBots();
    drawBullets();
    drawHunter();
    drawFoundEffect();

    // Minimap
    let mm=5, mox=W-MAP_W*mm-10, moy=10;
    ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.fillRect(mox-2,moy-2,MAP_W*mm+4,MAP_H*mm+4);
    for (let ty=0;ty<MAP_H;ty++) {
      for (let tx=0;tx<MAP_W;tx++) {
        let t=tileAt(tx,ty);
        ctx.fillStyle = t===1?'#2a2438':t===2?'#5a3a1a':t===3?'#2a4a1a':'#1a1820';
        ctx.fillRect(mox+tx*mm, moy+ty*mm, mm-1, mm-1);
      }
    }
    // hunter on minimap
    ctx.fillStyle='#d8742a';
    ctx.beginPath(); ctx.arc(mox+hunter.x/TILE*mm, moy+hunter.y/TILE*mm, 3,0,Math.PI*2); ctx.fill();
    // bots on minimap (only found ones shown)
    for (let bot of bots) {
      if (!bot.found) continue;
      ctx.fillStyle=bot.color;
      ctx.globalAlpha=0.7;
      ctx.beginPath(); ctx.arc(mox+bot.x/TILE*mm, moy+bot.y/TILE*mm, 2,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    }
  }

  // ---- Game loop ----
  function loop(ts) {
    if (!lastTime) lastTime=ts;
    let dt=Math.min((ts-lastTime)/1000, 0.033);
    lastTime=ts;
    if (gameState==='playing') {
      update(dt);
      draw();
    }
    raf=requestAnimationFrame(loop);
  }

  function startGame() {
    hunter.x=TILE*13.5; hunter.y=TILE*10.5;
    hunter.angle=0;
    ammo=12; foundCount=0; timeLeft=60;
    bullets=[];
    spawnBots();
    document.getElementById('hs_foundCount').textContent='0';
    document.getElementById('hs_ammoCount').textContent='12';
    document.getElementById('hs_timerChip').textContent='⏱ 60';
    gameState='playing';
    document.getElementById('hs_overlay').classList.add('hidden');
    document.getElementById('hs_resultOverlay').style.display='none';
  }

  function endGame() {
    gameState='over';
    let won = foundCount>=9;
    const t = (window.NinjaI18n && NinjaI18n.t.bind(NinjaI18n)) || ((k) => k);
    document.getElementById('hs_resultSub').textContent = won ? t('hideSeek.winSub') : t('hideSeek.loseSub');
    document.getElementById('hs_resultScore').textContent = foundCount + '/9';
    document.getElementById('hs_resultMsg').textContent = won ? t('hideSeek.winMsg') : t('hideSeek.loseMsg');
    document.getElementById('hs_resultOverlay').style.display='flex';
  }

  document.getElementById('hs_btnStart').addEventListener('click', startGame);
  document.getElementById('hs_btnRestart').addEventListener('click', startGame);

  // initial draw
  resize();
  draw();
  raf=requestAnimationFrame(loop);
})();
  }

  document.getElementById('hideSeekBtn').addEventListener('click', () => {
    if (window.NinjaGrip) window.NinjaGrip.setPaused(true);
    document.getElementById('hideSeekScreen').style.display = 'block';
    setTimeout(() => {
      __startHideSeek();
      if (typeof __resumeHideSeek === 'function') __resumeHideSeek();
    }, 50);
  });

  document.getElementById('hs_closeBtn').addEventListener('click', () => {
    document.getElementById('hideSeekScreen').style.display = 'none';
    if (typeof __pauseHideSeek === 'function') __pauseHideSeek();
    if (window.NinjaGrip) window.NinjaGrip.setPaused(false);
  });
})();
