const fs = require('fs');
const path = require('path');
const { CLI_SOURCE_DIRS, isSystemCLI, isProtectedPath } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * 从 PATH 环境变量中扫描可执行文件
 */
function scanFromPATH(includeSystem = false) {
  const pathDirs = process.env.PATH.split(path.delimiter);
  const cliMap = new Map(); // name -> [{filePath, source, sourceLabel}]

  for (const dir of pathDirs) {
    const trimmedDir = dir.trim();
    if (!trimmedDir) continue;

    // 默认跳过系统保护路径
    if (!includeSystem && isProtectedPath(trimmedDir)) continue;

    try {
      if (!fs.existsSync(trimmedDir)) continue;
      const stat = fs.statSync(trimmedDir);
      if (!stat.isDirectory()) continue;

      const files = fs.readdirSync(trimmedDir);
      for (const file of files) {
        // 跳过目录
        const fullPath = path.join(trimmedDir, file);
        try {
          const fileStat = fs.statSync(fullPath);
          if (fileStat.isDirectory()) continue;
        } catch {
          continue;
        }

        // 判断是否为可执行文件
        const ext = path.extname(file).toLowerCase();
        const executableExts = [
          '.exe', '.cmd', '.bat', '.ps1', '.com', '.msi',
          '.vbs', '.wsf', '.wsh',
        ];
        // 也包括无扩展名的文件（Linux 风格）
        const isExecutable = executableExts.includes(ext) || ext === '';
        if (!isExecutable) continue;

        // 跳过系统 CLI
        const baseName = path.basename(file, ext).toLowerCase();
        if (isSystemCLI(baseName)) continue;

        // 找到对应的 CLI 源
        let source = 'unknown';
        let sourceLabel = '未知来源';

        for (const [sourceKey, sourceInfo] of Object.entries(CLI_SOURCE_DIRS)) {
          const normalizedDir = path.resolve(trimmedDir).toLowerCase();
          const matchFound = sourceInfo.paths.some(p =>
            path.resolve(p).toLowerCase() === normalizedDir
          );
          if (matchFound) {
            source = sourceKey;
            sourceLabel = sourceInfo.label;
            break;
          }
        }

        // 如果没有匹配到已知源，尝试通过路径特征判断
        if (source === 'unknown') {
          const lowerPath = fullPath.toLowerCase();
          if (lowerPath.includes('nodejs') || lowerPath.includes('\\npm\\')) {
            source = 'nodejs';
            sourceLabel = 'Node.js 自带';
          } else if (lowerPath.includes('git\\cmd') || lowerPath.includes('git\\bin')) {
            source = 'git';
            sourceLabel = 'Git 自带';
          } else if (lowerPath.includes('docker')) {
            source = 'docker';
            sourceLabel = 'Docker 自带';
          } else if (lowerPath.includes('windowsapps')) {
            source = 'windowsapps';
            sourceLabel = 'Windows Store 应用';
          } else if (lowerPath.includes('redis')) {
            source = 'redis';
            sourceLabel = 'Redis 自带';
          } else if (lowerPath.includes('cursor') || lowerPath.includes('vscode')) {
            source = 'editor';
            sourceLabel = '编辑器附带';
          } else if (isProtectedPath(fullPath)) {
            source = 'system-installed';
            sourceLabel = '系统安装程序';
          } else {
            source = 'unknown';
            sourceLabel = '未知来源';
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
      // 跳过无权限的目录
    }
  }

  return cliMap;
}

/**
 * 获取所有发现的 CLI 列表
 */
async function scanAllCLIs(options = {}) {
  const includeSystem = options.includeSystem || false;
  logger.info('正在扫描 PATH 环境变量中的所有可执行文件...');

  const cliMap = scanFromPATH(includeSystem);

  // 合并同名 CLI，保留去重后的列表
  const cliList = [];
  const seenPaths = new Set();

  for (const [name, entries] of cliMap) {
    // 去重：同一路径的 .exe 和 .cmd 算同一个 CLI
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

      // 获取文件大小
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

  // 按名称排序
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
    cli.primaryPath.toLowerCase().includes(lowerKeyword)
  );
}

/**
 * 按来源分组统计
 */
function getStatsBySource(cliList) {
  const stats = {};
  for (const cli of cliList) {
    if (!stats[cli.sourceLabel]) {
      stats[cli.sourceLabel] = { count: 0, totalSize: 0 };
    }
    stats[cli.sourceLabel].count++;
    stats[cli.sourceLabel].totalSize += cli.size;
  }
  return stats;
}

module.exports = {
  scanAllCLIs,
  searchCLIs,
  getStatsBySource,
  scanFromPATH,
};
