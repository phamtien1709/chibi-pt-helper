#!/usr/bin/env bash
# Chạy trong subshell để source không đổi cwd/env của shell gọi.
(
  if [ -n "${ZSH_VERSION:-}" ]; then
    chibi_script_path="${(%):-%x}"
  elif [ -n "${BASH_VERSION:-}" ]; then
    chibi_script_path="${BASH_SOURCE[0]}"
  else
    printf '%s\n' 'Hãy dùng Bash hoặc Zsh để source run.sh.' >&2
    exit 1
  fi
  chibi_dir="$(cd -- "$(dirname -- "$chibi_script_path")" && pwd)" || exit 1
  chibi_node_ok() { command -v node >/dev/null 2>&1 && node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' >/dev/null 2>&1; }
  if ! chibi_node_ok; then
    chibi_node_bundle="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
    if [ -x "$chibi_node_bundle/node" ]; then export PATH="$chibi_node_bundle:$PATH"; fi
  fi
  if ! chibi_node_ok && [ -f "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
    nvm use --silent node >/dev/null 2>&1 || true
  fi
  if ! chibi_node_ok; then printf '%s\n' 'Cần Node.js 22 trở lên.' >&2; exit 1; fi
  chibi_mode="${1:---local}"
  if [ "$#" -gt 0 ]; then shift; fi
  case "$chibi_mode" in
    --help|-h)
      printf '%s\n' \
        'source /duong-dan/chibi-farm-helper/run.sh                  # Bảng theo dõi local' \
        'source /duong-dan/chibi-farm-helper/run.sh --demo           # Trại mẫu' \
        'source /duong-dan/chibi-farm-helper/run.sh --test           # Kiểm tra' \
        'source /duong-dan/chibi-farm-helper/run.sh --setup-login [file] # Nhập tài khoản/mật khẩu ẩn' \
        'source /duong-dan/chibi-farm-helper/run.sh --credentials <file> # Local không cần Chrome' \
        'source /duong-dan/chibi-farm-helper/run.sh --export-session /duong-dan/session.json' \
        'source /duong-dan/chibi-farm-helper/run.sh --terminal --credentials <file> [--config <file>] [--check]'
      exit 0;;
    --terminal) exec node "$chibi_dir/cli.mjs" "$@";;
    --setup-login) exec node "$chibi_dir/setup-login.mjs" "$@";;
    --credentials) set -- --credentials "$@";;
    --export-session) exec node "$chibi_dir/export-session.mjs" "$@";;
    --test) cd -- "$chibi_dir" || exit 1; exec node --test test/*.test.mjs;;
    --demo) set -- --demo "$@";;
    --local) ;;
    *) printf 'Chế độ không hợp lệ: %s\n' "$chibi_mode" >&2; exit 1;;
  esac
  chibi_browser=true
  for chibi_arg in "$@"; do if [ "$chibi_arg" = '--credentials' ]; then chibi_browser=false; fi; done
  if [ "$chibi_mode" = '--local' ] && [ "$chibi_browser" = true ]; then
    chibi_bundle="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
    if [ -f "$chibi_bundle/package.json" ]; then
      export CHIBI_PLAYWRIGHT_PATH="$chibi_bundle"
    elif [ ! -d "$chibi_dir/node_modules/playwright" ]; then
      (cd -- "$chibi_dir" && npm install --ignore-scripts) || exit 1
    fi
  fi
  printf 'Bảng điều khiển: http://127.0.0.1:%s · Ctrl+C để dừng.\n' "${PORT:-4179}"
  cd -- "$chibi_dir" || exit 1
  if command -v caffeinate >/dev/null 2>&1; then exec caffeinate -i node server.mjs "$@"; else exec node server.mjs "$@"; fi
)
