# K-Line Studio -- 本地开发编排
#
#   make dev          一键启动（PostgreSQL + 后端 + 前端）
#   make help         查看全部命令
#
# 所有变量都可以在命令行覆盖，例如：
#   make dev PG_DB=kline_dev PG_PASSWORD=secret API_PORT=8001
#
# 兼容 macOS 自带的 GNU Make 3.81（不使用 .ONESHELL）。

SHELL := /bin/bash
.DEFAULT_GOAL := help

# 让 make 子 shell 能稳定找到 Homebrew 安装的工具（pnpm/uv/psql 等）。
PATH := /opt/homebrew/bin:/usr/local/bin:$(PATH)
export PATH

BACKEND  := backend
FRONTEND := frontend
VENV     := $(BACKEND)/.venv
PY       := $(VENV)/bin/python
NODE_MODULES := $(FRONTEND)/node_modules

API_HOST ?= 127.0.0.1
API_PORT ?= 8000
WEB_PORT ?= 5173

# ---------------------------------------------------------------- PostgreSQL
# 默认用当前系统用户 + 本地 trust/peer 认证（Homebrew 安装的默认形态）。
PG_USER     ?= $(shell whoami)
PG_PASSWORD ?=
PG_HOST     ?= localhost
PG_PORT     ?= 5432
PG_DB       ?= kline

PG_AUTH      := $(PG_USER)$(if $(PG_PASSWORD),:$(PG_PASSWORD),)
DATABASE_URL ?= postgresql+asyncpg://$(PG_AUTH)@$(PG_HOST):$(PG_PORT)/$(PG_DB)

# 传给 psql/createdb 的公共参数
PG_ENV  := $(if $(PG_PASSWORD),PGPASSWORD='$(PG_PASSWORD)',)
PG_ARGS := -h $(PG_HOST) -p $(PG_PORT) -U $(PG_USER)

SQLITE_URL := sqlite+aiosqlite:///./data/kline.db

BOLD := \033[1m
DIM  := \033[2m
CYAN := \033[36m
OFF  := \033[0m

.PHONY: help doctor install install-backend install-frontend \
        db-create db-drop db-psql db-info \
        dev dev-sqlite api web \
        test test-backend test-frontend lint fmt build \
        clean distclean

## help: 显示所有可用命令
help:
	@printf "$(BOLD)K-Line Studio$(OFF)  加密货币合约 K 线拉取 / 绘图 / 复盘\n\n"
	@printf "$(BOLD)常用$(OFF)\n"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | \
	  awk -F': ' '{ printf "  $(CYAN)%-16s$(OFF) %s\n", $$1, $$2 }'
	@printf "\n$(BOLD)当前配置$(OFF)\n"
	@printf "  $(DIM)数据库$(OFF)   postgresql://$(PG_USER)@$(PG_HOST):$(PG_PORT)/$(PG_DB)\n"
	@printf "  $(DIM)后端$(OFF)     http://$(API_HOST):$(API_PORT)\n"
	@printf "  $(DIM)前端$(OFF)     http://localhost:$(WEB_PORT)\n"

## doctor: 检查本地依赖与数据库连通性
doctor:
	@printf "$(BOLD)工具链$(OFF)\n"
	@for tool in uv python3 node pnpm psql; do \
	  if command -v $$tool >/dev/null 2>&1; then \
	    printf "  ✓ %-8s %s\n" "$$tool" "$$($$tool --version 2>&1 | head -1)"; \
	  else \
	    printf "  ✗ %-8s 未安装\n" "$$tool"; \
	  fi; \
	done
	@printf "$(BOLD)PostgreSQL$(OFF)\n"
	@if pg_isready $(PG_ARGS) >/dev/null 2>&1; then \
	  printf "  ✓ 服务已就绪 $(PG_HOST):$(PG_PORT)\n"; \
	else \
	  printf "  ✗ 连不上 $(PG_HOST):$(PG_PORT)（macOS: brew services start postgresql@16）\n"; \
	fi
	@$(MAKE) --no-print-directory db-info

# ------------------------------------------------------------------- install

## install: 安装前后端依赖
install: install-backend install-frontend

install-backend:
	@printf "$(BOLD)==> 后端依赖$(OFF)\n"
	@if command -v uv >/dev/null 2>&1; then \
	  cd $(BACKEND) && uv venv --allow-existing >/dev/null && uv pip install -q -e ".[dev]"; \
	else \
	  cd $(BACKEND) && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]"; \
	fi
	@printf "    完成：$(VENV)\n"

install-frontend:
	@printf "$(BOLD)==> 前端依赖$(OFF)\n"
	@cd $(FRONTEND) && pnpm install --silent
	@printf "    完成：$(NODE_MODULES)\n"

# 缺失时自动安装（供 dev/test 作为 order-only 依赖）
$(PY):
	@$(MAKE) --no-print-directory install-backend

$(NODE_MODULES):
	@$(MAKE) --no-print-directory install-frontend

# ------------------------------------------------------------------ database

## db-create: 若不存在则创建数据库（表结构由后端启动时自动建）
db-create:
	@if ! pg_isready $(PG_ARGS) >/dev/null 2>&1; then \
	  printf "  ✗ PostgreSQL 未运行：$(PG_HOST):$(PG_PORT)\n"; exit 1; \
	fi
	@if $(PG_ENV) psql $(PG_ARGS) -d postgres -lqt 2>/dev/null | cut -d'|' -f1 \
	    | tr -d '[:blank:]' | grep -qx '$(PG_DB)'; then \
	  printf "  ✓ 数据库 $(PG_DB) 已存在\n"; \
	else \
	  $(PG_ENV) createdb $(PG_ARGS) $(PG_DB) && printf "  ✓ 已创建数据库 $(PG_DB)\n"; \
	fi

## db-drop: 删除数据库（需要 CONFIRM=1）
db-drop:
	@if [ "$(CONFIRM)" != "1" ]; then \
	  printf "  ✗ 这会删除 $(PG_DB) 的全部数据。确认请执行：make db-drop CONFIRM=1\n"; exit 1; \
	fi
	@$(PG_ENV) dropdb $(PG_ARGS) --if-exists $(PG_DB) && printf "  ✓ 已删除 $(PG_DB)\n"

## db-psql: 用 psql 连上本项目数据库
db-psql:
	@$(PG_ENV) psql $(PG_ARGS) -d $(PG_DB)

## db-info: 查看已缓存的 K 线与笔记数量
db-info:
	@if $(PG_ENV) psql $(PG_ARGS) -d $(PG_DB) -tAc \
	    "select 'K线 ' || count(*) from candles" 2>/dev/null; then \
	  $(PG_ENV) psql $(PG_ARGS) -d $(PG_DB) -tAc \
	    "select '笔记 ' || count(*) from notes"; \
	  $(PG_ENV) psql $(PG_ARGS) -d $(PG_DB) -tAc \
	    "select '序列 ' || count(*) from (select 1 from candles group by exchange, symbol, interval) t"; \
	else \
	  printf "  $(DIM)数据库 $(PG_DB) 尚未初始化（make db-create 后启动一次后端即可建表）$(OFF)\n"; \
	fi

# ----------------------------------------------------------------------- dev

## dev: 一键启动（建库 + 后端 + 前端，Ctrl-C 全部退出）
dev: | $(PY) $(NODE_MODULES)
	@$(MAKE) --no-print-directory db-create
	@printf "\n$(BOLD)K-Line Studio$(OFF)\n"
	@printf "  后端  $(CYAN)http://$(API_HOST):$(API_PORT)$(OFF)   文档 /docs\n"
	@printf "  前端  $(CYAN)http://localhost:$(WEB_PORT)$(OFF)\n"
	@printf "  数据库 $(DIM)postgresql://$(PG_USER)@$(PG_HOST):$(PG_PORT)/$(PG_DB)$(OFF)\n\n"
	@trap 'kill 0' EXIT TERM; trap 'exit 0' INT; \
	( cd $(BACKEND) && DATABASE_URL='$(DATABASE_URL)' \
	    .venv/bin/uvicorn app.main:app --host $(API_HOST) --port $(API_PORT) --reload ) & \
	( cd $(FRONTEND) && VITE_API_TARGET=http://$(API_HOST):$(API_PORT) \
	    pnpm dev --port $(WEB_PORT) ) & \
	wait

## dev-sqlite: 同 dev，但用 SQLite（不需要 PostgreSQL）
dev-sqlite: | $(PY) $(NODE_MODULES)
	@printf "\n$(BOLD)K-Line Studio$(OFF) $(DIM)(SQLite)$(OFF)\n"
	@printf "  后端  $(CYAN)http://$(API_HOST):$(API_PORT)$(OFF)\n"
	@printf "  前端  $(CYAN)http://localhost:$(WEB_PORT)$(OFF)\n\n"
	@trap 'kill 0' EXIT TERM; trap 'exit 0' INT; \
	( cd $(BACKEND) && DATABASE_URL='$(SQLITE_URL)' \
	    .venv/bin/uvicorn app.main:app --host $(API_HOST) --port $(API_PORT) --reload ) & \
	( cd $(FRONTEND) && VITE_API_TARGET=http://$(API_HOST):$(API_PORT) \
	    pnpm dev --port $(WEB_PORT) ) & \
	wait

## api: 只启动后端
api: | $(PY)
	@$(MAKE) --no-print-directory db-create
	cd $(BACKEND) && DATABASE_URL='$(DATABASE_URL)' \
	  .venv/bin/uvicorn app.main:app --host $(API_HOST) --port $(API_PORT) --reload

## web: 只启动前端
web: | $(NODE_MODULES)
	cd $(FRONTEND) && VITE_API_TARGET=http://$(API_HOST):$(API_PORT) pnpm dev --port $(WEB_PORT)

# ------------------------------------------------------------ quality gates

## test: 后端单测 + 前端类型检查
test: test-backend test-frontend

test-backend: | $(PY)
	cd $(BACKEND) && .venv/bin/python -m pytest -q

test-frontend: | $(NODE_MODULES)
	cd $(FRONTEND) && pnpm typecheck

## lint: ruff + tsc 静态检查
lint: | $(PY) $(NODE_MODULES)
	cd $(BACKEND) && .venv/bin/python -m ruff check app tests
	cd $(FRONTEND) && pnpm typecheck

## fmt: ruff 自动修复
fmt: | $(PY)
	cd $(BACKEND) && .venv/bin/python -m ruff check --fix app tests

## build: 前端生产构建
build: | $(NODE_MODULES)
	cd $(FRONTEND) && pnpm build

# --------------------------------------------------------------------- clean

## clean: 清理构建产物与缓存
clean:
	rm -rf $(FRONTEND)/dist $(BACKEND)/.pytest_cache $(BACKEND)/.ruff_cache
	find $(BACKEND) -name __pycache__ -type d -prune -exec rm -rf {} +

## distclean: 清理 clean + 虚拟环境 + node_modules + SQLite 数据文件
distclean: clean
	rm -rf $(VENV) $(NODE_MODULES) $(BACKEND)/data $(BACKEND)/*.egg-info
