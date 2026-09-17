"""Ensure encrypted media is blocked without excluding encrypted lessons."""
import importlib.util
from pathlib import Path
import unittest
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location('media_guard', Path(__file__).with_name('check_no_media.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

class MediaPolicyTests(unittest.TestCase):
    def test_media_and_encrypted_copies_are_rejected(self):
        for suffix in guard.MEDIA_SUFFIXES:
            for wrapper in ('', '.enc', '.encrypted', '.gpg', '.enc.gpg'):
                with self.subTest(suffix=suffix, wrapper=wrapper):
                    self.assertTrue(guard.is_media('data/EXAMPLE' + suffix.upper() + wrapper))

    def test_course_text_and_verifiers_remain_allowed(self):
        for name in ('data/w01-lesson.md.enc', 'data/w01-lab.json.enc', 'data/w01-narration.md.enc', 'data/verifier.bin', 'poster.jpg.md', 'image.py'):
            with self.subTest(name=name):
                self.assertFalse(guard.is_media(name))

    def test_add_then_delete_media_still_fails_history_check(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.run(['git', '-C', str(root), '-c', 'user.name=Media policy test', '-c', 'user.email=media-test@example.invalid', *args], check=True, capture_output=True)
            git('init', '-q')
            (root / 'photo.JPG.enc').write_text('synthetic test fixture')
            git('add', '--', 'photo.JPG.enc')
            git('commit', '-qm', 'Add synthetic fixture')
            git('rm', '--', 'photo.JPG.enc')
            git('commit', '-qm', 'Remove synthetic fixture')
            self.assertEqual(guard.blocked_media(root), ['photo.JPG.enc'])


    def test_merge_only_add_and_remove_media_still_fails_history_check(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def git(*args):
                return subprocess.run(
                    ['git', '-C', str(root), '-c', 'user.name=Media policy test',
                     '-c', 'user.email=media-test@example.invalid',
                     '-c', 'commit.gpgsign=false', *args],
                    check=True, capture_output=True,
                ).stdout

            git('init', '-q', '-b', 'main')
            (root / 'README.md').write_text('Text remains allowed.')
            git('add', '--', 'README.md')
            git('commit', '-qm', 'Base text')
            base = git('rev-parse', 'HEAD').decode().strip()

            git('checkout', '-qb', 'first-side')
            git('commit', '--allow-empty', '-qm', 'First side')
            git('checkout', '-q', 'main')
            git('commit', '--allow-empty', '-qm', 'Main side')
            git('merge', '--no-ff', '--no-commit', 'first-side')
            (root / 'photo.JPG.enc').write_text('synthetic test fixture')
            git('add', '--', 'photo.JPG.enc')
            git('commit', '-qm', 'Add media only in merge')

            git('checkout', '-qb', 'second-side', base)
            git('commit', '--allow-empty', '-qm', 'Second side')
            git('checkout', '-q', 'main')
            git('merge', '--no-ff', '--no-commit', 'second-side')
            git('rm', '--', 'photo.JPG.enc')
            git('commit', '-qm', 'Remove media only in merge')

            # Neither the current index nor non-merge diffs reveal the media.
            self.assertEqual(git('ls-files', '-z'), b'README.md\0')
            self.assertEqual(git('rev-list', '--all', '--merges', '--count'), b'2\n')
            non_merge_paths = git(
                'log', '--all', '--no-diff-merges', '--format=', '--name-only', '-z',
            ).split(b'\0')
            self.assertNotIn(b'photo.JPG.enc', non_merge_paths)
            self.assertEqual(guard.blocked_media(root), ['photo.JPG.enc'])

if __name__ == '__main__':
    unittest.main()
