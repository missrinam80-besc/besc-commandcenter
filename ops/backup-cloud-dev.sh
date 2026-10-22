#!/usr/bin/env bash
# Read-only Cloud DEV export. Never performs a database restore or deployment.
set +x
set -Eeuo pipefail
umask 077

if [[ "${1:-}" == "--help" ]]; then
  echo 'Gebruik: bash ops/backup-cloud-dev.sh'
  echo 'Root op de DEV-server; vraagt het databasewachtwoord verborgen op.'
  echo 'Maakt een databasearchief en serverconfiguratiekopie buiten Git.'
  echo 'Storage-bestanden, externe documenten en herstelproef blijven afzonderlijk.'
  exit 0
fi
[[ $# == 0 ]] || { echo 'Onbekend argument. Gebruik --help.' >&2; exit 1; }
[[ $EUID == 0 ]] || { echo 'Voer dit uit als root op de DEV-server.' >&2; exit 1; }
app_dir='/opt/besc-dev/command-center'
cd -- "$app_dir"
[[ -f .env.production && -f docker-compose.server.yml ]] || { echo 'DEV-configuratie ontbreekt.' >&2; exit 1; }
command -v docker >/dev/null
command -v sha256sum >/dev/null
docker info >/dev/null

project_ref='sjvzrsmrtcxxtmaxigtn'
pg_host='aws-0-eu-central-1.pooler.supabase.com'
pg_user="postgres.$project_ref"
pg_image='postgres:17'
ca_file="$app_dir/ops/supabase-ca-2021.crt"
[[ -f "$ca_file" && ! -L "$ca_file" ]] || { echo 'Gecontroleerd Supabase CA-bestand ontbreekt.' >&2; exit 1; }
[[ "$(sha256sum "$ca_file" | cut -d ' ' -f 1)" == '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7' ]] || { echo 'Supabase CA-controle wijkt af.' >&2; exit 1; }
backup_root='/var/backups/besc-command-center/dev'
[[ ! -L "$backup_root" ]] || { echo 'Backupmap mag geen symlink zijn.' >&2; exit 1; }
install -d -m 700 -- "$backup_root"
backup_dir=$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
password_file=$(mktemp /root/besc-dev-pgpass.XXXXXX)
cleanup() { rm -f -- "$password_file"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

read -r -s -p 'Cloud DEV databasewachtwoord (invoer verborgen): ' database_password </dev/tty
printf '\n' >/dev/tty
[[ -n "$database_password" ]] || { echo 'Geen wachtwoord ingevoerd.' >&2; exit 1; }
# pgpass escapes backslashes before colons; password never appears in arguments.
database_password=${database_password//\\/\\\\}
database_password=${database_password//:/\\:}
printf '%s:5432:postgres:%s:%s\n' "$pg_host" "$pg_user" "$database_password" > "$password_file"
unset database_password
chmod 600 "$password_file"

pg_run() {
  docker run --rm --network host \
    --mount "type=bind,src=$password_file,dst=/run/besc.pgpass,readonly" \
    --mount "type=bind,src=$ca_file,dst=/run/supabase-ca.crt,readonly" \
    --mount "type=bind,src=$backup_dir,dst=/backup" \
    -e PGHOST="$pg_host" -e PGPORT=5432 -e PGDATABASE=postgres -e PGUSER="$pg_user" \
    -e PGPASSFILE=/run/besc.pgpass -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/run/supabase-ca.crt -e PGCONNECT_TIMEOUT=15 \
    -e 'PGOPTIONS=-c default_transaction_read_only=on' "$pg_image" "$@"
}

# Fail before exporting if this client cannot read the expected DEV schemas.
pg_run psql -X -v ON_ERROR_STOP=1 -Atc \
  "select current_setting('server_version'), (select count(*) from auth.users), (select count(*) from public.organization_members), (select count(*) from storage.objects);" \
  > "$backup_dir/source-counts.txt"
pg_run pg_dump --format=custom --file=/backup/database.dump.partial
pg_run pg_dumpall --roles-only --no-role-passwords --file=/backup/roles.sql.partial
pg_run pg_restore --list /backup/database.dump.partial > "$backup_dir/archive-contents.txt"
for entry in 'TABLE DATA public organization_members' 'TABLE DATA auth users' 'TABLE DATA storage objects'; do
  grep -Fq "$entry" "$backup_dir/archive-contents.txt" || { echo 'Vereiste gegevens ontbreken in het archief; geen succesvolle backup gemarkeerd.' >&2; exit 1; }
done
mv -- "$backup_dir/database.dump.partial" "$backup_dir/database.dump"
mv -- "$backup_dir/roles.sql.partial" "$backup_dir/roles.sql"
install -m 600 -- .env.production "$backup_dir/env.production.backup"
install -m 600 -- docker-compose.server.yml "$backup_dir/docker-compose.server.yml"
[[ ! -f Caddyfile ]] || install -m 600 -- Caddyfile "$backup_dir/Caddyfile"
git rev-parse HEAD > "$backup_dir/server-checkout-commit.txt"
docker compose -f docker-compose.server.yml images -q web > "$backup_dir/web-image-id.txt"
chmod 600 "$backup_dir"/*
(
  cd -- "$backup_dir"
  backup_files=(./*)
  sha256sum "${backup_files[@]}" > SHA256SUMS
  sha256sum --check SHA256SUMS >/dev/null
)
printf 'Databasearchief en configuratie geëxporteerd. Nog geen Storage-bestandsbackup of herstelproef.\n' > "$backup_dir/EXPORT_COMPLETE.txt"
echo "Export gecontroleerd: $backup_dir"
echo 'Bewaar een afgeschermde kopie buiten deze VPS. Deel de bestanden niet in chat of Git.'
echo 'Punt 4 blijft open tot Storage, off-server kopie en geïsoleerde herstelproef zijn gecontroleerd.'
