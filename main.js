using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Drawing.Drawing2D;

namespace PostPunk3DEngine
{
    #region 1. 配置与常量 (Configuration)
    public static class Config
    {
        public const int Width = 1280;
        public const int Height = 720;
        public const float Fov = MathF.PI / 4f; // 视野
        public const float NearClip = 0.5f;     // 近裁剪面
        
        // 玩家
        public const float PlayerHeight = 1.7f;
        public const float CrouchHeight = 0.9f;
        public const float Radius = 0.4f;
        public const float SpeedWalk = 10.0f;
        public const float SpeedRun = 30.0f;
        public const float SpeedCrouch = 2.0f;
        public const float JumpForce = 12.0f;
        public const float Gravity = 30.0f;
        public const float Sensitivity = 0.002f;

        // 房子 (中心在 0, 15, -50)
        public const float HouseW = 100f;
        public const float HouseH = 30f;
        public const float HouseD = 80f;
        public const float DoorW = 20f;
        public const float DoorH = 22f;
        
        public static readonly Vector3 HouseCenter = new Vector3(0, HouseH / 2, -50);
        public static readonly Vector3 SpawnPos = new Vector3(0, 2, -90); // 出生在房子前方
    }
    #endregion

    #region 2. 数据结构 (Structs)
    public struct Vector3
    {
        public float X, Y, Z;
        public Vector3(float x, float y, float z) { X = x; Y = y; Z = z; }
        public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        public static Vector3 operator *(Vector3 v, float s) => new Vector3(v.X * s, v.Y * s, v.Z * s);
    }

    public struct Line3D
    {
        public Vector3 P1, P2;
        public float Depth; // 用于排序
        public bool IsDoor; // 是否为门框

        public Line3D(Vector3 p1, Vector3 p2, bool isDoor)
        {
            P1 = p1; P2 = p2; IsDoor = isDoor;
            Depth = (p1.Z + p2.Z) * 0.5f;
        }
    }

    public enum GameState { MENU, PLAYING, PAUSED, INVENTORY }
    #endregion

    #region 3. 主程序 (Main Form)
    public class GameForm : Form
    {
        // 状态
        private GameState _state = GameState.MENU;
        private bool _mouseLocked = false;
        
        // 玩家
        private Vector3 _pos;
        private Vector3 _vel;
        private float _yaw = MathF.PI; // 面向正Z
        private float _pitch = 0;
        private bool _grounded = true;
        private bool _crouching = false;

        // 渲染列表
        private readonly List<Line3D> _lines = new List<Line3D>();
        
        // 输入防抖
        private bool _ePressed = false;

        // UI 资源
        private Font _fontBig = new Font("Consolas", 32, FontStyle.Bold);
        private Font _fontMed = new Font("Consolas", 16);
        private Font _fontSmall = new Font("Consolas", 12);
        private Timer _timer;

        // API
        [DllImport("user32.dll")] private static extern bool ClipCursor(ref Rectangle rect);
        [DllImport("user32.dll")] private static extern short GetKeyState(int key);

        public GameForm()
        {
            Text = "POST_PUNK ENGINE [C#]";
            Size = new Size(Config.Width, Config.Height);
            StartPosition = FormStartPosition.CenterScreen;
            DoubleBuffered = true; // 关键：防止闪烁
            BackColor = Color.FromArgb(10, 10, 16); // 深黑蓝背景

            ResetPlayer();

            _timer = new Timer { Interval = 16 }; // ~60FPS
            _timer.Tick += (s, e) => {
                if (_state == GameState.PLAYING) UpdatePhysics();
                Invalidate(); // 重绘
            };
            _timer.Start();

            MouseMove += OnMouseMove;
            MouseClick += (s, e) => {
                if (_state == GameState.PLAYING && !_mouseLocked) LockMouse();
            };
            KeyDown += OnKeyDown;
            FormClosing += (s, e) => UnlockMouse();
        }

        private void ResetPlayer()
        {
            _pos = Config.SpawnPos;
            _vel = new Vector3(0, 0, 0);
            _yaw = MathF.PI;
            _pitch = 0;
            _grounded = true;
        }

        private void LockMouse()
        {
            _mouseLocked = true;
            Cursor.Hide();
            Rectangle r = Bounds;
            ClipCursor(ref r);
            Cursor.Position = PointToScreen(new Point(Width / 2, Height / 2));
        }

        private void UnlockMouse()
        {
            _mouseLocked = false;
            Cursor.Show();
            Rectangle r = Screen.PrimaryScreen.Bounds;
            ClipCursor(ref r);
        }

        #region 物理与碰撞 (Physics & Collision)
        private void UpdatePhysics()
        {
            float dt = 0.016f;
            
            // 按键状态
            bool w = (GetKeyState((int)Keys.W) & 0x8000) != 0;
            bool s = (GetKeyState((int)Keys.S) & 0x8000) != 0;
            bool a = (GetKeyState((int)Keys.A) & 0x8000) != 0;
            bool d = (GetKeyState((int)Keys.D) & 0x8000) != 0;
            bool shift = (GetKeyState((int)Keys.LShiftKey) & 0x8000) != 0;
            bool ctrl = (GetKeyState((int)Keys.LControlKey) & 0x8000) != 0;
            bool space = (GetKeyState((int)Keys.Space) & 0x8000) != 0;

            // 蹲下逻辑
            if (ctrl && !_crouching) { _crouching = true; _pos.Y = Math.Max(_pos.Y, Config.CrouchHeight); _vel.Y = 0; }
            if (!ctrl && _crouching) { _crouching = false; _pos.Y = Math.Max(_pos.Y, Config.PlayerHeight); }

            float speed = _crouching ? Config.SpeedCrouch : (shift ? Config.SpeedRun : Config.SpeedWalk);

            // 计算移动方向
            float sinY = MathF.Sin(_yaw), cosY = MathF.Cos(_yaw);
            Vector3 fwd = new Vector3(-sinY, 0, -cosY);
            Vector3 right = new Vector3(-cosY, 0, sinY);
            Vector3 move = new Vector3(0, 0, 0);

            if (w) move = move - fwd;
            if (s) move = move + fwd;
            if (a) move = move + right;
            if (d) move = move - right;

            // 归一化并应用速度
            float len = MathF.Sqrt(move.X * move.X + move.Z * move.Z);
            if (len > 0)
            {
                move = move * (speed * dt / len);
                
                // X轴碰撞检测
                Vector3 nextX = _pos + new Vector3(move.X, 0, 0);
                if (!CheckCollision(nextX)) _pos.X = nextX.X;

                // Z轴碰撞检测
                Vector3 nextZ = _pos + new Vector3(0, 0, move.Z);
                if (!CheckCollision(nextZ)) _pos.Z = nextZ.Z;
            }

            // 跳跃与重力
            if (space && _grounded && !_crouching) { _vel.Y = Config.JumpForce; _grounded = false; }
            
            _vel.Y -= Config.Gravity * dt;
            _pos.Y += _vel.Y * dt;

            float groundH = _crouching ? Config.CrouchHeight : Config.PlayerHeight;
            if (_pos.Y <= groundH) { _pos.Y = groundH; _vel.Y = 0; _grounded = true; }
        }

        // ✅ 核心修复：精确的门洞碰撞逻辑
        private bool CheckCollision(Vector3 pos)
        {
            float hw = Config.HouseW / 2, hd = Config.HouseD / 2, hh = Config.HouseH / 2;
            Vector3 c = Config.HouseCenter;
            float r = Config.Radius;

            // 房子边界
            float minX = c.X - hw, maxX = c.X + hw;
            float minZ = c.Z - hd, maxZ = c.Z + hd;
            float minY = c.Y - hh, maxY = c.Y + hh;

            // 1. 高度检查：如果不在房子高度范围内，不撞墙
            if (pos.Y < minY || pos.Y > maxY) return false;

            // 2. 门洞参数
            float dw = Config.DoorW / 2;
            float doorTop = minY + Config.DoorH;
            float frontZ = maxZ; // 前墙在 Z+ 方向

            // 3. 前墙特殊处理 (带门洞)
            // 如果玩家在前墙附近 (Z 轴)
            if (Math.Abs(pos.Z - frontZ) < r)
            {
                // 如果高度低于门顶，且 X 在门宽范围内 -> 是门洞，不碰撞
                if (pos.Y < doorTop && pos.X > c.X - dw - r && pos.X < c.X + dw + r)
                {
                    return false; // ✅ 这里是门，可以通过
                }
                // 否则，如果是前墙的其他部分，则碰撞
                if (pos.X >= minX - r && pos.X <= maxX + r) return true;
            }

            // 4. 其他墙壁 (左、右、后)
            // 简单的 AABB 内部检测：如果在房子内部，且碰到了边界
            bool insideX = pos.X > minX - r && pos.X < maxX + r;
            bool insideZ = pos.Z > minZ - r && pos.Z < maxZ + r;

            if (insideX && insideZ)
            {
                // 检查是否贴边
                if (pos.X <= minX + r || pos.X >= maxX - r) return true; // 左右墙
                if (pos.Z <= minZ + r || pos.Z >= maxZ - r) return true; // 后墙 (前墙已处理)
            }

            return false;
        }
        #endregion

        #region 渲染引擎 (Rendering)
        private Vector3 WorldToCamera(Vector3 w)
        {
            // 平移
            float x = w.X - _pos.X;
            float y = w.Y - _pos.Y;
            float z = w.Z - _pos.Z;

            // 旋转 Y (Yaw)
            float cY = MathF.Cos(_yaw), sY = MathF.Sin(_yaw);
            float x1 = x * cY - z * sY;
            float z1 = x * sY + z * cY;

            // 旋转 X (Pitch)
            float cP = MathF.Cos(_pitch), sP = MathF.Sin(_pitch);
            float y2 = y * cP - z1 * sP;
            float z2 = y * sP + z1 * cP;

            return new Vector3(x1, y2, z2);
        }

        private Point? Project(Vector3 c)
        {
            if (c.Z <= Config.NearClip) return null;
            float scale = (Height / 2.0f) / MathF.Tan(Config.Fov / 2.0f);
            return new Point(
                (int)(c.X * scale / c.Z + Width / 2),
                (int)(-c.Y * scale / c.Z + Height / 2)
            );
        }

        private void BuildScene()
        {
            _lines.Clear();
            float hw = Config.HouseW / 2, hd = Config.HouseD / 2, hh = Config.HouseH / 2;
            Vector3 c = Config.HouseCenter;

            // 8个顶点
            Vector3[] v = new Vector3[8];
            v[0] = new Vector3(c.X - hw, c.Y - hh, c.Z - hd);
            v[1] = new Vector3(c.X + hw, c.Y - hh, c.Z - hd);
            v[2] = new Vector3(c.X + hw, c.Y - hh, c.Z + hd);
            v[3] = new Vector3(c.X - hw, c.Y - hh, c.Z + hd);
            v[4] = new Vector3(c.X - hw, c.Y + hh, c.Z - hd);
            v[5] = new Vector3(c.X + hw, c.Y + hh, c.Z - hd);
            v[6] = new Vector3(c.X + hw, c.Y + hh, c.Z + hd);
            v[7] = new Vector3(c.X - hw, c.Y + hh, c.Z + hd);

            // 12条边 (黄色)
            int[][] edges = {
                new[]{0,1}, new[]{1,2}, new[]{2,3}, new[]{3,0},
                new[]{4,5}, new[]{5,6}, new[]{6,7}, new[]{7,4},
                new[]{0,4}, new[]{1,5}, new[]{2,6}, new[]{3,7}
            };

            foreach (var e in edges) AddLine(v[e[0]], v[e[1]], false);

            // 门框 (红色) - 单独绘制，确保颜色正确
            float groundY = c.Y - hh;
            float doorTop = groundY + Config.DoorH;
            float frontZ = c.Z + hd;
            float dw = Config.DoorW / 2;

            Vector3 dBL = new Vector3(c.X - dw, groundY, frontZ);
            Vector3 dBR = new Vector3(c.X + dw, groundY, frontZ);
            Vector3 dTL = new Vector3(c.X - dw, doorTop, frontZ);
            Vector3 dTR = new Vector3(c.X + dw, doorTop, frontZ);

            AddLine(dBL, dTL, true);
            AddLine(dTL, dTR, true);
            AddLine(dTR, dBR, true);

            // 地面网格 (灰色)
            float range = 2000;
            int step = 100;
            int minX = ((int)(_pos.X - range) / step) * step;
            int maxX = ((int)(_pos.X + range) / step + 1) * step;
            int minZ = ((int)(_pos.Z - range) / step) * step;
            int maxZ = ((int)(_pos.Z + range) / step + 1) * step;

            for (int x = minX; x <= maxX; x += step)
                AddLine(new Vector3(x, 0, minZ), new Vector3(x, 0, maxZ), false, true);
            for (int z = minZ; z <= maxZ; z += step)
                AddLine(new Vector3(minX, 0, z), new Vector3(maxX, 0, z), false, true);

            // ✅ 核心修复：画家算法排序 (从远到近)
            // 这样近的线会覆盖远的线，彻底解决深度闪烁和变暗问题
            _lines.Sort((a, b) => b.Depth.CompareTo(a.Depth));
        }

        private void AddLine(Vector3 p1, Vector3 p2, bool isDoor, bool isGrid = false)
        {
            Vector3 cp1 = WorldToCamera(p1);
            Vector3 cp2 = WorldToCamera(p2);

            // 简单裁剪：如果在相机后面，忽略
            if (cp1.Z <= Config.NearClip && cp2.Z <= Config.NearClip) return;
            
            // 如果一部分在后面，这里简化处理，实际项目需精确裁剪
            // 为了性能，我们只添加完全可见或部分可见的线，Project 函数会处理 null
            
            var line = new Line3D(cp1, cp2, isDoor);
            if (isGrid) line.IsDoor = false; // 网格不是门
            
            // 重新计算相机空间深度
            line.Depth = (cp1.Z + cp2.Z) * 0.5f;
            _lines.Add(line);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Color.FromArgb(10, 10, 16)); // 后朋克深黑背景
            g.SmoothingMode = SmoothingMode.AntiAlias; // 抗锯齿

            if (_state != GameState.MENU)
            {
                BuildScene();

                float fogRange = 1500f;
                bool dimmed = (_state == GameState.PAUSED || _state == GameState.INVENTORY);

                foreach (var line in _lines)
                {
                    var p1 = Project(line.P1);
                    var p2 = Project(line.P2);
                    if (!p1.HasValue || !p2.HasValue) continue;

                    // 雾效计算
                    float dist = line.Depth;
                    float alpha = Math.Max(0.1f, 1.0f - (dist / fogRange));
                    if (dimmed) alpha *= 0.3f; // 暂停时变暗

                    int a = (int)(alpha * 255);
                    Color col;
                    
                    if (line.IsDoor) 
                        col = Color.FromArgb(a, 255, 50, 50); // 警示红
                    else 
                        col = Color.FromArgb(a, 255, 220, 100); // 霓虹黄

                    using (Pen pen = new Pen(col, 2.0f))
                        g.DrawLine(pen, p1.Value, p2.Value);
                }

                // 准星
                if (_state == GameState.PLAYING)
                {
                    int cx = Width / 2, cy = Height / 2;
                    using (Pen p = new Pen(Color.White, 2))
                    {
                        g.DrawLine(p, cx - 10, cy, cx + 10, cy);
                        g.DrawLine(p, cx, cy - 10, cx, cy + 10);
                    }
                }
            }

            // UI 层
            DrawUI(g);
        }

        private void DrawUI(Graphics g)
        {
            if (_state == GameState.MENU)
            {
                DrawOverlay(g, "POST_PUNK\nENGINE", new[] { "START", "QUIT" }, new Action[] { StartGame, Close });
            }
            else if (_state == GameState.PAUSED)
            {
                DrawOverlay(g, "PAUSED", new[] { "RESUME", "MENU" }, new Action[] { ResumeGame, GoToMenu });
            }
            else if (_state == GameState.INVENTORY)
            {
                // 简单的背包 UI
                using (var bg = new SolidBrush(Color.FromArgb(200, 0, 0, 0)))
                    g.FillRectangle(bg, 100, 100, Width - 200, Height - 200);
                
                using (var border = new Pen(Color.Gold, 2))
                    g.DrawRectangle(border, 100, 100, Width - 200, Height - 200);

                using (var f = new Font("Consolas", 24))
                using (var b = new SolidBrush(Color.Gold))
                    g.DrawString("INVENTORY [1-9]", f, b, 120, 120);
                
                using (var f = new Font("Consolas", 16))
                using (var b = new SolidBrush(Color.White))
                    g.DrawString("Items: Crowbar, Tape, Key...", f, b, 120, 180);
            }

            // 调试信息
            if (_state == GameState.PLAYING || _state == GameState.INVENTORY)
            {
                string info = $"POS: {_pos.X:F0}, {_pos.Y:F0}, {_pos.Z:F0}\n" +
                              "WASD:Move | SHIFT:Run | CTRL:Crouch\n" +
                              "SPACE:Jump | E:Bag | ESC:Menu";
                using (var f = new Font("Consolas", 12))
                using (var b = new SolidBrush(Color.FromArgb(150, 255, 255, 255)))
                    g.DrawString(info, f, b, 10, 10);
            }
        }

        private void DrawOverlay(Graphics g, string title, string[] btnTexts, Action[] actions)
        {
            using (var bg = new SolidBrush(Color.FromArgb(200, 0, 0, 0)))
                g.FillRectangle(bg, ClientRectangle);

            using (var f = new Font("Consolas", 48, FontStyle.Bold))
            using (var b = new SolidBrush(Color.Gold))
            {
                var sz = g.MeasureString(title, f);
                g.DrawString(title, f, b, (Width - sz.Width) / 2, 150);
            }

            int startY = 350;
            for (int i = 0; i < btnTexts.Length; i++)
            {
                Rectangle rect = new Rectangle(Width / 2 - 100, startY + i * 70, 200, 50);
                bool hover = ClientRectangle.Contains(PointToClient(Cursor.Position)) && 
                             rect.Contains(PointToClient(Cursor.Position)); // 简化悬停检测
                
                using (var bg = new SolidBrush(hover ? Color.Gray : Color.Black))
                using (var border = new Pen(hover ? Color.White : Color.Gray, 2))
                using (var text = new SolidBrush(hover ? Color.White : Color.LightGray))
                {
                    g.FillRectangle(bg, rect);
                    g.DrawRectangle(border, rect);
                    var sz = g.MeasureString(btnTexts[i], _fontMed);
                    g.DrawString(btnTexts[i], _fontMed, text, rect.X + (rect.Width - sz.Width)/2, rect.Y + (rect.Height - sz.Height)/2);
                    
                    // 简单的点击检测
                    if (hover && MouseButtons == MouseButtons.Left) actions[i]?.Invoke();
                }
            }
        }
        #endregion

        #region 输入处理
        private void OnMouseMove(object sender, MouseEventArgs e)
        {
            if (_state != GameState.PLAYING || !_mouseLocked) return;
            
            Point center = new Point(Width / 2, Height / 2);
            int dx = e.X - center.X;
            int dy = e.Y - center.Y;

            if (dx != 0 || dy != 0)
            {
                _yaw += dx * Config.Sensitivity;
                _pitch -= dy * Config.Sensitivity;
                _pitch = Math.Max(-MathF.PI / 2.2f, Math.Min(MathF.PI / 2.2f, _pitch));
                Cursor.Position = PointToScreen(center);
            }
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape)
            {
                if (_state == GameState.INVENTORY) { _state = GameState.PLAYING; LockMouse(); }
                else if (_state == GameState.PLAYING) { _state = GameState.PAUSED; UnlockMouse(); }
                else if (_state == GameState.PAUSED) GoToMenu();
            }
            else if (e.KeyCode == Keys.E && _state == GameState.PLAYING && !_ePressed)
            {
                _state = GameState.INVENTORY;
                UnlockMouse();
                _ePressed = true;
            }
            else if (e.KeyCode >= Keys.D1 && e.KeyCode <= Keys.D9)
            {
                // 物品切换逻辑占位
            }
        }

        protected override void OnKeyUp(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.E) _ePressed = false;
        }

        private void StartGame() { _state = GameState.PLAYING; ResetPlayer(); LockMouse(); }
        private void ResumeGame() { _state = GameState.PLAYING; LockMouse(); }
        private void GoToMenu() { _state = GameState.MENU; UnlockMouse(); }
        #endregion

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.Run(new GameForm());
        }
    }
}
