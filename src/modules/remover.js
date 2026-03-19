const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { CLI_SOURCE_DIRS } = require('../utils/constants');
const logger = require('../utils/logger');
const { t } = require('../utils/i18n');

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
        logger.success(t('remover.fileDeleted', { path: filePath }));
      } else {
        logger.warn(t('remover.fileNotFound', { path: filePath }));
      }
    } catch (err) {
      results.success = false;
      results.failed.push({ path: filePath, error: err.message });
      logger.error(t('remover.deleteFailed', { path: filePath, error: err.message }));
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

  // 1. 删除可执行文件
  logger.subtitle(t('remover.sectionExecutables'));
  for (const filePath of cliEntry.paths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        results.deleted.push(filePath);
        logger.success(t('remover.fileDeleted', { path: filePath }));
      }
    } catch (err) {
      results.success = false;
      results.failed.push({ path: filePath, error: err.message });
      logger.error(t('remover.deleteFailed', { path: filePath, error: err.message }));
    }
  }

  // 2. 删除关联目录
  if (relatedFiles && relatedFiles.directories.length > 0) {
    logger.subtitle(t('remover.sectionDirectories'));
    for (const dirInfo of relatedFiles.directories) {
      if (dirInfo.shared) {
        logger.warn(t('remover.skipShared', { path: dirInfo.path, label: dirInfo.label }));
        continue;
      }
      try {
        if (fs.existsSync(dirInfo.path)) {
          fs.rmSync(dirInfo.path, { recursive: true, force: true });
          results.cleaned.push(dirInfo.path);
          logger.success(t('remover.cleanSuccess', { path: dirInfo.path, label: dirInfo.label }));
        }
      } catch (err) {
        results.success = false;
        results.failed.push({ path: dirInfo.path, error: err.message });
        logger.error(t('remover.cleanFailed', { path: dirInfo.path, error: err.message }));
      }
    }
  }

  // 3. 删除关联文件
  if (relatedFiles && relatedFiles.files.length > 0) {
    logger.subtitle(t('remover.sectionFiles'));
    for (const fileInfo of relatedFiles.files) {
      try {
        if (fs.existsSync(fileInfo.path)) {
          fs.unlinkSync(fileInfo.path);
          results.cleaned.push(fileInfo.path);
          logger.success(t('remover.cleanSuccess', { path: fileInfo.path, label: fileInfo.path }));
        }
      } catch (err) {
        results.success = false;
        results.failed.push({ path: fileInfo.path, error: err.message });
        logger.error(t('remover.cleanFailed', { path: fileInfo.path, error: err.message }));
      }
    }
  }

  // 4. 删除配置文件
  if (relatedFiles && relatedFiles.configPaths.length > 0) {
    logger.subtitle(t('remover.sectionConfigs'));
    for (const configInfo of relatedFiles.configPaths) {
      try {
        if (fs.existsSync(configInfo.path)) {
          fs.unlinkSync(configInfo.path);
          results.cleaned.push(configInfo.path);
          logger.success(t('remover.cleanSuccess', { path: configInfo.path, label: configInfo.label }));
        }
      } catch (err) {
        results.success = false;
        results.failed.push({ path: configInfo.path, error: err.message });
        logger.error(t('remover.cleanFailed', { path: configInfo.path, error: err.message }));
      }
    }
  }

  // 5. 尝试使用包管理器卸载
  logger.subtitle(t('remover.sectionPkgUninstall'));
  try {
    const pkgResult = uninstallViaPackageManager(cliEntry);
    if (pkgResult) {
      logger.info(pkgResult);
    }
  } catch (err) {
    logger.warn(t('remover.pkgUninstallFailed', { error: err.message }));
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
        return t('remover.npmSuccess', { name });
      } catch (err) {
        return t('remover.npmFailed', { name, error: err.stderr || err.message });
      }
    }
    case 'pip': {
      try {
        const output = execSync(`pip uninstall -y ${name}`, {
          encoding: 'utf8',
          timeout: 30000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return t('remover.pipSuccess', { name });
      } catch (err) {
        return t('remover.pipFailed', { name, error: err.stderr || err.message });
      }
    }
    case 'dotnet': {
      try {
        const output = execSync(`dotnet tool uninstall -g ${name}`, {
          encoding: 'utf8',
          timeout: 30000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return t('remover.dotnetSuccess', { name });
      } catch (err) {
        return t('remover.dotnetFailed', { name, error: err.stderr || err.message });
      }
    }
    case 'cargo': {
      try {
        const output = execSync(`cargo uninstall ${name}`, {
          encoding: 'utf8',
          timeout: 60000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return t('remover.cargoSuccess', { name });
      } catch (err) {
        return t('remover.cargoFailed', { name, error: err.stderr || err.message });
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

  for (const filePath of cliEntry.paths) {
    if (filePath.toLowerCase().includes('windows') ||
        filePath.toLowerCase().includes('system32')) {
      warnings.push(t('remover.systemPathWarning'));
    }
  }

  return warnings;
}

module.exports = {
  normalDelete,
  forceDelete,
  uninstallViaPackageManager,
  safetyCheck,
};
