-- ==============================================================================
-- Schema Migration: Chatwoot Campaign Hub
-- Compatible with PostgreSQL 14+
-- ==============================================================================

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Chatwoot Connections
CREATE TABLE IF NOT EXISTS chatwoot_connections (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    account_id INTEGER NOT NULL,
    encrypted_token TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. OpenAI Settings
CREATE TABLE IF NOT EXISTS openai_settings (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'default',
    encrypted_api_key TEXT,
    model VARCHAR(50) DEFAULT 'gpt-4o-mini',
    default_count INTEGER DEFAULT 5,
    default_prompt TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Contact Lists
CREATE TABLE IF NOT EXISTS contact_lists (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    contact_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Contacts
CREATE TABLE IF NOT EXISTS contacts (
    id VARCHAR(64) PRIMARY KEY,
    list_id VARCHAR(64) REFERENCES contact_lists(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    custom_attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_list_id ON contacts(list_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);

-- 6. Message Templates
CREATE TABLE IF NOT EXISTS message_templates (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    connection_id VARCHAR(64) REFERENCES chatwoot_connections(id) ON DELETE SET NULL,
    connection_name VARCHAR(150) NOT NULL,
    inbox_id INTEGER NOT NULL,
    inbox_name VARCHAR(150) NOT NULL,
    status VARCHAR(30) DEFAULT 'Rascunho',
    min_delay_seconds INTEGER DEFAULT 15,
    max_delay_seconds INTEGER DEFAULT 35,
    batch_size INTEGER DEFAULT 50,
    total_contacts INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    pending_count INTEGER DEFAULT 0,
    base_message TEXT NOT NULL,
    contact_list_id VARCHAR(64) REFERENCES contact_lists(id) ON DELETE SET NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- 8. Campaign Variations
CREATE TABLE IF NOT EXISTS campaign_variations (
    id VARCHAR(64) PRIMARY KEY,
    campaign_id VARCHAR(64) REFERENCES campaigns(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    order_index INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_campaign_variations_campaign_id ON campaign_variations(campaign_id);

-- 9. Campaign Contacts (Queue items)
CREATE TABLE IF NOT EXISTS campaign_contacts (
    id VARCHAR(64) PRIMARY KEY,
    campaign_id VARCHAR(64) REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    custom_attributes JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'pendente',
    message_sent TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    chatwoot_conversation_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_queue ON campaign_contacts(campaign_id, status);

-- 10. Campaign Logs (Audit / History)
CREATE TABLE IF NOT EXISTS campaign_logs (
    id VARCHAR(64) PRIMARY KEY,
    campaign_id VARCHAR(64) REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    message_content TEXT NOT NULL,
    channel_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    error_details TEXT,
    chatwoot_conversation_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign_id ON campaign_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_status ON campaign_logs(status);

-- Seed initial temporary user 'Edgard' with hashed password 'edgard@123'
-- Salt: dc21b8c6e26c6d0427c34b6bfa1284a2
-- Hash: PBKDF2-SHA512
INSERT INTO users (id, username, password_hash, created_at, updated_at)
VALUES (
    'usr_edgard_initial',
    'Edgard',
    'dc21b8c6e26c6d0427c34b6bfa1284a2:79c135508a8d0da0f2e0c1f54d36ef55bf3e9f6583995aa42d45b4c10aa2aeeb15a13778c18ec6287cfb62e497fba9ad797430545f4924192b0fa1ca49e54d5b',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (username) DO NOTHING;
