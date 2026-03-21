import * as THREE from 'three';

// ==========================================
// 1. 配置与常量 (Configuration & Constants)
// ==========================================
const CONFIG = {
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    gridRadius: 5000,
    gridStep: 100, // 稍微加大网格间距，减少视觉杂乱
    nearClip: 1.0,
    fov: Math.PI / 4,
    
    // 玩家属性
    playerHeightStand: 1.7, // 调整为正常人身高
    playerHeightCrouch: 0.9,
    playerRadius: 0.4,
    groundY: 0.0, // 地面归零，更符合直觉
    
    // 移动参数 (手感优化：增加惯性平滑)
    walkSpeed: 12.0,
    sprintSpeed: 40.0,
    crouchSpeed: 2.0,
    jumpForce: 12.0,
    gravity: 30.0,
    mouseSensitivity: 0.002,
    smoothFactor: 0.15, // 移动平滑系数
    
    // 房子配置
    houseLength: 100.0,
    houseHeight: 40.0,
    houseDepth: 80.0,
    doorWidth: 15.0,
    doorHeight: 25.0,
    
    houseCenter: new THREE.Vector3(0, 20, -50),
    spawnPosition: new THREE.Vector3(0, 2, -80),
    spawnYaw: Math.PI,

    // ✅ 视觉配置：赛博朋克风格
    bgColor: 0x050505,       // 极深灰，比纯黑更有质感
    fogColor: 0x050505,
    fogDensity: 0.0015,      // 适度的雾，增加景深
    
    // 🔥 霓虹颜色配置
    neonHouse: 0x00ffff,     // 青色霓虹
    neonDoor: 0xff0055,      // 洋红霓虹
    neonGrid: 0x222222       // 暗灰网格，不抢戏
};

// ==========================================
// 2. 全局变量 (Global State)
// ==========================================
let camera, scene, renderer;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let isSprinting = false;
let isCrouching = false;

// 平滑移动变量
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
    { name: "光剑", color: 0x00ffff },
    { name: "纳米药", color: 0x00ff00 },
    { name: "全息图", color: 0xffff00 },
    { name: "密钥", color: 0xff0055 },
    { name: "护盾", color: 0x0000ff },
    { name: "能量块", color: 0xffaa00 },
    { name: "芯片", color: 0xff00ff },
    { name: "数据盘", color: 0xffffff },
    { name: "空槽", color: 0x333333 }
];
let selectedSlotIndex = 0;

let neonGroup; // 存放所有霓虹线条
let gridHelper;
let crosshair;
let uiContainer;

let prevTime = performance.now();

// ==========================================
// 3. 初始化 (Initialization) - ✅ 优化渲染设置
// ==========================================
init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bgColor);
    scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity); 

    camera = new THREE.PerspectiveCamera(CONFIG.fov * 180 / Math.PI, CONFIG.windowWidth / CONFIG.windowHeight, CONFIG.nearClip, CONFIG.gridRadius);
    
    resetPlayer();

    // ✅ 关键优化：开启抗锯齿 + 高精度像素比
    // 现在的显卡性能足够，开启抗锯齿能让线条边缘平滑，消除闪烁
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        powerPreference: "high-performance",
        alpha: false
    }); 
    
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(CONFIG.windowWidth, CONFIG.windowHeight);
    
    // 色调映射：使用 Reinhard 或 Uncharted 可以让高光更自然，但为了纯霓虹风，我们用 NoToneMapping + 手动发光
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    document.body.appendChild(renderer.domElement);

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
    if (document.pointerLockElement === canvas || document.mozPointerLockElement === canvas) {
        isMouseCaptured = true;
    } else {
        isMouseCaptured = false;
    }
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
// 4. 场景构建 - ✅ 核心：双层霓虹光管技术
// ==========================================
function createNeonWorld() {
    neonGroup = new THREE.Group();
    scene.add(neonGroup);

    // --- 1. 创建房子数据 ---
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
    const dBL = new THREE.Vector3(c.x - dw, groundY, frontZ);
    const dBR = new THREE.Vector3(c.x + dw, groundY, frontZ);
    const dTL = new THREE.Vector3(c.x - dw, doorTop, frontZ);
    const dTR = new THREE.Vector3(c.x + dw, doorTop, frontZ);
    const doorEdges = [[dBL, dTL], [dTL, dTR], [dTR, dBR]];

    // --- 2. 辅助函数：创建双层霓虹线 ---
    function createNeonLine(points, colorCore, colorGlow, thicknessCore, thicknessGlow) {
        const positions = [];
        for (let i = 0; i < points.length; i += 2) {
            positions.push(points[i].x, points[i].y, points[i].z);
            positions.push(points[i+1].x, points[i+1].y, points[i+1].z);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        // A. 核心层：高亮、不透明、较细
        const matCore = new THREE.LineBasicMaterial({
            color: colorCore,
            linewidth: thicknessCore, // 注意：WebGL通常只支持1，但在高分屏下看起来够粗
            transparent: false,
            toneMapped: false,
            blending: THREE.NormalBlending,
            depthWrite: false, // 防止遮挡闪烁
            depthTest: true
        });
        const lineCore = new THREE.LineSegments(geometry, matCore);
        lineCore.renderOrder = 2; // 后渲染，在最上层

        // B. 光晕层：半透明、较粗、模拟发光
        const matGlow = new THREE.LineBasicMaterial({
            color: colorGlow,
            linewidth: thicknessGlow,
            transparent: true,
            opacity: 0.4, // 柔和的光晕
            toneMapped: false,
            blending: THREE.AdditiveBlending, // 加法混合产生发光感
            depthWrite: false,
            depthTest: true
        });
        const lineGlow = new THREE.LineSegments(geometry.clone(), matGlow); // 克隆几何体以防冲突
        lineGlow.renderOrder = 1; // 先渲染，在底层

        const group = new THREE.Group();
        group.add(lineGlow);
        group.add(lineCore);
        return group;
    }

    // --- 3. 生成房子 ---
    const housePoints = [];
    edges.forEach(pair => {
        housePoints.push(v[pair[0]], v[pair[1]]);
    });
    const houseNeon = createNeonLine(housePoints, 0xffffff, CONFIG.neonHouse, 1, 3);
    neonGroup.add(houseNeon);

    // --- 4. 生成门 ---
    const doorPoints = [];
    doorEdges.forEach(pair => {
        doorPoints.push(pair[0], pair[1]);
    });
    const doorNeon = createNeonLine(doorPoints, 0xffffff, CONFIG.neonDoor, 1, 4);
    neonGroup.add(doorNeon);

    // --- 5. 生成网格 (使用 GridHelper + 自定义光晕) ---
    const size = CONFIG.gridRadius * 2;
    const divisions = size / CONFIG.gridStep;
    
    // 基础网格
    gridHelper = new THREE.GridHelper(size, divisions, CONFIG.neonGrid, CONFIG.neonGrid);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;
    gridHelper.material.depthWrite = false;
    gridHelper.renderOrder = 0;
    scene.add(gridHelper);

    // 网格主轴线光晕 (每隔几步加一条亮线，增加速度感)
    const axisPoints = [];
    for (let i = -divisions/2; i <= divisions/2; i++) {
        if (i % 5 === 0) { // 每5格加一条亮线
            const pos = i * CONFIG.gridStep;
            axisPoints.push(new THREE.Vector3(-size/2, 0, pos), new THREE.Vector3(size/2, 0, pos));
            axisPoints.push(new THREE.Vector3(pos, 0, -size/2), new THREE.Vector3(pos, 0, size/2));
        }
    }
    if (axisPoints.length > 0) {
        const gridGlow = createNeonLine(axisPoints, 0x444444, 0x224466, 1, 2);
        gridGlow.renderOrder = 0;
        scene.add(gridGlow);
    }
}

function createCrosshair() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // 绘制发光准星
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(32, 12); ctx.lineTo(32, 24);
    ctx.moveTo(32, 40); ctx.lineTo(32, 52);
    ctx.moveTo(12, 32); ctx.lineTo(24, 32);
    ctx.moveTo(40, 32); ctx.lineTo(52, 32);
    ctx.stroke();
    
    // 中心点
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(30, 30, 4, 4);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        toneMapped: false
    });
    crosshair = new THREE.Sprite(material);
    crosshair.scale.set(0.8, 0.8, 1);
    crosshair.renderOrder = 999;
    scene.add(crosshair);
}

// ==========================================
// 5. UI 系统 (保持原有风格，微调配色)
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '0';
    uiContainer.style.left = '0';
    uiContainer.style.width = '100%';
    uiContainer.style.height = '100%';
    uiContainer.style.pointerEvents = 'none'; 
    uiContainer.style.fontFamily = '"Segoe UI", "Microsoft YaHei", sans-serif';
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
            width: '220px', height: '55px', backgroundColor: 'rgba(10, 10, 15, 0.85)',
            border: '1px solid #00ffff', color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '22px', cursor: 'pointer', pointerEvents: 'auto',
            boxShadow: '0 0 15px rgba(0, 255, 255, 0.4)', transition: 'all 0.2s',
            textShadow: '0 0 8px #00ffff', fontWeight: '600', letterSpacing: '1px',
            backdropFilter: 'blur(5px)', borderRadius: '4px'
        });
        
        btn.onmouseenter = () => {
            btn.style.backgroundColor = 'rgba(0, 255, 255, 0.2)';
            btn.style.boxShadow = '0 0 30px rgba(0, 255, 255, 0.8)';
            btn.style.transform = 'translateX(-50%) scale(1.05)';
        };
        btn.onmouseleave = () => {
            btn.style.backgroundColor = 'rgba(10, 10, 15, 0.85)';
            btn.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.4)';
            btn.style.transform = 'translateX(-50%) scale(1)';
        };
        btn.onclick = (e) => { e.stopPropagation(); onClick(); };
        return btn;
    };

    if (currentState === GAME_STATE.MENU) {
        uiContainer.style.backgroundColor = 'rgba(5, 5, 5, 0.95)';
        uiContainer.style.pointerEvents = 'auto';
        const title = document.createElement('h1');
        title.innerText = "NEON ENGINE";
        Object.assign(title.style, {
            color: '#fff', textAlign: 'center', position: 'absolute', top: '120px', width: '100%',
            fontSize: '80px', margin: '0', textShadow: '0 0 40px #00ffff, 0 0 80px #0088ff',
            letterSpacing: '15px', fontWeight: '900', fontFamily: 'sans-serif'
        });
        uiContainer.appendChild(title);
        uiContainer.appendChild(createButton("START SYSTEM", 350, startGame));
        uiContainer.appendChild(createButton("EXIT", 440, () => window.close()));
    } 
    else if (currentState === GAME_STATE.PAUSED) {
        uiContainer.style.backgroundColor = 'rgba(5, 5, 5, 0.6)';
        uiContainer.style.pointerEvents = 'auto';
        const title = document.createElement('h1');
        title.innerText = "SYSTEM PAUSED";
        Object.assign(title.style, {
            color: '#ff0055', textAlign: 'center', position: 'absolute', top: '150px', width: '100%',
            fontSize: '60px', textShadow: '0 0 30px #ff0055', fontWeight: 'bold'
        });
        uiContainer.appendChild(title);
        uiContainer.appendChild(createButton("RESUME", 280, resumeGame));
        uiContainer.appendChild(createButton("MAIN MENU", 370, goToMenu));
    }
    else if (currentState === GAME_STATE.INVENTORY) {
        uiContainer.style.backgroundColor = 'rgba(5, 5, 5, 0.5)';
        uiContainer.style.pointerEvents = 'auto';
        uiContainer.onclick = (e) => { if (e.target === uiContainer) toggleInventory(); };
        
        const invBox = document.createElement('div');
        Object.assign(invBox.style, {
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: '700px', minHeight: '400px', backgroundColor: 'rgba(10, 10, 15, 0.95)',
            border: '1px solid #00ffff', boxShadow: '0 0 60px rgba(0, 255, 255, 0.3)',
            display: 'flex', flexWrap: 'wrap', padding: '30px', boxSizing: 'border-box',
            borderRadius: '8px', backdropFilter: 'blur(10px)'
        });
        invBox.onclick = (e) => e.stopPropagation(); 
        
        const title = document.createElement('div');
        title.innerText = "INVENTORY MODULE";
        Object.assign(title.style, {
            width: '100%', color: '#fff', fontSize: '24px', marginBottom: '20px',
            textAlign: 'center', textShadow: '0 0 10px #00ffff', fontWeight: 'bold', letterSpacing: '2px'
        });
        invBox.appendChild(title);

        inventory.forEach((item, index) => {
            const slot = document.createElement('div');
            const isSelected = index === selectedSlotIndex;
            const hexColor = item.color.toString(16).padStart(6, '0');
            
            Object.assign(slot.style, {
                width: '90px', height: '90px', margin: '10px',
                backgroundColor: isSelected ? 'rgba(0, 255, 255, 0.15)' : 'rgba(40, 40, 50, 0.5)',
                border: isSelected ? '2px solid #00ffff' : '1px solid #444',
                boxShadow: isSelected ? '0 0 20px rgba(0,255,255,0.5)' : 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                borderRadius: '6px', color: '#' + hexColor, fontSize: '14px', textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.2s', fontWeight: isSelected ? 'bold' : 'normal'
            });
            
            slot.innerHTML = `<div style="font-size:20px; margin-bottom:5px">■</div><div>${item.name}</div><div style="font-size:10px;color:#666;margin-top:2px">[${index + 1}]</div>`;
            
            slot.onmouseenter = () => { if(!isSelected) { slot.style.borderColor = '#888'; slot.style.transform = 'scale(1.05)'; } };
            slot.onmouseleave = () => { if(!isSelected) { slot.style.borderColor = '#444'; slot.style.transform = 'scale(1)'; } };
            slot.onclick = (e) => { e.stopPropagation(); selectedSlotIndex = index; updateUI(); };
            invBox.appendChild(slot);
        });
        uiContainer.appendChild(invBox);
        
        const hint = document.createElement('div');
        const hintColor = inventory[selectedSlotIndex].color.toString(16).padStart(6, '0');
        hint.innerText = `EQUIPPED: ${inventory[selectedSlotIndex].name}`;
        Object.assign(hint.style, {
            position: 'absolute', bottom: '40px', left: '40px', color: '#' + hintColor,
            fontSize: '20px', fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.8)',
            padding: '10px 20px', border: `1px solid #${hintColor}`, borderRadius: '4px',
            boxShadow: `0 0 15px rgba(${parseInt(hintColor.substring(0,2),16)}, ${parseInt(hintColor.substring(2,4),16)}, ${parseInt(hintColor.substring(4,6),16)}, 0.5)`,
            pointerEvents: 'none', letterSpacing: '1px'
        });
        uiContainer.appendChild(hint);
    }
    
    if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.INVENTORY) {
        const info = document.createElement('div');
        Object.assign(info.style, {
            position: 'absolute', top: '20px', left: '20px', color: 'rgba(200, 200, 200, 0.9)',
            fontSize: '14px', fontFamily: 'monospace', textShadow: '0 0 4px black',
            pointerEvents: 'none', lineHeight: '1.8', backgroundColor: 'rgba(0,0,0,0.4)',
            padding: '10px 15px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)'
        });
        info.innerHTML = `
            <span style="color:#00ffff; font-weight:bold;">POS:</span> ${camera.position.x.toFixed(0)} : ${camera.position.y.toFixed(0)} : ${camera.position.z.toFixed(0)}<br>
            <span style="color:#666;">WASD</span> Move &nbsp; <span style="color:#666;">SHIFT</span> Sprint &nbsp; <span style="color:#666;">CTRL</span> Crouch &nbsp; <span style="color:#666;">SPACE</span> Jump<br>
            <span style="color:#666;">E</span> Inventory &nbsp; <span style="color:#666;">ESC</span> Menu
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
// 7. 物理与运动 (优化手感)
// ==========================================
function checkHouseCollision(pos) {
    const hl = CONFIG.houseLength / 2;
    const hd = CONFIG.houseDepth / 2;
    const hh = CONFIG.houseHeight / 2;
    const c = CONFIG.houseCenter;
    const minX = c.x - hl, maxX = c.x + hl;
    const minZ = c.z - hd, maxZ = c.z + hd;
    const minY = c.y - hh, maxY = c.y + hh;
    
    // 简单的 AABB 碰撞
    if (pos.y < minY - 5 || pos.y - CONFIG.playerHeightStand > maxY + 5) return false;
    if (pos.x < minX - CONFIG.playerRadius || pos.x > maxX + CONFIG.playerRadius ||
        pos.z < minZ - CONFIG.playerRadius || pos.z > maxZ + CONFIG.playerRadius) return false;
    
    // 门洞检测
    const dw = CONFIG.doorWidth / 2;
    const inX = pos.x > (c.x - dw) - CONFIG.playerRadius && pos.x < (c.x + dw) + CONFIG.playerRadius;
    const inZ = pos.z > (c.z + hd) - 2.0 && pos.z < (c.z + hd) + 2.0;
    if (inX && inZ) return false;
    
    return true;
}

function updatePhysics(delta) {
    if (currentState !== GAME_STATE.PLAYING) return;

    // 1. 计算目标速度
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

    // 2. 平滑插值 (Lerp) - 消除顿挫感
    currentVelocity.x += (targetVelocity.x - currentVelocity.x) * CONFIG.smoothFactor;
    currentVelocity.z += (targetVelocity.z - currentVelocity.z) * CONFIG.smoothFactor;

    // 3. 应用移动并检测碰撞
    const moveStep = delta;
    let nextX = camera.position.x + currentVelocity.x * moveStep;
    let nextZ = camera.position.z + currentVelocity.z * moveStep;
    
    // X轴碰撞
    if (!checkHouseCollision(new THREE.Vector3(nextX, camera.position.y, camera.position.z))) {
        currentVelocity.x = 0; // 撞墙停止
    } else {
        camera.position.x = nextX;
    }
    
    // Z轴碰撞
    if (!checkHouseCollision(new THREE.Vector3(camera.position.x, camera.position.y, nextZ))) {
        currentVelocity.z = 0;
    } else {
        camera.position.z = nextZ;
    }

    // 4. 重力与跳跃
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
    
    // 蹲下高度修正
    if (isCrouching && player.isGrounded) {
        camera.position.y = Math.max(camera.position.y, groundLevel);
    }
}

function updateGrid() {
    if (gridHelper && camera) {
        // 网格跟随玩家，制造无限地面的错觉
        const step = CONFIG.gridStep;
        gridHelper.position.x = Math.floor(camera.position.x / step) * step;
        gridHelper.position.z = Math.floor(camera.position.z / step) * step;
    }
    // 霓虹组也跟随？不，房子是固定的。如果需要无限世界，这里要特殊处理。
    // 当前设计：房子固定，网格移动。
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1); // 限制最大delta防止卡顿时飞出
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
