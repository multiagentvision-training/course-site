#!/usr/bin/env python3
"""Check tracked files without printing credential values. Run from repository root."""
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

RESTRICTED_DIRS = {'books', 'record', 'records', 'recordings', 'meet recordings', 'prezentation', 'private', 'nda'}
RESTRICTED_SUFFIXES = {'.zip', '.7z', '.rar', '.tar', '.gz', '.key', '.pem', '.p12', '.pfx', '.ppt', '.pptx', '.jpeg', '.bin'}
PUBLIC_VERIFIERS = {'data/verifier.bin', 'data/teacher-verifier.bin'}
PATTERNS = {
    'private key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'GitHub token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'AWS access key': re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'Slack token': re.compile(rb'\bxox[baprs]-[A-Za-z0-9-]{20,}\b'),
    'API secret': re.compile(rb'\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{35,}\b'),
}

def path_problem(name):
    p = PurePosixPath(name)
    parts = [part.lower() for part in p.parts]
    base = parts[-1]
    if any(part in RESTRICTED_DIRS for part in parts[:-1]) or base.startswith('meet recordings'):
        return 'restricted source material'
    if base.startswith('.env') and not (base.endswith('.example') or base.endswith('.sample')):
        return 'environment secrets'
    if p.suffix.lower() in RESTRICTED_SUFFIXES and name not in PUBLIC_VERIFIERS:
        return 'restricted archive, media, or key format'
    if base in {'cohort.yaml', 'cohort.yml', 'roster.md', 'credentials.json', 'service-account.json'}:
        return 'private participant or credential file'
    return None

def check(root):
    names = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z']).decode().split('\0')
    tracked = set(names)
    failures = []
    checked = 0
    for name in filter(None, names):
        problem = path_problem(name)
        if problem:
            failures.append(f'{name}: {problem}')
        p = root / name
        if p.is_symlink():
            try:
                target = p.resolve(strict=True).relative_to(root.resolve()).as_posix()
                if target not in tracked or not p.is_file():
                    failures.append(f'{name}: symlink target must be a tracked file inside this repository')
            except (OSError, RuntimeError, ValueError):
                failures.append(f'{name}: dangling or escaping symlink')
            continue
        if not p.is_file():
            continue
        checked += 1
        # Stream bytes so large files cannot hide a token or exhaust checker memory.
        with p.open('rb') as stream:
            overlap = b''
            found = set()
            while chunk := stream.read(65536):
                block = overlap + chunk
                for kind, pattern in PATTERNS.items():
                    if kind not in found and pattern.search(block):
                        found.add(kind)
                        failures.append(f'{name}: possible {kind}; value withheld')
                overlap = block[-512:]
    return checked, failures

if __name__ == '__main__':
    root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel']).decode().strip())
    checked, failures = check(root)
    for failure in failures:
        print(f'BLOCKED: {failure}')
    print(f'Security hygiene: {checked} tracked files checked; {len(failures)} blockers. This is not a legal or complete secret-scan certification.')
    sys.exit(bool(failures))
