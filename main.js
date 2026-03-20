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

    // ✅【修复点 1】必须先创建相机，才能调用 resetPlayer
    camera = new THREE.PerspectiveCamera(CONFIG.fov * 180 / Math.PI, CONFIG.windowWidth / CONFIG.windowHeight, CONFIG.nearClip, CONFIG.gridRadius);
    
    // 2. 重置玩家位置 (此时 camera 已存在)
    resetPlayer();

    // 3. 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(CONFIG.windowWidth, CONFIG.windowHeight);
    document.body.appendChild(renderer.domElement);

    // 4. 创建场景物体 (房子网格)
    createHouseLines();
    
    // 5. 准星
    createCrosshair();

    // 6. UI 层
    createUI();

    // 7. 事件监听
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
        // 如果意外丢失锁定且在游戏中，可以选择自动暂停或忽略
    });
}

function resetPlayer() {
    // 防御性编程：确保 camera 存在
    if (!camera) return;
    
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
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
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
    uiContainer.style.pointerEvents = 'none'; 
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
        btn.style.pointerEvents = 'auto';
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
            e.stopPropagation();
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
        uiContainer.appendChild(createButton("退出游戏", 370, () => alert("请关闭浏览器标签页")));
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
        uiContainer.style.pointerEvents = 'auto'; // 允许点击

        // ✅【修复点 2】添加点击背景关闭背包的功能
        uiContainer.onclick = (e) => {
            if (e.target === uiContainer) {
                toggleInventory();
            }
        };

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
        // 防止点击背包盒子本身触发关闭
        invBox.onclick = (e) => e.stopPropagation(); 
        
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
            // 修复颜色转换可能出现的单字符问题
            const hexColor = item.color.toString(16).padStart(6, '0');
            slot.style.color = '#' + hexColor;
            slot.style.fontSize = '14px';
            slot.style.textAlign = 'center';
            slot.style.cursor = 'pointer';
            
            slot.innerHTML = `<span>${item.name}</span><span style="font-size:10px;color:gray">[${index + 1}]</span>`;
            
            slot.onclick = (e) => {
                e.stopPropagation();
                selectedSlotIndex = index;
                updateUI();
            };
            
            invBox.appendChild(slot);
        });

        uiContainer.appendChild(invBox);
        
        // 底部提示
        const hint = document.createElement('div');
        const hintColor = inventory[selectedSlotIndex].color.toString(16).padStart(6, '0');
        hint.innerText = `当前装备：${inventory[selectedSlotIndex].name}`;
        hint.style.position = 'absolute';
        hint.style.bottom = '20px';
        hint.style.left = '20px';
        hint.style.color = '#' + hintColor;
        hint.style.fontSize = '20px';
        hint.style.fontWeight = 'bold';
        hint.style.backgroundColor = 'rgba(0,0,0,0.5)';
        hint.style.padding = '5px 10px';
        hint.style.pointerEvents = 'none';
        uiContainer.appendChild(hint);
    }
    
    // 游戏中的 HUD
    if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.INVENTORY) {
        const info = document.createElement('div');
        info.style.position = 'absolute';
        info.style.top = '10px';
        info.style.left = '10px';
        info.style.color = 'white';
        info.style.fontSize = '14px';
        info.style.fontFamily = 'Arial';
        info.style.textShadow = '1px 1px 2px black';
        info.style.pointerEvents = 'none';
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
                // 浏览器限制无法直接关闭
            }
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
        case 'ControlLeft': 
            isCrouching = false; 
            break;
    }
}

function onMouseMove(event) {
    if (currentState !== GAME_STATE.PLAYING || !isMouseCaptured) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

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

function onMouseClick(event) {
    if (currentState === GAME_STATE.PLAYING && !isMouseCaptured) {
        document.body.requestPointerLock();
    }
}

function onWindowResize() {
    if (!camera || !renderer) return;
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

    if (pos.y < minY - 5 || pos.y - CONFIG.playerHeightStand > maxY + 5) return false;

    if (pos.x < minX - CONFIG.playerRadius || pos.x > maxX + CONFIG.playerRadius ||
        pos.z < minZ - CONFIG.playerRadius || pos.z > maxZ + CONFIG.playerRadius) return false;

    const dw = CONFIG.doorWidth / 2;
    const left = c.x - dw;
    const right = c.x + dw;
    const inX = pos.x > left - CONFIG.playerRadius && pos.x < right + CONFIG.playerRadius;
    const inZ = pos.z > maxZ - 2.0 && pos.z < maxZ + 2.0;
    if (inX && inZ) return false;

    const onSide = (pos.x <= minX + CONFIG.playerRadius || pos.x >= maxX - CONFIG.playerRadius);
    const onFrontBack = (pos.z <= minZ + CONFIG.playerRadius || pos.z >= maxZ - CONFIG.playerRadius);

    if (onSide && pos.z >= minZ - CONFIG.playerRadius && pos.z <= maxZ + CONFIG.playerRadius) return true;
    if (onFrontBack && pos.x >= minX - CONFIG.playerRadius && pos.x <= maxX + CONFIG.playerRadius) return true;

    return false;
}

function updatePhysics(delta) {
    if (currentState !== GAME_STATE.PLAYING) return;

    const targetHeight = isCrouching ? CONFIG.playerHeightCrouch : CONFIG.playerHeightStand;
    if (isCrouching) {
        camera.position.y = Math.max(camera.position.y, CONFIG.groundY + targetHeight);
    } else {
        if (player.isGrounded) {
             camera.position.y = CONFIG.groundY + targetHeight;
        }
    }

    const speed = isCrouching ? CONFIG.crouchSpeed : (isSprinting ? CONFIG.sprintSpeed : CONFIG.walkSpeed);

    player.direction.set(0, 0, 0);
    if (moveForward) player.direction.z -= 1;
    if (moveBackward) player.direction.z += 1;
    if (moveLeft) player.direction.x -= 1;
    if (moveRight) player.direction.x += 1;

    if (player.direction.lengthSq() > 0) {
        player.direction.normalize();
        
        const sinY = Math.sin(player.yaw);
        const cosY = Math.cos(player.yaw);
        
        const moveX = (player.direction.x * cosY - player.direction.z * sinY) * speed * delta;
        const moveZ = (player.direction.x * sinY + player.direction.z * cosY) * speed * delta;

        let nextX = camera.position.x + moveX;
        if (checkHouseCollision(new THREE.Vector3(nextX, camera.position.y, camera.position.z))) {
            // X 轴碰撞，禁止移动
        } else {
            camera.position.x += moveX;
        }
        
        let nextZ = camera.position.z + moveZ;
        if (checkHouseCollision(new THREE.Vector3(camera.position.x, camera.position.y, nextZ))) {
            // Z 轴碰撞，禁止移动
        } else {
            camera.position.z += moveZ;
        }
    }

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
    if (!gridHelper) {
        gridHelper = new THREE.GridHelper(CONFIG.gridRadius * 2, CONFIG.gridStep, 0x444444, 0x444444);
        gridHelper.position.y = 0;
        scene.add(gridHelper);
    }
    
    if (gridHelper && camera) {
        gridHelper.position.x = Math.floor(camera.position.x / CONFIG.gridStep) * CONFIG.gridStep;
        gridHelper.position.z = Math.floor(camera.position.z / CONFIG.gridStep) * CONFIG.gridStep;
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
        updateCameraRotation();
    }
    
    updateGrid();
    
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}
