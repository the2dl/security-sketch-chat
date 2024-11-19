from abc import ABC, abstractmethod
import psycopg2
import os
import json
import logging
from time import sleep

class BaseAIProvider(ABC):
    def __init__(self):
        super().__init__()
        self.db_config = {
            'dbname': os.getenv('DB_NAME', 'security_sketch'),
            'user': os.getenv('DB_USER', 'sketch_user'),
            'password': os.getenv('DB_PASSWORD'),
            'host': os.getenv('DB_HOST', 'localhost'),
            'port': int(os.getenv('DB_PORT', 5432))
        }
        self.initialized = False

    def get_active_provider(self):
        """Get the currently configured AI provider from database"""
        try:
            with psycopg2.connect(**self.db_config) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT ai_provider
                        FROM platform_settings
                        LIMIT 1
                    """)
                    result = cur.fetchone()
                    return result[0] if result else 'gemini'  # Default to gemini if not set
        except Exception as e:
            logging.error(f"Error fetching active provider: {e}")
            return 'gemini'

    def wait_for_configuration(self, max_retries=None, retry_interval=60):
        """Wait for valid configuration in the database"""
        retries = 0
        while not self.initialized:
            try:
                active_provider = self.get_active_provider()
                provider_keys = self.get_provider_keys()
                
                if active_provider == 'azure':
                    azure_config = provider_keys.get('azure', {})
                    required_keys = ['api_key', 'api_version', 'endpoint', 'deployment']
                    if all(azure_config.get(key) for key in required_keys):
                        logging.info("Found valid Azure configuration")
                        if self.initialize_provider():
                            self.initialized = True
                            return True
                        else:
                            logging.error("Azure provider initialization failed")
                elif active_provider == 'gemini' and provider_keys.get('gemini'):
                    logging.info("Found Gemini configuration")
                    if self.initialize_provider():
                        self.initialized = True
                        return True
                    else:
                        logging.error("Gemini provider initialization failed")
                
                if max_retries and retries >= max_retries:
                    raise ValueError(f"Failed to initialize after {max_retries} attempts")
                
                logging.info(f"Waiting for {active_provider} provider configuration... (attempt {retries + 1})")
                sleep(retry_interval)
                retries += 1
                
            except Exception as e:
                logging.error(f"Error initializing provider: {e}")
                if max_retries and retries >= max_retries:
                    raise
                sleep(retry_interval)
                retries += 1

    @abstractmethod
    def initialize_provider(self):
        """Initialize the provider with configuration from database"""
        pass

    def get_provider_keys(self):
        try:
            with psycopg2.connect(**self.db_config) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT ai_provider_keys
                        FROM platform_settings
                        LIMIT 1
                    """)
                    result = cur.fetchone()
                    if result:
                        return result[0]
            return {}
        except Exception as e:
            logging.error(f"Error fetching provider keys: {e}")
            return {}

    @abstractmethod
    def generate_content(self, prompt, **kwargs):
        pass

    @abstractmethod
    def validate_configuration(self):
        pass 