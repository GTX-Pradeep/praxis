# Semantic matching (vector database)

Praxis matches students to openings by **meaning**, not just keywords. A student whose repository is a "3D U-Net for BraTS tumour segmentation" matches an opening for "deep learning on brain MRI scans" even though they share almost no words.

## What is converted into embeddings

| Source | Text that is embedded | Stored in |
|---|---|---|
| Opening | title + domain + description + required skill names | `openings.embedding` |
| Resume | extracted resume text, split into ~180-word chunks; chunk vectors are averaged | `student_embeddings` (source = `resume`) |
| GitHub | each original (non-fork) repo: name, description, topics, languages, README excerpt | per-repo vector in MongoDB `github_profiles.repos[].embedding`; their weighted average in `student_embeddings` (source = `github`) |
| Search box | the student's typed query | not stored, used once per search |

Repos where the student wrote more commits get more weight in the GitHub average (weight = 1 + ln(1 + own commits)).

## Embedding model

- **all-MiniLM-L6-v2** (sentence-transformers), 384 dimensions
- Runs locally inside the Next.js server with **Transformers.js** (ONNX runtime): no API key, no paid service, no data leaves the machine
- Downloaded from Hugging Face on first use (~23 MB, quantized) and cached in `.cache/models`
- Vectors are mean-pooled and L2-normalised

Code: `src/lib/embed.ts`, `src/lib/vectors.ts`

## How vectors are stored

PostgreSQL with the **pgvector** extension, column type `vector(384)`, with **HNSW** indexes for approximate nearest-neighbour search:

```sql
CREATE INDEX idx_openings_embedding     ON openings           USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_student_embeddings_vec ON student_embeddings USING hnsw (embedding vector_cosine_ops);
```

Keeping vectors in PostgreSQL (instead of a separate vector service) means one SQL query can apply eligibility rules (CGPA, semester, deadline) **and** rank by similarity.

## Similarity metric

**Cosine similarity**, via pgvector's cosine distance operator `<=>`:

```sql
similarity = 1 - (student_vector <=> opening_vector)
```

Measured with the real model: a medical-segmentation repo vs a medical-imaging opening ≈ 0.77; a related retina-classification project ≈ 0.40; a chat app or e-commerce backend ≈ 0.

## How relevant results are retrieved

**1. Ranking candidates for an opening** — `fn_rank_candidates(opening_id)` in `db/sql/05_procedures.sql`:

1. Hard filters in SQL (`fn_is_eligible`): minimum CGPA, eligible semesters, no ongoing internship, active account
2. Hybrid score per eligible student (`fn_match_score`):

   | Component | Weight | Source |
   |---|---|---|
   | Semantic similarity to the opening | 0.6 (0.4 once the lab has a success profile) | pgvector cosine |
   | Similarity to the lab's best past interns | 0 (0.2 once a success profile exists) | pgvector cosine |
   | Weighted skill overlap (endorsed skills count double) | 0.2 | `student_skills`, `skill_endorsements` |
   | Proof-of-work score | 0.2 | MongoDB aggregation → `students.proof_score` |

3. Results ordered by total score; the faculty page also shows each student's **best evidence** — the single repo most similar to the opening.

**2. Recommendations for a student** — the same `fn_match_score`, evaluated for every open opening the student is eligible for, with the most important missing skill shown as a hint.

**3. Hybrid search** — the student's query is embedded and combined with full-text search:

```sql
WHERE search_tsv @@ plainto_tsquery('english', :q)        -- keyword match (GIN index)
   OR 1 - (embedding <=> :query_vector) > 0.25            -- meaning match (pgvector)
ORDER BY similarity + (CASE WHEN keyword_hit THEN 0.3 ELSE 0 END) DESC
```

Results found only by meaning are labelled "Matches by meaning" in the UI.

## When vectors are updated

| Event | What is recomputed |
|---|---|
| Faculty posts an opening | that opening's vector |
| Student uploads a resume | resume vector, then match alerts |
| Student syncs GitHub | per-repo vectors + GitHub vector, then match alerts |
| Admin clicks "Rebuild all vectors" | everything, from the stored source data |
