const chalk = require('chalk');

const logger = {
  info(msg) {
    console.log(chalk.blue('ℹ'), chalk.white(msg));
  },
  success(msg) {
    console.log(chalk.green('✔'), chalk.green(msg));
  },
  warn(msg) {
    console.log(chalk.yellow('⚠'), chalk.yellow(msg));
  },
  error(msg) {
    console.log(chalk.red('✖'), chalk.red(msg));
  },
  title(msg) {
    const line = '═'.repeat(Math.min(msg.length * 2, 60));
    console.log();
    console.log(chalk.cyan.bold(line));
    console.log(chalk.cyan.bold(`  ${msg}`));
    console.log(chalk.cyan.bold(line));
    console.log();
  },
  subtitle(msg) {
    console.log();
    console.log(chalk.yellow.bold(`── ${msg} ${'─'.repeat(Math.max(0, 40 - msg.length))}`));
  },
  detail(key, value) {
    console.log(`  ${chalk.gray('•')} ${chalk.white(key)}: ${chalk.gray(value)}`);
  },
  dim(msg) {
    console.log(chalk.gray(msg));
  },
  blank() {
    console.log();
  },
};

module.exports = logger;
