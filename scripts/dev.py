#!/usr/bin/env python3
"""Local development helper. Requires Docker Compose and Java 17."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "campus-market-server"


def ensure_env() -> None:
    target = ROOT / ".env"
    if not target.exists():
        shutil.copyfile(ROOT / ".env.example", target)
        print("已创建本地 .env（仅演示默认值，可按需修改）。")


def load_env() -> dict[str, str]:
    ensure_env()
    env = os.environ.copy()
    for number, original in enumerate((ROOT / ".env").read_text(encoding="utf-8").splitlines(), 1):
        line = original.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            raise ValueError(f".env 第 {number} 行不是 KEY=VALUE 格式")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or not key.replace("_", "a").isalnum() or key[0].isdigit():
            raise ValueError(f".env 第 {number} 行变量名无效")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        env.setdefault(key, value)
    return env


def compose(args: list[str], env: dict[str, str]) -> int:
    return subprocess.run(["docker", "compose", *args], cwd=ROOT, env=env, check=False).returncode


def dependencies(env: dict[str, str]) -> int:
    return compose(["up", "-d", "--wait"], env)


def backend(env: dict[str, str]) -> int:
    java_home = os.environ.get("JAVA_HOME")
    if not java_home:
        print("提示：请使用 JDK 17，并设置 JAVA_HOME。", file=sys.stderr)
    mvnw = SERVER / ("mvnw.cmd" if os.name == "nt" else "mvnw")
    command = [str(mvnw), "clean", "spring-boot:run"]
    return subprocess.run(command, cwd=SERVER, env=env, check=False).returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Campus Market 本地开发工具")
    parser.add_argument("command", choices=["start", "deps", "backend", "stop", "down", "status"])
    args = parser.parse_args()
    try:
        env = load_env()
        if args.command == "deps":
            return dependencies(env)
        if args.command == "backend":
            return backend(env)
        if args.command == "start":
            result = dependencies(env)
            return result if result else backend(env)
        if args.command == "stop":
            return compose(["stop"], env)
        if args.command == "down":
            return compose(["down"], env)
        return compose(["ps"], env)
    except FileNotFoundError as error:
        print(f"缺少可执行程序：{error.filename}", file=sys.stderr)
        return 2
    except (OSError, ValueError) as error:
        print(f"启动失败：{error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\n后端已停止；Docker 依赖仍保留，可用 stop 停止。")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
