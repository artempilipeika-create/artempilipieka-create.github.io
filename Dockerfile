FROM python:3.12-slim
WORKDIR /app
COPY backend/v2/requirements.txt /app/backend/v2/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/v2/requirements.txt
COPY backend/__init__.py /app/backend/__init__.py
COPY backend/v2 /app/backend/v2
# Deliberately do not package v9, legacy Bridge, frontend exporters or public files.
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh","-c","python -m backend.v2.migrate && if [ \"${MF_STAGE01_PROBE_MODE:-off}\" = \"create\" ]; then python -m backend.v2.probe create --manifest /mf-private/stage01-probe.json; elif [ \"${MF_STAGE01_PROBE_MODE:-off}\" = \"verify\" ]; then python -m backend.v2.probe verify --manifest /mf-private/stage01-probe.json; fi && exec python -m uvicorn backend.v2.app:create_app --factory --host 0.0.0.0 --port ${PORT:-8000}"]
