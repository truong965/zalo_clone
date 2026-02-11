-- CreateTable
CREATE TABLE "search_queries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "keyword" VARCHAR(255) NOT NULL,
    "search_type" VARCHAR(50) NOT NULL,
    "filters" JSONB,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "execution_time_ms" INTEGER NOT NULL,
    "clicked_result_id" VARCHAR(255),
    "clicked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_queries_user_id_created_at_idx" ON "search_queries"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "search_queries_keyword_search_type_idx" ON "search_queries"("keyword", "search_type");

-- CreateIndex
CREATE INDEX "search_queries_created_at_idx" ON "search_queries"("created_at" DESC);

-- CreateIndex
CREATE INDEX "search_queries_search_type_result_count_idx" ON "search_queries"("search_type", "result_count");

-- AddForeignKey
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
