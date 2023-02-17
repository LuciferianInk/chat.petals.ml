FROM nvidia/cuda:12.0.0-base-ubuntu22.04

MAINTAINER BigScience

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . ./

RUN pip install -r requirements.txt

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--threads", "100", "--timeout", "1000"]
