const fs = require('fs');
const path = require('path');
const os = require('os');
const { CLI_SOURCE_DIRS, formatSize } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * 分析 CLI 的关联文件和目录
 */
function analyzeRelatedFiles(cliEntry) {
  const related = {
    directories: [],
    files: [],
    registryPaths: [],
    configPaths: [],
    totalSize: 0,
  };

  const name = cliEntry.name;
  const primaryPath = cliEntry.primaryPath;
  const source = cliEntry.source;

  // 根据来源类型分析关联文件
  switch (source) {
    case 'npm': {
      // NPM 全局包：查找 node_modules 中的包目录
      analyzeNpmRelated(cliEntry, related);
      break;
    }
    case 'pip': {
      analyzePipRelated(cliEntry, related);
      break;
    }
    case 'dotnet': {
      analyzeDotnetRelated(cliEntry, related);
      break;
    }
    case 'cargo': {
      analyzeCargoRelated(cliEntry, related);
      break;
    }
    case 'go': {
      analyzeGoRelated(cliEntry, related);
      break;
    }
    default: {
      // 通用分析
      analyzeGenericRelated(cliEntry, related);
      break;
    }
  }

  // 查找配置文件（通用）
  analyzeConfigFiles(name, related);

  // 计算总大小
  const allPaths = [...related.directories, ...related.files];
  for (const p of allPaths) {
    try {
      related.totalSize += getDirectorySize(p);
    } catch { /* ignore */ }
  }

  return related;
}

function analyzeNpmRelated(cliEntry, related) {
  const npmDir = path.join(process.env.APPDATA || '', 'npm');
  const nodeModulesDir = path.join(npmDir, 'node_modules');

  // 尝试在 node_modules 中找到对应的包
  const possibleNames = [
    cliEntry.name,
    `@${cliEntry.name}`,
  ];

  // 也可能是带 scope 的 npm 包
  for (const pName of possibleNames) {
    const pkgDir = path.join(nodeModulesDir, pName);
    if (fs.existsSync(pkgDir)) {
      related.directories.push({
        path: pkgDir,
        label: 'NPM 包目录',
        size: getDirectorySize(pkgDir),
      });
      break;
    }
  }

  // npm 缓存
  const npmCacheDir = path.join(process.env.APPDATA || '', 'npm-cache');
  if (fs.existsSync(npmCacheDir)) {
    const cacheContent = path.join(npmCacheDir, '_content', 'v2');
    if (fs.existsSync(cacheContent)) {
      related.directories.push({
        path: npmCacheDir,
        label: 'NPM 缓存（共享，谨慎删除）',
        size: getDirectorySize(npmCacheDir),
        shared: true,
      });
    }
  }
}

function analyzePipRelated(cliEntry, related) {
  // Python 包通常在 Lib/site-packages 中
  const pythonRoot = path.dirname(path.dirname(cliEntry.primaryPath));
  const sitePackages = path.join(pythonRoot, 'Lib', 'site-packages');

  if (fs.existsSync(sitePackages)) {
    try {
      const entries = fs.readdirSync(sitePackages);
      const cliName = cliEntry.name.replace(/[-_]/g, '');
      for (const entry of entries) {
        const entryName = entry.replace(/[-_.]/g, '').toLowerCase();
        if (entryName.startsWith(cliName)) {
          const fullPath = path.join(sitePackages, entry);
          related.directories.push({
            path: fullPath,
            label: 'Python 包文件',
            size: getDirectorySize(fullPath),
          });
        }
      }
    } catch { /* ignore */ }
  }

  // pip 缓存
  const pipCacheDir = path.join(os.homedir(), 'AppData', 'Local', 'pip', 'cache');
  if (fs.existsSync(pipCacheDir)) {
    related.directories.push({
      path: pipCacheDir,
      label: 'Pip 缓存（共享，谨慎删除）',
      size: getDirectorySize(pipCacheDir),
      shared: true,
    });
  }
}

function analyzeDotnetRelated(cliEntry, related) {
  const toolsDir = path.join(os.homedir(), '.dotnet', 'tools');
  if (fs.existsSync(toolsDir)) {
    related.directories.push({
      path: toolsDir,
      label: '.NET 工具目录（共享，谨慎删除）',
      size: getDirectorySize(toolsDir),
      shared: true,
    });
  }
}

function analyzeCargoRelated(cliEntry, related) {
  // Cargo registry 缓存
  const registryDir = path.join(os.homedir(), '.cargo', 'registry');
  if (fs.existsSync(registryDir)) {
    related.directories.push({
      path: registryDir,
      label: 'Cargo registry 缓存',
      size: getDirectorySize(registryDir),
    });
  }
}

function analyzeGoRelated(cliEntry, related) {
  // Go module cache
  const goCacheDir = path.join(os.homedir(), 'go', 'pkg', 'mod');
  if (fs.existsSync(goCacheDir)) {
    related.directories.push({
      path: goCacheDir,
      label: 'Go module 缓存',
      size: getDirectorySize(goCacheDir),
    });
  }
}

function analyzeGenericRelated(cliEntry, related) {
  const name = cliEntry.name;

  // 查找同名的常见关联目录
  const homeDir = os.homedir();
  const possibleDirs = [
    path.join(homeDir, `.${name}`),
    path.join(homeDir, `.${name}-config`),
    path.join(homeDir, `.${name}.d`),
    path.join(homeDir, 'AppData', 'Local', name),
    path.join(homeDir, 'AppData', 'Roaming', name),
    path.join(homeDir, 'AppData', 'Local', name + '-data'),
    path.join(homeDir, 'AppData', 'Roaming', name + '-data'),
    path.join(homeDir, '.config', name),
    path.join(homeDir, '.cache', name),
    path.join(homeDir, '.local', 'share', name),
    path.join(process.env.LOCALAPPDATA || '', name),
    path.join(process.env.APPDATA || '', name),
  ];

  const seenPaths = new Set();
  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      const normalized = path.resolve(dir).toLowerCase();
      if (seenPaths.has(normalized)) continue;
      seenPaths.add(normalized);
      try {
        const stat = fs.statSync(dir);
        if (stat.isDirectory()) {
          related.directories.push({
            path: dir,
            label: '配置/数据目录',
            size: getDirectorySize(dir),
          });
        }
      } catch { /* ignore */ }
    }
  }
}

function analyzeConfigFiles(name, related) {
  const homeDir = os.homedir();

  // 常见的配置文件位置
  const possibleConfigs = [
    // Unix-style dotfiles
    path.join(homeDir, `.${name}rc`),
    path.join(homeDir, `.${name}.json`),
    path.join(homeDir, `.${name}.yml`),
    path.join(homeDir, `.${name}.yaml`),
    path.join(homeDir, `.${name}.toml`),
    path.join(homeDir, `.${name}.conf`),
    path.join(homeDir, `.${name}.config`),
    path.join(homeDir, `.${name}.cfg`),
    // Windows-style
    path.join(homeDir, `.${name}.ini`),
    // XDG config
    path.join(homeDir, '.config', name, 'config'),
    path.join(homeDir, '.config', name, 'config.json'),
    path.join(homeDir, '.config', name, 'config.yml'),
  ];

  for (const configPath of possibleConfigs) {
    if (fs.existsSync(configPath)) {
      try {
        const stat = fs.statSync(configPath);
        if (stat.isFile()) {
          related.configPaths.push({
            path: configPath,
            label: '配置文件',
            size: stat.size,
          });
        }
      } catch { /* ignore */ }
    }
  }
}

/**
 * 递归计算目录大小
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return stat.size;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          totalSize += getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          totalSize += fs.statSync(fullPath).size;
        }
      } catch {
        // 跳过无法访问的文件
      }
    }
  } catch {
    // 跳过无法访问的目录
  }
  return totalSize;
}

/**
 * 获取关联文件的摘要信息
 */
function getRelatedSummary(related) {
  const parts = [];

  const dirCount = related.directories.length;
  const fileCount = related.files.length;
  const configCount = related.configPaths.length;
  const totalRelatedSize = related.totalSize;

  if (dirCount > 0) parts.push(`${dirCount} 个关联目录`);
  if (fileCount > 0) parts.push(`${fileCount} 个关联文件`);
  if (configCount > 0) parts.push(`${configCount} 个配置文件`);
  if (totalRelatedSize > 0) parts.push(`约 ${formatSize(totalRelatedSize)}`);

  return parts.length > 0 ? parts.join(', ') : '未发现关联文件';
}

module.exports = {
  analyzeRelatedFiles,
  getRelatedSummary,
  getDirectorySize,
};
