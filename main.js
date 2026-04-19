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
    interactionDistance: 3.0, // 新增：交互距离

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
    cStair: 0xFFAA00,
    cBox: 0x8B4513 // 新增：箱子颜色 (棕色)
};

// ==========================================
// 2. 全局变量
// ==========================================
let camera, scene, renderer;
let linesGroup;
let crosshair;
let uiContainer;

// 地图元素
let mapUI = null;
let mapDot = null;
let mapVisible = false;

// 笔记本元素
let notebookEl = null;
let notebookContent = null;

// 背包元素
let inventoryUI = null;
let selectedSlot = -1; // 修改：初始无选中项

// 交互UI元素
let interactionUI = null; // 新增：交互UI容器
let boxInventoryGrid = null; // 新增：箱子物品栏
let playerInventoryGrid = null; // 新增：玩家物品栏
let currentInteractionTarget = null; // 新增：当前交互目标（例如箱子）

const player = {
    pos: new THREE.Vector3(0, 2, 0), // 修改：初始位置将在出生房子里
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
let keyLocks = { e: false, o: false, b: false, mouseRight: false }; // 修改：新增鼠标右键锁定

const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, INV: 3, INTERACTING: 4 }; // 修改：新增INTERACTING状态
let currentState = STATE.MENU;
let isLocked = false;

const houses = [];
let boxes = []; // 新增：箱子列表

// 背包数据 (修改：清空初始物品)
let playerInventory = Array(9).fill(null); // 9个空槽位
// 箱子数据 (修改：为出生房间箱子准备)
let boxInventories = {}; // 使用对象存储不同箱子的内容

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
    createUI(); // UI创建放在最后，确保所有变量已声明
    createInteractionUI(); // 新增：创建交互UI

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    // 修改：左键用于拖拽，右键用于交互
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    
    renderer.domElement.addEventListener('click', () => {
        if (currentState === STATE.PLAYING && !isLocked) {
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        isLocked = (document.pointerLockElement === renderer.domElement);
    });

    // 强制首帧渲染防黑屏
    renderer.render(scene, camera);
}

// ==========================================
// 4. 世界构建
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
        
        // 修改：不再跳过接近原点的房子，而是选择一个特定的作为出生点
        // 假设第一个房子作为出生点，可以根据需要更改
        const isSpawnHouse = i === 0; // 第一个生成的房子作为出生点

        const house = {
            x, z,
            minX: x - CONFIG.w/2, maxX: x + CONFIG.w/2,
            minZ: z - CONFIG.d/2, maxZ: z + CONFIG.d/2,
            mesh: null, doorMesh: null,
            isSpawn: isSpawnHouse // 新增标记
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

        // 如果是出生房子，设置玩家出生点并生成箱子
        if (isSpawnHouse) {
            // 设置玩家出生在房子里的中央，稍微高于地面
            player.pos.set(x, CONFIG.floorH + CONFIG.heightStand, z);
            // 确保玩家位置正确更新到相机
            camera.position.copy(player.pos);
            
            // 在房间里生成一个箱子
            const boxSize = 5; // 箱子大小
            const boxGeometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
            const boxMaterial = new THREE.MeshBasicMaterial({ color: CONFIG.cBox });
            const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
            // 放置在房间的角落 (-X, -Z)
            const cornerOffset = CONFIG.w/2 - boxSize/2 - 10; // 距离墙壁2单位
            boxMesh.position.set(x - cornerOffset, CONFIG.floorH/2, z - cornerOffset); // <--- 修改这里
            scene.add(boxMesh);
            
            // 存储箱子信息
            const boxId = `box_${x}_${z}`;
            boxes.push({
                id: boxId,
                mesh: boxMesh,
                x: boxMesh.position.x,
                y: boxMesh.position.y,
                z: boxMesh.position.z,
                size: boxSize / 2 // 半尺寸用于碰撞检测
            });
            
            // 初始化箱子库存，放入一封信
            boxInventories[boxId] = [
                { name: "一封信", icon: "📜" },
                null, null, null, null, null, null, null, null
            ];
        }
    }
}

function createHouseGeometry() {
    const hw = CONFIG.w/2, hd = CONFIG.d/2, hh = CONFIG.h/2;
    const points = [];

    for(let i=0; i<=CONFIG.h; i+=CONFIG.floorH) {
        const y = i - hh;
        points.push(-hw, y, -hd, hw, y, -hd);
        points.push(hw, y, -hd, hw, y, hd);
        points.push(hw, y, hd, -hw, y, hd);
        points.push(-hw, y, hd, -hw, y, -hd);
    }
    
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    corners.forEach(([cx, cz]) => points.push(cx, -hh, cz, cx, hh, cz));

    for(let i=1; i<CONFIG.h; i+=CONFIG.floorH) {
        const y = i - hh;
        for(let k=-hw; k<=hw; k+=20) points.push(k, y, -hd, k, y, hd);
        for(let k=-hd; k<=hd; k+=20) points.push(-hw, y, k, hw, y, k);
    }

    const sx = -hw + 10, sz = hd - 5;
    let cx = sx, cz = sz, cy = -hh;
    let dir = -1;
    const steps = 10;
    const stepH = CONFIG.floorH/steps;
    const stepD = 40/steps;
    
    for(let f=0; f<CONFIG.h/CONFIG.floorH - 1; f++) {
        for(let s=0; s<steps; s++) {
            const ny = cy + stepH;
            const nz = cz + stepD*dir;
            points.push(cx-6, ny, nz, cx+6, ny, nz);
            points.push(cx, cy, nz, cx, ny, nz);
            cy = ny; cz = nz;
        }
        const pz = cz + 5*dir;
        points.push(cx-6, cy, cz, cx+6, cy, cz);
        points.push(cx-6, cy, pz, cx+6, cy, pz);
        points.push(cx-6, cy, cz, cx-6, cy, pz);
        points.push(cx+6, cy, cz, cx+6, cy, pz);
        
        dir *= -1;
        cz = pz + 5*dir;
    }

    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

function createDoorGeometry() {
    const hw = CONFIG.w/2, hd = CONFIG.d/2;
    const dw = CONFIG.doorW/2;
    const dh = CONFIG.doorH;
    const points = [];
    points.push(-dw, 0, hd, -dw, dh, hd);
    points.push(-dw, dh, hd, dw, dh, hd);
    points.push(dw, dh, hd, dw, 0, hd);
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

function createCrosshair() {
    const cvs = document.createElement('canvas');
    cvs.width=64; cvs.height=64;
    const ctx = cvs.getContext('2d');
    ctx.strokeStyle='#FFF'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(32,16); ctx.lineTo(32,24);
    ctx.moveTo(32,40); ctx.lineTo(32,48);
    ctx.moveTo(16,32); ctx.lineTo(24,32);
    ctx.moveTo(40,32); ctx.lineTo(48,32);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(cvs);
    const mat = new THREE.SpriteMaterial({map:tex, depthTest:false, depthWrite:false, renderOrder:9999, toneMapped:false});
    crosshair = new THREE.Sprite(mat);
    crosshair.scale.set(0.5,0.5,1);
    scene.add(crosshair);
}

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
    
    // 更新地图位置
    updateMapPosition();
}

function checkCollision(pos) {
    const r = CONFIG.radius;
    for (const h of houses) {
        if (Math.abs(pos.x - h.x) > CONFIG.w/2 + r + 10 || Math.abs(pos.z - h.z) > CONFIG.d/2 + r + 10) continue;

        const minX = h.minX, maxX = h.maxX;
        const minZ = h.minZ, maxZ = h.maxZ;
        const minY = 0, maxY = CONFIG.h;

        if (pos.y < minY || pos.y > maxY) continue;

        const frontZ = maxZ;
        const dw = CONFIG.doorW/2;
        const dh = CONFIG.doorH;
        
        if (Math.abs(pos.z - frontZ) < r) {
            if (pos.y < dh && pos.x > h.x - dw - r && pos.x < h.x + dw + r) continue;
            if (pos.x >= minX - r && pos.x <= maxX + r) return true;
        }

        const inX = pos.x > minX - r && pos.x < maxX + r;
        const inZ = pos.z > minZ - r && pos.z < maxZ + r;
        if (inX && inZ) {
            if (pos.x <= minX + r || pos.x >= maxX - r) return true;
            if (pos.z <= minZ + r || pos.z >= maxZ - r) return true;
        }
    }
    // 检查箱子碰撞
    for (const box of boxes) {
        const dx = Math.abs(pos.x - box.x);
        const dz = Math.abs(pos.z - box.z);
        const dy = Math.abs(pos.y - box.y);
        if (dx < r + box.size && dz < r + box.size && dy < CONFIG.heightStand / 2 + box.size) {
            return true; // 碰撞到箱子
        }
    }
    return false;
}

function checkGroundAndStairs() {
    let supportY = 0;
    let onStair = false;
    let stairY = 0;

    for (const h of houses) {
        if (Math.abs(player.pos.x - h.x) > CONFIG.w/2 + 10 || Math.abs(player.pos.z - h.z) > CONFIG.d/2 + 10) continue;
        
        if (player.pos.x > h.minX && player.pos.x < h.maxX && player.pos.z > h.minZ && player.pos.z < h.maxZ) {
            const calculatedStairY = getStairHeightRobust(player.pos.x, player.pos.z, h.x, h.z);
            
            if (calculatedStairY !== null) {
                onStair = true;
                stairY = calculatedStairY;
                if (stairY > supportY) supportY = stairY;
            }

            for(let i=1; i<CONFIG.h; i+=CONFIG.floorH) {
                if (player.pos.y > i - 2 && player.pos.y < i + 2) {
                    if (i > supportY) supportY = i;
                }
            }
        }
    }

    const targetH = player.crouching ? CONFIG.heightCrouch : CONFIG.heightStand;
    const standY = supportY + targetH;

    if (onStair) {
        if (Math.abs(player.pos.y - (stairY + targetH)) < 1.5 && player.vel.y <= 0) {
            player.pos.y = stairY + targetH;
            player.vel.y = 0;
            player.grounded = true;
            return;
        }
    }

    if (player.pos.y <= standY + 0.5 && player.vel.y <= 0) {
        player.pos.y = standY;
        player.vel.y = 0;
        player.grounded = true;
    } else {
        if (player.pos.y > supportY + targetH + 1.0) {
            player.grounded = false;
        }
    }
}

function getStairHeightRobust(x, z, hx, hz) {
    const hw = CONFIG.w/2, hd = CONFIG.d/2;
    const sx = hx - hw + 10;
    const szStart = hz + hd - 5;
    const stairWidth = 14;
    if (x < sx - stairWidth/2 || x > sx + stairWidth/2) return null;
    
    const distZ = szStart - z;
    if (distZ > -5 && distZ < 85) {
        let h = (distZ / 80) * CONFIG.h;
        if (h < 0) h = 0;
        if (h > CONFIG.h) h = CONFIG.h;
        return h;
    }
    return null;
}

// ==========================================
// 6. 渲染管理
// ==========================================
function updateVisibility() {
    const renderDist = 400;
    houses.forEach(h => {
        const dist = Math.sqrt((player.pos.x - h.x)**2 + (player.pos.z - h.z)**2);
        const visible = dist < renderDist;
        if (h.mesh.visible !== visible) {
            h.mesh.visible = visible;
            h.doorMesh.visible = visible;
        }
        if (visible) {
            const alpha = Math.max(0.1, 1.0 - dist/renderDist);
            h.mesh.material.opacity = alpha;
            h.doorMesh.material.opacity = alpha;
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    
    if (currentState === STATE.PLAYING) {
        updatePhysics();
        const euler = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(euler);
    }
    
    if (crosshair) {
        crosshair.position.copy(camera.position);
        const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
        crosshair.position.add(dir.multiplyScalar(1));
    }

    updateVisibility();
    renderer.render(scene, camera);
}

// ==========================================
// 7. 输入处理
// ==========================================
function onKeyDown(e) {
    const code = e.code;
    if (code === 'KeyW') keys.w = true;
    if (code === 'KeyS') keys.s = true;
    if (code === 'KeyA') keys.a = true;
    if (code === 'KeyD') keys.d = true;
    if (code === 'Space') keys.space = true;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = true;
    if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = true;
    
    // E键：现在仅用于关闭交互UI，不打开普通背包
    if (code === 'KeyE') {
         if (currentState === STATE.INTERACTING) {
            closeInteractionUI();
        }
    }
    
    // O键：暂停/继续
    if (code === 'KeyO' && !keyLocks.o) {
        if (currentState === STATE.PLAYING) {
            currentState = STATE.PAUSED;
            document.exitPointerLock();
            updateUI();
        } else if (currentState === STATE.PAUSED) {
            currentState = STATE.PLAYING;
            setTimeout(() => renderer.domElement.requestPointerLock(), 50);
            updateUI();
        }
        keyLocks.o = true;
    }
    
    // P键：开关地图
    if (code === 'KeyP') {
        mapVisible = !mapVisible;
        if (mapUI) mapUI.style.display = mapVisible ? 'block' : 'none';
    }
    
    // B键：开关笔记本
    if (code === 'KeyB' && !keyLocks.b) {
        toggleNotebook();
        keyLocks.b = true;
    }

    if (code === 'Escape') {
        // ESC现在可以关闭交互UI
        if (currentState === STATE.INTERACTING) {
            closeInteractionUI();
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

function onKeyUp(e) {
    const code = e.code;
    if (code === 'KeyW') keys.w = false;
    if (code === 'KeyS') keys.s = false;
    if (code === 'KeyA') keys.a = false;
    if (code === 'KeyD') keys.d = false;
    if (code === 'Space') keys.space = false;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = false;
    if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = false;
    if (code === 'KeyO') keyLocks.o = false;
    if (code === 'KeyB') keyLocks.b = false;
}

function onMouseMove(e) {
    if (currentState !== STATE.PLAYING || !isLocked) return;
    player.yaw -= e.movementX * CONFIG.sensitivity;
    player.pitch -= e.movementY * CONFIG.sensitivity;
    player.pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, player.pitch));
}

// 新增：鼠标按下处理
function onMouseDown(e) {
    if (currentState !== STATE.PLAYING) return;

    if (e.button === 2) { // 右键
        if (!keyLocks.mouseRight) {
            attemptInteract();
            keyLocks.mouseRight = true;
        }
    }
    // e.button === 0 是左键，用于拖拽已在UI中的物品
}

// 新增：鼠标释放处理
function onMouseUp(e) {
    if (e.button === 2) { // 右键
        keyLocks.mouseRight = false;
    }
    // 处理UI中的拖拽放置逻辑
    handleDrop(e);
}

function onWheel(e) {
    if (currentState !== STATE.PLAYING) return;
    if (e.deltaY < 0) console.log('切换到上一个物品');
    else console.log('切换到下一个物品');
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
}

// ==========================================
// 8. UI 系统
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, {
        position:'absolute', top:0, left:0, width:'100%', height:'100%',
        pointerEvents:'none', fontFamily:'"Microsoft YaHei", "Courier New", monospace', color:'#FFF', userSelect:'none'
    });
    document.body.appendChild(uiContainer);
    
    // 创建地图 UI（右上角）
    createMapUI();
    
    // 创建笔记本 UI（B键触发）
    createNotebookUI();
    
    // 创建背包 UI（E键触发 - 现在用于关闭交互UI）
    createInventoryUI();
    
    updateUI();
}

// 新增：创建交互UI
function createInteractionUI() {
    if (document.getElementById('interactionUI')) return;
    
    interactionUI = document.createElement('div');
    interactionUI.id = 'interactionUI';
    Object.assign(interactionUI.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '800px', // 更宽以容纳两个网格
        minHeight: '400px',
        border: '2px solid #00FFFF',
        background: 'rgba(20,20,20,0.95)',
        padding: '20px',
        display: 'none',
        zIndex: 1002,
        pointerEvents: 'auto',
        fontFamily: '"Microsoft YaHei", "Courier New", monospace',
        color: '#FFF'
    });

    const title = document.createElement('h2');
    title.textContent = '箱子 - 与背包互动';
    title.style.color = '#00FFFF';
    title.style.textAlign = 'center';
    title.style.marginTop = '0';
    interactionUI.appendChild(title);

    // 创建两个并排的网格容器
    const gridsContainer = document.createElement('div');
    gridsContainer.style.display = 'flex';
    gridsContainer.style.justifyContent = 'space-around';
    gridsContainer.style.gap = '20px';

    // 箱子物品栏
    const boxInvContainer = document.createElement('div');
    boxInvContainer.innerHTML = '<h3 style="color:#FFD700;">箱子里</h3>';
    boxInventoryGrid = document.createElement('div');
    boxInventoryGrid.className = 'inventory-grid';
    boxInventoryGrid.style.display = 'flex';
    boxInventoryGrid.style.flexWrap = 'wrap';
    boxInventoryGrid.style.justifyContent = 'center';
    boxInventoryGrid.style.gap = '5px';
    boxInvContainer.appendChild(boxInventoryGrid);
    gridsContainer.appendChild(boxInvContainer);

    // 玩家背包物品栏
    const playerInvContainer = document.createElement('div');
    playerInvContainer.innerHTML = '<h3 style="color:#FFD700;">你的背包</h3>';
    playerInventoryGrid = document.createElement('div');
    playerInventoryGrid.className = 'inventory-grid';
    playerInventoryGrid.style.display = 'flex';
    playerInventoryGrid.style.flexWrap = 'wrap';
    playerInventoryGrid.style.justifyContent = 'center';
    playerInventoryGrid.style.gap = '5px';
    playerInvContainer.appendChild(playerInventoryGrid);
    gridsContainer.appendChild(playerInvContainer);

    interactionUI.appendChild(gridsContainer);

    const hint = document.createElement('div');
    hint.textContent = '提示：按 E 或 Esc 关闭 | 左键拖拽物品';
    hint.style.textAlign = 'center';
    hint.style.marginTop = '10px';
    hint.style.fontSize = '14px';
    hint.style.color = '#AAA';
    interactionUI.appendChild(hint);

    document.body.appendChild(interactionUI);
}

function createMapUI() {
    if (document.getElementById('mapUI')) return;
    
    mapUI = document.createElement('div');
    mapUI.id = 'mapUI';
    Object.assign(mapUI.style, {
        position: 'absolute',
        top: '10px',
        right: '10px',
        width: '150px',
        height: '150px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        border: '2px solid #00FFFF',
        display: 'none',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 100
    });
    
    const mapGrid = document.createElement('div');
    Object.assign(mapGrid.style, {
        width: '100%',
        height: '100%',
        backgroundImage: 'radial-gradient(circle, transparent 1px, #00FFFF 1px)',
        backgroundSize: '10px 10px'
    });
    mapUI.appendChild(mapGrid);
    
    mapDot = document.createElement('div');
    Object.assign(mapDot.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '8px',
        height: '8px',
        backgroundColor: '#FF0000',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 101
    });
    mapUI.appendChild(mapDot);
    
    document.body.appendChild(mapUI);
}

function createNotebookUI() {
    if (document.getElementById('notebookUI')) return;
    
    notebookEl = document.createElement('div');
    notebookEl.id = 'notebookUI';
    Object.assign(notebookEl.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        height: '400px',
        backgroundColor: '#222',
        border: '2px solid #FFD700',
        color: '#FFF',
        padding: '20px',
        display: 'none',
        pointerEvents: 'auto',
        overflow: 'auto',
        fontSize: '16px',
        fontFamily: 'Georgia, serif',
        zIndex: 1000
    });
    
    notebookEl.innerHTML = `
        <h2 style="color:#FFD700; margin-bottom: 10px;">📝 玩家笔记</h2>
        <textarea id="notebookContent" style="
            width: 100%; height: calc(100% - 60px);
            background: #111; color: #EEE; border: 1px solid #555;
            padding: 10px; font-family: Georgia, serif;
            resize: none; outline: none;
        " placeholder="在这里写下你的发现、线索或任何你想记住的信息..."></textarea>
        <div style="margin-top: 10px; text-align: center; font-size: 14px; color: #AAA;">
            提示：按 <strong>B</strong> 键关闭 | 自动保存到本地存储
        </div>
    `;
    
    document.body.appendChild(notebookEl);
    notebookContent = document.getElementById('notebookContent');
    
    // 加载保存内容
    const saved = localStorage.getItem('gameNotebook');
    if (saved) notebookContent.value = saved;
    
    // 保存监听
    notebookContent.addEventListener('input', () => {
        localStorage.setItem('gameNotebook', notebookContent.value);
    });
}

function createInventoryUI() {
    if (document.getElementById('inventoryUI')) return;
    
    inventoryUI = document.createElement('div');
    inventoryUI.id = 'inventoryUI';
    Object.assign(inventoryUI.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        minHeight: '400px',
        border: '2px solid #FFD700',
        background: 'rgba(20,20,20,0.9)',
        padding: '20px',
        display: 'none',
        zIndex: 999,
        pointerEvents: 'auto'
    });
    
    const header = document.createElement('div');
    header.className = 'inventory-header';
    header.style.color = '#FFD700';
    header.style.fontSize = '24px';
    header.style.marginBottom = '20px';
    header.textContent = '背包 (按 E 关闭)';
    inventoryUI.appendChild(header);
    
    const grid = document.createElement('div');
    grid.className = 'inventory-grid';
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.justifyContent = 'center';
    
    // 清空初始物品，创建空槽位
    for (let idx = 0; idx < 9; idx++) {
        const item = document.createElement('div');
        item.className = 'inventory-item';
        item.style.width = '70px';
        item.style.height = '70px';
        item.style.margin = '10px';
        item.style.border = '1px solid #555';
        item.style.background = '#111';
        item.style.color = '#888';
        item.style.display = 'flex';
        item.style.flexDirection = 'column';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'center';
        item.style.cursor = 'pointer';
        item.style.fontSize = '14px';
        item.dataset.index = idx;
        
        if (idx === selectedSlot) item.style.border = '3px solid #FFF';
        
        item.innerHTML = `<div style="font-size:10px;margin-top:5px">[${idx+1}]</div>`; // 空槽
        
        item.addEventListener('click', () => {
            document.querySelectorAll('.inventory-item').forEach(el => {
                el.style.border = '1px solid #555';
            });
            item.style.border = '3px solid #FFF';
            selectedSlot = idx;
        });
        
        grid.appendChild(item);
    }
    
    inventoryUI.appendChild(grid);
    document.body.appendChild(inventoryUI);
}

// 新增：尝试与最近的物体交互
function attemptInteract() {
    let closestObj = null;
    let closestDist = Infinity;

    // 检查是否靠近箱子
    for (const box of boxes) {
        const dx = player.pos.x - box.x;
        const dz = player.pos.z - box.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < CONFIG.interactionDistance * CONFIG.interactionDistance && distSq < closestDist) {
            closestDist = distSq;
            closestObj = box;
        }
    }

    if (closestObj) {
        openInteractionUI(closestObj.id);
    }
}

// 新增：打开交互UI
function openInteractionUI(targetId) {
    if (currentState === STATE.PLAYING) {
        currentState = STATE.INTERACTING;
        document.exitPointerLock(); // 解锁鼠标以便操作UI
        currentInteractionTarget = targetId;
        interactionUI.style.display = 'block';
        refreshInteractionUI();
    }
}

// 新增：刷新交互UI显示
function refreshInteractionUI() {
    if (!interactionUI || !currentInteractionTarget) return;

    // 清空现有物品
    boxInventoryGrid.innerHTML = '';
    playerInventoryGrid.innerHTML = '';

    // 填充箱子物品
    const boxItems = boxInventories[currentInteractionTarget] || Array(9).fill(null);
    boxItems.forEach((item, idx) => {
        const slot = createItemSlot(item, 'box', idx);
        boxInventoryGrid.appendChild(slot);
    });

    // 填充玩家背包物品
    playerInventory.forEach((item, idx) => {
        const slot = createItemSlot(item, 'player', idx);
        playerInventoryGrid.appendChild(slot);
    });
}

// 新增：创建物品槽位元素
function createItemSlot(itemData, owner, index) {
    const slot = document.createElement('div');
    slot.className = 'inventory-item';
    slot.style.width = '60px';
    slot.style.height = '60px';
    slot.style.margin = '5px';
    slot.style.border = '1px solid #555';
    slot.style.background = '#111';
    slot.style.color = '#888';
    slot.style.display = 'flex';
    slot.style.flexDirection = 'column';
    slot.style.alignItems = 'center';
    slot.style.justifyContent = 'center';
    slot.style.cursor = 'pointer';
    slot.style.fontSize = '14px';
    slot.dataset.owner = owner;
    slot.dataset.index = index;

    if (itemData) {
        slot.innerHTML = `<div>${itemData.icon}</div><div style="font-size:10px;max-width: 100%;overflow: hidden;">${itemData.name}</div>`;
        slot.style.color = '#FFF';
        slot.draggable = true;
        slot.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', `${owner},${index}`);
        });
    } else {
        slot.innerHTML = '<div style="font-size:10px;">[空]</div>';
    }

    return slot;
}

// 新增：处理拖拽放置
function handleDrop(e) {
    if (currentState !== STATE.INTERACTING) return;
    
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;

    const [sourceOwner, sourceIndexStr] = data.split(',');
    const sourceIndex = parseInt(sourceIndexStr);
    if (isNaN(sourceIndex)) return;

    // 获取放置的目标槽位
    const target = e.target.closest('.inventory-item');
    if (!target || !target.dataset.owner || !target.dataset.index) return;

    const targetOwner = target.dataset.owner;
    const targetIndex = parseInt(target.dataset.index);
    if (isNaN(targetIndex)) return;

    // 防止拖到自己身上
    if (sourceOwner === targetOwner && sourceIndex === targetIndex) return;

    let sourceArray, targetArray;
    if (sourceOwner === 'box') sourceArray = boxInventories[currentInteractionTarget];
    else if (sourceOwner === 'player') sourceArray = playerInventory;
    else return;

    if (targetOwner === 'box') targetArray = boxInventories[currentInteractionTarget];
    else if (targetOwner === 'player') targetArray = playerInventory;
    else return;

    if (!sourceArray || !targetArray) return;

    // 移动物品
    const item = sourceArray[sourceIndex];
    // 检查目标槽位是否为空
    if (targetArray[targetIndex] === null) {
        targetArray[targetIndex] = item;
        sourceArray[sourceIndex] = null;
    } else {
        // 如果不为空，则交换
        const temp = targetArray[targetIndex];
        targetArray[targetIndex] = item;
        sourceArray[sourceIndex] = temp;
    }

    // 刷新UI
    refreshInteractionUI();
}

// 新增：关闭交互UI
function closeInteractionUI() {
    if (currentState === STATE.INTERACTING) {
        currentState = STATE.PLAYING;
        setTimeout(() => renderer.domElement.requestPointerLock(), 50);
        interactionUI.style.display = 'none';
        currentInteractionTarget = null;
    }
}

// 更新地图位置（核心：实时映射玩家坐标到小地图）
function updateMapPosition() {
    if (!mapVisible || !mapDot) return;
    
    // 小地图范围：150×150px，对应游戏世界约 ±500 单位（可根据需要调整）
    const MAP_SIZE_PX = 150;
    const WORLD_RADIUS = 500; // 可视范围半径
    
    // 归一化玩家坐标到 [-1, 1]
    const normX = Math.max(-1, Math.min(1, player.pos.x / WORLD_RADIUS));
    const normZ = Math.max(-1, Math.min(1, player.pos.z / WORLD_RADIUS));
    
    // 映射到像素坐标（中心为 75,75）
    const pxX = 75 + normX * 75;
    const pxZ = 75 + normZ * 75;
    
    mapDot.style.left = `${pxX}px`;
    mapDot.style.top = `${pxZ}px`;
}

// 开关笔记本
function toggleNotebook() {
    if (notebookEl.style.display === 'block') {
        notebookEl.style.display = 'none';
        if (currentState === STATE.PLAYING) {
            setTimeout(() => renderer.domElement.requestPointerLock(), 50);
        }
    } else {
        notebookEl.style.display = 'block';
        document.exitPointerLock();
    }
}

// 开关背包 (修改：现在只用于关闭交互UI)
function toggleInventory() {
    // 保持原有逻辑，但目前E键只用于关闭交互UI
    if (currentState === STATE.INTERACTING) {
        closeInteractionUI();
    }
    // 不再打开普通背包UI
}

function updateUI() {
    uiContainer.innerHTML = '';
    uiContainer.style.pointerEvents = (currentState === STATE.MENU || currentState === STATE.PAUSED || currentState === STATE.INV || currentState === STATE.INTERACTING) ? 'auto' : 'none';

    if (currentState === STATE.PLAYING || currentState === STATE.INV || currentState === STATE.INTERACTING) {
        let dirStr = "静止";
        if (keys.w) dirStr = "前进 ↑";
        if (keys.s) dirStr = "后退 ↓";
        if (keys.a) dirStr = "向左 ←";
        if (keys.d) dirStr = "向右 →";
        
        const info = document.createElement('div');
        Object.assign(info.style, { position:'absolute', top:'10px', left:'10px', fontSize:'14px', color:'#0F0', textShadow:'1px 1px 0 #000' });
        const floor = Math.floor(player.pos.y / CONFIG.floorH) + 1;
        
        const keyStatus = (k) => k ? "<span style='color:#FFF'>ON</span>" : "<span style='color:#666'>OFF</span>";
        const runStatus = keys.shift ? "<span style='color:#FFD700'>加速跑</span>" : "步行";
        const crouchStatus = keys.ctrl ? "<span style='color:#FFD700'>下蹲</span>" : "站立";
        const mouseStatus = isLocked ? "<span style='color:#0F0'>已锁定</span>" : "<span style='color:#F00'>自由</span>";

        info.innerHTML = `
            坐标：${player.pos.x.toFixed(0)} ${player.pos.y.toFixed(0)} ${player.pos.z.toFixed(0)}<br>
            楼层：<strong>${floor}</strong><br>
            方向：<strong>${dirStr}</strong><br>
            按键：W[${keyStatus(keys.w)}] S[${keyStatus(keys.s)}] A[${keyStatus(keys.a)}] D[${keyStatus(keys.d)}]<br>
            Shift [${runStatus}] | Ctrl [${crouchStatus}] | 空格 [${keys.space ? '跳跃' : '--'}]<br>
            鼠标：${mouseStatus} | 房屋总数：${CONFIG.count}
        `;
        uiContainer.appendChild(info);
    }

    if (currentState === STATE.MENU) {
        uiContainer.style.background = '#000';
        drawOverlay("后朋克之城 200", [
            {txt:"开始游戏", act:startGame},
            {txt:"退出游戏", act:() => {}}
        ]);
    } else if (currentState === STATE.PAUSED) {
        uiContainer.style.background = 'rgba(0,0,0,0.7)';
        drawOverlay("已暂停", [
            {txt:"继续游戏", act:resumeGame},
            {txt:"返回菜单", act:goToMenu}
        ]);
    }
}

function drawOverlay(title, btns) {
    const t = document.createElement('h1');
    t.innerText = title;
    Object.assign(t.style, { textAlign:'center', marginTop:'15vh', fontSize:'60px', color:'#FFD700', margin:0, textShadow:'2px 2px #000' });
    uiContainer.appendChild(t);
    
    btns.forEach(b => {
        const el = document.createElement('div');
        el.innerText = b.txt;
        Object.assign(el.style, {
            display:'block', width:'240px', margin:'20px auto', padding:'15px',
            border:'2px solid #FFF', color:'#DDD', textAlign:'center', cursor:'pointer',
            background:'#111', fontSize:'24px', transition:'0.2s'
        });
        el.onmouseenter = () => { el.style.background='#FFF'; el.style.color='#000'; };
        el.onmouseleave = () => { el.style.background='#111'; el.style.color='#DDD'; };
        el.onclick = b.act;
        uiContainer.appendChild(el);
    });
}

function startGame() {
    currentState = STATE.PLAYING;
    // 玩家位置已在createWorld中设置
    player.vel.set(0,0,0);
    player.yaw = 0;
    updateUI();
    setTimeout(() => renderer.domElement.requestPointerLock(), 50);
}
function resumeGame() {
    currentState = STATE.PLAYING;
    updateUI();
    setTimeout(() => renderer.domElement.requestPointerLock(), 50);
}
function goToMenu() {
    // 关闭可能开启的UI
    if (currentState === STATE.INTERACTING) {
        closeInteractionUI();
    }
    if (notebookEl.style.display === 'block') {
        notebookEl.style.display = 'none';
    }
    if (inventoryUI.style.display === 'block') {
        inventoryUI.style.display = 'none';
    }
    currentState = STATE.MENU;
    document.exitPointerLock();
    updateUI();
}

// 添加鼠标滑轮事件
window.addEventListener('wheel', onWheel);
