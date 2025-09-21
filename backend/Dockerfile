# syntax=docker/dockerfile:1

# Use an official lightweight Python image
FROM python:3.11-slim

# Set envs for Python behavior
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Install system dependencies (build tools and runtime libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -m appuser
WORKDIR /app

# Copy requirements first to leverage Docker layer caching
COPY requirements.txt ./ 

# Upgrade pip and install deps
RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt

# Copy the application code
COPY app ./app

# Create static directory and fix permissions BEFORE switching user
RUN mkdir -p /app/app/static \
    && chown -R appuser:appuser /app

# Switch to non-root
USER appuser

# Expose the port uvicorn will listen on
EXPOSE 8000

# Start the FastAPI app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
