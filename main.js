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

// 新增：背包、地图、笔记本状态
let inventoryOpen = false;
let mapVisible = false;
let notebookOpen = false;
let selectedSlot = 0; // 鼠标滚轮切换的物品索引

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
// 3. 初始化 (✅ 修复黑屏问题)
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
    document.addEventListener('wheel', onWheel); // 新增：监听鼠标滚轮

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
// 4. 辅助几何体创建 (修复函数未定义问题)
// ==========================================
// ✅ 修复：将这两个函数移到 createWorld 之前定义
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
        addLine(cx-6, cy, cz, cx+6, cy, cz);
        addLine(cx-6, cy, pz, cx+6, cy, pz);
        addLine(cx-6, cy, cz, cx-6, cy, pz);
        addLine(cx+6, cy, cz, cx+6, cy, pz);
        
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

// ==========================================
// 5. 世界构建
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
// 6. 物理与碰撞
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
// 7. 渲染管理
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
    updateUIOverlay(); // 新增：更新右上角地图UI
    renderer.render(scene, camera);
}

// ==========================================
// 8. 输入处理 (包含所有新功能)
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
    
    // 1. E键开关背包
    if (code === 'KeyE' && !keyLocks.e) {
        toggleInventory();
        keyLocks.e = true;
    }
    
    // 2. O键暂停/继续
    if (code === 'KeyO') {
        if (currentState === STATE.PLAYING) {
            currentState = STATE.PAUSED;
            document.exitPointerLock();
        } else if (currentState === STATE.PAUSED) {
            currentState = STATE.PLAYING;
            renderer.domElement.requestPointerLock();
        }
        updateUI();
    }

    // 3. P键开关地图
    if (code === 'KeyP') {
        mapVisible = !mapVisible;
        updateUIOverlay();
    }

    // 4. B键开关笔记本
    if (code === 'KeyB') {
        notebookOpen = !notebookOpen;
        updateUIOverlay();
    }

    if (code === 'Escape') {
        if (inventoryOpen) {
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

// 5. 鼠标滑轮切物品
function onWheel(e) {
    if (currentState !== STATE.PLAYING) return;
    
    // 阻止默认滚动行为（如页面滚动）
    e.preventDefault();
    
    if (e.deltaY < 0) {
        // 向上滚动，切到上一个物品
        selectedSlot = (selectedSlot - 1 + 9) % 9; // 假设有9个物品
    } else {
        // 向下滚动，切到下一个物品
        selectedSlot = (selectedSlot + 1) % 9;
    }
    // 这里可以添加视觉反馈，比如在UI上显示当前选中
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
// 9. UI 系统 (包含新功能UI)
// ==========================================
let mapCanvas, mapCtx, notebookEl;

function createUI() {
    uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, {
        position:'absolute', top:0, left:0, width:'100%', height:'100%',
        pointerEvents:'none', fontFamily:'"Microsoft YaHei", "Courier New", monospace', color:'#FFF', userSelect:'none'
    });
    document.body.appendChild(uiContainer);
    
    // 创建笔记本元素 (隐藏状态)
    notebookEl = document.createElement('div');
    notebookEl.style.cssText = `
        position: absolute; top: 20px; left: 20px; 
        width: 300px; height: 400px; 
        background: rgba(0, 0, 0, 0.8); border: 2px solid #FFD700; 
        color: #FFF; padding: 15px; font-size: 14px; line-height: 1.6;
        display: none; overflow-y: auto; z-index: 1000;
    `;
    notebookEl.innerHTML = `<h3>📝 笔记本</h3><p>这里记录着你的任务和线索...</p>`;
    document.body.appendChild(notebookEl);
    
    updateUI();
}

function updateUI() {
    uiContainer.innerHTML = '';
    uiContainer.style.pointerEvents = (currentState === STATE.MENU || currentState === STATE.PAUSED) ? 'auto' : 'none';

    if (currentState === STATE.PLAYING || inventoryOpen) {
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
    }
}

// 新增：右上角地图UI
function createMiniMap() {
    if (mapCanvas) return; // 防止重复创建
    
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = 200;
    mapCanvas.height = 200;
    mapCanvas.style.cssText = `
        position: absolute; top: 20px; right: 20px; 
        border: 2px solid #00FFFF; background: rgba(0, 0, 0, 0.7);
        pointer-events: none; display: none; z-index: 1000;
    `;
    document.body.appendChild(mapCanvas);
    mapCtx = mapCanvas.getContext('2d');
}

function updateUIOverlay() {
    createMiniMap(); // 初始化地图
    
    // 控制地图显示
    mapCanvas.style.display = mapVisible ? 'block' : 'none';
    
    if (mapVisible) {
        drawMiniMap();
    }
    
    // 控制笔记本显示
    notebookEl.style.display = notebookOpen ? 'block' : 'none';
}

function drawMiniMap() {
    const ctx = mapCtx;
    const scale = 0.5;
    const radius = 8;
    
    // 清除画布
    ctx.clearRect(0, 0, 200, 200);
    
    // 绘制背景格子
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 200, 200);
    
    // 绘制玩家位置 (中心点)
    ctx.fillStyle = '#00FF00';
    ctx.beginPath();
    ctx.arc(100, 100, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制朝向箭头
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100, 100);
    ctx.lineTo(100 + Math.cos(player.yaw) * 15, 100 - Math.sin(player.yaw) * 15);
    ctx.stroke();
    
    // 绘制附近的房子 (简化版)
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    for (const h of houses) {
        const dx = (h.x - player.pos.x) * scale;
        const dz = (h.z - player.pos.z) * scale;
        const screenX = 100 + dx;
        const screenZ = 100 - dz; // Z轴翻转
        
        if (screenX > -50 && screenX < 250 && screenZ > -50 && screenZ < 250) {
            ctx.strokeRect(screenX - 2, screenZ - 2, 4, 4);
        }
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

function toggleInventory() {
    inventoryOpen = !inventoryOpen;
    if (inventoryOpen) {
        // 打开背包时显示UI
        drawInventory();
    } else {
        // 关闭背包时移除UI
        const invUI = document.getElementById('inventoryUI');
        if (invUI) invUI.remove();
    }
}

function drawInventory() {
    // 移除旧的UI（如果有）
    const oldInv = document.getElementById('inventoryUI');
    if (oldInv) oldInv.remove();
    
    const box = document.createElement('div');
    box.id = 'inventoryUI';
    Object.assign(box.style, {
        position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:'600px', minHeight:'400px', border:'2px solid #FFD700', background:'rgba(20,20,20,0.9)',
        padding:'20px', display:'flex', flexWrap:'wrap', zIndex: '1001'
    });
    box.innerHTML = `<div style="width:100%;color:#FFD700;font-size:24px;margin-bottom:20px">背包 (按 E 关闭)</div>`;
    
    const items = ["撬棍", "胶带", "钥匙", "地图", "照片", "打火机", "纸条", "收音机", "空位"];
    
    items.forEach((n, i) => {
        const s = document.createElement('div');
        const sel = (i===selectedSlot);
        Object.assign(s.style, {
            width:'70px', height:'70px', margin:'10px', border: sel?'3px solid #FFF':'1px solid #555',
            background: sel?'#333':'#111', color: sel?'#FFF':'#888',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            cursor:'pointer', fontSize:'14px'
        });
        s.innerHTML = `<div>${n}</div><div style='font-size:10px; margin-top:5px'>[${i+1}]</div>`;
        box.appendChild(s);
    });
    document.body.appendChild(box);
    
    // 点击背景关闭背包
    box.addEventListener('click', (e) => {
        if (e.target === box) toggleInventory();
    });
}

function startGame() {
    currentState = STATE.PLAYING;
    player.pos.set(0, 2, 0);
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
