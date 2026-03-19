const fs = require('fs');
const path = require('path');
const { CLI_SOURCE_DIRS, isSystemCLI, isProtectedPath } = require('../utils/constants');
const logger = require('../utils/logger');
const { t } = require('../utils/i18n');

/**
 * 从 PATH 环境变量中扫描可执行文件
 */
function scanFromPATH(includeSystem = false) {
  const pathDirs = process.env.PATH.split(path.delimiter);
  const cliMap = new Map(); // name -> [{filePath, source, sourceLabel}]

  for (const dir of pathDirs) {
    const trimmedDir = dir.trim();
    if (!trimmedDir) continue;

    if (!includeSystem && isProtectedPath(trimmedDir)) continue;

    try {
      if (!fs.existsSync(trimmedDir)) continue;
      const stat = fs.statSync(trimmedDir);
      if (!stat.isDirectory()) continue;

      const files = fs.readdirSync(trimmedDir);
      for (const file of files) {
        const fullPath = path.join(trimmedDir, file);
        try {
          const fileStat = fs.statSync(fullPath);
          if (fileStat.isDirectory()) continue;
        } catch {
          continue;
        }

        const ext = path.extname(file).toLowerCase();
        const executableExts = [
          '.exe', '.cmd', '.bat', '.ps1', '.com', '.msi',
          '.vbs', '.wsf', '.wsh',
        ];
        const isExecutable = executableExts.includes(ext) || ext === '';
        if (!isExecutable) continue;

        const baseName = path.basename(file, ext).toLowerCase();
        if (isSystemCLI(baseName)) continue;

        let source = 'unknown';
        let sourceLabel = 'scanner.sourceUnknown';

        for (const [sourceKey, sourceInfo] of Object.entries(CLI_SOURCE_DIRS)) {
          const normalizedDir = path.resolve(trimmedDir).toLowerCase();
          const matchFound = sourceInfo.paths.some(p =>
            path.resolve(p).toLowerCase() === normalizedDir
          );
          if (matchFound) {
            source = sourceInfo.type;
            sourceLabel = `sourceLabels.${sourceKey}`;
            break;
          }
        }

        if (source === 'unknown') {
          const lowerPath = fullPath.toLowerCase();
          if (lowerPath.includes('nodejs') || lowerPath.includes('\\npm\\')) {
            source = 'nodejs';
            sourceLabel = 'scanner.sourceNodeBuiltin';
          } else if (lowerPath.includes('git\\cmd') || lowerPath.includes('git\\bin')) {
            source = 'git';
            sourceLabel = 'scanner.sourceGitBuiltin';
          } else if (lowerPath.includes('docker')) {
            source = 'docker';
            sourceLabel = 'scanner.sourceDockerBuiltin';
          } else if (lowerPath.includes('windowsapps')) {
            source = 'windowsapps';
            sourceLabel = 'scanner.sourceWindowsApps';
          } else if (lowerPath.includes('redis')) {
            source = 'redis';
            sourceLabel = 'scanner.sourceRedisBuiltin';
          } else if (lowerPath.includes('cursor') || lowerPath.includes('vscode')) {
            source = 'editor';
            sourceLabel = 'scanner.sourceEditorBuiltin';
          } else if (isProtectedPath(fullPath)) {
            source = 'system-installed';
            sourceLabel = 'scanner.sourceSystemInstalled';
          } else {
            source = 'unknown';
            sourceLabel = 'scanner.sourceUnknown';
          }
        }

        const key = baseName;
        if (!cliMap.has(key)) {
          cliMap.set(key, []);
        }
        cliMap.get(key).push({
          name: baseName,
          filePath: fullPath,
          source,
          sourceLabel,
        });
      }
    } catch (err) {
      // skip inaccessible directories
    }
  }

  return cliMap;
}

/**
 * 获取所有发现的 CLI 列表
 */
async function scanAllCLIs(options = {}) {
  const includeSystem = options.includeSystem || false;
  logger.info(t('scanner.scanPath'));

  const cliMap = scanFromPATH(includeSystem);

  const cliList = [];
  const seenPaths = new Set();

  for (const [name, entries] of cliMap) {
    const uniqueEntries = [];
    const seenDirs = new Set();

    for (const entry of entries) {
      const dir = path.dirname(entry.filePath).toLowerCase();
      if (!seenDirs.has(dir)) {
        seenDirs.add(dir);
        uniqueEntries.push(entry);
      }
    }

    if (uniqueEntries.length > 0) {
      const primary = uniqueEntries[0];
      const allPaths = uniqueEntries.map(e => e.filePath);

      let totalSize = 0;
      for (const entry of uniqueEntries) {
        try {
          totalSize += fs.statSync(entry.filePath).size;
        } catch { /* ignore */ }
      }

      cliList.push({
        name,
        source: primary.source,
        sourceLabel: primary.sourceLabel,
        paths: allPaths,
        primaryPath: primary.filePath,
        size: totalSize,
        fileCount: uniqueEntries.length,
      });
    }
  }

  cliList.sort((a, b) => a.name.localeCompare(b.name));

  return cliList;
}

/**
 * 搜索 CLI（支持关键词过滤）
 */
async function searchCLIs(keyword, options = {}) {
  const allCLIs = await scanAllCLIs(options);
  if (!keyword) return allCLIs;

  const lowerKeyword = keyword.toLowerCase();
  return allCLIs.filter(cli =>
    cli.name.toLowerCase().includes(lowerKeyword) ||
    cli.sourceLabel.toLowerCase().includes(lowerKeyword) ||
    cli.primaryPath.toLowerCase().includes(lowerKeyword) ||
    t(cli.sourceLabel).toLowerCase().includes(lowerKeyword)
  );
}

/**
 * 按来源分组统计
 */
function getStatsBySource(cliList) {
  const stats = {};
  for (const cli of cliList) {
    if (!stats[cli.source]) {
      stats[cli.source] = { count: 0, totalSize: 0 };
    }
    stats[cli.source].count++;
    stats[cli.source].totalSize += cli.size;
  }
  return stats;
}

module.exports = {
  scanAllCLIs,
  searchCLIs,
  getStatsBySource,
  scanFromPATH,
};
