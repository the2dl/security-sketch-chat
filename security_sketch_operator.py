import os
import json
import psycopg2
from datetime import datetime, timezone
import google.generativeai as genai
from time import sleep
import logging
import subprocess
import uuid
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] SecuritySketchOperator: %(message)s',
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
    'application_name': 'SecuritySketchOperator'
}

# Validate DB configuration
if not DB_CONFIG['password']:
    raise ValueError("DB_PASSWORD not found in environment variables")

class SecuritySketchOperator:
    def __init__(self):
        self.model = genai.GenerativeModel(os.getenv('GEMINI_MODEL', 'gemini-1.5-pro-002'))
        self.last_processed_timestamps = {}
        self.output_dir = os.getenv('OUTPUT_DIR', 'sketch_files')
        
        # Create output directory if it doesn't exist
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Initialize database table for processed messages
        self.init_processed_messages_table()
        
        logging.info(f"Initialized SecuritySketchOperator")

        # Validate API key on initialization
        if not os.getenv('API_KEY'):
            raise ValueError("API_KEY not found in environment variables")
            
        self.api_key = os.getenv('API_KEY')

    def init_processed_messages_table(self):
        """Initialize the database tables"""
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()
            
            # Create table for processed messages
            cur.execute("""
                CREATE TABLE IF NOT EXISTS processed_messages (
                    message_id TEXT PRIMARY KEY,
                    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create table for last processed timestamps
            cur.execute("""
                CREATE TABLE IF NOT EXISTS last_processed_timestamps (
                    room_id TEXT PRIMARY KEY,
                    last_timestamp TIMESTAMP WITH TIME ZONE,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            conn.commit()
            
        except Exception as e:
            logging.error(f"Error initializing database tables: {e}")
            raise
        finally:
            if 'cur' in locals():
                cur.close()
            if 'conn' in locals():
                conn.close()

    def get_last_processed_timestamp(self, room_id):
        """Get last processed timestamp for a room from database"""
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()
            
            cur.execute("""
                SELECT last_timestamp 
                FROM last_processed_timestamps 
                WHERE room_id = %s
            """, (str(room_id),))
            
            result = cur.fetchone()
            return result[0].isoformat() if result and result[0] else '1970-01-01'
            
        except Exception as e:
            logging.error(f"Error getting last processed timestamp: {e}")
            return '1970-01-01'
        finally:
            if 'cur' in locals():
                cur.close()
            if 'conn' in locals():
                conn.close()

    def update_last_processed_timestamp(self, room_id, timestamp):
        """Update last processed timestamp for a room in database"""
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()
            
            cur.execute("""
                INSERT INTO last_processed_timestamps (room_id, last_timestamp)
                VALUES (%s, %s)
                ON CONFLICT (room_id) 
                DO UPDATE SET 
                    last_timestamp = EXCLUDED.last_timestamp,
                    updated_at = CURRENT_TIMESTAMP
            """, (str(room_id), timestamp))
            
            conn.commit()
            logging.info(f"Updated last processed timestamp for room {room_id}: {timestamp}")
            
        except Exception as e:
            logging.error(f"Error updating last processed timestamp: {e}")
        finally:
            if 'cur' in locals():
                cur.close()
            if 'conn' in locals():
                conn.close()

    def is_message_processed(self, message_id):
        """Check if a message has been processed using database"""
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()
            
            cur.execute("""
                SELECT EXISTS(
                    SELECT 1 FROM processed_messages 
                    WHERE message_id = %s
                )
            """, (str(message_id),))
            
            return cur.fetchone()[0]
            
        except Exception as e:
            logging.error(f"Error checking processed message: {e}")
            return False
        finally:
            if 'cur' in locals():
                cur.close()
            if 'conn' in locals():
                conn.close()

    def mark_message_processed(self, message_id):
        """Mark a message as processed in database"""
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()
            
            cur.execute("""
                INSERT INTO processed_messages (message_id)
                VALUES (%s)
                ON CONFLICT (message_id) DO NOTHING
            """, (str(message_id),))
            
            conn.commit()
            
        except Exception as e:
            logging.error(f"Error marking message as processed: {e}")
        finally:
            if 'cur' in locals():
                cur.close()
            if 'conn' in locals():
                conn.close()

    def get_sketch_file_path(self, sketch_id):
        """Get the path for a sketch's JSONL file"""
        return os.path.join(self.output_dir, f"chat_sketch_{sketch_id}.jsonl")

    def import_to_timesketch(self, sketch_id, file_path):
        """Import JSONL file to Timesketch"""
        try:
            # Generate unique timeline name using UUID
            timeline_name = f"timeline_{datetime.now().strftime('%Y%m%d')}_{str(uuid.uuid4())[:8]}"
            
            command = f'timesketch --sketch {sketch_id} import --name "{timeline_name}" "{file_path}"'
            logging.info(f"Executing import command: {command}")
            
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                shell=True
            )
            
            if result.returncode == 0:
                logging.info(f"Successfully imported timeline {timeline_name} to sketch {sketch_id}")
                # Clean up the file after successful import
                os.remove(file_path)
                logging.info(f"Cleaned up file: {file_path}")
                return True
            else:
                logging.error(f"Import failed: {result.stderr}")
                return False
                
        except Exception as e:
            logging.error(f"Error importing to Timesketch: {e}")
            return False

    def write_to_jsonl(self, results, sketch_id):
        """Write results to sketch-specific JSONL file"""
        if not results:
            return False

        file_path = self.get_sketch_file_path(sketch_id)
        try:
            with open(file_path, 'a') as f:
                for result in results:
                    if result and isinstance(result, str) and result.strip():
                        try:
                            # Validate JSON
                            json.loads(result)
                            f.write(f"{result}\n")
                        except json.JSONDecodeError:
                            logging.error(f"Invalid JSON: {result}")
            return True
        except Exception as e:
            logging.error(f"Error writing to JSONL: {e}")
            return False

    def get_new_messages(self):
        """Fetch new messages from database since last processed timestamp"""
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()

            messages_by_room = {}
            
            cur.execute("""
                SELECT DISTINCT r.id, r.name, r.sketch_id 
                FROM rooms r 
                WHERE r.active = true
                """)
            
            rooms = cur.fetchall()
            logging.info(f"Found {len(rooms)} active rooms")

            for room_id, room_name, sketch_id in rooms:
                if not sketch_id:
                    logging.warning(f"Room {room_name} has no sketch_id, skipping")
                    continue

                last_processed = self.get_last_processed_timestamp(str(room_id))
                logging.info(f"Checking room {room_name} (ID: {room_id}, Sketch ID: {sketch_id}) for messages after {last_processed}")
                
                cur.execute("""
                    SELECT m.id, m.content, m.created_at, u.username
                    FROM messages m
                    JOIN users u ON m.user_id = u.id
                    WHERE m.room_id = %s AND m.created_at > %s::timestamp
                    ORDER BY m.created_at ASC
                    """, (room_id, last_processed))
                
                messages = cur.fetchall()
                if messages:
                    new_messages = []
                    for msg in messages:
                        msg_id = str(msg[0])
                        if not self.is_message_processed(msg_id):
                            new_messages.append(msg)
                            self.mark_message_processed(msg_id)
                    
                    if new_messages:
                        logging.info(f"Processing {len(new_messages)} new messages in room {room_name}")
                        messages_by_room[room_id] = {
                            'name': room_name,
                            'sketch_id': sketch_id,
                            'messages': [
                                {
                                    'id': msg[0],
                                    'content': msg[1],
                                    'timestamp': msg[2].isoformat(),
                                    'username': msg[3]
                                } for msg in new_messages
                            ]
                        }
                        # Update the last processed timestamp in the database
                        self.update_last_processed_timestamp(str(room_id), new_messages[-1][2])
                    else:
                        logging.info(f"No new messages to process in room {room_name}")

            return messages_by_room

        except Exception as e:
            logging.error(f"Database error: {e}")
            return {}
        finally:
            if 'cur' in locals():
                cur.close()
            if 'conn' in locals():
                conn.close()

    def analyze_messages(self, messages_by_room):
        """Send messages to Gemini for analysis and get Timesketch format back"""
        if not messages_by_room:
            logging.info("No new messages to analyze")
            return []

        logging.info(f"Analyzing messages from {len(messages_by_room)} rooms")
        
        # Configure safety settings to allow security-related content
        generation_config = {
            "temperature": 0.1,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 2048,
        }

        safety_settings = [
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_HATE_SPEECH",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
                "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE",
            },
        ]

        prompt_template = '''
        You are a cyber security expert who is working with the tool Timesketch by Google. There is a new interface being created that allow users to talk in "plain english" and you will convert it into the proper timesketch format (.jsonl) to send off to timesketch later.

        Here are examples of how you would output:

        {{"message": "Suspicious domain: malicious.ru", "datetime": "2024-10-16T08:00:00Z", "timestamp_desc": "Network Connection", "domain": "malicious.ru", "observer_name": "alice"}}
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

        There may be times it's just "regular chat" and you don't need to convert anything, you need to make that decision. Your focus should be on turning indicators into timesketch, not worrying about common back and forth. If you decide it's regular chat, write back "Regular chat: no sketch update"

        Chat Room: {room_name}
        Messages:
        {messages}

        Your response should either be valid JSON lines or "Regular chat: no sketch update".
        '''

        results = []
        for room_id, room_data in messages_by_room.items():
            messages_text = "\n".join([
                f"{msg['username']} ({msg['timestamp']}): {msg['content']}"
                for msg in room_data['messages']
            ])

            try:
                prompt = prompt_template.format(
                    room_name=room_data['name'],
                    messages=messages_text
                )

                logging.info(f"Sending to Gemini - Room: {room_data['name']}")
                logging.info(f"Messages to analyze: {messages_text}")

                response = self.model.generate_content(
                    prompt,
                    generation_config=generation_config,
                    safety_settings=safety_settings
                )
                
                if response.candidates:
                    response_text = response.candidates[0].content.parts[0].text.strip()
                    logging.info(f"Gemini response: {response_text}")
                    
                    if "Regular chat: no sketch update" not in response_text:
                        # Process results as before
                        for line in response_text.split('\n'):
                            line = line.strip()
                            if line:
                                try:
                                    json.loads(line)  # Validate JSON
                                    results.append(line)
                                    logging.info(f"Added valid JSON result: {line}")
                                except json.JSONDecodeError as je:
                                    logging.error(f"Invalid JSON line: {line}")
                                    logging.error(f"JSON error: {je}")
                else:
                    logging.info("Gemini determined this was regular chat - no security content")
            except Exception as e:
                logging.error(f"Error processing room {room_data['name']}: {str(e)}")
                logging.error("Full error details: ", exc_info=True)

        logging.info(f"Total valid results to write: {len(results)}")
        return results

    def validate_api_key(self, provided_key):
        """Validate the provided API key"""
        return provided_key == self.api_key

    def run(self, interval_minutes=1):
        """Main operation loop"""
        if not self.validate_api_key(self.api_key):
            logging.error("Invalid API key. Exiting...")
            return

        logging.info("API key validated successfully")
        
        while True:
            try:
                logging.info("Fetching new messages...")
                messages_by_room = self.get_new_messages()
                
                for room_id, room_data in messages_by_room.items():
                    sketch_id = room_data['sketch_id']
                    logging.info(f"Processing room {room_data['name']} (Sketch ID: {sketch_id})")
                    
                    results = self.analyze_messages({room_id: room_data})
                    
                    if results:
                        file_path = self.get_sketch_file_path(sketch_id)
                        if self.write_to_jsonl(results, sketch_id):
                            # Import to Timesketch if we have new results
                            self.import_to_timesketch(sketch_id, file_path)
                
                logging.info(f"Sleeping for {interval_minutes} minutes...")
                sleep(interval_minutes * 60)
                
            except Exception as e:
                logging.error(f"Error in main loop: {e}")
                sleep(60)  # Sleep for 1 minute on error before retrying

if __name__ == "__main__":
    logging.info("=" * 80)
    logging.info("Starting Security Sketch Operator")
    logging.info("=" * 80)
    
    # Validate required environment variables
    required_vars = ['API_KEY', 'DB_PASSWORD', 'GOOGLE_API_KEY']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        logging.error(f"Missing required environment variables: {', '.join(missing_vars)}")
        exit(1)
    
    logging.info(f"Output directory: {os.getenv('OUTPUT_DIR', 'sketch_files')}")
    logging.info(f"Database host: {os.getenv('DB_HOST', 'localhost')}")
    logging.info(f"Database name: {os.getenv('DB_NAME', 'security_sketch')}")
    logging.info("Validating API key...")
    
    try:
        operator = SecuritySketchOperator()
        logging.info("Security Sketch Operator initialized successfully")
        logging.info("Starting main loop...")
        logging.info("=" * 80)
        operator.run()
    except ValueError as e:
        logging.error(f"Initialization error: {e}")
        exit(1)
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        exit(1)
