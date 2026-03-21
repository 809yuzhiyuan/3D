import * as THREE from 'three';

// ==========================================
// 1. 配置与常量 (Configuration & Constants)
// ==========================================
const CONFIG = {
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    gridRadius: 6000,
    gridStep: 100,
    nearClip: 0.5, // 减小近裁剪面，防止穿模
    fov: Math.PI / 4,
    
    // 玩家属性
    playerHeightStand: 1.7,
    playerHeightCrouch: 0.9,
    playerRadius: 0.4,
    groundY: 0.0,
    
    // 移动参数 (后朋克风格：稍微沉重一点的手感)
    walkSpeed: 10.0,
    sprintSpeed: 35.0,
    crouchSpeed: 2.0,
    jumpForce: 10.0,
    gravity: 25.0,
    mouseSensitivity: 0.002,
    smoothFactor: 0.2, 
    
    // 房子配置
    houseLength: 100.0,
    houseHeight: 40.0,
    houseDepth: 80.0,
    doorWidth: 18.0,  // 门宽一点
    doorHeight: 25.0,
    
    houseCenter: new THREE.Vector3(0, 20, -50),
    spawnPosition: new THREE.Vector3(0, 2, -90), // 出生点远一点，给视野
    spawnYaw: Math.PI,

    // 🎨 后朋克视觉配置
    bgColor: 0x080808,       // 深灰黑，带一点噪点感
    fogColor: 0x080808,
    fogDensity: 0.002,       // 浓雾，制造压抑感
    
    // 颜色：高对比度，冷峻
    lineCore: 0xffffff,      // 核心：纯白，最亮
    lineGlow: 0xcccccc,      // 光晕：浅灰，模拟老旧投影的散射
    lineDoor: 0xff3333,      // 门：警示红，危险感
    lineGrid: 0x333333       // 网格：暗灰，低调
};

// ==========================================
// 2. 全局变量 (Global State)
// ==========================================
let camera, scene, renderer;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let isSprinting = false;
let isCrouching = false;

const currentVelocity = new THREE.Vector3();
const targetVelocity = new THREE.Vector3();

const player = {
    yaw: CONFIG.spawnYaw,
    pitch: 0,
    isGrounded: true
};

const GAME_STATE = {
    MENU: 0,
    PLAYING: 1,
    PAUSED: 2,
    INVENTORY: 3
};
let currentState = GAME_STATE.MENU;
let isMouseCaptured = false;

const inventory = [
    { name: "撬棍", color: 0xdddddd },
    { name: "胶带", color: 0xeeeeee },
    { name: "磁带", color: 0xff3333 },
    { name: "照片", color: 0xaaaaaa },
    { name: "打火机", color: 0xffaa00 },
    { name: "笔记", color: 0xffffff },
    { name: "钥匙", color: 0x888888 },
    { name: "收音机", color: 0x555555 },
    { name: "空槽", color: 0x222222 }
];
let selectedSlotIndex = 0;

let neonGroup;
let gridHelper;
let crosshair;
let uiContainer;
let noiseMesh; // 噪点层

let prevTime = performance.now();

// ==========================================
// 3. 初始化 (Initialization)
// ==========================================
init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bgColor);
    scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity); 

    camera = new THREE.PerspectiveCamera(CONFIG.fov * 180 / Math.PI, CONFIG.windowWidth / CONFIG.windowHeight, CONFIG.nearClip, CONFIG.gridRadius);
    
    resetPlayer();

    // ✅ 关键：开启抗锯齿，保证线条锐利
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        powerPreference: "high-performance",
        preserveDrawingBuffer: true // 用于后续可能的后处理
    }); 
    
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // 稍微降低像素比增加颗粒感
    renderer.setSize(CONFIG.windowWidth, CONFIG.windowHeight);
    
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    document.body.appendChild(renderer.domElement);

    createNoiseOverlay(); // 添加噪点层
    createNeonWorld();
    createCrosshair();
    createUI();

    const canvas = renderer.domElement;

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    canvas.addEventListener('mousemove', onMouseMove, false);
    
    canvas.addEventListener('click', () => {
        if (currentState === GAME_STATE.PLAYING && !isMouseCaptured) {
            canvas.requestPointerLock();
        }
    }, false);

    document.addEventListener('pointerlockchange', onPointerLockChange, false);
    document.addEventListener('mozpointerlockchange', onPointerLockChange, false);
}

function onPointerLockChange() {
    const canvas = renderer.domElement;
    isMouseCaptured = (document.pointerLockElement === canvas || document.mozPointerLockElement === canvas);
}

function resetPlayer() {
    if (!camera) return;
    camera.position.copy(CONFIG.spawnPosition);
    player.yaw = CONFIG.spawnYaw;
    player.pitch = 0;
    currentVelocity.set(0, 0, 0);
    player.isGrounded = true;
    updateCameraRotation();
}

// ==========================================
// 4. 场景构建 - ✅ 核心修复：深度测试关闭 + 后朋克风格
// ==========================================

// 添加全屏噪点，模拟老式录像带/胶片感
function createNoiseOverlay() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 256);
    
    // 绘制随机噪点
    for (let i = 0; i < 10000; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const opacity = Math.random() * 0.15; // 低透明度噪点
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fillRect(x, y, 2, 2);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter; // 保持颗粒感
    
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.08, // 淡淡的噪点
        depthTest: false,
        depthWrite: false,
        renderOrder: 9999 // 最后渲染，覆盖一切
    });
    
    noiseMesh = new THREE.Mesh(geometry, material);
    noiseMesh.frustumCulled = false; // 始终可见
    scene.add(noiseMesh);
}

function createNeonWorld() {
    neonGroup = new THREE.Group();
    // 不需要添加到 scene 的特定位置，因为它只是线条容器
    scene.add(neonGroup);

    const hl = CONFIG.houseLength / 2;
    const hd = CONFIG.houseDepth / 2;
    const hh = CONFIG.houseHeight / 2;
    const c = CONFIG.houseCenter;

    const v = [
        new THREE.Vector3(c.x - hl, c.y - hh, c.z - hd),
        new THREE.Vector3(c.x + hl, c.y - hh, c.z - hd),
        new THREE.Vector3(c.x + hl, c.y - hh, c.z + hd),
        new THREE.Vector3(c.x - hl, c.y - hh, c.z + hd),
        new THREE.Vector3(c.x - hl, c.y + hh, c.z - hd),
        new THREE.Vector3(c.x + hl, c.y + hh, c.z - hd),
        new THREE.Vector3(c.x + hl, c.y + hh, c.z + hd),
        new THREE.Vector3(c.x - hl, c.y + hh, c.z + hd)
    ];

    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    // 门框数据
    const groundY = c.y - hh;
    const doorTop = groundY + CONFIG.doorHeight;
    const frontZ = c.z + hd;
    const dw = CONFIG.doorWidth / 2;
    
    // 门的位置：在正面墙 (Z = frontZ) 的中间
    const dBL = new THREE.Vector3(c.x - dw, groundY, frontZ);
    const dBR = new THREE.Vector3(c.x + dw, groundY, frontZ);
    const dTL = new THREE.Vector3(c.x - dw, doorTop, frontZ);
    const dTR = new THREE.Vector3(c.x + dw, doorTop, frontZ);
    
    const doorEdges = [[dBL, dTL], [dTL, dTR], [dTR, dBR]];

    // --- 核心修复函数：创建绝对明亮的线条 ---
    function createPostPunkLine(points, color, isDoor = false) {
        const positions = [];
        for (let i = 0; i < points.length; i += 2) {
            positions.push(points[i].x, points[i].y, points[i].z);
            positions.push(points[i+1].x, points[i+1].y, points[i+1].z);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        // 材质设置：
        // 1. depthTest: false -> 线条永远不被遮挡，解决“进去变暗”的核心！
        // 2. depthWrite: false -> 不写入深度，避免干扰其他线条
        // 3. renderOrder: 999 -> 最后绘制，覆盖在所有东西上面
        // 4. toneMapped: false -> 颜色不被压暗
        const material = new THREE.LineBasicMaterial({
            color: color,
            linewidth: isDoor ? 2 : 1, // 门稍微粗一点
            transparent: false,
            opacity: 1.0,
            depthTest: false,   // ✅ 关键：关闭深度测试
            depthWrite: false,  // ✅ 关键：关闭深度写入
            toneMapped: false,  // ✅ 关键：关闭色调映射
            blending: THREE.NormalBlending
        });

        const line = new THREE.LineSegments(geometry, material);
        line.renderOrder = 999; // ✅ 关键：最高渲染优先级
        return line;
    }

    // 1. 房子主体 (白色/浅灰)
    const housePoints = [];
    edges.forEach(pair => {
        housePoints.push(v[pair[0]], v[pair[1]]);
    });
    // 为了后朋克感，我们可以画两层：一层实线，一层稍微偏移的虚线（这里简化为单层高亮实线）
    const houseLine = createPostPunkLine(housePoints, CONFIG.lineCore);
    neonGroup.add(houseLine);
    
    // 加一层淡淡的光晕模拟投影不稳定
    const glowLine = createPostPunkLine(housePoints, CONFIG.lineGlow);
    glowLine.scale.set(1.02, 1.02, 1.02); // 稍微大一点点
    glowLine.material.opacity = 0.3;
    glowLine.material.transparent = true;
    neonGroup.add(glowLine);

    // 2. 门 (警示红)
    const doorPoints = [];
    doorEdges.forEach(pair => {
        doorPoints.push(pair[0], pair[1]);
    });
    const doorLine = createPostPunkLine(doorPoints, CONFIG.lineDoor, true);
    neonGroup.add(doorLine);
    
    // 门的红光晕
    const doorGlow = createPostPunkLine(doorPoints, 0x550000, true);
    doorGlow.scale.set(1.05, 1.05, 1.05);
    doorGlow.material.opacity = 0.4;
    doorGlow.material.transparent = true;
    neonGroup.add(doorGlow);

    // 3. 网格 (工业灰)
    const size = CONFIG.gridRadius * 2;
    const divisions = size / CONFIG.gridStep;
    
    gridHelper = new THREE.GridHelper(size, divisions, CONFIG.lineGrid, CONFIG.lineGrid);
    gridHelper.material.depthTest = false; // 网格也浮在上面？不，网格应该在地上，但为了 visibility...
    // 修正：网格应该有深度测试，否则会和地面混淆，但为了后朋克的“全息感”，我们让它半透明且不受遮挡
    gridHelper.material.depthTest = false; 
    gridHelper.material.depthWrite = false;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.4;
    gridHelper.renderOrder = 100; // 比房子低，比背景高
    scene.add(gridHelper);
}

function createCrosshair() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    // 简单的十字，无发光，符合后朋克的冷峻
    ctx.beginPath();
    ctx.moveTo(32, 16); ctx.lineTo(32, 24);
    ctx.moveTo(32, 40); ctx.lineTo(32, 48);
    ctx.moveTo(16, 32); ctx.lineTo(24, 32);
    ctx.moveTo(40, 32); ctx.lineTo(48, 32);
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false,
        depthWrite: false,
        renderOrder: 9999
    });
    crosshair = new THREE.Sprite(material);
    crosshair.scale.set(0.6, 0.6, 1);
    crosshair.renderOrder = 9999;
    scene.add(crosshair);
}

// ==========================================
// 5. UI 系统 (后朋克风格：粗体、单色、终端感)
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '0';
    uiContainer.style.left = '0';
    uiContainer.style.width = '100%';
    uiContainer.style.height = '100%';
    uiContainer.style.pointerEvents = 'none'; 
    uiContainer.style.fontFamily = '"Courier New", Courier, monospace'; // 等宽字体
    document.body.appendChild(uiContainer);
    updateUI();
}

function updateUI() {
    uiContainer.innerHTML = '';
    
    const createButton = (text, y, onClick) => {
        const btn = document.createElement('div');
        btn.innerText = text;
        Object.assign(btn.style, {
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: y + 'px',
            width: '240px', height: '60px', backgroundColor: '#000',
            border: '2px solid #fff', color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '20px', cursor: 'pointer', pointerEvents: 'auto',
            boxShadow: '4px 4px 0px #333', transition: 'all 0.1s',
            fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase'
        });
        
        btn.onmouseenter = () => {
            btn.style.backgroundColor = '#fff';
            btn.style.color = '#000';
            btn.style.boxShadow = '6px 6px 0px #888';
            btn.style.transform = 'translateX(-50%) translate(-2px, -2px)';
        };
        btn.onmouseleave = () => {
            btn.style.backgroundColor = '#000';
            btn.style.color = '#fff';
            btn.style.boxShadow = '4px 4px 0px #333';
            btn.style.transform = 'translateX(-50%)';
        };
        btn.onclick = (e) => { e.stopPropagation(); onClick(); };
        return btn;
    };

    if (currentState === GAME_STATE.MENU) {
        uiContainer.style.backgroundColor = '#050505';
        uiContainer.style.pointerEvents = 'auto';
        const title = document.createElement('h1');
        title.innerText = "POST_PUNK\nENGINE";
        title.style.whiteSpace = 'pre-line';
        Object.assign(title.style, {
            color: '#fff', textAlign: 'center', position: 'absolute', top: '100px', width: '100%',
            fontSize: '60px', margin: '0', letterSpacing: '5px', fontWeight: '900',
            textShadow: '2px 2px 0 #333'
        });
        uiContainer.appendChild(title);
        uiContainer.appendChild(createButton("START", 350, startGame));
        uiContainer.appendChild(createButton("QUIT", 440, () => window.close()));
    } 
    else if (currentState === GAME_STATE.PAUSED) {
        uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        uiContainer.style.pointerEvents = 'auto';
        const title = document.createElement('h1');
        title.innerText = "PAUSED";
        Object.assign(title.style, {
            color: '#ff3333', textAlign: 'center', position: 'absolute', top: '150px', width: '100%',
            fontSize: '50px', textShadow: '2px 2px 0 #550000', fontWeight: 'bold'
        });
        uiContainer.appendChild(title);
        uiContainer.appendChild(createButton("RESUME", 280, resumeGame));
        uiContainer.appendChild(createButton("MENU", 370, goToMenu));
    }
    else if (currentState === GAME_STATE.INVENTORY) {
        uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        uiContainer.style.pointerEvents = 'auto';
        uiContainer.onclick = (e) => { if (e.target === uiContainer) toggleInventory(); };
        
        const invBox = document.createElement('div');
        Object.assign(invBox.style, {
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: '700px', minHeight: '400px', backgroundColor: '#111',
            border: '2px solid #fff', boxShadow: '8px 8px 0px #333',
            display: 'flex', flexWrap: 'wrap', padding: '20px', boxSizing: 'border-box'
        });
        invBox.onclick = (e) => e.stopPropagation(); 
        
        const title = document.createElement('div');
        title.innerText = "> INVENTORY";
        Object.assign(title.style, {
            width: '100%', color: '#fff', fontSize: '24px', marginBottom: '20px',
            fontWeight: 'bold', borderBottom: '1px solid #333', paddingBottom: '10px'
        });
        invBox.appendChild(title);

        inventory.forEach((item, index) => {
            const slot = document.createElement('div');
            const isSelected = index === selectedSlotIndex;
            const hexColor = item.color.toString(16).padStart(6, '0');
            
            Object.assign(slot.style, {
                width: '80px', height: '80px', margin: '10px',
                backgroundColor: isSelected ? '#fff' : '#222',
                border: isSelected ? '2px solid #ff3333' : '1px solid #444',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: isSelected ? '#000' : '#' + hexColor, fontSize: '12px', textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.1s', fontWeight: isSelected ? 'bold' : 'normal'
            });
            
            slot.innerHTML = `<div style="font-size:24px; margin-bottom:5px">■</div><div>${item.name}</div>`;
            
            slot.onmouseenter = () => { if(!isSelected) { slot.style.borderColor = '#888'; } };
            slot.onmouseleave = () => { if(!isSelected) { slot.style.borderColor = '#444'; } };
            slot.onclick = (e) => { e.stopPropagation(); selectedSlotIndex = index; updateUI(); };
            invBox.appendChild(slot);
        });
        uiContainer.appendChild(invBox);
        
        const hint = document.createElement('div');
        const hintColor = inventory[selectedSlotIndex].color.toString(16).padStart(6, '0');
        hint.innerText = `> EQUIPPED: ${inventory[selectedSlotIndex].name}`;
        Object.assign(hint.style, {
            position: 'absolute', bottom: '30px', left: '30px', color: '#fff',
            fontSize: '18px', fontWeight: 'bold', backgroundColor: '#000',
            padding: '10px 15px', border: '1px solid #fff'
        });
        uiContainer.appendChild(hint);
    }
    
    if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.INVENTORY) {
        const info = document.createElement('div');
        Object.assign(info.style, {
            position: 'absolute', top: '20px', left: '20px', color: '#aaa',
            fontSize: '14px', fontFamily: '"Courier New", monospace',
            pointerEvents: 'none', lineHeight: '1.6'
        });
        info.innerHTML = `
            <span style="color:#fff;">POS:</span> ${camera.position.x.toFixed(0)} ${camera.position.y.toFixed(0)} ${camera.position.z.toFixed(0)}<br>
            <span style="color:#666;">[WASD]</span> MOVE &nbsp; <span style="color:#666;">[SHIFT]</span> RUN &nbsp; <span style="color:#666;">[SPACE]</span> JUMP<br>
            <span style="color:#666;">[E]</span> BAG &nbsp; <span style="color:#666;">[ESC]</span> MENU
        `;
        uiContainer.appendChild(info);
    }
}

function startGame() {
    currentState = GAME_STATE.PLAYING;
    resetPlayer();
    updateUI();
    setTimeout(() => { renderer.domElement.requestPointerLock(); }, 50);
}

function resumeGame() {
    currentState = GAME_STATE.PLAYING;
    updateUI();
    setTimeout(() => { renderer.domElement.requestPointerLock(); }, 50);
}

function goToMenu() {
    currentState = GAME_STATE.MENU;
    document.exitPointerLock();
    updateUI();
}

function toggleInventory() {
    if (currentState === GAME_STATE.PLAYING) {
        currentState = GAME_STATE.INVENTORY;
        document.exitPointerLock();
    } else if (currentState === GAME_STATE.INVENTORY) {
        currentState = GAME_STATE.PLAYING;
        setTimeout(() => { renderer.domElement.requestPointerLock(); }, 50);
    }
    updateUI();
}

// ==========================================
// 6. 输入处理
// ==========================================
function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
        case 'Space': 
            if (player.isGrounded && currentState === GAME_STATE.PLAYING && !isCrouching) {
                currentVelocity.y = CONFIG.jumpForce;
                player.isGrounded = false;
            }
            break;
        case 'ShiftLeft': isSprinting = true; break;
        case 'ControlLeft': 
            if (!isCrouching) {
                isCrouching = true;
                if(camera) camera.position.y = Math.max(camera.position.y, CONFIG.groundY + CONFIG.playerHeightCrouch);
                currentVelocity.y = 0;
            }
            break;
        case 'KeyE':
            if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.INVENTORY) toggleInventory();
            break;
        case 'Escape':
            if (currentState === GAME_STATE.INVENTORY) toggleInventory();
            else if (currentState === GAME_STATE.PLAYING) { currentState = GAME_STATE.PAUSED; document.exitPointerLock(); updateUI(); }
            else if (currentState === GAME_STATE.PAUSED) goToMenu();
            break;
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': 
        case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
            const index = parseInt(event.code.replace('Digit', '')) - 1;
            if (index >= 0 && index < inventory.length) {
                selectedSlotIndex = index;
                if (currentState === GAME_STATE.INVENTORY) updateUI();
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = false; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyD': moveRight = false; break;
        case 'ShiftLeft': isSprinting = false; break;
        case 'ControlLeft': isCrouching = false; break;
    }
}

function onMouseMove(event) {
    if (currentState !== GAME_STATE.PLAYING || !isMouseCaptured) return;
    const movementX = event.movementX || event.mozMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || 0;
    if (movementX === 0 && movementY === 0) return;
    player.yaw -= movementX * CONFIG.mouseSensitivity;
    player.pitch -= movementY * CONFIG.mouseSensitivity;
    player.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, player.pitch));
    updateCameraRotation();
}

function updateCameraRotation() {
    if (!camera) return;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.set(player.pitch, player.yaw, 0);
    camera.quaternion.setFromEuler(euler);
    if (crosshair) {
        crosshair.position.copy(camera.position);
        crosshair.translateZ(-1);
    }
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// 7. 物理与碰撞 - ✅ 修复：门洞逻辑
// ==========================================
function checkHouseCollision(pos) {
    const hl = CONFIG.houseLength / 2;
    const hd = CONFIG.houseDepth / 2;
    const hh = CONFIG.houseHeight / 2;
    const c = CONFIG.houseCenter;
    
    const minX = c.x - hl;
    const maxX = c.x + hl;
    const minZ = c.z - hd;
    const maxZ = c.z + hd;
    const minY = c.y - hh;
    const maxY = c.y + hh;

    // 1. 初步包围盒检测 (如果完全在外面，直接返回 false)
    // 扩大一点检测范围，包含玩家半径
    if (pos.x < minX - CONFIG.playerRadius || pos.x > maxX + CONFIG.playerRadius ||
        pos.z < minZ - CONFIG.playerRadius || pos.z > maxZ + CONFIG.playerRadius ||
        pos.y < minY - 2 || pos.y > maxY + 2) {
        return false;
    }

    // 2. 高度检测 (如果在屋顶上或地下，不碰撞)
    if (pos.y < minY || pos.y > maxY) {
        return false;
    }

    // 3. 门洞检测 (核心修复)
    // 门位于 Z = maxZ (前墙)
    const doorLeft = c.x - CONFIG.doorWidth / 2;
    const doorRight = c.x + CONFIG.doorWidth / 2;
    const doorTop = minY + CONFIG.doorHeight;
    
    // 定义门前的一个“安全通道”区域
    // 如果玩家在门的 X 范围内，且 Y 低于门顶，且 Z 在前墙附近，则不碰撞
    const inDoorX = pos.x > doorLeft - CONFIG.playerRadius && pos.x < doorRight + CONFIG.playerRadius;
    const inDoorY = pos.y < doorTop;
    const atFrontWall = pos.z > maxZ - 2.0 && pos.z < maxZ + 2.0; // 墙体厚度区域

    if (inDoorX && inDoorY && atFrontWall) {
        return false; // 这里是门，可以穿过
    }

    // 4. 墙体碰撞
    // 如果在房子内部 (X, Z 都在范围内)，则碰撞
    // 注意：因为前面已经排除了门洞，所以这里只要是内部就是撞墙
    if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        return true; 
    }

    return false;
}

function updatePhysics(delta) {
    if (currentState !== GAME_STATE.PLAYING) return;

    const speed = isCrouching ? CONFIG.crouchSpeed : (isSprinting ? CONFIG.sprintSpeed : CONFIG.walkSpeed);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    
    targetVelocity.set(0, 0, 0);
    if (moveForward) targetVelocity.add(forward);
    if (moveBackward) targetVelocity.sub(forward);
    if (moveRight) targetVelocity.add(right);
    if (moveLeft) targetVelocity.sub(right);
    
    if (targetVelocity.lengthSq() > 0) {
        targetVelocity.normalize().multiplyScalar(speed);
    }

    currentVelocity.x += (targetVelocity.x - currentVelocity.x) * CONFIG.smoothFactor;
    currentVelocity.z += (targetVelocity.z - currentVelocity.z) * CONFIG.smoothFactor;

    const moveStep = delta;
    let nextX = camera.position.x + currentVelocity.x * moveStep;
    let nextZ = camera.position.z + currentVelocity.z * moveStep;
    
    // X轴碰撞检测
    if (!checkHouseCollision(new THREE.Vector3(nextX, camera.position.y, camera.position.z))) {
        currentVelocity.x = 0;
    } else {
        camera.position.x = nextX;
    }
    
    // Z轴碰撞检测
    if (!checkHouseCollision(new THREE.Vector3(camera.position.x, camera.position.y, nextZ))) {
        currentVelocity.z = 0;
    } else {
        camera.position.z = nextZ;
    }

    // 重力
    currentVelocity.y -= CONFIG.gravity * delta;
    camera.position.y += currentVelocity.y * delta;
    
    const targetHeight = isCrouching ? CONFIG.playerHeightCrouch : CONFIG.playerHeightStand;
    const groundLevel = CONFIG.groundY + targetHeight;
    
    if (camera.position.y <= groundLevel) {
        camera.position.y = groundLevel;
        currentVelocity.y = 0;
        player.isGrounded = true;
    } else {
        player.isGrounded = false;
    }
    
    if (isCrouching && player.isGrounded) {
        camera.position.y = Math.max(camera.position.y, groundLevel);
    }
}

function updateGrid() {
    if (gridHelper && camera) {
        const step = CONFIG.gridStep;
        gridHelper.position.x = Math.floor(camera.position.x / step) * step;
        gridHelper.position.z = Math.floor(camera.position.z / step) * step;
    }
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1);
    prevTime = time;
    
    if (currentState === GAME_STATE.PLAYING) {
        updatePhysics(delta);
        updateCameraRotation();
    }
    updateGrid();
    
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}
