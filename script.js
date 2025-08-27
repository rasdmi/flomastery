(() => {
  // ---------- DOM ----------
  const c = document.getElementById('game');
  const ctx = c.getContext('2d');
  const levelTitle = document.getElementById('levelTitle');
  const timerEl = document.getElementById('timer');
  const hintEl = document.getElementById('hint');
  const sumEl = document.getElementById('summary');
  const sumTitle = document.getElementById('summaryTitle');
  const sumText = document.getElementById('sumText');
  const restartBtn = document.getElementById('restart');
  const navEl = document.getElementById('nav');
  const openNavBtn = document.getElementById('openNav');
  const closeNavBtn = document.getElementById('closeNav');

  const T = window.TEXT || {};
  const CFG = window.CONFIG || {};

  hintEl.textContent = T.hint || "";
  sumTitle.textContent = T.end_title || "Финиш!";
  restartBtn.textContent = T.restart_btn || "🔄 Ещё раз";

  // ---------- Константы ----------
  const TILE = CFG.tile ?? 32;
  const SPEED = CFG.playerSpeed ?? 3.2;
  const R_PLAYER = CFG.playerRadius ?? 10;

  const BASE_COLS = CFG.baseCols ?? 15;
  const BASE_ROWS = CFG.baseRows ?? 11;
  const SCALE = CFG.levelScale ?? 1.4;

  const ARROW_STEP = CFG.arrowStep ?? 3;
  const ARROW_LOOK = CFG.arrowLookAhead ?? 2;
  const ARROW_R = CFG.arrowActiveRadius ?? 140;
  const ARROW_MAX_A = CFG.arrowMaxAlpha ?? 0.95;
  const NAV_RECALC_MS = CFG.navRecalcMs ?? 400;

  const JUMP_CD = CFG.jumpCooldownMs ?? 900;

  const DOG_SPEED = CFG.dogSpeed ?? 2.8;
  const DOG_RECALC_MS = CFG.dogRecalcMs ?? 260;

  // ---------- Состояние ----------
  let level = 1;
  let running = true;
  let startTime = performance.now();
  let caught = false;

  // сетка-лабиринт
  let maze = null;   // {walls,w,h,cell}
  let exitCell = null;

  // игрок
  const player = { x: TILE*1.5, y: TILE*1.5, r: R_PLAYER, vx:0, vy:0 };
  let lastDir = {x:1, y:0};
  let jumpReadyAt = 0;

  // собака
  const dog = { x: 0, y: 0, r: 10, path: [], next: 1, recalcAt: 0 };

  // стрелки-навигация
  let arrows = [];
  let navRecalcAt = 0;

  // ---------- Ввод ----------
  const keys = {up:false,down:false,left:false,right:false};
  addEventListener('keydown', e=>{
    if(e.code==='ArrowUp'||e.code==='KeyW') keys.up=true;
    if(e.code==='ArrowDown'||e.code==='KeyS') keys.down=true;
    if(e.code==='ArrowLeft'||e.code==='KeyA') keys.left=true;
    if(e.code==='ArrowRight'||e.code==='KeyD') keys.right=true;
    if(e.code==='Space') tryJump();
    if(e.code==='KeyR') startLevel(level, true);
    if(e.code==='KeyM') startLevel(1, true);
    if(e.key==='?' || e.code==='Slash') openNav();
  });
  addEventListener('keyup', e=>{
    if(e.code==='ArrowUp'||e.code==='KeyW') keys.up=false;
    if(e.code==='ArrowDown'||e.code==='KeyS') keys.down=false;
    if(e.code==='ArrowLeft'||e.code==='KeyA') keys.left=false;
    if(e.code==='ArrowRight'||e.code==='KeyD') keys.right=false;
  });

  openNavBtn.addEventListener('click', openNav);
  function openNav(){ navEl.classList.remove('hidden'); }
  if (closeNavBtn) closeNavBtn.addEventListener('click', ()=>navEl.classList.add('hidden'));

  restartBtn.addEventListener('click', ()=>startLevel(1, true));

  // ---------- Утилиты ----------
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const dist = (x1,y1,x2,y2)=> Math.hypot(x1-x2, y1-y2);
  const cellSize = ()=> TILE/2;
  const toWorld = (cx,cy)=> ({ x: cx*cellSize(), y: cy*cellSize() });
  const toCellIdx = (x,y)=> ({ x: clamp(Math.floor(x/cellSize()), 0, maze.w-1),
                               y: clamp(Math.floor(y/cellSize()), 0, maze.h-1) });

  // клетки-«комнаты» на нечётных координатах
  function snapToRoom(idx){
    const x = (idx.x%2 ? idx.x : clamp(idx.x-1, 1, maze.w-2));
    const y = (idx.y%2 ? idx.y : clamp(idx.y-1, 1, maze.h-2));
    return {x,y};
  }

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

  // кратчайший путь между двумя «клетками» (odd, odd)
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

  // ---------- Навигация (стрелки) ----------
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
    if(ar.alpha <= 0.02) return;
    ctx.save(); ctx.globalAlpha = ar.alpha; ctx.translate(ar.x, ar.y); ctx.rotate(ar.ang);
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
      dog.x += Math.cos(ang) * DOG_SPEED;
      dog.y += Math.sin(ang) * DOG_SPEED;
      if(dist(dog.x, dog.y, w.x, w.y) < 3) dog.next++;
    }
    // поймал?
    if(dist(dog.x, dog.y, player.x, player.y) < (dog.r + player.r)){
      caught = true; finish();
    }
  }
  function drawDog(){
    ctx.fillStyle='rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.ellipse(dog.x, dog.y+8, 12, 4, 0, 0, Math.PI*2); ctx.fill();
    const g = ctx.createRadialGradient(dog.x-6, dog.y-6, 4, dog.x, dog.y, 22);
    g.addColorStop(0,'#ffe1b7'); g.addColorStop(1,'#d6923a');
    ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(dog.x, dog.y, 14, 12, 0, 0, Math.PI*2); ctx.fill();
    // ушки
    ctx.fillStyle='#8b5e20';
    ctx.beginPath(); ctx.moveTo(dog.x-10, dog.y-6); ctx.lineTo(dog.x-2, dog.y-10); ctx.lineTo(dog.x-4, dog.y-2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(dog.x+10, dog.y-6); ctx.lineTo(dog.x+2, dog.y-10); ctx.lineTo(dog.x+4, dog.y-2); ctx.closePath(); ctx.fill();
    // глаз/нос
    ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(dog.x+3, dog.y-2, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(dog.x+6, dog.y+2, 2, 0, Math.PI*2); ctx.fill();
    // хвост
    ctx.strokeStyle='#8b5e20'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(dog.x-12, dog.y+2); ctx.quadraticCurveTo(dog.x-20, dog.y, dog.x-16, dog.y+10); ctx.stroke();
  }

  // ---------- Прыжок через стену ----------
  function tryJump(){
    if(!maze) return;
    const now = performance.now();
    if(now < jumpReadyAt) return;

    // направление по нажатым клавишам либо последний
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
        // прыжок: переносим в центр целевой «комнаты»
        const w = toWorld(tx+0.5, ty+0.5);
        player.x = w.x; player.y = w.y;
        jumpReadyAt = now + JUMP_CD;
        // небольшой всплеск
        flashAt(player.x, player.y);
        return;
      }
    }
  }

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
      ctx.beginPath(); ctx.arc(f.x, f.y, 18*(1-a)+6, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- Коллизии ----------
  function collideMaze(px, py, r){
    const cell = maze.cell;
    const minX = Math.floor((px - r)/cell);
    const maxX = Math.floor((px + r)/cell);
    const minY = Math.floor((py - r)/cell);
    const maxY = Math.floor((py + r)/cell);
    let x = px, y = py;

    for(let cy=minY; cy<=maxY; cy++){
      for(let cx=minX; cx<=maxX; cx++){
        if(cy<0||cx<0||cy>=maze.h||cx>=maze.w) continue;
        if(maze.walls[cy][cx]===1){
          const wx = cx*cell, wy = cy*cell, ww = cell, wh = cell;
          const nx = clamp(x, wx, wx+ww), ny = clamp(y, wy, wy+wh);
          const dd = Math.hypot(x-nx, y-ny);
          if(dd < r){
            const ang = Math.atan2(y-ny, x-nx) || 0;
            x = nx + Math.cos(ang) * (r + 0.1);
            y = ny + Math.sin(ang) * (r + 0.1);
          }
        }
      }
    }
    return {x,y};
  }

  // ---------- Запуск уровня ----------
  function startLevel(lvl, hard=false){
    level = lvl;
    levelTitle.textContent = `Уровень ${level}`;
    if(hard) startTime = performance.now();
    caught = false;

    // размеры увеличиваются ×1.4^(level-1) и приводятся к нечётным
    const cols = Math.max(5, Math.round(BASE_COLS * Math.pow(SCALE, level-1)));
    const rows = Math.max(5, Math.round(BASE_ROWS * Math.pow(SCALE, level-1)));
    maze = genMaze(cols, rows);

    // старт/финиш
    player.x = TILE*1.5; player.y = TILE*1.5;

    exitCell = { x: maze.w-2, y: maze.h-2 };

    // собака встаёт на «другой конец»
    const ex = toWorld(exitCell.x+0.5, exitCell.y+0.5);
    dog.x = ex.x; dog.y = ex.y; dog.recalcAt = 0;

    // навигация
    arrows.length = 0; navRecalcAt = 0;

    // спрячем сводку
    sumEl.classList.add('hidden');
    running = true;
  }

  // ---------- Обновление ----------
  let last = performance.now();
  function update(t){
    const dt = Math.min(33, t-last); last=t;
    if(!running) return;

    // направление для прыжка
    let dx = (keys.right?1:0) - (keys.left?1:0);
    let dy = (keys.down?1:0) - (keys.up?1:0);
    if(Math.abs(dx)+Math.abs(dy) > 0){
      if(Math.abs(dx) > Math.abs(dy)) { lastDir.x = Math.sign(dx); lastDir.y = 0; }
      else { lastDir.x = 0; lastDir.y = Math.sign(dy); }
    }

    // движение игрока
    const len = Math.hypot(dx,dy) || 1;
    player.vx = (dx/len) * SPEED;
    player.vy = (dy/len) * SPEED;

    let nx = player.x + player.vx;
    let ny = player.y + player.vy;
    const after = collideMaze(nx, ny, player.r);
    player.x = clamp(after.x, player.r, c.width - player.r);
    player.y = clamp(after.y, player.r, c.height - player.r);

    // собака
    updateDog(dt);

    // пересчёт навигации
    if(performance.now() >= navRecalcAt){
      buildArrowsFromPlayer();
      navRecalcAt = performance.now() + NAV_RECALC_MS;
    }
    updateArrows(dt);

    updateFlashes(dt);

    // финиш
    const ex = toWorld(exitCell.x+0.5, exitCell.y+0.5);
    if(dist(player.x, player.y, ex.x, ex.y) < TILE*0.6){
      startLevel(level+1); // следующий — станет больше ×1.4
    }

    // таймер
    timerEl.textContent = ((t - startTime)/1000).toFixed(1);
  }

  // ---------- Рендер ----------
  function render(){
    ctx.clearRect(0,0,c.width,c.height);

    // мягкий фон
    const sky = ctx.createLinearGradient(0,0,0,c.height);
    sky.addColorStop(0,'#eaf3ff'); sky.addColorStop(1,'#eef6ff');
    ctx.fillStyle=sky; ctx.fillRect(0,0,c.width,c.height);

    drawMaze();

    // выходной маркер
    const ex = toWorld(exitCell.x, exitCell.y);
    ctx.fillStyle='#6ee7b7';
    ctx.fillRect(ex.x+4, ex.y+4, TILE-8, TILE-8);

    for(const a of arrows) drawArrow(a);

    // собака и игрок
    drawDog();
    drawPlayer();

    drawFlashes();

    // рамка
    ctx.strokeStyle='rgba(0,0,0,.08)'; ctx.lineWidth=2;
    ctx.strokeRect(8,8,c.width-16,c.height-16);
  }

  function drawMaze(){
    const m = maze, cell = m.cell;
    ctx.save();
    for(let y=0;y<m.h;y++){
      for(let x=0;x<m.w;x++){
        if(m.walls[y][x]===1){
          const px = x*cell, py = y*cell;
          ctx.fillStyle='#eae7ff'; ctx.fillRect(px,py,cell,cell);
          ctx.strokeStyle='#6b5bd6'; ctx.lineWidth=2; ctx.strokeRect(px+0.5,py+0.5,cell-1,cell-1);
        }
      }
    }
    ctx.restore();
  }

  function drawPlayer(){
    ctx.fillStyle='rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.ellipse(player.x, player.y+10, 12, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#4338ca'; ctx.fillStyle = '#a5b4fc';
    ctx.beginPath(); ctx.ellipse(player.x, player.y, 12, 14, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#0b1020'; ctx.beginPath(); ctx.arc(player.x+3, player.y-2, 2, 0, Math.PI*2); ctx.fill();
  }

  // ---------- Финиш ----------
  function finish(){
    running=false;
    const time = (performance.now()-startTime)/1000;
    sumText.textContent = (T.end_text ? T.end_text(level, time, caught) : `Время: ${time.toFixed(1)}s`);
    sumEl.classList.remove('hidden');
  }

  // ---------- Цикл ----------
  function loop(t){
    update(t);
    render();
    if(running) requestAnimationFrame(loop);
  }

  // старт
  startLevel(1, true);
  requestAnimationFrame(loop);
})();
