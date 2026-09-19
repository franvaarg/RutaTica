"""Read-only content checks for the explicitly selected release validation copy."""
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

snapshot = Path(sys.argv[1]).resolve()
assert snapshot != Path('db/custom.db').resolve(), 'Select a disposable copy'
connection = sqlite3.connect(f'file:{snapshot}?mode=ro', uri=True)
assert connection.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
assert not connection.execute('PRAGMA foreign_key_check').fetchall()

def digest(table):
    return hashlib.sha256(repr(connection.execute('SELECT * FROM "' + table + '" ORDER BY rowid').fetchall()).encode()).hexdigest()

before = json.loads((snapshot.parent / 'before.json').read_text())
assert all(digest(table) == value for table, value in before.items()), 'Existing data changed'
ctp_hash = digest('ctp_stops')
first = snapshot.parent / 'ctp-first.sha256'
if first.exists():
    assert first.read_text() == ctp_hash, 'Second import changed stored rows or timestamps'
else:
    first.write_text(ctp_hash)
print(json.dumps({'integrity': 'ok', 'foreignKeys': 'ok', 'preservedTables': len(before), 'ctpRows': connection.execute('SELECT COUNT(*) FROM ctp_stops').fetchone()[0], 'ctpContentSha256': ctp_hash}))
