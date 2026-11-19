# Backup job image. pg_dump must be the same major version as the server (Railway runs Postgres 18).
FROM postgres:18-alpine
RUN apk add --no-cache bash coreutils aws-cli age curl
COPY backup.sh restore.sh /opt/backup/
RUN chmod 0755 /opt/backup/backup.sh /opt/backup/restore.sh
# Runs as the unprivileged postgres user, not root.
USER postgres
WORKDIR /tmp
ENTRYPOINT ["/opt/backup/backup.sh"]
