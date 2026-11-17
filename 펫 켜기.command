#!/bin/zsh
# 더블클릭하면 바탕화면 펫이 켜집니다.
cd "$(dirname "$0")/pet" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
nohup npm start >/dev/null 2>&1 &
