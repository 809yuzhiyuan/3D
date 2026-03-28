import * as THREE from 'three';

// ==========================================
// 1. 配置 (Configuration)
// ==========================================
const CONFIG = {
    fov: 75,
    near: 0.1,
    far: 2000,
    bgColor: 0x050505,
    fogColor: 0x050505,
    fogDensity: 0.0015,

    // 玩家
    heightStand: 1.7,
    heightCrouch: 0.9,
    radius: 0.4,
    speedWalk: 12.0,
    speedRun: 35.0,
    speedCrouch: 2.0,
    jumpForce: 12.0,
    gravity: 40.0,
    sensitivity: 0.002, 

    // 房子
    count: 200,
    gridCols: 20,
    gridRows: 10,
    spacing: 150,
    w: 100, h: 90, d: 80,
    floorH: 30,
    doorW: 20, doorH: 24,

    // 颜色
    cWall: 0xFFFFFF,
    cDoor: 0xFF0055,
    cGrid: 0x00FFFF,
    cStair: 0xFFAA00
};

// ==========================================
// 2. 全局变量
// ==========================================
let camera, scene, renderer;
let linesGroup;
let crosshair;
let uiContainer;

// ✅ 新增：物品栏与UI控制变量
let inventoryOpen = false;
let selectedSlot = 0; // 当前选中物品索引
let mapVisible = false;
let notebookOpen = false;

// ✅ 新增：DOM元素引用
let mapElement = null;
let notebookElement = null;

const player = {
    pos: new THREE.Vector3(0, 2, 0),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    grounded: true,
    crouching: false
};

const keys = {
    w: false, a: false, s: false, d: false,
    space: false, shift: false, ctrl: false
};
let keyLocks = { e: false };

const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, INV: 3 };
let currentState = STATE.MENU;
let isLocked = false;

const houses = [];

// ==========================================
// 3. 初始化
// ==========================================
init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bgColor);
    scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

    camera = new THREE.PerspectiveCamera(CONFIG.fov, window.innerWidth / window.innerHeight, CONFIG.near, CONFIG.far);
    camera.position.copy(player.pos);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.NoToneMapping;
    document.body.appendChild(renderer.domElement);

    createWorld();
    createCrosshair();
    createUI(); // 创建主UI
    createSecondaryUI(); // ✅ 新增：创建地图和笔记本UI

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    
    renderer.domElement.addEventListener('click', () => {
        if (currentState === STATE.PLAYING && !isLocked) {
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        isLocked = (document.pointerLockElement === renderer.domElement);
    });

    renderer.render(scene, camera);
}

// ==========================================
// ✅ 新增函数：创建二级UI (地图和笔记本)
// ==========================================
function createSecondaryUI() {
    // --- 右上角小地图 (P键开关) ---
    mapElement = document.createElement('div');
    Object.assign(mapElement.style, {
        position: 'absolute',
        top: '10px',
        right: '10px',
        width: '180px',
        height: '180px',
        background: 'rgba(10, 10, 10, 0.8)',
        border: '2px solid #00FFFF',
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'none', // 默认隐藏
        fontFamily: 'monospace',
        color: '#0F0',
        pointerEvents: 'none', // 穿透点击
        zIndex: '1000'
    });
    mapElement.innerHTML = '<div style="text-align:center; font-size:12px; padding:4px; background:#000; border-bottom:1px solid #0F0">地图 [P]</div>';
    
    // 玩家标记点
    const playerDot = document.createElement('div');
    Object.assign(playerDot.style, {
        position: 'absolute',
        width: '6px',
        height: '6px',
        background: 'red',
        borderRadius: '50%',
        border: '1px solid white',
        transform: 'translate(-50%, -50%)',
        left: '50%',
        top: '50%'
    });
    mapElement.appendChild(playerDot);
    document.body.appendChild(mapElement);

    // --- 笔记本 (B键开关) ---
    notebookElement = document.createElement('div');
    Object.assign(notebookElement.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '80%',
        maxWidth: '600px',
        background: 'rgba(30, 30, 30, 0.95)',
        border: '3px solid #FFD700',
        borderRadius: '10px',
        padding: '20px',
        color: '#FFF',
        display: 'none', // 默认隐藏
        zIndex: '2000',
        pointerEvents: 'auto',
        boxShadow: '0 0 20px rgba(255, 215, 0, 0.5)'
    });
    notebookElement.innerHTML = `
        <h2 style="color:#FFD700; margin-top:0">笔记本 [B]</h2>
        <p>这里是笔记内容区域。你可以记录线索、密码或剧情提示。</p>
        <p style="color:#888; font-size:0.9em">按 B 键关闭</p>
    `;
    document.body.appendChild(notebookElement);
}

// ==========================================
// 4. 世界构建 (保持不变)
// ==========================================
function createWorld() {
    linesGroup = new THREE.Group();
    scene.add(linesGroup);

    const gridSize = 10000;
    const gridDivs = 400;
    const geoGrid = new THREE.GridHelper(gridSize, gridDivs, CONFIG.cGrid, CONFIG.cGrid);
    geoGrid.position.y = 0;
    
    const matGlow = new THREE.LineBasicMaterial({ color: CONFIG.cGrid, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending });
    const matBright = new THREE.LineBasicMaterial({ color: CONFIG.cGrid, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    
    const gridGlow = new THREE.LineSegments(geoGrid.geometry, matGlow);
    const gridBright = new THREE.LineSegments(geoGrid.geometry, matBright);
    gridBright.position.y = 0.1;
    
    scene.add(gridGlow, gridBright);

    const cols = CONFIG.gridCols;
    const rows = CONFIG.gridRows;
    const startX = -((cols * CONFIG.spacing) / 2) + CONFIG.spacing/2;
    const startZ = -((rows * CONFIG.spacing) / 2) + CONFIG.spacing/2;

    const houseGeoCache = createHouseGeometry();
    const doorGeoCache = createDoorGeometry();

    for (let i = 0; i < CONFIG.count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        
        const x = startX + col * CONFIG.spacing;
        const z = startZ + row * CONFIG.spacing;
        
        if (Math.abs(x) < 60 && Math.abs(z) < 60) continue;

        const house = {
            x, z,
            minX: x - CONFIG.w/2, maxX: x + CONFIG.w/2,
            minZ: z - CONFIG.d/2, maxZ: z + CONFIG.d/2,
            mesh: null, doorMesh: null
        };

        const mesh = new THREE.LineSegments(houseGeoCache, new THREE.LineBasicMaterial({ 
            color: CONFIG.cWall, transparent: true, opacity: 1, depthWrite: false, toneMapped: false 
        }));
        mesh.position.set(x, CONFIG.h/2, z);
        mesh.visible = false;
        linesGroup.add(mesh);
        house.mesh = mesh;

        const doorMesh = new THREE.LineSegments(doorGeoCache, new THREE.LineBasicMaterial({ 
            color: CONFIG.cDoor, depthWrite: false, toneMapped: false 
        }));
        doorMesh.position.set(x, 0, z);
        doorMesh.visible = false;
        linesGroup.add(doorMesh);
        house.doorMesh = doorMesh;

        houses.push(house);
    }
}

// ... (createHouseGeometry, createDoorGeometry, createCrosshair 保持不变) ...

// ==========================================
// 5. 物理与碰撞
// ==========================================
function updatePhysics() {
    const dt = 0.016;

    if (keys.ctrl && !player.crouching) {
        player.crouching = true;
        player.pos.y = Math.max(player.pos.y, CONFIG.heightCrouch);
        player.vel.y = 0;
    } else if (!keys.ctrl && player.crouching) {
        player.crouching = false;
        player.pos.y = Math.max(player.pos.y, CONFIG.heightStand);
    }

    const spd = player.crouching ? CONFIG.speedCrouch : (keys.shift ? CONFIG.speedRun : CONFIG.speedWalk);

    const sinY = Math.sin(player.yaw);
    const cosY = Math.cos(player.yaw);
    
    const fwd = new THREE.Vector3(-sinY, 0, -cosY); 
    const right = new THREE.Vector3(-cosY, 0, sinY);
    
    const move = new THREE.Vector3(0,0,0);

    if (keys.w) move.add(fwd);
    if (keys.s) move.sub(fwd);
    if (keys.a) move.add(right);
    if (keys.d) move.sub(right);

    const len = move.length();
    if (len > 0) {
        move.normalize().multiplyScalar(spd * dt);

        const nextX = player.pos.clone(); nextX.x += move.x;
        if (!checkCollision(nextX)) player.pos.x = nextX.x;

        const nextZ = player.pos.clone(); nextZ.z += move.z;
        if (!checkCollision(nextZ)) player.pos.z = nextZ.z;
    }

    if (keys.space && player.grounded && !player.crouching) {
        player.vel.y = CONFIG.jumpForce;
        player.grounded = false;
    }

    player.vel.y -= CONFIG.gravity * dt;
    player.pos.y += player.vel.y * dt;

    checkGroundAndStairs();
    camera.position.copy(player.pos);
}

// ... (checkCollision, checkGroundAndStairs, getStairHeightRobust 保持不变) ...

// ==========================================
// ✅ 新增/修改：输入处理
// ==========================================
function onKeyDown(e) {
    const code = e.code;
    
    // 原有的移动键
    if (code === 'KeyW') keys.w = true;
    if (code === 'KeyS') keys.s = true;
    if (code === 'KeyA') keys.a = true;
    if (code === 'KeyD') keys.d = true;
    if (code === 'Space') keys.space = true;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = true;
    if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = true;

    // 1. E键开关背包
    if (code === 'KeyE' && !keyLocks.e) {
        if (currentState === STATE.PLAYING || currentState === STATE.INV) {
            toggleInventory();
        }
        keyLocks.e = true;
    }

    // 2. O键暂停/继续
    if (code === 'KeyO') {
        if (currentState === STATE.PLAYING) {
            currentState = STATE.PAUSED;
            document.exitPointerLock();
            updateUI();
        } else if (currentState === STATE.PAUSED) {
            currentState = STATE.PLAYING;
            updateUI();
            renderer.domElement.requestPointerLock();
        }
    }

    // 3. P键开关地图
    if (code === 'KeyP') {
        mapVisible = !mapVisible;
        mapElement.style.display = mapVisible ? 'block' : 'none';
    }

    // 4. B键开关笔记本
    if (code === 'KeyB') {
        notebookOpen = !notebookOpen;
        notebookElement.style.display = notebookOpen ? 'block' : 'none';
        // 如果打开笔记本，尝试释放鼠标（如果在游戏状态下）
        if (notebookOpen && currentState === STATE.PLAYING) {
            document.exitPointerLock();
        }
        // 如果关闭笔记本且在暂停状态，尝试重新捕获
        if (!notebookOpen && currentState === STATE.PAUSED) {
            renderer.domElement.requestPointerLock();
        }
    }

    // ESC键逻辑 (保持原样，但需要兼容新状态)
    if (code === 'Escape') {
        if (notebookOpen) {
            // 如果笔记本开着，优先关笔记本
            notebookOpen = false;
            notebookElement.style.display = 'none';
            renderer.domElement.requestPointerLock();
        } else if (inventoryOpen) {
            // 如果背包开着，关背包
            toggleInventory();
        } else if (currentState === STATE.PLAYING) {
            currentState = STATE.PAUSED;
            document.exitPointerLock();
            updateUI();
        } else if (currentState === STATE.PAUSED) {
            currentState = STATE.MENU;
            updateUI();
        }
    }
}

// ✅ 新增：鼠标滚轮事件 (需要在init之后绑定)
document.addEventListener('wheel', (e) => {
    // 仅在游戏进行中且没有打开UI时生效
    if (currentState !== STATE.PLAYING || inventoryOpen || mapVisible || notebookOpen) return;
    
    e.preventDefault(); // 阻止页面滚动
    
    const maxSlots = 9; // 物品栏格子数
    if (e.deltaY < 0) {
        // 向上滚动：切到上一个物品
        selectedSlot = (selectedSlot - 1 + maxSlots) % maxSlots;
    } else {
        // 向下滚动：切到下一个物品
        selectedSlot = (selectedSlot + 1) % maxSlots;
    }
}, { passive: false });

function onKeyUp(e) {
    const code = e.code;
    if (code === 'KeyW') keys.w = false;
    if (code === 'KeyS') keys.s = false;
    if (code === 'KeyA') keys.a = false;
    if (code === 'KeyD') keys.d = false;
    if (code === 'Space') keys.space = false;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = false;
    if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = false;
    if (code === 'KeyE') keyLocks.e = false;
}

function onMouseMove(e) {
    if (currentState !== STATE.PLAYING || !isLocked || notebookOpen) return;
    player.yaw -= e.movementX * CONFIG.sensitivity;
    player.pitch -= e.movementY * CONFIG.sensitivity;
    player.pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, player.pitch));
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
}

// ==========================================
// ✅ 修改：UI 更新 (增加物品栏显示)
// ==========================================
function updateUI() {
    uiContainer.innerHTML = '';
    uiContainer.style.pointerEvents = (currentState === STATE.MENU || currentState === STATE.PAUSED || currentState === STATE.INV) ? 'auto' : 'none';

    if (currentState === STATE.PLAYING || currentState === STATE.INV) {
        let dirStr = "静止";
        if (keys.w) dirStr = "前进 ↑";
        if (keys.s) dirStr = "后退 ↓";
        if (keys.a) dirStr = "向左 ←";
        if (keys.d) dirStr = "向右 →";
        
        const info = document.createElement('div');
        Object.assign(info.style, { position:'absolute', top:'10px', left:'10px', fontSize:'14px', color:'#0F0', textShadow:'1px 1px 0 #000' });
        
        // ✅ 物品栏显示
        const items = ["撬棍", "胶带", "钥匙", "地图", "照片", "打火机", "纸条", "收音机", "空位"];
        const currentItem = items[selectedSlot] || "未知";
        
        const floor = Math.floor(player.pos.y / CONFIG.floorH) + 1;
        const keyStatus = (k) => k ? "<span style='color:#FFF'>ON</span>" : "<span style='color:#666'>OFF</span>";
        const runStatus = keys.shift ? "<span style='color:#FFD700'>加速跑</span>" : "步行";
        const crouchStatus = keys.ctrl ? "<span style='color:#FFD700'>下蹲</span>" : "站立";
        const mouseStatus = isLocked ? "<span style='color:#0F0'>已锁定</span>" : "<span style='color:#F00'>自由</span>";

        info.innerHTML = `
            坐标：${player.pos.x.toFixed(0)} ${player.pos.y.toFixed(0)} ${player.pos.z.toFixed(0)}<br>
            楼层：<strong>${floor}</strong><br>
            方向：<strong>${dirStr}</strong><br>
            物品：[<strong>${selectedSlot+1}</strong>] ${currentItem}<br>
            按键：W[${keyStatus(keys.w)}] S[${keyStatus(keys.s)}] A[${keyStatus(keys.a)}] D[${keyStatus(keys.d)}]<br>
            Shift [${runStatus}] | Ctrl [${crouchStatus}] | 空格 [${keys.space ? '跳跃' : '--'}]<br>
            鼠标：${mouseStatus} | 房屋总数：${CONFIG.count}
        `;
        uiContainer.appendChild(info);
    }

    // ... (菜单逻辑保持不变) ...
}

// ... (drawOverlay, drawInventory 保持不变) ...

// ==========================================
// ✅ 修改：背包开关逻辑
// ==========================================
function toggleInventory() {
    if (currentState === STATE.PLAYING) {
        currentState = STATE.INV;
        inventoryOpen = true;
        document.exitPointerLock();
    } else if (currentState === STATE.INV) {
        currentState = STATE.PLAYING;
        inventoryOpen = false;
        // 如果笔记本没开，尝试重新捕获鼠标
        if (!notebookOpen) {
            renderer.domElement.requestPointerLock();
        }
    }
    updateUI();
}

// ... (startGame, resumeGame, goToMenu 保持不变) ...
