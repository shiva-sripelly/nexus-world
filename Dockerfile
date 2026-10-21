# One image: builds the React Three Fiber client, then serves it from the FastAPI game server.

FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY shared/ /app/shared/
COPY client/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY server/pyproject.toml server/
COPY server/nexus server/nexus
RUN pip install --no-cache-dir ./server
COPY shared/ shared/
COPY --from=client /app/client/dist client/dist
ENV NEXUS_STATIC_DIR=/app/client/dist \
    NEXUS_CONSTANTS=/app/shared/constants.json \
    PYTHONUNBUFFERED=1
WORKDIR /app/server
EXPOSE 8000
CMD ["uvicorn", "nexus.app:app", "--host", "0.0.0.0", "--port", "8000"]
