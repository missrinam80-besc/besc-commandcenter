#!/usr/bin/env bash
set -euo pipefail
# BESCSRVDEV /opt/besc-dev/command-center. Read only. No secrets or writes.
expected=/opt/besc-dev/command-center
[ "$(pwd -P)" = "$expected" ] || { echo "Ga naar $expected op BESCSRVDEV."; exit 1; }
echo 'Alleenlezende F4-voorcontrole; controleer de servernaam.'
hostname
df -h /opt/besc-dev
free -m
for container in command-center-web-1 besc-website-dev-website-1 command-center-caddy-1; do
  docker inspect "$container" --format '{{.Name}} | {{.Config.Image}} | {{.Image}} | {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}'
  image_id=$(docker inspect "$container" --format '{{.Image}}')
  docker image inspect "$image_id" --format '{{json .RepoDigests}}'
done
docker inspect besc-website-dev-website-1 --format '{{index .Config.Labels "com.docker.compose.project.config_files"}} | {{index .Config.Labels "com.docker.compose.project.working_dir"}}'
caddy_file=$(docker inspect command-center-caddy-1 --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
[ -f "$caddy_file" ] && sha256sum -- "$caddy_file"
docker exec command-center-web-1 node -e '
const e=process.env;
for(const k of ["BESC_CREATOR_PLATFORM_ENABLED","BESC_PLATFORM_INTAKE_ENABLED","BESC_PARTNER_PLATFORM_ENABLED","BESC_VACANCY_PLATFORM_ENABLED","BESC_PARTNER_DELEGATION_ENABLED","BESC_SITE_PAGES_ENABLED","BESC_SITE_REDIRECTS_ENABLED","BESC_GENERAL_CONTACT_ENABLED","BESC_REWARDS_ACTIVITY_ENABLED","BESC_REWARDS_PREVIEW_ENABLED","BESC_REWARDS_INTAKE_ENABLED","BESC_SLOT_DISCORD_NOTIFICATIONS_ENABLED","BESC_CAMPAIGNS_PILOT_ENABLED","BESC_CAMPAIGNS_ENABLED","BESC_CAMPAIGN_TWITCH_COLLECTION_ENABLED"])console.log(k+" uit:",e[k]!=="true");
console.log("Twitchkoppeling aan:",e.BESC_TWITCH_IDENTITY_LINKING_ENABLED==="true");'
docker exec besc-website-dev-website-1 node -e '
for(const k of ["BESC_CREATOR_PLATFORM_ENABLED","BESC_PLATFORM_INTAKE_ENABLED","BESC_PARTNER_PLATFORM_ENABLED","BESC_VACANCY_PLATFORM_ENABLED","BESC_PARTNER_DELEGATION_ENABLED","BESC_SITE_PAGES_ENABLED","BESC_SITE_REDIRECTS_ENABLED","BESC_GENERAL_CONTACT_ENABLED"])console.log(k+" uit:",process.env[k]!=="true");'
echo 'Voorcontrole voltooid; dit is geen uitrolvrijgave.'
