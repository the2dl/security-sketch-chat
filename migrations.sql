-- Add access control columns
DO $$
BEGIN
    -- Add access_word column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'platform_settings' 
        AND column_name = 'access_word'
    ) THEN
        ALTER TABLE platform_settings ADD COLUMN access_word text;
        ALTER TABLE platform_settings ADD COLUMN access_word_set_at timestamp without time zone;
    END IF;

    -- Insert initial row if not exists
    IF NOT EXISTS (SELECT 1 FROM platform_settings WHERE id = 1) THEN
        INSERT INTO platform_settings (id, admin_key, access_word, access_word_set_at)
        VALUES (1, '', NULL, NULL);
    END IF;
END
$$; 

-- Add AI provider columns
DO $$
BEGIN
    -- Add AI provider columns if they don't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'platform_settings' 
        AND column_name = 'ai_provider'
    ) THEN
        ALTER TABLE platform_settings ADD COLUMN ai_provider text DEFAULT 'gemini';
        ALTER TABLE platform_settings ADD COLUMN ai_model_settings jsonb DEFAULT '{}';
        ALTER TABLE platform_settings ADD COLUMN ai_provider_keys jsonb DEFAULT '{}';
    END IF;

    -- Insert initial row if not exists
    IF NOT EXISTS (SELECT 1 FROM platform_settings WHERE id = 1) THEN
        INSERT INTO platform_settings (id, admin_key, ai_provider, ai_model_settings, ai_provider_keys)
        VALUES (1, '', 'gemini', '{}', '{}');
    END IF;
END
$$; 