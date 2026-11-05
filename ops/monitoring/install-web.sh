#!/usr/bin/env bash
set +x
set -Eeuo pipefail
umask 077
if [[ ${1:-} == --help ]]; then echo 'Install bounded read-only web monitoring, a five-minute timer and journal size limits. No backups, cleanup, app restart or outgoing mail.';exit 0;fi
[[ $# == 1 && $EUID == 0 && $(hostname -s) == BESCSRVDEV ]] || { echo 'Vereist root op BESCSRVDEV en een organisatie-ID.' >&2;exit 1; }
org=$1
[[ $org =~ ^[a-f0-9-]{36}$ ]] || exit 1
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
sha256sum -c SHA256SUMS
exec 9>/run/lock/besc-operations-install.lock
flock -n 9 || exit 1
for path in /etc/besc/operations.json /etc/systemd/system/besc-operations.service /etc/systemd/system/besc-operations.timer /etc/systemd/journald.conf.d/60-besc-operations.conf /usr/local/lib/besc-operations/collect.py;do
 [[ ! -e $path && ! -L $path ]] || { echo 'Bestaande OP01-inrichting gevonden; eerst beoordelen.' >&2;exit 1; }
done
for tool in python3 docker systemctl systemd-analyze install;do command -v "$tool" >/dev/null;done
[[ $(docker inspect command-center-web-1 --format '{{.State.Health.Status}}') == healthy && $(docker inspect besc-website-dev-website-1 --format '{{.State.Health.Status}}') == healthy ]]
before=$(docker inspect command-center-web-1 besc-website-dev-website-1 command-center-caddy-1 --format '{{.Id}}|{{.Image}}|{{.State.StartedAt}}')
before_files=$(sha256sum /opt/besc-dev/command-center/.env.production /opt/besc-dev/command-center/docker-compose.server.yml /opt/besc-dev/command-center/ops/Caddyfile /opt/besc-dev/website/.env.production /opt/besc-dev/website/compose.dev.yml)
install -d -m 700 /var/lib/besc-operations /var/lib/besc-operations/docker-config /var/backups/besc-command-center/op01-install
state=$(mktemp -d /var/backups/besc-command-center/op01-install/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX)
printf '%s\n' "$before" > "$state/containers-before.txt"
printf '%s\n' "$before_files" > "$state/config-before.txt"
rollback(){
 trap - ERR
 systemctl disable --now besc-operations.timer 2>/dev/null || true
 systemctl stop besc-operations.service 2>/dev/null || true
 rm -f -- /etc/systemd/system/besc-operations.service /etc/systemd/system/besc-operations.timer /etc/systemd/journald.conf.d/60-besc-operations.conf /etc/besc/operations.json /usr/local/lib/besc-operations/collect.py /usr/local/lib/besc-operations/upload.cjs /usr/local/lib/besc-operations/probe-bot.sh
 systemctl daemon-reload
 systemctl restart systemd-journald
 printf '%s\n' 'installation failed; monitor files removed; app configuration retained; inspect before retry' > "$state/state.txt"
 echo "Installatie niet afgerond; apps behouden. Bewijs: $state" >&2
 exit 1
}
trap rollback ERR
install -d -m 755 /usr/local/lib/besc-operations /etc/systemd/journald.conf.d
[[ ! -L /etc/besc ]]
if [[ ! -d /etc/besc ]];then install -d -m 700 /etc/besc;fi
install -m 755 collect.py probe-bot.sh /usr/local/lib/besc-operations/
install -m 644 upload.cjs /usr/local/lib/besc-operations/
python3 - "$org" > /etc/besc/operations.json <<'PY_CONFIG'
import json,sys
print(json.dumps({'organization_id':sys.argv[1],'target':'web','containers':{'container_cc':'command-center-web-1','container_website':'besc-website-dev-website-1','container_caddy':'command-center-caddy-1'},'http':{'http_cc':{'container':'command-center-web-1','path':'/login'},'http_website':{'container':'besc-website-dev-website-1','path':'/api/health'}},'https':{'https_cc':'https://cc-dev.belgianstreamerscommunity.be/login','https_website':'https://website-dev.belgianstreamerscommunity.be/login'},'uploader_container':'command-center-web-1'},indent=2))
PY_CONFIG
chmod 600 /etc/besc/operations.json
install -m 644 besc-operations.service besc-operations.timer /etc/systemd/system/
install -m 644 60-besc-operations.conf /etc/systemd/journald.conf.d/
systemd-analyze verify /etc/systemd/system/besc-operations.service /etc/systemd/system/besc-operations.timer
systemctl daemon-reload
systemctl restart systemd-journald
systemctl start besc-operations.service
systemctl enable --now besc-operations.timer
[[ $(systemctl is-enabled besc-operations.timer) == enabled && $(systemctl is-active besc-operations.timer) == active ]]
[[ $(docker inspect command-center-web-1 besc-website-dev-website-1 command-center-caddy-1 --format '{{.Id}}|{{.Image}}|{{.State.StartedAt}}') == "$before" ]]
[[ $(sha256sum /opt/besc-dev/command-center/.env.production /opt/besc-dev/command-center/docker-compose.server.yml /opt/besc-dev/command-center/ops/Caddyfile /opt/besc-dev/website/.env.production /opt/besc-dev/website/compose.dev.yml) == "$before_files" ]]
printf '%s\n' 'web monitor installed; first upload passed; timer active; journal bounded; application containers and configuration unchanged; no backup timer or cleanup installed' > "$state/state.txt"
trap - ERR
printf 'OP01-bewaking actief: true\nAppcontainers en instellingen behouden: true\nDagelijkse back-ups niet ingesteld: true\nBewijs: %s\n' "$state"
systemctl show besc-operations.service -p Result -p ExecMainStatus
systemctl list-timers besc-operations.timer --no-pager
