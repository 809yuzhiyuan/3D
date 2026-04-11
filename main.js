// main.js
// 注意：这里不需要 import，因为 THREE 已经在全局作用域了

// ==========================================
// 1. 配置
// ==========================================
const CONFIG = {
    fov: 75, near: 0.1, far: 2000,
    bgColor: 0x050505, fogColor: 0x050505, fogDensity: 0.0015,
    heightStand: 1.7, heightCrouch: 0.9, radius: 0.4,
    speedWalk: 12.0, speedRun: 35.0, speedCrouch: 2.0,
    jumpForce: 12.0, gravity: 40.0, sensitivity: 0.002, 
    count: 200, gridCols: 20, gridRows: 10, spacing: 150,
    w: 100, h: 90, d: 80, floorH: 30, doorW: 20, doorH: 24,
    cWall: 0xFFFFFF, cDoor: 0xFF0055, cGrid: 0x00FFFF
};

// ==========================================
// 2. 全局变量
// ==========================================
let camera, scene, renderer;
let linesGroup, crosshair, uiContainer;
let mapUI = null, mapDot = null, mapVisible = false;
let notebookEl = null;

const player = {
    pos: new THREE.Vector3(0, 2, 0),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0, pitch: 0, grounded: true, crouching: false
};

const keys = { w: false, a: false, s: false, d: false, space: false, shift: false, ctrl: false };
let keyLocks = { e: false, o: false, b: false, p: false }; 

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

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    createWorld();
    createCrosshair();
    createUI();

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
// 4. 世界构建
// ==========================================
function createWorld() {
    linesGroup = new THREE.Group();
    scene.add(linesGroup);

    const gridSize = 10000, gridDivs = 400;
    const geoGrid = new THREE.GridHelper(gridSize, gridDivs, CONFIG.cGrid, CONFIG.cGrid);
    geoGrid.position.y = 0;
    const matGlow = new THREE.LineBasicMaterial({ color: CONFIG.cGrid, transparent: true, opacity: 0.15 });
    const matBright = new THREE.LineBasicMaterial({ color: CONFIG.cGrid, transparent: true, opacity: 0.8 });
    scene.add(new THREE.LineSegments(geoGrid.geometry, matGlow));
    scene.add(new THREE.LineSegments(geoGrid.geometry, matBright));

    const houseGeoCache = createHouseGeometry();
    const doorGeoCache = createDoorGeometry();

    const cols = CONFIG.gridCols, rows = CONFIG.gridRows;
    const startX = -((cols * CONFIG.spacing) / 2) + CONFIG.spacing/2;
    const startZ = -((rows * CONFIG.spacing) / 2) + CONFIG.spacing/2;

    for (let i = 0; i < CONFIG.count; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const x = startX + col * CONFIG.spacing, z = startZ + row * CONFIG.spacing;
        if (Math.abs(x) < 60 && Math.abs(z) < 60) continue;

        const house = { x, z, minX: x - CONFIG.w/2, maxX: x + CONFIG.w/2, minZ: z - CONFIG.d/2, maxZ: z + CONFIG.d/2, mesh: null, doorMesh: null };
        
        const mesh = new THREE.LineSegments(houseGeoCache, new THREE.LineBasicMaterial({ color: CONFIG.cWall, transparent: true, opacity: 1 }));
        mesh.position.set(x, CONFIG.h/2, z);
        mesh.visible = false;
        linesGroup.add(mesh);
        house.mesh = mesh;

        const doorMesh = new THREE.LineSegments(doorGeoCache, new THREE.LineBasicMaterial({ color: CONFIG.cDoor }));
        doorMesh.position.set(x, 0, z);
        doorMesh.visible = false;
        linesGroup.add(doorMesh);
        house.doorMesh = doorMesh;

        houses.push(house);
    }
}

function createHouseGeometry() {
    const hw = CONFIG.w/2, hd = CONFIG.d/2, hh = CONFIG.h/2;
    const points = [];
    const addLine = (x1,y1,z1, x2,y2,z2) => points.push(x1,y1,z1, x2,y2,z2);
    for(let i=0; i<=CONFIG.h; i+=CONFIG.floorH) {
        const y = i - hh;
        addLine(-hw, y, -hd, hw, y, -hd); addLine(hw, y, -hd, hw, y, hd);
        addLine(hw, y, hd, -hw, y, hd); addLine(-hw, y, hd, -hw, y, -hd);
    }
    [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].forEach(([cx, cz]) => addLine(cx, -hh, cz, cx, hh, cz));
    for(let i=1; i<CONFIG.h; i+=CONFIG.floorH) {
        const y = i - hh;
        for(let k=-hw; k<=hw; k+=20) addLine(k, y, -hd, k, y, hd);
        for(let k=-hd; k<=hd; k+=20) addLine(-hw, y, k, hw, y, k);
    }
    // 楼梯
    const sx = -hw + 10, sz = hd - 5;
    let cx = sx, cz = sz, cy = -hh, dir = -1;
    for(let f=0; f<CONFIG.h/CONFIG.floorH - 1; f++) {
        for(let s=0; s<10; s++) {
            const ny = cy + CONFIG.floorH/10, nz = cz + 4*dir;
            points.push(cx-6, ny, nz, cx+6, ny, nz); points.push(cx, cy, nz, cx, ny, nz);
            cy = ny; cz = nz;
        }
        const pz = cz + 5*dir;
        addLine(cx-6, cy, cz, cx+6, cy, cz); addLine(cx-6, cy, pz, cx+6, cy, pz);
        addLine(cx-6, cy, cz, cx-6, cy, pz); addLine(cx+6, cy, cz, cx+6, cy, pz);
        dir *= -1; cz = pz + 5*dir;
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

function createDoorGeometry() {
    const hw = CONFIG.w/2, hd = CONFIG.d/2, dw = CONFIG.doorW/2, dh = CONFIG.doorH;
    const points = [];
    points.push(-dw, 0, hd, -dw, dh, hd); points.push(-dw, dh, hd, dw, dh, hd); points.push(dw, dh, hd, dw, 0, hd);
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

function createCrosshair() {
    const cvs = document.createElement('canvas'); cvs.width=64; cvs.height=64;
    const ctx = cvs.getContext('2d'); ctx.strokeStyle='#FFF'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(32,16); ctx.lineTo(32,24); ctx.moveTo(32,40); ctx.lineTo(32,48);
    ctx.moveTo(16,32); ctx.lineTo(24,32); ctx.moveTo(40,32); ctx.lineTo(48,32); ctx.stroke();
    const tex = new THREE.CanvasTexture(cvs);
    crosshair = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, depthTest:false}));
    crosshair.scale.set(0.5,0.5,1);
    scene.add(crosshair);
}

// ==========================================
// 5. 物理与逻辑
// ==========================================
function updatePhysics() {
    const dt = 0.016;
    if (keys.ctrl && !player.crouching) { player.crouching = true; player.pos.y = Math.max(player.pos.y, CONFIG.heightCrouch); player.vel.y = 0; }
    else if (!keys.ctrl && player.crouching) { player.crouching = false; player.pos.y = Math.max(player.pos.y, CONFIG.heightStand); }

    const spd = player.crouching ? CONFIG.speedCrouch : (keys.shift ? CONFIG.speedRun : CONFIG.speedWalk);
    const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
    const fwd = new THREE.Vector3(-sinY, 0, -cosY), right = new THREE.Vector3(-cosY, 0, sinY);
    const move = new THREE.Vector3(0,0,0);
    if (keys.w) move.add(fwd); if (keys.s) move.sub(fwd);
    if (keys.a) move.add(right); if (keys.d) move.sub(right);

    const len = move.length();
    if (len > 0) {
        move.normalize().multiplyScalar(spd * dt);
        const nextX = player.pos.clone(); nextX.x += move.x;
        if (!checkCollision(nextX)) player.pos.x = nextX.x;
        const nextZ = player.pos.clone(); nextZ.z += move.z;
        if (!checkCollision(nextZ)) player.pos.z = nextZ.z;
    }

    if (keys.space && player.grounded && !player.crouching) { player.vel.y = CONFIG.jumpForce; player.grounded = false; }
    player.vel.y -= CONFIG.gravity * dt;
    player.pos.y += player.vel.y * dt;
    checkGroundAndStairs();
    camera.position.copy(player.pos);
}

function checkCollision(pos) {
    const r = CONFIG.radius;
    for (const h of houses) {
        if (Math.abs(pos.x - h.x) > CONFIG.w/2 + r + 10 || Math.abs(pos.z - h.z) > CONFIG.d/2 + r + 10) continue;
        if (pos.y < 0 || pos.y > CONFIG.h) continue;
        const frontZ = h.maxZ, dw = CONFIG.doorW/2, dh = CONFIG.doorH;
        if (Math.abs(pos.z - frontZ) < r) {
            if (pos.y < dh && pos.x > h.x - dw - r && pos.x < h.x + dw + r) continue;
            if (pos.x >= h.minX - r && pos.x <= h.maxX + r) return true;
        }
        if (pos.x > h.minX - r && pos.x < h.maxX + r && pos.z > h.minZ - r && pos.z < h.maxZ + r) return true;
    }
    return false;
}

function checkGroundAndStairs() {
    let supportY = 0;
    for (const h of houses) {
        if (Math.abs(player.pos.x - h.x) > CONFIG.w/2 + 10 || Math.abs(player.pos.z - h.z) > CONFIG.d/2 + 10) continue;
        if (player.pos.x > h.minX && player.pos.x < h.maxX && player.pos.z > h.minZ && player.pos.z < h.maxZ) {
            for(let i=1; i<CONFIG.h; i+=CONFIG.floorH) {
                if (player.pos.y > i - 2 && player.pos.y < i + 2 && i > supportY) supportY = i;
            }
        }
    }
    const targetH = player.crouching ? CONFIG.heightCrouch : CONFIG.heightStand;
    const standY = supportY + targetH;
    if (player.pos.y <= standY + 0.5 && player.vel.y <= 0) {
        player.pos.y = standY; player.vel.y = 0; player.grounded = true;
    } else { player.grounded = false; }
}

function updateVisibility() {
    const renderDist = 400;
    houses.forEach(h => {
        const dist = Math.sqrt((player.pos.x - h.x)**2 + (player.pos.z - h.z)**2);
        const visible = dist < renderDist;
        if (h.mesh.visible !== visible) { h.mesh.visible = visible; h.doorMesh.visible = visible; }
        if (visible) {
            const alpha = Math.max(0.1, 1.0 - dist/renderDist);
            h.mesh.material.opacity = alpha; h.doorMesh.material.opacity = alpha;
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
// 6. 输入处理 (按键逻辑)
// ==========================================
function onKeyDown(e) {
    const code = e.code;
    if (code === 'KeyW') keys.w = true; if (code === 'KeyS') keys.s = true;
    if (code === 'KeyA') keys.a = true; if (code === 'KeyD') keys.d = true;
    if (code === 'Space') keys.space = true;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = true;
    if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = true;

    // E键：开关背包
    if (code === 'KeyE' && !keyLocks.e) {
        if (currentState === STATE.PLAYING) toggleInventory();
        keyLocks.e = true;
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
    if (code === 'KeyP' && !keyLocks.p) {
        mapVisible = !mapVisible;
        mapUI.style.display = mapVisible ? 'block' : 'none';
        keyLocks.p = true;
    }
    
    // B键：开关笔记本
    if (code === 'KeyB' && !keyLocks.b) {
        toggleNotebook();
        keyLocks.b = true;
    }

    if (code === 'Escape') {
        if (currentState === STATE.INV) toggleInventory();
        else if (currentState === STATE.PLAYING) {
            currentState = STATE.PAUSED;
            document.exitPointerLock();
            updateUI();
        }
    }
}

function onKeyUp(e) {
    const code = e.code;
    if (code === 'KeyW') keys.w = false; if (code === 'KeyS') keys.s = false;
    if (code === 'KeyA') keys.a = false; if (code === 'KeyD') keys.d = false;
    if (code === 'Space') keys.space = false;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = false;
    if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = false;
    if (code === 'KeyE') keyLocks.e = false;
    if (code === 'KeyO') keyLocks.o = false;
    if (code === 'KeyB') keyLocks.b = false;
    if (code === 'KeyP') keyLocks.p = false;
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
}

// ==========================================
// 7. UI 系统 (HTML 界面)
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, {
        position:'absolute', top:0, left:0, width:'100%', height:'100%',
        pointerEvents:'none', fontFamily:'"Microsoft YaHei", monospace', color:'#FFF', userSelect:'none'
    });
    document.body.appendChild(uiContainer);
    
    // 创建地图 UI
    createMapUI();
    // 创建笔记本 UI
    createNotebookUI();
    
    updateUI();
}

function createMapUI() {
    mapUI = document.createElement('div');
    Object.assign(mapUI.style, {
        position: 'absolute', top: '10px', right: '10px',
        width: '150px', height: '150px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        border: '2px solid #00FFFF',
        display: 'none', pointerEvents: 'none'
    });
    mapDot = document.createElement('div');
    Object.assign(mapDot.style, {
        position: 'absolute', top: '50%', left: '50%',
        width: '8px', height: '8px', backgroundColor: '#FF0000',
        borderRadius: '50%', transform: 'translate(-50%, -50%)'
    });
    mapUI.appendChild(mapDot);
    document.body.appendChild(mapUI);
}
