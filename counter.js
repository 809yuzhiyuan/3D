// counter.js
export function setupCounter(element) {
  let counter = 0;
  
  const setCounter = (count) => {
    counter = count;
    element.innerHTML = `count is ${counter}`;
  };

  // 初始化显示
  setCounter(0);

  // 绑定点击事件：每次点击 +1
  element.addEventListener('click', () => setCounter(counter + 1));
}
