const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sectionsDir = path.join(root, 'data', 'sections');
const officialRefPath = path.join(root, 'knowledge', '参考文档', '官方参数参考表1.15.md');
const aiProviderPath = path.join(root, 'src', 'ai', 'aiProvider.ts');
const knowledgeBasePath = path.join(root, 'src', 'rag', 'knowledgeBase.ts');

const problems = [];

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function hasSecondUnitExample(example) {
  return /:\s*[-+]?\d*\.?\d+s\b/i.test(String(example || ''));
}

function typeMentionsSeconds(type) {
  return /(^|\W)(s|time|seconds|秒)(\W|$)/i.test(String(type || ''));
}

function checkSectionData() {
  for (const file of fs.readdirSync(sectionsDir).sort()) {
    if (!file.endsWith('.json')) continue;

    const filePath = path.join(sectionsDir, file);
    const section = JSON.parse(read(filePath));
    for (const field of section.data || []) {
      if (hasSecondUnitExample(field.example) && !typeMentionsSeconds(field.type)) {
        problems.push(
          `${file}: ${field.name} 的示例使用秒单位 (${field.example})，但 type 仍是 "${field.type}"`
        );
      }
    }
  }
}

function checkOfficialReference() {
  const official = read(officialRefPath);
  const requiredSnippets = [
    'buildSpeed: 3s',
    'shootDelay: 5s',
    'recoilOutTime: 1s',
    'recoilReturnTime: 0.5s',
    'buildSpeed | time',
    'price: 500, gold=5, stone=10',
    'copyFrom: ROOT:defaultTanks.template, tankT1.ini',
    'autoTrigger: if self.customTimer(laterThanSeconds=5)',
    'text: Fire: %{self.resource.ammo}',
    'spawnEffects: effect_${targetEffect}',
    '@memory transportCount: float',
  ];

  for (const snippet of requiredSnippets) {
    if (!official.includes(snippet)) {
      problems.push(`官方参数参考表中缺少关键合法语法示例: ${snippet}`);
    }
  }
}

function checkAiKnowledgeGuards() {
  const aiProvider = read(aiProviderPath);
  const knowledgeBase = read(knowledgeBasePath);

  const requiredPromptSnippets = [
    'buildSpeed: 40s',
    'shootDelay: 5s',
    '不要误判为非法',
    '多资源 price/addResources',
    'credits=-150',
    '逗号引用列表',
    'ROOT: 路径',
    'LogicBoolean',
    '%{self.resource.ammo}',
    '模板变量语法',
    '@memory/@define/@copyFromSection',
    'NONE/AUTO',
  ];

  for (const snippet of requiredPromptSnippets) {
    if (!aiProvider.includes(snippet)) {
      problems.push(`AI 系统提示缺少合法语法保护规则: ${snippet}`);
    }
  }

  const requiredKnowledgeSnippets = [
    '秒单位时间值',
    'shootDelay:             射击间隔',
    '高级但合法的 INI 写法',
    'price: credits=500, energy=10',
    'addResources: credits=-150, energy=1',
    'copyFrom: ROOT:defaultTanks.template, tankT1.ini',
    'isVisible: if self.resource',
    'text: Fire: %{self.resource.ammo}',
    'spawnEffects: effect_\\${targetEffect}',
    '@copyFromSection',
    '@memory transportCount: float',
    'image_turret: NONE',
    'image_shadow: AUTO',
  ];

  for (const snippet of requiredKnowledgeSnippets) {
    if (!knowledgeBase.includes(snippet)) {
      problems.push(`内置知识库缺少合法语法说明: ${snippet}`);
    }
  }
}

checkSectionData();
checkOfficialReference();
checkAiKnowledgeGuards();

if (problems.length > 0) {
  console.error('AI 知识自检失败：');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log('AI 知识自检通过：字段时间单位、高级合法语法、官方示例和 AI 提示规则一致。');
