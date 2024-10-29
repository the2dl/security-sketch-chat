# Use official Python base image
FROM python:3.9-slim

# Install expect and create non-privileged user
RUN apt-get update && \
    apt-get install -y expect && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -m -s /bin/bash tsuser

# Install dependencies
RUN pip3 install timesketch-cli-client flask flask-cors psycopg2-binary \
    google-generativeai python-dotenv requests

# Create necessary directories
RUN mkdir -p /app/flask_api /app/sketch_files /app/logs && \
    chown -R tsuser:tsuser /app

# Copy application files
COPY configure_timesketch.exp /configure_timesketch.exp
COPY entrypoint.sh /entrypoint.sh
COPY flask_api /app/flask_api/
COPY security_sketch_operator.py /app/flask_api/security_sketch_operator.py
COPY evidence_processor.py /app/flask_api/evidence_processor.py

# Set permissions
RUN chmod +x /configure_timesketch.exp /entrypoint.sh && \
    chown -R tsuser:tsuser /app

# Set working directory
WORKDIR /app

# Switch to non-privileged user
USER tsuser

# Expose Flask port
EXPOSE 5001

# Use entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
