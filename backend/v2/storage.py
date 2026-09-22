"""Private immutable keys; the domain depends on BlobStore, not volume paths."""
from pathlib import Path
from typing import Protocol
import hashlib
import os
import re
from uuid import uuid4


class BlobStore(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def read(self, key: str) -> bytes: ...


class VolumeStore:
    def __init__(self, root: Path):
        self.root = root.resolve()
        if {'public', 'static'} & set(self.root.parts):
            raise ValueError('Storage cannot be public/static')
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.root.chmod(0o700)

    def path(self, key):
        if not re.fullmatch(r'objects/[a-f0-9]{2}/[a-f0-9]{32}', key):
            raise ValueError('Invalid storage key')
        path = self.root / key
        if not path.resolve().is_relative_to(self.root) or any(p.is_symlink() for p in (path,path.parent,path.parent.parent)):
            raise ValueError('Symlink/path escape is forbidden')
        return path

    @staticmethod
    def sync_dir(path):
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    def put(self, key, data):
        path = self.path(key)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.sync_dir(self.root)
        self.sync_dir(path.parent.parent)
        temporary = path.parent / ('.upload-' + uuid4().hex)
        try:
            fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            # Hard link publishes atomically without overwriting an existing immutable key.
            os.link(temporary, path)
            self.sync_dir(path.parent)
        finally:
            temporary.unlink(missing_ok=True)

    def read(self, key):
        path = self.path(key)
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as stream:
            return stream.read()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def new_key():
    identifier = uuid4().hex
    return f'objects/{identifier[:2]}/{identifier}'
