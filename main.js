// main.js
import * as THREE from 'three';

// ==========================================
// 1. 配置 (Configuration)
// ==========================================
const CONFIG = {
    fov: 75, near: 0.1, far: 2000,
    bgColor: 0x050505, fogColor: 0x050505, fogDensity: 0.0015,
    heightStand: 1.7, heightCrouch: 0.9, radius: 0.4,
    speedWalk: 12.0, speedRun: 35.0, speedCrouch: 2.0,
    jumpForce: 12.0, gravity: 40.0, sensitivity: 0.002,
    count: 200, gridCols: 20, gridRows: 10, spacing: 150,
    w: 100, h: 90, d: 80, floorH: 30, doorW: 20, doorH: 24,
    cWall: 0xFFFFFF, cDoor: 0xFF0055, cGrid: 0x00FFFF, cStair: 0xFFAA00
};

// ==========================================
// 2. 全局变量
// ==========================================
let camera, scene, renderer;
let linesGroup, crosshair, uiContainer;

// 3D 地图与记事本变量
let mapPlane = null;      // 地图网格平面
let mapTexture = null;    // 地图纹理
let mapCtx = null;        // 地图绘图上下文
let notebookPlane = null; // 记事本平面
let notebookTexture = null;
let notebookCtx = null;

const player = {
    pos: new THREE.Vector3(0, 2, 0),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0, pitch: 0, grounded: true, crouching: false
};

const keys = { w: false, a: false, s: false, d: false, space: false, shift: false, ctrl: false };
let keyLocks = { b: false, p: false }; // 按键锁

const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2 };
let currentState = STATE.PLAYING; // 默认直接开始
let isLocked = false;

const houses = [];
let notebookText = "点击我输入笔记..."; // 记事本内容

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
    document.body.appendChild(renderer.domElement);

    createWorld();
    createCrosshair();
    create3DInterfaces(); // 创建 3D 地图和记事本
    createSimpleUI();     // 创建简单的文字提示

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    
    renderer.domElement.addEventListener('click', onSceneClick); // 监听点击以输入笔记

    document.addEventListener('pointerlockchange', () => {
        isLocked = (document.pointerLockElement === renderer.domElement);
    });

    renderer.render(scene, camera);
}

// ==========================================
// 4. 3D 界面系统 (核心功能)
// ==========================================
function create3DInterfaces() {
    // --- 1. 创建 3D 地图 ---
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = 512;
    mapCanvas.height = 512;
    mapCtx = mapCanvas.getContext('2d');
    mapTexture = new THREE.CanvasTexture(mapCanvas);

    const mapGeo = new THREE.PlaneGeometry(100, 100);
    const mapMat = new THREE.MeshBasicMaterial({ 
        map: mapTexture, 
        transparent: true, 
        side: THREE.DoubleSide,
        depthTest: true // 地图也参与深度测试，可悬停空中
    });
    mapPlane = new THREE.Mesh(mapGeo, mapMat);
    mapPlane.position.set(0, 50, 0); // 初始位置：高空俯瞰
    mapPlane.rotation.x = -Math.PI / 2; // 水平放置
    mapPlane.visible = false; // 初始隐藏
    scene.add(mapPlane);

    // --- 2. 创建 3D 记事本 ---
    const noteCanvas = document.createElement('canvas');
    noteCanvas.width = 512;
    noteCanvas.height = 512;
    notebookCtx = noteCanvas.getContext('2d');
    notebookTexture = new THREE.CanvasTexture(noteCanvas);

    const noteGeo = new THREE.PlaneGeometry(10, 13); // 类似 A4 纸比例
    const noteMat = new THREE.MeshBasicMaterial({ 
        map: notebookTexture, 
        side: THREE.DoubleSide,
        depthTest: true
    });
    notebookPlane = new THREE.Mesh(noteGeo, noteMat);
    notebookPlane.position.set(0, 100, 0); // 初始扔到天上去
    notebookPlane.visible = false;
    scene.add(notebookPlane);
    
    // 初始绘制一次背景
    updateNotebookTexture();
}

function updateMapTexture() {
    if (!mapPlane.visible) return;

    const w = 512, h = 512;
    const ctx = mapCtx;

    // 清空背景
    ctx.fillStyle = 'rgba(0, 20, 0, 0.8)'; // 半透明深绿背景
    ctx.fillRect(0, 0, w, h);

    // 绘制网格
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<=w; i+=20) { ctx.moveTo(i, 0); ctx.lineTo(i, h); }
    for(let i=0; i<=h; i+=20) { ctx.moveTo(0, i); ctx.lineTo(w, i); }
    ctx.stroke();

    // 绘制玩家位置 (将 3D 坐标映射到 2D 纹理)
    // 假设地图范围是 -1500 到 1500，映射到 0-512
    const scale = 512 / 3000; 
    const px = (player.pos.x + 1500) * scale;
    const py = (player.pos.z + 1500) * scale;

    // 绘制红点
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制朝向
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(player.yaw) * 15, py + Math.cos(player.yaw) * 15);
    ctx.stroke();

    mapTexture.needsUpdate = true;
}

function updateNotebookTexture() {
    const w = 512, h = 512;
    const ctx = notebookCtx;

    // 绘制纸张背景
    ctx.fillStyle = '#F5F5DC'; // 米色
    ctx.fillRect(0, 0, w, h);
    
    // 绘制横线
    ctx.strokeStyle = '#CCC';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=50; i<h; i+=40) { ctx.moveTo(20, i); ctx.lineTo(w-20, i); }
    ctx.stroke();

    // 绘制文字
    ctx.fillStyle = '#000080'; // 深蓝色墨水
    ctx.font = 'bold 30px "Courier New"';
    ctx.textAlign = 'left';
    
    // 简单的自动换行逻辑
    const lines = notebookText.split('\n');
    lines.forEach((line, i) => {
        ctx.fillText(line, 40, 80 + i * 40);
    });

    // 绘制边框
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, w, h);

    notebookTexture.needsUpdate = true;
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
    
    const matGlow = new THREE.LineBasicMaterial({ color: CONFIG.cGrid, transparent: true, opacity: 0.15, depthWrite: false });
    const matBright = new THREE.LineBasicMaterial({ color: CONFIG.cGrid, transparent: true, opacity: 0.8, depthWrite: false });
    
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
        
        if (Math.abs(x) < 60 && Math.abs(z) < 60) continue; // 留出出生点空间

        const house = {
            x, z,
            minX: x - CONFIG.w/2, maxX: x + CONFIG.w/2,
            minZ: z - CONFIG.d/2, maxZ: z + CONFIG.d/2,
            mesh: null, doorMesh: null
        };

        const mesh = new THREE.LineSegments(houseGeoCache, new THREE.LineBasicMaterial({ 
            color: CONFIG.cWall, transparent: true, opacity: 1, depthWrite: false 
        }));
        mesh.position.set(x, CONFIG.h/2, z);
        mesh.visible = false;
        linesGroup.add(mesh);
        house.mesh = mesh;

        const doorMesh = new THREE.LineSegments(doorGeoCache, new THREE.LineBasicMaterial({ 
            color: CONFIG.cDoor, depthWrite: false 
        }));
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

    // 楼梯
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
    const mat = new THREE.SpriteMaterial({map:tex, depthTest:false, depthWrite:false, renderOrder:9999});
    crosshair = new THREE.Sprite(mat);
    crosshair.scale.set(0.5,0.5,1);
    scene.add(crosshair);
}

function createSimpleUI() {
    // 仅用于显示操作提示
    uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, {
        position:'absolute', top:'10px', left:'10px', color:'#0F0', 
        fontFamily:'monospace', pointerEvents:'none', userSelect:'none',
        textShadow: '1px 1px 0 #000'
    });
    uiContainer.innerHTML = `
        WASD: 移动 | SPACE: 跳跃 | SHIFT: 加速<br>
        P: 开关3D地图 | B: 开关3D记事本<br>
        点击记事本进行编辑
    `;
    document.body.appendChild(uiContainer);
}

// ==========================================
// 6. 物理与逻辑
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
    let stairSupport = 0;
    for (const h of houses) {
        if (Math.abs(player.pos.x - h.x) > CONFIG.w/2 + 10 || Math.abs(player.pos.z - h.z) > CONFIG.d/2 + 10) continue;
        if (player.pos.x > h.minX && player.pos.x < h.maxX && player.pos.z > h.minZ && player.pos.z < h.maxZ) {
            // 检查楼层地板
            for(let i=1; i<=CONFIG.h; i+=CONFIG.floorH) {
                if (player.pos.y > i - 2 && player.pos.y < i + 2 && i > supportY) supportY = i;
            }
            // 检查楼梯
            const hw = CONFIG.w/2, hd = CONFIG.d/2;
            const sx = h.x - hw + 10, sz = h.z + hd - 5;
            if (player.pos.x > sx - 6 && player.pos.x < sx + 6) {
                let cx = sx, cz = sz, cy = h.z - hd, dir = -1;
                for(let f=0; f<CONFIG.h/CONFIG.floorH - 1; f++) {
                    for(let s=0; s<10; s++) {
                        const ny = cy + CONFIG.floorH/10, nz = cz + 4*dir;
                        if (player.pos.z >= Math.min(cz, nz) && player.pos.z <= Math.max(cz, nz) &&
                            player.pos.y >= cy - 1 && player.pos.y <= ny + 1) {
                            stairSupport = Math.max(stairSupport, ny);
                        }
                        cy = ny; cz = nz;
                    }
                    dir *= -1; cz = cz + 5*dir;
                }
            }
        }
    }
    const finalSupport = Math.max(supportY, stairSupport);
    const targetH = player.crouching ? CONFIG.heightCrouch : CONFIG.heightStand;
    const standY = finalSupport + targetH;
    if (player.pos.y <= standY + 0.5 && player.vel.y <= 0) {
        player.pos.y = standY;
        player.vel.y = 0;
        player.grounded = true;
    } else {
        player.grounded = false;
    }
}

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
    updateMapTexture(); // 每一帧更新地图位置
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

    // P键：开关3D地图
    if (code === 'KeyP' && !keyLocks.p) {
        const isVisible = mapPlane.visible;
        mapPlane.visible = !isVisible;
        keyLocks.p = true;
    }

    // B键：开关3D记事本
    if (code === 'KeyB' && !keyLocks.b) {
        if (!notebookPlane.visible) {
            // 将记事本放在玩家前方
            const forward = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
            notebookPlane.position.copy(camera.position).add(forward.multiplyScalar(3));
            notebookPlane.lookAt(camera.position); // 朝向玩家
            notebookPlane.visible = true;
        } else {
            notebookPlane.visible = false;
        }
        keyLocks.b = true;
    }

    if (code === 'Escape') {
        if (currentState === STATE.PLAYING) {
            currentState = STATE.PAUSED;
            document.exitPointerLock();
        } else if (currentState === STATE.PAUSED) {
            currentState = STATE.MENU;
        }
        updateUI();
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

function onSceneClick() {
    if (currentState !== STATE.PLAYING) return;
    if (isLocked) return;

    // 检查是否点击了记事本
    const mouse = new THREE.Vector2();
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(notebookPlane);
    if (intersects.length > 0 && notebookPlane.visible) {
        const newText = prompt("📝 编辑笔记:", notebookText);
        if (newText !== null) {
            notebookText = newText;
            updateNotebookTexture();
        }
    }
}

function updateUI() {
    if (uiContainer) {
        if (currentState === STATE.MENU) {
            uiContainer.innerHTML = "菜单";
        } else if (currentState === STATE.PAUSED) {
            uiContainer.innerHTML = "暂停 - 按 ESC 返回菜单";
        } else if (currentState === STATE.PLAYING) {
            uiContainer.innerHTML = `
                WASD: 移动 | SPACE: 跳跃 | SHIFT: 加速<br>
                P: 开关3D地图 | B: 开关3D记事本<br>
                点击记事本进行编辑
            `;
        }
    }
}

</script>
