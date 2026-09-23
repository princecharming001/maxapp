"""Re-embed rag_documents with the configured (or --provider) embedding model.

Why: the corpus was embedded with OpenAI text-embedding-3-small. When that
account has no credits (2026-09-22 incident) the only way to keep vector
search alive is to move BOTH the corpus and the query path to another
vendor. Gemini's gemini-embedding-001 at outputDimensionality=1536 fits the
existing vector(1536) column and its HNSW cosine index, so no migration is
needed. But query and corpus vectors MUST come from the same model, so this
script and RAG_EMBEDDING_PROVIDER on the server are flipped together:
re-embed first (this script), then set the env at the next deploy.

Read-only by default (dry run): prints per-module row counts and the
dimension of the first vector the provider returns; writes nothing.
--apply (with REEMBED_APPLY_CONFIRM=yes in the environment) rewrites
embedding + updated_at for every selected row. Every vector is fetched from
the vendor BEFORE the first UPDATE, so a vendor failure mid-run leaves the
corpus untouched (never half old-model / half new-model); the writes then
commit per batch.

Usage (from backend/):
    /Users/home/maxapp/.venv/bin/python scripts/reembed_rag.py --provider gemini
    /Users/home/maxapp/.venv/bin/python scripts/reembed_rag.py --provider gemini --maxx skinmax
    REEMBED_APPLY_CONFIRM=yes /Users/home/maxapp/.venv/bin/python scripts/reembed_rag.py --provider gemini --apply
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import os
import pathlib
import sys
from collections import Counter

_BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(_BACKEND_DIR / ".env")
load_dotenv(_BACKEND_DIR.parent / ".env", override=False)

PROVIDERS = ("openai", "gemini")
CONFIRM_ENV = "REEMBED_APPLY_CONFIRM"


def _reminder(provider: str, model: str, *, applied: bool) -> str:
    lead = "NEXT STEP" if applied else "AFTER --apply"
    return (
        f"\n{lead}: set RAG_EMBEDDING_PROVIDER={provider} on the server BEFORE the next deploy\n"
        f"  (embedding model in effect: {model}). Query vectors and the corpus must come from the\n"
        f"  same model. Order matters: re-embed (this script) first, then flip the env at deploy."
    )


async def run(*, provider: str | None, apply: bool, batch_size: int, maxx: str | None) -> int:
    from sqlalchemy import text

    from config import settings

    # db.sqlalchemy prints a "[DB] mode=..." banner on import; keep it off stdout.
    with contextlib.redirect_stdout(sys.stderr):
        from db.sqlalchemy import AsyncSessionLocal, engine
    from services import rag_service
    from services.rag_service import VALID_MAXX_IDS, _vec_to_pg_str, embed_batch

    if provider:
        settings.rag_embedding_provider = provider  # this run only; the server reads its own env
    provider = (settings.rag_embedding_provider or "openai").strip().lower()
    if provider not in PROVIDERS:
        raise SystemExit(f"unsupported provider {provider!r}; use one of {', '.join(PROVIDERS)}")
    model = settings.gemini_embedding_model if provider == "gemini" else settings.rag_embedding_model
    dim = int(settings.rag_embedding_dimensions or 1536)
    if maxx and maxx not in VALID_MAXX_IDS:
        raise SystemExit(f"unknown --maxx {maxx!r}; valid: {', '.join(sorted(VALID_MAXX_IDS))}")

    mode = "APPLY (writes)" if apply else "DRY RUN (no writes)"
    print(f"reembed_rag: provider={provider} model={model} dims={dim} batch={batch_size} mode={mode}")

    try:
        where, params = "", {}
        if maxx:
            where, params = "WHERE maxx_id = :maxx", {"maxx": maxx}
        async with AsyncSessionLocal() as session:
            rows = (
                await session.execute(
                    text(
                        f"""
                        SELECT id::text AS id, maxx_id, doc_title, chunk_index, content,
                               vector_dims(embedding) AS cur_dims
                        FROM rag_documents
                        {where}
                        ORDER BY maxx_id, doc_title, chunk_index
                        """
                    ),
                    params,
                )
            ).fetchall()

        total = len(rows)
        per_maxx = Counter(r.maxx_id for r in rows)
        todo = [r for r in rows if str(r.content or "").strip()]
        blank = total - len(todo)
        cur_dims = Counter(r.cur_dims for r in rows)
        print(f"rows selected: {total}" + (f" (maxx={maxx})" if maxx else ""))
        for m, n in sorted(per_maxx.items()):
            print(f"  {m:<10} {n:>4}")
        print("current embedding dims: " + ", ".join(
            f"{'NULL' if d is None else d}x{n}" for d, n in sorted(cur_dims.items(), key=lambda kv: str(kv[0]))
        ))
        if blank:
            print(f"  skipping {blank} row(s) with empty content (embedding left as is)")
        if not todo:
            print("nothing to embed.")
            return 0

        if not apply:
            first = todo[0]
            print(
                f"probe: embedding first row {first.maxx_id}/{first.doc_title}#{first.chunk_index} "
                f"with {provider}/{model} ..."
            )
            try:
                vecs = await embed_batch([first.content], batch_size=1)
                got = len(vecs[0]) if vecs else 0
                verdict = "OK" if got == dim else f"MISMATCH (column is vector({dim}))"
                print(f"probe: first vector has {got} dims -> {verdict}")
                if got != dim:
                    return 1
            except Exception as e:  # noqa: BLE001 — report, never trace-dump a key
                print(f"probe FAILED: {type(e).__name__}: {str(e)[:300]}")
                print("  fix this before --apply (a missing key or a dead vendor would abort the run).")
                return 1
            print(f"\nDRY RUN: would re-embed {len(todo)} row(s) with {provider}/{model}; nothing written.")
            print(f"re-run with --apply and {CONFIRM_ENV}=yes to write.")
            print(_reminder(provider, model, applied=False))
            return 0

        # Phase 1: fetch every vector before touching the DB. A vendor failure
        # here aborts with the corpus untouched, never half old / half new.
        print(f"embedding {len(todo)} row(s) with {provider}/{model} ...")
        vectors: list[list[float]] = []
        for i in range(0, len(todo), batch_size):
            batch = todo[i : i + batch_size]
            vecs = await embed_batch([r.content for r in batch], batch_size=batch_size)
            if len(vecs) != len(batch):
                raise SystemExit(f"vendor returned {len(vecs)} vectors for {len(batch)} inputs; nothing written")
            bad = [len(v) for v in vecs if len(v) != dim]
            if bad:
                raise SystemExit(f"vendor returned {bad[0]}-dim vectors but the column is vector({dim}); nothing written")
            vectors.extend(vecs)
            print(f"  embedded {len(vectors)}/{len(todo)}")

        # Phase 2: write, committing per batch.
        written = 0
        try:
            async with AsyncSessionLocal() as session:
                for i in range(0, len(todo), batch_size):
                    batch = todo[i : i + batch_size]
                    for row, vec in zip(batch, vectors[i : i + batch_size]):
                        await session.execute(
                            text(
                                """
                                UPDATE rag_documents
                                SET embedding = CAST(:embedding AS vector),
                                    updated_at = now()
                                WHERE id::text = :id
                                """
                            ),
                            {"id": row.id, "embedding": _vec_to_pg_str(vec)},
                        )
                    await session.commit()
                    written += len(batch)
                    last = batch[-1]
                    print(f"  wrote {written}/{len(todo)} (through {last.maxx_id}/{last.doc_title}#{last.chunk_index})")
        except Exception:
            print(
                f"\nPARTIAL WRITE: {written}/{len(todo)} row(s) now carry {provider}/{model} vectors and the rest "
                f"still carry the old model. The corpus is MIXED: re-run with --apply to finish BEFORE "
                f"flipping RAG_EMBEDDING_PROVIDER."
            )
            raise

        print(f"\nAPPLIED: {written} row(s) re-embedded with {provider}/{model} ({dim} dims), updated_at bumped.")
        print(_reminder(provider, model, applied=True))
        return 0
    finally:
        await engine.dispose()


def main() -> None:
    ap = argparse.ArgumentParser(description="Re-embed rag_documents with a given embedding provider")
    ap.add_argument("--provider", choices=PROVIDERS, default=None,
                    help="embedding vendor for this run (default: RAG_EMBEDDING_PROVIDER from settings)")
    ap.add_argument("--apply", action="store_true",
                    help=f"WRITE the new vectors (needs {CONFIRM_ENV}=yes; owner approval). Default is a dry run.")
    ap.add_argument("--batch-size", type=int, default=64, help="rows per vendor call / per commit (default 64)")
    ap.add_argument("--maxx", default=None, help="optional maxx_id filter (e.g. skinmax)")
    args = ap.parse_args()
    if args.apply and os.environ.get(CONFIRM_ENV) != "yes":
        raise SystemExit(f"refusing to write: set {CONFIRM_ENV}=yes to apply (owner approval required)")
    rc = asyncio.run(run(
        provider=args.provider,
        apply=args.apply,
        batch_size=max(1, args.batch_size),
        maxx=(args.maxx or "").strip().lower() or None,
    ))
    sys.exit(rc)


if __name__ == "__main__":
    main()
