const fs = require('fs');
const file = 'electron/main.cjs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/function readState\(\) \{[\s\S]*?^\}/m, `function readState() {
  const filePath = getStateFilePath();
  let state = { settings: {}, session: null };
  if (fs.existsSync(filePath)) {
    try {
      state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {}
  }

  try {
    const devSessionPath = path.join(os.homedir(), '.oneinfer', 'developer_session.json');
    if (fs.existsSync(devSessionPath)) {
      const devSession = JSON.parse(fs.readFileSync(devSessionPath, 'utf8'));
      if (devSession && devSession.access_token && devSession.developer_id) {
        state.session = {
          accessToken: devSession.access_token,
          developerId: devSession.developer_id,
          email: devSession.email || '',
        };
      }
    } else {
      state.session = null;
    }
  } catch (err) {
    console.error('[state] failed to read developer_session.json', err);
  }

  return state;
}`);

content = content.replace(/function writeState\(nextState\) \{[\s\S]*?^\}/m, `function writeState(nextState) {
  const filePath = getStateFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(nextState, null, 2), 'utf8');

  try {
    const devSessionPath = path.join(os.homedir(), '.oneinfer', 'developer_session.json');
    if (nextState && nextState.session) {
      const sessionData = {
        access_token: nextState.session.accessToken,
        developer_id: nextState.session.developerId,
        email: nextState.session.email
      };
      fs.mkdirSync(path.dirname(devSessionPath), { recursive: true });
      fs.writeFileSync(devSessionPath, JSON.stringify(sessionData, null, 2), 'utf8');
    } else if (fs.existsSync(devSessionPath)) {
      fs.unlinkSync(devSessionPath);
    }
  } catch (err) {
    console.error('[state] failed to sync developer_session.json', err);
  }
}`);

fs.writeFileSync(file, content);
console.log('patched successfully');
