const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../miniprogram');
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const all = files(root);
for (const file of all.filter(f => f.endsWith('.js'))) cp.execFileSync(process.execPath, ['--check', file]);
for (const file of all.filter(f => f.endsWith('.json'))) JSON.parse(fs.readFileSync(file, 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
for (const page of app.pages) for (const ext of ['.js', '.json', '.wxml', '.wxss']) if (!fs.existsSync(path.join(root, page + ext))) throw Error('Missing page file: ' + page + ext);
for (const f of all.filter(f => /\.(js|json|wxml|wxss)$/.test(f) && !/project\.(config|private\.config)\.json$/.test(f))) {
 const content = fs.readFileSync(f, 'utf8');
 if (/WECHAT_APP_SECRET|session_key|DB_PASSWORD/.test(content)) throw Error('Server credential reference in mini program: ' + f);
}
const compiler = process.env.WECHAT_COMPILER_DIR || '/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec';
if (fs.existsSync(path.join(compiler, 'wcc')) && fs.existsSync(path.join(compiler, 'wcsc'))) {
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pic-mini-compile-'));
 try {
  for (const [cmd, ext] of [['wcc', '.wxml'], ['wcsc', '.wxss']]) {
   cp.execFileSync(path.join(compiler, cmd), ['-o', path.join(temp, cmd + '.js'), ...all.filter(f => f.endsWith(ext)).map(f => path.relative(root, f))], { cwd: root, stdio: 'pipe' });
  }
 } finally { fs.rmSync(temp, { recursive: true, force: true }); }
 console.log('小程序 JS/JSON、页面入口、凭据隔离与微信 WXML/WXSS 编译通过');
} else console.log('小程序 JS/JSON、页面入口和凭据隔离通过；本机无微信编译器，未执行 WXML/WXSS 编译');
