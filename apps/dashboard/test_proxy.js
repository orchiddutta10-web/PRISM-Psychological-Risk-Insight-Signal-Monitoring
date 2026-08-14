const { execSync } = require('child_process');
const token = execSync('python -c "from app.utils.auth import create_access_token; print(create_access_token({\\\"sub\\\": \\\"0ad2f62a-e779-41cd-978c-23a0954379a3\\\", \\\"type\\\": \\\"guardian\\\"}))"', { cwd: '../../services/api', encoding: 'utf8' }).trim();
fetch('http://127.0.0.1:3000/api/v1/auth/devices', { headers: { 'Authorization': 'Bearer ' + token } })
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);
