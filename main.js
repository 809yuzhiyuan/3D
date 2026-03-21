import * as THREE from 'three';

// ==========================================
// 1. 配置 (Configuration)
// ==========================================
const CONFIG = {
    fov: 75,
    near: 0.1,
    far: 10000,
    playerHeight: 1.7,
    playerCrouchHeight: 0.9,
    playerRadius: 0.3, // 稍微减小半径，更容易进门
    speed: 10,
    sprintSpeed: 35,
    crouchSpeed: 2,
    jumpForce: 10,
    gravity: 25,
    sensitivity: 0.002,
    
    // 房子精确尺寸
    house: {
        w: 100, h: 40, d: 80,
        center: new THREE.Vector3(0, 20, -50),
        door: { w: 20, h: 25 } // 门加大一点，确保能过
    },
    
    colors: {
        bg: 0x050505,
        fog: 0x050505,
        line: 0xffffff,
        lineGlow: 0x888888,
        door: 0xff3333,
        grid: 0x333333
    }
};

// ==========================================
// 2. 全局变量
// ==========================================
let camera, scene, renderer;
let move = { f: false, b: false, l: false, r: false };
let isSprint = false, isCrouch = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let isGrounded = true;

let yaw = Math.PI, pitch = 0;
let gameState = 'MENU'; // MENU, PLAYING, PAUSED, INV
let isLocked = false;

let linesGroup, gridHelper, crosshair, noiseMesh;
let uiContainer;
let inventory = [
    { name: "撬棍", color: 0xdddddd }, { name: "磁带", color: 0xff3333 },
    { name: "照片", color: 0xaaaaaa }, { name: "打火机", color: 0xffaa00 },
    { name: "笔记", color: 0xffffff }, { name: "钥匙", color: 0x888888 },
    { name: "收音机", color: 0x555555 }, { name: "空槽", color: 0x222222 },
    { name: "空槽", color: 0x222222 }
];
let selectedSlot = 0;
let prevTime = performance.now();

// ==========================================
// 3. 初始化
// ==========================================
init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.bg);
    scene.fog = new THREE.FogExp2(CONFIG.colors.fog, 0.002);

    camera = new THREE.PerspectiveCamera(CONFIG.fov, window.innerWidth / window.innerHeight, CONFIG.near, CONFIG.far);
    resetPlayer();

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.NoToneMapping;
    document.body.appendChild(renderer.domElement);

    createNoise();
    createWorld();
    createCrosshair();
    createUI();

    // 事件监听
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', () => {
        isLocked = document.pointerLockElement === renderer.domElement;
    });
    window.addEventListener('resize', onResize);
    
    renderer.domElement.addEventListener('click', () => {
        if (gameState === 'PLAYING' && !isLocked) renderer.domElement.requestPointerLock();
    });
}

function resetPlayer() {
    camera.position.set(0, 2, -90);
    yaw = Math.PI;
    pitch = 0;
    velocity.set(0, 0, 0);
    updateCamRot();
}

// ==========================================
// 4. 世界构建 (核心修复：渲染与几何)
// ==========================================
function createNoise() {
    const cvs = document.createElement('canvas');
    cvs.width = 128; cvs.height = 128;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,128,128);
    for(let i=0; i<5000; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.1})`;
        ctx.fillRect(Math.random()*128, Math.random()*128, 2, 2);
    }
    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.05, depthTest: false, depthWrite: false, renderOrder: 9999 });
    noiseMesh = new THREE.Mesh(geo, mat);
    noiseMesh.frustumCulled = false;
    scene.add(noiseMesh);
}

function createWorld() {
    linesGroup = new THREE.Group();
    scene.add(linesGroup);

    const hw = CONFIG.house.w / 2;
    const hh = CONFIG.house.h / 2;
    const hd = CONFIG.house.d / 2;
    const c = CONFIG.house.center;
    const dw = CONFIG.house.door.w / 2;
    const dh = CONFIG.house.door.h;
    
    // 定义8个顶点
    const v = [
        new THREE.Vector3(c.x - hw, c.y - hh, c.z - hd), // 0: BLF
        new THREE.Vector3(c.x + hw, c.y - hh, c.z - hd), // 1: BRF
        new THREE.Vector3(c.x + hw, c.y - hh, c.z + hd), // 2: BRB
        new THREE.Vector3(c.x - hw, c.y - hh, c.z + hd), // 3: BLB
        new THREE.Vector3(c.x - hw, c.y + hh, c.z - hd), // 4: TLF
        new THREE.Vector3(c.x + hw, c.y + hh, c.z - hd), // 5: TRF
        new THREE.Vector3(c.x + hw, c.y + hh, c.z + hd), // 6: TRB
        new THREE.Vector3(c.x - hw, c.y + hh, c.z + hd)  // 7: TLB
    ];

    // 辅助函数：创建绝对明亮的线
    function makeLine(pts, color, width = 1, isGlow = false) {
        const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
        const mat = new THREE.LineBasicMaterial({
            color: color,
            linewidth: width,
            transparent: true,
            opacity: isGlow ? 0.4 : 1.0,
            depthTest: false,      // ✅ 核心修复1：关闭深度测试，永不遮挡
            depthWrite: false,     // ✅ 核心修复2：不写入深度
            toneMapped: false,     // ✅ 核心修复3：不被压暗
            blending: THREE.NormalBlending, // ✅ 核心修复4：使用普通混合，避免Additive在黑色下的Bug
            renderOrder: 999       // ✅ 核心修复5：最后渲染
        });
        const line = new THREE.LineSegments(geo, mat);
        line.renderOrder = 999;
        return line;
    }

    // 1. 房子主体 (白色)
    // 边列表：[起点索引，终点索引]
    const edges = [
        [0,1], [1,2], [2,3], [3,0], // 底面
        [4,5], [5,6], [6,7], [7,4], // 顶面
        [0,4], [1,5], [2,6], [3,7]  // 柱子
    ];
    
    let housePts = [];
    edges.forEach(([a, b]) => {
        housePts.push(v[a].toArray(), v[b].toArray());
    });
    linesGroup.add(makeLine(housePts, CONFIG.colors.line, 1));
    // 光晕层
    linesGroup.add(makeLine(housePts, CONFIG.colors.lineGlow, 2, true));

    // 2. 门框 (红色) - 单独绘制，不包含在房子大框里
    // 门在前墙 (Z = c.z - hd)，即顶点 0,1,4,5 所在的面
    const frontZ = c.z - hd;
    const doorBottom = c.y - hh;
    const doorTop = doorBottom + dh;
    const doorLeftX = c.x - dw;
    const doorRightX = c.x + dw;

    const doorPts = [
        [[doorLeftX, doorBottom, frontZ], [doorLeftX, doorTop, frontZ]], // 左竖
        [[doorLeftX, doorTop, frontZ], [doorRightX, doorTop, frontZ]],   // 上横
        [[doorRightX, doorTop, frontZ], [doorRightX, doorBottom, frontZ]] // 右竖
    ].flat();

    linesGroup.add(makeLine(doorPts, CONFIG.colors.door, 2));
    linesGroup.add(makeLine(doorPts, 0x550000, 3, true));

    // 3. 网格
    const size = 10000;
    const divs = 100;
    gridHelper = new THREE.GridHelper(size, divs, CONFIG.colors.grid, CONFIG.colors.grid);
    gridHelper.material.depthTest = false;
    gridHelper.material.depthWrite = false;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;
    gridHelper.material.blending = THREE.NormalBlending;
    gridHelper.renderOrder = 100;
    scene.add(gridHelper);
}

function createCrosshair() {
    const cvs = document.createElement('canvas');
    cvs.width = 64; cvs.height = 64;
    const ctx = cvs.getContext('2d');
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 16); ctx.lineTo(32, 24);
    ctx.moveTo(32, 40); ctx.lineTo(32, 48);
    ctx.moveTo(16, 32); ctx.lineTo(24, 32);
    ctx.moveTo(40, 32); ctx.lineTo(48, 32);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(cvs);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, renderOrder: 9999, toneMapped: false });
    crosshair = new THREE.Sprite(mat);
    crosshair.scale.set(0.5, 0.5, 1);
    scene.add(crosshair);
}

// ==========================================
// 5. UI (简化版后朋克风)
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, { position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', fontFamily:'Courier New', color:'#fff' });
    document.body.appendChild(uiContainer);
    updateUI();
}

function updateUI() {
    uiContainer.innerHTML = '';
    if (gameState === 'MENU') {
        uiContainer.style.pointerEvents = 'auto';
        uiContainer.style.background = '#000';
        const t = document.createElement('h1');
        t.innerText = "POST_PUNK\nENGINE"; t.style.whiteSpace='pre-line';
        Object.assign(t.style, { textAlign:'center', marginTop:'15vh', fontSize:'60px', textShadow:'2px 2px #333' });
        uiContainer.appendChild(t);
        const btn = (txt, y, fn) => {
            const b = document.createElement('div');
            b.innerText = txt;
            Object.assign(b.style, { position:'absolute', left:'50%', top:y+'px', transform:'translateX(-50%)', border:'2px solid #fff', padding:'10px 40px', cursor:'pointer', background:'#000', fontSize:'20px' });
            b.onmouseenter = () => { b.style.background='#fff'; b.style.color='#000'; };
            b.onmouseleave = () => { b.style.background='#000'; b.style.color='#fff'; };
            b.onclick = fn;
            return b;
        };
        uiContainer.appendChild(btn("START", 400, () => { gameState='PLAYING'; resetPlayer(); updateUI(); renderer.domElement.requestPointerLock(); }));
        uiContainer.appendChild(btn("QUIT", 500, () => window.close()));
    } else if (gameState === 'PAUSED') {
        uiContainer.style.pointerEvents = 'auto';
        uiContainer.style.background = 'rgba(0,0,0,0.8)';
        const t = document.createElement('h1'); t.innerText="PAUSED"; t.style.textAlign='center'; t.style.marginTop='20vh'; t.style.color='#f33';
        uiContainer.appendChild(t);
        const btn = (txt, y, fn) => {
            const b = document.createElement('div'); b.innerText=txt;
            Object.assign(b.style, { position:'absolute', left:'50%', top:y+'px', transform:'translateX(-50%)', border:'1px solid #fff', padding:'10px 30px', cursor:'pointer' });
            b.onclick = fn; return b;
        };
        uiContainer.appendChild(btn("RESUME", 350, () => { gameState='PLAYING'; updateUI(); renderer.domElement.requestPointerLock(); }));
        uiContainer.appendChild(btn("MENU", 450, () => { gameState='MENU'; document.exitPointerLock(); updateUI(); }));
    } else if (gameState === 'INV') {
        uiContainer.style.pointerEvents = 'auto';
        uiContainer.style.background = 'rgba(0,0,0,0.9)';
        const box = document.createElement('div');
        Object.assign(box.style, { position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', border:'2px solid #fff', padding:'20px', display:'flex', gap:'10px' });
        inventory.forEach((item, i) => {
            const s = document.createElement('div');
            s.innerText = item.name;
            Object.assign(s.style, { width:'80px', height:'80px', border: i===selectedSlot ? '2px solid #f33' : '1px solid #555', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background: i===selectedSlot ? '#222' : '#111' });
            s.onclick = () => { selectedSlot=i; updateUI(); };
            box.appendChild(s);
        });
        uiContainer.appendChild(box);
        const hint = document.createElement('div'); hint.innerText = `> ${inventory[selectedSlot].name}`;
        Object.assign(hint.style, { position:'absolute', bottom:'50px', left:'50px', fontSize:'20px' });
        uiContainer.appendChild(hint);
        uiContainer.onclick = (e) => { if(e.target===uiContainer) { gameState='PLAYING'; updateUI(); renderer.domElement.requestPointerLock(); } };
    }

    if (gameState === 'PLAYING' || gameState === 'INV') {
        const info = document.createElement('div');
        Object.assign(info.style, { position:'absolute', top:'20px', left:'20px', fontSize:'14px', color:'#aaa' });
        info.innerHTML = `POS: ${camera.position.x.toFixed(0)} ${camera.position.y.toFixed(0)} ${camera.position.z.toFixed(0)}<br>WASD:Move SHIFT:Sprint SPACE:Jump E:Bag ESC:Menu`;
        uiContainer.appendChild(info);
    }
}

// ==========================================
// 6. 输入处理
// ==========================================
function onKeyDown(e) {
    switch(e.code) {
        case 'KeyW': case 'ArrowUp': move.f = true; break;
        case 'KeyS': case 'ArrowDown': move.b = true; break;
        case 'KeyA': case 'ArrowLeft': move.l = true; break;
        case 'KeyD': case 'ArrowRight': move.r = true; break;
        case 'ShiftLeft': isSprint = true; break;
        case 'ControlLeft': if(!isCrouch){ isCrouch=true; velocity.y=0; } break;
        case 'Space': if(isGrounded && !isCrouch){ velocity.y=CONFIG.jumpForce; isGrounded=false; } break;
        case 'KeyE': if(gameState==='PLAYING'||gameState==='INV'){ gameState = gameState==='PLAYING'?'INV':'PLAYING'; if(gameState==='PLAYING') renderer.domElement.requestPointerLock(); updateUI(); } break;
        case 'Escape': 
            if(gameState==='INV') { gameState='PLAYING'; renderer.domElement.requestPointerLock(); }
            else if(gameState==='PLAYING') { gameState='PAUSED'; document.exitPointerLock(); }
            else if(gameState==='PAUSED') { gameState='MENU'; document.exitPointerLock(); }
            updateUI();
            break;
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
            const idx = parseInt(e.code.replace('Digit',''))-1;
            if(idx>=0 && idx<inventory.length) { selectedSlot=idx; if(gameState==='INV') updateUI(); }
            break;
    }
}
function onKeyUp(e) {
    switch(e.code) {
        case 'KeyW': case 'ArrowUp': move.f = false; break;
        case 'KeyS': case 'ArrowDown': move.b = false; break;
        case 'KeyA': case 'ArrowLeft': move.l = false; break;
        case 'KeyD': case 'ArrowRight': move.r = false; break;
        case 'ShiftLeft': isSprint = false; break;
        case 'ControlLeft': isCrouch = false; break;
    }
}
function onMouseMove(e) {
    if(gameState!=='PLAYING' || !isLocked) return;
    yaw -= e.movementX * CONFIG.sensitivity;
    pitch -= e.movementY * CONFIG.sensitivity;
    pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, pitch));
    updateCamRot();
}
function updateCamRot() {
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
}
function onResize() {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// 7. 物理与碰撞 (核心修复：六面墙独立检测 + 门洞挖除)
// ==========================================
function checkCollision(pos) {
    const hw = CONFIG.house.w / 2;
    const hh = CONFIG.house.h / 2;
    const hd = CONFIG.house.d / 2;
    const c = CONFIG.house.center;
    const r = CONFIG.playerRadius;
    
    const dw = CONFIG.house.door.w / 2;
    const dh = CONFIG.house.door.h;
    const doorBottom = c.y - hh;
    
    // 定义六个面的碰撞检测函数
    // 返回值：true = 碰撞 (不能去), false = 安全
    
    // 1. 左墙 (X = c.x - hw)
    if (Math.abs(pos.x - (c.x - hw)) < r) {
        if (pos.z > c.z - hd - r && pos.z < c.z + hd + r && pos.y > c.y - hh && pos.y < c.y + hh) return true;
    }
    // 2. 右墙 (X = c.x + hw)
    if (Math.abs(pos.x - (c.x + hw)) < r) {
        if (pos.z > c.z - hd - r && pos.z < c.z + hd + r && pos.y > c.y - hh && pos.y < c.y + hh) return true;
    }
    // 3. 后墙 (Z = c.z + hd)
    if (Math.abs(pos.z - (c.z + hd)) < r) {
        if (pos.x > c.x - hw - r && pos.x < c.x + hw + r && pos.y > c.y - hh && pos.y < c.y + hh) return true;
    }
    // 4. 前墙 (Z = c.z - hd) -> ⚠️ 这里有门洞！
    if (Math.abs(pos.z - (c.z - hd)) < r) {
        // 检查 Y 高度，如果高于门顶，则是墙
        if (pos.y > doorBottom + dh) {
             if (pos.x > c.x - hw - r && pos.x < c.x + hw + r) return true;
        } else {
            // 在门的高度范围内，只有当 X 不在门宽范围内时，才是墙
            // 门范围：c.x - dw 到 c.x + dw
            if (pos.x < c.x - dw - r || pos.x > c.x + dw + r) {
                return true; // 撞到了门旁边的墙
            }
            // 否则：在门洞里，返回 false (安全)
        }
    }
    // 5. 地板 (Y = c.y - hh)
    if (Math.abs(pos.y - (c.y - hh)) < r) {
         if (pos.x > c.x - hw - r && pos.x < c.x + hw + r && pos.z > c.z - hd - r && pos.z < c.z + hd + r) return true;
    }
    // 6. 天花板 (Y = c.y + hh)
    if (Math.abs(pos.y - (c.y + hh)) < r) {
         if (pos.x > c.x - hw - r && pos.x < c.x + hw + r && pos.z > c.z - hd - r && pos.z < c.z + hd + r) return true;
    }

    return false;
}

function updatePhysics(dt) {
    if (gameState !== 'PLAYING') return;

    const spd = isCrouch ? CONFIG.crouchSpeed : (isSprint ? CONFIG.sprintSpeed : CONFIG.speed);
    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion); fwd.y=0; fwd.normalize();
    const rig = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion); rig.y=0; rig.normalize();
    
    direction.set(0,0,0);
    if(move.f) direction.add(fwd);
    if(move.b) direction.sub(fwd);
    if(move.r) direction.add(rig);
    if(move.l) direction.sub(rig);
    
    if(direction.lengthSq()>0) direction.normalize().multiplyScalar(spd);

    // 简单的平滑
    velocity.x += (direction.x - velocity.x) * 0.2;
    velocity.z += (direction.z - velocity.z) * 0.2;
    
    // X轴移动与碰撞
    let nextX = camera.position.x + velocity.x * dt;
    if (!checkCollision(new THREE.Vector3(nextX, camera.position.y, camera.position.z))) {
        camera.position.x = nextX;
    } else {
        velocity.x = 0;
    }

    // Z轴移动与碰撞
    let nextZ = camera.position.z + velocity.z * dt;
    if (!checkCollision(new THREE.Vector3(camera.position.x, camera.position.y, nextZ))) {
        camera.position.z = nextZ;
    } else {
        velocity.z = 0;
    }

    // Y轴 (重力)
    velocity.y -= CONFIG.gravity * dt;
    camera.position.y += velocity.y * dt;
    
    const groundH = (c.y - hh) + (isCrouch ? CONFIG.playerCrouchHeight : CONFIG.playerHeight);
    // 简单地面碰撞
    if (camera.position.y <= groundH) {
        camera.position.y = groundH;
        velocity.y = 0;
        isGrounded = true;
    } else {
        isGrounded = false;
    }
    
    // 强制蹲下高度
    if(isCrouch && isGrounded) camera.position.y = groundH;
}

function updateGrid() {
    if(gridHelper) {
        gridHelper.position.x = Math.floor(camera.position.x / 100) * 100;
        gridHelper.position.z = Math.floor(camera.position.z / 100) * 100;
    }
}

function updateCrosshair() {
    if(!crosshair) return;
    crosshair.position.copy(camera.position);
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    crosshair.position.add(dir.multiplyScalar(1.0));
}

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - prevTime) / 1000, 0.1);
    prevTime = now;

    if (gameState === 'PLAYING') {
        updatePhysics(dt);
        updateCamRot(); // 其实鼠标移动时已经更新了，这里为了保险
    }
    
    updateCrosshair();
    updateGrid();
    
    renderer.render(scene, camera);
}
