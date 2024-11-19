import os
import google.generativeai as genai
from .base_provider import BaseAIProvider
import logging
import json
import psycopg2

class GeminiProvider(BaseAIProvider):
    def __init__(self):
        super().__init__()
        self.api_key = None
        self.model_name = None
        self.model = None
        
        # Default configurations
        self.default_generation_config = {
            "temperature": 0.1,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 2048,
        }
        
        self.default_safety_settings = [
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

    def initialize_provider(self):
        """Initialize the provider with configuration from database"""
        try:
            provider_keys = self.get_provider_keys()
            settings = self.get_model_settings()
            
            self.api_key = provider_keys.get('gemini', '')
            self.model_name = settings.get('model_name', 'gemini-1.5-pro-002')
            
            if not self.api_key:
                logging.info("Gemini API key not found in database")
                return False
                
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel(self.model_name)
            return True
            
        except Exception as e:
            logging.error(f"Error initializing Gemini provider: {e}")
            return False

    def get_model_settings(self):
        """Fetch model settings from database"""
        try:
            with psycopg2.connect(**self.db_config) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT ai_model_settings
                        FROM platform_settings
                        WHERE ai_provider = 'gemini'
                        LIMIT 1
                    """)
                    result = cur.fetchone()
                    if result and result[0]:
                        return result[0]
            return {}
        except Exception as e:
            logging.error(f"Error fetching model settings: {e}")
            return {}

    def generate_content(self, prompt, **kwargs):
        if not self.initialized:
            self.wait_for_configuration()
        try:
            # Merge default configs with any provided kwargs
            generation_config = {
                **self.default_generation_config,
                **kwargs.get('generation_config', {})
            }
            
            safety_settings = kwargs.get('safety_settings', self.default_safety_settings)
            
            response = self.model.generate_content(
                prompt,
                generation_config=generation_config,
                safety_settings=safety_settings
            )
            
            if response.candidates:
                response_text = response.candidates[0].content.parts[0].text.strip()
                
                # Handle JSON validation if needed
                if kwargs.get('validate_json', False):
                    lines = response_text.split('\n')
                    valid_lines = []
                    for line in lines:
                        line = line.strip()
                        if line and line != "Regular chat: no sketch update":
                            try:
                                json.loads(line)  # Validate JSON
                                valid_lines.append(line)
                            except json.JSONDecodeError:
                                logging.error(f"Invalid JSON line: {line}")
                                continue
                    return '\n'.join(valid_lines)
                
                return response_text
            return None
            
        except Exception as e:
            logging.error(f"Gemini generation error: {e}")
            raise

    def validate_configuration(self):
        return bool(self.api_key and self.model_name) 