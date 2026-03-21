import * as THREE from 'three';

// ==========================================
// 1. 配置 (Configuration) - 标准化坐标
// ==========================================
const CONFIG = {
    fov: 75,
    near: 0.1,
    far: 2000, // 减小远裁剪面，提高深度缓冲精度
    playerHeight: 1.7,
    playerCrouchHeight: 0.9,
    playerRadius: 0.3, 
    speed: 10,
    sprintSpeed: 35,
    crouchSpeed: 2,
    jumpForce: 10,
    gravity: 25,
    sensitivity: 0.002,
    
    // 🏠 房子标准定义
    house: {
        w: 100, h: 40, d: 80,
        center: new THREE.Vector3(0, 20, -50), // 中心点固定
        door: { w: 20, h: 25 } 
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
let gameState = 'MENU'; 
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
    // ✅ 关键：雾效必须足够浓，这样即使线条渲染有问题，也能看到房子的轮廓
    scene.fog = new THREE.FogExp2(CONFIG.colors.fog, 0.003);

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
    // ✅ 关键：出生点必须在房子正前方，且高于地面
    // 房子中心 Z=-50, 深度 80 -> 前墙 Z = -50 - 40 = -90
    // 所以出生在 Z = -100 是安全的
    camera.position.set(0, 2, -100); 
    yaw = Math.PI;
    pitch = 0;
    velocity.set(0, 0, 0);
    updateCamRot();
}

// ==========================================
// 4. 世界构建 (核心修复：坐标对齐)
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
    
    // ✅ 关键：精确计算墙壁坐标
    const minX = c.x - hw;
    const maxX = c.x + hw;
    const minY = c.y - hh;
    const maxY = c.y + hh;
    const minZ = c.z - hd; // 前墙 Z
    const maxZ = c.z + hd; // 后墙 Z

    const dw = CONFIG.house.door.w / 2;
    const dh = CONFIG.house.door.h;
    const doorBottom = minY;
    const doorTop = doorBottom + dh;
    const doorLeftX = c.x - dw;
    const doorRightX = c.x + dw;

    // 辅助函数：创建绝对明亮的线
    function makeLine(pts, color, width = 1, isGlow = false) {
        const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
        const mat = new THREE.LineBasicMaterial({
            color: color,
            linewidth: width,
            transparent: true,
            opacity: isGlow ? 0.4 : 1.0,
            depthTest: false,      // ✅ 永不遮挡
            depthWrite: false,     // ✅ 不写深度
            toneMapped: false,     // ✅ 不被压暗
            blending: THREE.NormalBlending, 
            renderOrder: 999       // ✅ 最后画
        });
        const line = new THREE.LineSegments(geo, mat);
        line.renderOrder = 999;
        return line;
    }

    // 1. 房子主体 (白色)
    // 顶点定义 (基于精确坐标)
    const v = [
        new THREE.Vector3(minX, minY, minZ), // 0: 左下前
        new THREE.Vector3(maxX, minY, minZ), // 1: 右下前
        new THREE.Vector3(maxX, minY, maxZ), // 2: 右下后
        new THREE.Vector3(minX, minY, maxZ), // 3: 左下后
        new THREE.Vector3(minX, maxY, minZ), // 4: 左上前
        new THREE.Vector3(maxX, maxY, minZ), // 5: 右上前
        new THREE.Vector3(maxX, maxY, maxZ), // 6: 右上后
        new THREE.Vector3(minX, maxY, maxZ)  // 7: 左上后
    ];

    const edges = [
        [0,1], [1,2], [2,3], [3,0], // 底
        [4,5], [5,6], [6,7], [7,4], // 顶
        [0,4], [1,5], [2,6], [3,7]  // 柱
    ];
    
    let housePts = [];
    edges.forEach(([a, b]) => {
        housePts.push(v[a].toArray(), v[b].toArray());
    });
    linesGroup.add(makeLine(housePts, CONFIG.colors.line, 1));
    linesGroup.add(makeLine(housePts, CONFIG.colors.lineGlow, 2, true));

    // 2. 门框 (红色) - 单独绘制在前墙上
    // 前墙 Z = minZ
    const doorPts = [
        [[doorLeftX, doorBottom, minZ], [doorLeftX, doorTop, minZ]], 
        [[doorLeftX, doorTop, minZ], [doorRightX, doorTop, minZ]],   
        [[doorRightX, doorTop, minZ], [doorRightX, doorBottom, minZ]] 
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
// 5. UI (带调试信息)
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, { position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', fontFamily:'Courier New', color:'#fff' });
    document.body.appendChild(uiContainer);
    updateUI();
}

function updateUI() {
    uiContainer.innerHTML = '';
    
    // ✅ 调试信息：永远显示在左上角，防止黑屏误判
    const debug = document.createElement('div');
    Object.assign(debug.style, { position:'absolute', top:'10px', left:'10px', color:'#0f0', fontSize:'12px', zIndex: 10000 });
    debug.innerHTML = `STATE: ${gameState}<br>POS: ${camera.position.x.toFixed(1)} ${camera.position.y.toFixed(1)} ${camera.position.z.toFixed(1)}`;
    uiContainer.appendChild(debug);

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
        info.innerHTML = `WASD:Move SHIFT:Sprint SPACE:Jump E:Bag ESC:Menu`;
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
