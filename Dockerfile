FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r /app/server/requirements.txt
COPY . /app
ENV PYTHONUNBUFFERED=1
EXPOSE 80
CMD ["python","-m","uvicorn","server.preview:app","--host","0.0.0.0","--port","80"]
