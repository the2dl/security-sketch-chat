import os
import json
import psycopg2
from datetime import datetime, timezone
import google.generativeai as genai
from time import sleep
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Configure Gemini API
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
genai.configure(api_key=GOOGLE_API_KEY)

# Database configuration
DB_CONFIG = {
    'dbname': 'security_sketch',
    'user': 'sketch_user',
    'password': 'f0audfh8389r3z',
    'host': 'localhost',
    'port': 5432
}

class SecuritySketchOperator:
    def __init__(self):
        self.model = genai.GenerativeModel('gemini-1.5-pro-002')
        self.last_processed_timestamps = {}
        self.processed_messages_file = 'processed_messages.json'
        self.processed_messages = self.load_processed_messages()
        
        # Load the last processed timestamps at initialization
        self.load_last_processed_timestamps()
        logging.info(f"Initialized with timestamps: {self.last_processed_timestamps}")

    def load_processed_messages(self):
        """Load set of processed message IDs"""
        try:
            if os.path.exists(self.processed_messages_file):
                with open(self.processed_messages_file, 'r') as f:
                    return set(json.load(f))
            return set()
        except Exception as e:
            logging.error(f"Error loading processed messages: {e}")
            return set()

    def save_processed_messages(self):
        """Save set of processed message IDs"""
        try:
            with open(self.processed_messages_file, 'w') as f:
                json.dump(list(self.processed_messages), f)
        except Exception as e:
            logging.error(f"Error saving processed messages: {e}")

    def is_message_processed(self, message_id):
        """Check if a message has been processed"""
        return message_id in self.processed_messages

    def mark_message_processed(self, message_id):
        """Mark a message as processed"""
        self.processed_messages.add(message_id)
        self.save_processed_messages()

    def load_last_processed_timestamps(self):
        """Load last processed timestamps from disk"""
        try:
            if os.path.exists('last_processed.json'):
                with open('last_processed.json', 'r') as f:
                    content = f.read().strip()
                    if content:  # Only try to load if file has content
                        self.last_processed_timestamps = json.loads(content)
                        logging.info(f"Loaded timestamps: {self.last_processed_timestamps}")
                    else:
                        self.last_processed_timestamps = {}
            else:
                self.last_processed_timestamps = {}
        except Exception as e:
            logging.error(f"Error loading timestamps: {e}")
            self.last_processed_timestamps = {}

    def save_last_processed_timestamps(self):
        """Save last processed timestamps to disk"""
        try:
            with open('last_processed.json', 'w') as f:
                json.dump(self.last_processed_timestamps, f, indent=2)
            logging.info(f"Saved timestamps: {self.last_processed_timestamps}")
        except Exception as e:
            logging.error(f"Error saving timestamps: {e}")

    def get_new_messages(self):
        """Fetch new messages from database since last processed timestamp"""
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cur = conn.cursor()

            messages_by_room = {}
            
            # Get all active rooms first
            cur.execute("""
                SELECT DISTINCT r.id, r.name 
                FROM rooms r 
                WHERE r.active = true
                """)
            
            rooms = cur.fetchall()
            logging.info(f"Found {len(rooms)} active rooms")

            for room_id, room_name in rooms:
                # Use the room-specific timestamp or default to very old date
                last_processed = self.last_processed_timestamps.get(str(room_id), '1970-01-01')
                logging.info(f"Checking room {room_name} (ID: {room_id}) for messages after {last_processed}")
                
                cur.execute("""
                    SELECT m.content, m.created_at, u.username
                    FROM messages m
                    JOIN users u ON m.user_id = u.id
                    WHERE m.room_id = %s AND m.created_at > %s::timestamp
                    ORDER BY m.created_at ASC
                    """, (room_id, last_processed))
                
                messages = cur.fetchall()
                if messages:
                    logging.info(f"Found {len(messages)} new messages in room {room_name}")
                    messages_by_room[room_id] = {
                        'name': room_name,
                        'messages': [
                            {
                                'content': msg[0],
                                'timestamp': msg[1].isoformat(),
                                'username': msg[2]
                            } for msg in messages
                        ]
                    }
                    # Update last processed timestamp for this room
                    self.last_processed_timestamps[str(room_id)] = messages[-1][1].isoformat()
                    # Save timestamps after each room update
                    self.save_last_processed_timestamps()

            cur.close()
            conn.close()
            return messages_by_room

        except Exception as e:
            logging.error(f"Database error: {e}")
            return {}

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

        {{"message": "DNS request to suspicious domain: malicious.ru", "datetime": "2024-10-16T08:00:00Z", "timestamp_desc": "DNS Activity", "domain": "malicious.ru", "observer_name": "alice"}}
        {{"message": "Suspicious outbound connection detected to 12.34.56.78 on port 8080", "datetime": "2024-10-16T08:05:00Z", "timestamp_desc": "Network Connection", "dest_ip": "12.34.56.78", "dest_port": "8080", "observer_name": "bob"}}
        {{"message": "Beaconing activity detected to C2 domain: badsite.com", "datetime": "2024-10-16T08:10:00Z", "timestamp_desc": "Network Security", "domain": "badsite.com", "observer_name": "charlie"}}
        {{"message": "Large file transfer (400GB) to external FTP server detected", "datetime": "2024-10-16T08:15:00Z", "timestamp_desc": "Data Loss Prevention", "dest_port": "21", "bytes_sent": "400000000000", "observer_name": "dave"}}    
        {{"message": "PowerShell execution with base64 encoded command detected", "datetime": "2024-10-16T08:20:00Z", "timestamp_desc": "Process Execution", "computer_name": "WORKSTATION01", "observer_name": "eve"}}        
        {{"message": "Multiple failed login attempts detected from IP 10.0.0.5", "datetime": "2024-10-16T08:25:00Z", "timestamp_desc": "Authentication", "source_ip": "10.0.0.5", "observer_name": "frank"}}
        {{"message": "Scheduled task created for persistence", "datetime": "2024-10-16T08:30:00Z", "timestamp_desc": "Scheduled Task Creation", "computer_name": "SERVER02", "observer_name": "grace"}}

        Important notes:
        1. Always include the observer_name (the person reporting the activity)
        2. Only include technical details (IPs, ports, protocols) that were explicitly mentioned in the message
        3. Include timestamp from when the message was sent
        4. Use appropriate timestamp_desc values like "Network Connection", "DNS Activity", "Network Security", "Data Loss Prevention", "Process Execution", "Authentication"
        5. If multiple indicators are mentioned in a single message, create separate entries for each
        6. If you see wording like "contain" or "network contain" and then a weird name like "ABC123" or "CPC1234" etc, these are most likely the hostname of the impacted machine. Use the computer_name field for this
        7. Always include relevant MITRE ATT&CK TTPs in square brackets at the end of the message field

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
                        # Split response into lines and validate each as JSON
                        for line in response_text.split('\n'):
                            line = line.strip()
                            if line:  # Skip empty lines
                                try:
                                    # Validate JSON
                                    json.loads(line)
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

    def write_to_jsonl(self, results, output_file='timesketch_events.jsonl'):
        """Write results to JSONL file"""
        if not results:
            return

        mode = 'a' if os.path.exists(output_file) else 'w'
        with open(output_file, mode) as f:
            for result in results:
                if result and isinstance(result, str) and result.strip():
                    try:
                        # Validate JSON
                        json.loads(result)
                        f.write(f"{result}\n")
                    except json.JSONDecodeError:
                        logging.error(f"Invalid JSON: {result}")

    def run(self, interval_minutes=5):
        """Main operation loop"""
        while True:
            try:
                logging.info("Fetching new messages...")
                messages_by_room = self.get_new_messages()
                
                if messages_by_room:
                    logging.info("Analyzing messages with Gemini...")
                    results = self.analyze_messages(messages_by_room)
                    
                    if results:
                        logging.info("Writing results to JSONL...")
                        self.write_to_jsonl(results)
                    
                    self.save_last_processed_timestamps()
                
                logging.info(f"Sleeping for {interval_minutes} minutes...")
                sleep(interval_minutes * 60)
                
            except Exception as e:
                logging.error(f"Error in main loop: {e}")
                sleep(60)  # Sleep for 1 minute on error before retrying

if __name__ == "__main__":
    operator = SecuritySketchOperator()
    operator.run()
