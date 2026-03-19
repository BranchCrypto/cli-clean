const chalk = require('chalk');
const inquirer = require('inquirer');
const Table = require('cli-table3');
const { formatSize } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * 显示 CLI 列表（分页）
 */
function displayCLIList(cliList, page = 1, pageSize = 15) {
  const totalPages = Math.ceil(cliList.length / pageSize) || 1;
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, cliList.length);
  const pageItems = cliList.slice(start, end);

  const table = new Table({
    head: [
      chalk.cyan('#'),
      chalk.cyan('名称'),
      chalk.cyan('来源'),
      chalk.cyan('大小'),
      chalk.cyan('路径'),
    ],
    colWidths: [5, 20, 16, 10, 45],
    wordWrap: true,
    style: {
      head: [],
      border: ['gray'],
    },
  });

  pageItems.forEach((cli, index) => {
    const num = chalk.gray(`${start + index + 1}`);
    const name = chalk.white.bold(cli.name);
    const source = getSourceColor(cli.source)(cli.sourceLabel);
    const size = chalk.green(formatSize(cli.size));
    const pathStr = chalk.gray(truncatePath(cli.primaryPath, 50));
    table.push([num, name, source, size, pathStr]);
  });

  console.log(table.toString());
  logger.dim(`  第 ${page}/${totalPages} 页 | 共 ${cliList.length} 个 CLI | 显示 ${start + 1}-${end}`);

  return { totalPages, currentPage: page };
}

/**
 * 显示单个 CLI 的详细信息
 */
function displayCLIDetail(cli, related) {
  logger.subtitle(`${cli.name} - 详细信息`);

  // 基本信息
  const infoTable = new Table({
    style: { border: ['gray'] },
    wordWrap: true,
    colWidths: [16, 54],
  });

  infoTable.push(
    [chalk.cyan('名称'), chalk.white.bold(cli.name)],
    [chalk.cyan('来源'), chalk.white(cli.sourceLabel)],
    [chalk.cyan('类型'), chalk.white(cli.source)],
    [chalk.cyan('文件大小'), chalk.green(formatSize(cli.size))],
    [chalk.cyan('文件数量'), chalk.white(`${cli.fileCount} 个`)],
  );

  console.log(infoTable.toString());
  console.log();

  // 文件路径列表
  logger.subtitle('文件路径');
  cli.paths.forEach((p, i) => {
    console.log(`  ${chalk.gray('│')} ${chalk.white(`${i + 1}.`)} ${chalk.yellow(p)}`);
  });

  // 关联文件
  if (related) {
    if (related.directories.length > 0) {
      logger.subtitle('关联目录');
      for (const dir of related.directories) {
        const tag = dir.shared ? chalk.red('[共享]') : '';
        console.log(`  ${chalk.gray('│')} ${chalk.yellow('📁')} ${chalk.white(dir.path)} ${tag}`);
        console.log(`  ${chalk.gray('│')}    ${chalk.gray(dir.label)} - ${chalk.green(formatSize(dir.size))}`);
      }
    }

    if (related.files.length > 0) {
      logger.subtitle('关联文件');
      for (const file of related.files) {
        console.log(`  ${chalk.gray('│')} ${chalk.yellow('📄')} ${chalk.white(file.path)}`);
      }
    }

    if (related.configPaths.length > 0) {
      logger.subtitle('配置文件');
      for (const config of related.configPaths) {
        console.log(`  ${chalk.gray('│')} ${chalk.yellow('⚙️ ')} ${chalk.white(config.path)}`);
        console.log(`  ${chalk.gray('│')}    ${chalk.gray(config.label)} - ${chalk.green(formatSize(config.size))}`);
      }
    }

    if (related.directories.length === 0 &&
        related.files.length === 0 &&
        related.configPaths.length === 0) {
      logger.dim('  未发现关联文件');
    }
  }
}

/**
 * 显示统计信息
 */
function displayStats(cliList) {
  const stats = {};
  let totalSize = 0;

  for (const cli of cliList) {
    const label = cli.sourceLabel;
    if (!stats[label]) {
      stats[label] = { count: 0, size: 0, items: [] };
    }
    stats[label].count++;
    stats[label].size += cli.size;
    stats[label].items.push(cli.name);
    totalSize += cli.size;
  }

  logger.title('📊 CLI 统计概览');

  const table = new Table({
    head: [
      chalk.cyan('来源'),
      chalk.cyan('数量'),
      chalk.cyan('总大小'),
      chalk.cyan('占比'),
    ],
    colWidths: [22, 10, 14, 10],
    style: { border: ['gray'] },
  });

  for (const [label, data] of Object.entries(stats).sort((a, b) => b[1].size - a[1].size)) {
    const percent = totalSize > 0 ? ((data.size / totalSize) * 100).toFixed(1) + '%' : '0%';
    table.push([
      chalk.white(label),
      chalk.yellow(`${data.count} 个`),
      chalk.green(formatSize(data.size)),
      chalk.gray(percent),
    ]);
  }

  // 总计行
  table.push([
    chalk.white.bold('总计'),
    chalk.yellow.bold(`${cliList.length} 个`),
    chalk.green.bold(formatSize(totalSize)),
    chalk.white.bold('100%'),
  ]);

  console.log(table.toString());
}

/**
 * 选择 CLI（支持多选）
 */
async function selectCLIs(cliList, message = '选择要操作的 CLI（空格多选，回车确认）') {
  const choices = cliList.map((cli, index) => ({
    name: `${padRight(cli.name, 22)} ${chalk.gray(cli.sourceLabel.padEnd(18))} ${chalk.green(formatSize(cli.size).padStart(10))}  ${chalk.gray(truncatePath(cli.primaryPath, 30))}`,
    value: index,
    short: cli.name,
  }));

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: chalk.white(message),
      choices,
      pageSize: 15,
      loop: false,
    },
  ]);

  return selected.map(i => cliList[i]);
}

/**
 * 选择删除模式
 */
async function selectDeleteMode() {
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: chalk.white('选择删除模式'),
      choices: [
        {
          name: `${chalk.red('🗑  普通删除')}  ${chalk.gray('仅删除可执行文件')}`,
          value: 'normal',
        },
        {
          name: `${chalk.red.bold('💥 强力删除')}  ${chalk.gray('删除可执行文件 + 所有关联文件和配置')}`,
          value: 'force',
        },
        {
          name: `${chalk.gray('↩  取消')}`,
          value: 'cancel',
        },
      ],
    },
  ]);

  return mode;
}

/**
 * 确认删除
 */
async function confirmDelete(cliList, mode) {
  const modeText = mode === 'force' ? chalk.red.bold('强力删除') : chalk.red('普通删除');

  console.log();
  logger.warn(`即将执行 ${modeText}，将删除以下 ${cliList.length} 个 CLI:`);
  console.log();

  cliList.forEach((cli, i) => {
    console.log(`  ${chalk.red(i + 1 + '.')} ${chalk.white.bold(cli.name)} ${chalk.gray(`(${cli.sourceLabel})`)}`);
  });

  console.log();

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: chalk.yellow.bold(`确认执行 ${mode === 'force' ? '强力删除' : '普通删除'}？此操作不可撤销！`),
      default: false,
    },
  ]);

  return confirmed;
}

/**
 * 显示删除结果
 */
function displayDeleteResult(results) {
  logger.blank();
  if (results.deleted && results.deleted.length > 0) {
    logger.subtitle('已删除的文件');
    results.deleted.forEach(p => {
      console.log(`  ${chalk.green('✔')} ${chalk.white(p)}`);
    });
  }

  if (results.cleaned && results.cleaned.length > 0) {
    logger.subtitle('已清理的关联文件');
    results.cleaned.forEach(p => {
      console.log(`  ${chalk.green('✔')} ${chalk.white(p)}`);
    });
  }

  if (results.failed && results.failed.length > 0) {
    logger.subtitle('删除失败的文件');
    results.failed.forEach(({ path: p, error }) => {
      console.log(`  ${chalk.red('✖')} ${chalk.white(p)}`);
      console.log(`    ${chalk.gray(error)}`);
    });
  }

  const totalDeleted = (results.deleted?.length || 0) + (results.cleaned?.length || 0);
  if (totalDeleted > 0 && (!results.failed || results.failed.length === 0)) {
    logger.blank();
    logger.success(`🎉 全部删除完成！共删除 ${totalDeleted} 个文件/目录`);
  } else if (results.failed && results.failed.length > 0) {
    logger.blank();
    logger.warn(`⚠️  部分文件删除失败（可能需要管理员权限）`);
  }
}

/**
 * 主菜单
 */
async function mainMenu() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white('请选择操作'),
      choices: [
        { name: '🔍 搜索 CLI', value: 'search' },
        { name: '📋 查看全部 CLI 列表', value: 'list' },
        { name: '📊 查看统计信息', value: 'stats' },
        { name: '🗑  删除指定 CLI', value: 'delete' },
        { name: '❌ 退出', value: 'exit' },
      ],
    },
  ]);

  return action;
}

/**
 * 搜索关键词输入
 */
async function askSearchKeyword() {
  const { keyword } = await inquirer.prompt([
    {
      type: 'input',
      name: 'keyword',
      message: chalk.white('输入搜索关键词（名称/来源/路径）:'),
    },
  ]);
  return keyword.trim();
}

/**
 * 页面导航
 */
async function askPageNavigation(currentPage, totalPages) {
  const choices = [{ name: '返回', value: 'back' }];
  if (currentPage > 1) choices.unshift({ name: '◀ 上一页', value: 'prev' });
  if (currentPage < totalPages) choices.push({ name: '下一页 ▶', value: 'next' });
  choices.push({ name: '跳转到指定页', value: 'goto' });

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white('翻页:'),
      choices,
    },
  ]);

  if (action === 'goto') {
    const { page } = await inquirer.prompt([
      {
        type: 'number',
        name: 'page',
        message: chalk.white(`输入页码 (1-${totalPages}):`),
        validate: (val) => val >= 1 && val <= totalPages ? true : `请输入 1-${totalPages} 之间的数字`,
      },
    ]);
    return page;
  }

  return action;
}

// ===== 工具函数 =====

function truncatePath(filePath, maxLen) {
  if (filePath.length <= maxLen) return filePath;
  const basename = path.basename(filePath);
  const ext = path.extname(basename);
  const name = path.basename(basename, ext);
  const dir = path.dirname(filePath);

  const availableLen = maxLen - 3; // 留给 ...
  const namePart = name.length > 8 ? name.slice(0, 8) + '...' : name;
  const dirPart = availableLen - namePart.length - ext.length - 4;

  if (dirPart <= 3) {
    return '...' + filePath.slice(filePath.length - maxLen + 3);
  }

  return dir.slice(0, dirPart) + '...\\' + namePart + ext;
}

function getSourceColor(source) {
  const colors = {
    npm: chalk.green,
    pip: chalk.blue,
    dotnet: chalk.magenta,
    cargo: chalk.red,
    go: chalk.cyan,
    user: chalk.yellow,
    nodejs: chalk.green,
    git: chalk.hex('#f05032'),
    docker: chalk.hex('#2496ed'),
    windowsapps: chalk.blue,
    redis: chalk.red,
    editor: chalk.hex('#007acc'),
    'system-installed': chalk.gray,
    unknown: chalk.gray,
  };
  return colors[source] || chalk.white;
}

function padRight(str, len) {
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}

module.exports = {
  displayCLIList,
  displayCLIDetail,
  displayStats,
  selectCLIs,
  selectDeleteMode,
  confirmDelete,
  displayDeleteResult,
  mainMenu,
  askSearchKeyword,
  askPageNavigation,
};
