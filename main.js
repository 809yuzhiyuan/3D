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
    cStair: 0xFFAA00,
    cChest: 0x8B4513 // 棕色箱子
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

// 修复：移除E键锁定，保留其他
let keyLocks = { o: false, b: false };

const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, INV: 3, CHEST: 4, BOTH: 5 };
let currentState = STATE.MENU;
let isLocked = false;

const houses = [];

// 新增：物品系统变量
const ITEMS = ["空", "空", "空", "空", "空", "空", "空", "空", "空", "空"]; // 10个空位
let currentItemIndex = 0;

// 新增：箱子系统
let chestHouseIndex = -1; // 存储有箱子的房子索引
const CHEST_ITEMS = ["信件"]; // 箱子里的物品

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
    createUI();

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    // 新增：监听滚轮事件
    window.addEventListener('wheel', onWheel);
    
    renderer.domElement.addEventListener('click', () => {
        if (currentState === STATE.PLAYING && !isLocked) {
            renderer.domElement.requestPointerLock();
        }
    });

    // 新增：右键打开箱子
    renderer.domElement.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // 阻止右键菜单
        if (currentState === STATE.PLAYING) {
            // 检查玩家是否靠近有箱子的房子
            if (chestHouseIndex !== -1) {
                const chestHouse = houses[chestHouseIndex];
                const dist = Math.sqrt((player.pos.x - chestHouse.x)**2 + (player.pos.z - chestHouse.z)**2);
                if (dist < 100) { // 在一定距离内才能打开箱子
                    currentState = STATE.CHEST;
                    document.exitPointerLock();
                    updateUI();
                }
            }
        }
    });

    document.addEventListener('pointerlockchange', () => {
        isLocked = (document.pointerLockElement === renderer.domElement);
    });

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
        
        if (Math.abs(x) < 60 && Math.abs(z) < 60) continue;

        const house = {
            x, z,
            minX: x - CONFIG.w/2, maxX: x + CONFIG.w/2,
            minZ: z - CONFIG.d/2, maxZ: z + CONFIG.d/2,
            mesh: null, doorMesh: null,
            hasChest: false, // 新增：标识是否有箱子
            chestMesh: null // 新增：箱子网格
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

        // 创建箱子网格
        const chestGeometry = new THREE.BoxGeometry(8, 6, 12);
        const chestMaterial = new THREE.MeshBasicMaterial({ color: CONFIG.cChest, wireframe: true });
        const chestMesh = new THREE.Mesh(chestGeometry, chestMaterial);
        chestMesh.position.set(x, 3, z - 20); // 在房子前面放置箱子
        chestMesh.visible = false;
        scene.add(chestMesh);
        house.chestMesh = chestMesh;

        houses.push(house);
    }
    
    // 设置第一个房子作为有箱子的房子，并移动玩家到此房子内
    if (houses.length > 0) {
        chestHouseIndex = 0;
        const chestHouse = houses[chestHouseIndex];
        chestHouse.hasChest = true; // 标记这栋房子有箱子
        player.pos.set(chestHouse.x, CONFIG.heightStand, chestHouse.z - 20); // 在房子内偏移一点
    }
}

function createHouseGeometry() {
    const hw = CONFIG.w/2, hd = CONFIG.d/2, hh = CONFIG.h/2;
    const points = [];
    const addLine = (x1,y1,z1, x2,y2,z2) => points.push(x1,y1,z1, x2,y2,z2);

    for(let i=0; i<=CONFIG.h; i+=CONFIG.floorH) {
        const y = i - hh;
        addLine(-hw, y, -hd, hw, y, -hd);
        addLine(hw, y, -hd, hw, y, hd);
        addLine(hw, y, hd, -hw, y, hd);
        addLine(-hw, y, hd, -hw, y, -hd);
    }
    
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    corners.forEach(([cx, cz]) => addLine(cx, -hh, cz, cx, hh, cz));

    for(let i=1; i<CONFIG.h; i+=CONFIG.floorH) {
        const y = i - hh;
        for(let k=-hw; k<=hw; k+=20) addLine(k, y, -hd, k, y, hd);
        for(let k=-hd; k<=hd; k+=20) addLine(-hw, y, k, hw, y, k);
    }

    // 楼梯几何体修复：使用更精确的计算
    const stairHeightPerStep = CONFIG.floorH / 10;
    const stairDepthPerStep = 4;
    const totalStairHeight = CONFIG.h - CONFIG.floorH; // 总爬升高度
    const numSteps = Math.ceil(totalStairHeight / stairHeightPerStep); // 修复：使用ceil确保覆盖
    
    // 创建楼梯路径
    let currentX = -hw + 10;
    let currentY = 0;
    let currentZ = hd - 5;
    let direction = -1; // -1 表示向负Z方向
    
    for (let step = 0; step < numSteps; step++) {
        const nextY = currentY + stairHeightPerStep;
        const nextZ = currentZ + stairDepthPerStep * direction;
        
        // 绘制台阶的水平面
        points.push(currentX - 6, currentY, currentZ, currentX + 6, currentY, currentZ);
        points.push(currentX - 6, currentY, currentZ, currentX - 6, nextY, currentZ);
        points.push(currentX + 6, currentY, currentZ, currentX + 6, nextY, currentZ);
        
        // 绘制台阶的垂直面
        points.push(currentX - 6, nextY, currentZ, currentX + 6, nextY, currentZ);
        points.push(currentX - 6, nextY, currentZ, currentX - 6, nextY, nextZ);
        points.push(currentX + 6, nextY, currentZ, currentX + 6, nextY, nextZ);
        
        // 更新位置
        currentY = nextY;
        currentZ = nextZ;
        
        // 每10步改变方向
        if ((step + 1) % 10 === 0) {
            direction *= -1; // 改变方向
            currentZ += 10 * direction; // 移动到下一个平台
        }
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
                if (calculatedStairY > supportY) supportY = calculatedStairY;
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
    const hw = CONFIG.w/2;
    const hd = CONFIG.d/2;
    const stairStartX = hx - hw + 10;
    const stairStartZ = hz + hd - 5;
    
    const stairWidth = 12; // 楼梯宽度
    if (x < stairStartX - stairWidth/2 || x > stairStartX + stairWidth/2) return null;
    
    // 计算楼梯的高度，考虑方向变化
    const totalStairHeight = CONFIG.h - CONFIG.floorH;
    const totalStairLength = 80; // 预设楼梯总长度
    
    // 计算从楼梯起点到当前位置的距离
    const distFromStart = Math.abs(stairStartZ - z);
    
    if (distFromStart >= 0 && distFromStart <= totalStairLength) {
        // 考虑楼梯的折返设计
        const floorIndex = Math.floor(distFromStart / 10); // 每10单位一个楼层
        const withinFloorPos = distFromStart % 10;
        
        // 简化楼梯高度计算以避免潜在的无限循环
        const ratio = distFromStart / totalStairLength;
        return ratio * totalStairHeight;
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
            h.chestMesh.visible = visible; // 更新箱子可见性
        }
        if (visible) {
            const alpha = Math.max(0.1, 1.0 - dist/renderDist);
            h.mesh.material.opacity = alpha;
            h.doorMesh.material.opacity = alpha;
            // 注意：wireframeLinewidth不是材质属性，我们改为调整opacity
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
// 7. 输入处理 (✅ 修复 E 键)
// ==========================================
function onKeyDown(e) {
    const code = e.code;
    if (code === 'KeyW') keys.w = true;
    if (code === 'KeyS') keys.s = true;
    if (code === 'KeyA') keys.a = true; // 修复：只在这里赋值一次
    if (code === 'KeyD') keys.d = true;
    if (code === 'Space') keys.space = true;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = true;
    if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = true;
    
    // 🔧 修复 E 键：直接切换背包状态，无需锁
    if (code === 'KeyE') {
        if (currentState === STATE.PLAYING) {
            currentState = STATE.INV;
            document.exitPointerLock();
        } else if (currentState === STATE.INV) {
            currentState = STATE.PLAYING;
            setTimeout(() => renderer.domElement.requestPointerLock(), 50);
            updateUI();
        } else if (currentState === STATE.CHEST) {
            // 从箱子界面切换到双界面
            currentState = STATE.BOTH;
        } else if (currentState === STATE.BOTH) {
            // 从双界面切换回仅箱子界面
            currentState = STATE.CHEST;
        }
        updateUI(); // 确保UI同步更新
        e.preventDefault(); // 阻止默认行为
    }
    
    // 其他按键保持原有逻辑（带锁）
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
    
    if (code === 'KeyP') {
        mapVisible = !mapVisible;
        mapUI.style.display = mapVisible ? 'block' : 'none';
    }
    
    if (code === 'KeyB' && !keyLocks.b) {
        toggleNotebook();
        keyLocks.b = true;
    }

    if (code === 'Escape') {
        if (currentState === STATE.INV) {
            // ESC在背包中也关闭背包
            currentState = STATE.PLAYING;
            setTimeout(() => renderer.domElement.requestPointerLock(), 50);
            updateUI();
        } else if (currentState === STATE.CHEST) {
            // ESC在箱子中关闭箱子
            currentState = STATE.PLAYING;
            setTimeout(() => renderer.domElement.requestPointerLock(), 50);
            updateUI();
        } else if (currentState === STATE.BOTH) {
            // ESC在双界面中关闭到仅背包
            currentState = STATE.INV;
            updateUI();
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
    // 🔴 修复：移除错误的重复赋值 keys.a = false;
    if (code === 'KeyA') keys.a = false;
    if (code === 'KeyD') keys.d = false;
    if (code === 'Space') keys.space = false;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = false;
    if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = false;
    // 不再处理E键的释放（因为没有锁了）
    if (code === 'KeyO') keyLocks.o = false;
    if (code === 'KeyB') keyLocks.b = false;
}

// 🔧 新增：滚动物品
function onWheel(e) {
    if (currentState !== STATE.PLAYING && currentState !== STATE.INV && currentState !== STATE.BOTH) return;
    
    if (e.deltaY < 0) {
        // 向上滚动，选择前一个
        currentItemIndex = (currentItemIndex - 1 + ITEMS.length) % ITEMS.length;
    } else {
        // 向下滚动，选择后一个
        currentItemIndex = (currentItemIndex + 1) % ITEMS.length;
    }
    // 阻止默认滚动行为
    e.preventDefault();
    // 可选：打印到控制台查看切换
    // console.log('当前物品:', ITEMS[currentItemIndex]);
}

function onMouseMove(e) {
    if (currentState !== STATE.PLAYING || !isLocked) return;
    
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
// 8. UI 系统 (✅ 修改：添加左下角物品显示)
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, {
        position:'absolute', top:0, left:0, width:'100%', height:'100%',
        pointerEvents:'none', fontFamily:'"Microsoft YaHei", "Courier New", monospace', color:'#FFF', userSelect:'none'
    });
    document.body.appendChild(uiContainer);
    
    createMapUI();
    createNotebookUI();
    
    updateUI();
}

function createMapUI() {
    mapUI = document.createElement('div');
    Object.assign(mapUI.style, {
        position: 'absolute',
        top: '10px',
        right: '10px',
        width: '150px',
        height: '150px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        border: '2px solid #00FFFF',
        display: mapVisible ? 'block' : 'none',
        pointerEvents: 'none',
        overflow: 'hidden'
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
        transform: 'translate(-50%, -50%)'
    });
    mapUI.appendChild(mapDot);
    
    document.body.appendChild(mapUI);
}

function createNotebookUI() {
    notebookEl = document.createElement('div');
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
        <p style="line-height: 1.6;">
            这里是你的游戏笔记。你可以记录线索、任务目标或任何你想记住的信息。<br><br>
            <strong>提示：</strong> 按 <strong>B</strong> 键关闭。
        </p>
    `;
    
    document.body.appendChild(notebookEl);
}

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

function updateUI() {
    uiContainer.innerHTML = '';
    uiContainer.style.pointerEvents = (currentState === STATE.MENU || currentState === STATE.PAUSED || currentState === STATE.INV || currentState === STATE.CHEST || currentState === STATE.BOTH) ? 'auto' : 'none';

    // 新增：左下角物品显示
    if (currentState === STATE.PLAYING || currentState === STATE.INV || currentState === STATE.BOTH) {
        const itemInfo = document.createElement('div');
        Object.assign(itemInfo.style, {
            position:'absolute', 
            bottom:'10px', // 改为底部
            left:'10px',   // 改为左边
            fontSize:'16px', 
            color:'#FFD700', // 黄色更显眼
            textShadow:'1px 1px 0 #000',
            backgroundColor: 'rgba(0, 0, 0, 0.5)', // 半透明背景
            padding: '5px 10px',
            borderRadius: '4px'
        });
        
        // 显示当前物品，如果是空则显示"无"
        const currentItem = ITEMS[currentItemIndex];
        const displayText = currentItem === "空" ? "无" : currentItem;
        itemInfo.innerHTML = `当前物品: ${displayText}`;
        uiContainer.appendChild(itemInfo);
    }

    // 原来的顶部信息显示
    if (currentState === STATE.PLAYING || currentState === STATE.INV || currentState === STATE.BOTH) {
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
            {txt:"退出游戏", act:()=>window.close()}
        ]);
    } else if (currentState === STATE.PAUSED) {
        uiContainer.style.background = 'rgba(0,0,0,0.7)';
        drawOverlay("已暂停", [
            {txt:"继续游戏", act:resumeGame},
            {txt:"返回菜单", act:goToMenu}
        ]);
    } else if (currentState === STATE.INV) {
        uiContainer.style.background = 'rgba(0,0,0,0.85)';
        drawInventory();
    } else if (currentState === STATE.CHEST) {
        uiContainer.style.background = 'rgba(0,0,0,0.85)';
        drawChest();
    } else if (currentState === STATE.BOTH) {
        uiContainer.style.background = 'rgba(0,0,0,0.85)';
        drawBothInterfaces();
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
        el.onmouseleave = () => { el.style.background='#111'; el.style.color:'#DDD'; };
        el.onclick = b.act;
        uiContainer.appendChild(el);
    });
}

function drawInventory() {
    const box = document.createElement('div');
    Object.assign(box.style, {
        position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:'600px', minHeight:'400px', border:'2px solid #FFD700', background:'rgba(20,20,20,0.9)',
        padding:'20px', display:'flex', flexWrap:'wrap'
    });
    box.innerHTML = `<div style="width:100%;color:#FFD700;font-size:24px;margin-bottom:20px">背包 (按 E 关闭)</div>`;
    
    ITEMS.forEach((n, i) => {
        const s = document.createElement('div');
        const sel = (i === currentItemIndex); // 高亮当前选中物品
        Object.assign(s.style, {
            width:'70px', height:'70px', margin:'10px', border: sel?'3px solid #FFF':'1px solid #555',
            background: sel?'#333':'#111', color: sel?'#FFF':'#888',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            cursor:'pointer', fontSize:'14px'
        });
        s.innerHTML = `<div>${n}</div><div style='font-size:10px; margin-top:5px'>[${i+1}]</div>`;
        s.onclick = () => {
            currentItemIndex = i;
            updateUI();
        };
        box.appendChild(s);
    });
    uiContainer.appendChild(box);
    uiContainer.onclick = (e) => { if(e.target===uiContainer) toggleInventory(); };
}

function drawChest() {
    const box = document.createElement('div');
    Object.assign(box.style, {
        position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:'400px', minHeight:'300px', border:'2px solid #FFA500', background:'rgba(50,30,10,0.9)',
        padding:'20px', display:'flex', flexWrap:'wrap'
    });
    box.innerHTML = `<div style="width:100%;color:#FFA500;font-size:24px;margin-bottom:20px">箱子 (按 E 打开背包)</div>`;
    
    CHEST_ITEMS.forEach((n, i) => {
        const s = document.createElement('div');
        Object.assign(s.style, {
            width:'70px', height:'70px', margin:'10px', border:'1px solid #555',
            background:'#331', color:'#A85',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            cursor:'pointer', fontSize:'14px'
        });
        s.innerHTML = `<div>${n}</div><div style='font-size:10px; margin-top:5px'>[R]</div>`;
        s.onclick = () => {
            // 将箱子中的物品转移到背包中
            // 寻找背包中第一个空位
            const emptySlotIndex = ITEMS.findIndex(item => item === "空");
            if (emptySlotIndex !== -1) {
                ITEMS[emptySlotIndex] = n; // 将物品放入空位
                CHEST_ITEMS.splice(i, 1); // 从箱子中移除物品
                updateUI(); // 更新UI
            }
        };
        box.appendChild(s);
    });
    uiContainer.appendChild(box);
}

function drawBothInterfaces() {
    // 创建背包界面
    const invBox = document.createElement('div');
    Object.assign(invBox.style, {
        position:'absolute', top:'60%', left:'50%', transform:'translate(-50%,-50%)',
        width:'600px', minHeight:'200px', border:'2px solid #FFD700', background:'rgba(20,20,20,0.9)',
        padding:'20px', display:'flex', flexWrap:'wrap'
    });
    invBox.innerHTML = `<div style="width:100%;color:#FFD700;font-size:20px;margin-bottom:10px;text-align:center">背包 (按 E 返回箱子)</div>`;
    
    ITEMS.forEach((n, i) => {
        const s = document.createElement('div');
        const sel = (i === currentItemIndex); // 高亮当前选中物品
        Object.assign(s.style, {
            width:'60px', height:'60px', margin:'5px', border: sel?'2px solid #FFF':'1px solid #555',
            background: sel?'#333':'#111', color: sel?'#FFF':'#888',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            cursor:'pointer', fontSize:'12px'
        });
        s.innerHTML = `<div>${n}</div><div style='font-size:8px; margin-top:2px'>[${i+1}]</div>`;
        s.onclick = () => {
            currentItemIndex = i;
            updateUI();
        };
        invBox.appendChild(s);
    });
    uiContainer.appendChild(invBox);
    
    // 创建箱子界面
    const chestBox = document.createElement('div');
    Object.assign(chestBox.style, {
        position:'absolute', top:'30%', left:'50%', transform:'translate(-50%,-50%)',
        width:'400px', minHeight:'200px', border:'2px solid #FFA500', background:'rgba(50,30,10,0.9)',
        padding:'20px', display:'flex', flexWrap:'wrap'
    });
    chestBox.innerHTML = `<div style="width:100%;color:#FFA500;font-size:20px;margin-bottom:10px;text-align:center">箱子 (点击物品拖入背包)</div>`;
    
    CHEST_ITEMS.forEach((n, i) => {
        const s = document.createElement('div');
        Object.assign(s.style, {
            width:'60px', height:'60px', margin:'5px', border:'1px solid #555',
            background:'#331', color:'#A85',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            cursor:'pointer', fontSize:'12px'
        });
        s.innerHTML = `<div>${n}</div><div style='font-size:8px; margin-top:2px'>[R]</div>`;
        s.onclick = () => {
            // 将箱子中的物品转移到背包中
            // 寻找背包中第一个空位
            const emptySlotIndex = ITEMS.findIndex(item => item === "空");
            if (emptySlotIndex !== -1) {
                ITEMS[emptySlotIndex] = n; // 将物品放入空位
                CHEST_ITEMS.splice(i, 1); // 从箱子中移除物品
                // 修复：移除强制状态跳转逻辑，仅更新UI
                updateUI(); 
            }
        };
        chestBox.appendChild(s);
    });
    uiContainer.appendChild(chestBox);
}

function startGame() {
    currentState = STATE.PLAYING;
    // 修复：完善防御性判断
    if (houses.length > 0) {
        const chestHouse = houses[0];
        // 确保 chestHouse 有 x 和 z 属性
        if (chestHouse && chestHouse.x !== undefined && chestHouse.z !== undefined) {
            player.pos.set(chestHouse.x, CONFIG.heightStand, chestHouse.z - 20);
        } else {
            player.pos.set(0, 2, 0); // 回退
        }
    } else {
        player.pos.set(0, 2, 0);
    }
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
    currentState = STATE.MENU;
    document.exitPointerLock();
    updateUI();
}
function toggleInventory() {
    if (currentState === STATE.PLAYING) {
        currentState = STATE.INV;
        document.exitPointerLock();
    } else if (currentState === STATE.INV) {
        currentState = STATE.PLAYING;
        setTimeout(() => renderer.domElement.requestPointerLock(), 50);
    }
    updateUI();
}
