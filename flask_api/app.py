from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import json
import time
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

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
        logger.debug(f"Executing command: {command}")
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            shell=True
        )
        
        logger.debug(f"Command stdout: {result.stdout}")
        logger.debug(f"Command stderr: {result.stderr}")
        
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
            return jsonify({'error': 'Sketch name is required'}), 400
        
        logger.info(f"Creating sketch with name: {sketch_name}")
        
        # Step 1: Create sketch (don't expect JSON output)
        create_command = f'timesketch --output-format json sketch create --name "{sketch_name}"'
        result = run_timesketch_command(create_command, expect_json=False)
        logger.info(f"Create sketch result: {result}")
        
        # Step 2: List sketches to get ID
        list_command = 'timesketch --output-format json sketch list'
        sketches = run_timesketch_command(list_command, expect_json=True)
        logger.info(f"Sketches list: {sketches}")
        
        # Find the newly created sketch
        sketch_id = None
        for sketch in sketches:
            if sketch['name'] == sketch_name:
                sketch_id = sketch['id']
                break
        
        if not sketch_id:
            return jsonify({'error': 'Could not find created sketch'}), 500
            
        return jsonify({
            'sketch_id': sketch_id,
            'name': sketch_name
        })
        
    except Exception as e:
        logger.error(f"Error in create_sketch: {str(e)}")
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
