FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SUMO_HOME=/usr/share/sumo \
    SUMO_BINARY=/usr/bin/sumo \
    SUMO_CONFIG=/app/sumo/config/smartflow.sumocfg

RUN apt-get update \
    && apt-get install -y --no-install-recommends sumo sumo-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY sumo ./sumo

RUN test -x /usr/bin/sumo \
    && test -d /usr/share/sumo/tools \
    && test -f /app/sumo/config/smartflow.sumocfg

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
