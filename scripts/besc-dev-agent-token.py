#!/usr/bin/env python3
"""Store a DEV Workspace Agent token through a hidden terminal prompt."""
import argparse
import getpass
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

ROOT = Path('/opt/besc-dev/command-center')
ENV = ROOT / '.env.production'
CHANNEL = 'agtch_6ac48b6b92a08191b06bb6ec50342498'
TOKEN_KEY = 'BESC_WORKSPACE_AGENT_ACCESS_TOKEN'
CHANNEL_KEY = 'BESC_TECHNICAL_AGENT_CHANNEL_ID'


def unchanged(info):
    current = ENV.stat()
    return all(getattr(current, name) == getattr(info, name) for name in (
        'st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink',
        'st_size', 'st_mtime_ns', 'st_ctime_ns',
    ))


def prepare():
    if ROOT.resolve() != ROOT or ENV.is_symlink():
        raise ValueError('Onverwacht pad of symbolische koppeling; gestopt.')
    info = ENV.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('Geen gewoon configuratiebestand; gestopt.')
    if stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('Bestandsrechten zijn niet 600; gestopt.')
    if os.geteuid() not in (0, info.st_uid):
        raise ValueError('Geen passende bestandsrechten; gestopt.')
    ignored = subprocess.run(
        ['git', 'check-ignore', '--quiet', '--', '.env.production'],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if ignored.returncode != 0:
        raise ValueError('Configuratie is niet aantoonbaar buiten Git gehouden; gestopt.')
    data = ENV.read_bytes()
    text = data.decode('utf-8')
    lines = text.splitlines(keepends=True)
    matches = {}
    for key in (TOKEN_KEY, CHANNEL_KEY):
        found = [(i, line) for i, line in enumerate(lines)
                 if re.match(r'^\s*(?:export\s+)?' + re.escape(key) + r'\s*=', line)]
        if len(found) > 1:
            raise ValueError('Dubbele agentinstelling; gestopt.')
        matches[key] = found
    # Never overwrite an existing credential, including a commented/quoted value.
    if matches[TOKEN_KEY]:
        value = matches[TOKEN_KEY][0][1].split('=', 1)[1].strip()
        if value not in ('', "''", '""'):
            raise ValueError('Er staat al een agenttoken ingesteld; niet overschreven.')
    if matches[CHANNEL_KEY]:
        value = matches[CHANNEL_KEY][0][1].split('=', 1)[1].strip()
        if value not in ('', "''", '""', CHANNEL, "'" + CHANNEL + "'", '"' + CHANNEL + '"'):
            raise ValueError('Er staat een ander kanaal ingesteld; niet overschreven.')
    return info, data, lines, matches


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check only; no prompt or write.')
    args = parser.parse_args()
    info, original, lines, matches = prepare()
    if args.check:
        print('DEV-configuratie geschikt; geen bestaand token; geen wijzigingen uitgevoerd.')
        return
    if not os.isatty(0):
        raise ValueError('Gebruik een interactieve Termius-terminal; gestopt.')
    token = getpass.getpass('Workspace Agent-token (verborgen invoer): ')
    # Conservative ENV-safe alphabet; refuse unusual values rather than transform secrets.
    if not re.fullmatch(r'[A-Za-z0-9._~+/=-]{1,8192}', token):
        raise ValueError('Tokeninvoer niet geschikt voor veilige ENV-opslag; niets opgeslagen.')
    values = {TOKEN_KEY: token, CHANNEL_KEY: CHANNEL}
    for key, value in values.items():
        line = key + '=' + value + '\n'
        if matches[key]:
            lines[matches[key][0][0]] = line
        else:
            if lines and not lines[-1].endswith(('\n', '\r')):
                lines[-1] += '\n'
            lines.append(line)
    if ENV.read_bytes() != original or not unchanged(info):
        raise ValueError('Configuratie is tussentijds gewijzigd; niets opgeslagen.')
    temp_path = None
    try:
        fd, temp_path = tempfile.mkstemp(prefix='.besc-agent-', dir=ROOT)
        with os.fdopen(fd, 'wb') as target:
            os.fchown(target.fileno(), info.st_uid, info.st_gid)
            os.fchmod(target.fileno(), 0o600)
            target.write(''.join(lines).encode('utf-8'))
            target.flush()
            os.fsync(target.fileno())
        if ENV.read_bytes() != original or not unchanged(info):
            raise ValueError('Configuratie is tussentijds gewijzigd; niets opgeslagen.')
        os.replace(temp_path, ENV)
        temp_path = None
    finally:
        if temp_path is not None:
            os.unlink(temp_path)
    print('Token en kanaal opgeslagen. Eigenaar en rechten behouden. Geen herstart of agentrun uitgevoerd.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, UnicodeError, ValueError):
        # Do not print exceptions that might contain the supplied credential.
        print('Controle of opslag gestopt; geen geheimen weergegeven. Controleer configuratie en toegang.')
        raise SystemExit(1)
