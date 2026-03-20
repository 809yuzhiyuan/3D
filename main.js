// ✅ 1. 引入样式表 (合法)


// ❌ 删除了原来的图片 import，改为下面定义的路径字符串
// ✅ 2. 定义图片路径 (浏览器能看懂的普通字符串)
const heroImg = './assets/hero.png';
const typescriptLogo = './assets/typescript.svg';
const viteLogo = './assets/vite.svg';

// ✅ 3. 引入计数器模块 (合法)
import { setupCounter } from './counter.js' 

// ✅ 4. 渲染 HTML，使用上面定义的变量
document.querySelector('#app').innerHTML = `
<section id="center">
  <div class="hero">
    <img src="${heroImg}" class="base" width="170" height="179">
    <img src="${typescriptLogo}" class="framework" alt="TypeScript logo"/>
    <img src="${viteLogo}" class="vite" alt="Vite logo" />
  </div>
  <div>
    <h1>Get started</h1>
    <p>Edit <code>src/main.js</code> and save to test HMR</p>
  </div>
  <button id="counter" type="button" class="counter"></button>
</section>
<div class="ticks"></div>
<section id="next-steps">
  <div id="docs">
    <!-- ✅ 修改了图标路径：从 /icons.svg 改为 ./图标.svg (相对路径) -->
    <svg class="icon" role="presentation" aria-hidden="true"><use href="./图标.svg#documentation-icon"></use></svg>
    <h2>Documentation</h2>
    <p>Your questions, answered</p>
    <ul>
      <li>
        <a href="https://vite.dev/" target="_blank">
          <img class="logo" src="${viteLogo}" alt="" />
          Explore Vite
        </a>
      </li>
      <li>
        <a href="https://www.typescriptlang.org" target="_blank">
          <img class="button-icon" src="${typescriptLogo}" alt="">
          Learn more
        </a>
      </li>
    </ul>
  </div>
  <div id="social">
    <!-- ✅ 修改了图标路径 -->
    <svg class="icon" role="presentation" aria-hidden="true"><use href="./图标.svg#social-icon"></use></svg>
    <h2>Connect with us</h2>
    <p>Join the Vite community</p>
    <ul>
      <li><a href="https://github.com/vitejs/vite" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="./图标.svg#github-icon"></use></svg>GitHub</a></li>
      <li><a href="https://chat.vite.dev/" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="./图标.svg#discord-icon"></use></svg>Discord</a></li>
      <li><a href="https://x.com/vite_js" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="./图标.svg#x-icon"></use></svg>X.com</a></li>
      <li><a href="https://bsky.app/profile/vite.dev" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="./图标.svg#bluesky-icon"></use></svg>Bluesky</a></li>
    </ul>
  </div>
</section>
<div class="ticks"></div>
<section id="spacer"></section>
`;

// 启动逻辑
const counterElement = document.querySelector('#counter');
if (counterElement) {
  setupCounter(counterElement);
}
