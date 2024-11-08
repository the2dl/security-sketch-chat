from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import json
import time
from datetime import datetime
import logging

# Add JsonFormatter class at the top level
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "component": "SecuritySketchAPI",
            "message": record.getMessage()
        }
        if hasattr(record, 'sketch_id'):
            log_obj['sketch_id'] = record.sketch_id
        if hasattr(record, 'sketch_name'):
            log_obj['sketch_name'] = record.sketch_name
        return json.dumps(log_obj)

# Configure logging
logging.basicConfig(level=logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter(datefmt='%Y-%m-%d %H:%M:%S'))
logging.getLogger().handlers = [handler]

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": "http://localhost:3001",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

def run_timesketch_command(command, expect_json=True):
    """Helper function to run timesketch commands and return output"""
    try:
        logger = logging.getLogger()
        logger.debug(f"Executing command: {command}")
        
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            shell=True
        )
        
        if result.returncode != 0:
            raise subprocess.CalledProcessError(
                result.returncode, 
                command, 
                result.stdout, 
                result.stderr
            )

        if expect_json:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON: {e}")
                logger.error(f"Raw output: {result.stdout}")
                raise
        else:
            return result.stdout.strip()
            
    except Exception as e:
        logger.error(f"Command error: {str(e)}")
        raise

@app.route('/api/sketch/create', methods=['POST'])
def create_sketch():
    try:
        data = request.json
        sketch_name = data.get('name')
        
        if not sketch_name:
            logging.error("Sketch name is required")
            return jsonify({'error': 'Sketch name is required'}), 400
        
        logging.info(f"Creating sketch with name: {sketch_name}")
        
        # Create sketch
        create_command = f'timesketch --output-format json sketch create --name "{sketch_name}"'
        result = run_timesketch_command(create_command, expect_json=False)
        
        # Get latest sketch ID
        list_command = 'timesketch --output-format json sketch list'
        sketches = run_timesketch_command(list_command, expect_json=True)
        
        # Find the newly created sketch (should be the highest ID)
        latest_sketch = max(sketches, key=lambda x: x['id'])
        sketch_id = latest_sketch['id']
        
        # Log with extra context
        logger = logging.getLogger()
        extra = {'sketch_id': sketch_id, 'sketch_name': sketch_name}
        logger.info(f"Created sketch: {sketch_name} (ID: {sketch_id})", extra=extra)
            
        return jsonify({
            'sketch_id': sketch_id,
            'name': sketch_name
        })
        
    except Exception as e:
        logging.error(f"Error creating sketch: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/sketch/import', methods=['POST'])
def import_timeline():
    data = request.json
    sketch_id = data.get('sketch_id')
    file_path = data.get('file_path')
    
    if not sketch_id or not file_path:
        return jsonify({'error': 'Sketch ID and file path are required'}), 400
    
    # Generate unique timeline name using timestamp
    timeline_name = f"timeline_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    import_command = f'timesketch --sketch {sketch_id} import --name "{timeline_name}" "{file_path}"'
    result = run_timesketch_command(import_command)
    
    if not result:
        return jsonify({'error': 'Failed to import timeline'}), 500
        
    return jsonify({
        'success': True,
        'timeline_name': timeline_name
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
