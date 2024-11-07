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