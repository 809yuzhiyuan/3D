import * as THREE from 'three';

// ==========================================
// 1. 配置与常量 (Configuration & Constants)
// 完全对齐 C# GameConfig
// ==========================================
const CONFIG = {
    // 窗口
    width: 1280,
    height: 720,
    
    // 渲染
    fov: Math.PI / 4,
    nearClip: 1.0,
    farClip: 10000,
    bgColor: 0x0A0A14, // 深黑蓝
    fogColor: 0x0A0A14,
    fogDensity: 0.0005, // 模拟 C# 的手动雾效范围

    // 玩家
    playerHeightStand: 1.0,
    playerHeightCrouch: 0.5,
    playerRadius: 0.4,
    groundY: 5.0,
    
    // 移动
    walkSpeed: 15.0,
    sprintSpeed: 50.0,
    crouchSpeed: 1.6,
    jumpForce: 15.0,
    gravity: 50.0,
    mouseSensitivity: 0.002,

    // 房子
    houseLength: 100.0,
    houseHeight: 30.0,
    houseDepth: 80.0,
    doorWidth: 15.0,
    doorHeight: 22.0,
    
    // 坐标计算
    houseCenter: new THREE.Vector3(0, 15.0, -20.0), // HouseHeight / 2
    spawnPosition: new THREE.Vector3(0, 6.0, -40.0), // GroundY + PlayerHeightStand
    spawnYaw: Math.PI,

    // 颜色 (后朋克风格)
    colorWall: 0xFFDC32, // 霓虹黄
    colorDoor: 0xFF5050, // 警示红
    colorGrid: 0x444444, // 深灰
    colorUI: 0xFFD700,   // 金色
};

// ==========================================
// 2. 全局变量 (Global State)
// ==========================================
let camera, scene, renderer;
let linesGroup, gridHelper;
let crosshair;
let uiContainer;

// 玩家状态
const player = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: CONFIG.spawnYaw,
    pitch: 0,
    isGrounded: true,
    isCrouching: false
};

// 游戏状态
const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, INVENTORY: 3 };
let currentState = STATE.MENU;
let isMouseCaptured = false;

// 输入状态
const keys = { w: false, s: false, a: false, d: false, space: false, shift: false, ctrl: false };
let eKeyPressed = false; // 防抖

// 背包数据 (对齐 C#)
const inventory = [
    { name: "铁剑", color: 0xC0C0C0 },
    { name: "治疗药水", color: 0xFF0000 },
    { name: "地图", color: 0xA52A2A },
    { name: "钥匙", color: 0xFFD700 },
    { name: "盾牌", color: 0x808080 },
    { name: "食物", color: 0xFFA500 },
    { name: "宝石", color: 0x00FFFF },
    { name: "卷轴", color: 0x800080 },
    { name: "空槽", color: 0x333333 }
];
let selectedSlot = 0;

// 渲染列表 (用于画家算法排序)
let renderList = []; 

// ==========================================
// 3. 初始化 (Initialization)
// ==========================================
init();
animate();

function init() {
    // 场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bgColor);
    scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

    // 相机
    camera = new THREE.PerspectiveCamera(CONFIG.fov * 180 / Math.PI, window.innerWidth / window.innerHeight, CONFIG.nearClip, CONFIG.farClip);
    resetPlayer();

    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.NoToneMapping;
    document.body.appendChild(renderer.domElement);

    // 创建对象
    createWorld();
    createCrosshair();
    createUI();

    // 事件监听
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    
    renderer.domElement.addEventListener('click', () => {
        if (currentState === STATE.PLAYING && !isMouseCaptured) {
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        isMouseCaptured = (document.pointerLockElement === renderer.domElement);
    });
}

function resetPlayer() {
    player.pos.copy(CONFIG.spawnPosition);
    player.vel.set(0, 0, 0);
    player.yaw = CONFIG.spawnYaw;
    player.pitch = 0;
    player.isGrounded = true;
    player.isCrouching = false;
    updateCameraRotation();
}

// ==========================================
// 4. 世界构建 (World Generation)
// ==========================================
function createWorld() {
    linesGroup = new THREE.Group();
    scene.add(linesGroup);

    const hl = CONFIG.houseLength / 2;
    const hd = CONFIG.houseDepth / 2;
    const hh = CONFIG.houseHeight / 2;
    const c = CONFIG.houseCenter;

    // 8个顶点
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

    // 12条边 (墙体 - 黄色)
    const edges = [
        [0,1], [1,2], [2,3], [3,0],
        [4,5], [5,6], [6,7], [7,4],
        [0,4], [1,5], [2,6], [3,7]
    ];

    edges.forEach(([a, b]) => {
        addLine(v[a], v[b], CONFIG.colorWall, false);
    });

    // 门框 (红色) - 位于前墙 (maxZ)
    const groundY = c.y - hh;
    const doorTop = groundY + CONFIG.doorHeight;
    const frontZ = c.z + hd;
    const dw = CONFIG.doorWidth / 2;

    const dBL = new THREE.Vector3(c.x - dw, groundY, frontZ);
    const dBR = new THREE.Vector3(c.x + dw, groundY, frontZ);
    const dTL = new THREE.Vector3(c.x - dw, doorTop, frontZ);
    const dTR = new THREE.Vector3(c.x + dw, doorTop, frontZ);

    addLine(dBL, dTL, CONFIG.colorDoor, true);
    addLine(dTL, dTR, CONFIG.colorDoor, true);
    addLine(dTR, dBR, CONFIG.colorDoor, true);

    // 地面网格
    const size = 10000;
    const divs = size / 50; // GridStep = 50
    gridHelper = new THREE.GridHelper(size, divs, CONFIG.colorGrid, CONFIG.colorGrid);
    gridHelper.position.y = 0; // 地面 Y=0 (注意：C#中地面是0，但玩家逻辑基于GroundY=5，这里网格放在0即可)
    // 修正：C#中 GroundY=5，但网格生成逻辑是基于世界坐标的。
    // 为了视觉效果，我们将网格放在 Y=0，玩家站在 Y=5+Height。
    scene.add(gridHelper);
}

function addLine(p1, p2, color, isDoor) {
    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
        toneMapped: false,
        depthTest: true, 
        depthWrite: false, // 不写入深度，防止遮挡其他线条
        blending: THREE.NormalBlending
    });
    
    const line = new THREE.Line(geometry, material);
    line.userData = { isDoor: isDoor, originalColor: color };
    line.renderOrder = 999; // 高渲染顺序
    linesGroup.add(line);
    
    // 添加到手动排序列表 (用于画家算法辅助，虽然Three.js有ZBuffer，但排序有助于控制透明度混合)
    renderList.push(line);
}

function createCrosshair() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 16); ctx.lineTo(32, 24);
    ctx.moveTo(32, 40); ctx.lineTo(32, 48);
    ctx.moveTo(16, 32); ctx.lineTo(24, 32);
    ctx.moveTo(40, 32); ctx.lineTo(48, 32);
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, renderOrder: 9999, toneMapped: false });
    crosshair = new THREE.Sprite(material);
    crosshair.scale.set(0.5, 0.5, 1);
    scene.add(crosshair);
}

// ==========================================
// 5. 物理与碰撞 (Physics & Collision)
// 完全复刻 C# 的分轴检测和门洞逻辑
// ==========================================
function updatePhysics() {
    const dt = 0.016; // ~60FPS

    // 姿态处理
    if (keys.ctrl && !player.isCrouching) {
        player.isCrouching = true;
        player.pos.y = Math.max(player.pos.y, CONFIG.groundY + CONFIG.playerHeightCrouch);
        player.vel.y = 0;
    } else if (!keys.ctrl && player.isCrouching) {
        player.isCrouching = false;
        player.pos.y = Math.max(player.pos.y, CONFIG.groundY + CONFIG.playerHeightStand);
    }

    const speed = player.isCrouching ? CONFIG.crouchSpeed : (keys.shift ? CONFIG.sprintSpeed : CONFIG.walkSpeed);

    // 移动方向
    const sinY = Math.sin(player.yaw);
    const cosY = Math.cos(player.yaw);
    const fwd = new THREE.Vector3(-sinY, 0, -cosY);
    const right = new THREE.Vector3(-cosY, 0, sinY);
    
    const move = new THREE.Vector3(0, 0, 0);
    if (keys.w) move.sub(fwd);
    if (keys.s) move.add(fwd);
    if (keys.a) move.add(right);
    if (keys.d) move.sub(right);

    const len = move.length();
    if (len > 0) {
        move.normalize().multiplyScalar(speed * dt);

        // ✅ 分轴碰撞检测 (贴墙滑动)
        // 1. X轴
        const nextX = player.pos.clone();
        nextX.x += move.x;
        if (!checkHouseCollision(nextX)) {
            player.pos.x = nextX.x;
        }

        // 2. Z轴 (基于可能的X移动结果)
        const nextZ = player.pos.clone();
        nextZ.z += move.z;
        if (!checkHouseCollision(nextZ)) {
            player.pos.z = nextZ.z;
        }
    }

    // 跳跃与重力
    if (keys.space && player.isGrounded && !player.isCrouching) {
        player.vel.y = CONFIG.jumpForce;
        player.isGrounded = false;
    }

    player.vel.y -= CONFIG.gravity * dt;
    player.pos.y += player.vel.y * dt;

    const targetH = player.isCrouching ? CONFIG.playerHeightCrouch : CONFIG.playerHeightStand;
    const groundLvl = CONFIG.groundY + targetH;

    if (player.pos.y <= groundLvl) {
        player.pos.y = groundLvl;
        player.vel.y = 0;
        player.isGrounded = true;
    }
}

// ✅ 核心修复：精确的门洞碰撞逻辑 (复刻 C#)
function checkHouseCollision(pos) {
    const hl = CONFIG.houseLength / 2;
    const hd = CONFIG.houseDepth / 2;
    const hh = CONFIG.houseHeight / 2;
    const c = CONFIG.houseCenter;
    const r = CONFIG.playerRadius;

    const minX = c.x - hl;
    const maxX = c.x + hl;
    const minZ = c.z - hd;
    const maxZ = c.z + hd;
    const minY = c.y - hh;
    const maxY = c.y + hh;

    // 1. 高度豁免
    if (pos.y < minY || pos.y > maxY) return false;

    // 2. 门洞参数
    const dw = CONFIG.doorWidth / 2;
    const doorTop = minY + CONFIG.doorHeight;
    const frontZ = maxZ; // 前墙在 Z+

    // 3. 前墙特殊处理 (带门洞)
    if (Math.abs(pos.z - frontZ) < r) {
        // 如果高度低于门顶 且 X在门宽范围内 -> 是门洞，不碰撞
        if (pos.y < doorTop && pos.x > c.x - dw - r && pos.x < c.x + dw + r) {
            return false; // ✅ 这里是门
        }
        // 否则，如果是前墙的其他部分，则碰撞
        if (pos.x >= minX - r && pos.x <= maxX + r) return true;
    }

    // 4. 其他墙壁 (左、右、后)
    const insideX = pos.x > minX - r && pos.x < maxX + r;
    const insideZ = pos.z > minZ - r && pos.z < maxZ + r;

    if (insideX && insideZ) {
        if (pos.x <= minX + r || pos.x >= maxX - r) return true; // 左右墙
        if (pos.z <= minZ + r || pos.z >= maxZ - r) return true; // 后墙
    }

    return false;
}

function updateCameraRotation() {
    const euler = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
}

// ==========================================
// 6. 渲染循环 (Rendering)
// ==========================================
function updateGrid() {
    // 动态网格跟随 (优化性能)
    if (gridHelper) {
        const step = 50;
        gridHelper.position.x = Math.floor(player.pos.x / step) * step;
        gridHelper.position.z = Math.floor(player.pos.z / step) * step;
    }
}

function updateLinesVisibility() {
    // 模拟 C# 的雾效和暂停变暗
    const isDimmed = (currentState === STATE.PAUSED || currentState === STATE.INVENTORY);
    const dimFactor = isDimmed ? 0.3 : 1.0;
    const fogRange = 1500.0;

    // 按深度排序 (画家算法思想，确保透明度混合正确)
    // 注意：Three.js 的 LineSegments 通常不需要手动排序，但在透明模式下有帮助
    renderList.sort((a, b) => {
        const distA = a.position.distanceTo(camera.position);
        const distB = b.position.distanceTo(camera.position);
        return distB - distA; // 远到近
    });

    renderList.forEach(line => {
        const dist = line.position.distanceTo(camera.position);
        let alpha = Math.max(0.1, 1.0 - (dist / fogRange));
        alpha *= dimFactor;
        
        line.material.opacity = alpha;
        line.visible = (alpha > 0.05);
    });
}

function animate() {
    requestAnimationFrame(animate);

    if (currentState === STATE.PLAYING) {
        updatePhysics();
        updateCameraRotation();
    }

    // 准星跟随
    if (crosshair) {
        crosshair.position.copy(camera.position);
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        crosshair.position.add(dir.multiplyScalar(1.0));
    }

    updateGrid();
    updateLinesVisibility();

    renderer.render(scene, camera);
}

// ==========================================
// 7. 输入处理 (Input Handling)
// ==========================================
function onKeyDown(e) {
    switch(e.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space': keys.space = true; break;
        case 'ShiftLeft': keys.shift = true; break;
        case 'ControlLeft': keys.ctrl = true; break;
        
        case 'Escape':
            if (currentState === STATE.INVENTORY) toggleInventory();
            else if (currentState === STATE.PLAYING) { currentState = STATE.PAUSED; document.exitPointerLock(); updateUI(); }
            else if (currentState === STATE.PAUSED) goToMenu();
            break;
            
        case 'KeyE':
            if (currentState === STATE.PLAYING && !eKeyPressed) {
                toggleInventory();
                eKeyPressed = true;
            }
            break;
            
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': 
        case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
            const idx = parseInt(e.code.replace('Digit', '')) - 1;
            if (idx >= 0 && idx < inventory.length) {
                selectedSlot = idx;
                if (currentState === STATE.INVENTORY) updateUI();
            }
            break;
    }
}

function onKeyUp(e) {
    switch(e.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyD': keys.d = false; break;
        case 'Space': keys.space = false; break;
        case 'ShiftLeft': keys.shift = false; break;
        case 'ControlLeft': keys.ctrl = false; break;
        case 'KeyE': eKeyPressed = false; break;
    }
}

function onMouseMove(e) {
    if (currentState !== STATE.PLAYING || !isMouseCaptured) return;
    
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    
    player.yaw += dx * CONFIG.mouseSensitivity;
    player.pitch -= dy * CONFIG.mouseSensitivity;
    player.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, player.pitch));
    
    updateCameraRotation();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// 8. UI 系统 (UI System)
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, {
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', fontFamily: '"Courier New", monospace', color: '#FFF'
    });
    document.body.appendChild(uiContainer);
    updateUI();
}

function updateUI() {
    uiContainer.innerHTML = '';
    uiContainer.style.pointerEvents = (currentState === STATE.MENU || currentState === STATE.PAUSED || currentState === STATE.INVENTORY) ? 'auto' : 'none';

    // 调试信息 (始终显示)
    if (currentState === STATE.PLAYING || currentState === STATE.INVENTORY) {
        const info = document.createElement('div');
        Object.assign(info.style, { position: 'absolute', top: '10px', left: '10px', fontSize: '14px', color: '#AAA' });
        info.innerHTML = `POS: ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}<br>` +
                         `WASD:Move | SHIFT:Run | CTRL:Crouch | SPACE:Jump<br>` +
                         `E:Bag | 1-9:Items | ESC:Menu`;
        uiContainer.appendChild(info);
    }

    if (currentState === STATE.MENU) {
        uiContainer.style.backgroundColor = 'rgba(0,0,0,0.8)';
        drawOverlay("MODULAR 3D ENGINE", [
            { text: "START GAME", action: startGame },
            { text: "QUIT", action: () => window.close() }
        ]);
    } else if (currentState === STATE.PAUSED) {
        uiContainer.style.backgroundColor = 'rgba(0,0,0,0.6)';
        drawOverlay("PAUSED", [
            { text: "RESUME", action: resumeGame },
            { text: "MAIN MENU", action: goToMenu }
        ]);
    } else if (currentState === STATE.INVENTORY) {
        uiContainer.style.backgroundColor = 'rgba(0,0,0,0.85)';
        drawInventory();
    }
}

function drawOverlay(title, buttons) {
    const titleEl = document.createElement('h1');
    titleEl.innerText = title;
    Object.assign(titleEl.style, {
        textAlign: 'center', marginTop: '150px', fontSize: '48px', color: '#FFD700',
        textShadow: '2px 2px 4px #000', margin: '0'
    });
    uiContainer.appendChild(titleEl);

    buttons.forEach((btn, i) => {
        const el = document.createElement('div');
        el.innerText = btn.text;
        Object.assign(el.style, {
            display: 'block', width: '200px', margin: '20px auto', padding: '15px',
            border: '2px solid #FFF', color: '#DDD', textAlign: 'center',
            cursor: 'pointer', backgroundColor: '#222', fontSize: '20px',
            transition: 'all 0.2s'
        });
        el.onmouseenter = () => { el.style.backgroundColor = '#FFF'; el.style.color = '#000'; };
        el.onmouseleave = () => { el.style.backgroundColor = '#222'; el.style.color = '#DDD'; };
        el.onclick = btn.action;
        uiContainer.appendChild(el);
    });
}

function drawInventory() {
    const box = document.createElement('div');
    Object.assign(box.style, {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '600px', minHeight: '400px', border: '2px solid #FFD700',
        backgroundColor: 'rgba(20, 20, 20, 0.9)', padding: '20px', display: 'flex', flexWrap: 'wrap'
    });
    
    const title = document.createElement('div');
    title.innerText = "INVENTORY (Press 1-9)";
    Object.assign(title.style, { width: '100%', color: '#FFD700', fontSize: '24px', marginBottom: '20px', fontWeight: 'bold' });
    box.appendChild(title);

    inventory.forEach((item, i) => {
        const slot = document.createElement('div');
        const isSelected = (i === selectedSlot);
        Object.assign(slot.style, {
            width: '70px', height: '70px', margin: '10px',
            border: isSelected ? '3px solid #FFF' : '1px solid #666',
            backgroundColor: isSelected ? '#444' : '#222',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: '#' + item.color.toString(16).padStart(6, '0'),
            cursor: 'pointer', fontSize: '12px', textAlign: 'center'
        });
        slot.innerHTML = `<div style="font-size:20px">■</div><div>${item.name}</div><div style="color:#666">[${i+1}]</div>`;
        slot.onclick = () => { selectedSlot = i; updateUI(); };
        box.appendChild(slot);
    });

    const hint = document.createElement('div');
    hint.innerText = `> EQUIPPED: ${inventory[selectedSlot].name}`;
    Object.assign(hint.style, {
        position: 'absolute', bottom: '20px', left: '20px', color: '#' + inventory[selectedSlot].color.toString(16).padStart(6, '0'),
        fontSize: '18px', fontWeight: 'bold'
    });

    uiContainer.appendChild(box);
    uiContainer.appendChild(hint);
    
    // 点击背景关闭
    uiContainer.onclick = (e) => { if (e.target === uiContainer) toggleInventory(); };
}

function startGame() {
    currentState = STATE.PLAYING;
    resetPlayer();
    updateUI();
    setTimeout(() => renderer.domElement.requestPointerLock(), 50);
}

function resumeGame() {
    currentState = STATE.PLAYING;
    updateUI();
    setTimeout(() => renderer.domElement.requestPointerLock(), 50);
}

function goToMenu() {
    currentState = STATE.MENU;
    document.exitPointerLock();
    updateUI();
}

function toggleInventory() {
    if (currentState === STATE.PLAYING) {
        currentState = STATE.INVENTORY;
        document.exitPointerLock();
    } else if (currentState === STATE.INVENTORY) {
        currentState = STATE.PLAYING;
        setTimeout(() => renderer.domElement.requestPointerLock(), 50);
    }
    updateUI();
}
