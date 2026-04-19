-- Enable pgvector for embedding storage/search.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE IF NOT EXISTS customers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    notes TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS appointments (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    start_time TIMESTAMP(3) NOT NULL,
    end_time TIMESTAMP(3) NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT appointments_customer_id_fkey
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT appointments_time_order_check
        CHECK (end_time > start_time),

    CONSTRAINT appointments_status_check
        CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'))
);

-- CreateTable
CREATE TABLE IF NOT EXISTS memories (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    preference_text TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT memories_customer_id_fkey
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS appointments_customer_id_idx ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS appointments_start_time_idx ON appointments(start_time);
CREATE INDEX IF NOT EXISTS memories_customer_id_idx ON memories(customer_id);

-- Vector index for semantic similarity search on customer preference embeddings.
CREATE INDEX IF NOT EXISTS memories_embedding_cosine_idx
    ON memories
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
