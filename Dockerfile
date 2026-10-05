FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONUNBUFFERED=1 PORT=8080 HOST=0.0.0.0 DATA_DIR=/app/data
EXPOSE 8080
CMD ["python", "server.py"]
