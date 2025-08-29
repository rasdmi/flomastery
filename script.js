(() => {
  // ---------- DOM ----------
  const c = document.getElementById('game');
  const ctx = c.getContext('2d');
  const levelTitle = document.getElementById('levelTitle');
  const dogSpdLabel = document.getElementById('dogSpdLabel');
  const timerEl = document.getElementById('timer');
  const hintEl = document.getElementById('hint');
  const sumEl = document.getElementById('summary');
  const sumTitle = document.getElementById('summaryTitle');
  const sumText = document.getElementById('sumText');
  const restartBtn = document.getElementById('restart');
  const navEl = document.getElementById('nav');
  const openNavBtn = document.getElementById('openNav');
  const closeNavBtn = document.getElementById('closeNav');
  const toggleArrowsBtn = document.getElementById('toggleArrows');

  // mobile buttons
  const btnUp = document.getElementById('btnUp');
  const btnDown = document.getElementById('btnDown');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnJump = document.getElementById('btnJump');
  const spd1 = document.getElementById('spd1');
  const spd2 = document.getElementById('spd2');
  const spd3 = document.getElementById('spd3');
  const btnInfo = document.getElementById('btnInfo');
  const btnCompass = document.getElementById('btnCompass');
  const btnRestart = document.getElementById('btnRestart');

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('show-controls');
  }

  const T = window.TEXT || {};
  const CFG = window.CONFIG || {};
  hintEl.textContent = T.hint || "";
  sumTitle.textContent = T.end_title || "Финиш!";
  restartBtn.textContent = T.restart_btn || "🔄 Ещё раз";

  // ---------- Константы ----------
  const TILE = CFG.tile ?? 32;
  const SPEED = CFG.playerSpeed ?? 3.2;
  const R_PLAYER = CFG.playerRadius ?? 10;

  const BASE_COLS = CFG.baseCols ?? 8;
  const BASE_ROWS = CFG.baseRows ?? 6;
  const SCALE = CFG.levelScale ?? 1.4;

  const ARROW_STEP = CFG.arrowStep ?? 3;
  const ARROW_LOOK = CFG.arrowLookAhead ?? 2;
  const ARROW_R = CFG.arrowActiveRadius ?? 140;
  const ARROW_MAX_A = CFG.arrowMaxAlpha ?? 0.95;
  const NAV_RECALC_MS = CFG.navRecalcMs ?? 400;

  const JUMP_CD = CFG.jumpCooldownMs ?? 900;

  const DOG_SPEEDS = CFG.dogSpeeds ?? [2.0, 2.8, 3.8];
  const DOG_RECALC_MS = CFG.dogRecalcMs ?? 260;

  // ---------- Состояние ----------
  let level = 1;
  let loopTicking = false;
  let running = true;
  let startTime = performance.now();
  let caught = false;

  // мир
  let WORLD_W = c.width, WORLD_H = c.height;
  let camX = 0, camY = 0;

  // рендер-скейл, чтобы всё влезало
  let RENDER_S = 1, RENDER_OX = 0, RENDER_OY = 0;

  // сетка-лабиринт
  let maze = null;   // {walls,w,h,cell}
  let exitCell = null;

  // игрок
  const player = { x: TILE*1.5, y: TILE*1.5, r: R_PLAYER, vx:0, vy:0 };
  let lastDir = {x:1, y:0};
  let jumpReadyAt = 0;

  // собака
  const dog = { x: 0, y: 0, r: 10, path: [], next: 1, recalcAt: 0, speed: DOG_SPEEDS[1], tier: 2 };

  // стрелки-навигация
  const arrows = [];
  let navRecalcAt = 0;
  let showArrows = true;

  // ---------- Ввод ----------
  const keys = {up:false,down:false,left:false,right:false};
  addEventListener('keydown', e=>{
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
      e.preventDefault();
    }    
    if(e.code==='ArrowUp'||e.code==='KeyW') keys.up=true;
    if(e.code==='ArrowDown'||e.code==='KeyS') keys.down=true;
    if(e.code==='ArrowLeft'||e.code==='KeyA') keys.left=true;
    if(e.code==='ArrowRight'||e.code==='KeyD') keys.right=true;
    if(e.code==='Space') tryJump();
    if(e.code==='Digit1') setDogTier(1);
    if(e.code==='Digit2') setDogTier(2);
    if(e.code==='Digit3') setDogTier(3);
    if(e.code==='KeyR') startLevel(level, true);
    if(e.code==='KeyM') startLevel(1, true);
    if(e.key==='?' || e.code==='Slash') openNav();
    if(e.code==='KeyN') toggleArrows();
  });
  addEventListener('keyup', e=>{
    if(e.code==='ArrowUp'||e.code==='KeyW') keys.up=false;
    if(e.code==='ArrowDown'||e.code==='KeyS') keys.down=false;
    if(e.code==='ArrowLeft'||e.code==='KeyA') keys.left=false;
    if(e.code==='ArrowRight'||e.code==='KeyD') keys.right=false;
  });
  restartBtn.addEventListener('click', ()=>startLevel(1, true));
// перезапуск на кнопку в модалке "Финиш"

  function openNav(){ navEl.classList.remove('hidden'); }
  openNavBtn.addEventListener('click', openNav);
  if (closeNavBtn) closeNavBtn.addEventListener('click', ()=>navEl.classList.add('hidden'));
  toggleArrowsBtn.addEventListener('click', toggleArrows);
  function toggleArrows(){ showArrows=!showArrows; }

  // touch controls
  function hold(btn, on, off){
    if(!btn) return;
    const down = (e)=>{ e.preventDefault(); on(); btn.classList.add('active'); };
    const up = (e)=>{ e.preventDefault(); off(); btn.classList.remove('active'); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
  }
  hold(btnUp, ()=>keys.up=true, ()=>keys.up=false);
  hold(btnDown, ()=>keys.down=true, ()=>keys.down=false);
  hold(btnLeft, ()=>keys.left=true, ()=>keys.left=false);
  hold(btnRight, ()=>keys.right=true, ()=>keys.right=false);
  if(btnJump) btnJump.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tryJump(); });
  if(btnInfo) btnInfo.addEventListener('click', openNav);
  if(btnCompass) btnCompass.addEventListener('click', toggleArrows);
  if(btnRestart) btnRestart.addEventListener('click', ()=>startLevel(level, true));

  function setDogTier(tier){
    dog.tier = tier;
    dog.speed = DOG_SPEEDS[tier-1] ?? DOG_SPEEDS[1];
    dogSpdLabel.textContent = String(tier);
    [spd1,spd2,spd3].forEach((b,i)=> b && b.classList.toggle('active', i===tier-1));
  }
  if(spd1) spd1.addEventListener('click', ()=>setDogTier(1));
  if(spd2) spd2.addEventListener('click', ()=>setDogTier(2));
  if(spd3) spd3.addEventListener('click', ()=>setDogTier(3));
  setDogTier(2);

  // ---------- Утилиты ----------
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const dist = (x1,y1,x2,y2)=> Math.hypot(x1-x2, y1-y2);

  // ячейка = TILE (коридор 32px)
  const cellSize = ()=> TILE;

  const toWorld = (cx,cy)=> ({ x: cx*cellSize(), y: cy*cellSize() });
  const toCellIdx = (x,y)=> ({ x: clamp(Math.floor(x/cellSize()), 0, maze.w-1),
                               y: clamp(Math.floor(y/cellSize()), 0, maze.h-1) });
  function snapToRoom(idx){
    const x = (idx.x%2 ? idx.x : clamp(idx.x-1, 1, maze.w-2));
    const y = (idx.y%2 ? idx.y : clamp(idx.y-1, 1, maze.h-2));
    return {x,y};
  }
  function updateCamera(){ camX=0; camY=0; } // камера больше не нужна: показываем весь мир

  // ---------- Генерация ----------
  function genMaze(cols, rows){
    const w = cols*2+1, h = rows*2+1;
    const walls = Array.from({length:h}, (_,y)=>Array.from({length:w}, (_,x)=> (x%2===1 && y%2===1 ? 0 : 1)));
    const vis = Array.from({length:rows}, ()=>Array(cols).fill(false));
    function carve(cx, cy){
      vis[cy][cx] = true;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]].sort(()=>Math.random()-0.5);
      for(const [dx,dy] of dirs){
        const nx = cx+dx, ny = cy+dy;
        if(nx<0||ny<0||nx>=cols||ny>=rows||vis[ny][nx]) continue;
        walls[cy*2+1+dy][cx*2+1+dx] = 0;
        carve(nx,ny);
      }
    }
    carve(0,0);
    return {walls, w, h, cell: cellSize()};
  }

  function pathCells(from, to){
    const key = (x,y)=> `${x},${y}`;
    const prev = new Map();
    const Q = [from];
    prev.set(key(from.x,from.y), null);
    const dirs = [[2,0],[-2,0],[0,2],[0,-2]];
    while(Q.length){
      const cur = Q.shift();
      if(cur.x===to.x && cur.y===to.y) break;
      for(const [dx,dy] of dirs){
        const nx = cur.x+dx, ny = cur.y+dy;
        if(nx<=0||ny<=0||nx>=maze.w-1||ny>=maze.h-1) continue;
        const wx = cur.x + Math.sign(dx), wy = cur.y + Math.sign(dy);
        if(maze.walls[wy][wx]!==0) continue;
        if(maze.walls[ny][nx]!==0) continue;
        const k = key(nx,ny);
        if(!prev.has(k)){ prev.set(k, key(cur.x,cur.y)); Q.push({x:nx,y:ny}); }
      }
    }
    const out = [];
    let k = `${to.x},${to.y}`;
    if(!prev.has(k)) return out;
    while(k){
      const [x,y] = k.split(',').map(Number);
      out.push({x,y}); k = prev.get(k);
    }
    out.reverse(); return out;
  }

  // ---------- Навигация ----------
  function buildArrowsFromPlayer(){
    const pRoom = snapToRoom(toCellIdx(player.x, player.y));
    const route = pathCells(pRoom, exitCell);
    arrows.length = 0;
    for(let i=0; i<route.length-1; i+=ARROW_STEP){
      const a = route[i];
      const b = route[Math.min(i+ARROW_LOOK, route.length-1)];
      const wa = toWorld(a.x+0.5, a.y+0.5);
      const wb = toWorld(b.x+0.5, b.y+0.5);
      const ang = Math.atan2(wb.y - wa.y, wb.x - wa.x);
      arrows.push({ x:wa.x, y:wa.y, ang, alpha:0 });
    }
  }
  function updateArrows(dt){
    for(const ar of arrows){
      const d = dist(player.x, player.y, ar.x, ar.y);
      const target = d < ARROW_R ? ARROW_MAX_A : 0.15;
      ar.alpha += (target - ar.alpha) * Math.min(1, dt/120);
    }
  }
  function drawArrow(ar){
    if(!showArrows || ar.alpha <= 0.02) return;
    ctx.save(); ctx.globalAlpha = ar.alpha; ctx.translate(ar.x - camX, ar.y - camY); ctx.rotate(ar.ang);
    const w = 26, h = 16;
    ctx.fillStyle='rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(-2, h*0.6, w*0.6, 4, 0, 0, Math.PI*2); ctx.fill();
    const grad = ctx.createLinearGradient(0,-h,0,h);
    grad.addColorStop(0,'#60a5fa'); grad.addColorStop(1,'#2563eb'); ctx.fillStyle=grad;
    ctx.beginPath(); ctx.moveTo(-w*0.2, -h*0.6); ctx.lineTo(w*0.6, 0); ctx.lineTo(-w*0.2, h*0.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-w*0.15, -h*0.5); ctx.lineTo(w*0.5, 0); ctx.lineTo(-w*0.15, h*0.5); ctx.stroke();
    ctx.restore();
  }

  // ---------- Собака ----------
  function recalcDogPath(){
    const from = snapToRoom(toCellIdx(dog.x, dog.y));
    const to = snapToRoom(toCellIdx(player.x, player.y));
    dog.path = pathCells(from, to);
    dog.next = 1;
  }
  function updateDog(dt){
    if(performance.now() >= dog.recalcAt){
      recalcDogPath();
      dog.recalcAt = performance.now() + DOG_RECALC_MS;
    }
    const target = dog.path[dog.next];
    if(target){
      const w = toWorld(target.x+0.5, target.y+0.5);
      const ang = Math.atan2(w.y - dog.y, w.x - dog.x);
      dog.x += Math.cos(ang) * dog.speed;
      dog.y += Math.sin(ang) * dog.speed;
      if(dist(dog.x, dog.y, w.x, w.y) < 3) dog.next++;
    }
    if(dist(dog.x, dog.y, player.x, player.y) < (dog.r + player.r)){
      caught = true; finish();
    }
  }
  function drawDog(){
    const drawX = dog.x - camX, drawY = dog.y - camY;
    ctx.fillStyle='rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.ellipse(drawX, drawY+8, 12, 4, 0, 0, Math.PI*2); ctx.fill();
    const g = ctx.createRadialGradient(drawX-6, drawY-6, 4, drawX, drawY, 22);
    g.addColorStop(0,'#ffe1b7'); g.addColorStop(1,'#d6923a');
    ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(drawX, drawY, 14, 12, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#8b5e20';
    ctx.beginPath(); ctx.moveTo(drawX-10, drawY-6); ctx.lineTo(drawX-2, drawY-10); ctx.lineTo(drawX-4, drawY-2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(drawX+10, drawY-6); ctx.lineTo(drawX+2, drawY-10); ctx.lineTo(drawX+4, drawY-2); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(drawX+3, drawY-2, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(drawX+6, drawY+2, 2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='#8b5e20'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(drawX-12, drawY+2); ctx.quadraticCurveTo(drawX-20, drawY, drawX-16, drawY+10); ctx.stroke();
  }

  // ---------- Прыжок через стену ----------
  function tryJump(){
    if(!maze) return;
    const now = performance.now();
    if(now < jumpReadyAt) return;

    let dx = (keys.right?1:0) - (keys.left?1:0);
    let dy = (keys.down?1:0) - (keys.up?1:0);
    if(Math.abs(dx)+Math.abs(dy)===0){ dx = lastDir.x; dy = lastDir.y; }
    if(Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
    const dirs = [{x:dx,y:dy},{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];

    const p = toCellIdx(player.x, player.y);

    for(const d of dirs){
      if(d.x===0 && d.y===0) continue;
      const wx = p.x + d.x, wy = p.y + d.y;
      const tx = p.x + d.x*2, ty = p.y + d.y*2;
      if(tx<=0||ty<=0||tx>=maze.w-1||ty>=maze.h-1) continue;
      if(maze.walls[wy][wx]===1 && maze.walls[ty][tx]===0){
        const w = toWorld(tx+0.5, ty+0.5);
        player.x = w.x; player.y = w.y;
        jumpReadyAt = now + JUMP_CD;
        flashAt(player.x, player.y);
        return;
      }
    }
  }

  // ---------- Вспышки ----------
  const flashes = []; // {x,y,life}
  function flashAt(x,y){ flashes.push({x,y,life:320}); }
  function updateFlashes(dt){
    for(let i=flashes.length-1;i>=0;i--){
      flashes[i].life -= dt; if(flashes[i].life<=0) flashes.splice(i,1);
    }
  }
  function drawFlashes(){
    for(const f of flashes){
      const a = Math.max(0, Math.min(1, f.life/320));
      ctx.save(); ctx.globalAlpha = a;
      ctx.strokeStyle='#22d3ee'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(f.x - camX, f.y - camY, 18*(1-a)+6, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- Коллизии: ось-за-осью ----------
  function resolveX(px, py, vx, r){
    let x = px + vx;
    const cs = maze.cell;
    const minX = Math.floor((Math.min(px, x) - r)/cs)-1;
    const maxX = Math.floor((Math.max(px, x) + r)/cs)+1;
    const minY = Math.floor((py - r)/cs)-1;
    const maxY = Math.floor((py + r)/cs)+1;

    for(let cy=minY; cy<=maxY; cy++){
      for(let cx=minX; cx<=maxX; cx++){
        if(cy<0||cx<0||cy>=maze.h||cx>=maze.w) continue;
        if(maze.walls[cy][cx]!==1) continue;
        const rx=cx*cs, ry=cy*cs, rw=cs, rh=cs;
        const above = py + r <= ry;
        const below = py - r >= ry+rh;
        if(above || below) continue;
        if(vx>0 && (px + r <= rx) && (x + r > rx)) x = rx - r;
        else if(vx<0 && (px - r >= rx+rw) && (x - r < rx+rw)) x = rx + rw + r;
      }
    }
    return clamp(x, r, WORLD_W - r);
  }
  function resolveY(px, py, vy, r){
    let y = py + vy;
    const cs = maze.cell;
    const minX = Math.floor((px - r)/cs)-1;
    const maxX = Math.floor((px + r)/cs)+1;
    const minY = Math.floor((Math.min(py, y) - r)/cs)-1;
    const maxY = Math.floor((Math.max(py, y) + r)/cs)+1;

    for(let cy=minY; cy<=maxY; cy++){
      for(let cx=minX; cx<=maxX; cx++){
        if(cy<0||cx<0||cy>=maze.h||cx>=maze.w) continue;
        if(maze.walls[cy][cx]!==1) continue;
        const rx=cx*cs, ry=cy*cs, rw=cs, rh=cs;
        const left = px + r <= rx;
        const right = px - r >= rx+rw;
        if(left || right) continue;
        if(vy>0 && (py + r <= ry) && (y + r > ry)) y = ry - r;
        else if(vy<0 && (py - r >= ry+rh) && (y - r < ry+rh)) y = ry + rh + r;
      }
    }
    return clamp(y, r, WORLD_H - r);
  }

  // ---------- Масштабирование рендера (всё помещается) ----------
  function computeRenderScale(){
    // размер мира в пикселях canvas-координатах
    const w = WORLD_W, h = WORLD_H;
    RENDER_S = Math.min(c.width / w, c.height / h);
    RENDER_OX = (c.width  - w * RENDER_S) / 2;
    RENDER_OY = (c.height - h * RENDER_S) / 2;
  }
  window.addEventListener('resize', computeRenderScale);

  // ---------- Запуск уровня ----------
  function startLevel(lvl, hard=false){
    level = lvl;
    levelTitle.textContent = `Уровень ${level}`;
    if(hard) startTime = performance.now();
    caught = false;

    const cols = Math.max(5, Math.round(BASE_COLS * Math.pow(SCALE, level-1)));
    const rows = Math.max(5, Math.round(BASE_ROWS * Math.pow(SCALE, level-1)));
    maze = genMaze(cols, rows);

    WORLD_W = maze.w * maze.cell;
    WORLD_H = maze.h * maze.cell;
    computeRenderScale();

    player.x = maze.cell * 1.5; player.y = maze.cell * 1.5;

    exitCell = { x: maze.w-2, y: maze.h-2 };
    const ex = toWorld(exitCell.x+0.5, exitCell.y+0.5);
    dog.x = ex.x; dog.y = ex.y; dog.recalcAt = 0;

    arrows.length = 0; navRecalcAt = 0;

    sumEl.classList.add('hidden');
    running = true;
if (!loopTicking) { loopTicking = true; requestAnimationFrame(loop); }

    

    updateCamera();
  }

  // ---------- Обновление ----------
  let lastTime = performance.now();
  function update(t){
    const dt = Math.min(33, t-lastTime); lastTime=t;
    if(!running) return;

    let dx = (keys.right?1:0) - (keys.left?1:0);
    let dy = (keys.down?1:0) - (keys.up?1:0);
    if(Math.abs(dx)+Math.abs(dy) > 0){
      if(Math.abs(dx) > Math.abs(dy)) { lastDir.x = Math.sign(dx); lastDir.y = 0; }
      else { lastDir.x = 0; lastDir.y = Math.sign(dy); }
    }

    const len = Math.hypot(dx,dy) || 1;
    const vx = (dx/len) * SPEED;
    const vy = (dy/len) * SPEED;

    const nx = resolveX(player.x, player.y, vx, player.r);
    const ny = resolveY(nx, player.y, vy, player.r);
    player.x = nx; player.y = ny;

    updateDog(dt);

    if(performance.now() >= navRecalcAt){
      buildArrowsFromPlayer();
      navRecalcAt = performance.now() + NAV_RECALC_MS;
    }
    updateArrows(dt);
    updateFlashes(dt);

    const ex = toWorld(exitCell.x+0.5, exitCell.y+0.5);
    if(dist(player.x, player.y, ex.x, ex.y) < TILE*0.6){
      startLevel(level+1);
    }

    updateCamera();
    timerEl.textContent = ((t - startTime)/1000).toFixed(1);
  }

  // ---------- Рендер ----------
  function render(){
    ctx.clearRect(0,0,c.width,c.height);

    // фон
    const sky = ctx.createLinearGradient(0,0,0,c.height);
    sky.addColorStop(0,'#eaf3ff'); sky.addColorStop(1,'#eef6ff');
    ctx.fillStyle=sky; ctx.fillRect(0,0,c.width,c.height);

    // МАСШТАБИРУЕМ ВЕСЬ МИР, чтобы он целиком влезал в canvas
    ctx.save();
    ctx.translate(RENDER_OX, RENDER_OY);
    ctx.scale(RENDER_S, RENDER_S);

    drawMaze();

    // выход
    const ex = toWorld(exitCell.x, exitCell.y);
    ctx.fillStyle='#6ee7b7';
    ctx.fillRect(ex.x - camX + 4, ex.y - camY + 4, TILE-8, TILE-8);

    for(const a of arrows) drawArrow(a);

    drawDog();
    drawPlayer();
    drawFlashes();

    ctx.restore(); // UI/фон без масштабирования
  }

  function drawMaze(){
    const m = maze, cell = m.cell;
    // Рисуем весь мир (он небольшой, плюс масштаб всё равно вписывает)
    for(let y=0;y<m.h;y++){
      for(let x=0;x<m.w;x++){
        if(m.walls[y][x]===1){
          const px = x*cell - camX, py = y*cell - camY;
          ctx.fillStyle='#eae7ff'; ctx.fillRect(px,py,cell,cell);
          ctx.strokeStyle='#6b5bd6'; ctx.lineWidth=2; ctx.strokeRect(px+0.5,py+0.5,cell-1,cell-1);
        }
      }
    }
  }

  function drawPlayer(){
    const drawX = player.x - camX, drawY = player.y - camY;
    ctx.fillStyle='rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.ellipse(drawX, drawY+10, 12, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#4338ca'; ctx.fillStyle = '#a5b4fc';
    ctx.beginPath(); ctx.ellipse(drawX, drawY, 12, 14, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#0b1020'; ctx.beginPath(); ctx.arc(drawX+3, drawY-2, 2, 0, Math.PI*2); ctx.fill();
  }

  function finish(){
    running=false;
    const time = (performance.now()-startTime)/1000;
    sumText.textContent = (T.end_text ? T.end_text(level, time, caught) : `Время: ${time.toFixed(1)}s`);
    sumEl.classList.remove('hidden');
  }

  function loop(t){
    update(t);
    render();
    if (running) {
      requestAnimationFrame(loop);
    } else {
      loopTicking = false;
    }
  }
  

  startLevel(1, true);
  requestAnimationFrame(loop);
})();
