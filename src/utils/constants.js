const path = require('path');
const os = require('os');

// Windows 特定的 CLI 工具源目录
const CLI_SOURCE_DIRS = {
  // Node.js 全局包 (npm install -g)
  npmGlobal: {
    label: 'NPM 全局包',
    paths: [
      path.join(process.env.APPDATA || '', 'npm'),
    ],
    type: 'npm',
    detect: (filePath) => {
      const dir = path.dirname(filePath);
      const nodeModules = path.join(dir, 'node_modules');
      return nodeModules;
    },
    getRelatedDirs: (filePath) => {
      const dir = path.dirname(filePath);
      const npmCache = path.join(process.env.APPDATA || '', 'npm-cache');
      const npmPrefix = path.join(process.env.APPDATA || '', 'npm');
      return [
        npmCache,
        npmPrefix,
      ];
    },
  },

  // Python pip 包
  pip: {
    label: 'Python pip 包',
    paths: [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'Scripts'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'Scripts'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'Scripts'),
    ],
    type: 'pip',
    getRelatedDirs: (filePath) => {
      const scriptsDir = path.dirname(filePath);
      const pythonDir = path.dirname(scriptsDir);
      return [
        pythonDir,
      ];
    },
  },

  // .NET 工具
  dotnet: {
    label: '.NET 本地工具',
    paths: [
      path.join(os.homedir(), '.dotnet', 'tools'),
    ],
    type: 'dotnet',
    getRelatedDirs: (filePath) => {
      return [
        path.join(os.homedir(), '.dotnet', 'tools'),
        path.join(os.homedir(), '.dotnet', 'tool-cache'),
      ];
    },
  },

  // 用户自定义 bin
  userBin: {
    label: '用户自定义 bin',
    paths: [
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'bin'),
    ],
    type: 'user',
  },

  // Cargo (Rust)
  cargo: {
    label: 'Cargo (Rust) 包',
    paths: [
      path.join(os.homedir(), '.cargo', 'bin'),
    ],
    type: 'cargo',
    getRelatedDirs: (filePath) => {
      return [
        path.join(os.homedir(), '.cargo', 'registry'),
        path.join(os.homedir(), '.cargo', 'git'),
      ];
    },
  },

  // Go 工具
  go: {
    label: 'Go 工具',
    paths: [
      path.join(os.homedir(), 'go', 'bin'),
    ],
    type: 'go',
    getRelatedDirs: (filePath) => {
      return [
        path.join(os.homedir(), 'go'),
      ];
    },
  },
};

// 常见的系统自带 CLI（不应被删除）
const SYSTEM_CLI_WHITELIST = [
  'cmd', 'powershell', 'pwsh', 'bash', 'sh', 'zsh', 'fish',
  'tasklist', 'taskkill', 'net', 'net1', 'netsh', 'ping', 'tracert',
  'nslookup', 'ipconfig', 'hostname', 'whoami', 'systeminfo',
  'dir', 'cd', 'copy', 'xcopy', 'move', 'del', 'erase', 'mkdir',
  'rmdir', 'type', 'find', 'findstr', 'sort', 'more', 'tree',
  'attrib', 'cacls', 'chkdsk', 'compact', 'convert', 'diskpart',
  'doskey', 'driverquery', 'echo', 'endlocal', 'exit', 'fc',
  'for', 'format', 'ftype', 'goto', 'graftabl', 'help', 'if',
  'label', 'md', 'mode', 'more', 'path', 'pause', 'popd', 'print',
  'prompt', 'pushd', 'rd', 'recover', 'ren', 'rename', 'replace',
  'rmdir', 'set', 'setlocal', 'shift', 'start', 'subst', 'time',
  'title', 'ver', 'verify', 'vol',
  'wsl', 'wslconfig', 'winget',
  'where', 'assoc', 'break', 'call', 'color', 'date', 'dpath',
  'expand', 'extract',
  // Windows system executables
  'conhost', 'dllhost', 'mmc', 'msconfig', 'regedit', 'regsvr32',
  'rundll32', 'sfc', 'sc', 'netstat', 'route', 'arp', 'nbtstat',
  'getmac', 'gpresult', 'openfiles', 'wbadmin', 'wevtutil',
];

// 需要管理员权限才能删除的目录前缀
const PROTECTED_PATHS = [
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\Windows',
  'C:\\ProgramData',
];

// 文件大小格式化
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

// 判断路径是否为系统保护路径
function isProtectedPath(filePath) {
  const normalized = path.resolve(filePath).toLowerCase();
  return PROTECTED_PATHS.some(p => normalized.startsWith(p.toLowerCase()));
}

// 判断是否为系统自带 CLI
function isSystemCLI(name) {
  const baseName = path.basename(name, path.extname(name)).toLowerCase();
  return SYSTEM_CLI_WHITELIST.includes(baseName);
}

module.exports = {
  CLI_SOURCE_DIRS,
  SYSTEM_CLI_WHITELIST,
  PROTECTED_PATHS,
  formatSize,
  isProtectedPath,
  isSystemCLI,
};
