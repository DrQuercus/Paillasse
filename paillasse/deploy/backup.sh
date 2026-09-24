#!/usr/bin/env bash
# Sauvegarde de Paillasse : base PostgreSQL + pièces jointes, vers une destination HORS du serveur.
#
#   BACKUP_DEST=/mnt/nas/paillasse ./backup.sh          (disque monté : NAS, partage réseau…)
#   BACKUP_DEST=louis@zimaboard:/srv/backup/paillasse ./backup.sh   (rsync via SSH)
#
# Les pièces jointes sont stockées sous leur SHA-256 et ne sont jamais modifiées :
# la copie est incrémentale et ne supprime rien côté destination.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/paillasse}"
DEST="${BACKUP_DEST:?Définir BACKUP_DEST (chemin local ou utilisateur@hôte:/chemin)}"
KEEP_DUMPS="${KEEP_DUMPS:-30}"   # nombre de dumps conservés (destination locale uniquement)

set -a
# shellcheck disable=SC1091
source "$APP_DIR/server/.env"
set +a
DATA_DIR_ABS="$(cd "$APP_DIR/server" && realpath "${DATA_DIR:-../data}")"

STAMP="$(date +%Y-%m-%d_%H%M)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[$(date -Is)] Dump de la base…"
pg_dump --format=custom --no-owner --file "$WORK/paillasse_$STAMP.dump" "$DATABASE_URL"

echo "[$(date -Is)] Copie vers $DEST…"
if [[ "$DEST" == *:* ]]; then
  ssh "${DEST%%:*}" "mkdir -p '${DEST#*:}/db' '${DEST#*:}/blobs'"
else
  mkdir -p "$DEST/db" "$DEST/blobs"
fi
rsync -a "$WORK/paillasse_$STAMP.dump" "$DEST/db/"
rsync -a "$DATA_DIR_ABS/blobs/" "$DEST/blobs/"

if [[ "$DEST" != *:* ]]; then
  # garde les KEEP_DUMPS dumps les plus récents
  ls -1t "$DEST/db"/paillasse_*.dump 2>/dev/null | tail -n +"$((KEEP_DUMPS + 1))" | xargs -r rm -f
fi

echo "[$(date -Is)] Sauvegarde terminée : paillasse_$STAMP.dump"
