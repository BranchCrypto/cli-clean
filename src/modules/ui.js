const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const readline = require('readline');
const Table = require('cli-table3');
const { formatSize } = require('../utils/constants');
const logger = require('../utils/logger');
const { t, tp } = require('../utils/i18n');

// ===== Shared table style =====
const TABLE_CHARS = {
  'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
  'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
  'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
  'right': '│', 'right-mid': '┤',
};
const TABLE_STYLE = {
  'border-color': 'gray',
  chars: TABLE_CHARS,
  head: [],
};

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
      chalk.cyan(t('ui.tableHeader.index')),
      chalk.cyan(t('ui.tableHeader.name')),
      chalk.cyan(t('ui.tableHeader.source')),
      chalk.cyan(t('ui.tableHeader.size')),
      chalk.cyan(t('ui.tableHeader.path')),
    ],
    colWidths: [5, 20, 22, 10, 39],
    wordWrap: true,
    style: TABLE_STYLE,
  });

  pageItems.forEach((cli, index) => {
    const num = chalk.gray(`${start + index + 1}`);
    const name = chalk.white.bold(cli.name);
    const displayLabel = t(cli.sourceLabel);
    const color = getSourceColor(cli.source);
    const source = color(displayLabel);
    const size = chalk.green(formatSize(cli.size));
    const pathStr = chalk.gray(truncatePath(cli.primaryPath, 50));
    table.push([num, name, source, size, pathStr]);
  });

  console.log(table.toString());

  // 分页信息行
  const pageInfo = `  ${t('ui.pageInfo', { page, total: totalPages, totalItems: cliList.length, start: start + 1, end })}`;
  logger.dim(pageInfo);

  return { totalPages, currentPage: page };
}

/**
 * 显示单个 CLI 的详细信息（增强版）
 */
function displayCLIDetail(cli, related) {
  const displayLabel = t(cli.sourceLabel);
  const color = getSourceColor(cli.source);

  // 标题行
  console.log();
  console.log(chalk.cyan.bold('  ┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan.bold('  │') + chalk.white.bold(`  ${cli.name}`) + ' '.repeat(Math.max(0, 38 - cli.name.length)) + chalk.cyan.bold('│'));
  console.log(chalk.cyan.bold('  └─────────────────────────────────────────────────────┘'));
  console.log();

  // 基本信息：用 key-value 对齐格式
  const rows = [
    [chalk.cyan('Source'), color(displayLabel)],
    [chalk.cyan('Type'),   chalk.white(cli.source)],
    [chalk.cyan('Size'),   chalk.green.bold(formatSize(cli.size))],
    [chalk.cyan('Files'),  chalk.white(`${cli.fileCount}`)],
  ];

  rows.forEach(([key, val]) => {
    console.log(`  ${chalk.gray('┃')}  ${key.padEnd(10)}  ${val}`);
  });

  // 文件路径列表
  console.log();
  logger.subtitle(t('ui.filePathTitle'));
  cli.paths.forEach((p, i) => {
    const marker = chalk.cyan.bold(`${String(i + 1).padStart(2)}.`);
    console.log(`  ${chalk.gray('│')}  ${marker}  ${chalk.yellow(p)}`);
  });

  // 关联文件
  if (related) {
    const hasDirs = related.directories.length > 0;
    const hasFiles = related.files.length > 0;
    const hasConfigs = related.configPaths.length > 0;

    if (hasDirs) {
      console.log();
      logger.subtitle(t('ui.relatedDirTitle'));
      for (const dir of related.directories) {
        const tag = dir.shared ? '  ' + chalk.red.bold(t('ui.sharedTag')) : '';
        console.log(`  ${chalk.gray('│')}  ${chalk.yellow('📁')}  ${chalk.white(dir.path)}${tag}`);
        console.log(`  ${chalk.gray('│')}       ${chalk.dim(dir.label)}  ${chalk.green(formatSize(dir.size))}`);
      }
    }

    if (hasFiles) {
      console.log();
      logger.subtitle(t('ui.relatedFileTitle'));
      for (const file of related.files) {
        console.log(`  ${chalk.gray('│')}  ${chalk.yellow('📄')}  ${chalk.white(file.path)}`);
      }
    }

    if (hasConfigs) {
      console.log();
      logger.subtitle(t('ui.configTitle'));
      for (const config of related.configPaths) {
        console.log(`  ${chalk.gray('│')}  ${chalk.yellow('⚙')}   ${chalk.white(config.path)}`);
        console.log(`  ${chalk.gray('│')}       ${chalk.dim(config.label)}  ${chalk.green(formatSize(config.size))}`);
      }
    }

    if (!hasDirs && !hasFiles && !hasConfigs) {
      console.log();
      logger.dim(`  ${chalk.gray('·')}  ${t('ui.noRelated')}`);
    }
  }
}

/**
 * 显示统计信息（增强版：底部汇总 + 百分比条）
 */
function displayStats(cliList) {
  const stats = {};
  let totalSize = 0;

  for (const cli of cliList) {
    const label = cli.source;
    if (!stats[label]) {
      stats[label] = { count: 0, size: 0, sourceLabel: cli.sourceLabel };
    }
    stats[label].count++;
    stats[label].size += cli.size;
    totalSize += cli.size;
  }

  logger.title(t('ui.statsTitle'));

  const sorted = Object.entries(stats).sort((a, b) => b[1].size - a[1].size);

  const table = new Table({
    head: [
      chalk.cyan(t('ui.tableHeader.source')),
      chalk.cyan(t('ui.tableHeader.count')),
      chalk.cyan(t('ui.tableHeader.totalSize')),
      chalk.cyan(t('ui.tableHeader.percent')),
    ],
    colWidths: [22, 10, 14, 20],
    style: TABLE_STYLE,
  });

  for (const [source, data] of sorted) {
    const percent = totalSize > 0 ? ((data.size / totalSize) * 100).toFixed(1) : '0.0';
    const barLen = Math.round(parseFloat(percent) / 5);
    const bar = chalk.cyan('█'.repeat(barLen)) + chalk.gray.dim('░'.repeat(20 - barLen));
    const displayLabel = t(data.sourceLabel);

    table.push([
      chalk.white(displayLabel),
      { content: chalk.yellow(String(data.count)), hAlign: 'right' },
      chalk.green(formatSize(data.size)),
      `${chalk.white(percent + '%')} ${bar}`,
    ]);
  }

  // 分隔行 + 总计
  table.push([
    chalk.cyan('─'.repeat(22)),
    { content: chalk.cyan('─'.repeat(10)), hAlign: 'right' },
    chalk.cyan('─'.repeat(14)),
    chalk.cyan('─'.repeat(20)),
  ]);
  table.push([
    chalk.white.bold(t('ui.tableHeader.total')),
    { content: chalk.yellow.bold(String(cliList.length)), hAlign: 'right' },
    chalk.green.bold(formatSize(totalSize)),
    chalk.white.bold('100%'),
  ]);

  console.log(table.toString());

  // 底部汇总
  console.log();
  const sourceTypes = sorted.length;
  const largestSource = sorted[0];
  const largestLabel = largestSource ? t(largestSource[1].sourceLabel) : '-';
  const largestSize = largestSource ? formatSize(largestSource[1].size) : '0 B';
  const largestPercent = largestSource && totalSize > 0
    ? ((largestSource[1].size / totalSize) * 100).toFixed(1) + '%'
    : '0%';

  logger.detail(
    t('ui.tableHeader.source'),
    chalk.yellow(String(sourceTypes)) + '  |  ' +
    chalk.gray(`${t('ui.statsLargest')}: `) +
    chalk.white.bold(largestLabel) +
    chalk.gray(` (${largestSize}, ${largestPercent})`)
  );
}

/**
 * 选择 CLI（支持多选，增强版）
 */
async function selectCLIs(cliList, message) {
  const choices = cliList.map((cli, index) => {
    const color = getSourceColor(cli.source);
    const displayLabel = t(cli.sourceLabel);
    const name = padRight(cli.name, 20);
    const source = chalk.dim('[') + color(displayLabel) + chalk.dim(']');
    return {
      name: `  ${chalk.white.bold(name)}  ${source}  ${chalk.green(formatSize(cli.size).padStart(10))}  ${chalk.dim(truncatePath(cli.primaryPath, 30))}`,
      value: index,
      short: cli.name,
    };
  });

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: chalk.white(message),
      choices,
      pageSize: 12,
      loop: false,
    },
  ]);

  return selected.map(i => cliList[i]);
}

/**
 * 选择删除模式（增强版：带分隔线）
 */
async function selectDeleteMode() {
  const separator1 = new inquirer.Separator(chalk.gray('─'.repeat(50)));
  const separator2 = new inquirer.Separator(chalk.gray('─'.repeat(50)));

  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: chalk.white(t('ui.selectDeleteMode')),
      choices: [
        {
          name: `  ${chalk.red('🗑')}  ${chalk.white(t('ui.deleteNormal'))}`,
          value: 'normal',
        },
        chalk.gray(`       ${t('ui.deleteNormalDesc')}`),
        separator1,
        {
          name: `  ${chalk.red.bold('💥')}  ${chalk.white.bold(t('ui.deleteForce'))}`,
          value: 'force',
        },
        chalk.gray(`       ${t('ui.deleteForceDesc')}`),
        separator2,
        {
          name: `  ${chalk.gray(t('ui.cancel'))}`,
          value: 'cancel',
        },
      ],
    },
  ]);

  return mode;
}

/**
 * 确认删除（增强版：表格化摘要）
 */
async function confirmDelete(cliList, mode) {
  const isForce = mode === 'force';
  const modeLabel = isForce ? chalk.red.bold(t('ui.deleteForce')) : chalk.red(t('ui.deleteNormal'));

  console.log();
  // 删除摘要
  const totalSize = cliList.reduce((sum, c) => sum + c.size, 0);
  logger.warn(t('prompt.deleteSummary', {
    count: cliList.length,
    size: formatSize(totalSize),
  }));

  console.log();

  // 表格化待删除列表
  const table = new Table({
    colWidths: [5, 22, 16, 14],
    style: TABLE_STYLE,
  });

  cliList.forEach((cli, i) => {
    const color = getSourceColor(cli.source);
    table.push([
      chalk.red(String(i + 1) + '.'),
      chalk.white.bold(cli.name),
      color(t(cli.sourceLabel)),
      chalk.green(formatSize(cli.size)),
    ]);
  });

  console.log(table.toString());
  console.log();

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: chalk.yellow.bold(t('ui.confirmPrompt', { mode: isForce ? t('ui.deleteForce') : t('ui.deleteNormal') })),
      default: false,
    },
  ]);

  return confirmed;
}

/**
 * 显示删除结果（增强版：汇总统计）
 */
function displayDeleteResult(results) {
  const deletedCount = results.deleted?.length || 0;
  const cleanedCount = results.cleaned?.length || 0;
  const failedCount = results.failed?.length || 0;
  const totalSuccess = deletedCount + cleanedCount;
  const totalActions = totalSuccess + failedCount;

  logger.blank();

  // 结果摘要条
  const summaryParts = [];
  if (deletedCount > 0) summaryParts.push(chalk.green(`${deletedCount} deleted`));
  if (cleanedCount > 0) summaryParts.push(chalk.green(`${cleanedCount} cleaned`));
  if (failedCount > 0) summaryParts.push(chalk.red(`${failedCount} failed`));

  if (summaryParts.length > 0) {
    const divider = '─'.repeat(50);
    console.log(chalk.gray(`  ${divider}`));
    console.log(`  ${summaryParts.join(chalk.gray('  |  '))}`);
    console.log(chalk.gray(`  ${divider}`));
    console.log();
  }

  if (results.deleted && results.deleted.length > 0) {
    logger.subtitle(t('ui.deletedFiles'));
    results.deleted.forEach(p => {
      console.log(`  ${chalk.green('✔')} ${chalk.white(p)}`);
    });
  }

  if (results.cleaned && results.cleaned.length > 0) {
    logger.subtitle(t('ui.cleanedFiles'));
    results.cleaned.forEach(p => {
      console.log(`  ${chalk.green('✔')} ${chalk.white(p)}`);
    });
  }

  if (results.failed && results.failed.length > 0) {
    logger.subtitle(t('ui.failedFiles'));
    results.failed.forEach(({ path: p, error }) => {
      console.log(`  ${chalk.red('✖')} ${chalk.white(p)}`);
      console.log(`    ${chalk.gray(error)}`);
    });
  }

  if (totalSuccess > 0 && failedCount === 0) {
    logger.blank();
    logger.success(t('ui.allDeletedSuccess', { count: totalSuccess }));
  } else if (failedCount > 0) {
    logger.blank();
    logger.warn(t('ui.someDeleteFailed'));
  }
}

/**
 * 主菜单（增强版：带分隔线和 footer 提示）
 */
async function mainMenu() {
  console.log();
  const separator = new inquirer.Separator(chalk.gray('─'.repeat(40)));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white(t('menu.mainPrompt')),
      choices: [
        { name: `  ${chalk.cyan('🔍')}  ${t('menu.search')}`, value: 'search' },
        { name: `  ${chalk.cyan('📋')}  ${t('menu.list')}`, value: 'list' },
        { name: `  ${chalk.cyan('📊')}  ${t('menu.stats')}`, value: 'stats' },
        separator,
        { name: `  ${chalk.red('🗑')}  ${t('menu.delete')}`, value: 'delete' },
        separator,
        { name: `  ${chalk.gray('❌')}  ${t('menu.exit')}`, value: 'exit' },
      ],
      pageSize: 10,
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
      message: chalk.white(t('prompt.searchKeyword')),
    },
  ]);
  return keyword.trim();
}

/**
 * 页面导航（增强版：带快捷键提示）
 */
async function askPageNavigation(currentPage, totalPages) {
  const choices = [];
  if (currentPage > 1) choices.push({ name: `  ${chalk.cyan('◀')}  ${t('prompt.prevPage')}`, value: 'prev' });
  if (currentPage < totalPages) choices.push({ name: `  ${chalk.cyan('▶')}  ${t('prompt.nextPage')}`, value: 'next' });
  if (totalPages > 1) {
    choices.push({ name: `  ${chalk.gray(t('prompt.gotoPage'))}`, value: 'goto' });
  }
  choices.push(new inquirer.Separator(chalk.gray('─'.repeat(30))));
  choices.push({ name: `  ${chalk.gray(t('prompt.back'))}`, value: 'back' });

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white(t('prompt.navigate')),
      choices,
      pageSize: 10,
    },
  ]);

  if (action === 'goto') {
    const { page } = await inquirer.prompt([
      {
        type: 'number',
        name: 'page',
        message: chalk.white(t('prompt.gotoPageInput', { max: totalPages })),
        validate: (val) => val >= 1 && val <= totalPages ? true : t('prompt.gotoPageError', { max: totalPages }),
      },
    ]);
    return page;
  }

  return action;
}

/**
 * 打印底部状态栏
 */
function printStatusBar(cliList, currentAction) {
  const count = cliList ? cliList.length : 0;
  const left = chalk.dim(`  ${t('status.cliCount', { count })}`);
  const right = currentAction
    ? chalk.dim(t('status.currentAction', { action: currentAction }))
    : '';
  const width = 50;
  const gap = Math.max(1, width - stripAnsi(left).length - stripAnsi(right).length);
  console.log();
  console.log(chalk.gray('  ─'.repeat(26)));
  console.log(left + ' '.repeat(gap) + right);
  console.log(chalk.gray('  ─'.repeat(26)));
}

/**
 * 退出确认
 */
async function confirmExit() {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: chalk.yellow(t('prompt.exitConfirm')),
      default: false,
    },
  ]);
  return confirmed;
}

// ===== 工具函数 =====

function truncatePath(filePath, maxLen) {
  if (filePath.length <= maxLen) return filePath;
  const basename = path.basename(filePath);
  const ext = path.extname(basename);
  const name = path.basename(basename, ext);
  const dir = path.dirname(filePath);

  const availableLen = maxLen - 3;
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

/** 移除 ANSI 转义码，用于对齐计算 */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
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
  printStatusBar,
  confirmExit,
};
