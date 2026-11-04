import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('installer', Path(__file__).parents[1] / 'scripts/install.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def archive(version='0.4.6', extra=None, duplicate=False, symlink=False, manifest=None):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in sorted(m.FILES):
            content = json.dumps(manifest or {'id': m.PLUGIN, 'version': version, 'isDesktopOnly': True}) if name == 'manifest.json' else 'public release content'
            info = zipfile.ZipInfo(m.PLUGIN + '/' + name)
            if symlink and name == 'main.js':
                info.external_attr = 0o120777 << 16
            z.writestr(info, content)
        if extra:
            z.writestr(extra, 'unwanted')
        if duplicate:
            z.writestr(m.PLUGIN + '/main.js', 'duplicate')
    data = buf.getvalue()
    return data, hashlib.sha256(data).hexdigest()


class InstallerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='rr-install-test-')
        self.addCleanup(self.temp.cleanup)
        self.vault = Path(self.temp.name) / '中文 Vault with spaces'
        self.config = self.vault / '.obsidian'
        self.config.mkdir(parents=True)
        self.target = self.config / 'plugins/research-radar'
        self.data, self.sha = archive()

    def run_install(self, **kwargs):
        return m.install(self.vault, self.data, self.sha, '0.4.6', **kwargs)

    def old(self):
        self.target.mkdir(parents=True)
        (self.target / 'manifest.json').write_text(json.dumps({'id': m.PLUGIN, 'version': '0.4.5'}))
        (self.target / 'main.js').write_text('old executable')
        (self.target / 'data.json').write_text('{"settings":"private","translations":["保留"]}')
        (self.target / 'personal.md').write_text('untouched')
        return m.inventory(self.target)

    def test_dry_run_no_writes(self):
        before = m.inventory(self.vault)
        result = self.run_install(dry_run=True)
        self.assertFalse(result['written'])
        self.assertEqual(m.inventory(self.vault), before)

    def test_fresh_install_does_not_auto_enable(self):
        r = self.run_install(closed=True)
        self.assertEqual(set(m.inventory(self.target)), m.FILES)
        self.assertFalse(r['enabledAutomatically'])
        self.assertFalse((self.config / 'community-plugins.json').exists())

    def test_upgrade_and_backup_preserve_private_data(self):
        before = self.old()
        r = self.run_install(closed=True)
        self.assertEqual(m.inventory(Path(r['backup']) / m.PLUGIN), before)
        for name in ['data.json', 'personal.md']:
            self.assertEqual(m.inventory(self.target)[name], before[name])
        self.assertEqual(json.loads((self.target / 'manifest.json').read_text())['version'], '0.4.6')

    def test_requires_closed_app_confirmation(self):
        with self.assertRaisesRegex(ValueError, 'Close Obsidian'):
            self.run_install()
        self.assertFalse(self.target.exists())

    def test_hash_failure_leaves_existing_files(self):
        before = self.old()
        self.sha = '0' * 64
        with self.assertRaisesRegex(ValueError, 'SHA256'):
            self.run_install(closed=True)
        self.assertEqual(m.inventory(self.target), before)

    def test_archive_traversal_private_data_duplicate_and_symlink(self):
        for kwargs in [{'extra': '../escape'}, {'extra': 'research-radar/data.json'}, {'duplicate': True}, {'symlink': True}]:
            with self.subTest(kwargs=kwargs):
                data, sha = archive(**kwargs)
                with self.assertRaises(ValueError):
                    m.validate_archive(data, sha, '0.4.6')

    def test_wrong_manifest_rejected(self):
        for manifest in [{'id': 'other', 'version': '0.4.6', 'isDesktopOnly': True}, {'id': m.PLUGIN, 'version': '9.9.9', 'isDesktopOnly': True}]:
            data, sha = archive(manifest=manifest)
            with self.assertRaises(ValueError):
                m.validate_archive(data, sha, '0.4.6')

    def test_symlink_destination_rejected(self):
        self.target.parent.mkdir()
        other = self.vault / 'other'; other.mkdir()
        self.target.symlink_to(other, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symbolic'):
            self.run_install(closed=True)
        self.assertEqual(list(other.iterdir()), [])

    def test_existing_symlink_rejected(self):
        self.old()
        (self.target / 'link').symlink_to(self.vault)
        with self.assertRaisesRegex(ValueError, 'symbolic'):
            self.run_install(closed=True)

    def test_interrupted_commit_restores_old_directory(self):
        before = self.old()
        rename = Path.rename
        def fail_stage(path, target):
            if path.parent.name.startswith('research-radar-stage-'):
                raise OSError('simulated interrupted write')
            return rename(path, target)
        with patch.object(Path, 'rename', fail_stage):
            with self.assertRaisesRegex(OSError, 'interrupted'):
                self.run_install(closed=True)
        self.assertEqual(m.inventory(self.target), before)
        self.assertFalse((self.config / 'research-radar-install.lock').exists())

    def test_lock_blocks_concurrent_install(self):
        before = self.old()
        (self.config / 'research-radar-install.lock').mkdir()
        with self.assertRaisesRegex(ValueError, 'lock'):
            self.run_install(closed=True)
        self.assertEqual(m.inventory(self.target), before)

    def test_missing_vault_custom_config_and_downgrade(self):
        with self.assertRaises(ValueError):
            self.run_install(closed=True, config_dir='../other')
        self.old()
        (self.target / 'manifest.json').write_text(json.dumps({'id': m.PLUGIN, 'version': '1.0.0'}))
        with self.assertRaisesRegex(ValueError, 'downgrade'):
            self.run_install(closed=True)


if __name__ == '__main__':
    unittest.main()
