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
    cChest: 0xFFD700 // 箱子颜色
};

// ==========================================
// 2. 全局变量
// ==========================================
let camera, scene, renderer;
let linesGroup, chestGroup; // 新增 chestGroup
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

let keyLocks = { o: false, b: false };

const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, INV: 3, CHEST: 4, BOTH: 5 };
let currentState = STATE.MENU;
let isLocked = false;

const houses = [];

// 物品系统
const ITEMS = ["空", "空", "空", "空", "空", "空", "空", "空", "空", "空"]; 
let currentItemIndex = 0;

// 箱子系统
let chestHouseIndex = -1; 
const CHEST_ITEMS = ["神秘的信件"]; 

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
    window.addEventListener('wheel', onWheel);
    
    renderer.domElement.addEventListener('click', () => {
        if (currentState === STATE.PLAYING && !isLocked) {
            renderer.domElement.requestPointerLock();
        }
    });

    // 右键打开箱子
    renderer.domElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (currentState === STATE.PLAYING && chestHouseIndex !== -1) {
            const chestHouse = houses[chestHouseIndex];
            const dist = Math.sqrt((player.pos.x - chestHouse.x)**2 + (player.pos.z - chestHouse.z)**2);
            if (dist < 100) { 
                currentState = STATE.CHEST;
                document.exitPointerLock();
                updateUI();
            }
        }
    });

    document.addEventListener('pointerlockchange', () => {
        isLocked = (document.pointerLockElement === renderer.domElement);
    });

    renderer.render(scene, camera);
}

// ==========================================
// 4. 世界构建 (✅ 修复：添加箱子模型)
// ==========================================
function createWorld() {
    linesGroup = new THREE.Group();
    chestGroup = new THREE.Group(); // 初始化箱子组
    scene.add(linesGroup);
    scene.add(chestGroup);

    // 地面网格
    const gridSize = 10000;
    const gridDivs = 400;
    const geoGrid = new THREE.GridHelper(gridSize, gridDivs, CONFIG.cGrid, CONFIG.cGrid);
    geoGrid.position.y = 0;
    
    const matGlow = new THREE.LineBasicMaterial({ color: CONFIG.cGrid, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending });
    const matBright = new THREE.LineBasicMaterial({ color: CONFIG.cGrid, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    
    scene.add(new THREE.LineSegments(geoGrid.geometry, matGlow));
    const gridBright = new THREE.LineSegments(geoGrid.geometry, matBright);
    gridBright.position.y = 0.1;
    scene.add(gridBright);

    const cols = CONFIG.gridCols;
    const rows = CONFIG.gridRows;
    const startX = -((cols * CONFIG.spacing) / 2) + CONFIG.spacing/2;
    const startZ = -((rows * CONFIG.spacing) / 2) + CONFIG.spacing/2;

    const houseGeoCache = createHouseGeometry();
    const doorGeoCache = createDoorGeometry();
    const chestGeo = new THREE.BoxGeometry(10, 10, 10); // 箱子几何体
    const chestMat = new THREE.MeshBasicMaterial({ color: CONFIG.cChest, wireframe: true });

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
            mesh: null, doorMesh: null, chestMesh: null, hasChest: false
        };

        // 房子墙体
        const mesh = new THREE.LineSegments(houseGeoCache, new THREE.LineBasicMaterial({ 
            color: CONFIG.cWall, transparent: true, opacity: 1, depthWrite: false, toneMapped: false 
        }));
        mesh.position.set(x, CONFIG.h/2, z);
        mesh.visible = false;
        linesGroup.add(mesh);
        house.mesh = mesh;

        // 房子门
        const doorMesh = new THREE.LineSegments(doorGeoCache, new THREE.LineBasicMaterial({ 
            color: CONFIG.cDoor, depthWrite: false, toneMapped: false 
        }));
        doorMesh.position.set(x, 0, z);
        doorMesh.visible = false;
        linesGroup.add(doorMesh);
        house.doorMesh = doorMesh;

        // ✅ 如果是第一个房子，添加箱子
        if (i === 0) {
            chestHouseIndex = 0;
            house.hasChest = true;
            const chestMesh = new THREE.Mesh(chestGeo, chestMat);
            chestMesh.position.set(x + 20, 5, z + 20); // 箱子位置 (房子角落)
            chestMesh.visible = false;
            chestGroup.add(chestMesh);
            house.chestMesh = chestMesh;
        }

        houses.push(house);
    }
}

function createHouseGeometry() {
    const hw = CONFIG.w/2, hd = CONFIG.d/2, hh = CONFIG.h/2;
    const points = [];
    const addLine = (x1,y1,z1, x2,y2,z2) => points.push(x1,y1,z1, x2,y2,z2);

    // 楼层横线
    for(let i=0; i<=CONFIG.h; i+=CONFIG.floorH) {
        const y = i - hh;
        addLine(-hw, y, -hd, hw, y, -hd);
        addLine(hw, y, -hd, hw, y, hd);
        addLine(hw, y, hd, -hw, y, hd);
        addLine(-hw, y, hd, -hw, y, -hd);
    }
    
    // 柱子
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    corners.forEach(([cx, cz]) => addLine(cx, -hh, cz, cx, hh, cz));

    // 内部网格
    for(let i=1; i<CONFIG.h; i+=CONFIG.floorH) {
        const y = i - hh;
        for(let k=-hw; k<=hw; k+=20) addLine(k, y, -hd, k, y, hd);
        for(let k=-hd; k<=hd; k+=20) addLine(-hw, y, k, hw, y, k);
    }

    // ✅ 修复：楼梯几何体逻辑优化
    const stairStartX = -hw + 10;
    const stairStartZ = hd - 5;
    let cx = stairStartX, cz = stairStartZ, cy = -hh;
    let dir = -1; // -1 向负Z，1 向正Z
    const stepsPerFlight = 10;
    const totalFlights = (CONFIG.h / CONFIG.floorH) - 1;
    const stepH = CONFIG.floorH / stepsPerFlight;
    const stepD = 4; 

    for (let f = 0; f < totalFlights; f++) {
        for (let s = 0; s < stepsPerFlight; s++) {
            const ny = cy + stepH;
            const nz = cz + stepD * dir;
            
            // 绘制台阶
            points.push(cx-6, cy, nz, cx+6, cy, nz); // 踏面
            points.push(cx-6, cy, nz, cx-6, ny, nz); // 侧面竖线
            points.push(cx+6, cy, nz, cx+6, ny, nz); // 侧面竖线
            points.push(cx-6, ny, nz, cx+6, ny, nz); // 踢面顶线
            
            cy = ny;
            cz = nz;
        }
        // 平台转折
        cz += 5 * dir; 
        dir *= -1; // 掉头
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
        if (pos.y < 0 || pos.y > CONFIG.h) continue;
        
        // 门检测
        const frontZ = maxZ;
        const dw = CONFIG.doorW/2;
        if (Math.abs(pos.z - frontZ) < r) {
            if (pos.y < CONFIG.doorH && pos.x > h.x - dw - r && pos.x < h.x + dw + r) continue;
            if (pos.x >= minX - r && pos.x <= maxX + r) return true;
        }
        // 墙检测
        if (pos.x > minX - r && pos.x < maxX + r && pos.z > minZ - r && pos.z < maxZ + r) {
            if (pos.x <= minX + r || pos.x >= maxX - r || pos.z <= minZ + r || pos.z >= maxZ - r) return true;
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
            // 楼梯检测
            const calculatedStairY = getStairHeightRobust(player.pos.x, player.pos.z, h.x, h.z);
            if (calculatedStairY !== null) {
                onStair = true;
                stairY = calculatedStairY;
                if (stairY > supportY) supportY = stairY;
            }
            // 楼层检测
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
        if (player.pos.y > supportY + targetH + 1.0) player.grounded = false;
    }
}

// ✅ 修复：楼梯高度计算逻辑
function getStairHeightRobust(x, z, hx, hz) {
    const hw = CONFIG.w/2;
    const hd = CONFIG.d/2;
    const stairStartX = hx - hw + 10;
    const stairStartZ = hz + hd - 5;
    
    // 宽度检测
    if (x < stairStartX - 7 || x > stairStartX + 7) return null;
    
    // 计算在楼梯上的相对距离
    // 楼梯是之字形，每段长 40 (10步 * 4深度)，共 (H/30 - 1) 段
    const totalFlights = (CONFIG.h / CONFIG.floorH) - 1;
    const flightLength = 40;
    const totalLength = totalFlights * flightLength;
    
    let distFromStart = stairStartZ - z; // 初始方向是负Z
    
    // 简单的单向距离估算（假设玩家主要在楼梯路径上）
    // 如果距离在总长度范围内
    if (distFromStart > -10 && distFromStart < totalLength + 10) {
        // 计算当前在第几段
        let currentZ = stairStartZ;
        let currentY = -CONFIG.h/2; // 楼梯起始Y
        let dir = -1;
        
        for(let i=0; i<totalFlights; i++) {
            let nextZ = currentZ + (flightLength * dir);
            // 检查Z是否在当前这一段内
            if ((dir === -1 && z <= currentZ && z >= nextZ) || (dir === 1 && z >= currentZ && z <= nextZ)) {
                // 在当前段内插值
                let segmentDist = Math.abs(z - currentZ);
                let h = (segmentDist / flightLength) * CONFIG.floorH;
                return currentY + h;
            }
            currentZ = nextZ;
            currentY += CONFIG.floorH;
            dir *= -1;
        }
    }
    return null;
}

// ==========================================
// 6. 渲染管理 (✅ 修复：显示箱子)
// ==========================================
function updateVisibility() {
