FROM postgres:18-trixie AS pgtools
FROM python:3.12-slim-trixie
# Matching pg_dump/pg_restore major for the existing staging Postgres 18, not a DB server.
COPY --from=pgtools /usr/lib/postgresql/18/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=pgtools /usr/lib/postgresql/18/bin/pg_restore /usr/local/bin/pg_restore
COPY --from=pgtools /usr/lib/x86_64-linux-gnu/libpq.so.5* /usr/lib/x86_64-linux-gnu/
RUN apt-get update && apt-get install -y --no-install-recommends liblz4-1 libzstd1 libgssapi-krb5-2 libldap2 libsasl2-2 \
    && rm -rf /var/lib/apt/lists/* && pg_dump --version && pg_restore --version
WORKDIR /app
COPY backend/v2/requirements.txt /app/backend/v2/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/v2/requirements.txt
COPY backend/__init__.py /app/backend/__init__.py
COPY backend/v2 /app/backend/v2
# No v9, legacy Bridge, frontend exporters, public files, or default users.
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python","-m","backend.v2.serve"]
