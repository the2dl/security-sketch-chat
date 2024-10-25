#!/bin/bash

# Run the expect script to configure timesketch
/configure_timesketch.exp

# Create log files
mkdir -p /app/logs
FLASK_LOG="/app/logs/flask.log"
OPERATOR_LOG="/app/logs/operator.log"

# Function to start the Flask API
start_flask_api() {
    echo "Starting Flask API..."
    cd /app
    python -m flask_api.app > "$FLASK_LOG" 2>&1 &
    FLASK_PID=$!
    echo "Flask API started with PID: $FLASK_PID"
}

# Function to start the Security Sketch Operator
start_security_operator() {
    echo "Starting Security Sketch Operator..."
    cd /app
    python flask_api/security_sketch_operator.py > "$OPERATOR_LOG" 2>&1 &
    OPERATOR_PID=$!
    echo "Security Sketch Operator started with PID: $OPERATOR_PID"
}

# Function to tail logs
tail_logs() {
    tail -f "$FLASK_LOG" "$OPERATOR_LOG" &
    TAIL_PID=$!
}

# Function to handle shutdown
cleanup() {
    echo "Shutting down services..."
    kill $FLASK_PID $OPERATOR_PID $TAIL_PID 2>/dev/null
    exit 0
}

# Set up signal handling
trap cleanup SIGTERM SIGINT

# Start services
start_flask_api
start_security_operator

# Start tailing logs
tail_logs

# Wait for all processes
wait $FLASK_PID $OPERATOR_PID
