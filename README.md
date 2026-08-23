# K-Line Studio

> 加密货币**永续合约**的 K 线拉取、绘图与复盘工具。

从 Binance / Bybit / OKX 的公开接口拉取合约 K 线，用 TradingView 官方图表库绘制，把查过的区间落库缓存，并支持在图上画趋势线 / 水平线、测量涨跌幅、按时间点写复盘笔记、逐根回放行情。

全部数据源都是**免费、公开、无需 API Key** 的 REST 接口。

![python](https://img.shields.io/badge/python-3.11%2B-3776ab) ![node](https://img.shields.io/badge/node-20%2B-5fa04e) ![db](https://img.shields.io/badge/db-PostgreSQL%20%7C%20SQLite-336791) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

---

## 目录

- [功能](#功能)
- [技术选型](#技术选型)
- [项目结构](#项目结构)
- [快速启动](#快速启动)
- [配置](#配置)
- [API](#api)
- [设计要点](#设计要点)
- [开发与测试](#开发与测试)
- [已知边界](#已知边界)

---

## 功能

### 1. 多平台数据源
- 内置 **Binance USDⓈ-M**、**Bybit v5 linear**、**OKX SWAP** 三家永续合约
- 交易所以插件形式注册，新增一家只需写一个 provider 文件（见[新增一个交易所](#新增一个交易所)）
- 合约列表由服务端拉取并缓存 15 分钟，前端可搜索（`BTC`、`ETHUSDT` 均可）

### 2. 自由选择拉取范围
- 前端可选：**平台 / 交易对 / 周期（1m~1w，12 档）/ 时间范围**（1 天 ~ 3 年预设，或自定义起止日期）
- 各家单次上限不同（Binance 1500、Bybit 1000、OKX 100 根），**后端自动分批**，前端只管给区间
- 超出单次总量上限时自动截取最近一段，并在界面上明确提示

### 3. 数据库缓存（增量）
- 查过的 K 线写入 PostgreSQL / SQLite，再查同一区间毫秒级返回
- 只补**缺口**，不重复下载（见[覆盖区间表](#覆盖区间表而不是数一数够不够)）
- 侧栏「缓存」面板列出本地已有的所有序列，可一键切换或删除
- 每次请求都会返回 `meta`，明确告诉你多少根来自本地、多少根是新拉的

### 4. 复盘笔记
- 工具栏点「标注」后在 K 线任意位置点击，即可在该时间点 + 该价位记录笔记
- 支持方向（多 / 空 / 观察）、标题、正文、标签、适用周期（可设为「全部周期」）
- 图上以箭头 / 圆点标记呈现，选中时额外画出价格线；侧栏可编辑、删除

### 5. 画线工具（对齐 TradingView）
- **趋势线**：点起点、再点终点；选中后两端出现手柄可拖动，拖线身可整条平移
- **水平线**：单击一个价位即成，贯穿全图，右端带价格标签（按合约精度显示）
- **测量涨跌幅**：点起点、再点终点，弹出徽章显示 **价差 / 百分比 / K 线根数 / 时间跨度**，形如 `+6,789.9  +10.73%` `36 根 · 1.5d`
- 画线按 **(时间, 价格)** 锚定：1h 上画的线，切到 4h、1d 位置完全一致
- 选中图形后浮出样式条：5 种颜色、实线/虚线、删除；`Delete` 删除选中，`Esc` 取消当前工具
- 趋势线与水平线入库持久化；**测量是一次性的**，读完数就消失（下一次空白点击或 `Esc` 清除）

### 6. 逐根复盘回放
- 回放模式下图表只显示到游标处，**指标与价格轴只使用"当时可见"的数据**，不会泄漏未来信息
- 空格播放 / 暂停，`←` `→` 单步，1~16 倍速，进度条可拖拽

### 7. 图表（对齐交易所 App 观感）
- 蜡烛图 + 成交量柱 + MA7 / MA25 / MA99，配色沿用 TradingView 深浅两套方案
- 十字光标 OHLC 图例（开高低收、涨跌幅、成交量、时间）
- 对数坐标、UTC / 本地时区切换、深浅主题、侧栏折叠

### 8. 其他
- CSV 导出当前区间
- 自选（watchlist）接口
- 交互式 API 文档（`/docs`）

---

## 技术选型

### 后端

| 选择 | 为什么 |
|---|---|
| **FastAPI** | 原生 async（拉取多页 K 线是纯 IO 密集）；Pydantic 模型即接口契约，自带 OpenAPI 文档 |
| **SQLAlchemy 2.0 (async)** | 同一份模型跑 SQLite 和 PostgreSQL，切库只改一个 DSN；`on_conflict_do_update` 两种方言都支持，upsert 不用手写 |
| **httpx** | 支持 async + 连接池 + 代理，交易所被墙时配 `HTTP_PROXY` 即可 |
| **Pydantic Settings** | 配置来自环境变量 / `.env`，无需改代码 |
| **SQLite 默认 / PostgreSQL 可选** | 本地开箱即用不装数据库；数据量上来（几百万根 K 线）再切 PG，无需改代码 |
| **时间统一用 epoch 毫秒 (BigInteger)** | 缺口计算、周期对齐全是整数运算，没有时区与浮点误差；跨库行为一致 |

### 前端

| 选择 | 为什么 |
|---|---|
| **lightweight-charts** | TradingView 官方开源图表库，**样式与各大交易所 App 天然一致**，Canvas 渲染，几万根 K 线不卡；用 Chart.js / ECharts 都做不出这种手感 |
| **React 18 + TypeScript** | 接口类型与后端 schema 一一对应，改字段时编译期就能发现 |
| **Vite** | 冷启动毫秒级，内置 `/api` 代理，省掉开发期 CORS |
| **TanStack Query** | K 线请求天然适合"缓存 + 失效 + 轮询"模型：切周期回到已看过的区间直接命中内存缓存，最新一根 15s 轮询刷新 |
| **Zustand + persist** | 只有一份"当前看什么、怎么画"的会话状态，落 localStorage，刷新后回到原样；比 Redux 轻得多 |
| **Tailwind CSS** | 调色板用 CSS 变量定义一次，深浅主题只换变量；样式与组件同处一地，改动不怕波及别处 |

### 为什么不用 WebSocket
本工具的定位是**历史行情复盘**，不是盯盘下单。历史数据只有 REST 接口，实时性用 15 秒轮询最新一根已经足够，省掉一层连接管理与重连逻辑。

---

## 项目结构

```
k-line/
├── Makefile                  # 一键启动 / 建库 / 测试 / 清理
├── README.md
├── backend/
│   ├── pyproject.toml
│   ├── .env.example
│   └── app/
│       ├── main.py           # 应用装配：生命周期、CORS、异常处理、路由挂载
│       ├── core/
│       │   ├── config.py     # 配置（环境变量 / .env）
│       │   ├── intervals.py  # 周期枚举 + 边界对齐（含周线对齐到周一 00:00 UTC）
│       │   ├── timeutil.py   # ISO-8601 / epoch 秒 / 毫秒 统一解析
│       │   └── errors.py     # 领域错误 -> HTTP 状态码
│       ├── db/
│       │   ├── models.py     # candles / candle_coverage / notes / drawings / watchlist
│       │   └── session.py    # async engine、会话工厂、建表
│       ├── providers/        # ★ 交易所插件层
│       │   ├── base.py       # 抽象基类：分页策略、去重排序、无进展保护
│       │   ├── http.py       # httpx 封装：重试、限频退避、代理
│       │   ├── binance.py    # 正向翻页，单页 1500
│       │   ├── bybit.py      # 反向翻页，单页 1000
│       │   ├── okx.py        # 反向翻页，单页 100
│       │   └── registry.py   # 注册表（新增交易所只改这里一行）
│       ├── services/         # ★ 业务编排层
│       │   ├── candles.py    # 缺口计算 -> 拉取 -> upsert -> 读取
│       │   ├── coverage.py   # 区间代数（纯函数，可单测）+ 覆盖区间仓储
│       │   ├── notes.py      # 笔记 CRUD
│       │   ├── drawings.py   # 画线 CRUD
│       │   └── symbols.py    # 合约列表 TTL 缓存（带锁防惊群）
│       ├── schemas/          # 出入参模型（K 线用 t/o/h/l/c/v 精简字段）
│       └── api/              # HTTP 层，很薄
│           ├── deps.py       # 依赖：会话、周期校验、时间窗解析
│           └── routes/       # exchanges / candles / notes / drawings / watchlist
│   └── tests/                # 周期对齐、区间代数、双向分页、缓存行为
└── frontend/
    ├── vite.config.ts        # /api 代理到后端
    └── src/
        ├── api/              # types(与后端 schema 对应) / client(fetch 封装) / queries(hooks)
        ├── lib/
        │   ├── chartTheme.ts # 深浅两套图表配色
        │   ├── indicators.ts # SMA / EMA
        │   ├── series.ts     # 时间戳 <-> 逻辑下标换算、涨跌幅测量（纯函数）
        │   ├── drawings.ts   # 画线工具常量与命中检测（纯函数）
        │   ├── timeframes.ts # 周期时长、范围预设、区间解析
        │   └── format.ts     # 价格精度、成交量缩写、时区换算
        ├── store/useSession.ts  # 会话状态（持久化）
        ├── components/
        │   ├── chart/        # CandleChart(图表封装) / DrawingLayer(画线覆盖层)
        │   │                  # ChartLegend / ChartToolbar / ReplayControls
        │   ├── TopBar.tsx    # 平台、交易对、周期、范围
        │   ├── SymbolPicker.tsx
        │   ├── NotesPanel.tsx / NoteDialog.tsx
        │   ├── StoragePanel.tsx / StatusBar.tsx
        │   └── ui/           # Button / Segmented / Modal / Field
        └── App.tsx           # 组装页面，唯一持有"当前查询"的地方
```

分层原则：`api` 只做 HTTP 转换 → `services` 做编排 → `providers` 只关心"某家交易所怎么取一页数据"。前端同理，全项目只有 `components/chart/CandleChart.tsx` 接触图表库——画线覆盖层拿到的是四个坐标换算函数，本身不知道 lightweight-charts 存在。

---

## 快速启动

### 前置要求

| | 版本 | 说明 |
|---|---|---|
| Python | 3.11+ | 推荐装 [uv](https://github.com/astral-sh/uv)（`brew install uv`），没有也能用 venv |
| Node | 20+ | 需要 [pnpm](https://pnpm.io)（`npm i -g pnpm`） |
| PostgreSQL | 14+ | 可选；不想装就用 `make dev-sqlite` |

### 方式一：Makefile 一键启动（推荐）

```bash
make doctor   # 先体检：工具链 + 数据库连通性
make dev      # 装依赖 -> 建库 -> 同时起后端和前端，Ctrl-C 一起退出
```

打开 <http://localhost:5173> 即可。表结构在后端首次启动时自动创建，无需手动迁移。

```bash
make help     # 查看全部命令与当前生效的配置
```

| 命令 | 作用 |
|---|---|
| `make dev` | 一键启动（PostgreSQL + 后端 + 前端） |
| `make dev-sqlite` | 同上，但用 SQLite，不需要 PostgreSQL |
| `make api` / `make web` | 只起后端 / 只起前端 |
| `make install` | 只装依赖 |
| `make db-create` | 建库（幂等，已存在则跳过） |
| `make db-psql` | psql 连上本项目库 |
| `make db-info` | 看已缓存多少根 K 线、多少条笔记 |
| `make db-drop CONFIRM=1` | 删库（必须显式确认） |
| `make test` / `make lint` / `make build` | 单测+类型检查 / 静态检查 / 前端构建 |
| `make clean` / `make distclean` | 清缓存产物 / 连虚拟环境和 node_modules 一起清 |

数据库参数默认是"本机当前用户 + 无密码"（Homebrew 装 PostgreSQL 的默认形态），需要改就在命令行覆盖：

```bash
make dev PG_USER=kline PG_PASSWORD=secret PG_DB=kline_dev PG_HOST=127.0.0.1 API_PORT=8001
```

也可以直接给完整 DSN：

```bash
make dev DATABASE_URL='postgresql+asyncpg://user:pw@127.0.0.1:5432/kline'
```

> `make` 会把 `DATABASE_URL` 作为环境变量传给后端，其优先级高于 `backend/.env`。想让 `.env` 说话，就不要用 `make`，按下面手动启动。

### 方式二：手动启动

```bash
# 后端
cd backend
uv venv && uv pip install -e ".[dev]"        # 或 python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env                          # 按需改 DATABASE_URL / HTTP_PROXY
.venv/bin/uvicorn app.main:app --reload       # http://127.0.0.1:8000/docs
```

```bash
# 前端（另开一个终端）
cd frontend
pnpm install
pnpm dev                                      # http://localhost:5173
```

后端地址不是默认值时：`VITE_API_TARGET=http://127.0.0.1:8001 pnpm dev`。

---

## 配置

`backend/.env`（从 `.env.example` 复制），全部可选：

| 变量 | 默认 | 说明 |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/kline.db` | PostgreSQL 用 `postgresql+asyncpg://user:pw@host:5432/kline` |
| `HTTP_PROXY` | 空 | Binance / OKX 有地区限制时填，如 `http://127.0.0.1:7890` |
| `HTTP_TIMEOUT` | `20` | 单次请求超时（秒） |
| `HTTP_MAX_RETRIES` | `3` | 遇 429/5xx 的重试次数（按 `Retry-After` 退避） |
| `FETCH_PAGE_DELAY` | `0.12` | 分页之间的间隔秒数，避免触发限频 |
| `MAX_CANDLES_PER_REQUEST` | `60000` | 单次请求 K 线上限，超出则截取最近一段并在界面提示 |
| `SYMBOLS_CACHE_TTL` | `900` | 合约列表缓存秒数 |
| `CORS_ORIGINS` | `http://localhost:5173,...` | 允许的前端来源，逗号分隔 |
| `DEBUG` / `DB_ECHO` | `false` | 调试日志 / 打印 SQL |

---

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（返回的 DSN 已脱敏） |
| GET | `/api/exchanges` | 交易所列表及各自支持的周期 |
| GET | `/api/exchanges/{exchange}/symbols?search=BTC` | 永续合约列表 |
| GET | `/api/candles?exchange=&symbol=&interval=&start=&end=&refresh=` | K 线，缺口自动补拉 |
| GET | `/api/candles/export?...` | 同上，返回 CSV |
| GET / POST / PATCH / DELETE | `/api/notes` | 复盘笔记 |
| GET / POST / PATCH / DELETE | `/api/drawings` | 趋势线与水平线（`DELETE /api/drawings?exchange=&symbol=` 清空该交易对） |
| GET / DELETE | `/api/storage/series` | 本地缓存清单 / 删除某序列 |
| GET / POST / DELETE | `/api/watchlist` | 自选 |

`start` / `end` 接受 `2024-01-01`、ISO-8601、epoch 秒或毫秒；省略则取"最近 500 根"。

```bash
curl "http://127.0.0.1:8000/api/candles?exchange=okx&symbol=BTC-USDT-SWAP&interval=1h&start=2024-01-01&end=2024-01-15"
```

```json
{
  "exchange": "okx", "symbol": "BTC-USDT-SWAP", "interval": "1h",
  "count": 337,
  "meta": { "from_cache": 0, "fetched": 337, "gaps_filled": 1,
            "live_bar": false, "truncated": false, "elapsed_ms": 1038 },
  "candles": [{ "t": 1704067200000, "o": 42297.7, "h": 42567.0, "l": 42266.1, "c": 42476.0, "v": 3312.25, "q": 140582403.19 }]
}
```

K 线字段刻意用短名（`t/o/h/l/c/v/q`）：一次请求可能带几万根，字段名会占掉响应体的大头。

---

## 设计要点

### 覆盖区间表，而不是"数一数够不够"

交易所会**合法地缺 K 线**（某个周期内没有成交就没有这根），所以"应有根数 == 已存根数"永远不成立，用它判断缓存完整性会导致无限重复下载。因此另存一张 `candle_coverage` 表记录"哪些区间已经抓全了"，请求时做区间减法算出缺口，只下载缺口：

```
请求 [────────────────────────]
已有      [────]      [───]
下载  [──]      [────]     [──]
```

未收盘的那根永远不写入覆盖区间，因此每次请求都会重新拉最新一根。区间代数是纯函数（`services/coverage.py`），单测覆盖了首/中/尾缺口、全覆盖、相邻合并等情况。

### 两种翻页方向

三家的分页语义完全不同，抽象成 `Pagination.FORWARD / BACKWARD` 由基类统一驱动，provider 只实现"取一页"：

| 交易所 | 单页上限 | 语义 | 策略 |
|---|---|---|---|
| Binance | 1500 | 认 `startTime`，从旧到新返回 | FORWARD |
| Bybit | 1000 | 锚定 `end`，返回最新的 N 根 | BACKWARD |
| OKX | 100 | 只有 `after` 游标（比该时间更早） | BACKWARD |

> 这三种语义是实际调接口验证过的，不是照文档猜的。

基类负责游标推进、跨页去重、排序、无进展保护和页数上限，任何一家的接口行为异常都不会把服务转死。

### 画线：SVG 覆盖层 + (时间, 价格) 锚点

lightweight-charts v4 没有内置绘图工具，这里在图表绘图区上盖一层 SVG 自己实现。三个决定值得说明：

**锚点存 (时间, 价格)，不存像素或 K 线下标。** 像素会随缩放失效，下标会随周期变化，只有时间+价格是周期无关的——所以 1h 上画的趋势线切到 4h、1d 位置完全一致。

**渲染路径是 时间 → 小数逻辑下标 → x 坐标。** 图表按 *下标* 均匀排布 K 线（不管相邻两根之间隔了多久），所以不能直接用时间换 x。插值时以"下一根实际存在的 K 线"为参照而非固定周期长度，这样跨越交易所缺失的 K 线时线依然是直的；两端之外按周期长度外推，于是拖到数据尽头之外的线依然几何正确。

**指针路由：** 覆盖层根节点 `pointer-events: none`，缩放和拖动照样穿透到图表；只有线条的透明加粗命中路径和端点手柄接收指针事件，而当某个画线工具处于激活状态时它们又会**主动让位**，让点击落回图表去放置锚点。另外覆盖层必须 `z-index: 3`——lightweight-charts 的交互 canvas 是 `z-index: 2`，不压过它的话手柄永远收不到鼠标。

**测量工具不入库。** 测量回答的是"刚那波涨了多少"这种一次性问题，读完就该消失；趋势线和水平线才是复盘资产。

### 回放不泄漏未来

回放时在**数据源头**截断，再交给图表和指标计算。如果只是遮挡右侧，MA 和价格轴仍然会反映未来数据，复盘就失去意义了。

### 新增一个交易所

1. 在 `backend/app/providers/` 加一个文件，继承 `ExchangeProvider`
2. 填 `interval_map`、`max_candles_per_page`、`pagination`
3. 实现 `list_symbols()` 与 `_fetch_page()`（返回一页，升序）
4. 在 `providers/registry.py` 的 `_PROVIDER_TYPES` 里登记

其余（分批、缓存、缺口计算、接口、前端下拉框）全部自动生效。

---

## 开发与测试

```bash
make test      # 后端 pytest（22 项）+ 前端 tsc 类型检查
make lint      # ruff + tsc
make fmt       # ruff 自动修复
make build     # 前端生产构建
```

后端测试覆盖：周期边界对齐（含周线对齐周一）、区间代数、双向分页（用假 provider 驱动，不打真实网络）、缓存行为（首拉/命中/扩大区间只补缺口/强制刷新/超限截断）。

---

## 已知边界

- 只做 REST 历史 + 15 秒轮询刷新最新一根，没有 WebSocket 实时推送
- 未收盘 K 线会随轮询变动，属预期行为
- 画线目前只有趋势线 / 水平线 / 测量三种，没有斐波那契、矩形、文字标签，也没有磁吸对齐 OHLC
- 复盘回放会截断指标与价格轴，但**不会**隐藏画线：画线是你自己的标注，按时间锚定照常显示
- OKX 单页仅 100 根，超长区间首次拉取较慢（之后走缓存）
- 无用户体系，笔记与缓存是单机单库的
