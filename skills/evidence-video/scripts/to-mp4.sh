#!/usr/bin/env bash
# webm を GitHub に添付しやすい mp4 に変換する。
# 使い方: to-mp4.sh <入力.webm> <出力.mp4> [冒頭から削る秒数]
# 10MB（GitHub の無料プランの添付上限）を超えたら、画質と解像度を落としてもう一度変換する。
set -euo pipefail

in="${1:?入力の webm を指定してください}"
out="${2:?出力の mp4 を指定してください}"
trim="${3:-0}"
limit=$((10 * 1024 * 1024))

command -v ffmpeg >/dev/null || { echo "ffmpeg が見つかりません（brew install ffmpeg）" >&2; exit 1; }

encode() { # $1=crf, $2=追加の -vf
  ffmpeg -y -loglevel error -ss "$trim" -i "$in" \
    -c:v libx264 -preset slow -crf "$1" ${2:+-vf "$2"} \
    -pix_fmt yuv420p -movflags +faststart -an "$out"
}

encode 28
size=$(wc -c <"$out" | tr -d ' ')
if [ "$size" -gt "$limit" ]; then
  echo "サイズが ${size} bytes で 10MB を超えたため、画質を落として再変換します" >&2
  encode 32 "scale='min(960,iw)':-2" # 縦長（スマホ）の動画を拡大しないよう、元の幅より大きくしない
  size=$(wc -c <"$out" | tr -d ' ')
  [ "$size" -gt "$limit" ] && echo "警告: 再変換後も 10MB を超えています（${size} bytes）。手順を分けて録画してください" >&2
fi

duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out")
printf '%s\t%.1fs\t%s bytes\n' "$out" "$duration" "$size"
