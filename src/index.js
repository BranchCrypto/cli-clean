#!/usr/bin/env node

/**
 * CLI-Clean - 本地 CLI 清理工具
 * 扫描、管理和删除本机 CLI 工具及其关联文件
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');

const { scanAllCLIs, searchCLIs, getStatsBySource } = require('./modules/scanner');
const { analyzeRelatedFiles, getRelatedSummary } = require('./modules/analyzer');
const { normalDelete, forceDelete, safetyCheck } = require('./modules/remover');
const ui = require('./modules/ui');
const logger = require('./utils/logger');

const program = new Command();

// ===== Banner =====
function showBanner() {
  console.log();
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║                                          ║'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('       🔧 CLI-CLEAN v1.0.0              ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.gray('       本地 CLI 清理工具                 ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║                                          ║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════╝'));
  console.log();
}

// ===== 扫描 CLI 列表 =====
async function getCLIList(keyword, options = {}) {
  const spinner = ora('正在扫描本机 CLI 工具...').start();
  try {
    let cliList;
    if (keyword) {
      cliList = await searchCLIs(keyword, options);
      if (cliList.length === 0) {
        spinner.fail(`未找到与 "${keyword}" 相关的 CLI`);
        return null;
      }
      spinner.succeed(`找到 ${cliList.length} 个匹配的 CLI`);
    } else {
      cliList = await scanAllCLIs(options);
      spinner.succeed(`共发现 ${cliList.length} 个 CLI 工具`);
    }
    return cliList;
  } catch (err) {
    spinner.fail('扫描失败: ' + err.message);
    return null;
  }
}

// ===== 命令: 交互式模式 =====
async function interactiveMode() {
  showBanner();

  while (true) {
    const action = await ui.mainMenu();

    switch (action) {
      case 'search': {
        const keyword = await ui.askSearchKeyword();
        if (!keyword) {
          logger.warn('请输入搜索关键词');
          break;
        }
        const cliList = await getCLIList(keyword);
        if (!cliList || cliList.length === 0) break;

        let page = 1;
        while (true) {
          console.clear();
          logger.info(`搜索 "${keyword}" 的结果 (${cliList.length} 个):`);
          const { totalPages, currentPage } = ui.displayCLIList(cliList, page);

          const nav = await ui.askPageNavigation(currentPage, totalPages);
          if (nav === 'back') break;
          if (nav === 'prev') page--;
          if (nav === 'next') page++;
          if (typeof nav === 'number') page = nav;
        }
        break;
      }

      case 'list': {
        const cliList = await getCLIList();
        if (!cliList) break;

        let page = 1;
        while (true) {
          console.clear();
          logger.info('本机全部 CLI 列表:');
          const { totalPages, currentPage } = ui.displayCLIList(cliList, page);

          const nav = await ui.askPageNavigation(currentPage, totalPages);
          if (nav === 'back') break;
          if (nav === 'prev') page--;
          if (nav === 'next') page++;
          if (typeof nav === 'number') page = nav;
        }
        break;
      }

      case 'stats': {
        const cliList = await getCLIList();
        if (!cliList) break;

        console.clear();
        ui.displayStats(cliList);
        await pressEnterToContinue();
        break;
      }

      case 'delete': {
        const cliList = await getCLIList();
        if (!cliList) break;

        // 选择要删除的 CLI
        const selected = await ui.selectCLIs(cliList, '选择要删除的 CLI（空格多选，回车确认）');
        if (selected.length === 0) {
          logger.warn('未选择任何 CLI');
          break;
        }

        // 显示选中的 CLI 详情
        console.clear();
        logger.title('已选择的 CLI');
        for (const cli of selected) {
          const warnings = safetyCheck(cli);
          if (warnings.length > 0) {
            for (const w of warnings) logger.warn(w);
          }
          ui.displayCLIDetail(cli, null);
          console.log();
        }

        // 选择删除模式
        const mode = await ui.selectDeleteMode();
        if (mode === 'cancel') {
          logger.info('已取消删除操作');
          break;
        }

        // 如果是强力删除，先分析关联文件并展示
        let relatedMap = {};
        if (mode === 'force') {
          const spinner = ora('正在分析关联文件...').start();
          for (const cli of selected) {
            relatedMap[cli.name] = analyzeRelatedFiles(cli);
          }
          spinner.succeed('关联文件分析完成');

          console.clear();
          logger.title('强力删除预览 - 关联文件');
          for (const cli of selected) {
            const related = relatedMap[cli.name];
            ui.displayCLIDetail(cli, related);
            console.log();
          }
          logger.warn('⚠️  共享目录（标红）不会被删除，以防止影响其他工具');
        }

        // 确认删除
        const confirmed = await ui.confirmDelete(selected, mode);
        if (!confirmed) {
          logger.info('已取消删除操作');
          break;
        }

        // 执行删除
        console.clear();
        logger.title(mode === 'force' ? '💥 执行强力删除' : '🗑  执行普通删除');

        let allResults = { deleted: [], cleaned: [], failed: [] };
        for (const cli of selected) {
          logger.subtitle(`处理: ${cli.name}`);
          let result;
          if (mode === 'force') {
            result = await forceDelete(cli, relatedMap[cli.name]);
          } else {
            result = await normalDelete(cli);
          }
          allResults.deleted.push(...(result.deleted || []));
          allResults.cleaned.push(...(result.cleaned || []));
          allResults.failed.push(...(result.failed || []));
        }

        // 显示结果
        ui.displayDeleteResult(allResults);
        await pressEnterToContinue();
        break;
      }

      case 'exit': {
        logger.info('感谢使用 CLI-Clean，再见！👋');
        process.exit(0);
      }
    }
  }
}

// ===== 命令: list 列出全部 CLI =====
program
  .command('list')
  .description('列出本机所有 CLI 工具')
  .option('-k, --keyword <keyword>', '按关键词过滤')
  .option('-s, --source <source>', '按来源过滤')
  .option('-j, --json', '以 JSON 格式输出')
  .option('-a, --all', '包含系统目录中的程序')
  .action(async (opts) => {
    let cliList = await getCLIList(opts.keyword, { includeSystem: opts.all });
    if (!cliList) return;

    if (opts.source) {
      cliList = cliList.filter(cli => cli.source === opts.source);
      if (cliList.length === 0) {
        logger.warn(`未找到来源为 "${opts.source}" 的 CLI`);
        return;
      }
    }

    if (opts.json) {
      console.log(JSON.stringify(cliList, null, 2));
      return;
    }

    showBanner();
    let page = 1;
    while (true) {
      console.clear();
      const { totalPages, currentPage } = ui.displayCLIList(cliList, page);
      const nav = await ui.askPageNavigation(currentPage, totalPages);
      if (nav === 'back') break;
      if (nav === 'prev') page--;
      if (nav === 'next') page++;
      if (typeof nav === 'number') page = nav;
    }
  });

// ===== 命令: search 搜索 CLI =====
program
  .command('search <keyword>')
  .description('搜索 CLI 工具')
  .option('-j, --json', '以 JSON 格式输出')
  .action(async (keyword, opts) => {
    const cliList = await getCLIList(keyword);
    if (!cliList) return;

    if (opts.json) {
      console.log(JSON.stringify(cliList, null, 2));
      return;
    }

    showBanner();
    ui.displayCLIList(cliList);
  });

// ===== 命令: info 查看详情 =====
program
  .command('info <name>')
  .description('查看指定 CLI 的详细信息')
  .option('-a, --analyze', '分析关联文件')
  .option('--all', '包含系统目录中的程序')
  .action(async (name, opts) => {
    const cliList = await getCLIList(undefined, { includeSystem: opts.all });
    if (!cliList) return;

    const cli = cliList.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!cli) {
      logger.error(`未找到 CLI: ${name}`);
      return;
    }

    showBanner();
    let related = null;
    if (opts.analyze) {
      const spinner = ora('正在分析关联文件...').start();
      related = analyzeRelatedFiles(cli);
      spinner.succeed('分析完成');
    }
    ui.displayCLIDetail(cli, related);
  });

// ===== 命令: delete 删除 CLI =====
program
  .command('delete <names...>')
  .description('删除指定的 CLI 工具')
  .option('-f, --force', '强力删除（包含关联文件）')
  .option('-y, --yes', '跳过确认')
  .option('--all', '包含系统目录中的程序')
  .action(async (names, opts) => {
    const cliList = await getCLIList(undefined, { includeSystem: opts.all });
    if (!cliList) return;

    const toDelete = [];
    for (const name of names) {
      const cli = cliList.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (cli) {
        toDelete.push(cli);
      } else {
        logger.error(`未找到 CLI: ${name}`);
      }
    }

    if (toDelete.length === 0) {
      logger.warn('没有找到任何匹配的 CLI');
      return;
    }

    showBanner();

    // 安全检查
    for (const cli of toDelete) {
      const warnings = safetyCheck(cli);
      for (const w of warnings) logger.warn(w);
    }

    // 显示详情
    let relatedMap = {};
    if (opts.force) {
      const spinner = ora('正在分析关联文件...').start();
      for (const cli of toDelete) {
        relatedMap[cli.name] = analyzeRelatedFiles(cli);
      }
      spinner.succeed('分析完成');

      for (const cli of toDelete) {
        ui.displayCLIDetail(cli, relatedMap[cli.name]);
        console.log();
      }
    } else {
      for (const cli of toDelete) {
        ui.displayCLIDetail(cli, null);
        console.log();
      }
    }

    // 确认
    const mode = opts.force ? 'force' : 'normal';
    if (!opts.yes) {
      const confirmed = await ui.confirmDelete(toDelete, mode);
      if (!confirmed) {
        logger.info('已取消');
        return;
      }
    }

    // 执行删除
    logger.title(opts.force ? '💥 执行强力删除' : '🗑  执行普通删除');
    let allResults = { deleted: [], cleaned: [], failed: [] };
    for (const cli of toDelete) {
      logger.subtitle(`处理: ${cli.name}`);
      let result;
      if (opts.force) {
        result = await forceDelete(cli, relatedMap[cli.name]);
      } else {
        result = await normalDelete(cli);
      }
      allResults.deleted.push(...(result.deleted || []));
      allResults.cleaned.push(...(result.cleaned || []));
      allResults.failed.push(...(result.failed || []));
    }
    ui.displayDeleteResult(allResults);
  });

// ===== 命令: stats 统计信息 =====
program
  .command('stats')
  .description('显示 CLI 统计信息')
  .action(async () => {
    const cliList = await getCLIList();
    if (!cliList) return;

    showBanner();
    ui.displayStats(cliList);
  });

// ===== 默认: 无参数进入交互式模式 =====
program
  .action(() => {
    interactiveMode();
  });

// ===== 工具函数 =====
async function pressEnterToContinue() {
  const inquirer = require('inquirer');
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: chalk.gray('按 Enter 键继续...'),
    },
  ]);
}

// ===== 启动 =====
program
  .name('cli-clean')
  .description('本地 CLI 清理工具 - 扫描、管理和删除本机 CLI 工具')
  .version('1.0.0');

program.parse(process.argv);
