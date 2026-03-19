# 🔧 CLI-Clean v1.0.0

> 本地 CLI 清理工具 - 扫描、管理和删除本机 CLI 工具及其关联文件

![Node.js](https://img.shields.io/badge/Node.js-v22+-green)
![Platform](https://img.shields.io/badge/Platform-Windows-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ 功能特性

- 🔍 **全面扫描** - 自动扫描 PATH 中所有可执行文件，识别 CLI 工具来源
- 📊 **统计概览** - 按来源分类统计 CLI 数量和大小
- 🔎 **关键词搜索** - 支持按名称、来源、路径搜索
- 🗑️ **普通删除** - 仅删除可执行文件
- 💥 **强力删除** - 删除可执行文件 + 关联目录 + 配置文件 + 缓存
- 🛡️ **安全保护** - 自动过滤系统自带 CLI，防止误删
- 📋 **交互式 UI** - 分页列表、多选、确认，操作直观
- 📦 **包管理器集成** - 自动调用 npm/pip/dotnet/cargo 等卸载命令

## 📦 支持的 CLI 来源

| 来源 | 说明 |
|------|------|
| NPM 全局包 | `npm install -g` 安装的工具 |
| Python pip | `pip install` 安装的工具 |
| .NET 工具 | `dotnet tool install` 安装的工具 |
| Cargo (Rust) | `cargo install` 安装的工具 |
| Go 工具 | Go module 编译的工具 |
| 用户自定义 | `~/.local/bin` 等目录下的工具 |
| 系统安装程序 | 通过安装包安装的程序 |
| 未知来源 | 其他来源的工具 |

## 🚀 快速开始

### 安装

```bash
cd cli-clean
npm install
```

### 直接运行

```bash
npm start
```

### 全局安装（可选）

```bash
npm install -g .
cli-clean
```

## 📖 使用方法

### 交互式模式（推荐）

不带任何参数启动，进入交互式菜单：

```bash
node src/index.js
```

交互式菜单包含：
- 🔍 搜索 CLI - 输入关键词查找
- 📋 查看全部 CLI 列表 - 分页浏览
- 📊 查看统计信息 - 按来源分类汇总
- 🗑️ 删除指定 CLI - 多选后删除

### CLI 命令模式

```bash
# 列出所有 CLI
cli-clean list

# 按关键词搜索
cli-clean search <keyword>

# 查看某个 CLI 的详细信息
cli-clean info <name>

# 分析某个 CLI 的关联文件
cli-clean info <name> --analyze

# 普通删除（仅可执行文件）
cli-clean delete <name1> <name2>

# 强力删除（含关联文件）
cli-clean delete <name> --force

# 强制删除（跳过确认）
cli-clean delete <name> --force --yes

# 查看统计信息
cli-clean stats

# JSON 格式输出（便于脚本处理）
cli-clean list --json
cli-clean search <keyword> --json

# 按来源过滤
cli-clean list --source npm
```

### 命令行选项

```
Usage: cli-clean [command] [options]

命令:
  list [options]      列出本机所有 CLI 工具
  search <keyword>    搜索 CLI 工具
  info <name>         查看指定 CLI 的详细信息
  delete <names...>   删除指定的 CLI 工具
  stats               显示 CLI 统计信息

选项:
  -V, --version       输出版本号
  -h, --help          输出帮助信息
```

## ⚠️ 安全说明

### 自动保护机制

- **系统 CLI 白名单** - `cmd`、`powershell`、`net`、`ping` 等系统自带命令不会被列出
- **共享目录标记** - npm-cache、pip-cache 等共享目录在强力删除时默认跳过
- **删除确认** - 所有删除操作都需要用户二次确认

### 强力删除 vs 普通删除

| | 普通删除 | 强力删除 |
|--|---------|---------|
| 可执行文件 | ✅ | ✅ |
| 配置文件 | ❌ | ✅ |
| 关联目录 | ❌ | ✅ |
| 包管理器卸载 | ❌ | ✅ |
| 缓存清理 | ❌ | ⚠️ 仅非共享 |

## 🏗️ 项目结构

```
cli-clean/
├── package.json
├── README.md
└── src/
    ├── index.js              # 入口文件，CLI 命令定义
    ├── modules/
    │   ├── scanner.js        # CLI 扫描与发现
    │   ├── analyzer.js       # 关联文件分析
    │   ├── remover.js        # 删除逻辑（普通/强力）
    │   └── ui.js             # 交互式界面组件
    └── utils/
        ├── logger.js         # 日志输出工具
        └── constants.js      # 常量定义与工具函数
```

## 📄 License

MIT
