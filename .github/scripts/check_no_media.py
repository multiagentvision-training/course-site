#!/usr/bin/env python3
"""Reject committed media, including encrypted copies; preserve course text."""
from pathlib import PurePosixPath
import subprocess
import sys

MEDIA_SUFFIXES = frozenset(['.mp4', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.ogv', '.webm', '.mov', '.avi', '.flac', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.vtt', '.srt', '.mkv', '.heic', '.heif', '.webvtt', '.tif', '.tiff', '.bmp', '.ico', '.avif', '.psd', '.flv', '.mpeg', '.mpg', '.m4v', '.3gp', '.aif', '.aiff', '.opus', '.wma', '.wmv', '.ass', '.ssa'])

def is_media(name):
    name = name.lower()
    while PurePosixPath(name).suffix in {'.enc', '.encrypted', '.gpg'}:
        name = name.rsplit('.', 1)[0]
    return PurePosixPath(name).suffix in MEDIA_SUFFIXES

def blocked_media(root='.'):
    index = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z'])
    history = subprocess.check_output(['git', '-C', str(root), 'log', '--all', '-m', '--format=', '--name-only', '-z'])
    names = set((index + b'\0' + history).decode().split('\0'))
    return sorted(name for name in names if name and is_media(name))

def main():
    blocked = blocked_media()
    for name in blocked:
        print('Media must not occur in tracked files or Git history: ' + name)
    print(f'Media policy: {len(blocked)} media paths in tracked files or history')
    return bool(blocked)

if __name__ == '__main__':
    sys.exit(main())
