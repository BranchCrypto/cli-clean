#!/usr/bin/env node

/**
 * CLI-Clean - 本地 CLI 清理工具
 * 扫描、管理和删除本机 CLI 工具及其关联文件
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const figlet = require('figlet');

const { scanAllCLIs, searchCLIs, getStatsBySource } = require('./modules/scanner');
const { analyzeRelatedFiles, getRelatedSummary } = require('./modules/analyzer');
const { normalDelete, forceDelete, safetyCheck } = require('./modules/remover');
const ui = require('./modules/ui');
const logger = require('./utils/logger');
const { t, setLocale, detectLocale } = require('./utils/i18n');

const program = new Command();

// ===== Banner =====
function showBanner() {
  const asciiText = figlet.textSync('CLI-CLEAN', {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default',
  });
  console.log();
  console.log(chalk.cyan.bold(asciiText));
  console.log(chalk.gray(`  ${t('banner.subtitle')}  v1.0.0`));
  console.log(chalk.cyan('  ' + '─'.repeat(42)));
  console.log();
}

// ===== 扫描 CLI 列表 =====
async function getCLIList(keyword, options = {}) {
  const spinner = ora(t('scanner.scanning')).start();
  try {
    let cliList;
    if (keyword) {
      cliList = await searchCLIs(keyword, options);
      if (cliList.length === 0) {
        spinner.fail(t('scanner.notFound', { keyword }));
        return null;
      }
      spinner.succeed(t('scanner.foundMatches', { count: cliList.length }));
    } else {
      cliList = await scanAllCLIs(options);
      spinner.succeed(t('scanner.totalFound', { count: cliList.length }));
    }
    return cliList;
  } catch (err) {
    spinner.fail(t('scanner.scanFailed', { error: err.message }));
    return null;
  }
}

// ===== 命令: 交互式模式 =====
async function interactiveMode() {
  let cachedList = null;

  while (true) {
    showBanner();

    const action = await ui.mainMenu();

    switch (action) {
      case 'search': {
        const keyword = await ui.askSearchKeyword();
        if (!keyword) {
          logger.warn(t('error.enterKeyword'));
          await pressEnterToContinue();
          break;
        }
        const cliList = await getCLIList(keyword);
        if (!cliList || cliList.length === 0) break;

        let page = 1;
        while (true) {
          console.clear();
          logger.info(t('action.searchResults', { keyword, count: cliList.length }));
          const { totalPages, currentPage } = ui.displayCLIList(cliList, page);
          ui.printStatusBar(cliList, t('menu.search'));

          const nav = await ui.askPageNavigation(currentPage, totalPages);
          if (nav === 'back') break;
          if (nav === 'prev') page--;
          if (nav === 'next') page++;
          if (typeof nav === 'number') page = nav;
        }
        break;
      }

      case 'list': {
        // 缓存扫描结果，避免重复扫描
        if (!cachedList) {
          const spinner = ora(t('scanner.scanning')).start();
          cachedList = await scanAllCLIs();
          spinner.succeed(t('scanner.totalFound', { count: cachedList.length }));
        }

        let page = 1;
        while (true) {
          console.clear();
          logger.info(t('action.fullList'));
          const { totalPages, currentPage } = ui.displayCLIList(cachedList, page);
          ui.printStatusBar(cachedList, t('menu.list'));

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
        showBanner();
        ui.displayStats(cliList);
        ui.printStatusBar(cliList, t('menu.stats'));
        await pressEnterToContinue();
        break;
      }

      case 'delete': {
        const cliList = await getCLIList();
        if (!cliList) break;

        const selected = await ui.selectCLIs(cliList, t('ui.selectCLIs'));
        if (selected.length === 0) {
          logger.warn(t('error.noSelection'));
          await pressEnterToContinue();
          break;
        }

        console.clear();
        logger.title(t('action.selectedCLIs'));
        for (const cli of selected) {
          const warnings = safetyCheck(cli);
          if (warnings.length > 0) {
            for (const w of warnings) logger.warn(w);
          }
          ui.displayCLIDetail(cli, null);
          console.log();
        }

        const mode = await ui.selectDeleteMode();
        if (mode === 'cancel') {
          logger.info(t('action.cancelled'));
          await pressEnterToContinue();
          break;
        }

        let relatedMap = {};
        if (mode === 'force') {
          const spinner = ora(t('action.analyzing')).start();
          for (const cli of selected) {
            relatedMap[cli.name] = analyzeRelatedFiles(cli);
          }
          spinner.succeed(t('action.analyzeDone'));

          console.clear();
          logger.title(t('action.forcePreviewTitle'));
          for (const cli of selected) {
            const related = relatedMap[cli.name];
            ui.displayCLIDetail(cli, related);
            console.log();
          }
          logger.warn(t('ui.sharedDirWarning'));
        }

        const confirmed = await ui.confirmDelete(selected, mode);
        if (!confirmed) {
          logger.info(t('action.cancelled'));
          await pressEnterToContinue();
          break;
        }

        console.clear();
        logger.title(mode === 'force' ? t('ui.deleteForceTitle') : t('ui.deleteNormalTitle'));

        let allResults = { deleted: [], cleaned: [], failed: [] };
        for (const cli of selected) {
          logger.subtitle(t('ui.processing', { name: cli.name }));
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

        ui.displayDeleteResult(allResults);
        await pressEnterToContinue();

        // 删除后清除缓存，让下次扫描拿到最新结果
        cachedList = null;
        break;
      }

      case 'exit': {
        const confirmed = await ui.confirmExit();
        if (confirmed) {
          console.log();
          logger.info(t('action.exitMsg'));
          process.exit(0);
        }
        break;
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
        logger.warn(t('error.sourceNotFound', { source: opts.source }));
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
      logger.error(t('error.cliNotFound', { name }));
      return;
    }

    showBanner();
    let related = null;
    if (opts.analyze) {
      const spinner = ora(t('action.analyzing')).start();
      related = analyzeRelatedFiles(cli);
      spinner.succeed(t('action.analyzingShort'));
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
        logger.error(t('error.cliNotFound', { name }));
      }
    }

    if (toDelete.length === 0) {
      logger.warn(t('error.noMatch'));
      return;
    }

    showBanner();

    for (const cli of toDelete) {
      const warnings = safetyCheck(cli);
      for (const w of warnings) logger.warn(w);
    }

    let relatedMap = {};
    if (opts.force) {
      const spinner = ora(t('action.analyzing')).start();
      for (const cli of toDelete) {
        relatedMap[cli.name] = analyzeRelatedFiles(cli);
      }
      spinner.succeed(t('action.analyzingShort'));

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

    const mode = opts.force ? 'force' : 'normal';
    if (!opts.yes) {
      const confirmed = await ui.confirmDelete(toDelete, mode);
      if (!confirmed) {
        logger.info(t('action.cancelledShort'));
        return;
      }
    }

    logger.title(opts.force ? t('ui.deleteForceTitle') : t('ui.deleteNormalTitle'));
    let allResults = { deleted: [], cleaned: [], failed: [] };
    for (const cli of toDelete) {
      logger.subtitle(t('ui.processing', { name: cli.name }));
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
      message: chalk.gray(t('prompt.enterToContinue')),
    },
  ]);
}

// ===== 启动 =====
program
  .name('cli-clean')
  .description('本地 CLI 清理工具 - 扫描、管理和删除本机 CLI 工具')
  .version('1.0.0')
  .option('--lang <locale>', 'Language (zh/en)', (val) => {
    if (!['zh', 'en'].includes(val)) {
      console.error('Invalid language. Use zh or en.');
      process.exit(1);
    }
    return val;
  })
  .hook('preAction', (cmd) => {
    const opts = cmd.opts();
    if (opts.lang) {
      setLocale(opts.lang);
    } else {
      setLocale(detectLocale());
    }
  });

program.parse(process.argv);
