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
    
    houseCenter: new THREE.Vector3(0, 15, -20),
    spawnPosition: new THREE.Vector3(0, 6, -40),
    spawnYaw: Math.PI,

    // ✅ 视觉优化配置 (原生兼容版)
    lineColorHouse: 0x00ffff, // 青色
    lineColorDoor: 0xffaa00,  // 橙色
    bgColor: 0x050508,        // 深空灰黑
    fogColor: 0x050508
};

// ==========================================
// 2. 全局变量 (Global State)
// ==========================================
let camera, scene, renderer;
// 移除了 composer，不再依赖后处理模块
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let isSprinting = false;
let isCrouching = false;

const player = {
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
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

let houseLinesGroup;
let gridHelper;
let crosshair;
let uiContainer;

let prevTime = performance.now();

// ==========================================
// 3. 初始化 (Initialization)
// ==========================================
init();
animate();

function init() {
    // 1. 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bgColor);
    // 增加雾效浓度，营造深邃感，掩盖远处的线条截断
    scene.fog = new THREE.FogExp2(CONFIG.fogColor, 0.0025); 

    // 2. 创建相机
    camera = new THREE.PerspectiveCamera(CONFIG.fov * 180 / Math.PI, CONFIG.windowWidth / CONFIG.windowHeight, CONFIG.nearClip, CONFIG.gridRadius);
    
    resetPlayer();

    // 3. 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true }); // 开启原生抗锯齿
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(CONFIG.windowWidth, CONFIG.windowHeight);
    // 开启色调映射，让亮色更自然
    renderer.toneMapping = THREE.ReinhardToneMapping;
    document.body.appendChild(renderer.domElement);

    // 4. 创建场景物体
    createHouseLines();
    createGrid();
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
    player.velocity.set(0, 0, 0);
    player.isGrounded = true;
    updateCameraRotation();
}

// ==========================================
// 4. 场景构建 (Scene Building) - ✅ 原生发光技巧
// ==========================================
function createHouseLines() {
    houseLinesGroup = new THREE.Group();
    scene.add(houseLinesGroup);

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

    // ✅ 技巧：使用 AdditiveBlending (加法混合) 让线条在重叠处变亮，模拟发光
    const lineMaterial = new THREE.LineBasicMaterial({ 
        color: CONFIG.lineColorHouse, 
        transparent: true, 
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false // 防止线条互相遮挡导致的闪烁
    });
    
    const doorMaterial = new THREE.LineBasicMaterial({ 
        color: CONFIG.lineColorDoor, 
        transparent: true, 
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    edges.forEach(pair => {
        const points = [v[pair[0]], v[pair[1]]];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        houseLinesGroup.add(line);
    });

    const groundY = c.y - hh;
    const doorTop = groundY + CONFIG.doorHeight;
    const frontZ = c.z + hd;
    const dw = CONFIG.doorWidth / 2;

    const dBL = new THREE.Vector3(c.x - dw, groundY, frontZ);
    const dBR = new THREE.Vector3(c.x + dw, groundY, frontZ);
    const dTL = new THREE.Vector3(c.x - dw, doorTop, frontZ);
    const dTR = new THREE.Vector3(c.x + dw, doorTop, frontZ);

    const doorEdges = [[dBL, dTL], [dTL, dTR], [dTR, dBR]];

    doorEdges.forEach(pair => {
        const geometry = new THREE.BufferGeometry().setFromPoints(pair);
        const line = new THREE.Line(geometry, doorMaterial);
        houseLinesGroup.add(line);
    });
}

function createGrid() {
    const size = CONFIG.gridRadius * 2;
    const divisions = CONFIG.gridRadius * 2 / CONFIG.gridStep;
    
    gridHelper = new THREE.GridHelper(size, divisions, 0x444444, 0x222222);
    gridHelper.position.y = 0;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.4;
    gridHelper.material.blending = THREE.AdditiveBlending;
    scene.add(gridHelper);
}

function createCrosshair() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    // 绘制发光准星
    ctx.strokeStyle = '#00ffff'; 
    ctx.lineWidth = 2;
    // Canvas 阴影模拟发光
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#00ffff';
    
    ctx.beginPath();
    ctx.moveTo(16, 6); ctx.lineTo(16, 26);
    ctx.moveTo(6, 16); ctx.lineTo(26, 16);
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false // 准星始终在最前
    });
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
    
    const createButton = (text, y, onClick) => {
        const btn = document.createElement('div');
        btn.innerText = text;
        btn.style.position = 'absolute';
        btn.style.left = '50%';
        btn.style.transform = 'translateX(-50%)';
        btn.style.top = y + 'px';
        btn.style.width = '200px';
        btn.style.height = '50px';
        btn.style.backgroundColor = 'rgba(10, 10, 15, 0.8)';
        btn.style.border = '1px solid #00ffff';
        btn.style.color = '#00ffff';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.fontSize = '24px';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = 'auto';
        btn.style.boxShadow = '0 0 10px rgba(0, 255, 255, 0.2)';
        btn.style.transition = 'all 0.3s';
        btn.style.textShadow = '0 0 5px rgba(0,255,255,0.5)';
        
        btn.onmouseenter = () => {
            btn.style.backgroundColor = 'rgba(0, 255, 255, 0.15)';
            btn.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.6)';
        };
        btn.onmouseleave = () => {
            btn.style.backgroundColor = 'rgba(10, 10, 15, 0.8)';
            btn.style.boxShadow = '0 0 10px rgba(0, 255, 255, 0.2)';
        };
        btn.onclick = (e) => {
            e.stopPropagation();
            onClick();
        };
        return btn;
    };

    if (currentState === GAME_STATE.MENU) {
        uiContainer.style.backgroundColor = 'rgba(5, 5, 8, 0.9)';
        uiContainer.style.pointerEvents = 'auto';
        
        const title = document.createElement('h1');
        title.innerText = "NEON ENGINE";
        title.style.color = '#00ffff';
        title.style.textAlign = 'center';
        title.style.position = 'absolute';
        title.style.top = '150px';
        title.style.width = '100%';
        title.style.fontSize = '64px';
        title.style.margin = '0';
        title.style.textShadow = '0 0 20px #00ffff';
        title.style.letterSpacing = '5px';
        uiContainer.appendChild(title);

        uiContainer.appendChild(createButton("START GAME", 300, startGame));
        uiContainer.appendChild(createButton("EXIT", 370, () => alert("Close Tab")));
    } 
    else if (currentState === GAME_STATE.PAUSED) {
        uiContainer.style.backgroundColor = 'rgba(5, 5, 8, 0.6)';
        uiContainer.style.pointerEvents = 'auto';
        
        const title = document.createElement('h1');
        title.innerText = "PAUSED";
        title.style.color = '#ffaa00';
        title.style.textAlign = 'center';
        title.style.position = 'absolute';
        title.style.top = '150px';
        title.style.width = '100%';
        title.style.fontSize = '48px';
        title.style.textShadow = '0 0 15px #ffaa00';
        uiContainer.appendChild(title);

        uiContainer.appendChild(createButton("RESUME", 250, resumeGame));
        uiContainer.appendChild(createButton("MENU", 320, goToMenu));
    }
    else if (currentState === GAME_STATE.INVENTORY) {
        uiContainer.style.backgroundColor = 'rgba(5, 5, 8, 0.4)';
        uiContainer.style.pointerEvents = 'auto';

        uiContainer.onclick = (e) => {
            if (e.target === uiContainer) toggleInventory();
        };

        const invBox = document.createElement('div');
        invBox.style.position = 'absolute';
        invBox.style.left = '50%';
        invBox.style.top = '50%';
        invBox.style.transform = 'translate(-50%, -50%)';
        invBox.style.width = '600px';
        invBox.style.height = '400px';
        invBox.style.backgroundColor = 'rgba(10, 10, 15, 0.95)';
        invBox.style.border = '2px solid #00ffff';
        invBox.style.boxShadow = '0 0 30px rgba(0, 255, 255, 0.3)';
        invBox.style.display = 'flex';
        invBox.style.flexWrap = 'wrap';
        invBox.style.padding = '20px';
        invBox.style.boxSizing = 'border-box';
        invBox.onclick = (e) => e.stopPropagation(); 
        
        const title = document.createElement('div');
        title.innerText = "INVENTORY";
        title.style.width = '100%';
        title.style.color = '#00ffff';
        title.style.fontSize = '24px';
        title.style.marginBottom = '20px';
        title.style.textAlign = 'center';
        title.style.textShadow = '0 0 10px #00ffff';
        invBox.appendChild(title);

        inventory.forEach((item, index) => {
            const slot = document.createElement('div');
            slot.style.width = '70px';
            slot.style.height = '70px';
            slot.style.margin = '10px';
            slot.style.backgroundColor = index === selectedSlotIndex ? 'rgba(0, 255, 255, 0.2)' : 'rgba(50, 50, 50, 0.5)';
            slot.style.border = index === selectedSlotIndex ? '2px solid #00ffff' : '1px solid #444';
            slot.style.boxShadow = index === selectedSlotIndex ? '0 0 15px rgba(0,255,255,0.4)' : 'none';
            slot.style.display = 'flex';
            slot.style.flexDirection = 'column';
            slot.style.alignItems = 'center';
            slot.style.justifyContent = 'center';
            const hexColor = item.color.toString(16).padStart(6, '0');
            slot.style.color = '#' + hexColor;
            slot.style.fontSize = '14px';
            slot.style.textAlign = 'center';
            slot.style.cursor = 'pointer';
            slot.style.transition = 'all 0.2s';
            
            slot.innerHTML = `<span>${item.name}</span><span style="font-size:10px;color:gray">[${index + 1}]</span>`;
            
            slot.onmouseenter = () => {
                if(index !== selectedSlotIndex) {
                    slot.style.borderColor = '#888';
                    slot.style.backgroundColor = 'rgba(80, 80, 80, 0.6)';
                }
            };
            slot.onmouseleave = () => {
                if(index !== selectedSlotIndex) {
                    slot.style.borderColor = '#444';
                    slot.style.backgroundColor = 'rgba(50, 50, 50, 0.5)';
                }
            };

            slot.onclick = (e) => {
                e.stopPropagation();
                selectedSlotIndex = index;
                updateUI();
            };
            invBox.appendChild(slot);
        });

        uiContainer.appendChild(invBox);
        
        const hint = document.createElement('div');
        const hintColor = inventory[selectedSlotIndex].color.toString(16).padStart(6, '0');
        hint.innerText = `EQUIPPED: ${inventory[selectedSlotIndex].name}`;
        hint.style.position = 'absolute';
        hint.style.bottom = '20px';
        hint.style.left = '20px';
        hint.style.color = '#' + hintColor;
        hint.style.fontSize = '20px';
        hint.style.fontWeight = 'bold';
        hint.style.backgroundColor = 'rgba(0,0,0,0.6)';
        hint.style.padding = '5px 10px';
        hint.style.border = `1px solid #${hintColor}`;
        hint.style.pointerEvents = 'none';
        uiContainer.appendChild(hint);
    }
    
    if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.INVENTORY) {
        const info = document.createElement('div');
        info.style.position = 'absolute';
        info.style.top = '10px';
        info.style.left = '10px';
        info.style.color = 'rgba(200, 200, 200, 0.8)';
        info.style.fontSize = '14px';
        info.style.fontFamily = 'Courier New, monospace';
        info.style.textShadow = '0 0 5px black';
        info.style.pointerEvents = 'none';
        info.innerHTML = `
            POS: ${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}<br>
            [WASD] MOVE | [SHIFT] RUN | [CTRL] CROUCH | [SPACE] JUMP<br>
            [E] BAG | [1-9] ITEM | [ESC] MENU
        `;
        uiContainer.appendChild(info);
    }
}

function startGame() {
    currentState = GAME_STATE.PLAYING;
    resetPlayer();
    updateUI();
    setTimeout(() => {
        renderer.domElement.requestPointerLock();
    }, 50);
}

function resumeGame() {
    currentState = GAME_STATE.PLAYING;
    updateUI();
    setTimeout(() => {
        renderer.domElement.requestPointerLock();
    }, 50);
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
        setTimeout(() => {
            renderer.domElement.requestPointerLock();
        }, 50);
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
                if(camera) camera.position.y = Math.max(camera.position.y, CONFIG.groundY + CONFIG.playerHeightCrouch);
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

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const moveVector = new THREE.Vector3(0, 0, 0);

    if (moveForward) moveVector.add(forward);
    if (moveBackward) moveVector.sub(forward);
    if (moveRight) moveVector.add(right);
    if (moveLeft) moveVector.sub(right);

    if (moveVector.lengthSq() > 0) {
        moveVector.normalize().multiplyScalar(speed * delta);

        let nextX = camera.position.x + moveVector.x;
        if (!checkHouseCollision(new THREE.Vector3(nextX, camera.position.y, camera.position.z))) {
            camera.position.x += moveVector.x;
        }
        
        let nextZ = camera.position.z + moveVector.z;
        if (!checkHouseCollision(new THREE.Vector3(camera.position.x, camera.position.y, nextZ))) {
            camera.position.z += moveVector.z;
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
        // ✅ 直接使用 renderer.render，不再依赖 composer
        renderer.render(scene, camera);
    }
}
