const fs = require('fs');
const file = 'electron/main.cjs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/function getOneInferConfigFilePath\(\) \{[\s\S]*?^\}/m, `function getOneInferConfigFilePath() {
  return path.join(os.homedir(), '.oneinfer', 'config.json');
}`);

fs.writeFileSync(file, content);
console.log('patched config path');
