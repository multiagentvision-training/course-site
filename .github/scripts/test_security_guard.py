"""Regression tests for publication hygiene; all credential examples are synthetic."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("guard", Path(__file__).with_name("security_guard.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class PublicationBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)

    def track(self, name, contents=b"ordinary content"):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(contents)
        subprocess.run(["git", "-C", str(self.root), "add", "--", name], check=True)
        return path

    def test_forced_sensitive_paths_and_verifier_exceptions(self):
        for name in [".env.production", "books/text.pdf", "archive.zip", "participant.jpeg"]:
            self.track(name)
        for name in [".env.example", "data/verifier.bin", "data/teacher-verifier.bin"]:
            self.track(name)
        checked, failures = guard.check(self.root)
        self.assertEqual(checked, 7)
        self.assertEqual(len(failures), 4)

    def test_large_file_boundary_token_is_detected_without_disclosure(self):
        token = b"ghp_" + b"A" * 36
        self.track("large.txt", b"x" * 65530 + b" " + token + b" ")
        _, failures = guard.check(self.root)
        self.assertEqual(len(failures), 1)
        self.assertIn("GitHub token", failures[0])
        self.assertNotIn(token.decode(), failures[0])

    def test_symlink_requires_tracked_internal_file(self):
        self.track("safe.txt")
        (self.root / "valid").symlink_to("safe.txt")
        (self.root / "escaping").symlink_to(self.root.parent / "outside")
        (self.root / "untracked.txt").write_text("data")
        (self.root / "untracked-link").symlink_to("untracked.txt")
        subprocess.run(["git", "-C", str(self.root), "add", "--", "valid", "escaping", "untracked-link"], check=True)
        _, failures = guard.check(self.root)
        self.assertEqual(len(failures), 2)
        self.assertTrue(any("escaping:" in item for item in failures))
        self.assertTrue(any("untracked-link:" in item for item in failures))


if __name__ == "__main__":
    unittest.main()
