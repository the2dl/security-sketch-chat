-- Create necessary tables
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rooms (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    secret_key VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    owner_id INTEGER REFERENCES users(id)
);

CREATE TABLE room_participants (
    id SERIAL PRIMARY KEY,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, user_id),
    active BOOLEAN NOT NULL DEFAULT TRUE

);

CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add after your existing tables
CREATE TABLE platform_settings (
    id SERIAL PRIMARY KEY,
    admin_key text NOT NULL,
    system_prompt text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    shown boolean DEFAULT false,
    evidence_processor_prompt text,
    sketch_operator_prompt text,
    ai_provider text DEFAULT 'gemini',
    ai_model_settings jsonb DEFAULT '{}',
    ai_provider_keys jsonb DEFAULT '{}',
    integration_keys jsonb DEFAULT '{"virustotal": "", "ipinfo": ""}'::jsonb,
    access_word text,
    access_word_set_at timestamp without time zone
);

-- Insert initial row
INSERT INTO platform_settings (
    id, 
    admin_key, 
    ai_provider, 
    ai_model_settings, 
    ai_provider_keys,
    integration_keys
)
VALUES (
    1, 
    '', 
    'gemini', 
    '{}', 
    '{}',
    '{"virustotal": "", "ipinfo": ""}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
