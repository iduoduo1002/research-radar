#!/usr/bin/env python3
"""User-run GitHub installer. Python 3.9+, standard library only; never run by the plugin."""
import argparse
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile

REPO = 'iduoduo1002/research-radar'
PLUGIN = 'research-radar'
FILES = {
    'main.js', 'manifest.json', 'styles.css', 'README.md', 'AGENT.md',
    'example-profile.json', 'THIRD-PARTY-NOTICES.md', 'docs/USER-GUIDE.md',
    'docs/SECURITY.md', 'docs/STATUS.md', 'docs/ZOTERO.md', 'LICENSE', 'NOTICE',
    'RIGHTS.md', 'README.en.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
    'docs/PUBLISHING.md', 'docs/images/radar-desktop.png', 'docs/images/agent-handoff.png',
}
MAX_DOWNLOAD = 20 * 1024 * 1024


def version_tuple(value):
    if not re.fullmatch(r'\d+\.\d+\.\d+', value):
        raise ValueError('Version must be x.y.z, without a v prefix.')
    return tuple(map(int, value.split('.')))


def download(url, limit=MAX_DOWNLOAD):
    req = urllib.request.Request(url, headers={'User-Agent': 'Research-Radar-Installer'})
    with urllib.request.urlopen(req, timeout=60) as response:
        if response.geturl().split(':', 1)[0] != 'https':
            raise ValueError('Refusing a non-HTTPS download.')
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Download exceeds size limit.')
    return data


def fetch_release(version=None):
    if not version:
        # No GitHub token or private account data needed.
        data = json.loads(download(f'https://api.github.com/repos/{REPO}/releases/latest', 1024 * 1024))
        version = data['tag_name']
    version_tuple(version)
    name = f'research-radar-{version}.zip'
    root = f'https://github.com/{REPO}/releases/download/{version}/'
    checksum = download(root + name + '.sha256', 1024).decode().strip().split()
    if len(checksum) != 2 or not re.fullmatch(r'[a-f0-9]{64}', checksum[0]) or checksum[1] != name:
        raise ValueError('Invalid release checksum file.')
    return version, download(root + name), checksum[0]


def validate_archive(data, expected_sha, version):
    version_tuple(version)
    if hashlib.sha256(data).hexdigest() != expected_sha:
        raise ValueError('SHA256 mismatch; nothing installed.')
    if len(data) > MAX_DOWNLOAD:
        raise ValueError('Archive exceeds size limit.')
    result = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) != len(FILES) or sum(e.file_size for e in entries) > 40 * 1024 * 1024:
            raise ValueError('Unexpected archive entries or size.')
        for entry in entries:
            prefix = PLUGIN + '/'
            name = entry.filename[len(prefix):] if entry.filename.startswith(prefix) else ''
            mode = entry.external_attr >> 16
            if name not in FILES or name in result or entry.is_dir() or stat.S_ISLNK(mode):
                raise ValueError('Unexpected, duplicate or symbolic-link archive entry.')
            payload = archive.read(entry)  # Verifies ZIP CRC.
            if not payload:
                raise ValueError('Empty release file.')
            result[name] = payload
    if set(result) != FILES:
        raise ValueError('Incomplete release.')
    manifest = json.loads(result['manifest.json'])
    if manifest.get('id') != PLUGIN or manifest.get('version') != version or manifest.get('isDesktopOnly') is not True:
        raise ValueError('Release manifest does not match Research Radar desktop version.')
    return result


def inventory(folder):
    result = {}
    for path in folder.rglob('*'):
        if path.is_symlink():
            raise ValueError('Plugin folder contains a symbolic link; use manual installation.')
        if path.is_file():
            result[path.relative_to(folder).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
        elif not path.is_dir():
            raise ValueError('Unsupported special file in plugin folder.')
    return result


def install(vault, data, checksum, version, *, dry_run=False, closed=False, config_dir='.obsidian'):
    payload = validate_archive(data, checksum, version)
    if not re.fullmatch(r'\.[A-Za-z0-9_-]+', config_dir):
        raise ValueError('Config directory must be a single hidden folder name, e.g. .obsidian.')
    vault = Path(vault).expanduser().resolve(strict=True)
    config = vault / config_dir
    if not config.is_dir() or config.is_symlink():
        raise ValueError('Expected a real existing Obsidian configuration folder in the vault.')
    plugins = config / 'plugins'
    target = plugins / PLUGIN
    backups = config / 'research-radar-backups'
    for path in (plugins, target, backups):
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError('Refusing symbolic links or non-directory installation paths.')
    existing = inventory(target) if target.exists() else None
    if existing is not None:
        manifest = json.loads((target / 'manifest.json').read_text())
        if manifest.get('id') != PLUGIN:
            raise ValueError('Existing directory belongs to another plugin.')
        if version_tuple(manifest['version']) > version_tuple(version):
            raise ValueError('Refusing a downgrade; use a matching or newer release.')
    plan = {'version': version, 'target': str(target), 'files': len(payload),
            'action': 'upgrade' if existing is not None else 'install',
            'preserves': 'Existing data.json, translations and user files', 'enabledAutomatically': False}
    if dry_run:
        return {**plan, 'dryRun': True, 'written': False}
    if not closed:
        raise ValueError('Close Obsidian first, then pass --obsidian-closed. Use --dry-run for preview.')
    lock = config / 'research-radar-install.lock'
    try:
        lock.mkdir()
    except FileExistsError:
        raise ValueError('Another installation or a stale lock exists. Inspect research-radar-install.lock before retrying.')
    stage_root = None
    backup = None
    moved_old = False
    try:
        plugins.mkdir(exist_ok=True)
        stage_root = Path(tempfile.mkdtemp(prefix='research-radar-stage-', dir=config))
        stage = stage_root / PLUGIN
        if existing is not None:
            shutil.copytree(target, stage)
            if inventory(stage) != existing or inventory(target) != existing:
                raise ValueError('Existing files changed while copying; close Obsidian and retry.')
        else:
            stage.mkdir()
        for name, content in payload.items():
            path = stage / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        expected = {**(existing or {}), **{n: hashlib.sha256(b).hexdigest() for n, b in payload.items()}}
        if inventory(stage) != expected:
            raise ValueError('Staging verification failed.')
        if existing is not None:
            backups.mkdir(exist_ok=True)
            stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')
            backup = Path(tempfile.mkdtemp(prefix=stamp + '-', dir=backups))
            (backup / 'sha256.json').write_text(json.dumps(existing, indent=2))
            target.rename(backup / PLUGIN)
            moved_old = True
            if inventory(backup / PLUGIN) != existing:
                raise ValueError('Backup verification failed.')
        try:
            stage.rename(target)
        except BaseException:
            if moved_old and not target.exists():
                (backup / PLUGIN).rename(target)
                moved_old = False
            raise
        if inventory(target) != expected:
            raise ValueError('Installed file verification failed.')
        return {**plan, 'written': True, 'sha256': checksum, 'backup': str(backup) if backup else None}
    except BaseException:
        # Preserve the failed installation for inspection; restore the verified old directory.
        if moved_old:
            if target.exists():
                target.rename(backup / 'failed-installation')
            (backup / PLUGIN).rename(target)
        raise
    finally:
        if stage_root and stage_root.exists():
            shutil.rmtree(stage_root)
        lock.rmdir()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--vault', required=True, help='Path to an existing Obsidian vault')
    p.add_argument('--version', help='Pinned x.y.z release; default: latest non-prerelease')
    p.add_argument('--config-dir', default='.obsidian')
    p.add_argument('--dry-run', action='store_true', help='Download and validate; do not change the vault')
    p.add_argument('--obsidian-closed', action='store_true', help='Confirm you closed Obsidian before installing')
    args = p.parse_args()
    try:
        if not args.dry_run and not args.obsidian_closed:
            p.error('Close Obsidian and pass --obsidian-closed, or use --dry-run.')
        version, data, checksum = fetch_release(args.version)
        result = install(args.vault, data, checksum, version, dry_run=args.dry_run, closed=args.obsidian_closed, config_dir=args.config_dir)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print('Open Obsidian → Settings → Community plugins → enable Research Radar.' if not args.dry_run else 'Preview only; no vault files changed.')
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print(f'Installation stopped: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
