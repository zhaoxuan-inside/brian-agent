#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brian-Agent 自动化打包脚本。

一键完成：环境自检 → 依赖安装（可选）→ 前端构建 → 后端 bundle + 四平台
便携包 / .deb 组装（实际装配由 node packaging/pack.mjs 执行）→ 产物校验
→ SHA256 校验和生成。

用法:
    python3 packaging/pack.py                          # 全部 4 目标 + .deb
    python3 packaging/pack.py --targets linux-x64      # 指定目标（逗号分隔）
    python3 packaging/pack.py --skip-chromium          # 不内置 Chromium（-150MB/目标）
    python3 packaging/pack.py --skip-runtime           # 不内置 bash/Python 沙箱运行时
    python3 packaging/pack.py --skip-frontend-build    # 复用已有 brian-frontend/dist
    python3 packaging/pack.py --skip-deb               # 不产 .deb
    python3 packaging/pack.py --no-install             # 跳过 npm install 检查

产物: dist-pack/brian-agent-<plat>-<arch>.tar.gz | .zip、brian-agent_<ver>_amd64.deb、
      SHA256SUMS。使用说明见 packaging/README.md 与根 README.md 的"打包分发与安装"。
"""

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist-pack"
PACK_MJS = ROOT / "packaging" / "pack.mjs"

ALL_TARGETS = ["linux-x64", "darwin-x64", "darwin-arm64", "win32-x64"]
ARCHIVE_SUFFIX = {"linux-x64": ".tar.gz", "darwin-x64": ".tar.gz",
                  "darwin-arm64": ".tar.gz", "win32-x64": ".zip"}

STEP = "[pack.py]"


def info(msg: str) -> None:
    print(f"{STEP} {msg}", flush=True)


def ok(msg: str) -> None:
    print(f"{STEP} ✔ {msg}", flush=True)


def die(msg: str, code: int = 1) -> None:
    print(f"{STEP} ✗ {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


def run(cmd: list, cwd: Path = ROOT, env_extra: dict | None = None) -> None:
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    print(f"{STEP} $ {' '.join(cmd)} (cwd={cwd})", flush=True)
    result = subprocess.run(cmd, cwd=str(cwd), env=env)
    if result.returncode != 0:
        die(f"命令失败（exit {result.returncode}）: {' '.join(cmd)}")


def which(name: str) -> str | None:
    return shutil.which(name)


# ---------------------------------------------------------------------------
# 环境自检
# ---------------------------------------------------------------------------

def check_prerequisites() -> None:
    info("环境自检...")
    if sys.version_info < (3, 8):
        die(f"需要 Python 3.8+，当前 {sys.version.split()[0]}")
    for tool in ("node", "npm", "tar"):
        if which(tool) is None:
            die(f"缺少依赖工具: {tool}")
    node_version = subprocess.check_output(["node", "-v"], text=True).strip().lstrip("v")
    node_major = int(node_version.split(".")[0])
    node_abi = subprocess.check_output(
        ["node", "-p", "process.versions.modules"], text=True).strip()
    if node_major != 22 or node_abi != "127":
        die(f"需要 Node 22 (ABI 127) 构建原生模块，当前 {node_version} (ABI {node_abi})。"
            f"可用 nvm 切换: nvm install 22 && nvm use 22")
    if which("dpkg-deb") is None:
        info("提示: 未检测到 dpkg-deb，将跳过 .deb 构建（其余产物不受影响）")
    ok(f"Node {node_version} (ABI {node_abi})")


def ensure_dependencies(auto_install: bool) -> None:
    node_modules = ROOT / "node_modules"
    pkg_lock = ROOT / "package-lock.json"
    if node_modules.exists() and (node_modules / ".package-lock.json").exists():
        ok("依赖已安装（node_modules 存在）")
        return
    if not auto_install:
        die("依赖未安装且指定了 --no-install，请先执行 npm install")
    if not pkg_lock.exists():
        die("缺少 package-lock.json，无法确定依赖版本")
    info("依赖未安装，自动执行 npm ci（可能需要几分钟）...")
    run(["npm", "ci"])
    ok("依赖安装完成")


# ---------------------------------------------------------------------------
# 构建
# ---------------------------------------------------------------------------

def build_frontend() -> None:
    info("构建前端（vue-tsc + vite build）...")
    run(["npm", "run", "build:frontend"])
    index = ROOT / "brian-frontend" / "dist" / "index.html"
    if not index.exists():
        die("前端构建后未找到 brian-frontend/dist/index.html")
    ok("前端构建完成")


# ---------------------------------------------------------------------------
# 产物校验与校验和
# ---------------------------------------------------------------------------

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_artifacts(targets: list, include_deb: bool, skip_runtime: bool = False) -> list:
    info("校验产物...")
    artifacts = []
    for target in targets:
        suffix = ARCHIVE_SUFFIX[target]
        path = DIST / f"brian-agent-{target}{suffix}"
        if not path.exists():
            die(f"缺少产物: {path.name}")
        artifacts.append(path)
    deb = DIST / "brian-agent_1.0.0_amd64.deb"
    if include_deb:
        if not deb.exists():
            die("预期包含 .deb 但产物缺失")
        artifacts.append(deb)

    # linux 包冒烟级结构校验（不解压全包，仅抽查清单）
    linux_tgz = DIST / "brian-agent-linux-x64.tar.gz"
    if linux_tgz.exists():
        required = [
            "brian-agent-linux-x64/bin/node",
            "brian-agent-linux-x64/server/brian-server.cjs",
            "brian-agent-linux-x64/server/portable.marker",
            "brian-agent-linux-x64/server/native/linux-x64/better_sqlite3.node",
            "brian-agent-linux-x64/web/index.html",
        ]
        if not skip_runtime:
            required += [
                "brian-agent-linux-x64/runtime/python/bin/python3",
            ]
        listing = subprocess.run(
            ["tar", "-tzf", str(linux_tgz)], capture_output=True, text=True, check=True
        ).stdout.splitlines()
        listed = set(listing)
        missing = [m for m in required if m not in listed]
        if missing:
            die(f"linux 包缺少关键文件: {missing}")
        ok("linux 包结构校验通过（node / bundle / 原生件 / 前端 / 沙箱运行时）")

    # win32 包抽查：捆绑 bash 与 Python 解释器
    win_zip = DIST / "brian-agent-win32-x64.zip"
    if win_zip.exists() and "win32-x64" in targets:
        try:
            import zipfile
            with zipfile.ZipFile(win_zip) as zf:
                names = set(zf.namelist())
        except zipfile.BadZipFile as e:
            die(f"win32 包损坏: {e}")
        required = [
            "brian-agent-win32-x64/bin/node.exe",
            "brian-agent-win32-x64/server/brian-server.cjs",
            "brian-agent-win32-x64/runtime/bash/usr/bin/bash.exe",
            "brian-agent-win32-x64/runtime/python/python.exe",
        ]
        if skip_runtime:
            required = [m for m in required if not m.startswith("brian-agent-win32-x64/runtime/")]
        missing = [m for m in required if m not in names]
        if missing:
            die(f"win32 包缺少关键文件: {missing}")
        ok("win32 包结构校验通过（node / bundle / bash / python）")
    return artifacts


def write_checksums(artifacts: list) -> Path:
    sums_path = DIST / "SHA256SUMS"
    lines = []
    for path in sorted(artifacts, key=lambda p: p.name):
        digest = sha256(path)
        lines.append(f"{digest}  {path.name}")
        ok(f"SHA256 {path.name}: {digest[:16]}...")
    sums_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return sums_path


def print_summary(targets: list, include_deb: bool) -> None:
    info("打包完成，产物一览:")
    rows = []
    for target in targets:
        path = DIST / f"brian-agent-{target}{ARCHIVE_SUFFIX[target]}"
        rows.append((path.name, path.stat().st_size))
    deb = DIST / "brian-agent_1.0.0_amd64.deb"
    if include_deb and deb.exists():
        rows.append((deb.name, deb.stat().st_size))
    sums = DIST / "SHA256SUMS"
    if sums.exists():
        rows.append((sums.name, sums.stat().st_size))
    width = max(len(n) for n, _ in rows) + 2
    for name, size in rows:
        print(f"  {name:<{width}} {size / 1024 / 1024:>8.1f} MB")


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="pack.py", description="Brian-Agent 自动化打包（跨平台便携包 + .deb）")
    parser.add_argument("--targets", default=",".join(ALL_TARGETS),
                        help=f"目标平台，逗号分隔（默认全部: {','.join(ALL_TARGETS)}）")
    parser.add_argument("--skip-chromium", action="store_true",
                        help="不内置 Chromium（每个目标体积约 -150MB，CDT 回退系统 Chrome）")
    parser.add_argument("--skip-runtime", action="store_true",
                        help="不内置 bash/Python 沙箱运行时（沙箱回退宿主机解释器）")
    parser.add_argument("--skip-frontend-build", action="store_true",
                        help="复用已有 brian-frontend/dist，不重新构建前端")
    parser.add_argument("--skip-deb", action="store_true", help="不构建 .deb")
    parser.add_argument("--no-system-data", action="store_true",
                        help="不打包系统数据种子（模型提供商列表 / MCP 提供商列表）")
    parser.add_argument("--no-npm", action="store_true",
                        help="不生成 npm 全局分发包（dist-pack/npm/）")
    parser.add_argument("--repo", default=None, metavar="OWNER/REPO",
                        help="npm 包与安装脚本引用的 GitHub 仓库（默认取 origin remote）")
    parser.add_argument("--no-install", action="store_true",
                        help="不自动执行 npm ci（依赖缺失时报错而非自动安装）")
    args = parser.parse_args()

    targets = [t.strip() for t in args.targets.split(",") if t.strip()]
    unknown = [t for t in targets if t not in ALL_TARGETS]
    if unknown:
        die(f"未知目标: {', '.join(unknown)}（可选: {', '.join(ALL_TARGETS)}）")

    print(f"{STEP} ============================================")
    print(f"{STEP} Brian-Agent 自动化打包，目标: {', '.join(targets)}")
    print(f"{STEP} ============================================")

    # 1) 环境自检 + 依赖
    check_prerequisites()
    ensure_dependencies(auto_install=not args.no_install)

    # 2) 前端构建
    if not args.skip_frontend_build:
        build_frontend()
    else:
        info("跳过前端构建（复用已有 dist）")

    # 3) 组装便携包（node packaging/pack.mjs）
    #    前端已由本脚本构建，始终传 --skip-frontend-build 复用；
    #    pack.mjs 仅在"全目标且未指定 --only"时产 .deb
    pack_cmd = ["node", "packaging/pack.mjs", "--skip-frontend-build"]
    if args.skip_chromium:
        pack_cmd.append("--skip-chromium")
    if args.skip_runtime:
        pack_cmd.append("--skip-runtime")
    if args.no_system_data:
        pack_cmd.append("--no-system-data")
    if args.no_npm:
        pack_cmd.append("--no-npm")
    if args.repo:
        pack_cmd += ["--repo", args.repo]
    if args.skip_deb or set(targets) != set(ALL_TARGETS):
        pack_cmd += ["--only", ",".join(targets)]
    info(f"执行装配: {' '.join(pack_cmd)}")
    run(pack_cmd)

    # 4) 产物校验 + 校验和
    #    pack.mjs 仅在"全目标且未指定 --only"时产 .deb，此时才纳入校验，
    #    避免把历史残留的旧 deb 误当作本次产物
    include_deb = set(targets) == set(ALL_TARGETS) and not args.skip_deb
    artifacts = verify_artifacts(targets, include_deb, skip_runtime=args.skip_runtime)
    if not include_deb and (DIST / "brian-agent_1.0.0_amd64.deb").exists():
        info("本次未构建 .deb（历史产物不纳入校验和）")
    sums = write_checksums(artifacts)
    print_summary(targets, include_deb)
    ok(f"校验和已写入: {sums.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        die("已中断", code=130)
