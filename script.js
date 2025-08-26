(() => {
  // DOM
  const c = document.getElementById('game');
  const ctx = c.getContext('2d');
  const scoreEl = document.getElementById('score');
  const cpEl = document.getElementById('cp');
  const sumEl = document.getElementById('summary');
  const sumText = document.getElementById('sumText');
  const restartBtn = document.getElementById('restart');
  const hintEl = document.getElementById('hint');
  const summaryTitle = document.getElementById('summaryTitle');

  // Тексты/настройки
  const T = window.TEXT || {};
  const CFG = window.CONFIG || {};

  // Применим тексты в UI
  hintEl.textContent = T.hint || "";
  summaryTitle.textContent = T.summaryTitle || "Конец раунда";
  restartBtn.textContent = T.again || "🔄 Играть снова";
  const killsLabelNode = document.querySelector('[data-i="kills-label"]');
  const checkpointLabelNode = document.querySelector('[data-i="checkpoint-label"]');
  if (killsLabelNode) killsLabelNode.textContent = T.killsLabel || "Побед";
  if (checkpointLabelNode) checkpointLabelNode.textContent = T.checkpointLabel || "Чекпоинт";

  // ---------- МИР / СЛОЖНОСТЬ ----------
  let WORLD_W = CFG.worldWidth ?? 10000;
  const WORLD_H = c.height;
  const G = CFG.gravity ?? 0.7;
  const AIR = CFG.airFriction ?? 0.98;
  const GROUND_FRIC = CFG.groundFriction ?? 0.84;
  const MAX_VX = CFG.maxVx ?? 6.2;
  const MAX_VY = CFG.maxVy ?? 16;

  // Коллекции
  let platforms = [];
  let spikes = [];      // {x,y,r,spin}
  let checkpoints = []; // {x,y,w,h,activated}
  const CP_INTERVAL = CFG.checkpointInterval ?? 2000;

  // Игрок
  const player = {
    x:60, y:420, w:40, h:56,
    vx:0, vy:0, dir:1,
    onGround:false,
    flying:false,
    doubleUsed:false,
    attackUntil:0
  };

  // Враги/счёт
  const enemies = []; // {type, x,y,w,h, animT, dead}
  const MAX_ENEMIES = CFG.maxEnemies ?? 10;
  let score = 0;

  // Частицы
  const parts = []; // {x,y,vx,vy,life}

  // Ввод
  const keys = {left:false,right:false,up:false,down:false,attack:false};
  addEventListener('keydown', e=>{
    if(e.code==='KeyA'||e.code==='ArrowLeft') keys.left=true;
    if(e.code==='KeyD'||e.code==='ArrowRight') keys.right=true;
    if(e.code==='Space'){ if(!keys.up) jump(); keys.up=true; }
    if(e.code==='KeyS'||e.code==='ArrowDown') keys.down=true;
    if(e.code==='KeyX'){ attack(); }
    if(e.code==='KeyR'){ restart(true); }
  });
  addEventListener('keyup', e=>{
    if(e.code==='KeyA'||e.code==='ArrowLeft') keys.left=false;
    if(e.code==='KeyD'||e.code==='ArrowRight') keys.right=false;
    if(e.code==='Space') keys.up=false;
    if(e.code==='KeyS'||e.code==='ArrowDown') keys.down=false;
  });

  // Утилиты
  const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));
  const rects = (a,b)=> !(a.x+a.w<b.x || a.x>b.x+b.w || a.y+a.h<b.y || a.y>b.y+b.h);
  const rand = (a,b)=> a + Math.random()*(b-a);
  const choice = arr => arr[(Math.random()*arr.length)|0];

  // Генерация уровня
  function generateLevel(){
    platforms = [];
    spikes = [];
    checkpoints = [];

    // Земля
    platforms.push({x:0, y:520, w:WORLD_W, h:200, color:'#c7baa1', ground:true});

    // «Натуральные» выступы
    let x = 260;
    while(x < WORLD_W - 600){
      const group = (Math.random()*4|0)+2; // 2–5
      for(let i=0;i<group;i++){
        const w = rand(110, 220);
        const h = 16;
        const y = rand(300, 480) - i*rand(10,50);
        platforms.push({x, y, w, h, color: choice(['#b9ad90','#a8b8c6','#b3a789']), ground:false});
        x += w + rand(80,180);
        if(x>WORLD_W-800) break;
      }
      x += rand(120, 260);
    }

    // Чекпоинты
    for(let cx = 800; cx < WORLD_W - 400; cx += CP_INTERVAL){
      const p = platforms.find(p=>!p.ground && p.x <= cx && p.x+p.w >= cx);
      const xcp = p ? clamp(cx, p.x+10, p.x+p.w-50) : cx;
      const ycp = p ? p.y-40 : 460;
      checkpoints.push({x:xcp, y:ycp, w:26, h:40, activated:false});
    }

    // Воздушные шипы
    const spikeCount = Math.floor(WORLD_W/(CFG.spikeDensityDiv ?? 220));
    for(let i=0;i<spikeCount;i++){
      const sx = rand(600, WORLD_W-600);
      const sy = rand(120, 380);
      const r = rand(18, 26);
      spikes.push({x:sx, y:sy, r, spin:rand(0,Math.PI*2)});
    }
  }

  // Физика
  function moveAndCollide(e, dt){
    const prevBottom = e.y + e.h;
    const prevTop = e.y;
    const prevX = e.x;

    // Вертикаль
    e.vy += e.flying ? (keys.up? -0.2 : 0.25) : G;
    if(e.flying && keys.up) e.vy -= 0.45;
    if(e.flying && keys.down) e.vy += 0.5;
    e.vy = clamp(e.vy, -MAX_VY, MAX_VY);
    e.onGround=false;
    e.y += e.vy;

    for(const p of platforms){
      if(!rects(e,p)) continue;
      if(prevBottom <= p.y && e.y + e.h >= p.y){
        e.y = p.y - e.h; e.vy = 0; e.onGround=true; e.flying=false; e.doubleUsed=false;
      } else if(prevTop >= p.y + p.h && e.y <= p.y + p.h){
        e.y = p.y + p.h; e.vy = 0.2;
      }
    }

    // Горизонталь
    const accel = e.onGround ? 0.9 : 0.5;
    if(keys.left) { e.vx -= accel; e.dir=-1; }
    if(keys.right){ e.vx += accel; e.dir= 1; }
    e.vx *= (e.onGround? GROUND_FRIC : AIR);
    e.vx = clamp(e.vx, -MAX_VX, MAX_VX);

    e.x += e.vx;
    for(const p of platforms){
      if(!rects(e,p)) continue;
      if(prevX + e.w <= p.x && e.x + e.w > p.x){ e.x = p.x - e.w; e.vx = 0; }
      else if(prevX >= p.x + p.w && e.x < p.x + p.w){ e.x = p.x + p.w; e.vx = 0; }
    }

    // Края мира / падение вниз
    e.x = clamp(e.x, 0, WORLD_W - e.w);
    if(e.y > WORLD_H-1){ onDeath(); }
  }

  function jump(){
    if(player.onGround){ player.vy = -13; player.onGround=false; return; }
    if(!player.flying && !player.doubleUsed){
      player.doubleUsed = true; player.flying = true; player.vy = Math.min(player.vy, -6);
    }
  }
  function attack(){ player.attackUntil = performance.now() + 180; }

  // Враги
  function spawnEnemy(){
    if(enemies.length >= MAX_ENEMIES) return;
    const type = Math.random()<0.45? 'kolobok' : 'chicken';
    let w,h;
    if(type==='kolobok'){ w=56; h=56; }
    else {
      // Курица ×2
      w=70* (CFG.chickenScale ?? 2);
      h=54* (CFG.chickenScale ?? 2);
    }
    const margin=200;
    let x = margin + Math.random()*(WORLD_W-2*margin);
    if(Math.abs(x - (player.x+player.w/2)) < 320) x += (x>player.x? 320:-320);
    const ground = platforms[0];
    const y = ground.y - h;
    enemies.push({type,x,y,w,h,animT:Math.random()*1000,dead:false});
  }
  setInterval(spawnEnemy, CFG.enemySpawnMs ?? 1100);

  // Частицы
  function splat(x,y){
    for(let i=0;i<32;i++){
      const a = Math.random()*Math.PI*2;
      const s = 2 + Math.random()*4;
      parts.push({x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s-2, life:600+Math.random()*500});
    }
  }

  // Камера
  let camX = 0;
  function updateCamera(){
    camX = clamp(player.x + player.w/2 - c.width/2, 0, WORLD_W - c.width);
  }

  // Чекпоинты
  let lastCheckpoint = null;
  function updateCheckpoints(){
    for(const cp of checkpoints){
      if(!cp.activated && rects(player, cp)){
        cp.activated = true;
        lastCheckpoint = cp;
        cpEl.textContent = Math.floor(cp.x) + 'px';
      }
    }
  }

  // Смерть/респавн
  function onDeath(){
    if(lastCheckpoint){
      player.x = lastCheckpoint.x; player.y = lastCheckpoint.y - player.h + 4;
      player.vx=0; player.vy=0;
      player.flying=false; player.doubleUsed=false; player.onGround=false;
    } else {
      restart(false);
    }
  }

  // Коллизия с шипами
  function hitSpikes(){
    const cx = player.x + player.w/2;
    const cy = player.y + player.h/2;
    for(const s of spikes){
      const dx = (s.x - cx), dy = (s.y - cy);
      const dist2 = dx*dx + dy*dy;
      const rad = s.r + 18;
      if(dist2 < rad*rad){
        onDeath();
        return;
      }
    }
  }

  // Цикл
  let last = performance.now();
  let running = true;
  let startTime = performance.now();

  function update(dt, now){
    moveAndCollide(player, dt);

    // атака
    if(player.attackUntil > now){
      const atk = { x: player.dir>0? player.x+player.w-2 : player.x-42, y: player.y+6, w:42, h:44 };
      for(const e of enemies){
        if(e.dead) continue;
        if(rects(atk, e)){
          e.dead = true; score++; scoreEl.textContent=score; splat(e.x+e.w/2, e.y+e.h/2);
        }
      }
    }

    // отскок от врага при касании без атаки
    for(const en of enemies){
      if(en.dead) continue;
      if(rects(player, en) && player.attackUntil <= now){
        const dir = (player.x+player.w/2 < en.x+en.w/2)? -1 : 1;
        player.vx = 6*dir; player.vy = -8;
      }
    }

    // чистка массивов
    for(let i=enemies.length-1;i>=0;i--) if(enemies[i].dead) enemies.splice(i,1);
    for(let i=parts.length-1;i>=0;i--){
      const p=parts[i]; p.life -= dt; p.x += p.vx; p.y += p.vy; p.vy += 0.35; if(p.life<=0) parts.splice(i,1);
    }

    // шипы и чекпоинты
    hitSpikes();
    updateCheckpoints();

    // победа
    if(player.x + player.w >= WORLD_W - 40){
      end(true);
    }

    updateCamera();
  }

  function render(now){
    ctx.clearRect(0,0,c.width,c.height);

    // Фон и параллакс
    drawSky();
    ctx.save(); ctx.translate(-camX*0.4, 0); drawMounts('#cfe0ee', 110); ctx.restore();
    ctx.save(); ctx.translate(-camX*0.7, 0); drawMounts('#bcd2e3', 160); ctx.restore();

    ctx.save();
    ctx.translate(-camX,0);

    // Платформы
    for(const p of platforms) drawPlatform(p);

    // Шипы
    for(const s of spikes) drawSpike(s, now);

    // Враги
    for(const e of enemies){
      if(!e.dead){
        e.animT += 16;
        if(e.type==='kolobok') drawKolobok(e);
        else drawChicken(e);
      }
    }

    // Игрок
    drawRaymon(player, now);

    // Чекпоинты
    for(const cp of checkpoints) drawCheckpoint(cp);

    // Частицы
    for(const p of parts){
      const a = Math.max(0, Math.min(1, p.life/900));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3+Math.random()*2, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Прогресс-бар
    const prog = (player.x)/(WORLD_W-player.w);
    ctx.fillStyle='rgba(0,0,0,.08)'; ctx.fillRect(120, c.height-18, c.width-240, 6);
    ctx.fillStyle='#5aa1ff'; ctx.fillRect(120, c.height-18, (c.width-240)*prog, 6);
  }

  // ----- Рисовалки -----
  function drawSky(){
    const sky = ctx.createLinearGradient(0,0,0,c.height);
    sky.addColorStop(0,'#eaf3ff'); sky.addColorStop(1,'#d8eaf6');
    ctx.fillStyle=sky; ctx.fillRect(0,0,c.width,c.height);
  }
  function drawMounts(color, h){
    ctx.strokeStyle=color; ctx.lineWidth=18; ctx.lineCap='round';
    ctx.beginPath();
    let x=50;
    while(x < WORLD_W){
      const y = 90 + Math.sin(x*0.001)*20;
      ctx.moveTo(x, y+h); ctx.lineTo(x+120, y);
      x += 220;
    }
    ctx.stroke();
  }
  function drawPlatform(p){
    ctx.fillStyle='rgba(0,0,0,.12)'; ctx.fillRect(p.x+4, p.y+6, p.w, p.h);
    const g = ctx.createLinearGradient(0,p.y,0,p.y+p.h);
    g.addColorStop(0, p.color||'#b9ad90');
    g.addColorStop(1, '#8c826a');
    ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle='rgba(255,255,255,.18)'; ctx.fillRect(p.x, p.y, p.w, 4);
  }
  function drawRaymon(p, now){
    ctx.fillStyle='rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(p.x+p.w/2, platforms[0].y+6, 22, 8, 0, 0, Math.PI*2); ctx.fill();

    const flapping = (!p.onGround) ? (Math.sin(now/120)*8) : 0;
    const wingY = p.y + 12;
    const wingX = p.x + (p.dir>0? -18 : p.w+18);
    ctx.save();
    ctx.translate(wingX, wingY);
    ctx.rotate((p.dir>0? -1:1)*(Math.PI/8) + flapping*0.01);
    const wg = ctx.createLinearGradient(0,-20,0,10);
    wg.addColorStop(0,'#8fb6ff'); wg.addColorStop(1,'#5a86ff');
    ctx.fillStyle=wg;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-38, -20); ctx.lineTo(-70, -6); ctx.lineTo(-38, 12); ctx.closePath(); ctx.fill();
    ctx.restore();

    const body = ctx.createLinearGradient(p.x, p.y, p.x, p.y+p.h);
    body.addColorStop(0,'#79e2d6'); body.addColorStop(1,'#4fb7aa');
    ctx.fillStyle=body; ctx.fillRect(p.x, p.y, p.w, p.h);

    ctx.strokeStyle='#155e4f'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(p.x+6,p.y+8); ctx.lineTo(p.x+p.w-6,p.y+p.h-12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x+6,p.y+p.h-10); ctx.lineTo(p.x+p.w-6,p.y+10); ctx.stroke();
    ctx.strokeStyle='#7d57ff'; ctx.beginPath(); ctx.moveTo(p.x+6,p.y+p.h*0.55); ctx.lineTo(p.x+p.w-6,p.y+p.h*0.55); ctx.stroke();

    const hx = p.x + (p.dir>0? p.w : -24), hy = p.y-12;
    const head = ctx.createLinearGradient(hx,hy, hx, hy+20);
    head.addColorStop(0,'#5b49c0'); head.addColorStop(1,'#3f2f92');
    ctx.fillStyle=head; ctx.fillRect(hx, hy, 24, 20);
    ctx.fillStyle='#142626'; ctx.fillRect(hx, hy+14, 24, 7);
    ctx.fillStyle='#0fd09a';
    if(p.dir>0) ctx.fillRect(hx+14, hy+4, 5, 5); else ctx.fillRect(hx+5, hy+4, 5, 5);

    const attacking = player.attackUntil > performance.now();
    const swLen = 34, swOff = attacking? 22: 9;
    const sx = p.dir>0? p.x+p.w-4 : p.x-4-swLen;
    const sy = p.y + 30 + (attacking? -6:0);
    ctx.fillStyle='#dfe5ef'; ctx.fillRect(sx + (p.dir>0? swOff: -swOff), sy, swLen, 6);
    ctx.fillStyle='#3b3b3b'; ctx.fillRect(sx-4 + (p.dir>0? swOff: -swOff), sy+2, 8, 10);

    if(p.flying && Math.floor(performance.now()/80)%2===0){
      ctx.fillStyle='rgba(255,140,50,.65)';
      ctx.beginPath(); ctx.ellipse(hx + (p.dir>0? 26:-8), hy+10, 12, 6, 0, 0, Math.PI*2); ctx.fill();
    }
  }
  function drawKolobok(e){
    ctx.fillStyle='rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.ellipse(e.x+e.w/2, e.y+e.h+4, e.w*0.35, 6, 0, 0, Math.PI*2); ctx.fill();
    const g = ctx.createRadialGradient(e.x+e.w*0.4,e.y+e.h*0.4,10, e.x+e.w/2,e.y+e.h/2,e.w/2);
    g.addColorStop(0,'#fbe59a'); g.addColorStop(1,'#eac76a');
    ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(e.x+e.w/2, e.y+e.h/2, e.w/2, e.h/2, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='#2f2f2f'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(e.x+10, e.y+10); ctx.lineTo(e.x+e.w-10, e.y+e.h-10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.x+e.w-10, e.y+10); ctx.lineTo(e.x+10, e.y+e.h-10); ctx.stroke();
    ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(e.x+20, e.y+20, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.x+e.w-20, e.y+20, 3, 0, Math.PI*2); ctx.fill();
    const a = Math.sin(e.animT/180)*10;
    ctx.fillStyle='#2a2a2a';
    ctx.fillRect(e.x-22, e.y+26+a, 22, 4);
    ctx.fillRect(e.x+e.w, e.y+26-a, 22, 4);
  }
  function drawChicken(e){
    ctx.fillStyle='rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.ellipse(e.x+e.w/2, e.y+e.h+6, e.w*0.28, 8, 0, 0, Math.PI*2); ctx.fill();
    const body = ctx.createRadialGradient(e.x+e.w*0.45, e.y+e.h*0.35, 20, e.x+e.w*0.5, e.y+e.h*0.5, e.w*0.55);
    body.addColorStop(0,'#ffffff'); body.addColorStop(1,'#e9edf2');
    ctx.fillStyle=body;
    ctx.beginPath(); ctx.ellipse(e.x+e.w/2, e.y+e.h*0.55, e.w*0.38, e.h*0.4, 0, 0, Math.PI*2); ctx.fill();

    ctx.strokeStyle='#444'; ctx.lineWidth=4;
    ctx.beginPath();
    ctx.moveTo(e.x+e.w*0.35, e.y+e.h-8); ctx.lineTo(e.x+e.w*0.32, e.y+e.h+6);
    ctx.moveTo(e.x+e.w*0.65, e.y+e.h-8); ctx.lineTo(e.x+e.w*0.68, e.y+e.h+6);
    ctx.stroke();

    const k = Math.sin(e.animT/140)*10;
    drawHead(e.x+e.w*0.22, e.y+e.h*0.3+k, -1);
    drawHead(e.x+e.w*0.70, e.y+e.h*0.32-k, 1);

    function drawHead(hx, hy, dir){
      ctx.strokeStyle='#444'; ctx.lineWidth=6;
      ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(hx+dir*34, hy-20); ctx.stroke();
      const head = ctx.createRadialGradient(hx+dir*36, hy-20, 2, hx+dir*36, hy-20, 16);
      head.addColorStop(0,'#fff'); head.addColorStop(1,'#e6ebf1');
      ctx.fillStyle=head; ctx.beginPath(); ctx.arc(hx+dir*38, hy-20, 14, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(hx+dir*42, hy-22, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#ffa200'; ctx.beginPath();
      ctx.moveTo(hx+dir*48, hy-20); ctx.lineTo(hx+dir*66, hy-14); ctx.lineTo(hx+dir*48, hy-8); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#ff4d4d'; ctx.beginPath();
      ctx.arc(hx+dir*36, hy-30, 4, 0, Math.PI*2);
      ctx.arc(hx+dir*42, hy-30, 4, 0, Math.PI*2);
      ctx.arc(hx+dir*48, hy-30, 4, 0, Math.PI*2);
      ctx.fill();
    }
  }
  function drawSpike(s, now){
    const t = now*0.002 + s.spin;
    ctx.strokeStyle='rgba(60,85,60,.6)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(s.x-24, s.y-20); ctx.lineTo(s.x, s.y); ctx.stroke();
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(t*0.2);
    for(let i=0;i<5;i++){
      ctx.rotate((Math.PI*2)/5);
      const grad = ctx.createLinearGradient(0,-s.r,0,s.r*0.3);
      grad.addColorStop(0,'#3acb5d');
      grad.addColorStop(1,'#1a8b3a');
      ctx.fillStyle=grad;
      ctx.beginPath();
      ctx.moveTo(0, -s.r);
      ctx.lineTo(8, -s.r*0.2);
      ctx.lineTo(-8, -s.r*0.2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.3)';
      ctx.beginPath();
      ctx.moveTo(0, -s.r+2);
      ctx.lineTo(4, -s.r*0.25);
      ctx.lineTo(-4, -s.r*0.25);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawCheckpoint(cp){
    ctx.fillStyle='rgba(0,0,0,.12)'; ctx.fillRect(cp.x+6, cp.y+cp.h-6, 8, 16);
    ctx.fillStyle='#8b6a3a'; ctx.fillRect(cp.x+4, cp.y+10, 8, cp.h);
    const grad = ctx.createLinearGradient(cp.x, cp.y, cp.x, cp.y+30);
    if(cp.activated){ grad.addColorStop(0,'#ffd86b'); grad.addColorStop(1,'#ff9f1a'); }
    else { grad.addColorStop(0,'#b7caff'); grad.addColorStop(1,'#6c90ff'); }
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.moveTo(cp.x+12, cp.y+12);
    ctx.lineTo(cp.x+12+28, cp.y+18);
    ctx.lineTo(cp.x+12, cp.y+28);
    ctx.closePath(); ctx.fill();
  }

  // Главный цикл
  function loop(t){
    const dt = Math.min(33, t-last); last=t;
    if(running){
      update(dt, t);
      render(t);
      requestAnimationFrame(loop);
    }
  }

  // Конец/рестарт
  function end(won=false){
    running=false;
    const time = ((performance.now()-startTime)/1000).toFixed(1);
    const header = won ? (T.summaryWon || "Ты дошёл до конца! 🎉") : (T.summaryEnded || "Раунд завершён.");
    sumText.innerHTML = `${header}<br>Побеждено врагов: <b>${score}</b><br>Время: <b>${time}s</b>`;
    sumEl.classList.remove('hidden');
  }

  // full=true — регенерация уровня; full=false — возврат к старту
  function restart(full=false){
    score=0; scoreEl.textContent=0;
    if(full){ generateLevel(); lastCheckpoint=null; cpEl.textContent='—'; }
    player.x=60; player.y=420; player.vx=0; player.vy=0;
    player.flying=false; player.doubleUsed=false; player.onGround=false;
    enemies.length=0; parts.length=0; camX=0; sumEl.classList.add('hidden');
    running=true; last=performance.now(); startTime=performance.now(); requestAnimationFrame(loop);
  }
  restartBtn.addEventListener('click', ()=>restart(true));

  // Старт игры
  generateLevel();
  setTimeout(()=>{ if(running) end(false); }, CFG.softFailTimeoutMs ?? 180000);
  requestAnimationFrame(loop);
})();
