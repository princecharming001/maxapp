"""Last-mile scrub for anything the user reads from Max (chat replies, chat history, SMS).

The model sees retrieval evidence labelled with file paths and section names, and older
prompts asked it to cite them, so internal references sometimes reach the user:
"[source=rag_documents/bonemax/Why BoneMax matters | section=...]", "[source: rag_content/
hairmax/minoxidil.md > Minoxidil]", "here's what the docs say:", "i'm a large language model,
trained by google." This removes those shapes. It never touches the structured markers the
chat endpoint parses later ([CHOICES], [VISUAL_BLOCK], [METHOD_CONFIDENCE]), and it is
idempotent, so it is safe to run on already-clean text and on stored history.
"""

from __future__ import annotations

import re

# Citation tags in any bracket style: [source=...], [source: ...], (source: ...), [sources: ...],
# [ref: ...], 【...】. The "=" form is what the evidence headers look like, so the model copies it.
_CITE_WORD = r"(?:source|sources|src|ref|refs|reference|citation|cite|section|doc|file)s?\s*[:=]"
_CITATION_TAG = re.compile(
    r"\s*(?:\[" + _CITE_WORD + r"[^\]\n]*\]|\(" + _CITE_WORD + r"[^()\n]*(?:\([^()\n]*\)[^()\n]*)*\))",
    re.IGNORECASE,
)
_FULLWIDTH_CITE = re.compile(r"\s*【[^】\n]*】")
# Bare internal paths and file names, with or without brackets.
_INTERNAL_PATH = re.compile(
    r"\s*\(?\b(?:rag_documents|rag_content|data/maxes|s3_prompts_upload)/[^\s)\].,;]*(?:[ \w&'-]*\.(?:md|docx|pdf|txt))?\)?",
    re.IGNORECASE,
)
# The agent's knowledge tool labels results "[bonemax/Why BoneMax matters, section 3]" and
# "[bonemax reference]"; the model sometimes copies the label.
_TOOL_LABEL = re.compile(
    r"\s*\[(?:general|[a-z]+max)(?:/[^\]\n]{1,100}?(?:,\s*section\s*\d+)?|\s+reference)\]",
    re.IGNORECASE,
)
_FILE_NAME = re.compile(r"\s*\(?\b[\w-]+/[\w-]+\.(?:md|docx|pdf|txt)\b\)?", re.IGNORECASE)
# "| section=Why BoneMax matters" left behind when only part of a tag was emitted.
_SECTION_FRAGMENT = re.compile(r"\s*\|?\s*\bsection\s*=\s*[^\].\n]*\]?", re.IGNORECASE)
# Evidence numbers the model sometimes cites ("... twice a day [2].", "[1][3]"). Markdown links
# ("[text](url)") and checkboxes are not matched.
_EVIDENCE_NUMBER = re.compile(r"\s*(?:\[\d{1,2}\])+(?!\()")

# Talk about the retrieval layer. Phrase-level where the rest of the sentence is still useful,
# clause-level where the clause is only about the docs. "docs" here always means the app's own
# knowledge base (the model's word for it); "your doc" (doctor) is never matched.
_DOCS_REF = r"(?:your|the|my)\s+(?:current\s+)?(?:module\s+)?(?:docs|module\s+doc)\b"
_DOCS_LEAD_IN = re.compile(
    r"\b(?:here'?s\s+)?what\s+(?:the|your|my)\s+(?:module\s+)?(?:docs?|evidence|sources?|notes)\s+says?"
    r"(?:\s+plus\s+[^.!?:\n]*)?\s*[:,.]?[ \t]*",
    re.IGNORECASE,
)
_FROM_DOCS = re.compile(
    r"\b(from|using|with)\s+what'?s\s+in\s+(?:" + _DOCS_REF + r"|(?:your|the|my)\s+module\b)(?:\s+(?:plus|and))?\s*",
    re.IGNORECASE,
)
_ACCORDING_TO_DOCS = re.compile(
    r"\b(?:according\s+to|based\s+on|per)\s+(?:the|your|my)\s+(?:current\s+)?(?:module\s+)?(?:docs?|evidence|sources?|retrieved\s+\w+)\s*[:,]?\s*",
    re.IGNORECASE,
)
# A clause (from a sentence start up to the next , ; . ! ? or line end) that is about the docs.
_DOCS_CLAUSE = re.compile(
    r"(?:(?<=^)|(?<=[.!?\n])[ \t]*)[^.!?\n,;]*\b(?:"
    r"(?:in|on|from)\s+" + _DOCS_REF +
    r"|(?:your|the|my)\s+(?:current\s+)?(?:module\s+)?docs\s+(?:say|says|mention|cover|covers|show|only|don'?t|do\s+not)"
    r"|evidence\s+(?:is|was|looks)\s+(?:thin|limited|weak|sparse)"
    r"|(?:only\s+)?(?:one|1|a\s+single)\s+chunk"
    r"|(?:the|my)\s+retrieved\s+(?:evidence|docs?|chunks?)"
    r"|ask\s+if\s+you\s+want\s+me\s+to\s+pull\s+it"
    r"|working\s+with\s+what'?s\s+there"
    r"|thin\s+evidence"
    r")\b[^.!?\n,;]*[,;.!?]?",
    re.IGNORECASE | re.MULTILINE,
)
# Whatever still mentions the docs mid-sentence becomes "your protocol", the in-voice name the
# answer prompt asks for, with the verb agreement fixed.
_DOCS_NOUN = re.compile(r"\b(?:your|the|my)\s+(?:current\s+)?(?:module\s+)?docs\b", re.IGNORECASE)
_PROTOCOL_VERB = re.compile(
    r"\b(your protocol)\s+(say|focus|cover|mention|show|include|list|recommend|suggest|don'?t|do not)\b",
    re.IGNORECASE,
)
_VERB_3SG = {"say": "says", "focus": "focuses", "cover": "covers", "mention": "mentions", "show": "shows",
             "include": "includes", "list": "lists", "recommend": "recommends", "suggest": "suggests",
             "don't": "doesn't", "dont": "doesn't", "do not": "does not"}

# Links and URLs contain dots, which would end a "sentence" mid-link. They are swapped out while
# the clause rules run.
_LINK = re.compile(r"\[[^\]\n]*\]\([^)\s]*\)|https?://\S+")
# Vendor / model identity. Max is an AI coach; which model runs it is not the user's concern.
_MODEL_IDENTITY = re.compile(
    r"\bi'?\s*a?m\s+a\s+large\s+language\s+model,?\s+(?:trained|made|built|developed)\s+by\s+[\w .]+?(?:[.!]|$)",
    re.IGNORECASE | re.MULTILINE,
)


# Structured markers the chat endpoint parses after this runs. Their JSON can contain "[1]" or
# "source" keys, so the scrub only ever touches the prose between them.
_PROTECTED = re.compile(
    r"\[(VISUAL_BLOCK|METHOD_CONFIDENCE|CHOICES_MULTI|CHOICES)\].*?\[/\1\]",
    re.IGNORECASE | re.DOTALL,
)


def _outside_markers(text: str, fn) -> str:
    parts, last = [], 0
    for m in _PROTECTED.finditer(text):
        parts.append(fn(text[last:m.start()]))
        parts.append(m.group(0))
        last = m.end()
    parts.append(fn(text[last:]))
    return "".join(parts)


def scrub_internal_refs(text: str) -> str:
    """Remove citations, internal paths, retrieval talk and model-vendor identity from text."""
    if not text:
        return text
    if _PROTECTED.search(text):
        return _outside_markers(text, _scrub_prose).strip()
    return _scrub_prose(text).strip()


def _scrub_prose(text: str) -> str:
    if not text or not text.strip():
        return text
    out = text
    out = _MODEL_IDENTITY.sub("i'm max, your coach.", out)
    for pat in (_CITATION_TAG, _FULLWIDTH_CITE, _TOOL_LABEL, _INTERNAL_PATH, _FILE_NAME, _SECTION_FRAGMENT, _EVIDENCE_NUMBER):
        out = pat.sub("", out)
    links: list[str] = []

    def _park(m: re.Match) -> str:
        links.append(m.group(0))
        return f"\x00{len(links) - 1}\x00"

    out = _LINK.sub(_park, out)
    out = re.sub(r"(?<=\d)\.(?=\d)", "\x01", out)  # decimals ("0.5 mg") are not sentence ends
    out = _FROM_DOCS.sub(lambda m: m.group(1) + " ", out)
    out = _DOCS_LEAD_IN.sub("", out)
    out = _ACCORDING_TO_DOCS.sub("", out)
    # Em dashes act as clause breaks for the clause rule ("docs—the evidence covers ...").
    if _DOCS_CLAUSE.search(out):
        out = re.sub(r"\s*—\s*", ", ", out)
        out = _DOCS_CLAUSE.sub("", out)
    out = re.sub(r"\b(?:the|your)\s+protocol\s+(?:in|from)\s+" + _DOCS_REF, "your protocol", out, flags=re.IGNORECASE)
    out = _DOCS_NOUN.sub("your protocol", out)
    out = _PROTOCOL_VERB.sub(lambda m: f"{m.group(1)} {_VERB_3SG.get(m.group(2).lower(), m.group(2))}", out)
    out = re.sub(r"\x00(\d+)\x00", lambda m: links[int(m.group(1))], out).replace("\x01", ".")
    # Tidy what the cuts leave: space before punctuation, doubled spaces, empty lines, a lone
    # leading comma, and a list item that is now empty.
    out = re.sub(r"[ \t]+([.,;:!?])", r"\1", out)
    out = re.sub(r"([,;:])(?:\s*\1)+", r"\1", out)
    out = re.sub(r"(?<!\.)\.[ \t]+\.(?!\.)", ".", out)
    out = re.sub(r"(?<=\S)[ \t]{2,}", " ", out)  # keep list indentation
    out = re.sub(r"^[ \t]*(?:[-*]|\d+\.)[ \t]*$\n?", "", out, flags=re.MULTILINE)
    out = re.sub(r"\n{3,}", "\n\n", out)
    out = re.sub(r"^[ \t]*[,;:]+[ \t]*", "", out)
    return out


def strip_em_dashes(text: str) -> str:
    """Max never uses em dashes (every Max prompt bans them as the clearest bot tell).
    "a — b" becomes "a, b"; after a sentence end or colon it becomes a period."""
    if not text or "—" not in text:
        return text
    if _PROTECTED.search(text):
        return _outside_markers(text, _strip_em_dashes_prose)
    return _strip_em_dashes_prose(text)


def _strip_em_dashes_prose(text: str) -> str:
    if "—" not in text:
        return text
    out = re.sub(r"([.!?:])\s*—\s*", r"\1 ", text)
    out = re.sub(r"\s*—\s*", ", ", out)
    out = re.sub(r",\s*,", ",", out)
    out = re.sub(r",\s*([.!?])", r"\1", out)
    return re.sub(r"[ \t]{2,}", " ", out)


def user_visible(text: str) -> str:
    """Everything above, in order. Safe to run more than once."""
    return strip_em_dashes(scrub_internal_refs(text))
