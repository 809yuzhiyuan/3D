import * as THREE from 'three';

// ==========================================
// 1. 配置与常量 (Configuration & Constants)
// 对应 C# 中的 GameConfig 类
// ==========================================
const GameConfig = {
    // --- 窗口与渲染设置 ---
    WindowWidth: window.innerWidth,
    WindowHeight: window.innerHeight,
    GridRadius: 5000,
    GridStep: 50,
    NearClip: 1.0,
    Fov: Math.PI / 4,

    // --- 玩家属性 ---
    PlayerHeightStand: 1.0,
    PlayerHeightCrouch: 0.5,
    PlayerRadius: 0.4,
    GroundY: 5.0,

    // --- 移动参数 ---
    WalkSpeed: 15.0,
    SprintSpeed: 50.0,
    CrouchSpeed: 1.6,
    JumpForce: 15.0,
    Gravity: 50.0,
    MouseSensitivity: 0.002,

    // --- 房子配置 ---
    HouseLength: 100.0,
    HouseHeight: 30.0,
    HouseDepth: 80.0,
    DoorWidth: 15.0,
    DoorHeight: 22.0,

    // 计算派生常量 (对应 C# static readonly)
    HouseCenter: new THREE.Vector3(0, 30.0 / 2, -20),
    SpawnPosition: new THREE.Vector3(0, 5.0 + 1.0, -40),
    SpawnYaw: Math.PI
};

// ==========================================
// 2. 全局状态变量 (Global State)
// 对应 C# Game3DWindow 类中的成员变量
// ==========================================

// --- 游戏状态 ---
// 枚举: MENU, PLAYING, PAUSED, SETTINGS, INVENTORY
let currentState = 'MENU'; 
let isMouseCaptured = false;
let isEKeyPressed = false; // E键防抖

// --- 玩家状态 ---
let cameraPos = new THREE.Vector3().copy(GameConfig.SpawnPosition);
let velocity = new THREE.Vector3(0, 0, 0);
let yaw = GameConfig.SpawnYaw;
let pitch = 0;
let isGrounded = true;
let isCrouching = false;

// --- 背包数据 ---
// 对应 C# InventoryItem 类
const inventory = [
    { name: "铁剑", color: 0xC0C0C0, isSelected: false },
    { name: "治疗药水", color: 0xFF0000, isSelected: false },
    { name: "地图", color: 0x8B4513, isSelected: false },
    { name: "钥匙", color: 0xFFD700, isSelected: false },
    { name: "盾牌", color: 0x808080, isSelected: false },
    { name: "食物", color: 0xFFA500, isSelected: false },
    { name: "宝石", color: 0x00FFFF, isSelected: false },
    { name: "卷轴", color: 0x800080, isSelected: false },
    { name: "空槽", color: 0x333333, isSelected: false }
];
let selectedSlotIndex = 0;
inventory[0].isSelected = true;

// --- 场景对象 ---
let scene, camera, renderer;
let houseLinesGroup;
let gridHelper;
let crosshair;
let uiContainer;

// --- 输入状态 ---
const keys = {
    w: false, s: false, a: false, d: false,
    space: false, shift: false, ctrl: false
};

// --- 计时器 ---
let prevTime = performance.now();

// ==========================================
// 3. 初始化 (Initialization)
// 对应 C# 构造函数
// ==========================================
init();
animate();

function init() {
    // 1. 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14); // 对应 C# Clear Color (10, 10, 20)
    scene.fog = new THREE.FogExp2(0x0a0a14, 0.0015);

    // 2. 创建相机
    camera = new THREE.PerspectiveCamera(
        GameConfig.Fov * 180 / Math.PI,
        GameConfig.WindowWidth / GameConfig.WindowHeight,
        GameConfig.NearClip,
        GameConfig.GridRadius
    );
    updateCameraRotation();

    // 3. 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(GameConfig.WindowWidth, GameConfig.WindowHeight);
    document.body.appendChild(renderer.domElement);

    // 4. 创建场景物体
    createHouseLines();
    createGrid();
    createCrosshair();
    createUI();

    // 5. 绑定事件监听
    const canvas = renderer.domElement;
    
    // 键盘事件
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // 鼠标事件
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', () => {
        if (currentState === 'PLAYING' && !isMouseCaptured) {
            canvas.requestPointerLock();
        }
    });
    
    // 指针锁定变化
    document.addEventListener('pointerlockchange', onPointerLockChange);
    
    // 窗口大小变化
    window.addEventListener('resize', onWindowResize);

    // 关闭页面时释放鼠标
    window.addEventListener('beforeunload', releaseMouse);
}

// ==========================================
// 4. 辅助功能 (Helper Functions)
// ==========================================

function resetPlayer() {
    cameraPos.copy(GameConfig.SpawnPosition);
    velocity.set(0, 0, 0);
    yaw = GameConfig.SpawnYaw;
    pitch = 0;
    isGrounded = true;
    isCrouching = false;
    updateCameraRotation();
}

function captureMouse(capture) {
    isMouseCaptured = capture;
    const canvas = renderer.domElement;
    if (capture) {
        canvas.requestPointerLock();
    } else {
        document.exitPointerLock();
    }
}

function releaseMouse() {
    document.exitPointerLock();
}

function onPointerLockChange() {
    const canvas = renderer.domElement;
    if (document.pointerLockElement === canvas) {
        isMouseCaptured = true;
    } else {
        isMouseCaptured = false;
        // 如果意外丢失锁定且正在游戏中，暂停游戏
        if (currentState === 'PLAYING') {
            currentState = 'PAUSED';
            updateUI();
        }
    }
}

function updateCameraRotation() {
    // 模拟 C# 中的 WorldToCamera 旋转逻辑，但直接应用于相机
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);
    
    // 更新准星位置
    if (crosshair) {
        crosshair.position.copy(cameraPos);
        crosshair.translateZ(-1); // 向前一点
    }
}

// ==========================================
// 5. 房子模块 (House Module)
// 对应 C# GenerateHouseLines
// ==========================================
function createHouseLines() {
    houseLinesGroup = new THREE.Group();
    scene.add(houseLinesGroup);

    const hl = GameConfig.HouseLength / 2;
    const hd = GameConfig.HouseDepth / 2;
    const hh = GameConfig.HouseHeight / 2;
    const c = GameConfig.HouseCenter;

    // 定义8个顶点
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

    // 12条边
    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffdc32, transparent: true, opacity: 0.8 });
    const doorMaterial = new THREE.LineBasicMaterial({ color: 0xff5050, transparent: true, opacity: 1.0 });

    edges.forEach(pair => {
        const points = [v[pair[0]], v[pair[1]]];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        houseLinesGroup.add(new THREE.Line(geometry, lineMaterial));
    });

    // 门框
    const groundY = c.y - hh;
    const doorTop = groundY + GameConfig.DoorHeight;
    const frontZ = c.z + hd;
    const dw = GameConfig.DoorWidth / 2;

    const dBL = new THREE.Vector3(c.x - dw, groundY, frontZ);
    const dBR = new THREE.Vector3(c.x + dw, groundY, frontZ);
    const dTL = new THREE.Vector3(c.x - dw, doorTop, frontZ);
    const dTR = new THREE.Vector3(c.x + dw, doorTop, frontZ);

    const doorEdges = [[dBL, dTL], [dTL, dTR], [dTR, dBR]];
    doorEdges.forEach(pair => {
        const geometry = new THREE.BufferGeometry().setFromPoints(pair);
        houseLinesGroup.add(new THREE.Line(geometry, doorMaterial));
    });
}

function createGrid() {
    const size = GameConfig.GridRadius * 2;
    const divisions = size / GameConfig.GridStep;
    // 对应 C# 中的网格颜色逻辑
    gridHelper = new THREE.GridHelper(size, divisions, 0x444444, 0x222222);
    gridHelper.position.y = 0;
    scene.add(gridHelper);
}

function createCrosshair() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 6); ctx.lineTo(16, 26);
    ctx.moveTo(6, 16); ctx.lineTo(26, 16);
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    crosshair = new THREE.Sprite(material);
    crosshair.scale.set(0.5, 0.5, 1);
    scene.add(crosshair);
}

// ==========================================
// 6. 碰撞检测 (Collision Detection)
// 对应 C# CheckHouseCollision 和 IsInDoorZone
// ==========================================
function checkHouseCollision(pos) {
    const hl = GameConfig.HouseLength / 2;
    const hd = GameConfig.HouseDepth / 2;
    const hh = GameConfig.HouseHeight / 2;
    const c = GameConfig.HouseCenter;

    const minX = c.x - hl, maxX = c.x + hl;
    const minZ = c.z - hd, maxZ = c.z + hd;
    const minY = c.y - hh, maxY = c.y + hh;

    // 高度豁免
    if (pos.y < minY - 5 || pos.y - GameConfig.PlayerHeightStand > maxY + 5) return false;

    // 包围盒豁免
    if (pos.x < minX - GameConfig.PlayerRadius || pos.x > maxX + GameConfig.PlayerRadius ||
        pos.z < minZ - GameConfig.PlayerRadius || pos.z > maxZ + GameConfig.PlayerRadius) return false;

    // 门口豁免
    const dw = GameConfig.DoorWidth / 2;
    const left = c.x - dw;
    const right = c.x + dw;
    const inX = pos.x > left - GameConfig.PlayerRadius && pos.x < right + GameConfig.PlayerRadius;
    const inZ = pos.z > maxZ - 2.0 && pos.z < maxZ + 2.0;
    if (inX && inZ) return false;

    // 墙壁判定
    const onSide = (pos.x <= minX + GameConfig.PlayerRadius || pos.x >= maxX - GameConfig.PlayerRadius);
    const onFrontBack = (pos.z <= minZ + GameConfig.PlayerRadius || pos.z >= maxZ - GameConfig.PlayerRadius);

    if (onSide && pos.z >= minZ - GameConfig.PlayerRadius && pos.z <= maxZ + GameConfig.PlayerRadius) return true;
    if (onFrontBack && pos.x >= minX - GameConfig.PlayerRadius && pos.x <= maxX + GameConfig.PlayerRadius) return true;

    return false;
}

// ==========================================
// 7. 物理与移动 (Physics & Movement)
// 对应 C# UpdatePhysics
// ==========================================
function updatePhysics(delta) {
    // 姿态处理
    if (keys.ctrl && !isCrouching) {
        isCrouching = true;
        cameraPos.y = Math.max(cameraPos.y, GameConfig.GroundY + GameConfig.PlayerHeightCrouch);
        velocity.y = 0;
    } else if (!keys.ctrl && isCrouching) {
        isCrouching = false;
        cameraPos.y = Math.max(cameraPos.y, GameConfig.GroundY + GameConfig.PlayerHeightStand);
    }

    const speed = isCrouching ? GameConfig.CrouchSpeed : (keys.shift ? GameConfig.SprintSpeed : GameConfig.WalkSpeed);

    // 方向计算
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const fwd = new THREE.Vector3(-sinY, 0, -cosY);
    const right = new THREE.Vector3(-cosY, 0, sinY);
    const move = new THREE.Vector3(0, 0, 0);

    if (keys.w) move.sub(fwd);
    if (keys.s) move.add(fwd);
    if (keys.a) move.add(right);
    if (keys.d) move.sub(right);

    const len = move.length();
    if (len > 0) {
        move.normalize().multiplyScalar(speed * delta);

        // 分轴碰撞检测
        let dx = move.x;
        let dz = move.z;

        const nextX = new THREE.Vector3(cameraPos.x + dx, cameraPos.y, cameraPos.z);
        if (checkHouseCollision(nextX)) dx = 0;

        const temp = new THREE.Vector3(cameraPos.x + dx, cameraPos.y, cameraPos.z);
        if (checkHouseCollision(temp)) { dx = 0; temp.x = cameraPos.x; }

        const nextZ = new THREE.Vector3(temp.x, cameraPos.y, temp.z + dz);
        if (checkHouseCollision(nextZ)) dz = 0;

        cameraPos.x += dx;
        cameraPos.z += dz;
    }

    // 跳跃与重力
    if (keys.space && isGrounded && !isCrouching) {
        velocity.y = GameConfig.JumpForce;
        isGrounded = false;
    }

    velocity.y -= GameConfig.Gravity * delta;
    cameraPos.y += velocity.y * delta;

    // 地面检测
    const targetH = isCrouching ? GameConfig.PlayerHeightCrouch : GameConfig.PlayerHeightStand;
    const groundLvl = GameConfig.GroundY + targetH;
    if (cameraPos.y <= groundLvl) {
        cameraPos.y = groundLvl;
        velocity.y = 0;
        isGrounded = true;
    }

    // 同步相机位置
    camera.position.copy(cameraPos);
}

// ==========================================
// 8. UI 系统 (UI System)
// 对应 C# UIButton, DrawInventoryUI, DrawOverlay 等
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '0';
    uiContainer.style.left = '0';
    uiContainer.style.width = '100%';
    uiContainer.style.height = '100%';
    uiContainer.style.pointerEvents = 'none';
    uiContainer.style.fontFamily = '"Microsoft YaHei", Arial, sans-serif';
    document.body.appendChild(uiContainer);
    updateUI();
}

function updateUI() {
    uiContainer.innerHTML = '';
    uiContainer.style.pointerEvents = (currentState === 'PLAYING') ? 'none' : 'auto';

    const createButton = (text, y, onClick) => {
        const btn = document.createElement('div');
        btn.innerText = text;
        btn.style.position = 'absolute';
        btn.style.left = '50%';
        btn.style.transform = 'translateX(-50%)';
        btn.style.top = y + 'px';
        btn.style.width = '200px';
        btn.style.height = '50px';
        btn.style.backgroundColor = 'rgba(40, 40, 40, 0.9)';
        btn.style.border = '2px solid #888';
        btn.style.color = '#ccc';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.fontSize = '24px';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = 'auto';
        btn.style.transition = 'all 0.2s';
        
        btn.onmouseenter = () => {
            btn.style.backgroundColor = 'rgba(60, 60, 60, 0.9)';
            btn.style.borderColor = '#fff';
            btn.style.color = '#fff';
        };
        btn.onmouseleave = () => {
            btn.style.backgroundColor = 'rgba(40, 40, 40, 0.9)';
            btn.style.borderColor = '#888';
            btn.style.color = '#ccc';
        };
        btn.onclick = (e) => { e.stopPropagation(); onClick(); };
        return btn;
    };

    if (currentState === 'MENU') {
        uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        const title = document.createElement('h1');
        title.innerText = "模块化 3D 引擎";
        title.style.color = '#FFD700';
        title.style.textAlign = 'center';
        title.style.position = 'absolute';
        title.style.top = '150px';
        title.style.width = '100%';
        title.style.fontSize = '48px';
        uiContainer.appendChild(title);
        uiContainer.appendChild(createButton("开始游戏", 300, startGame));
        uiContainer.appendChild(createButton("退出游戏", 370, () => window.close()));
    } 
    else if (currentState === 'PAUSED') {
        uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        const title = document.createElement('h1');
        title.innerText = "游戏暂停";
        title.style.color = '#FFD700';
        title.style.textAlign = 'center';
        title.style.position = 'absolute';
        title.style.top = '150px';
        title.style.width = '100%';
        title.style.fontSize = '48px';
        uiContainer.appendChild(title);
        uiContainer.appendChild(createButton("继续游戏", 250, resumeGame));
        uiContainer.appendChild(createButton("主页面", 320, goToMenu));
        uiContainer.appendChild(createButton("设置", 390, () => { currentState = 'SETTINGS'; updateUI(); }));
    }
    else if (currentState === 'SETTINGS') {
        uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        const title = document.createElement('h1');
        title.innerText = "设置";
        title.style.color = '#FFD700';
        title.style.textAlign = 'center';
        title.style.position = 'absolute';
        title.style.top = '150px';
        title.style.width = '100%';
        title.style.fontSize = '48px';
        uiContainer.appendChild(title);
        
        const demoText = document.createElement('div');
        demoText.innerText = "演示版本";
        demoText.style.color = '#fff';
        demoText.style.textAlign = 'center';
        demoText.style.position = 'absolute';
        demoText.style.top = '300px';
        demoText.style.width = '100%';
        demoText.style.fontSize = '16px';
        uiContainer.appendChild(demoText);

        uiContainer.appendChild(createButton("返回", 350, () => { currentState = 'PAUSED'; updateUI(); }));
    }
    else if (currentState === 'INVENTORY') {
        uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
        
        // 背包背景
        const invBox = document.createElement('div');
        invBox.style.position = 'absolute';
        invBox.style.left = '50%';
        invBox.style.top = '50%';
        invBox.style.transform = 'translate(-50%, -50%)';
        invBox.style.width = '600px';
        invBox.style.height = '400px';
        invBox.style.backgroundColor = 'rgba(20, 20, 20, 0.9)';
        invBox.style.border = '2px solid #FFD700';
        invBox.style.padding = '20px';
        invBox.style.display = 'flex';
        invBox.style.flexWrap = 'wrap';
        
        const title = document.createElement('div');
        title.innerText = "背包 (按 1-9 切换物品)";
        title.style.width = '100%';
        title.style.color = '#FFD700';
        title.style.fontSize = '24px';
        title.style.marginBottom = '20px';
        invBox.appendChild(title);

        inventory.forEach((item, index) => {
            const slot = document.createElement('div');
            slot.style.width = '70px';
            slot.style.height = '70px';
            slot.style.margin = '10px';
            slot.style.backgroundColor = item.isSelected ? 'rgba(100, 100, 100, 0.5)' : 'rgba(50, 50, 50, 0.5)';
            slot.style.border = item.isSelected ? '3px solid #fff' : '1px solid #888';
            slot.style.display = 'flex';
            slot.style.flexDirection = 'column';
            slot.style.alignItems = 'center';
            slot.style.justifyContent = 'center';
            slot.style.cursor = 'pointer';
            
            const hexColor = '#' + item.color.toString(16).padStart(6, '0');
            slot.style.color = hexColor;
            slot.style.fontSize = '14px';
            slot.style.textAlign = 'center';

            slot.innerHTML = `<span>${item.name}</span><span style="font-size:10px;color:#aaa">[${index + 1}]</span>`;
            
            slot.onclick = () => selectInventorySlot(index);
            invBox.appendChild(slot);
        });

        uiContainer.appendChild(invBox);

        // 底部提示
        const selectedItem = inventory[selectedSlotIndex];
        const hint = document.createElement('div');
        const hintColor = '#' + selectedItem.color.toString(16).padStart(6, '0');
        hint.innerText = `当前装备：${selectedItem.name}`;
        hint.style.position = 'absolute';
        hint.style.bottom = '20px';
        hint.style.left = '20px';
        hint.style.color = hintColor;
        hint.style.fontSize = '20px';
        hint.style.fontWeight = 'bold';
        hint.style.backgroundColor = 'rgba(0,0,0,0.6)';
        hint.style.padding = '5px 10px';
        uiContainer.appendChild(hint);
    }

    // 调试信息
    if (currentState === 'PLAYING' || currentState === 'INVENTORY') {
        const info = document.createElement('div');
        info.style.position = 'absolute';
        info.style.top = '10px';
        info.style.left = '10px';
        info.style.color = '#fff';
        info.style.fontSize = '14px';
        info.style.fontFamily = 'Arial';
        info.innerHTML = `
            位置：${cameraPos.x.toFixed(1)}, ${cameraPos.y.toFixed(1)}, ${cameraPos.z.toFixed(1)}<br>
            WASD:移动 | Shift:跑 | Ctrl:蹲 | Space:跳<br>
            E:背包 | 1-9:切换物品 | Esc:菜单
        `;
        uiContainer.appendChild(info);
    }
}

function startGame() {
    currentState = 'PLAYING';
    resetPlayer();
    updateUI();
    captureMouse(true);
}

function resumeGame() {
    currentState = 'PLAYING';
    updateUI();
    captureMouse(true);
}

function goToMenu() {
    currentState = 'MENU';
    captureMouse(false);
    updateUI();
}

function toggleInventory() {
    if (currentState !== 'PLAYING' && currentState !== 'INVENTORY') return;
    
    if (currentState === 'INVENTORY') {
        currentState = 'PLAYING';
        captureMouse(true);
    } else {
        currentState = 'INVENTORY';
        captureMouse(false);
    }
    updateUI();
}

function selectInventorySlot(index) {
    if (index < 0 || index >= inventory.length) return;
    inventory[selectedSlotIndex].isSelected = false;
    selectedSlotIndex = index;
    inventory[selectedSlotIndex].isSelected = true;
    if (currentState === 'INVENTORY') updateUI();
}

// ==========================================
// 9. 输入处理 (Input Handling)
// 对应 C# OnKeyDown, OnKeyUp, OnMouseMove
// ==========================================
function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space': keys.space = true; break;
        case 'ShiftLeft': keys.shift = true; break;
        case 'ControlLeft': keys.ctrl = true; break;
        
        case 'Escape':
            if (currentState === 'INVENTORY') toggleInventory();
            else if (currentState === 'PLAYING') {
                currentState = 'PAUSED';
                captureMouse(false);
                updateUI();
            } else if (currentState === 'PAUSED' || currentState === 'SETTINGS') {
                if (currentState === 'SETTINGS') currentState = 'PAUSED';
                else goToMenu();
                updateUI();
            } else if (currentState === 'MENU') {
                window.close(); // 浏览器可能阻止此操作
            }
            break;

        case 'KeyE':
            if (currentState === 'PLAYING' && !isEKeyPressed) {
                toggleInventory();
                isEKeyPressed = true;
            }
            break;

        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
        case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
            if (currentState === 'PLAYING' || currentState === 'INVENTORY') {
                const index = parseInt(event.code.replace('Digit', '')) - 1;
                selectInventorySlot(index);
            }
            break;
            
        case 'KeyO':
            if (currentState === 'PLAYING') {
                currentState = 'PAUSED';
                captureMouse(false);
                updateUI();
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyD': keys.d = false; break;
        case 'Space': keys.space = false; break;
        case 'ShiftLeft': keys.shift = false; break;
        case 'ControlLeft': keys.ctrl = false; break;
        case 'KeyE': isEKeyPressed = false; break;
    }
}

function onMouseMove(event) {
    if (currentState !== 'PLAYING' || !isMouseCaptured) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    if (movementX === 0 && movementY === 0) return;

    yaw += movementX * GameConfig.MouseSensitivity;
    pitch -= movementY * GameConfig.MouseSensitivity;
    pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));

    updateCameraRotation();
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// 10. 主循环 (Main Loop)
// 对应 C# GameLoop 和 OnPaint
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    prevTime = time;

    if (currentState === 'PLAYING') {
        updatePhysics(delta);
    }

    // 动态网格跟随玩家 (对应 C# 中的网格生成逻辑)
    if (gridHelper) {
        const step = GameConfig.GridStep;
        gridHelper.position.x = Math.floor(cameraPos.x / step) * step;
        gridHelper.position.z = Math.floor(cameraPos.z / step) * step;
    }

    // 渲染场景
    // 注意：Three.js 自动处理了 C# 中手动的 Project, ClipLine, Sort 等操作
    renderer.render(scene, camera);
}
