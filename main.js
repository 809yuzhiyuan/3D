import * as THREE from 'three';

// ==========================================
// 1. 配置与常量 (Configuration)
// ==========================================
const CONFIG = {
    // 窗口
    width: 1280,
    height: 720,
    
    // 渲染
    fov: Math.PI / 4,
    nearClip: 0.5,
    farClip: 10000,
    bgColor: 0x050505, // 纯黑背景
    fogColor: 0x050505,
    fogDensity: 0.0003,

    // 玩家
    playerHeightStand: 1.7, // 稍微调高以符合人体比例
    playerHeightCrouch: 0.9,
    playerRadius: 0.4,
    groundY: 0.0, // 地面归零
    
    // 移动
    walkSpeed: 12.0,
    sprintSpeed: 35.0,
    crouchSpeed: 2.0,
    jumpForce: 12.0,
    gravity: 40.0,
    mouseSensitivity: 0.002,

    // 房子 (3层)
    floors: 3,
    floorHeight: 30.0,
    houseLength: 100.0,
    houseDepth: 80.0,
    doorWidth: 20.0,
    doorHeight: 24.0,
    
    // 坐标
    houseCenter: new THREE.Vector3(0, 45.0, -50.0), // 总高90，中心在45
    spawnPosition: new THREE.Vector3(0, 2.0, -90.0),
    spawnYaw: Math.PI,

    // 颜色 (高亮后朋克风)
    colorWall: 0xFFFFFF,    // 纯白墙壁
    colorDoor: 0xFF0055,    // 霓虹红门
    colorGrid: 0x00FFFF,    // ⚡️ 高亮青色地面
    colorStair: 0xFFAA00,   // 橙色楼梯
    colorGlow: 0x444444     // 辉光底色
};

// ==========================================
// 2. 全局变量
// ==========================================
let camera, scene, renderer;
let linesGroup;
let crosshair;
let uiContainer;

const player = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: CONFIG.spawnYaw,
    pitch: 0,
    isGrounded: true,
    isCrouching: false
};

const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, INVENTORY: 3 };
let currentState = STATE.MENU;
let isMouseCaptured = false;

const keys = { w: false, s: false, a: false, d: false, space: false, shift: false, ctrl: false };
let eKeyPressed = false;

// 渲染列表
let renderList = []; 

// ==========================================
// 3. 初始化
// ==========================================
init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bgColor);
    scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

    camera = new THREE.PerspectiveCamera(CONFIG.fov * 180 / Math.PI, window.innerWidth / window.innerHeight, CONFIG.nearClip, CONFIG.farClip);
    resetPlayer();

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.NoToneMapping;
    document.body.appendChild(renderer.domElement);

    createWorld();
    createCrosshair();
    createUI();

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    
    renderer.domElement.addEventListener('click', () => {
        if (currentState === STATE.PLAYING && !isMouseCaptured) renderer.domElement.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        isMouseCaptured = (document.pointerLockElement === renderer.domElement);
    });
}

function resetPlayer() {
    player.pos.copy(CONFIG.spawnPosition);
    player.vel.set(0, 0, 0);
    player.yaw = CONFIG.spawnYaw;
    player.pitch = 0;
    player.isGrounded = true;
    updateCameraRotation();
}

// ==========================================
// 4. 世界构建 (3层楼 + 楼梯 + 高亮地面)
// ==========================================
function createWorld() {
    linesGroup = new THREE.Group();
    scene.add(linesGroup);

    const hl = CONFIG.houseLength / 2;
    const hd = CONFIG.houseDepth / 2;
    const totalHeight = CONFIG.floors * CONFIG.floorHeight;
    const c = CONFIG.houseCenter;

    // --- 1. 外墙框架 (白色) ---
    // 底部和顶部
    addRect(c.x, c.y - totalHeight/2, c.z, CONFIG.houseLength, CONFIG.houseDepth, CONFIG.colorWall, true);
    addRect(c.x, c.y + totalHeight/2, c.z, CONFIG.houseLength, CONFIG.houseDepth, CONFIG.colorWall, true);
    
    // 四根柱子
    const corners = [
        [c.x - hl, c.z - hd], [c.x + hl, c.z - hd],
        [c.x + hl, c.z + hd], [c.x - hl, c.z + hd]
    ];
    corners.forEach(([x, z]) => {
        addLine(new THREE.Vector3(x, c.y - totalHeight/2, z), new THREE.Vector3(x, c.y + totalHeight/2, z), CONFIG.colorWall, true);
    });

    // --- 2. 楼层隔板 (每层都有网格) ---
    for (let i = 1; i < CONFIG.floors; i++) {
        const y = c.y - totalHeight/2 + i * CONFIG.floorHeight;
        // 楼板边缘
        addRect(c.x, y, c.z, CONFIG.houseLength, CONFIG.houseDepth, CONFIG.colorWall, false);
        // 楼板内部网格 (稀疏一点)
        addGridPlane(c.x, y, c.z, CONFIG.houseLength, CONFIG.houseDepth, 20, CONFIG.colorGrid, 0.4);
    }

    // --- 3. 门框 (红色) - 仅在一楼前墙 ---
    const groundY = c.y - totalHeight/2;
    const frontZ = c.z + hd;
    const dw = CONFIG.doorWidth / 2;
    const dBL = new THREE.Vector3(c.x - dw, groundY, frontZ);
    const dBR = new THREE.Vector3(c.x + dw, groundY, frontZ);
    const dTL = new THREE.Vector3(c.x - dw, groundY + CONFIG.doorHeight, frontZ);
    const dTR = new THREE.Vector3(c.x + dw, groundY + CONFIG.doorHeight, frontZ);

    addLine(dBL, dTL, CONFIG.colorDoor, true);
    addLine(dTL, dTR, CONFIG.colorDoor, true);
    addLine(dTR, dBR, CONFIG.colorDoor, true);

    // --- 4. 楼梯 (橙色) - Z字形折返 ---
    createStairs(c, hl, hd, groundY);

    // --- 5. 外部地面网格 (高亮青色) ---
    // 使用双重渲染实现发光效果
    const groundSize = 10000;
    const groundDivs = 200;
    
    // 底层：粗的半透明辉光
    const gridGeoGlow = new THREE.GridHelper(groundSize, groundDivs, CONFIG.colorGrid, CONFIG.colorGrid);
    gridGeoGlow.position.y = groundY;
    const matGlow = new THREE.LineBasicMaterial({ 
        color: CONFIG.colorGrid, 
        transparent: true, 
        opacity: 0.15, 
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    gridGeoGlow.material = matGlow;
    gridGeoGlow.renderOrder = 100;
    scene.add(gridGeoGlow);

    // 上层：细的实色高亮线
    const gridGeoBright = new THREE.GridHelper(groundSize, groundDivs, CONFIG.colorGrid, CONFIG.colorGrid);
    gridGeoBright.position.y = groundY + 0.1; // 稍微抬高防止重叠闪烁
    const matBright = new THREE.LineBasicMaterial({ 
        color: CONFIG.colorGrid, 
        transparent: true, 
        opacity: 0.8, // 高不透明度
        depthWrite: false,
        toneMapped: false
    });
    gridGeoBright.material = matBright;
    gridGeoBright.renderOrder = 101;
    scene.add(gridGeoBright);
    
    // 添加到渲染列表以便统一雾效处理
    renderList.push(gridGeoGlow, gridGeoBright);
}

// 辅助：创建矩形框
function addRect(x, y, z, w, d, color, isThick) {
    const hl = w/2, hd = d/2;
    const p1 = new THREE.Vector3(x-hl, y, z-hd);
    const p2 = new THREE.Vector3(x+hl, y, z-hd);
    const p3 = new THREE.Vector3(x+hl, y, z+hd);
    const p4 = new THREE.Vector3(x-hl, y, z+hd);
    
    addLine(p1, p2, color, isThick);
    addLine(p2, p3, color, isThick);
    addLine(p3, p4, color, isThick);
    addLine(p4, p1, color, isThick);
}

// 辅助：创建平面网格
function addGridPlane(x, y, z, w, d, step, color, opacity) {
    const hl = w/2, hd = d/2;
    // 横向线
    for (let i = -hl; i <= hl; i += step) {
        addLine(new THREE.Vector3(x+i, y, z-hd), new THREE.Vector3(x+i, y, z+hd), color, false, opacity);
    }
    // 纵向线
    for (let i = -hd; i <= hd; i += step) {
        addLine(new THREE.Vector3(x-hl, y, z+i), new THREE.Vector3(x+hl, y, z+i), color, false, opacity);
    }
}

// 核心：创建楼梯
function createStairs(center, hl, hd, baseY) {
    const stairWidth = 12.0;
    const stairDepth = 40.0; // 每段楼梯的长度
    const stepsPerFlight = 10;
    const stepH = CONFIG.floorHeight / stepsPerFlight;
    const stepD = stairDepth / stepsPerFlight;
    
    const startX = center.x - hl + 10; // 靠左墙
    const startZ = center.z + hd - 5;  // 靠前墙

    let currentX = startX;
    let currentZ = startZ;
    let currentY = baseY;
    let direction = -1; // -1 表示向负Z方向走 (上楼)

    const color = CONFIG.colorStair;

    // 构建两段楼梯 (1楼->2楼, 2楼->3楼)
    for (let floor = 0; floor < CONFIG.floors - 1; floor++) {
        const targetY = baseY + (floor + 1) * CONFIG.floorHeight;
        
        // 绘制台阶
        for (let i = 0; i < stepsPerFlight; i++) {
            const nextY = currentY + stepH;
            const nextZ = currentZ + (stepD * direction);
            
            // 台阶面 (横线)
            addLine(
                new THREE.Vector3(currentX - stairWidth/2, nextY, nextZ),
                new THREE.Vector3(currentX + stairWidth/2, nextY, nextZ),
                color, false
            );
            // 台阶侧面 (竖线)
            addLine(
                new THREE.Vector3(currentX, currentY, nextZ),
                new THREE.Vector3(currentX, nextY, nextZ),
                color, false
            );

            currentY = nextY;
            currentZ = nextZ;
        }

        // 平台 (休息区)
        const platformZ = currentZ + (5 * direction);
        addRect(currentX, currentY, platformZ, stairWidth, 10, color, false);
        
        // 准备下一段 (反向)
        direction *= -1;
        currentZ = platformZ + (5 * direction); // 移到下一段起点
        // X轴不需要变，因为是折返梯，但在视觉上可能需要微调，这里保持简单折返
    }

    // 楼梯扶手 (简化为两根长线)
    // 这里为了代码简洁，省略复杂扶手，只保留台阶结构，碰撞检测主要基于台阶
}

function addLine(p1, p2, color, isThick = false, opacity = 1.0) {
    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    
    // 基础材质
    const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        toneMapped: false,
        depthTest: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });
    
    const line = new THREE.Line(geometry, material);
    line.userData = { originalColor: color, isThick: isThick };
    line.renderOrder = 999;
    linesGroup.add(line);
    renderList.push(line);

    // 如果是粗线/重要结构，添加一层辉光
    if (isThick || opacity < 1.0) {
        const glowGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const glowMat = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const glowLine = new THREE.Line(glowGeo, glowMat);
        glowLine.renderOrder = 998;
        linesGroup.add(glowLine);
        renderList.push(glowLine);
    }
}

function createCrosshair() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 16); ctx.lineTo(32, 24);
    ctx.moveTo(32, 40); ctx.lineTo(32, 48);
    ctx.moveTo(16, 32); ctx.lineTo(24, 32);
    ctx.moveTo(40, 32); ctx.lineTo(48, 32);
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, renderOrder: 9999, toneMapped: false });
    crosshair = new THREE.Sprite(material);
    crosshair.scale.set(0.5, 0.5, 1);
    scene.add(crosshair);
}

// ==========================================
// 5. 物理与碰撞 (含楼梯逻辑)
// ==========================================
function updatePhysics() {
    const dt = 0.016;

    // 姿态
    if (keys.ctrl && !player.isCrouching) {
        player.isCrouching = true;
        player.pos.y = Math.max(player.pos.y, CONFIG.groundY + CONFIG.playerHeightCrouch);
        player.vel.y = 0;
    } else if (!keys.ctrl && player.isCrouching) {
        player.isCrouching = false;
        player.pos.y = Math.max(player.pos.y, CONFIG.groundY + CONFIG.playerHeightStand);
    }

    const speed = player.isCrouching ? CONFIG.crouchSpeed : (keys.shift ? CONFIG.sprintSpeed : CONFIG.walkSpeed);

    // 移动向量
    const sinY = Math.sin(player.yaw);
    const cosY = Math.cos(player.yaw);
    const fwd = new THREE.Vector3(-sinY, 0, -cosY);
    const right = new THREE.Vector3(-cosY, 0, sinY);
    
    const move = new THREE.Vector3(0, 0, 0);
    if (keys.w) move.sub(fwd);
    if (keys.s) move.add(fwd);
    if (keys.a) move.add(right);
    if (keys.d) move.sub(right);

    const len = move.length();
    if (len > 0) {
        move.normalize().multiplyScalar(speed * dt);

        // ✅ 分轴碰撞检测 (含楼梯)
        // 1. X轴
        const nextX = player.pos.clone();
        nextX.x += move.x;
        if (!checkCollision(nextX)) player.pos.x = nextX.x;

        // 2. Z轴
        const nextZ = player.pos.clone();
        nextZ.z += move.z;
        if (!checkCollision(nextZ)) player.pos.z = nextZ.z;
    }

    // 跳跃与重力
    if (keys.space && player.isGrounded && !player.isCrouching) {
        player.vel.y = CONFIG.jumpForce;
        player.isGrounded = false;
    }

    player.vel.y -= CONFIG.gravity * dt;
    player.pos.y += player.vel.y * dt;

    // 地面/楼梯/楼板 检测
    checkGroundAndStairs();
}

// 综合碰撞检测入口
function checkCollision(pos) {
    // 1. 房子外墙检测
    if (checkHouseWalls(pos)) return true;
    
    // 2. 楼梯作为障碍物检测 (防止穿模，但允许向上走)
    // 这里主要检测水平方向的阻挡，垂直方向由 checkGroundAndStairs 处理
    if (checkStairsHorizontal(pos)) return true;

    return false;
}

// 外墙检测 (3层通用)
function checkHouseWalls(pos) {
    const hl = CONFIG.houseLength / 2;
    const hd = CONFIG.houseDepth / 2;
    const totalH = CONFIG.floors * CONFIG.floorHeight;
    const c = CONFIG.houseCenter;
    const r = CONFIG.playerRadius;

    const minX = c.x - hl;
    const maxX = c.x + hl;
    const minZ = c.z - hd;
    const maxZ = c.z + hd;
    const minY = c.y - totalH/2;
    const maxY = c.y + totalH/2;

    if (pos.y < minY || pos.y > maxY) return false;

    // 门洞 (仅一楼)
    const groundY = minY;
    const doorTop = groundY + CONFIG.doorHeight;
    const frontZ = maxZ;
    const dw = CONFIG.doorWidth / 2;

    if (Math.abs(pos.z - frontZ) < r && pos.y < doorTop + 5) { // +5 容错
        if (pos.y < doorTop && pos.x > c.x - dw - r && pos.x < c.x + dw + r) return false;
        if (pos.x >= minX - r && pos.x <= maxX + r) return true;
    }

    // 其他墙
    const insideX = pos.x > minX - r && pos.x < maxX + r;
    const insideZ = pos.z > minZ - r && pos.z < maxZ + r;

    if (insideX && insideZ) {
        if (pos.x <= minX + r || pos.x >= maxX - r) return true;
        if (pos.z <= minZ + r || pos.z >= maxZ - r) return true;
    }
    return false;
}

// 楼梯水平碰撞 (防止直接穿过楼梯实体)
function checkStairsHorizontal(pos) {
    // 简化：将楼梯视为一个整体的长方体障碍物，除了台阶表面
    // 由于楼梯逻辑复杂，这里采用简化的“台阶盒子”检测
    const c = CONFIG.houseCenter;
    const hl = CONFIG.houseLength / 2;
    const hd = CONFIG.houseDepth / 2;
    const baseY = c.y - (CONFIG.floors * CONFIG.floorHeight)/2;
    
    const stairWidth = 12.0;
    const stairX = c.x - hl + 10;
    
    // 简单的包围盒检测，如果在楼梯区域内，且不在台阶表面上，则视为碰撞
    // 这里为了流畅性，主要依赖 checkGroundAndStairs 的支撑，水平方向稍微放宽
    return false; 
}

// ✅ 核心：地面、楼板与楼梯支撑检测
function checkGroundAndStairs() {
    const c = CONFIG.houseCenter;
    const totalH = CONFIG.floors * CONFIG.floorHeight;
    const baseY = c.y - totalH/2;
    const r = CONFIG.playerRadius;
    
    let supportY = -1000; // 最低支撑点
    let isOnSomething = false;

    // 1. 基础地面
    if (player.pos.y > baseY - 5 && player.pos.y < baseY + 5) {
        // 检查是否在房子内部或附近
        const hl = CONFIG.houseLength/2, hd = CONFIG.houseDepth/2;
        if (player.pos.x > c.x - hl - r && player.pos.x < c.x + hl + r &&
            player.pos.z > c.z - hd - r && player.pos.z < c.z + hd + r) {
            supportY = baseY;
            isOnSomething = true;
        } else {
            // 外部无限地面
            supportY = baseY;
            isOnSomething = true;
        }
    }

    // 2. 楼板 (每层)
    for (let i = 1; i < CONFIG.floors; i++) {
        const floorY = baseY + i * CONFIG.floorHeight;
        // 如果玩家在楼板附近
        if (player.pos.y > floorY - 2 && player.pos.y < floorY + 5) {
            // 检查是否在房子范围内 (扣除楼梯口？这里简化为全范围，除了楼梯区域可能重叠)
            const hl = CONFIG.houseLength/2, hd = CONFIG.houseDepth/2;
            if (player.pos.x > c.x - hl && player.pos.x < c.x + hl &&
                player.pos.z > c.z - hd && player.pos.z < c.z + hd) {
                
                // 简单的楼梯口留空逻辑：如果正在楼梯区域，且高度匹配楼梯，则忽略楼板碰撞，让楼梯接管
                if (!isOnStairStep(player.pos, floorY)) {
                    if (floorY > supportY) {
                        supportY = floorY;
                        isOnSomething = true;
                    }
                }
            }
        }
    }

    // 3. 楼梯支撑检测 (最关键)
    const stairSupportY = getStairHeight(player.pos.x, player.pos.z, baseY);
    if (stairSupportY !== null) {
        // 如果楼梯支撑点高于当前找到的支撑点 (或者在地面/楼板之上一点点)
        if (stairSupportY > supportY - 0.5) {
            supportY = stairSupportY;
            isOnSomething = true;
        }
    }

    // 应用支撑
    const targetH = player.isCrouching ? CONFIG.playerHeightCrouch : CONFIG.playerHeightStand;
    const standY = supportY + targetH;

    if (isOnSomething && player.pos.y <= standY + 0.5 && player.vel.y <= 0) {
        player.pos.y = standY;
        player.vel.y = 0;
        player.isGrounded = true;
    } else {
        // 如果在空中，且没有落在任何东西上
        // 除非是从高处跳下，否则 isGrounded 应为 false
        if (player.pos.y > supportY + targetH + 1.0) {
            player.isGrounded = false;
        }
    }
}

// 辅助：判断是否在楼梯台阶上，并返回台阶高度
function getStairHeight(x, z, baseY) {
    const c = CONFIG.houseCenter;
    const hl = CONFIG.houseLength / 2;
    const hd = CONFIG.houseDepth / 2;
    
    const stairWidth = 12.0;
    const stairX = c.x - hl + 10;
    
    // 检查 X 轴是否在楼梯宽度内
    if (x < stairX - stairWidth/2 - 1 || x > stairX + stairWidth/2 + 1) return null;

    // 楼梯参数
    const stepsPerFlight = 10;
    const stepH = CONFIG.floorHeight / stepsPerFlight;
    const stepD = 40.0 / stepsPerFlight; // 40是楼梯深度
    
    // 第一段楼梯 (向前墙方向，Z+)
    // 起点：靠近后墙？不，之前的逻辑是 startZ = center.z + hd - 5 (前墙附近)，direction = -1 (向后走)
    // 修正逻辑以匹配 createStairs:
    // Start: Front area (Z ~ hd), Direction: -1 (towards -Z / Back)
    let currentZ = c.z + hd - 5;
    let currentY = baseY;
    let direction = -1;

    for (let floor = 0; floor < CONFIG.floors - 1; floor++) {
        // 遍历台阶
        for (let i = 0; i < stepsPerFlight; i++) {
            const stepZStart = currentZ;
            const stepZEnd = currentZ + (stepD * direction);
            const stepY = currentY + (i + 1) * stepH;
            
            // 检查 Z 是否在当前台阶范围内
            const minZ = Math.min(stepZStart, stepZEnd);
            const maxZ = Math.max(stepZStart, stepZEnd);
            
            if (z >= minZ - 1 && z <= maxZ + 1) {
                // 线性插值高度，实现平滑斜坡效果，或者阶梯效果
                // 这里用阶梯效果更符合像素风
                return stepY; 
            }
            currentZ = stepZEnd;
        }
        
        // 平台
        const platformZ = currentZ + (5 * direction);
        if (z >= Math.min(currentZ, platformZ) - 1 && z <= Math.max(currentZ, platformZ) + 1) {
            return currentY + CONFIG.floorHeight; // 平台高度
        }

        // 下一段
        direction *= -1;
        currentZ = platformZ + (5 * direction);
        currentY += CONFIG.floorHeight;
    }

    return null;
}

function isOnStairStep(pos, floorY) {
    // 简单判断：如果 getStairHeight 返回的值接近 floorY 附近的某个台阶，则认为在楼梯上
    const h = getStairHeight(pos.x, pos.z, CONFIG.houseCenter.y - (CONFIG.floors*CONFIG.floorHeight)/2);
    if (h === null) return false;
    return Math.abs(h - (pos.y - CONFIG.playerHeightStand)) < 1.0;
}

function updateCameraRotation() {
    const euler = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
}

// ==========================================
// 6. 渲染循环
// ==========================================
function updateLinesVisibility() {
    const isDimmed = (currentState === STATE.PAUSED || currentState === STATE.INVENTORY);
    const dimFactor = isDimmed ? 0.3 : 1.0;
    const fogRange = 2000.0;

    renderList.forEach(line => {
        const dist = line.position.distanceTo(camera.position);
        let alpha = Math.max(0.1, 1.0 - (dist / fogRange));
        
        // 地面和楼梯保持更亮
        if (line.material.color.getHex() === CONFIG.colorGrid || line.material.color.getHex() === CONFIG.colorStair) {
            alpha = Math.max(0.4, alpha); 
        }
        
        alpha *= dimFactor;
        line.material.opacity = alpha;
        line.visible = (alpha > 0.05);
    });
}

function animate() {
    requestAnimationFrame(animate);

    if (currentState === STATE.PLAYING) {
        updatePhysics();
        updateCameraRotation();
    }

    if (crosshair) {
        crosshair.position.copy(camera.position);
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        crosshair.position.add(dir.multiplyScalar(1.0));
    }

    updateLinesVisibility();
    renderer.render(scene, camera);
}

// ==========================================
// 7. 输入与 UI (保持不变，略作适配)
// ==========================================
function onKeyDown(e) {
    switch(e.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space': keys.space = true; break;
        case 'ShiftLeft': keys.shift = true; break;
        case 'ControlLeft': keys.ctrl = true; break;
        case 'Escape':
            if (currentState === STATE.INVENTORY) toggleInventory();
            else if (currentState === STATE.PLAYING) { currentState = STATE.PAUSED; document.exitPointerLock(); updateUI(); }
            else if (currentState === STATE.PAUSED) goToMenu();
            break;
        case 'KeyE':
            if (currentState === STATE.PLAYING && !eKeyPressed) { toggleInventory(); eKeyPressed = true; }
            break;
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': 
        case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
            const idx = parseInt(e.code.replace('Digit', '')) - 1;
            if (idx >= 0 && idx < 9) { selectedSlot = idx; if (currentState === STATE.INVENTORY) updateUI(); }
            break;
    }
}

function onKeyUp(e) {
    switch(e.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyD': keys.d = false; break;
        case 'Space': keys.space = false; break;
        case 'ShiftLeft': keys.shift = false; break;
        case 'ControlLeft': keys.ctrl = false; break;
        case 'KeyE': eKeyPressed = false; break;
    }
}

function onMouseMove(e) {
    if (currentState !== STATE.PLAYING || !isMouseCaptured) return;
    player.yaw += e.movementX * CONFIG.mouseSensitivity;
    player.pitch -= e.movementY * CONFIG.mouseSensitivity;
    player.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, player.pitch));
    updateCameraRotation();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// UI 函数 (简化版，保持功能)
let selectedSlot = 0;
function createUI() {
    uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, { position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', fontFamily:'"Courier New", monospace', color:'#FFF' });
    document.body.appendChild(uiContainer);
    updateUI();
}

function updateUI() {
    uiContainer.innerHTML = '';
    uiContainer.style.pointerEvents = (currentState === STATE.MENU || currentState === STATE.PAUSED || currentState === STATE.INVENTORY) ? 'auto' : 'none';

    if (currentState === STATE.PLAYING || currentState === STATE.INVENTORY) {
        const info = document.createElement('div');
        Object.assign(info.style, { position:'absolute', top:'10px', left:'10px', fontSize:'14px', color:'#AAA' });
        info.innerHTML = `POS: ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}<br>FLOOR: ${Math.floor((player.pos.y - (CONFIG.houseCenter.y - 1.5*CONFIG.floorHeight)) / CONFIG.floorHeight) + 1}<br>WASD:Move | SPACE:Jump | E:Bag`;
        uiContainer.appendChild(info);
    }

    if (currentState === STATE.MENU) {
        uiContainer.style.backgroundColor = 'rgba(0,0,0,0.8)';
        drawOverlay("POST_PUNK ENGINE 3F", [{text:"START", action:startGame}, {text:"QUIT", action:()=>window.close()}]);
    } else if (currentState === STATE.PAUSED) {
        uiContainer.style.backgroundColor = 'rgba(0,0,0,0.6)';
        drawOverlay("PAUSED", [{text:"RESUME", action:resumeGame}, {text:"MENU", action:goToMenu}]);
    } else if (currentState === STATE.INVENTORY) {
        uiContainer.style.backgroundColor = 'rgba(0,0,0,0.85)';
        drawInventory();
    }
}

function drawOverlay(title, buttons) {
    const t = document.createElement('h1'); t.innerText=title;
    Object.assign(t.style, { textAlign:'center', marginTop:'150px', fontSize:'48px', color:'#FFD700', margin:0 });
    uiContainer.appendChild(t);
    buttons.forEach(btn => {
        const el = document.createElement('div'); el.innerText=btn.text;
        Object.assign(el.style, { display:'block', width:'200px', margin:'20px auto', padding:'15px', border:'2px solid #FFF', color:'#DDD', textAlign:'center', cursor:'pointer', backgroundColor:'#222', fontSize:'20px' });
        el.onmouseenter = () => { el.style.backgroundColor='#FFF'; el.style.color='#000'; };
        el.onmouseleave = () => { el.style.backgroundColor='#222'; el.style.color='#DDD'; };
        el.onclick = btn.action;
        uiContainer.appendChild(el);
    });
}

function drawInventory() {
    const box = document.createElement('div');
    Object.assign(box.style, { position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'600px', minHeight:'400px', border:'2px solid #FFD700', backgroundColor:'rgba(20,20,20,0.9)', padding:'20px', display:'flex', flexWrap:'wrap' });
    box.innerHTML = `<div style="width:100%;color:#FFD700;font-size:24px;margin-bottom:20px">INVENTORY</div>`;
    const items = ["Crowbar", "Tape", "Key", "Map", "Photo", "Lighter", "Note", "Radio", "Empty"];
    items.forEach((name, i) => {
        const s = document.createElement('div');
        const sel = i===selectedSlot;
        Object.assign(s.style, { width:'70px', height:'70px', margin:'10px', border: sel?'3px solid #FFF':'1px solid #666', backgroundColor:sel?'#444':'#222', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color: sel ? '#FFF' : '#888', cursor:'pointer', fontSize:'12px' });
        s.innerHTML = `<div>${name}</div><div>[${i+1}]</div>`;
        s.onclick = () => { selectedSlot=i; updateUI(); };
        box.appendChild(s);
    });
    uiContainer.appendChild(box);
    uiContainer.onclick = (e) => { if(e.target===uiContainer) toggleInventory(); };
}

function startGame() { currentState=STATE.PLAYING; resetPlayer(); updateUI(); setTimeout(()=>renderer.domElement.requestPointerLock(), 50); }
function resumeGame() { currentState=STATE.PLAYING; updateUI(); setTimeout(()=>renderer.domElement.requestPointerLock(), 50); }
function goToMenu() { currentState=STATE.MENU; document.exitPointerLock(); updateUI(); }
function toggleInventory() {
    if (currentState===STATE.PLAYING) { currentState=STATE.INVENTORY; document.exitPointerLock(); }
    else if (currentState===STATE.INVENTORY) { currentState=STATE.PLAYING; setTimeout(()=>renderer.domElement.requestPointerLock(), 50); }
    updateUI();
}
