import * as THREE from 'three';

// ==========================================
// 1. 配置与常量 (Configuration & Constants)
// ==========================================
const CONFIG = {
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    gridRadius: 5000,
    gridStep: 50,
    nearClip: 1.0,
    fov: Math.PI / 4,
    
    // 玩家属性
    playerHeightStand: 1.0,
    playerHeightCrouch: 0.5,
    playerRadius: 0.4,
    groundY: 5.0,
    
    // 移动参数
    walkSpeed: 15.0,
    sprintSpeed: 50.0,
    crouchSpeed: 1.6,
    jumpForce: 15.0,
    gravity: 50.0,
    mouseSensitivity: 0.002,
    
    // 房子配置
    houseLength: 100.0,
    houseHeight: 30.0,
    houseDepth: 80.0,
    doorWidth: 15.0,
    doorHeight: 22.0,
    
    houseCenter: new THREE.Vector3(0, 15, -20), // HouseHeight / 2
    spawnPosition: new THREE.Vector3(0, 6, -40), // GroundY + PlayerHeightStand
    spawnYaw: Math.PI
};

// ==========================================
// 2. 全局变量 (Global State)
// ==========================================
let camera, scene, renderer;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false;
let isSprinting = false;
let isCrouching = false;

// 玩家状态
const player = {
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    yaw: CONFIG.spawnYaw,
    pitch: 0,
    isGrounded: true
};

// 游戏状态
const GAME_STATE = {
    MENU: 0,
    PLAYING: 1,
    PAUSED: 2,
    INVENTORY: 3
};
let currentState = GAME_STATE.MENU;
let isMouseCaptured = false;

// 背包数据
const inventory = [
    { name: "铁剑", color: 0xC0C0C0 },
    { name: "治疗药水", color: 0xFF0000 },
    { name: "地图", color: 0x8B4513 },
    { name: "钥匙", color: 0xFFD700 },
    { name: "盾牌", color: 0x808080 },
    { name: "食物", color: 0xFFA500 },
    { name: "宝石", color: 0x00FFFF },
    { name: "卷轴", color: 0x800080 },
    { name: "空槽", color: 0x333333 }
];
let selectedSlotIndex = 0;

// 场景对象
let houseLinesGroup;
let gridHelper;
let crosshair;
let uiContainer;

// 时间控制
let prevTime = performance.now();

// ==========================================
// 3. 初始化 (Initialization)
// ==========================================
init();
animate();

function init() {
    // 1. 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14); // 深蓝色背景
    scene.fog = new THREE.FogExp2(0x0a0a14, 0.0002);

    // 2. 创建相机
    camera = new THREE.PerspectiveCamera(CONFIG.fov * 180 / Math.PI, CONFIG.windowWidth / CONFIG.windowHeight, CONFIG.nearClip, CONFIG.gridRadius);
    resetPlayer();

    // 3. 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(CONFIG.windowWidth, CONFIG.windowHeight);
    document.body.appendChild(renderer.domElement);

    // 4. 创建场景物体 (房子网格)
    createHouseLines();
    
    // 5. 创建地面网格 (动态更新在 animate 中处理，这里先创建一个占位)
    // 为了性能，我们手动绘制线条而不是用 GridHelper，以匹配 C# 逻辑
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5 });
    // 初始网格会在 animate 中根据相机位置动态生成
    
    // 6. 准星
    createCrosshair();

    // 7. UI 层
    createUI();

    // 8. 事件监听
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onMouseClick);
    window.addEventListener('resize', onWindowResize);
    
    // 指针锁定处理
    renderer.domElement.addEventListener('click', () => {
        if (currentState === GAME_STATE.PLAYING && !isMouseCaptured) {
            document.body.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        isMouseCaptured = document.pointerLockElement === renderer.domElement;
        if (!isMouseCaptured && currentState === GAME_STATE.PLAYING) {
            // 如果意外丢失锁定且在游戏中，暂停
            // currentState = GAME_STATE.PAUSED; 
            // updateUI();
        }
    });
}

function resetPlayer() {
    camera.position.copy(CONFIG.spawnPosition);
    player.yaw = CONFIG.spawnYaw;
    player.pitch = 0;
    player.velocity.set(0, 0, 0);
    player.isGrounded = true;
    updateCameraRotation();
}

// ==========================================
// 4. 场景构建 (Scene Building)
// ==========================================
function createHouseLines() {
    houseLinesGroup = new THREE.Group();
    scene.add(houseLinesGroup);

    const hl = CONFIG.houseLength / 2;
    const hd = CONFIG.houseDepth / 2;
    const hh = CONFIG.houseHeight / 2;
    const c = CONFIG.houseCenter;

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

    // 12条边 (黄色)
    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffdc32 }); // 黄色
    const doorMaterial = new THREE.LineBasicMaterial({ color: 0xff5050 }); // 红色

    edges.forEach(pair => {
        const points = [v[pair[0]], v[pair[1]]];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        houseLinesGroup.add(line);
    });

    // 门框 (红色)
    const groundY = c.y - hh;
    const doorTop = groundY + CONFIG.doorHeight;
    const frontZ = c.z + hd;
    const dw = CONFIG.doorWidth / 2;

    const dBL = new THREE.Vector3(c.x - dw, groundY, frontZ);
    const dBR = new THREE.Vector3(c.x + dw, groundY, frontZ);
    const dTL = new THREE.Vector3(c.x - dw, doorTop, frontZ);
    const dTR = new THREE.Vector3(c.x + dw, doorTop, frontZ);

    const doorEdges = [
        [dBL, dTL], [dTL, dTR], [dTR, dBR]
    ];

    doorEdges.forEach(pair => {
        const geometry = new THREE.BufferGeometry().setFromPoints(pair);
        const line = new THREE.Line(geometry, doorMaterial);
        houseLinesGroup.add(line);
    });
}

function createCrosshair() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 6); ctx.lineTo(16, 26);
    ctx.moveTo(6, 16); ctx.lineTo(26, 16);
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    crosshair = new THREE.Sprite(material);
    crosshair.scale.set(0.5, 0.5, 1);
    scene.add(crosshair);
}

// ==========================================
// 5. UI 系统 (UI System)
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '0';
    uiContainer.style.left = '0';
    uiContainer.style.width = '100%';
    uiContainer.style.height = '100%';
    uiContainer.style.pointerEvents = 'none'; // 默认不拦截鼠标，让点击穿透到 Canvas
    uiContainer.style.fontFamily = '"Microsoft YaHei", Arial, sans-serif';
    document.body.appendChild(uiContainer);

    updateUI();
}

function updateUI() {
    uiContainer.innerHTML = '';
    
    // 辅助函数：创建按钮
    const createButton = (text, y, onClick) => {
        const btn = document.createElement('div');
        btn.innerText = text;
        btn.style.position = 'absolute';
        btn.style.left = '50%';
        btn.style.transform = 'translateX(-50%)';
        btn.style.top = y + 'px';
        btn.style.width = '200px';
        btn.style.height = '50px';
        btn.style.backgroundColor = 'rgba(40, 40, 40, 0.8)';
        btn.style.border = '2px solid gray';
        btn.style.color = 'lightgray';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.fontSize = '24px';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = 'auto'; // 按钮需要接收点击
        btn.onmouseenter = () => {
            btn.style.backgroundColor = 'rgba(60, 60, 60, 0.9)';
            btn.style.borderColor = 'white';
            btn.style.color = 'white';
        };
        btn.onmouseleave = () => {
            btn.style.backgroundColor = 'rgba(40, 40, 40, 0.8)';
            btn.style.borderColor = 'gray';
            btn.style.color = 'lightgray';
        };
        btn.onclick = (e) => {
            e.stopPropagation(); // 防止触发 Canvas 点击
            onClick();
        };
        return btn;
    };

    // 菜单
    if (currentState === GAME_STATE.MENU) {
        uiContainer.style.backgroundColor = 'rgba(0,0,0,0.7)';
        uiContainer.style.pointerEvents = 'auto';
        
        const title = document.createElement('h1');
        title.innerText = "模块化 3D 引擎";
        title.style.color = 'gold';
        title.style.textAlign = 'center';
        title.style.position = 'absolute';
        title.style.top = '150px';
        title.style.width = '100%';
        title.style.fontSize = '48px';
        title.style.margin = '0';
        uiContainer.appendChild(title);

        uiContainer.appendChild(createButton("开始游戏", 300, startGame));
        uiContainer.appendChild(createButton("退出游戏", 370, () => window.close())); // 浏览器不能真正关闭，仅作演示
    } 
    // 暂停菜单
    else if (currentState === GAME_STATE.PAUSED) {
        uiContainer.style.backgroundColor = 'rgba(0,0,0,0.5)';
        uiContainer.style.pointerEvents = 'auto';
        
        const title = document.createElement('h1');
        title.innerText = "游戏暂停";
        title.style.color = 'white';
        title.style.textAlign = 'center';
        title.style.position = 'absolute';
        title.style.top = '150px';
        title.style.width = '100%';
        title.style.fontSize = '48px';
        uiContainer.appendChild(title);

        uiContainer.appendChild(createButton("继续游戏", 250, resumeGame));
        uiContainer.appendChild(createButton("主页面", 320, goToMenu));
        uiContainer.appendChild(createButton("设置", 390, () => alert("设置功能演示")));
    }
    // 背包界面
    else if (currentState === GAME_STATE.INVENTORY) {
        uiContainer.style.backgroundColor = 'rgba(0,0,0,0.3)';
        uiContainer.style.pointerEvents = 'auto';

        const invBox = document.createElement('div');
        invBox.style.position = 'absolute';
        invBox.style.left = '50%';
        invBox.style.top = '50%';
        invBox.style.transform = 'translate(-50%, -50%)';
        invBox.style.width = '600px';
        invBox.style.height = '400px';
        invBox.style.backgroundColor = 'rgba(20, 20, 20, 0.9)';
        invBox.style.border = '2px solid gold';
        invBox.style.display = 'flex';
        invBox.style.flexWrap = 'wrap';
        invBox.style.padding = '20px';
        invBox.style.boxSizing = 'border-box';
        
        const title = document.createElement('div');
        title.innerText = "背包 (按 1-9 切换物品)";
        title.style.width = '100%';
        title.style.color = 'gold';
        title.style.fontSize = '24px';
        title.style.marginBottom = '20px';
        title.style.textAlign = 'center';
        invBox.appendChild(title);

        inventory.forEach((item, index) => {
            const slot = document.createElement('div');
            slot.style.width = '70px';
            slot.style.height = '70px';
            slot.style.margin = '10px';
            slot.style.backgroundColor = index === selectedSlotIndex ? 'rgba(100, 100, 100, 0.5)' : 'rgba(50, 50, 50, 0.5)';
            slot.style.border = index === selectedSlotIndex ? '3px solid white' : '1px solid gray';
            slot.style.display = 'flex';
            slot.style.flexDirection = 'column';
            slot.style.alignItems = 'center';
            slot.style.justifyContent = 'center';
            slot.style.color = '#' + item.color.toString(16).padStart(6, '0');
            slot.style.fontSize = '14px';
            slot.style.textAlign = 'center';
            slot.style.cursor = 'pointer';
            
            slot.innerHTML = `<span>${item.name}</span><span style="font-size:10px;color:gray">[${index + 1}]</span>`;
            
            slot.onclick = () => {
                selectedSlotIndex = index;
                updateUI();
            };
            
            invBox.appendChild(slot);
        });

        uiContainer.appendChild(invBox);
        
        // 底部提示
        const hint = document.createElement('div');
        hint.innerText = `当前装备：${inventory[selectedSlotIndex].name}`;
        hint.style.position = 'absolute';
        hint.style.bottom = '20px';
        hint.style.left = '20px';
        hint.style.color = '#' + inventory[selectedSlotIndex].color.toString(16).padStart(6, '0');
        hint.style.fontSize = '20px';
        hint.style.fontWeight = 'bold';
        hint.style.backgroundColor = 'rgba(0,0,0,0.5)';
        hint.style.padding = '5px 10px';
        uiContainer.appendChild(hint);
    }
    
    // 游戏中的 HUD (始终显示在游戏状态)
    if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.INVENTORY) {
        const info = document.createElement('div');
        info.style.position = 'absolute';
        info.style.top = '10px';
        info.style.left = '10px';
        info.style.color = 'white';
        info.style.fontSize = '14px';
        info.style.fontFamily = 'Arial';
        info.style.textShadow = '1px 1px 2px black';
        info.innerHTML = `
            位置：${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}<br>
            WASD:移动 | Shift:跑 | Ctrl:蹲 | Space:跳<br>
            E:背包 | 1-9:切换物品 | Esc:菜单
        `;
        uiContainer.appendChild(info);
    }
}

function startGame() {
    currentState = GAME_STATE.PLAYING;
    resetPlayer();
    document.body.requestPointerLock();
    updateUI();
}

function resumeGame() {
    currentState = GAME_STATE.PLAYING;
    document.body.requestPointerLock();
    updateUI();
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
        document.body.requestPointerLock();
    }
    updateUI();
}

// ==========================================
// 6. 输入处理 (Input Handling)
// ==========================================
function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
        case 'Space': 
            if (player.isGrounded && currentState === GAME_STATE.PLAYING && !isCrouching) {
                player.velocity.y = CONFIG.jumpForce;
                player.isGrounded = false;
            }
            break;
        case 'ShiftLeft': isSprinting = true; break;
        case 'ControlLeft': 
            if (!isCrouching) {
                isCrouching = true;
                // 蹲下时强制降低高度
                camera.position.y = Math.max(camera.position.y, CONFIG.groundY + CONFIG.playerHeightCrouch);
                player.velocity.y = 0;
            }
            break;
        case 'KeyE':
            if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.INVENTORY) {
                toggleInventory();
            }
            break;
        case 'Escape':
            if (currentState === GAME_STATE.INVENTORY) {
                toggleInventory();
            } else if (currentState === GAME_STATE.PLAYING) {
                currentState = GAME_STATE.PAUSED;
                document.exitPointerLock();
                updateUI();
            } else if (currentState === GAME_STATE.PAUSED) {
                goToMenu();
            } else if (currentState === GAME_STATE.MENU) {
                // 浏览器限制无法直接关闭，这里只做提示
                alert("按 F11 退出全屏，或直接关闭标签页");
            }
            break;
        // 数字键切换物品
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
        case 'ControlLeft': 
            isCrouching = false; 
            // 站立恢复高度逻辑在 updatePhysics 中处理
            break;
    }
}

function onMouseMove(event) {
    if (currentState !== GAME_STATE.PLAYING || !isMouseCaptured) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    player.yaw -= movementX * CONFIG.mouseSensitivity;
    player.pitch -= movementY * CONFIG.mouseSensitivity;

    // 限制垂直视角
    player.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, player.pitch));

    updateCameraRotation();
}

function updateCameraRotation() {
    // 欧拉角顺序 YXZ (先绕Y转，再绕X转)
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.set(player.pitch, player.yaw, 0);
    camera.quaternion.setFromEuler(euler);
    
    // 更新准星位置跟随相机
    crosshair.position.copy(camera.position);
    crosshair.translateZ(-1); // 稍微向前一点避免 z-fighting
}

function onMouseClick(event) {
    // UI 点击已经在 HTML 元素中处理，这里主要处理游戏内交互（如果有）
    if (currentState === GAME_STATE.PLAYING && !isMouseCaptured) {
        document.body.requestPointerLock();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// 7. 物理与碰撞 (Physics & Collision)
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

    // 高度豁免
    if (pos.y < minY - 5 || pos.y - CONFIG.playerHeightStand > maxY + 5) return false;

    // 包围盒豁免
    if (pos.x < minX - CONFIG.playerRadius || pos.x > maxX + CONFIG.playerRadius ||
        pos.z < minZ - CONFIG.playerRadius || pos.z > maxZ + CONFIG.playerRadius) return false;

    // 门口豁免
    const dw = CONFIG.doorWidth / 2;
    const left = c.x - dw;
    const right = c.x + dw;
    const inX = pos.x > left - CONFIG.playerRadius && pos.x < right + CONFIG.playerRadius;
    const inZ = pos.z > maxZ - 2.0 && pos.z < maxZ + 2.0;
    if (inX && inZ) return false;

    // 墙壁判定
    const onSide = (pos.x <= minX + CONFIG.playerRadius || pos.x >= maxX - CONFIG.playerRadius);
    const onFrontBack = (pos.z <= minZ + CONFIG.playerRadius || pos.z >= maxZ - CONFIG.playerRadius);

    if (onSide && pos.z >= minZ - CONFIG.playerRadius && pos.z <= maxZ + CONFIG.playerRadius) return true;
    if (onFrontBack && pos.x >= minX - CONFIG.playerRadius && pos.x <= maxX + CONFIG.playerRadius) return true;

    return false;
}

function updatePhysics(delta) {
    if (currentState !== GAME_STATE.PLAYING) return;

    // 姿态处理
    const targetHeight = isCrouching ? CONFIG.playerHeightCrouch : CONFIG.playerHeightStand;
    if (isCrouching) {
        camera.position.y = Math.max(camera.position.y, CONFIG.groundY + targetHeight);
    } else {
        // 站起时如果头顶有东西（简单处理：不允许穿过天花板），这里简化为直接恢复
        // 实际游戏中需要检测头顶碰撞
        if (player.isGrounded) {
             camera.position.y = CONFIG.groundY + targetHeight;
        }
    }

    const speed = isCrouching ? CONFIG.crouchSpeed : (isSprinting ? CONFIG.sprintSpeed : CONFIG.walkSpeed);

    // 计算移动方向
    player.direction.set(0, 0, 0);
    if (moveForward) player.direction.z -= 1;
    if (moveBackward) player.direction.z += 1;
    if (moveLeft) player.direction.x -= 1;
    if (moveRight) player.direction.x += 1;

    if (player.direction.lengthSq() > 0) {
        player.direction.normalize();
        
        // 将方向转换到世界坐标 (基于 Yaw)
        const sinY = Math.sin(player.yaw);
        const cosY = Math.cos(player.yaw);
        
        const moveX = (player.direction.x * cosY - player.direction.z * sinY) * speed * delta;
        const moveZ = (player.direction.x * sinY + player.direction.z * cosY) * speed * delta;

        // X 轴碰撞检测
        let nextX = camera.position.x + moveX;
        if (checkHouseCollision(new THREE.Vector3(nextX, camera.position.y, camera.position.z))) {
            moveX = 0;
        }
        
        // Z 轴碰撞检测
        let nextZ = camera.position.z + moveZ;
        if (checkHouseCollision(new THREE.Vector3(camera.position.x + moveX, camera.position.y, nextZ))) {
            moveZ = 0;
        }

        camera.position.x += moveX;
        camera.position.z += moveZ;
    }

    // 重力与跳跃
    player.velocity.y -= CONFIG.gravity * delta;
    camera.position.y += player.velocity.y * delta;

    const groundLevel = CONFIG.groundY + targetHeight;
    if (camera.position.y <= groundLevel) {
        camera.position.y = groundLevel;
        player.velocity.y = 0;
        player.isGrounded = true;
    } else {
        player.isGrounded = false;
    }
}

// ==========================================
// 8. 动态网格生成 (Dynamic Grid)
// ==========================================
function updateGrid() {
    // 清除旧网格 (简单做法：每次重绘前清空 group，或者重用几何体)
    // 为了性能和代码简洁，我们这里采用每帧重新创建线条的方式 (类似 C# 逻辑)
    // 优化：实际项目中应使用 InstancedMesh 或复用 BufferGeometry
    
    // 移除旧的网格线
    while(scene.children.length > 0){ 
        // 只移除我们添加的特定网格，保留房子和准星等
        // 这里为了简单，我们用一个专门的 Group 来管理网格
        break; 
    }
    
    // 由于 Three.js 移除对象比较耗时，我们改用一种更聪明的方法：
    // 创建一个大的静态网格，然后移动它？不，C# 逻辑是动态生成可见部分。
    // 为了完全复刻 C# 逻辑且保持性能，我们只在远处画线。
    
    // 简单实现：使用 Three.js 自带的 GridHelper 并移动它到玩家脚下
    if (!gridHelper) {
        gridHelper = new THREE.GridHelper(CONFIG.gridRadius * 2, CONFIG.gridStep, 0x444444, 0x444444);
        gridHelper.position.y = 0; // 地面 Y=0? C# 中地面是 Y=GroundY? 
        // C# 中 GroundY = 5.0f, 但房子中心 Y=15, 半径 15 -> 房子底部 Y=0.
        // 所以网格应该在 Y=0
        scene.add(gridHelper);
    }
    
    // 让网格跟随玩家 XZ 移动，产生无限地面的错觉
    if (gridHelper) {
        gridHelper.position.x = camera.position.x;
        gridHelper.position.z = camera.position.z;
        // 对齐网格步长
        gridHelper.position.x = Math.floor(gridHelper.position.x / CONFIG.gridStep) * CONFIG.gridStep;
        gridHelper.position.z = Math.floor(gridHelper.position.z / CONFIG.gridStep) * CONFIG.gridStep;
    }
}

// ==========================================
// 9. 主循环 (Main Loop)
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    prevTime = time;

    if (currentState === GAME_STATE.PLAYING) {
        updatePhysics(delta);
        updateCameraRotation(); // 确保准星跟随
    }
    
    updateGrid();

    // 雾效动态调整 (模拟 C# 中的 alpha 变化)
    // Three.js FogExp2 自动处理距离模糊
    
    renderer.render(scene, camera);
}
