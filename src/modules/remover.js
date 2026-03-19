const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { CLI_SOURCE_DIRS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * 普通删除 - 只删除 CLI 的可执行文件
 */
async function normalDelete(cliEntry) {
  const results = {
    success: true,
    deleted: [],
    failed: [],
  };

  for (const filePath of cliEntry.paths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        results.deleted.push(filePath);
        logger.success(`已删除: ${filePath}`);
      } else {
        logger.warn(`文件不存在: ${filePath}`);
      }
    } catch (err) {
      results.success = false;
      results.failed.push({ path: filePath, error: err.message });
      logger.error(`删除失败: ${filePath} - ${err.message}`);
    }
  }

  return results;
}

/**
 * 强力删除 - 删除 CLI 及所有关联文件
 */
async function forceDelete(cliEntry, relatedFiles) {
  const results = {
    success: true,
    deleted: [],
    failed: [],
    cleaned: [],
  };

  // 1. 先删除可执行文件
  logger.subtitle('删除可执行文件');
  for (const filePath of cliEntry.paths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        results.deleted.push(filePath);
        logger.success(`已删除: ${filePath}`);
      }
    } catch (err) {
      results.success = false;
      results.failed.push({ path: filePath, error: err.message });
      logger.error(`删除失败: ${filePath} - ${err.message}`);
    }
  }

  // 2. 删除关联目录
  if (relatedFiles && relatedFiles.directories.length > 0) {
    logger.subtitle('删除关联目录');
    for (const dirInfo of relatedFiles.directories) {
      if (dirInfo.shared) {
        logger.warn(`跳过共享目录: ${dirInfo.path} (${dirInfo.label})`);
        continue;
      }
      try {
        if (fs.existsSync(dirInfo.path)) {
          fs.rmSync(dirInfo.path, { recursive: true, force: true });
          results.cleaned.push(dirInfo.path);
          logger.success(`已清理: ${dirInfo.path} (${dirInfo.label})`);
        }
      } catch (err) {
        results.success = false;
        results.failed.push({ path: dirInfo.path, error: err.message });
        logger.error(`清理失败: ${dirInfo.path} - ${err.message}`);
      }
    }
  }

  // 3. 删除关联文件
  if (relatedFiles && relatedFiles.files.length > 0) {
    logger.subtitle('删除关联文件');
    for (const fileInfo of relatedFiles.files) {
      try {
        if (fs.existsSync(fileInfo.path)) {
          fs.unlinkSync(fileInfo.path);
          results.cleaned.push(fileInfo.path);
          logger.success(`已清理: ${fileInfo.path}`);
        }
      } catch (err) {
        results.success = false;
        results.failed.push({ path: fileInfo.path, error: err.message });
        logger.error(`清理失败: ${fileInfo.path} - ${err.message}`);
      }
    }
  }

  // 4. 删除配置文件
  if (relatedFiles && relatedFiles.configPaths.length > 0) {
    logger.subtitle('删除配置文件');
    for (const configInfo of relatedFiles.configPaths) {
      try {
        if (fs.existsSync(configInfo.path)) {
          fs.unlinkSync(configInfo.path);
          results.cleaned.push(configInfo.path);
          logger.success(`已清理: ${configInfo.path} (${configInfo.label})`);
        }
      } catch (err) {
        results.success = false;
        results.failed.push({ path: configInfo.path, error: err.message });
        logger.error(`清理失败: ${configInfo.path} - ${err.message}`);
      }
    }
  }

  // 5. 尝试使用包管理器卸载
  logger.subtitle('尝试包管理器卸载');
  try {
    const pkgResult = uninstallViaPackageManager(cliEntry);
    if (pkgResult) {
      logger.info(pkgResult);
    }
  } catch (err) {
    logger.warn(`包管理器卸载失败: ${err.message}`);
  }

  return results;
}

/**
 * 通过包管理器卸载
 */
function uninstallViaPackageManager(cliEntry) {
  const name = cliEntry.name;
  const source = cliEntry.source;

  switch (source) {
    case 'npm': {
      try {
        const output = execSync(`npm uninstall -g ${name}`, {
          encoding: 'utf8',
          timeout: 30000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return `npm uninstall -g ${name} 执行成功`;
      } catch (err) {
        return `npm uninstall -g ${name} 失败: ${err.stderr || err.message}`;
      }
    }
    case 'pip': {
      try {
        const output = execSync(`pip uninstall -y ${name}`, {
          encoding: 'utf8',
          timeout: 30000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return `pip uninstall -y ${name} 执行成功`;
      } catch (err) {
        return `pip uninstall -y ${name} 失败: ${err.stderr || err.message}`;
      }
    }
    case 'dotnet': {
      try {
        const output = execSync(`dotnet tool uninstall -g ${name}`, {
          encoding: 'utf8',
          timeout: 30000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return `dotnet tool uninstall -g ${name} 执行成功`;
      } catch (err) {
        return `dotnet tool uninstall -g ${name} 失败: ${err.stderr || err.message}`;
      }
    }
    case 'cargo': {
      try {
        const output = execSync(`cargo uninstall ${name}`, {
          encoding: 'utf8',
          timeout: 60000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return `cargo uninstall ${name} 执行成功`;
      } catch (err) {
        return `cargo uninstall ${name} 失败: ${err.stderr || err.message}`;
      }
    }
    default:
      return null;
  }
}

/**
 * 安全检查 - 确认删除操作的安全性
 */
function safetyCheck(cliEntry) {
  const warnings = [];

  // 检查是否为系统保护路径
  for (const filePath of cliEntry.paths) {
    if (filePath.toLowerCase().includes('windows') ||
        filePath.toLowerCase().includes('system32')) {
      warnings.push('⚠️ 警告: 此 CLI 位于系统目录中，删除可能导致系统不稳定！');
    }
  }

  // 检查是否有其他进程正在使用
  // (简化版，实际可以使用 tasklist 检查)

  return warnings;
}

module.exports = {
  normalDelete,
  forceDelete,
  uninstallViaPackageManager,
  safetyCheck,
};
