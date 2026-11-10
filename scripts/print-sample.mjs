/*
 * 用「干净的演示数据」生成一张 A4 打印样张 → docs/images/print-sample.png
 *
 *   node scripts/print-sample.mjs
 *
 * 和测试里那张的区别：测试房间的名字、分值都是造出来的（还有 7 分、0 分这种
 * 极端值），拿去当文档配图不好看。这里专门开一个演示房间，
 * 用**真实的代码路径**（打印按钮 → 选项 → 生成清单）截一张干净的图。
 *
 * 需要：本地服务在跑（默认 5199）、Chrome 调试端口可用（默认 9333）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTab, sleep } from './lib/cdp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = process.env.BASE || 'http://localhost:5199';

/*
 * 房间码从命令行拿（先跑 `node scripts/demo-seed.mjs` 要一个演示房间）。
 * 本来想在这里直接 spawn demo-seed，但沙箱不允许捕获子进程输出（EPERM）。
 */
const room = process.argv[2];
if (!room) {
  console.error('用法：node scripts/print-sample.mjs <演示房间码>');
  console.error('     先跑 node scripts/demo-seed.mjs 拿一个房间码');
  process.exit(2);
}
console.log('  演示房间：' + room);

const tab = await openTab({ url: BASE + '/?room=' + room, port: Number(process.env.CDP_PORT || 9333),
  width: 412, height: 940, settle: 2800, clickDelay: 60 });
const click = (sel) => tab.evaluate('(function(){var e=document.querySelector(' +
  JSON.stringify(sel) + '); if(e) e.click(); return Boolean(e);})()');

await click('#tabbar [data-view="parent"]');
await sleep(900);
for (const d of '1234') { await click('[data-act="pin-key"][data-key="' + d + '"]'); await tab.sleep(160); }
await sleep(1300);
await click('[data-act="parent-tab"][data-tab="hw"]');
await sleep(1000);

// 拦掉真正的打印对话框（无头环境会卡住）
await tab.evaluate('(function(){ window.print=function(){}; return 1; })()');
await click('[data-act="print-options"]');
await sleep(800);
await click('.modal .btn.primary');
await sleep(1200);

// 清单不再自己关（第 98 轮），所以这里不用再等兜底；直接改成静态排版好整张截
await sleep(600);
await tab.evaluate('(function(){' +
  'document.body.classList.add("printing");' +
  'var s=document.getElementById("print-sheet");' +
  's.style.position="static"; s.style.width="794px"; s.style.height="auto";' +
  's.style.overflow="visible"; s.style.boxShadow="none"; s.style.transform="none";' +
  's.style.inset="auto"; s.style.left="auto"; s.style.top="auto"; s.style.margin="0";' +
  // 「✕ 关闭清单」那条工具条只在屏幕上有用，样张里不要
  'var bar=s.querySelector(".p-screen-bar"); if(bar) bar.style.display="none";' +
  'window.scrollTo(0,0); return 1;})()');
await sleep(400);

const geom = await tab.evaluate('(function(){' +
  'var s=document.getElementById("print-sheet");' +
  'var r=s.getBoundingClientRect();' +
  'return { w:Math.round(r.width), h:Math.round(r.height),' +
  '  left:Math.round(r.left), top:Math.round(r.top) };})()');
console.log('  清单尺寸：' + JSON.stringify(geom));

const shot = await tab.send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: geom.left, y: geom.top, width: geom.w, height: geom.h, scale: 2 },
  captureBeyondViewport: true,
});
const outPng = path.join(ROOT, 'docs', 'images', 'print-sample.png');
fs.mkdirSync(path.dirname(outPng), { recursive: true });
fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
console.log('  已写出 docs/images/print-sample.png（' + fs.statSync(outPng).size + ' 字节）');

await tab.close();
