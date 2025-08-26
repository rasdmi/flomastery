(() => {
  // DOM
  const c = document.getElementById('game');
  const ctx = c.getContext('2d');
  const levelTitle = document.getElementById('levelTitle');
  const timerEl = document.getElementById('timer');
  const hintEl = document.getElementById('hint');
  const sumEl = document.getElementById('summary');
  const sumTitle = document.getElementById('summaryTitle');
  const sumText = document.getElementById('sumText');
  const restartBtn = document.getElementById('restart');

  const T = window.TEXT || {};
  const CFG = window.CONFIG || {};

  hintEl.textContent = T.hint || "";
  sumTitle.textContent = T.end_title || "Конец";
  restartBtn.textContent = T.restart_btn || "🔄 Ещё раз";

  // -------- Параметры ----------
  const TILE = CFG.tile ?? 32;
  const SPEED = CFG.playerSpeed ?? 3.2;
  const WOBBLE = CFG.doodleWobble ?? 0.9;

  const ARROW_STEP = CFG.arrowStep ?? 3;
  const ARROW_LOOK = CFG.arrowLookAhead ?? 2;
  const ARROW_R = CFG.arrowActiveRadius ?? 140;
  const ARROW_MAX_A = CFG.arrowMaxAlpha ?? 0.95;

  const LEVELS = {
    house: { name: T.level_house || "Дом", size: CFG.houseSize ?? [15,11] },
    yard:  { name: T.level_yard  || "Двор", size: CFG.yardSize  ?? [31,17] },
    mouth: { name: T.level_mouth || "Во рту голубя", size: [25, 15] }
  };

  // -------- Состояния ----------
  let current = 'house';
  let maze = null;        // {walls, cols, rows, w, h}
  let exitCell = null;    // координата выхода в "стенной" сетке
  let pathCells = [];     // путь в координатах стен-сетки (только клетки)
  let arrows = [];        // {x,y,ang,alpha}
  let player = { x: TILE*1.5, y: TILE*1.5, r: 10, vx:0, vy:0 };
  let startTime = performance.now();
  let running = true;

  // Ввод
  const keys = {up:false,down:false,left:false,right:false};
  addEventListener('keydown', e=>{
    if(e.code==='ArrowUp'||e.code==='KeyW') keys.up=true;
    if(e.code==='ArrowDown'||e.code==='KeyS') keys.down=true;
    if(e.code==='ArrowLeft'||e.code==='KeyA') keys.left=true;
    if(e.code==='ArrowRight'||e.code==='KeyD') keys.right=true;
    if(e.code==='KeyR') loadLevel(current);            // рестарт уровня
    if(e.code==='KeyM') loadLevel('house', true);      // полный рестарт
  });
  addEventListener('keyup', e=>{
    if(e.code==='ArrowUp'||e.code==='KeyW') keys.up=false;
    if(e.code==='ArrowDown'||e.code==='KeyS') keys.down=false;
    if(e.code==='ArrowLeft'||e.code==='KeyA') keys.left=false;
    if(e.code==='ArrowRight'||e.code==='KeyD') keys.right=false;
  });
  restartBtn.addEventListener('click', ()=>loadLevel('house', true));

  // -------- Утилиты ----------
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const dist = (x1,y1,x2,y2)=> Math.hypot(x1-x2, y1-y2);
  const cellSize = ()=> TILE/2;
  const toWorld = (cx,cy)=> ({ x: cx*cellSize(), y: cy*cellSize() });

  // -------- Генерация лабиринта (DFS) ----------
  function genMaze(cols, rows) {
    // walls[y][x]: 1 — стена, 0 — проход; клетки на нечётных координатах
    const w = cols*2+1, h = rows*2+1;
    const walls = Array.from({length:h}, (_,y)=>Array.from({length:w}, (_,x)=> (x%2===1 && y%2===1 ? 0 : 1)));
    const vis = Array.from({length:rows}, ()=>Array(cols).fill(false));
    function carve(cx, cy){
      vis[cy][cx] = true;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]].sort(()=>Math.random()-0.5);
      for(const [dx,dy] of dirs){
        const nx = cx+dx, ny = cy+dy;
        if(nx<0||ny<0||nx>=cols||ny>=rows||vis[ny][nx]) continue;
        // проламываем стену между (cx,cy) и (nx,ny) — это координата (odd,odd) +- (1,0)/(0,1)
        walls[cy*2+1+dy][cx*2+1+dx] = 0;
        carve(nx,ny);
      }
    }
    carve(0,0);
    return walls;
  }

  // -------- Построение пути (BFS по клеткам) ----------
  function buildPath(){
    if(!maze) { pathCells = []; return; }
    const start = {x:1, y:1};                         // клетка (odd,odd)
    const goal  = {x:maze.w-2, y:maze.h-2};           // правый нижний угол
    const Q = [start];
    const prev = new Map();                            // key "x,y" -> "px,py"
    const key = (x,y)=> `${x},${y}`;
    prev.set(key(start.x,start.y), null);

    const dirs = [[2,0],[-2,0],[0,2],[0,-2]];
    while(Q.length){
      const cur = Q.shift();
      if(cur.x===goal.x && cur.y===goal.y) break;
      for(const [dx,dy] of dirs){
        const nx = cur.x+dx, ny = cur.y+dy;
        if(nx<=0||ny<=0||nx>=maze.w-1||ny>=maze.h-1) continue;
        // между клетками должна быть «дыра» (проход): стена на половинном шаге == 0
        const wx = cur.x + Math.sign(dx), wy = cur.y + Math.sign(dy);
        if(maze.walls[wy][wx]!==0) continue;
        if(maze.walls[ny][nx]!==0) continue; // сосед тоже должен быть клеткой (0)
        const k = key(nx,ny);
        if(!prev.has(k)){ prev.set(k, key(cur.x,cur.y)); Q.push({x:nx,y:ny}); }
      }
    }

    // восстановим маршрут
    const out = [];
    let k = key(goal.x, goal.y);
    if(!prev.has(k)){ pathCells = []; return; } // на всякий
    while(k){
      const [x,y] = k.split(',').map(Number);
      out.push({x,y});
      k = prev.get(k);
    }
    out.reverse();
    pathCells = out;
  }

  // -------- Стрелки по пути ----------
  function buildArrows(){
    arrows = [];
    if(!pathCells.length){
      // сцена «рот» — одна большая стрелка к пасти
      if(current==='mouth'){
        arrows.push({ x:c.width-200, y:c.height/2-20, ang:0, alpha:0 });
      }
      return;
    }
    for(let i=0; i<pathCells.length-1; i+=ARROW_STEP){
      const a = pathCells[i];
      const b = pathCells[Math.min(i+ARROW_LOOK, pathCells.length-1)];
      const wa = toWorld(a.x+0.5, a.y+0.5);
      const wb = toWorld(b.x+0.5, b.y+0.5);
      const ang = Math.atan2(wb.y - wa.y, wb.x - wa.x);
      arrows.push({ x:wa.x, y:wa.y, ang, alpha:0 });
    }
  }

  function updateArrows(dt){
    for(const ar of arrows){
      // В сцене «рот» просто тянемся к пасти справа
      if(!maze && current==='mouth'){
        ar.ang = 0; // вправо
      }
      const d = dist(player.x, player.y, ar.x, ar.y);
      const target = d < ARROW_R ? ARROW_MAX_A : 0.15; // далеко — слабая видимость
      ar.alpha += (target - ar.alpha) * Math.min(1, dt/120);
    }
  }

  function drawArrow(ar){
    if(ar.alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = ar.alpha;
    ctx.translate(ar.x, ar.y);
    ctx.rotate(ar.ang);

    // «пилотка»-стрелка
    const w = 26, h = 16;
    // тень
    ctx.fillStyle='rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(-2, h*0.6, w*0.6, 4, 0, 0, Math.PI*2); ctx.fill();

    // тело
    const grad = ctx.createLinearGradient(0,-h,0,h);
    grad.addColorStop(0,'#60a5fa');
    grad.addColorStop(1,'#2563eb');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-w*0.2, -h*0.6);
    ctx.lineTo(w*0.6, 0);
    ctx.lineTo(-w*0.2, h*0.6);
    ctx.closePath();
    ctx.fill();

    // белая кромка
    ctx.strokeStyle='rgba(255,255,255,.7)';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(-w*0.15, -h*0.5);
    ctx.lineTo(w*0.5, 0);
    ctx.lineTo(-w*0.15, h*0.5);
    ctx.stroke();

    ctx.restore();
  }

  // -------- Загрузка уровней ----------
  function loadLevel(name, hard=false){
    current = name;
    levelTitle.textContent = LEVELS[name].name;
    if(hard) startTime = performance.now();

    if(name==='mouth'){
      maze = null;
      player.x = TILE*1.5; player.y = c.height/2;
      pathCells = [];
      buildArrows();
      return;
    }

    // генерим лабиринт
    const [cols, rows] = LEVELS[name].size;
    const walls = genMaze(cols, rows);
    maze = { walls, cols, rows, w: cols*2+1, h: rows*2+1 };

    // вход/выход
    exitCell = { x: maze.w-2, y: maze.h-2 };
    player.x = TILE*1.5; player.y = TILE*1.5;

    // путь и стрелки
    buildPath();
    buildArrows();
  }

  // -------- Коллизии со стенами ----------
  function collideMaze(px, py, r){
    if(!maze) return {x:px, y:py};
    const cell = cellSize();
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
          if(x > wx && x < wx+ww){
            if(py < wy) y = Math.min(y, wy - r);
            else if(py > wy+wh) y = Math.max(y, wy+wh + r);
          }
          if(y > wy && y < wy+wh){
            if(px < wx) x = Math.min(x, wx - r);
            else if(px > wx+ww) x = Math.max(x, wx+ww + r);
          }
        }
      }
    }
    return {x,y};
  }

  // -------- Обновление ----------
  let last = performance.now();
  function update(t){
    const dt = Math.min(33, t-last); last=t;
    if(!running) return;

    // движение
    const ax = (keys.right?1:0) - (keys.left?1:0);
    const ay = (keys.down?1:0) - (keys.up?1:0);
    const len = Math.hypot(ax, ay) || 1;
    player.vx = (ax/len) * SPEED;
    player.vy = (ay/len) * SPEED;

    let nx = player.x + player.vx;
    let ny = player.y + player.vy;

    const after = collideMaze(nx, ny, player.r);
    player.x = clamp(after.x, player.r, c.width - player.r);
    player.y = clamp(after.y, player.r, c.height - player.r);

    // переходы
    if(maze){
      const ex = toWorld(exitCell.x+0.5, exitCell.y+0.5);
      if(dist(player.x, player.y, ex.x, ex.y) < TILE*0.6){
        if(current==='house') loadLevel('yard');
        else if(current==='yard') loadLevel('mouth');
      }
    } else if(current==='mouth'){
      if(player.x > c.width - TILE*1.8) end();
    }

    // стрелки
    updateArrows(dt);

    // таймер
    timerEl.textContent = ((t - startTime)/1000).toFixed(1);
  }

  // -------- Рендер ----------
  function render(t){
    ctx.clearRect(0,0,c.width,c.height);

    // фон
    if(current==='house') drawHouseBG();
    else if(current==='yard') drawYardBG();
    else drawMouthBG();

    // лабиринт
    if(maze) drawMaze(maze);

    // выход (для ориентира)
    if(maze){
      const ex = toWorld(exitCell.x, exitCell.y);
      ctx.fillStyle = current==='house' ? '#6ee7b7' : '#60a5fa';
      doodleRect(ex.x+4, ex.y+4, TILE-8, TILE-8, 6, true);
    }

    // стрелки поверх лабиринта
    for(const a of arrows) drawArrow(a);

    // игрок
    drawPlayer(player);

    // рамка
    ctx.strokeStyle='rgba(0,0,0,.08)';
    ctx.lineWidth=2; ctx.strokeRect(8,8,c.width-16,c.height-16);
  }

  // -------- Художественные функции ----------
  function doodleRect(x,y,w,h, jitter=6, fill=false){
    const j = jitter*WOBBLE;
    const k = () => (Math.random()*j - j/2);
    ctx.beginPath();
    ctx.moveTo(x+k(), y+k());
    ctx.lineTo(x+w+k(), y+k());
    ctx.lineTo(x+w+k(), y+h+k());
    ctx.lineTo(x+k(), y+h+k());
    ctx.closePath();
    if(fill) ctx.fill();
    ctx.stroke();
  }

  function drawMaze(m){
    const cell = cellSize();
    ctx.save();
    ctx.lineWidth = 3;
    for(let y=0;y<m.h;y++){
      for(let x=0;x<m.w;x++){
        if(m.walls[y][x]===1){
          const px = x*cell, py = y*cell;
          ctx.fillStyle = (current==='house') ? '#eae7ff' : '#e8f7ea';
          ctx.fillRect(px,py,cell,cell);
          ctx.strokeStyle = (current==='house') ? '#6b5bd6' : '#28a34e';
          doodleRect(px,py,cell,cell,4,false);
        }
      }
    }
    ctx.restore();
  }

  function drawHouseBG(){
    const g = ctx.createLinearGradient(0,0,0,c.height);
    g.addColorStop(0,'#fff'); g.addColorStop(1,'#f7f9fc');
    ctx.fillStyle=g; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='rgba(100,150,255,.12)';
    ctx.fillRect(40,40,180,110);
    ctx.fillRect(c.width-240,60,180,110);
  }
  function drawYardBG(){
    const g = ctx.createLinearGradient(0,0,0,c.height);
    g.addColorStop(0,'#e6f3ff'); g.addColorStop(1,'#d1f5e1');
    ctx.fillStyle=g; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#baf7c8'; ctx.fillRect(0,c.height-120,c.width,120);
    ctx.strokeStyle='#2a7d3b'; ctx.lineWidth=8;
    for(let i=0;i<6;i++){
      const x = 60+i*160 + Math.sin(i)*8;
      ctx.beginPath(); ctx.moveTo(x,c.height-120); ctx.lineTo(x,c.height-220); ctx.stroke();
      ctx.fillStyle='rgba(46,150,70,.6)';
      ctx.beginPath(); ctx.arc(x, c.height-240, 40+Math.random()*8, 0, Math.PI*2); ctx.fill();
    }
  }
  function drawMouthBG(){
    const sky = ctx.createLinearGradient(0,0,0,c.height);
    sky.addColorStop(0,'#e9f5ff'); sky.addColorStop(1,'#f0f7ff');
    ctx.fillStyle=sky; ctx.fillRect(0,0,c.width,c.height);
    const headX = c.width-260, headY = c.height/2 - 80;
    ctx.fillStyle='#dfe7f5';
    ctx.beginPath(); ctx.ellipse(headX, headY+120, 120, 90, 0, 0, Math.PI*2); ctx.fill();
    const hg = ctx.createRadialGradient(headX+40, headY+50, 20, headX+50, headY+70, 160);
    hg.addColorStop(0,'#f5f8ff'); hg.addColorStop(1,'#ccd9ef');
    ctx.fillStyle=hg;
    ctx.beginPath(); ctx.ellipse(headX+80, headY+70, 160, 130, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#f2b04c';
    ctx.beginPath();
    ctx.moveTo(headX+40, headY+70);
    ctx.quadraticCurveTo(c.width-40, headY-40, c.width-20, headY+20);
    ctx.quadraticCurveTo(c.width-70, headY+25, headX+40, headY+70);
    ctx.fill();
    ctx.fillStyle='#f59e0b';
    ctx.beginPath();
    ctx.moveTo(headX+46, headY+92);
    ctx.quadraticCurveTo(c.width-36, headY+150, c.width-18, headY+96);
    ctx.quadraticCurveTo(c.width-80, headY+86, headX+46, headY+92);
    ctx.fill();
    ctx.fillStyle='#0f172a';
    ctx.fillRect(c.width-110, headY+60, 80, 40); // пасть
  }
  function drawPlayer(p){
    // тень
    ctx.fillStyle='rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y+10, 12, 4, 0, 0, Math.PI*2); ctx.fill();
    // тело
    ctx.lineWidth = 3; ctx.strokeStyle = '#4338ca'; ctx.fillStyle = '#a5b4fc';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 12, 14, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // глаз
    ctx.fillStyle='#0b1020'; ctx.beginPath(); ctx.arc(p.x+3, p.y-2, 2, 0, Math.PI*2); ctx.fill();
  }

  // -------- Конец/цикл ----------
  function end(){
    running=false;
    const time = (performance.now()-startTime)/1000;
    sumText.textContent = (T.end_text ? T.end_text(time) : `Время: ${time.toFixed(1)}s`);
    sumEl.classList.remove('hidden');
  }

  function loop(t){
    update(t);
    render(t);
    if(running) requestAnimationFrame(loop);
  }

  // старт
  loadLevel('house', true);
  requestAnimationFrame(loop);
})();
