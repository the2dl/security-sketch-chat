import os
import json
import psycopg2
from datetime import datetime, timezone
import google.generativeai as genai
from time import sleep
import logging
import subprocess
import uuid
import csv
from dotenv import load_dotenv
import requests
import tempfile

# Load environment variables
load_dotenv()

# Configure logging
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "component": "EvidenceProcessor",
            "message": record.getMessage()
        }
        return json.dumps(log_obj)

logging.basicConfig(level=logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter(datefmt='%Y-%m-%d %H:%M:%S'))
logging.getLogger().handlers = [handler]

# Configure Gemini API
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY not found in environment variables")
genai.configure(api_key=GOOGLE_API_KEY)

# Database configuration from environment
DB_CONFIG = {
    'dbname': os.getenv('DB_NAME', 'security_sketch'),
    'user': os.getenv('DB_USER', 'sketch_user'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'application_name': 'EvidenceProcessor'
}

# Validate DB configuration
if not DB_CONFIG['password']:
    raise ValueError("DB_PASSWORD not found in environment variables")

class EvidenceProcessor:
    def __init__(self):
        self.model = genai.GenerativeModel(os.getenv('GEMINI_MODEL', 'gemini-1.5-pro-002'))
        self.output_dir = os.getenv('OUTPUT_DIR', 'sketch_files')
        self.api_url = os.getenv('API_URL', 'http://host.docker.internal:3000')
        self.api_key = os.getenv('API_KEY')
        self.evidence_processor_prompt = None
        
        # Create output directory if it doesn't exist
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Fetch initial prompt
        self.fetch_prompt()

    def fetch_prompt(self):
        """Fetch evidence processor prompt from database"""
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()
            
            cur.execute("""
                SELECT evidence_processor_prompt 
                FROM platform_settings 
                LIMIT 1
            """)
            
            result = cur.fetchone()
            if result and result[0]:
                self.evidence_processor_prompt = result[0]
                logging.info("Successfully loaded evidence processor prompt")
                return True
            else:
                logging.warning("No evidence processor prompt found in database yet")
                return False
            
        except Exception as e:
            logging.error(f"Error fetching evidence processor prompt: {e}")
            return False
        finally:
            if 'cur' in locals():
                cur.close()
            if 'conn' in locals():
                conn.close()

    def download_file(self, file_id):
        """Download file from API"""
        try:
            response = requests.get(
                f"{self.api_url}/api/files/download/{file_id}",
                headers={'x-api-key': self.api_key},
                stream=True
            )
            
            if response.status_code == 200:
                # Create temporary file
                with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            tmp_file.write(chunk)
                    return tmp_file.name
            else:
                logging.error(f"Failed to download file {file_id}: {response.status_code}")
                return None
                
        except Exception as e:
            logging.error(f"Error downloading file {file_id}: {e}")
            return None

    def read_file_content(self, file_path, file_type):
        """Read and parse file content based on type"""
        try:
            content = []
            with open(file_path, 'r') as f:
                if file_type == 'csv':
                    reader = csv.DictReader(f)
                    content = list(reader)
                elif file_type == 'tsv':
                    reader = csv.DictReader(f, delimiter='\t')
                    content = list(reader)
                else:  # txt files
                    content = f.readlines()
            return content
        except Exception as e:
            logging.error(f"Error reading file {file_path}: {e}")
            return None

    def analyze_file(self, content, file_type, room_name, uploader):
        """Analyze file content using Gemini"""
        # Refresh prompt before analysis
        self.fetch_prompt()
        
        if not self.evidence_processor_prompt:
            logging.error("No evidence processor prompt available")
            return []

        # Log the first part of the prompt to verify content
        logging.info(f"Prompt preview (first 200 chars): {self.evidence_processor_prompt[:200]}...")

        # First escape the JSON examples in the database prompt
        escaped_prompt = self.evidence_processor_prompt.replace("{", "{{").replace("}", "}}")

        prompt_template = f'''
        {escaped_prompt}

        File Type: {{file_type}}
        Investigation: {{room_name}}
        Observer: {{uploader}}
        Content:
        {{content}}

        Note: If a file does not appear to contain any security content, respond with "No security content found".

        Your response should either be valid JSON lines or "No security content found".
        '''

        try:
            content_sample = str(content[:100])  # Increased sample size for better context
            logging.info(f"Analyzing file for room: {room_name}")
            logging.info(f"File type: {file_type}")
            logging.info(f"Uploader: {uploader}")
            logging.info(f"Content preview: {content_sample}...")

            # Format the actual prompt being sent
            formatted_prompt = prompt_template.format(
                file_type=file_type,
                room_name=room_name,
                uploader=uploader,
                content=content
            )
            logging.info(f"Final formatted prompt preview (first 500 chars): {formatted_prompt[:500]}...")
            
            response = self.model.generate_content(formatted_prompt)

            if response.candidates:
                response_text = response.candidates[0].content.parts[0].text.strip()
                logging.info(f"Raw response preview (first 200 chars): {response_text[:200]}...")
                
                if "No security content found" in response_text:
                    logging.info("Analysis result: No security content found")
                    return []
                else:
                    results = [line.strip() for line in response_text.split('\n') if line.strip()]
                    logging.info(f"Number of JSON lines generated: {len(results)}")
                    logging.info(f"First result preview: {results[0] if results else 'No results'}")
                    return results
            else:
                logging.warning("No response candidates received from Gemini")
                return []

        except Exception as e:
            logging.error(f"Error analyzing file: {e}")
            logging.error(f"Full error details:", exc_info=True)
            return []

    def mark_file_processed(self, file_id, conn, error_message=None):
        """Mark file as processed in database"""
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE uploaded_files 
                    SET processed = TRUE,
                        processing_error = %s,
                        processed_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, [error_message, file_id])
                conn.commit()
        except Exception as e:
            logging.error(f"Error marking file {file_id} as processed: {e}")
            conn.rollback()

    def process_file(self, file_id, room_id, sketch_id, file_type, room_name):
        """Process a single file"""
        temp_path = None
        try:
            # Initialize database connection
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()
            
            # Get file details including uploader info
            cur.execute("""
                SELECT filename, file_path, uploader_username, uploader_team 
                FROM uploaded_files 
                WHERE id = %s
            """, [file_id])
            
            file_info = cur.fetchone()
            if not file_info:
                raise ValueError(f"File {file_id} not found")
                
            filename, file_path, uploader_username, uploader_team = file_info
            
            # Download and process the file
            temp_path = self.download_file(file_id)
            if not temp_path:
                raise ValueError(f"Failed to download file {file_id}")

            # Read file content
            with open(temp_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Analyze content using Gemini
            results = self.analyze_file(
                content=content,
                file_type=file_type,
                room_name=room_name,
                uploader=f"{uploader_username}@{uploader_team or 'sketch'}"
            )

            if results:
                # Create a new file with timestamp in name to prevent duplicates
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                output_path = os.path.join(self.output_dir, f"evidence_{sketch_id}_{file_id}_{timestamp}.jsonl")
                
                with open(output_path, 'w') as f:
                    for result in results:
                        try:
                            json.loads(result)  # Validate JSON
                            f.write(f"{result}\n")
                        except json.JSONDecodeError:
                            continue

                if self.import_to_timesketch(sketch_id, output_path):
                    self.mark_file_processed(file_id, conn)
                else:
                    self.mark_file_processed(file_id, conn, "Failed to import to Timesketch")
            else:
                self.mark_file_processed(file_id, conn, "No security content found")

        except Exception as e:
            logging.error(f"Error processing file {file_id}: {e}")
            if 'conn' in locals():
                self.mark_file_processed(file_id, conn, str(e))
        finally:
            # Clean up resources
            if 'cur' in locals():
                cur.close()
            if 'conn' in locals():
                conn.close()
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception as e:
                    logging.error(f"Error removing temporary file: {e}")

    def import_to_timesketch(self, sketch_id, file_path):
        """Import JSONL file to Timesketch"""
        try:
            timeline_name = f"evidence_{datetime.now().strftime('%Y%m%d')}_{str(uuid.uuid4())[:8]}"
            
            command = f'timesketch --sketch {sketch_id} import --name "{timeline_name}" "{file_path}"'
            logging.info(f"Executing import command: {command}")
            
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                shell=True
            )
            
            if result.returncode == 0:
                logging.info(f"Successfully imported timeline {timeline_name}")
                os.remove(file_path)
                return True
            else:
                logging.error(f"Import failed: {result.stderr}")
                return False
                
        except Exception as e:
            logging.error(f"Error importing to Timesketch: {e}")
            return False

    def get_unprocessed_files(self):
        """Fetch unprocessed files from database"""
        try:
            with psycopg2.connect(**DB_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT 
                            f.id,
                            f.room_id,
                            f.sketch_id,
                            f.file_type,
                            r.name as room_name
                        FROM uploaded_files f
                        JOIN rooms r ON f.room_id = r.id
                        WHERE f.processed = FALSE 
                        AND f.processing_error IS NULL
                        ORDER BY f.created_at ASC
                    """)
                    return cur.fetchall()
        except Exception as e:
            logging.error(f"Error fetching unprocessed files: {e}")
            return []

    def run(self, interval_minutes=1):
        """Main operation loop"""
        logging.info("Starting evidence processing loop")
        
        while True:
            try:
                # Check for prompt if we don't have one
                if not self.evidence_processor_prompt:
                    if self.fetch_prompt():
                        logging.info("Successfully retrieved prompt, continuing operation")
                    else:
                        logging.info("Still waiting for prompt to be configured...")
                        sleep(60)  # Wait a minute before checking again
                        continue

                files = self.get_unprocessed_files()
                for file_id, room_id, sketch_id, file_type, room_name in files:
                    logging.info(f"Processing file {file_id} for room {room_name}")
                    self.process_file(file_id, room_id, sketch_id, file_type, room_name)
                
                logging.info(f"Sleeping for {interval_minutes} minutes...")
                sleep(interval_minutes * 60)
                
            except Exception as e:
                logging.error(f"Error in main loop: {e}")
                sleep(60)

if __name__ == "__main__":
    logging.info("Starting Evidence Processor")
    
    required_vars = ['API_KEY', 'DB_PASSWORD', 'GOOGLE_API_KEY']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        logging.error(f"Missing required environment variables: {', '.join(missing_vars)}")
        exit(1)
    
    try:
        processor = EvidenceProcessor()
        logging.info("Evidence Processor initialized successfully")
        logging.info("Starting main loop...")
        processor.run()
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        exit(1) 