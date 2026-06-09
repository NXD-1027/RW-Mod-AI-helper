const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJsonPath = path.join(root, 'package.json');
const extensionPath = path.join(root, 'src', 'extension.ts');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const extensionSource = fs.readFileSync(extensionPath, 'utf8');

const contributedCommands = new Set(
  (packageJson.contributes?.commands || [])
    .map((entry) => entry.command)
    .filter((command) => command?.startsWith('rwMod.'))
);

const activationCommands = new Set(
  (packageJson.activationEvents || [])
    .map((event) => event.match(/^onCommand:(rwMod\..+)$/)?.[1])
    .filter(Boolean)
);

const registeredCommands = new Set(
  [...extensionSource.matchAll(/registerCommand\(\s*['"`](rwMod\.[^'"`]+)['"`]/g)]
    .map((match) => match[1])
);

const internalCommands = new Set([
  'rwMod.cursorRight',
]);

function diff(left, right) {
  return [...left].filter((item) => !right.has(item)).sort();
}

const problems = [];

const contributedNotRegistered = diff(contributedCommands, registeredCommands);
if (contributedNotRegistered.length > 0) {
  problems.push([
    'package.json contributes.commands 中声明了，但 extension.ts 没有注册:',
    ...contributedNotRegistered.map((command) => `  - ${command}`),
  ].join('\n'));
}

const registeredNotContributed = diff(registeredCommands, new Set([...contributedCommands, ...internalCommands]));
if (registeredNotContributed.length > 0) {
  problems.push([
    'extension.ts 注册了公开命令，但 package.json contributes.commands 没有声明:',
    ...registeredNotContributed.map((command) => `  - ${command}`),
  ].join('\n'));
}

const contributedNotActivated = diff(contributedCommands, activationCommands);
if (contributedNotActivated.length > 0) {
  problems.push([
    'package.json contributes.commands 中声明了，但 activationEvents 缺少 onCommand:',
    ...contributedNotActivated.map((command) => `  - onCommand:${command}`),
  ].join('\n'));
}

const activatedNotRegistered = diff(activationCommands, registeredCommands);
if (activatedNotRegistered.length > 0) {
  problems.push([
    'activationEvents 中声明了 onCommand，但 extension.ts 没有注册:',
    ...activatedNotRegistered.map((command) => `  - ${command}`),
  ].join('\n'));
}

if (problems.length > 0) {
  console.error(problems.join('\n\n'));
  process.exit(1);
}

console.log(`命令注册检查通过：${contributedCommands.size} 个公开命令，${internalCommands.size} 个内部命令。`);
