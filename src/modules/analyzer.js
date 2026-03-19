const fs = require('fs');
const path = require('path');
const os = require('os');
const { CLI_SOURCE_DIRS, formatSize } = require('../utils/constants');
const logger = require('../utils/logger');
const { t, tp } = require('../utils/i18n');

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

  switch (source) {
    case 'npm': {
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
      analyzeGenericRelated(cliEntry, related);
      break;
    }
  }

  analyzeConfigFiles(name, related);

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

  const possibleNames = [
    cliEntry.name,
    `@${cliEntry.name}`,
  ];

  for (const pName of possibleNames) {
    const pkgDir = path.join(nodeModulesDir, pName);
    if (fs.existsSync(pkgDir)) {
      related.directories.push({
        path: pkgDir,
        label: t('analyzer.npmPkgDir'),
        size: getDirectorySize(pkgDir),
      });
      break;
    }
  }

  const npmCacheDir = path.join(process.env.APPDATA || '', 'npm-cache');
  if (fs.existsSync(npmCacheDir)) {
    const cacheContent = path.join(npmCacheDir, '_content', 'v2');
    if (fs.existsSync(cacheContent)) {
      related.directories.push({
        path: npmCacheDir,
        label: t('analyzer.npmCache'),
        size: getDirectorySize(npmCacheDir),
        shared: true,
      });
    }
  }
}

function analyzePipRelated(cliEntry, related) {
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
            label: t('analyzer.pythonPkg'),
            size: getDirectorySize(fullPath),
          });
        }
      }
    } catch { /* ignore */ }
  }

  const pipCacheDir = path.join(os.homedir(), 'AppData', 'Local', 'pip', 'cache');
  if (fs.existsSync(pipCacheDir)) {
    related.directories.push({
      path: pipCacheDir,
      label: t('analyzer.pipCache'),
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
      label: t('analyzer.dotnetTools'),
      size: getDirectorySize(toolsDir),
      shared: true,
    });
  }
}

function analyzeCargoRelated(cliEntry, related) {
  const registryDir = path.join(os.homedir(), '.cargo', 'registry');
  if (fs.existsSync(registryDir)) {
    related.directories.push({
      path: registryDir,
      label: t('analyzer.cargoRegistry'),
      size: getDirectorySize(registryDir),
    });
  }
}

function analyzeGoRelated(cliEntry, related) {
  const goCacheDir = path.join(os.homedir(), 'go', 'pkg', 'mod');
  if (fs.existsSync(goCacheDir)) {
    related.directories.push({
      path: goCacheDir,
      label: t('analyzer.goModuleCache'),
      size: getDirectorySize(goCacheDir),
    });
  }
}

function analyzeGenericRelated(cliEntry, related) {
  const name = cliEntry.name;

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
            label: t('analyzer.configDataDir'),
            size: getDirectorySize(dir),
          });
        }
      } catch { /* ignore */ }
    }
  }
}

function analyzeConfigFiles(name, related) {
  const homeDir = os.homedir();

  const possibleConfigs = [
    path.join(homeDir, `.${name}rc`),
    path.join(homeDir, `.${name}.json`),
    path.join(homeDir, `.${name}.yml`),
    path.join(homeDir, `.${name}.yaml`),
    path.join(homeDir, `.${name}.toml`),
    path.join(homeDir, `.${name}.conf`),
    path.join(homeDir, `.${name}.config`),
    path.join(homeDir, `.${name}.cfg`),
    path.join(homeDir, `.${name}.ini`),
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
            label: t('analyzer.configFile'),
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
        // skip inaccessible files
      }
    }
  } catch {
    // skip inaccessible directories
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

  if (dirCount > 0) parts.push(tp('analyzer.relatedDirs', dirCount));
  if (fileCount > 0) parts.push(tp('analyzer.relatedFiles', fileCount));
  if (configCount > 0) parts.push(tp('analyzer.configFiles', configCount));
  if (totalRelatedSize > 0) parts.push(t('analyzer.approxSize', { size: formatSize(totalRelatedSize) }));

  return parts.length > 0 ? parts.join(', ') : t('analyzer.noRelated');
}

module.exports = {
  analyzeRelatedFiles,
  getRelatedSummary,
  getDirectorySize,
};
