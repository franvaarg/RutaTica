"""Build a display snapshot from a published CTP candidate; keep its full history outside Git.

Usage: python3 scripts/build-stop-snapshot.py BASELINE PUBLISHED_CANDIDATE OUTPUT
OUTPUT must be a new disposable file. Promote only after release verification.
"""
import hashlib
import json
from pathlib import Path
import sqlite3
import sys


def rows_hash(connection, table):
    rows = connection.execute(f'SELECT * FROM "{table}" ORDER BY rowid').fetchall()
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False, default=str).encode()).hexdigest()


def build(baseline, candidate, output):
    baseline, candidate, output = map(Path, (baseline, candidate, output))
    if output.exists() or output.resolve() in (baseline.resolve(), candidate.resolve(), Path('db/custom.db').resolve()):
        raise ValueError('Output must be a new disposable path; never overwrite a snapshot')
    with sqlite3.connect(f'file:{baseline.resolve()}?mode=ro', uri=True) as original, \
            sqlite3.connect(f'file:{candidate.resolve()}?mode=ro', uri=True) as published:
        if published.execute('PRAGMA integrity_check').fetchall() != [('ok',)] or published.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('Candidate failed integrity checks')
        if published.execute('SELECT count(*) FROM ctp_stops').fetchone()[0] != 38657:
            raise ValueError('Unexpected approved CTP count')
        active = published.execute("SELECT count(*) FROM DatasetVersion d JOIN DataSource s ON s.id=d.sourceId WHERE s.kind='CTP' AND d.status='active'").fetchone()[0]
        if active != 1:
            raise ValueError('Candidate must contain one published CTP dataset')
        original_tables = [r[0] for r in original.execute("SELECT name FROM sqlite_master WHERE type='table' AND name!='sqlite_sequence'")]
        for table in original_tables:
            if table != 'RouteConfig' and rows_hash(original, table) != rows_hash(published, table):
                raise ValueError(f'Candidate changed baseline table: {table}')
        with sqlite3.connect(output) as release:
            original.backup(release)
            for migration in ['20260918000000_ctp_stops', '20260919000000_query_indexes', '20260923000000_versioned_transport']:
                release.executescript(Path('prisma/migrations', migration, 'migration.sql').read_text())
            release.execute('ATTACH DATABASE ? AS published', (str(candidate.resolve()),))
            release.execute('INSERT INTO ctp_stops SELECT * FROM published.ctp_stops')
            release.commit()
            release.execute('DETACH DATABASE published')
            release.execute('VACUUM')
            for table in original_tables:
                if rows_hash(original, table) != rows_hash(release, table):
                    raise ValueError(f'Release changed baseline table: {table}')
            if rows_hash(published, 'ctp_stops') != rows_hash(release, 'ctp_stops'):
                raise ValueError('Physical-stop projection changed')
            if release.execute('PRAGMA integrity_check').fetchall() != [('ok',)] or release.execute('PRAGMA foreign_key_check').fetchall():
                raise ValueError('Release failed integrity checks')
        if output.stat().st_size >= 100 * 1024 * 1024:
            raise ValueError('Snapshot exceeds GitHub single-file limit')
        print(json.dumps({'output': str(output), 'bytes': output.stat().st_size, 'ctpStops': 38657,
                          'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                          'history': 'Preserved in published candidate; release contains current display projection with full sourceMetadata.'}, indent=2))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    build(*sys.argv[1:])
