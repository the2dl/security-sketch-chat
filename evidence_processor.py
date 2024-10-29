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
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] EvidenceProcessor: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

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
        # Use host.docker.internal to access the host machine from inside the container
        self.api_url = os.getenv('API_URL', 'http://host.docker.internal:3000')
        self.api_key = os.getenv('API_KEY')
        
        # Create output directory if it doesn't exist
        os.makedirs(self.output_dir, exist_ok=True)

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

    def analyze_file(self, content, file_type, room_name):
        """Analyze file content using Gemini"""

        prompt_template = '''
        You are a cyber security expert who is working with the tool Timesketch by Google. There is a new interface being created that allow users to talk in "plain english" and you will convert it into the proper timesketch format (.jsonl) to send off to timesketch later.

        Here are examples of how you would output:

        {{"message": "DNS request to suspicious domain: malicious.ru", "datetime": "2024-10-16T08:00:00Z", "timestamp_desc": "DNS Activity", "domain": "malicious.ru", "observer_name": "alice"}}
        {{"message": "Suspicious outbound connection detected to 12.34.56.78 on port 8080", "datetime": "2024-10-16T08:05:00Z", "timestamp_desc": "Network Connection", "dest_ip": "12.34.56.78", "dest_port": "8080", "observer_name": "bob"}}
        {{"message": "Beaconing activity detected to C2 domain: badsite.com", "datetime": "2024-10-16T08:10:00Z", "timestamp_desc": "Network Security", "domain": "badsite.com", "observer_name": "charlie"}}
        {{"message": "Large file transfer (400GB) to external FTP server detected", "datetime": "2024-10-16T08:15:00Z", "timestamp_desc": "Data Loss Prevention", "dest_port": "21", "bytes_sent": "400000000000", "observer_name": "dave"}}    
        {{"message": "PowerShell execution with base64 encoded command detected", "datetime": "2024-10-16T08:20:00Z", "timestamp_desc": "Process Execution", "computer_name": "WORKSTATION01", "observer_name": "eve"}}        
        {{"message": "Multiple failed login attempts detected from IP 10.0.0.5", "datetime": "2024-10-16T08:25:00Z", "timestamp_desc": "Authentication", "source_ip": "10.0.0.5", "observer_name": "frank"}}
        {{"message": "Scheduled task created for persistence", "datetime": "2024-10-16T08:30:00Z", "timestamp_desc": "Scheduled Task Creation", "computer_name": "SERVER02", "observer_name": "grace"}}
        {{"message": "Malicious file detected with MD5 hash d41d8cd98f00b204e9800998ecf8427e", "datetime": "2024-10-16T08:35:00Z", "timestamp_desc": "File Hash", "md5_hash": "d41d8cd98f00b204e9800998ecf8427e", "observer_name": "henry"}}
        {{"message": "Suspicious executable found with SHA256 hash e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "datetime": "2024-10-16T08:40:00Z", "timestamp_desc": "File Hash", "sha256_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "observer_name": "ivy"}}
        {{"message": "Suspicious executable detected at C:\\ProgramData\\XCerfzz.exe [T1059.003]", "datetime": "2024-10-16T08:45:00Z", "timestamp_desc": "File Creation", "file_path": "C:\\ProgramData\\XCerfzz.exe", "computer_name": "WORKSTATION01", "observer_name": "jack"}}

        Example of message with multiple attributes that should create multiple entries:
        Message: "saw some weird processes like C:\\Windows\\System32\\ripFAULT.exe running with the hash 0c32215fbaf5e83772997a7891b1d2ad"
        Should create two entries:
        {{"message": "Suspicious process detected: C:\\Windows\\System32\\ripFAULT.exe [T1059]", "datetime": "2024-10-16T08:50:00Z", "timestamp_desc": "Process Execution", "file_path": "C:\\Windows\\System32\\ripFAULT.exe", "observer_name": "alice"}}
        {{"message": "Process hash identified: 0c32215fbaf5e83772997a7891b1d2ad [T1059]", "datetime": "2024-10-16T08:50:00Z", "timestamp_desc": "File Hash", "md5_hash": "0c32215fbaf5e83772997a7891b1d2ad", "observer_name": "alice"}}
        
        Important notes:
        1. Always include the observer_name (the person reporting the activity)
        2. Only include technical details (IPs, ports, protocols) that were explicitly mentioned in the message
        3. Include timestamp from when the message was sent
        4. Use appropriate timestamp_desc values like "Network Connection", "DNS Activity", "Network Security", "Data Loss Prevention", "Process Execution", "Authentication"
        5. If multiple indicators are mentioned in a single message (like file paths AND hashes, or IPs AND ports), create separate entries for each indicator while maintaining the relationship in the message field
        6. If you see wording like "contain" or "network contain" and then a weird name like "ABC123" or "CPC1234" etc, these are most likely the hostname of the impacted machine. Use the computer_name field for this
        7. Always include relevant MITRE ATT&CK TTPs in square brackets at the end of the message field
        8. For file hashes, use md5_hash and sha256_hash fields accordingly
        9. For file paths, use the file_path field and include the computer_name if available

        File Type: {file_type}
        Investigation: {room_name}
        Content:
        {content}

        Your response should either be valid JSON lines or "No security content found".
        '''


        try:
            content_sample = str(content[:50])  # Limit content for logging
            logging.info(f"Analyzing file for room: {room_name}")
            
            response = self.model.generate_content(
                prompt_template.format(
                    file_type=file_type,
                    room_name=room_name,
                    content=content
                )
            )

            if response.candidates:
                response_text = response.candidates[0].content.parts[0].text.strip()
                if "No security content found" not in response_text:
                    return [line.strip() for line in response_text.split('\n') if line.strip()]
            return []

        except Exception as e:
            logging.error(f"Error analyzing file: {e}")
            return []

    def mark_file_processed(self, file_id, error=None):
        """Mark file as processed in database"""
        try:
            with psycopg2.connect(**DB_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE uploaded_files 
                        SET processed = TRUE, 
                            processing_error = %s,
                            processed_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    """, (error, file_id))
                conn.commit()
        except Exception as e:
            logging.error(f"Error marking file {file_id} as processed: {e}")

    def process_file(self, file_id, room_id, sketch_id, file_type, room_name):
        """Process a single file"""
        temp_path = None
        try:
            # Download file to temporary location
            temp_path = self.download_file(file_id)
            if not temp_path:
                self.mark_file_processed(file_id, "Failed to download file")
                return

            # Read and process the file
            content = self.read_file_content(temp_path, file_type)
            if not content:
                self.mark_file_processed(file_id, "Failed to read file content")
                return

            results = self.analyze_file(content, file_type, room_name)
            if results:
                output_path = os.path.join(self.output_dir, f"evidence_{sketch_id}_{file_id}.jsonl")
                with open(output_path, 'w') as f:
                    for result in results:
                        try:
                            json.loads(result)  # Validate JSON
                            f.write(f"{result}\n")
                        except json.JSONDecodeError:
                            continue

                if self.import_to_timesketch(sketch_id, output_path):
                    self.mark_file_processed(file_id)
                else:
                    self.mark_file_processed(file_id, "Failed to import to Timesketch")
            else:
                self.mark_file_processed(file_id, "No security content found")

        except Exception as e:
            logging.error(f"Error processing file {file_id}: {e}")
            self.mark_file_processed(file_id, str(e))
        finally:
            # Clean up temporary file
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
    logging.info("=" * 80)
    logging.info("Starting Evidence Processor")
    logging.info("=" * 80)
    
    required_vars = ['API_KEY', 'DB_PASSWORD', 'GOOGLE_API_KEY']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        logging.error(f"Missing required environment variables: {', '.join(missing_vars)}")
        exit(1)
    
    try:
        processor = EvidenceProcessor()
        logging.info("Evidence Processor initialized successfully")
        logging.info("Starting main loop...")
        logging.info("=" * 80)
        processor.run()
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        exit(1) 