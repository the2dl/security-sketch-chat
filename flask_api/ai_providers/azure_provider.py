import os
from openai import AzureOpenAI
from .base_provider import BaseAIProvider
import logging
import json

class AzureOpenAIProvider(BaseAIProvider):
    def __init__(self):
        super().__init__()
        provider_keys = self.get_provider_keys()
        azure_keys = provider_keys.get('azure', {})
        
        self.client = AzureOpenAI(
            api_key=azure_keys.get('api_key'),
            api_version=azure_keys.get('api_version'),
            azure_endpoint=azure_keys.get('endpoint')
        )
        self.deployment_name = azure_keys.get('deployment')
        
        # Default configurations
        self.default_config = {
            "temperature": 0.1,
            "max_tokens": 2048,
            "top_p": 1,
            "frequency_penalty": 0,
            "presence_penalty": 0
        }

    def generate_content(self, prompt, **kwargs):
        try:
            # Merge default configs with any provided kwargs
            config = {
                **self.default_config,
                **{k: v for k, v in kwargs.items() if k in self.default_config}
            }
            
            response = self.client.chat.completions.create(
                model=self.deployment_name,
                messages=[
                    {"role": "system", "content": "You are a security analysis assistant. You analyze content and provide detailed security insights in JSON format."},
                    {"role": "user", "content": prompt}
                ],
                **config
            )
            
            response_text = response.choices[0].message.content.strip()
            
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
            
        except Exception as e:
            logging.error(f"Azure OpenAI generation error: {e}")
            raise

    def validate_configuration(self):
        required_vars = [
            "AZURE_OPENAI_API_KEY",
            "AZURE_OPENAI_ENDPOINT",
            "AZURE_OPENAI_DEPLOYMENT",
            "AZURE_OPENAI_API_VERSION"
        ]
        return all(os.getenv(var) for var in required_vars) 

    def initialize_provider(self):
        """Initialize the provider with configuration from database"""
        try:
            provider_keys = self.get_provider_keys()
            azure_keys = provider_keys.get('azure', {})
            
            # Log the keys we found (safely)
            logging.info(f"Initializing Azure provider with keys: {', '.join(azure_keys.keys())}")
            
            # Validate all required keys are present and non-empty
            required_keys = ['api_key', 'api_version', 'endpoint', 'deployment']
            missing_keys = [key for key in required_keys if not azure_keys.get(key)]
            
            if missing_keys:
                logging.error(f"Missing required Azure configuration keys: {missing_keys}")
                return False
            
            logging.info("Creating Azure OpenAI client...")
            self.client = AzureOpenAI(
                api_key=azure_keys['api_key'],
                api_version=azure_keys['api_version'],
                azure_endpoint=azure_keys['endpoint']
            )
            self.deployment_name = azure_keys['deployment']
            
            # Test the configuration with a simple completion
            try:
                logging.info(f"Testing Azure configuration with deployment: {self.deployment_name}")
                response = self.client.chat.completions.create(
                    model=self.deployment_name,
                    messages=[{"role": "user", "content": "test"}],
                    max_tokens=5
                )
                logging.info("Azure OpenAI test response received successfully")
                logging.info("Azure OpenAI configuration validated successfully")
                return True
            except Exception as e:
                logging.error(f"Azure OpenAI configuration test failed: {str(e)}")
                logging.error("Full error details:", exc_info=True)
                return False
            
        except Exception as e:
            logging.error(f"Error initializing Azure provider: {str(e)}")
            logging.error("Full error details:", exc_info=True)
            return False 